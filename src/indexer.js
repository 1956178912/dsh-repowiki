/**
 * 索引编排器：递归遍历项目文件、提取符号与依赖、组装并写回 index.json。
 *
 * 全部确定性、零 LLM（方案 §6.3：index-service 在宿主进程完成，确定性，
 * 不调用模型）。fs 作为参数注入，便于单元测试。
 */

import * as path from 'node:path'
import {
  EXCLUDE_DIRS, EXTENSION_LANGS, MANIFEST_FILES, MAX_FILES_DEFAULT, MAX_FILE_BYTES,
  INDEX_SCHEMA_VERSION, INDEX_PARSER_VERSION, EDGE_KIND_IMPORT, JS_PATH_CANDIDATES, PY_PATH_CANDIDATES,
} from './schema.js'
import { extractSymbols } from './symbols.js'
import { extractImports } from './deps.js'
import { detectStack } from './stack.js'
import { moduleOf, buildModules } from './modules.js'
import { loadIgnoreRules, isIgnored } from './ignore.js'
import { readGitInfo } from './git.js'
import { digestText, countSourceLines } from './util.js'

export { digestText }

/**
 * 索引构建选项。
 * @typedef {Object} BuildOptions
 * @property {string[]} [extraExclude] - 调用方追加排除的目录名。
 * @property {number} [maxFiles] - 文件数上限（默认 MAX_FILES_DEFAULT）。
 * @property {object} [previous] - 上一版索引文档，用于增量复用（见 buildIndex）。
 * @property {AbortSignal} [signal] - 协作式取消信号；中止时返回部分统计且不写盘。
 * @property {number} [readConcurrency] - 源码读取/解析并发（默认 8，1–16）。
 */

/** 递归遍历时栈深度上限，防御过深目录树。 */
const MAX_DEPTH = 24

/**
 * 单次索引最多读取的 JS/TS 解析配置数（tsconfig/jsconfig 与嵌套
 * package.json）。配置只用于别名与工作区包解析，属于增强信息；
 * 极端仓库（大量 fixture 包）不应让配置读取吃掉主索引预算。
 */
const MAX_JS_CONFIGS = 200

/**
 * 源码文件读取/解析的默认并发上限。宿主 `ctx.fs` 可能是远程工作区，
 * 串行读取会按文件累积 RTT；有界并发在不压垮 I/O 的前提下隐藏延迟，
 * 结果的装配顺序仍与串行一致（按文件在遍历中的位置）。
 */
const INDEX_READ_CONCURRENCY = 8

/** 并发上限的硬顶（防御调用方传入过大值）。 */
const INDEX_READ_CONCURRENCY_MAX = 16

/**
 * 目录列举预取的并发上限。DFS 顺序不变，只把“即将访问的兄弟目录”
 * 的 listDir 提前发出：远程 `ctx.fs` 每个目录一次 RTT，串行等待会按
 * 目录数线性放大；有界预取把等待重叠起来，且不改变预算计数顺序。
 */
const WALK_PREFETCH_LIMIT = 8

/**
 * 清单文件（package.json / tsconfig / go.mod / CMake / composer / mix 等）
 * 的读取并发上限。清单数量通常远小于源码，但远程 `ctx.fs` 下仍是每文件
 * 一次 RTT；先按遍历顺序选定清单，再有界并发读取并顺序装配。
 */
const MANIFEST_READ_CONCURRENCY = 8

/**
 * 单次索引最多读取的嵌套 `CMakeLists.txt` 数（monorepo 子项目）。
 * 根清单不受此上限影响；配置只用于技术栈聚合。
 */
const MAX_CMAKE_MANIFESTS = 50

/**
 * 单次索引最多读取的嵌套 `go.mod` 数（Go 多模块仓库）。
 * 根清单不受此上限影响；嵌套清单用于子模块 import 前缀解析。
 */
const MAX_GO_MODS = 20

/** Go internal 可见性违规写入 warnings 的条数上限（其余折叠为汇总）。 */
const MAX_INTERNAL_WARNINGS = 50

/**
 * 单次索引最多读取的嵌套 `composer.json` 数（PHP 多包仓库）。
 * 根清单不受此上限影响；嵌套清单提供各包的 PSR-4 自动加载映射。
 */
const MAX_COMPOSER_MANIFESTS = 50

/**
 * 单次索引最多读取的嵌套 `mix.exs` 数（Elixir umbrella 的各 app）。
 * 根清单不受此上限影响；嵌套清单只用于依赖计数与技术栈聚合。
 */
const MAX_MIX_MANIFESTS = 20

/**
 * 单次索引最多读取的嵌套 `gleam.toml` 数（Gleam monorepo 子包）。
 * 根清单不受此上限影响；嵌套清单提供各包的依赖与技术栈。
 */
const MAX_GLEAM_MANIFESTS = 20

/**
 * 单次索引最多读取的嵌套 `build.zig.zon` 数（Zig monorepo 子包）。
 * 根清单不受此上限影响；嵌套清单只用于依赖计数聚合。
 */
const MAX_ZIG_MANIFESTS = 20

/**
 * 单次索引最多读取的 `.nimble` 清单数（Nim 包清单，文件名可变）。
 * 通常只有一个；上限防御异常仓库。
 */
const MAX_NIMBLE_MANIFESTS = 10

/**
 * 判断文件名是否为 JS/TS 解析配置或包清单。
 * @param {string} name - 文件基名。
 * @returns {boolean} 是则为 true。
 */
function isJsConfigName(name) {
  return name === 'package.json' || name === 'jsconfig.json'
    || name === 'tsconfig.json' || /^tsconfig\.[\w.-]+\.json$/.test(name)
}

/**
 * 判断文件是否参与依赖解析/技术栈识别（含嵌套 CMake、Go module 与
 * composer 清单）。
 * @param {string} rel - 文件相对路径。
 * @param {string} name - 文件基名。
 * @returns {boolean} 是则为 true。
 */
function isConfigManifest(rel, name) {
  return isJsConfigName(name) || name === 'CMakeLists.txt' || name === 'go.mod'
    || name === 'pubspec.yaml' || name === 'composer.json' || name === 'mix.exs'
    || name === 'gleam.toml' || name === 'build.zig.zon'
    || name.endsWith('.nimble')
}

/**
 * 计算相对路径的目录深度（根目录为 0），用于"就近配置优先"排序。
 * @param {string} dir - 相对根目录的 POSIX 路径（根为 ''）。
 * @returns {number} 深度。
 */
function dirDepth(dir) {
  return dir === '' ? 0 : dir.split('/').length
}

/**
 * 把相对某个目录的路径归一为项目根相对路径。
 * @param {string} baseDir - 基准目录（相对根，根为 ''）。
 * @param {string} rel - 相对基准目录的路径。
 * @returns {string} 归一后的根相对路径（根为 ''）。
 */
function normalizeRel(baseDir, rel) {
  const joined = path.posix.normalize(path.posix.join(baseDir || '.', rel))
  return joined === '.' ? '' : joined.replace(/\/$/, '')
}

/**
 * 创建目录列举预取器（有界、只读、结果按消费顺序返回）。
 * - `start(dirPath)`：若在途请求未达上限则提前 resolve+listDir；
 * - `list(dirPath)`：命中预取则等待该 Promise，否则现查；
 * - 预取 Promise 挂一个空 catch，避免预算截断/取消后“预取了但没消费”
 *   产生未处理拒绝；错误仍会通过 `list` 的 await 交给调用方。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {number} limit - 在途列举请求上限。
 * @returns {{start:(dirPath:string)=>void, list:(dirPath:string)=>Promise<Array<object>>}}
 *   预取器。
 */
function createDirPrefetcher(fs, limit) {
  /** @type {Map<string, Promise<Array<object>>>} */
  const pending = new Map()
  let inflight = 0
  const start = (dirPath) => {
    if (pending.has(dirPath) || inflight >= limit) return
    inflight++
    const promise = fs.resolve(dirPath).then(target => fs.listDir(target))
    promise.then(() => { inflight-- }, () => { inflight-- })
    promise.catch(() => undefined)
    pending.set(dirPath, promise)
  }
  const list = async (dirPath) => {
    const cached = pending.get(dirPath)
    if (!cached) {
      const target = await fs.resolve(dirPath)
      return fs.listDir(target)
    }
    pending.delete(dirPath)
    return cached
  }
  return { start, list }
}

/**
 * 按文件名字节序比较（不依赖 ICU/区域设置，跨后端与机器可复现）。
 * @param {{name:string}} a - 目录条目。
 * @param {{name:string}} b - 目录条目。
 * @returns {number} 比较结果。
 */
function compareEntryName(a, b) {
  if (a.name === b.name) return 0
  return a.name < b.name ? -1 : 1
}

/**
 * 按路径字节序比较（索引输出与预算截断的可复现顺序）。
 * @param {{path:string}} a - 文件条目。
 * @param {{path:string}} b - 文件条目。
 * @returns {number} 比较结果。
 */
function comparePath(a, b) {
  if (a.path === b.path) return 0
  return a.path < b.path ? -1 : 1
}

/**
 * 递归遍历项目目录，收集源码文件与清单文件。
 * 目录条目按名称排序后遍历：`listDir` 的返回顺序由后端/文件系统决定，
 * 未排序会让超过 maxFiles 的仓库截断到不同文件、index.json 顺序漂移。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} rootAbs - 项目根绝对路径（相对路径换算的唯一锚点）。
 * @param {string} dirPath - 当前遍历目录的绝对路径。
 * @param {Set<string>} exclude - 排除目录名集合。
 * @param {number} maxFiles - 文件上限。
 * @param {number} depth - 当前深度。
 * @param {Array<{abs:string, rel:string}>} sourceFiles - 累积的源码文件。
 * @param {Array<{abs:string, rel:string}>} manifests - 累积的清单文件。
 * @param {Array<object>} ignoreRules - 根目录的 .gitignore/.repowikiignore 规则。
 * @param {{count:number, stopped?:boolean, aborted?:boolean, ignored?:number,
 *   ignoreWarnings?:string[]}} budget - 文件计数预算（引用传递，
 *   超限即停；stopped 置真表示遍历确因预算提前终止；aborted 表示调用方取消）。
 * @param {{start:(dirPath:string)=>void, list:(dirPath:string)=>Promise<Array<object>>}} prefetcher
 *   - 目录列举预取器（有界并发；不改变访问顺序与计数）。
 * @param {AbortSignal} [signal] - 协作式取消信号。
 * @returns {Promise<void>}
 */
async function walk(fs, rootAbs, dirPath, exclude, maxFiles, depth, sourceFiles, manifests, ignoreRules, budget, prefetcher, signal) {
  if (budget.aborted) return
  if (depth > MAX_DEPTH) return
  if (budget.count >= maxFiles) { budget.stopped = true; return }
  let entries
  try {
    entries = await prefetcher.list(dirPath)
  } catch {
    return // 不可读目录安静跳过（权限/IO 问题不阻断整体索引）
  }
  // 后端返回顺序不保证稳定：排序后再遍历，预算截断与产物顺序才可复现
  entries = [...entries].sort(compareEntryName)
  // 预取窗口：进入某个子目录前，提前发起它之后 limit 个兄弟目录的
  // listDir（DFS 顺序不变；只是把后续 RTT 重叠起来）。
  const childDirs = entries
    .filter(entry => entry.type === 'directory' && !exclude.has(entry.name))
    .map(entry => entry.target.displayPath)
  const childIndex = new Map(childDirs.map((dir, index) => [dir, index]))
  let nextToStart = 0
  // 嵌套忽略：只在该目录确实包含规则文件时读取（不额外 stat），
  // 更深目录的规则后置，天然获得更高优先级。
  let rules = ignoreRules
  if (depth > 0) {
    const names = new Set(entries.filter(entry => entry.type === 'file').map(entry => entry.name))
    if (names.has('.gitignore') || names.has('.repowikiignore')) {
      const dirRel = toRelative(dirPath, rootAbs)
      if (dirRel) {
        const local = await loadIgnoreRules(fs, dirPath, dirRel)
        if (local.rules.length > 0) rules = [...ignoreRules, ...local.rules]
        if (local.warnings.length > 0) budget.ignoreWarnings?.push(...local.warnings.map(w => `${dirRel}/${w}`))
      }
    }
  }
  for (const entry of entries) {
    if (signal?.aborted) { budget.aborted = true; return }
    if (budget.count >= maxFiles) { budget.stopped = true; return }
    const rel = toRelative(entry.target.displayPath, rootAbs)
    if (rel === null) continue
    const isDir = entry.type === 'directory'
    // .gitignore 子集：忽略项不消耗文件预算
    if (isIgnored(rel, isDir, rules)) {
      budget.ignored = (budget.ignored ?? 0) + 1
      continue
    }
    if (isDir) {
      if (exclude.has(entry.name)) continue
      const position = childIndex.get(entry.target.displayPath)
      if (position !== undefined) {
        while (nextToStart < childDirs.length && nextToStart <= position + WALK_PREFETCH_LIMIT) {
          prefetcher.start(childDirs[nextToStart])
          nextToStart++
        }
      }
      await walk(fs, rootAbs, path.posix.join(dirPath, entry.name), exclude, maxFiles, depth + 1, sourceFiles, manifests, rules, budget, prefetcher, signal)
    } else if (entry.type === 'file') {
      budget.count++
      if (MANIFEST_FILES[rel] || isConfigManifest(rel, entry.name)) {
        manifests.push({ abs: entry.target.displayPath, rel })
      } else {
        const ext = rel.slice(rel.lastIndexOf('.') + 1)
        if (EXTENSION_LANGS[ext]) {
          sourceFiles.push({ abs: entry.target.displayPath, rel })
        }
      }
    }
  }
}

/**
 * 把绝对路径换算成相对项目根的 POSIX 路径。
 * 实现上不假设 walk 传入的 dirPath 是项目根，因此用目标 displayPath 与
 * 其所属性质直接截取；失败返回 null（调用方跳过该文件）。
 * @param {string} displayPath - fs 解析出的展示路径。
 * @param {string} rootAbs - 项目根绝对路径。
 * @returns {string|null} 相对路径（正斜杠）。
 */
function toRelative(displayPath, rootAbs) {
  const root = path.resolve(rootAbs)
  const abs = path.resolve(displayPath)
  const rel = path.relative(root, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join('/')
}

/**
 * 在已索引文件集合中按 JS/TS 后缀约定查找一个基准路径（无扩展名亦可）。
 * @param {string} base - 根相对基准路径（已归一，无前导 ./）。
 * @param {Set<string>} indexed - 已索引文件相对路径集合。
 * @returns {string|null} 命中文件；未命中返回 null。
 */
function resolveJsBase(base, indexed) {
  for (const suffix of JS_PATH_CANDIDATES) {
    for (const candidate of [base + suffix, path.posix.join(base, 'index' + (suffix || '.js'))]) {
      if (indexed.has(candidate)) return candidate
    }
  }
  return null
}

/**
 * 尝试把 JS/TS 相对 import specifier 解析为项目内的实际文件。
 * @param {string} fromRel - 引用方文件的相对路径。
 * @param {string} specifier - 相对 specifier（./ 或 ../）。
 * @param {Set<string>} indexed - 已索引文件相对路径集合。
 * @returns {string|null} 命中的相对路径；未命中返回 null。
 */
function resolveJsSpecifier(fromRel, specifier, indexed) {
  const dir = path.posix.dirname(fromRel)
  return resolveJsBase(path.posix.normalize(path.posix.join(dir, specifier)), indexed)
}

/**
 * 去除源码中的行注释与块注释（字符串感知）。
 * JSONC 与 Swift 共用 `//`、`/* *\/` 注释语法；注释替换为换行/空白，
 * 保留行结构，便于后续按位置扫描。
 * @param {string} text - 源码文本。
 * @returns {string} 去注释后的文本。
 */
function removeComments(text) {
  let out = ''
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      out += ch
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; out += ch; continue }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
      continue
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i += 1 // 跳过闭合的 '/'（循环末尾再 +1）
      continue
    }
    out += ch
  }
  return out
}

/**
 * 去除 JSONC 的注释与尾逗号（tsconfig/jsconfig 允许这两种写法）。
 * 逐字符扫描并跟踪字符串状态，避免把字符串内的 `//` 或逗号当语法；
 * 注释替换为等长换行/空白，保留行号语义（便于报错定位）。
 * @param {string} text - JSONC 文本。
 * @returns {string} 可交给 JSON.parse 的文本。
 */
export function stripJsonc(text) {
  const out = removeComments(text)
  // 第二遍：去掉字符串外的尾逗号（`,}` / `,]`）
  let clean = ''
  let inString = false
  let escape = false
  for (let i = 0; i < out.length; i++) {
    const ch = out[i]
    if (inString) {
      clean += ch
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; clean += ch; continue }
    if (ch === ',') {
      let j = i + 1
      while (j < out.length && /\s/.test(out[j])) j++
      if (out[j] === '}' || out[j] === ']') continue
    }
    clean += ch
  }
  return clean
}

/**
 * 容错解析 JSON/JSONC（解析失败返回 null，调用方静默降级）。
 * @param {string} text - 文本。
 * @returns {*|null} 解析结果。
 */
function parseJsonc(text) {
  try {
    return JSON.parse(stripJsonc(text))
  } catch {
    return null
  }
}

/**
 * tsconfig/jsconfig 的路径别名配置。
 * @typedef {Object} JsAliasConfig
 * @property {string} dir - 配置所在目录（相对根，根为 ''）。
 * @property {string} baseDir - paths 目标的解析基准目录（baseUrl 或配置目录）。
 * @property {{key:string, prefix:string, wildcard:boolean, targets:string[]}[]} patterns
 *   `paths` 条目（按固定前缀长度降序，越具体越先匹配）。
 */

/**
 * 从 tsconfig/jsconfig 文本构建别名配置。
 * @param {string} rel - 配置文件相对路径。
 * @param {string} text - 文件内容（可含注释/尾逗号）。
 * @returns {JsAliasConfig|null} 无有效 compilerOptions 时返回 null。
 */
function buildAliasConfig(rel, text) {
  const json = parseJsonc(text)
  if (!json || typeof json !== 'object') return null
  const opts = json.compilerOptions
  if (!opts || typeof opts !== 'object') return null
  const dir = path.posix.dirname(rel)
  const configDir = dir === '.' ? '' : dir
  // TS 4.1+：paths 相对 baseUrl；未设 baseUrl 时相对配置文件所在目录
  const baseDir = typeof opts.baseUrl === 'string' && opts.baseUrl.trim()
    ? normalizeRel(configDir, opts.baseUrl)
    : configDir
  const patterns = []
  if (opts.paths && typeof opts.paths === 'object') {
    for (const [key, targets] of Object.entries(opts.paths)) {
      if (!Array.isArray(targets)) continue
      const list = targets.filter(t => typeof t === 'string' && t.length > 0)
      if (list.length === 0) continue
      const star = key.indexOf('*')
      patterns.push({
        key,
        prefix: star >= 0 ? key.slice(0, star) : key,
        wildcard: star >= 0,
        targets: list,
      })
    }
    // 固定前缀越长越具体：`@/` 先于 `*`
    patterns.sort((a, b) => b.prefix.length - a.prefix.length || a.key.localeCompare(b.key))
  }
  return { dir: configDir, baseDir, patterns }
}

/**
 * 按 tsconfig/jsconfig 的 paths 与 baseUrl 解析非相对 specifier。
 * 只在引用方文件所在目录及其祖先的配置上生效，避免 monorepo 里不同包
 * 的别名互相污染；同一目录的多个配置按路径字典序依次尝试。
 * @param {string} fromRel - 引用方文件相对路径。
 * @param {string} specifier - 非相对 specifier。
 * @param {JsAliasConfig[]} configs - 别名配置（就近优先）。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件；未命中返回 null。
 */
function resolveJsAlias(fromRel, specifier, configs, indexed) {
  for (const cfg of configs) {
    if (cfg.dir !== '' && !fromRel.startsWith(cfg.dir + '/')) continue
    for (const pattern of cfg.patterns) {
      let captured
      if (pattern.wildcard) {
        if (!specifier.startsWith(pattern.prefix)) continue
        captured = specifier.slice(pattern.prefix.length)
      } else {
        if (specifier !== pattern.key) continue
        captured = ''
      }
      for (const target of pattern.targets) {
        const replaced = pattern.wildcard ? target.replace('*', captured) : target
        const hit = resolveJsBase(normalizeRel(cfg.baseDir, replaced), indexed)
        if (hit) return hit
      }
    }
    // baseUrl：非相对 import 直接相对 baseUrl（TypeScript 的权威回退）
    const direct = resolveJsBase(normalizeRel(cfg.baseDir, specifier), indexed)
    if (direct) return direct
  }
  return null
}

/**
 * 工作区包索引项。
 * @typedef {Object} WorkspacePackage
 * @property {string} dir - 包目录（相对根，根为 ''）。
 * @property {string[]} entries - package.json 声明的入口（main/module/types）。
 * @property {Map<string,string[]>} exports - exports 子路径（'.'、'./x'）→ 目标列表。
 */

/**
 * 递归收集 exports 值中的字符串目标（兼容条件导出与数组回退）。
 * @param {*} value - exports 字段的一段。
 * @param {string[]} out - 收集结果。
 * @returns {void}
 */
function collectExportTargets(value, out) {
  if (typeof value === 'string') { out.push(value); return }
  if (Array.isArray(value)) {
    for (const item of value) collectExportTargets(item, out)
    return
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectExportTargets(item, out)
  }
}

/**
 * 把 package.json 中的入口/导出字段归一为包内相对路径。
 * @param {string} field - 原始字段值。
 * @returns {string|null} 可解析的包内相对路径；绝对/上跳路径返回 null。
 */
function normalizePackageEntry(field) {
  const cleaned = field.trim().replace(/^\.\//, '')
  if (!cleaned || cleaned.startsWith('/') || cleaned.split('/').includes('..')) return null
  return cleaned
}

/**
 * 从已读取的 package.json 建立工作区包索引（包名 → 目录与入口）。
 * 同名包只保留目录最浅的一个（根包优先），保证跨平台确定性。
 * @param {Record<string,string>} manifestTexts - 相对路径 → 文本。
 * @returns {Map<string, WorkspacePackage>} 包名索引。
 */
function buildWorkspacePackages(manifestTexts) {
  const packages = new Map()
  for (const [rel, text] of Object.entries(manifestTexts)) {
    if (path.posix.basename(rel) !== 'package.json') continue
    const json = parseJsonc(text)
    if (!json || typeof json !== 'object' || typeof json.name !== 'string') continue
    const name = json.name.trim()
    if (!name) continue
    const dir = path.posix.dirname(rel)
    const entries = []
    for (const field of [json.main, json.module, json.types, json.typings]) {
      if (typeof field !== 'string') continue
      const cleaned = normalizePackageEntry(field)
      if (cleaned) entries.push(cleaned)
    }
    // exports：'.'/子路径键直接映射；无子路径键时是条件导出（仅作包根入口）
    const exportMap = new Map()
    if (typeof json.exports === 'string') {
      const cleaned = normalizePackageEntry(json.exports)
      if (cleaned) exportMap.set('.', [cleaned])
    } else if (json.exports && typeof json.exports === 'object') {
      const keys = Object.keys(json.exports)
      if (keys.some(k => k.startsWith('.'))) {
        for (const [key, value] of Object.entries(json.exports)) {
          if (!key.startsWith('.')) continue
          const targets = []
          collectExportTargets(value, targets)
          const cleaned = targets.map(normalizePackageEntry).filter(Boolean)
          if (cleaned.length > 0) exportMap.set(key, cleaned)
        }
      } else {
        const targets = []
        collectExportTargets(json.exports, targets)
        const cleaned = targets.map(normalizePackageEntry).filter(Boolean)
        if (cleaned.length > 0) exportMap.set('.', cleaned)
      }
    }
    const existing = packages.get(name)
    const existingDir = existing?.dir ?? ''
    // 同名包优先目录更浅者；同深度按字典序取小，保证与遍历顺序无关
    if (!existing || dirDepth(dir) < dirDepth(existingDir)
      || (dirDepth(dir) === dirDepth(existingDir) && dir < existingDir)) {
      packages.set(name, { dir: dir === '.' ? '' : dir, entries, exports: exportMap })
    }
  }
  return packages
}

/**
 * 从已读取的 pubspec.yaml 建立 Dart 包索引（包名 → 包根目录）。
 * 同名包只保留目录最浅的一个（根包优先），保证跨平台确定性。
 * @param {Record<string,string>} manifestTexts - 相对路径 → 文本。
 * @returns {Map<string, string>} 包名 → 包根相对目录（根包为空串）。
 */
function buildDartPackages(manifestTexts) {
  const packages = new Map()
  for (const [rel, text] of Object.entries(manifestTexts)) {
    if (path.posix.basename(rel) !== 'pubspec.yaml') continue
    const name = /^name:\s*([^\s#]+)/m.exec(text)?.[1]
    if (!name) continue
    const dir = path.posix.dirname(rel)
    const normalized = dir === '.' ? '' : dir
    const existing = packages.get(name)
    if (existing === undefined
      || dirDepth(normalized) < dirDepth(existing)
      || (dirDepth(normalized) === dirDepth(existing) && normalized < existing)) {
      packages.set(name, normalized)
    }
  }
  return packages
}

/**
 * 解析 Dart 的 `package:<name>/<path>.dart`：仅当包名来自仓库内
 * pubspec.yaml 时映射到 `<包根>/lib/<path>`；外部依赖返回 null。
 * @param {string} specifier - import/export URI。
 * @param {Map<string,string>} packages - 包名 → 包根目录。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件；外部/无法解析返回 null。
 */
function resolveDartPackage(specifier, packages, indexed) {
  if (!specifier.startsWith('package:')) return null
  const rest = specifier.slice('package:'.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const name = rest.slice(0, slash)
  const sub = rest.slice(slash + 1)
  if (!sub.endsWith('.dart')) return null
  const dir = packages.get(name)
  if (dir === undefined) return null
  const libDir = dir ? `${dir}/lib` : 'lib'
  const candidate = path.posix.normalize(path.posix.join(libDir, sub))
  return indexed.has(candidate) ? candidate : null
}

/**
 * 建立 Elixir 模块名 → 文件索引：使用 defmodule 符号（覆盖一个文件内
 * 多个模块、嵌套命名与 umbrella 布局）；同名模块取字典序最小文件，
 * 保证确定性。
 * @param {Array<{path:string, lang:string, symbols?:Array}>} files - 索引文件条目。
 * @returns {Map<string,string>} 模块名 → 文件相对路径。
 */
function buildElixirModules(files) {
  const modules = new Map()
  for (const file of files) {
    if (file.lang !== 'elixir') continue
    for (const symbol of file.symbols ?? []) {
      if (symbol?.kind !== 'class' || typeof symbol.name !== 'string') continue
      if (!/^[A-Z][\w.]*$/.test(symbol.name)) continue
      const existing = modules.get(symbol.name)
      if (existing === undefined || file.path < existing) modules.set(symbol.name, file.path)
    }
  }
  return modules
}

/**
 * 建立 Lua `require` 的加载根：任意层级的 `lua/` 目录（Neovim 插件布局），
 * 最后回退项目根；按深度、字典序排序保证确定性。
 * @param {Iterable<string>} paths - 已索引文件相对路径。
 * @returns {string[]} 加载根（末项为项目根 ''）。
 */
function buildLuaRoots(paths) {
  const roots = new Set()
  for (const rel of paths) {
    if (!rel.endsWith('.lua')) continue
    const segments = rel.split('/').slice(0, -1)
    for (let i = 0; i < segments.length; i++) {
      if (segments[i] === 'lua') roots.add(segments.slice(0, i + 1).join('/'))
    }
  }
  return [
    ...[...roots].sort((a, b) => dirDepth(a) - dirDepth(b) || a.localeCompare(b)),
    '',
  ]
}

/**
 * 解析 Lua `require("mod")`：点分模块名按 Lua 语义换算为路径分隔，在
 * `lua/` 根与项目根下尝试 `<mod>.lua` 与 `<mod>/init.lua`；外部模块返回 null。
 * @param {string} specifier - require 的模块名（`my.mod` 或 `my/mod`）。
 * @param {string[]} roots - 加载根（含 ''）。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件；外部/无法解析返回 null。
 */
function resolveLuaSpecifier(specifier, roots, indexed) {
  if (typeof specifier !== 'string') return null
  const raw = specifier.trim()
  if (raw === '' || raw.startsWith('/') || raw.split('/').includes('..')) return null
  const cleaned = raw.replace(/\./g, '/')
  if (!/^[\w\-/]+$/.test(cleaned)) return null
  for (const root of roots) {
    const base = root === '' ? cleaned : `${root}/${cleaned}`
    for (const candidate of [`${base}.lua`, `${base}/init.lua`]) {
      const normalized = path.posix.normalize(candidate)
      if (indexed.has(normalized)) return normalized
    }
  }
  return null
}

/**
 * 解析 Zig `@import("x.zig")`：Zig 的路径导入相对于引用文件所在目录，
 * 归一化后必须落在项目内且命中已索引文件。包名导入（`std`/`builtin`/
 * `root`/构建注入的模块名）不以 `.zig` 结尾，按外部模块处理。
 * @param {string} fromRel - 引用方文件相对路径。
 * @param {string} specifier - `@import` 的字符串参数。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件；外部/无法解析返回 null。
 */
function resolveZigSpecifier(fromRel, specifier, indexed) {
  if (typeof specifier !== 'string') return null
  const raw = specifier.trim()
  if (!raw.endsWith('.zig') || raw.startsWith('/') || raw.includes('\\')) return null
  const base = path.posix.join(path.posix.dirname(fromRel), raw)
  const normalized = path.posix.normalize(base)
  if (normalized.startsWith('../') || normalized === '..') return null
  return indexed.has(normalized) ? normalized : null
}

/**
 * 建立 Gleam 模块的源根：任意层级名为 `src`/`test` 的目录（monorepo
 * 子包亦可），最后回退项目根；按深度、字典序排序保证确定性。
 * @param {Iterable<string>} paths - 已索引文件相对路径。
 * @returns {string[]} 源根（末项为项目根 ''）。
 */
function buildGleamRoots(paths) {
  const roots = new Set()
  for (const rel of paths) {
    if (!rel.endsWith('.gleam')) continue
    const segments = rel.split('/').slice(0, -1)
    for (let i = 0; i < segments.length; i++) {
      if (segments[i] === 'src' || segments[i] === 'test') {
        roots.add(segments.slice(0, i + 1).join('/'))
      }
    }
  }
  return [
    ...[...roots].sort((a, b) => dirDepth(a) - dirDepth(b) || a.localeCompare(b)),
    '',
  ]
}

/**
 * 解析 Gleam `import package/module`：模块路径在 `src/`/`test/` 源根与
 * 项目根下映射为 `<module>.gleam`；外部包（如 `gleam/io`）返回 null。
 * @param {string} specifier - 模块路径（`my_app/user`）。
 * @param {string[]} roots - 源根（含 ''）。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件；外部/无法解析返回 null。
 */
function resolveGleamSpecifier(specifier, roots, indexed) {
  if (typeof specifier !== 'string') return null
  const raw = specifier.trim()
  if (raw === '' || raw.startsWith('/') || raw.includes('..') || raw.includes('\\')) return null
  if (!/^[a-z][\w/]*$/.test(raw)) return null
  for (const root of roots) {
    const base = root === '' ? raw : `${root}/${raw}`
    const candidate = path.posix.normalize(`${base}.gleam`)
    if (indexed.has(candidate)) return candidate
  }
  return null
}

/**
 * 解析 Shell 的 `source path` / `. path`：先按引用脚本所在目录、再按
 * 项目根尝试原路径与 `.sh`/`.bash` 后缀（同目录 source 是脚本最常见写法）。
 * 绝对路径、上跳越界与含反斜杠的路径不建边。
 * @param {string} fromRel - 引用方文件相对路径。
 * @param {string} specifier - source 的参数（已去引号）。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件；外部/无法解析返回 null。
 */
function resolveShellSpecifier(fromRel, specifier, indexed) {
  if (typeof specifier !== 'string') return null
  const raw = specifier.trim()
  if (raw === '' || raw.startsWith('/') || raw.startsWith('-') || raw.includes('\\')) return null
  for (const base of [path.posix.dirname(fromRel), '']) {
    const joined = path.posix.normalize(path.posix.join(base, raw))
    if (joined.startsWith('..') || joined === '..') continue
    for (const candidate of [joined, `${joined}.sh`, `${joined}.bash`]) {
      if (indexed.has(candidate)) return candidate
    }
  }
  return null
}

/**
 * 解析 R 包 NAMESPACE 的导出声明。
 * 支持 `export(a, b)` / `exportClasses(...)` / `exportMethods(...)` /
 * `S3method(generic, class[, method])`；`exportPattern(...)` 是动态导出，
 * 无法静态展开，标记 dynamic 供调用方回退。
 * @param {string} text - NAMESPACE 内容。
 * @returns {{names:Set<string>, dynamic:boolean}} 导出名与动态导出标记。
 */
function parseRNamespace(text) {
  const names = new Set()
  let dynamic = false
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim()
    if (line === '') continue
    const call = /^(export|exportClasses|exportMethods|S3method|exportPattern)\s*\((.*)\)\s*$/.exec(line)
    if (!call) continue
    const kind = call[1]
    const args = call[2].split(',')
      .map(arg => arg.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
    if (kind === 'exportPattern') { dynamic = true; continue }
    if (kind === 'S3method') {
      if (args.length >= 3) names.add(args[2])
      else if (args.length === 2) names.add(`${args[0]}.${args[1]}`)
      continue
    }
    for (const name of args) names.add(name)
  }
  return { names, dynamic }
}

/**
 * 按 NAMESPACE 收紧 R 符号的 exported 标记。
 * 无 NAMESPACE 或存在 `exportPattern`（动态导出）时保持既有约定
 * （`.` 前缀私有），避免把无法静态判定的导出全部标成未导出。
 * @param {object[]} files - 索引文件条目。
 * @param {string|undefined} text - NAMESPACE 内容。
 * @returns {void}
 */
function applyRNamespaceExports(files, text) {
  if (typeof text !== 'string') return
  const { names, dynamic } = parseRNamespace(text)
  if (dynamic) return
  for (const file of files) {
    if (file.lang !== 'r' || !Array.isArray(file.symbols)) continue
    file.symbols = file.symbols.map(symbol => {
      if (typeof symbol?.name !== 'string') return symbol
      // 方法经类/泛型访问，不是包导出；NAMESPACE 也不导出方法本体
      if (symbol.kind === 'method') return { ...symbol, exported: false }
      return { ...symbol, exported: names.has(symbol.name) && !symbol.name.startsWith('.') }
    })
  }
}

/**
 * 解析 R 的 `source("path")`：先按引用文件目录、再按项目根尝试原路径与
 * `.R`/`.r` 后缀；绝对路径与越界路径不建边。
 * @param {string} fromRel - 引用方文件相对路径。
 * @param {string} specifier - source 的参数（已去引号）。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件；外部/无法解析返回 null。
 */
function resolveRSpecifier(fromRel, specifier, indexed) {
  if (typeof specifier !== 'string') return null
  const raw = specifier.trim()
  if (raw === '' || raw.startsWith('/') || raw.includes('\\')) return null
  for (const base of [path.posix.dirname(fromRel), '']) {
    const joined = path.posix.normalize(path.posix.join(base, raw))
    if (joined.startsWith('..') || joined === '..') continue
    for (const candidate of [joined, `${joined}.R`, `${joined}.r`]) {
      if (indexed.has(candidate)) return candidate
    }
  }
  return null
}

/**
 * 解析 Julia 的 `include("path")`：路径恒相对引用文件（Julia 的 include
 * 语义），归一后必须落在项目内；无扩展名时追加 `.jl` 再试。
 * @param {string} fromRel - 引用方文件相对路径。
 * @param {string} specifier - include 的参数（已去引号）。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件；外部/无法解析返回 null。
 */
function resolveJuliaInclude(fromRel, specifier, indexed) {
  if (typeof specifier !== 'string') return null
  const raw = specifier.trim()
  if (raw === '' || raw.startsWith('/') || raw.includes('\\')) return null
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), raw))
  if (joined.startsWith('..') || joined === '..') return null
  for (const candidate of [joined, `${joined}.jl`]) {
    if (indexed.has(candidate)) return candidate
  }
  return null
}

/**
 * 建立 Nim 模块的搜索根：任意层级名为 `src` 的目录（Nim 常见布局），
 * 最后回退项目根；按深度、字典序排序保证确定性。
 * @param {Iterable<string>} paths - 已索引文件相对路径。
 * @returns {string[]} 搜索根（末项为项目根 ''）。
 */
function buildNimRoots(paths) {
  const roots = new Set()
  for (const rel of paths) {
    if (!rel.endsWith('.nim') && !rel.endsWith('.nims')) continue
    const segments = rel.split('/').slice(0, -1)
    for (let i = 0; i < segments.length; i++) {
      if (segments[i] === 'src') roots.add(segments.slice(0, i + 1).join('/'))
    }
  }
  return [
    ...[...roots].sort((a, b) => dirDepth(a) - dirDepth(b) || a.localeCompare(b)),
    '',
  ]
}

/**
 * 解析 Nim 的 `import`/`include` 模块：先按引用文件目录（相对导入），
 * 再经每个 `src/` 根与项目根映射为 `<module>.nim`/`.nims`；`std/` 与
 * 外部包不建边。
 * @param {string} fromRel - 引用方文件相对路径。
 * @param {string} specifier - 模块路径（`utils/helpers` 或 `./local`）。
 * @param {string[]} roots - 搜索根（含 ''）。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件；外部/无法解析返回 null。
 */
function resolveNimSpecifier(fromRel, specifier, roots, indexed) {
  if (typeof specifier !== 'string') return null
  const raw = specifier.trim()
  if (raw === '' || raw.startsWith('/') || raw.includes('\\') || raw.startsWith('std/')) return null
  for (const base of [path.posix.dirname(fromRel), ...roots]) {
    const joined = path.posix.normalize(path.posix.join(base, raw))
    if (joined.startsWith('..') || joined === '..') continue
    for (const candidate of [`${joined}.nim`, `${joined}.nims`]) {
      if (indexed.has(candidate)) return candidate
    }
  }
  return null
}

/**
 * 解析 Elixir 模块引用：alias/import/require/use 的点分模块名精确匹配
 * 仓库内 defmodule 或 `lib/` 布局文件；外部依赖返回 null。
 * @param {string} specifier - 点分模块名（如 MyApp.Repo）。
 * @param {Map<string,string>} modules - 模块名索引。
 * @returns {string|null} 命中文件；外部/无法解析返回 null。
 */
function resolveElixirSpecifier(specifier, modules) {
  if (typeof specifier !== 'string' || !/^[A-Z][\w.]*$/.test(specifier)) return null
  return modules.get(specifier) ?? null
}

/**
 * 解析工作区包 import：按最长包名前缀匹配，子路径优先走 package.json 的
 * exports（含通配），其次按包内相对路径落地；包根按 exports → main 等
 * 入口 → src/index → index 依次尝试。
 * @param {string} specifier - 非相对 specifier（如 `@acme/ui/button`）。
 * @param {Map<string, WorkspacePackage>} packages - 工作区包索引。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件；未命中（外部包）返回 null。
 */
function resolveWorkspaceSpecifier(specifier, packages, indexed) {
  let match = null
  for (const [name, info] of packages) {
    if (specifier !== name && !specifier.startsWith(name + '/')) continue
    if (!match || name.length > match.name.length) match = { name, info }
  }
  if (!match) return null
  const { dir, entries, exports } = match.info
  const sub = specifier.slice(match.name.length).replace(/^\//, '')
  const subKey = sub ? './' + sub : '.'
  const tryTargets = (targets, captured) => {
    for (const target of targets) {
      const replaced = captured === null ? target : target.replace('*', captured)
      const hit = resolveJsBase(normalizeRel(dir, replaced), indexed)
      if (hit) return hit
    }
    return null
  }
  // 精确导出入口
  const exact = exports.get(subKey)
  if (exact) {
    const hit = tryTargets(exact, null)
    if (hit) return hit
  }
  // 通配导出手册（如 "./*": "./src/*.ts"）
  for (const [key, targets] of exports) {
    const star = key.indexOf('*')
    if (star < 0) continue
    const prefix = key.slice(0, star)
    const suffix = key.slice(star + 1)
    if (subKey.length < prefix.length + suffix.length) continue
    if (!subKey.startsWith(prefix) || !subKey.endsWith(suffix)) continue
    const captured = subKey.slice(prefix.length, subKey.length - suffix.length)
    const hit = tryTargets(targets, captured)
    if (hit) return hit
  }
  // 无 exports 映射时按包内相对路径落地（如 `@acme/ui/src/button`）
  if (sub) return resolveJsBase(normalizeRel(dir, sub), indexed)
  for (const entry of entries) {
    const hit = resolveJsBase(normalizeRel(dir, entry), indexed)
    if (hit) return hit
  }
  for (const fallback of ['src/index', 'index']) {
    const hit = resolveJsBase(normalizeRel(dir, fallback), indexed)
    if (hit) return hit
  }
  return null
}

/**
 * 从 pyproject.toml 提取自定义源码根（setuptools / PDM / poetry / Hatch）。
 * 只做行级正则提取，不引入 TOML 解析器：
 * - `[tool.setuptools] package-dir = {"" = "backend"}` 的值；
 * - `package-dir = "src"`（PDM 字符串形式）；
 * - `[tool.setuptools.packages.find] where = ["src", "libs"]`；
 * - `[tool.poetry]` 段内 `packages = [{ include = "pkg", from = "python" }]`；
 * - `[tool.hatch.build]` / `[tool.hatch.build.targets.wheel|sdist]` 段内
 *   `packages = ["src/foo"]`：取包目录的父目录作为导入根。
 * 绝对路径与包含 `..` 的值被丢弃，避免把导入根指到仓库外。
 * @param {string|undefined} text - pyproject.toml 文本。
 * @returns {string[]} 候选导入根（根相对，已归一）。
 */
function pyprojectRoots(text) {
  if (typeof text !== 'string' || text.length === 0) return []
  const roots = new Set()
  /**
   * 归一候选根；非法值静默忽略。
   * @param {string} raw - 原始值。
   * @returns {void}
   */
  const add = (raw) => {
    const cleaned = String(raw).trim()
      .replace(/^\.\//, '')
      .replace(/\/+$/, '')
    if (!cleaned || cleaned.startsWith('/') || cleaned.split('/').includes('..')) return
    roots.add(cleaned)
  }
  for (const m of text.matchAll(/package-dir\s*=\s*\{([^}]*)\}/g)) {
    // 只取 `key = "value"` 的值：空键 `"" = "src"` 会让朴素引号配对错位
    for (const s of m[1].matchAll(/=\s*["']([^"']+)["']/g)) add(s[1])
  }
  for (const m of text.matchAll(/package-dir\s*=\s*["']([^"']+)["']/g)) add(m[1])
  for (const m of text.matchAll(/where\s*=\s*\[([^\]]*)\]/g)) {
    for (const s of m[1].matchAll(/["']([^"']+)["']/g)) add(s[1])
  }
  const poetry = /\[tool\.poetry\][\s\S]*?(?=\n\[|$)/.exec(text)?.[0]
  if (poetry) {
    for (const m of poetry.matchAll(/\bfrom\s*=\s*["']([^"']+)["']/g)) add(m[1])
  }
  // Hatch：packages 列的是包目录，导入根是其父目录；单段值等于项目根，忽略
  for (const m of text.matchAll(/\[tool\.hatch\.build(?:\.targets\.(?:wheel|sdist))?\][\s\S]*?(?=\n\[|$)/g)) {
    const packages = /\bpackages\s*=\s*\[([^\]]*)\]/.exec(m[0])
    if (!packages) continue
    for (const s of packages[1].matchAll(/["']([^"']+)["']/g)) {
      const parts = s[1].replace(/^\.\//, '').replace(/\/+$/, '').split('/').filter(Boolean)
      if (parts.length > 1) add(parts.slice(0, -1).join('/'))
    }
  }
  return [...roots]
}

/**
 * 建立 Python 绝对导入的候选导入根：项目根、pyproject 声明的自定义源码
 * 根，以及任意层级的 `src` / `lib` 目录（常见布局）。按深度、字典序
 * 排序，保证同一仓库多次索引得到相同的边。
 * @param {Iterable<string>} paths - 已索引文件相对路径。
 * @param {string[]} [extras] - 额外的候选根（来自 pyproject）。
 * @returns {string[]} 导入根列表（根目录为 ''，其余为 POSIX 目录路径）。
 */
function buildPythonRoots(paths, extras = []) {
  const roots = new Set([''])
  for (const extra of extras) {
    if (typeof extra === 'string' && extra !== '') roots.add(extra)
  }
  for (const rel of paths) {
    if (!rel.endsWith('.py')) continue
    const segments = rel.split('/').slice(0, -1)
    for (let i = 0; i < segments.length; i++) {
      if (segments[i] === 'src' || segments[i] === 'lib') {
        roots.add(segments.slice(0, i + 1).join('/'))
      }
    }
  }
  return [...roots].sort((a, b) => dirDepth(a) - dirDepth(b) || a.localeCompare(b))
}

/**
 * 在已索引文件中按 Python 模块约定查找一个基准路径：
 * `<base>.py` 或 `<base>/__init__.py`。
 * @param {string} base - 模块基准路径（已归一，无前导 ./）。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件；未命中返回 null。
 */
function resolvePyBase(base, indexed) {
  for (const suffix of PY_PATH_CANDIDATES) {
    for (const candidate of [base + suffix, path.posix.join(base, '__init__.py')]) {
      if (indexed.has(candidate)) return candidate
    }
  }
  return null
}

/**
 * 把 `from pkg import name` 中的 name 优先解析为子模块文件。
 * Python 的 from-import 在包内存在同名子模块时导入子模块，因此
 * `from app.services import user` 应命中 services/user.py 而非包入口。
 * @param {string} base - 包/模块基准路径。
 * @param {string[]} names - 导入的符号名。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件；未命中返回 null。
 */
function resolvePyImportNames(base, names, indexed) {
  for (const name of names ?? []) {
    if (!/^[A-Za-z_]\w*$/.test(name)) continue
    const hit = resolvePyBase(path.posix.join(base, name), indexed)
    if (hit) return hit
  }
  return null
}

/**
 * 尝试把 Python import 解析为项目内的实际文件。
 * 相对 import（`.foo` / `..pkg.mod`）按引用方目录回退层级；绝对 import
 * （`a.b.c`）依次在项目根与 `src`/`lib` 导入根下查找。`from pkg import x`
 * 优先解析为子模块 `x.py`（Python 语义），其次才是模块文件或包入口。
 * 外部包（标准库/第三方）不产生边。
 * @param {string} fromRel - 引用方文件的相对路径。
 * @param {string} specifier - 模块 specifier（相对或绝对）。
 * @param {Set<string>} indexed - 已索引文件相对路径集合。
 * @param {string[]} [roots] - 绝对导入的候选根（默认仅项目根）。
 * @param {string[]} [names] - from-import 的符号名（用于优先匹配子模块）。
 * @returns {string|null} 命中的相对路径；未命中返回 null。
 */
function resolvePySpecifier(fromRel, specifier, indexed, roots = [''], names = []) {
  if (specifier.startsWith('.')) {
    // 点数 = 层级；'.'=1（当前目录），'..'=2（父目录）
    const dots = specifier.match(/^\.+/)[0].length
    const rest = specifier.slice(dots)
    let dir = path.posix.dirname(fromRel)
    for (let i = 1; i < dots; i++) dir = path.posix.dirname(dir)
    const base = rest ? path.posix.join(dir, rest) : dir
    return resolvePyImportNames(base, names, indexed) ?? resolvePyBase(base, indexed)
  }
  if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(specifier)) return null
  const modulePath = specifier.split('.').join('/')
  for (const root of roots) {
    const base = root === '' ? modulePath : `${root}/${modulePath}`
    const hit = resolvePyImportNames(base, names, indexed) ?? resolvePyBase(base, indexed)
    if (hit) return hit
  }
  return null
}

/**
 * 建立 Java 包路径索引：'src/main/java/com/acme/Foo.java' →
 * 'src.main.java.com.acme.Foo'（同一个类名可能出现在多个包，全部保留）。
 * 同时按简单类名分组，避免每条 import 都全表扫描（大仓库性能）。
 * @param {Iterable<string>} paths - 已索引文件相对路径。
 * @returns {{byDotted: Map<string,string>, byClass: Map<string,string[]>}}
 *   byDotted：点分路径 → 文件相对路径（同键取字典序最小）；
 *   byClass：简单类名 → 点分路径列表（已排序）。
 */
function buildJavaPaths(paths) {
  const byDotted = new Map()
  for (const rel of paths) {
    if (!rel.endsWith('.java')) continue
    const dotted = rel.slice(0, -'.java'.length).split('/').join('.')
    const existing = byDotted.get(dotted)
    if (!existing || rel < existing) byDotted.set(dotted, rel)
  }
  const byClass = new Map()
  for (const dotted of byDotted.keys()) {
    const className = dotted.slice(dotted.lastIndexOf('.') + 1)
    if (!byClass.has(className)) byClass.set(className, [])
    byClass.get(className).push(dotted)
  }
  for (const list of byClass.values()) list.sort()
  return { byDotted, byClass }
}

/**
 * 解析 Java import：先精确匹配点分路径，再按简单类名做包后缀匹配
 * （源码目录前缀如 src.main.java 不参与 import 书写），
 * static 成员导入逐段回退。
 * @param {string} specifier - `com.acme.Foo` / `com.acme.*` / static 成员。
 * @param {{byDotted: Map<string,string>, byClass: Map<string,string[]>}} javaPaths
 *   点分路径与类名索引。
 * @returns {string|null} 命中的文件相对路径。
 */
function resolveJavaSpecifier(specifier, javaPaths) {
  const { byDotted, byClass } = javaPaths
  if (specifier.endsWith('.*')) {
    const pkg = specifier.slice(0, -2)
    const hits = []
    for (const dotted of byDotted.keys()) {
      if (dotted.startsWith(pkg + '.') || dotted.includes('.' + pkg + '.')) hits.push(dotted)
    }
    hits.sort()
    return hits.length > 0 ? byDotted.get(hits[0]) : null
  }
  if (byDotted.has(specifier)) return byDotted.get(specifier)
  // 只检查同名类的候选（import 的最后一段即类名）
  const suffix = '.' + specifier
  const className = specifier.slice(specifier.lastIndexOf('.') + 1)
  const hit = (byClass.get(className) ?? []).find(dotted => dotted.endsWith(suffix))
  if (hit) return byDotted.get(hit)
  // static 成员导入：com.acme.Foo.method → 回退到类
  const cut = specifier.lastIndexOf('.')
  return cut > 0 ? resolveJavaSpecifier(specifier.slice(0, cut), javaPaths) : null
}

/**
 * 建立点分路径索引（C# / Kotlin / PHP）：去掉扩展名后把 `/` 归一为 `.`。
 * 同键取字典序最小的文件，保证确定性。
 * @param {Iterable<string>} paths - 已索引文件相对路径。
 * @param {string[]} extensions - 参与索引的扩展名（含点）。
 * @param {{lowercase?:boolean}} [opts] - 是否小写归一（PHP 大小写不敏感匹配）。
 * @returns {{byDotted: Map<string,string>, byClass: Map<string,string[]>}}
 *   点分路径与简单名索引。
 */
function buildDottedPaths(paths, extensions, opts = {}) {
  const byDotted = new Map()
  for (const rel of paths) {
    const ext = extensions.find(candidate => rel.endsWith(candidate))
    if (!ext) continue
    let dotted = rel.slice(0, -ext.length).split('/').join('.')
    if (opts.lowercase) dotted = dotted.toLowerCase()
    const existing = byDotted.get(dotted)
    if (!existing || rel < existing) byDotted.set(dotted, rel)
  }
  const byClass = new Map()
  for (const dotted of byDotted.keys()) {
    const className = dotted.slice(dotted.lastIndexOf('.') + 1)
    if (!byClass.has(className)) byClass.set(className, [])
    byClass.get(className).push(dotted)
  }
  for (const list of byClass.values()) list.sort()
  return { byDotted, byClass }
}

/**
 * 解析点分引用（C# using / Kotlin import / PHP use）：
 * 精确匹配 → 简单名后缀 → 命名空间/包前缀 → 逐段回退。
 * @param {string} specifier - 点分路径（可带 `.*`）。
 * @param {{byDotted: Map<string,string>, byClass: Map<string,string[]>}} dottedPaths - 索引。
 * @param {{lowercase?:boolean}} [opts] - 是否小写匹配（PHP）。
 * @returns {string|null} 命中的文件相对路径。
 */
function resolveDottedSpecifier(specifier, dottedPaths, opts = {}) {
  const key = opts.lowercase ? specifier.toLowerCase() : specifier
  const { byDotted, byClass } = dottedPaths
  if (byDotted.has(key)) return byDotted.get(key)

  if (key.endsWith('.*')) {
    const pkg = key.slice(0, -2)
    const hits = []
    for (const dotted of byDotted.keys()) {
      if (dotted.startsWith(pkg + '.') || dotted.includes('.' + pkg + '.')) hits.push(dotted)
    }
    hits.sort()
    return hits.length > 0 ? byDotted.get(hits[0]) : null
  }

  const className = key.slice(key.lastIndexOf('.') + 1)
  const classHit = (byClass.get(className) ?? []).find(dotted => dotted.endsWith('.' + key))
  if (classHit) return byDotted.get(classHit)

  // 命名空间/包导入：解析到该命名空间下的代表文件
  const pkgHits = []
  for (const dotted of byDotted.keys()) {
    if (dotted.startsWith(key + '.') || dotted.includes('.' + key + '.')) pkgHits.push(dotted)
  }
  pkgHits.sort()
  if (pkgHits.length > 0) return byDotted.get(pkgHits[0])

  // static 成员 / 子命名空间：逐段回退
  const cut = key.lastIndexOf('.')
  return cut > 0 ? resolveDottedSpecifier(key.slice(0, cut), dottedPaths, opts) : null
}

/**
 * 归一 composer PSR-4 目录：相对 composer.json 所在目录解析，拒绝绝对
 * 路径、盘符与向上越界；空字符串表示清单所在目录。
 * @param {string} baseDir - composer.json 所在目录（根为 ''）。
 * @param {string} value - `psr-4` 的目录值。
 * @returns {string|null} 归一后的相对目录；非法值返回 null。
 */
function normalizeComposerDir(baseDir, value) {
  const base = baseDir === '.' ? '' : baseDir
  const raw = value.trim().replace(/\\/g, '/')
  if (raw === '') return base
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return null
  const joined = path.posix.normalize(path.posix.join(base || '.', raw))
  if (joined.startsWith('..')) return null
  return joined === '.' ? '' : joined.replace(/\/+$/, '')
}

/**
 * 从根与嵌套 composer.json 构建 PSR-4 自动加载前缀映射。
 * `autoload` 与 `autoload-dev` 都参与（测试夹具类同样需要解析）；
 * 最长前缀优先，其次目录更浅、字典序，保证确定性。
 * @param {Record<string, string>} manifestTexts - 相对路径 → 文本。
 * @returns {Array<{prefix:string, dir:string}>} 前缀（小写、点分）与目录。
 */
function buildPhpPsr4(manifestTexts) {
  const mappings = []
  const seen = new Set()
  for (const [rel, text] of Object.entries(manifestTexts)) {
    if (path.posix.basename(rel) !== 'composer.json' || typeof text !== 'string') continue
    let pkg
    try { pkg = JSON.parse(text) } catch { continue }
    if (!pkg || typeof pkg !== 'object') continue
    const baseDir = path.posix.dirname(rel)
    for (const sectionName of ['autoload', 'autoload-dev']) {
      const section = pkg[sectionName]
      const psr4 = section && typeof section === 'object' ? section['psr-4'] : null
      if (!psr4 || typeof psr4 !== 'object' || Array.isArray(psr4)) continue
      for (const [rawPrefix, rawDirs] of Object.entries(psr4)) {
        if (typeof rawPrefix !== 'string') continue
        const prefix = rawPrefix.replace(/^\\+/, '').replace(/\\+$/, '')
          .replace(/\\/g, '.').toLowerCase()
        for (const rawDir of (Array.isArray(rawDirs) ? rawDirs : [rawDirs])) {
          if (typeof rawDir !== 'string') continue
          const dir = normalizeComposerDir(baseDir, rawDir)
          if (dir === null) continue
          const key = `${prefix}::${dir}`
          if (seen.has(key)) continue
          seen.add(key)
          mappings.push({ prefix, dir })
        }
      }
    }
  }
  return mappings.sort((a, b) =>
    b.prefix.length - a.prefix.length
    || dirDepth(a.dir) - dirDepth(b.dir)
    || a.dir.localeCompare(b.dir))
}

/**
 * 建立 PHP 文件的小写路径索引（PHP 类名与命名空间大小写不敏感，
 * 与点分索引一致）。
 * @param {Iterable<string>} paths - 已索引文件相对路径。
 * @returns {Map<string, string>} 小写相对路径 → 实际相对路径。
 */
function buildPhpPaths(paths) {
  const map = new Map()
  for (const rel of paths) {
    if (!rel.endsWith('.php')) continue
    const key = rel.toLowerCase()
    const existing = map.get(key)
    if (!existing || rel < existing) map.set(key, rel)
  }
  return map
}

/**
 * 解析 PHP `use`：先按 composer.json 的 PSR-4 前缀映射（命名空间前缀 →
 * 目录，类名余段 → 子路径.php），未命中返回 null 交给点分后缀匹配兜底。
 * @param {string} specifier - 点分引用（如 App.Models.User）。
 * @param {Array<{prefix:string, dir:string}>} mappings - PSR-4 映射（最长前缀优先）。
 * @param {Map<string, string>} phpPaths - 小写路径索引。
 * @returns {string|null} 命中文件；未命中返回 null。
 */
function resolvePhpSpecifier(specifier, mappings, phpPaths) {
  const key = specifier.toLowerCase()
  for (const { prefix, dir } of mappings) {
    // 命名空间边界：前缀必须整段命中（App 不匹配 Application）
    if (prefix && key !== prefix && !key.startsWith(prefix + '.')) continue
    const remainder = (prefix ? key.slice(prefix.length) : key).replace(/^\.+/, '')
    if (!remainder) continue
    const sub = remainder.replace(/\./g, '/') + '.php'
    const candidate = dir === '' ? sub : `${dir}/${sub}`
    const hit = phpPaths.get(candidate.toLowerCase())
    if (hit) return hit
  }
  return null
}

/**
 * 解析显式相对文件引用（PHP require/include 字面量路径）。
 * @param {string} fromRel - 引用方文件。
 * @param {string} specifier - 以 ./ 或 ../ 开头的路径。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中的文件相对路径。
 */
function resolveRelativeFile(fromRel, specifier, indexed) {
  if (!specifier.startsWith('.')) return null
  const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier))
  return indexed.has(candidate) ? candidate : null
}

/**
 * 解析 Dart 的本地 import/export/part（`./x.dart`、`../x.dart` 与同目录 `x.dart`）。
 * @param {string} fromRel - 引用方文件相对路径。
 * @param {string} specifier - Dart URI（已排除 dart:/package:）。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件；外部/无法解析返回 null。
 */
function resolveDartSpecifier(fromRel, specifier, indexed) {
  if (!specifier.endsWith('.dart')) return null
  const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier))
  return indexed.has(candidate) ? candidate : null
}

/**
 * 建立 Ruby 裸 `require` 的加载路径根：任意层级的 `lib` 目录（gem 布局
 * 的标准 `$LOAD_PATH`），最后回退项目根。按深度、字典序排序保证确定性。
 * @param {Iterable<string>} paths - 已索引文件相对路径。
 * @returns {string[]} 加载路径根（根目录为 ''）。
 */
function buildRubyRoots(paths) {
  const libs = new Set()
  for (const rel of paths) {
    if (!rel.endsWith('.rb')) continue
    const segments = rel.split('/').slice(0, -1)
    for (let i = 0; i < segments.length; i++) {
      if (segments[i] === 'lib') libs.add(segments.slice(0, i + 1).join('/'))
    }
  }
  return [
    ...[...libs].sort((a, b) => dirDepth(a) - dirDepth(b) || a.localeCompare(b)),
    '',
  ]
}

/**
 * 解析 Ruby require/require_relative。
 * - `require_relative` 与 `./`/`../` 开头：以引用方文件所在目录为基准；
 * - 裸 `require`：按 `$LOAD_PATH` 语义在 `lib/` 等加载路径根下查找，
 *   不再错误地相对引用方文件目录。
 * 候选为 `.rb` 后缀、原路径与目录入口 `index.rb`。
 * @param {string} fromRel - 引用方文件相对路径。
 * @param {string} specifier - require 的字符串（可带 ./ ../ 或裸文件名）。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @param {string[]} [roots] - 裸 require 的加载路径根（默认仅项目根）。
 * @param {boolean} [relative] - 是否 require_relative / 显式相对路径。
 * @returns {string|null} 命中的文件相对路径。
 */
function resolveRubySpecifier(fromRel, specifier, indexed, roots = [''], relative = specifier.startsWith('.')) {
  if (specifier.startsWith('/')) return null
  const candidatesFor = (base) => (base.endsWith('.rb')
    ? [base]
    : [`${base}.rb`, base, path.posix.join(base, 'index.rb')])
  if (!relative) {
    for (const root of roots) {
      const base = root === '' ? specifier : `${root}/${specifier}`
      for (const candidate of candidatesFor(path.posix.normalize(base))) {
        if (indexed.has(candidate)) return candidate
      }
    }
    return null
  }
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier))
  for (const candidate of candidatesFor(base)) {
    if (indexed.has(candidate)) return candidate
  }
  return null
}

/**
 * 解析 Package.swift 中带自定义 `path:` 的 target 声明。
 * 逐字符扫描 `.target(` / `.executableTarget(` / `.testTarget(`，按括号
 * 深度与字符串状态找到声明结尾（声明可跨多行，依赖数组里的嵌套
 * `.target(name:)` 引用会被整段跳过）；只登记同时声明了 `path:` 的 target。
 * @param {string|undefined} text - Package.swift 文本。
 * @returns {Map<string,string>} target 名 → 自定义目录（根相对，根为 ''）。
 */
function parseSwiftTargetPaths(text) {
  const result = new Map()
  if (typeof text !== 'string' || text.length === 0) return result
  const source = removeComments(text)
  const re = /\.(?:executableTarget|testTarget|target)\s*\(/g
  let m
  while ((m = re.exec(source)) !== null) {
    const open = m.index + m[0].length - 1
    let depth = 0
    let inString = false
    let escape = false
    let i = open
    for (; i < source.length; i++) {
      const ch = source[i]
      if (inString) {
        if (escape) escape = false
        else if (ch === '\\') escape = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') { inString = true; continue }
      if (ch === '(') depth++
      else if (ch === ')') {
        depth--
        if (depth === 0) break
      }
    }
    const body = source.slice(open + 1, i)
    const name = /name\s*:\s*"([^"]+)"/.exec(body)?.[1]
    const declaredPath = /path\s*:\s*"([^"]+)"/.exec(body)?.[1]
    if (name && declaredPath) {
      result.set(name, normalizeRel('', declaredPath))
    }
    // 跳过整个声明，避免把依赖数组里的 .target(name:) 引用当成声明
    re.lastIndex = i + 1
  }
  return result
}

/**
 * 在指定目录下挑一个 Swift 代表文件（字典序最小，保证确定性）。
 * @param {Iterable<string>} paths - 已索引文件相对路径。
 * @param {string} dir - 目标目录（根相对，根为 ''）。
 * @returns {string|null} 代表文件；目录下无 Swift 文件返回 null。
 */
function swiftRepresentative(paths, dir) {
  const prefix = dir === '' ? '' : dir + '/'
  let best = null
  for (const rel of paths) {
    if (!rel.endsWith('.swift')) continue
    if (prefix !== '' && !rel.startsWith(prefix)) continue
    if (!best || rel < best) best = rel
  }
  return best
}

/**
 * C/C++ 源码扩展名集合（用于识别 include 根所在的项目布局）。
 */
const CPP_SOURCE_EXTS = ['.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx', '.ipp']

/**
 * 建立 C/C++ 引号 include 的候选根：任意层级 `include` / `src` / `inc`
 * 目录（常见 -I 约定），最后回退项目根。按深度、字典序排序保证确定性。
 * @param {Iterable<string>} paths - 已索引文件相对路径。
 * @returns {string[]} 候选根（根目录为 ''）。
 */
function buildCppRoots(paths) {
  const dirs = new Set()
  for (const rel of paths) {
    if (!CPP_SOURCE_EXTS.some(ext => rel.endsWith(ext))) continue
    const segments = rel.split('/').slice(0, -1)
    for (let i = 0; i < segments.length; i++) {
      if (segments[i] === 'include' || segments[i] === 'src' || segments[i] === 'inc') {
        dirs.add(segments.slice(0, i + 1).join('/'))
      }
    }
  }
  return [
    ...[...dirs].sort((a, b) => dirDepth(a) - dirDepth(b) || a.localeCompare(b)),
    '',
  ]
}

/**
 * 解析 C/C++ 的 `#include`：引号形式先按引用方文件目录（编译器对
 * `"..."` 的第一搜索位），两种形式都再依次尝试 include/src/inc 根与
 * 项目根；尖括号形式不从文件目录起查，系统头与仓库外路径不建边。
 * @param {string} fromRel - 引用方文件相对路径。
 * @param {string} specifier - include 的路径（如 `core/util.h`）。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @param {string[]} [roots] - include 候选根（默认仅项目根）。
 * @param {boolean} [relative] - 是否为引号形式（先查文件目录）。
 * @returns {string|null} 命中的文件相对路径。
 */
function resolveCppInclude(fromRel, specifier, indexed, roots = [''], relative = true) {
  if (specifier.startsWith('/') || specifier === '') return null
  const candidates = []
  if (relative) {
    candidates.push(path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier)))
  }
  for (const root of roots) {
    candidates.push(path.posix.normalize(root === '' ? specifier : `${root}/${specifier}`))
  }
  for (const candidate of candidates) {
    if (indexed.has(candidate)) return candidate
  }
  return null
}

/**
 * 建立 SwiftPM 目标索引：优先使用 Package.swift 声明的自定义 `path:`，
 * 其余 target 按 `Sources/<Target>/…` 与旧版 `Source/<Target>/…` 约定
 * 解析；声明了 path 但目录内无 Swift 文件的目标不建边（不猜测）。
 * @param {Iterable<string>} paths - 已索引文件相对路径。
 * @param {Map<string,string>} [declaredPaths] - target 名 → 自定义目录。
 * @returns {Map<string, string>} 目标名 → 文件相对路径。
 */
function buildSwiftTargets(paths, declaredPaths = new Map()) {
  const map = new Map()
  for (const [name, dir] of declaredPaths) {
    const rep = swiftRepresentative(paths, dir)
    if (rep) map.set(name, rep)
  }
  for (const rel of paths) {
    if (!rel.endsWith('.swift')) continue
    const m = /^(?:Sources|Source)\/([^/]+)\/.+\.swift$/.exec(rel)
    if (!m) continue
    const target = m[1]
    // 显式 path 声明优先于目录约定（含"声明了但目录为空"的情形）
    if (declaredPaths.has(target)) continue
    const existing = map.get(target)
    if (!existing || rel < existing) map.set(target, rel)
  }
  return map
}

/**
 * 解析 Swift `import`：按首段模块名匹配本地 SwiftPM 目标。
 * 子模块导入（`import Core.Models`）归到 `Core`。
 * @param {string} specifier - import 的模块路径。
 * @param {Map<string, string>} swiftTargets - 目标名 → 代表文件。
 * @returns {string|null} 命中的文件相对路径；外部模块返回 null。
 */
function resolveSwiftSpecifier(specifier, swiftTargets) {
  const moduleName = specifier.split('.')[0]
  return swiftTargets.get(moduleName) ?? null
}

/**
 * 收集 go.mod 声明的 module 路径（支持 Go 多模块仓库）。
 * 根模块与任意嵌套模块都参与 import 前缀匹配；目录深度大的优先，
 * 保证子模块的 module 路径先于父模块被尝试。
 * @param {Record<string, string>} manifests - 相对路径 → 清单文本。
 * @returns {Array<{dir:string, module:string}>} 模块根目录（'.' 为仓库根）与 module 路径。
 */
function goModules(manifests) {
  const modules = []
  for (const [rel, text] of Object.entries(manifests)) {
    const baseName = path.posix.basename(rel)
    if (baseName !== 'go.mod' || typeof text !== 'string') continue
    const m = /^\s*module\s+(?<mod>\S+)/m.exec(text)
    if (!m?.groups?.mod) continue
    modules.push({ dir: path.posix.dirname(rel), module: m.groups.mod })
  }
  return modules.sort((a, b) =>
    dirDepth(b.dir) - dirDepth(a.dir) || b.module.length - a.module.length || a.dir.localeCompare(b.dir))
}

/**
 * 建立 Go 包目录 → 代表文件索引（同包多文件时取字典序最小，保证确定性）。
 * @param {Iterable<string>} paths - 已索引文件相对路径。
 * @returns {Map<string, string>} 包目录 → 文件相对路径。
 */
function buildGoDirs(paths) {
  const map = new Map()
  for (const rel of paths) {
    if (!rel.endsWith('.go')) continue
    const dir = path.posix.dirname(rel)
    const existing = map.get(dir)
    if (!existing || rel < existing) map.set(dir, rel)
  }
  return map
}

/**
 * 解析 Go import：命中任一 go.mod module 前缀的包视为本地包，解析到该
 * 包目录下的代表文件（文件级边的粗粒度近似）。多模块仓库按"目录更深、
 * module 更长"的顺序尝试，避免父模块误吞子模块路径。
 * @param {string} specifier - import 包路径。
 * @param {Array<{dir:string, module:string}>} modules - go.mod 模块列表。
 * @param {Map<string, string>} goDirs - 包目录索引。
 * @returns {string|null} 命中的文件相对路径。
 */
function resolveGoSpecifier(specifier, modules, goDirs) {
  for (const { dir, module: modulePath } of modules) {
    let remainder
    if (specifier === modulePath) remainder = ''
    else if (specifier.startsWith(`${modulePath}/`)) remainder = specifier.slice(modulePath.length + 1)
    else continue
    const pkgDir = dir === '.'
      ? (remainder || '.')
      : (remainder ? `${dir}/${remainder}` : dir)
    const hit = goDirs.get(pkgDir)
    if (hit) return hit
  }
  return null
}

/**
 * Go internal 包可见性检查（Go 工具链规则）：目标路径中出现 `/internal/`
 * 时，导入方必须位于该 internal 的父目录树内；根目录 `internal/` 对
 * 仓库内所有包可见。多个 internal 段取最内层（最后一个）作为边界。
 * @param {string} from - 导入方文件相对路径。
 * @param {string} to - 被导入文件相对路径。
 * @returns {string|null} 违规说明；允许时 null。
 */
function goInternalViolation(from, to) {
  const marker = '/internal/'
  const idx = to.lastIndexOf(marker)
  if (idx < 0) return null // 根 internal（internal/...）或路径中无 internal
  const prefix = to.slice(0, idx)
  if (from.startsWith(`${prefix}/`)) return null
  return `${from} imports ${to}, but internal packages under ${prefix}/internal are only importable within ${prefix}/`
}

/**
 * 建立 Rust crate 源码根目录集合（含 `src/lib.rs` / `src/main.rs` 的目录）。
 * @param {Iterable<string>} paths - 已索引文件相对路径。
 * @returns {string[]} 源码根目录（长的优先，供最近祖先匹配）。
 */
function buildRustCrateRoots(paths) {
  const roots = new Set()
  for (const rel of paths) {
    if (rel === 'lib.rs' || rel === 'main.rs') {
      roots.add('.')
    } else if (rel.endsWith('/lib.rs') || rel.endsWith('/main.rs')) {
      roots.add(path.posix.dirname(rel))
    }
  }
  // 长路径优先：嵌套 crate 优先于外层根
  return [...roots].sort((a, b) => b.length - a.length || a.localeCompare(b))
}

/**
 * Rust 文件对应的模块目录：`src/a.rs` 的子模块在 `src/a/`，
 * `src/a/mod.rs`（以及 lib.rs/main.rs）的子模块在其所在目录。
 * @param {string} rel - Rust 文件相对路径。
 * @returns {string} 模块目录相对路径。
 */
function rustModuleDir(rel) {
  const dir = path.posix.dirname(rel)
  const stem = path.posix.basename(rel, '.rs')
  return stem === 'mod' || stem === 'lib' || stem === 'main' ? dir : path.posix.join(dir, stem)
}

/**
 * 在模块目录下按 Rust 模块约定查找 `name.rs` / `name/mod.rs`。
 * @param {string} dir - 模块目录。
 * @param {string} name - 模块名。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件。
 */
function resolveRustMod(dir, name, indexed) {
  for (const candidate of [`${dir}/${name}.rs`, path.posix.join(dir, name, 'mod.rs')]) {
    const normalized = path.posix.normalize(candidate)
    if (indexed.has(normalized)) return normalized
  }
  return null
}

/**
 * 从某个基准目录按 use 路径逐段回退，尝试 `a/b.rs` 与 `a/b/mod.rs`。
 * @param {string} baseDir - 基准目录。
 * @param {string[]} segments - use 路径段（不含 crate/self/super）。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @returns {string|null} 命中文件。
 */
function tryRustPath(baseDir, segments, indexed) {
  const base = baseDir === '.' ? '' : baseDir + '/'
  for (let n = segments.length; n >= 1; n--) {
    const sub = segments.slice(0, n).join('/')
    for (const candidate of [`${base}${sub}.rs`, `${base}${sub}/mod.rs`]) {
      const normalized = path.posix.normalize(candidate)
      if (indexed.has(normalized)) return normalized
    }
  }
  // 末段可能是模块文件内的条目（如 `super::hello`，hello 定义在父模块文件里）
  for (const candidate of [`${baseDir}.rs`, path.posix.join(baseDir, 'mod.rs')]) {
    const normalized = path.posix.normalize(candidate)
    if (indexed.has(normalized)) return normalized
  }
  return null
}

/**
 * 解析 Rust use：crate 从源码根目录、self/super 从当前模块目录；
 * 其它前缀按 2015 风格从 crate 根尝试（失败即忽略，外部 crate 不计边）。
 * @param {string} fromRel - 引用方文件。
 * @param {string} specifier - use 路径（如 crate::a::B）。
 * @param {Set<string>} indexed - 已索引文件集合。
 * @param {string[]} crateRoots - crate 源码根目录（长优先）。
 * @returns {string|null} 命中文件。
 */
function resolveRustUse(fromRel, specifier, indexed, crateRoots) {
  let segments = specifier.split('::').filter(Boolean)
  if (segments.length === 0) return null
  if (segments[0] === 'crate') {
    const root = crateRoots.find(r => r === '.' || fromRel.startsWith(r + '/'))
    if (!root) return null
    return tryRustPath(root, segments.slice(1), indexed)
  }
  if (segments[0] === 'self' || segments[0] === 'super') {
    let dir = rustModuleDir(fromRel)
    while (segments[0] === 'self' || segments[0] === 'super') {
      if (segments[0] === 'super') dir = path.posix.dirname(dir)
      segments = segments.slice(1)
    }
    return segments.length > 0 ? tryRustPath(dir, segments, indexed) : null
  }
  const root = crateRoots.find(r => r === '.' || fromRel.startsWith(r + '/')) ?? '.'
  return tryRustPath(root, segments, indexed)
}

/**
 * 按语言解析单条 import 到本地文件。
 * @param {string} lang - 语言标识。
 * @param {string} fromRel - 引用方文件相对路径。
 * @param {import('./deps.js').ImportInfo} imp - 引用记录。
 * @param {{indexed:Set<string>, javaPaths:{byDotted:Map<string,string>, byClass:Map<string,string[]>},
 *   goDirs:Map<string,string>, goModule:string|null, rustRoots:string[],
 *   swiftTargets:Map<string,string>,
 *   jsAliases:JsAliasConfig[], workspacePackages:Map<string,WorkspacePackage>,
 *   dartPackages:Map<string,string>,
 *   elixirModules:Map<string,string>,
 *   luaRoots:string[],
 *   gleamRoots:string[],
 *   nimRoots:string[],
 *   phpPsr4:Array<{prefix:string, dir:string}>, phpPaths:Map<string,string>,
 *   pythonRoots:string[], rubyRoots:string[], cppRoots:string[],
 *   dottedPaths:{csharp:{byDotted:Map<string,string>, byClass:Map<string,string[]>},
 *     kotlin:{byDotted:Map<string,string>, byClass:Map<string,string[]>},
 *     php:{byDotted:Map<string,string>, byClass:Map<string,string[]>},
 *     scala:{byDotted:Map<string,string>, byClass:Map<string,string[]>}}}} ctx - 解析上下文。
 * @returns {string|null} 命中的目标文件；外部或无法解析返回 null。
 */
function resolveImportEdge(lang, fromRel, imp, ctx) {
  if (lang === 'python') {
    return resolvePySpecifier(fromRel, imp.specifier, ctx.indexed, ctx.pythonRoots, imp.imported)
  }
  if (lang === 'java') return resolveJavaSpecifier(imp.specifier, ctx.javaPaths)
  if (lang === 'go') return resolveGoSpecifier(imp.specifier, ctx.goModules, ctx.goDirs)
  if (lang === 'rust') {
    if (imp.kind === 'mod') return resolveRustMod(rustModuleDir(fromRel), imp.specifier, ctx.indexed)
    return imp.relative ? resolveRustUse(fromRel, imp.specifier, ctx.indexed, ctx.rustRoots) : null
  }
  if (lang === 'csharp') return resolveDottedSpecifier(imp.specifier, ctx.dottedPaths.csharp)
  if (lang === 'kotlin') return resolveDottedSpecifier(imp.specifier, ctx.dottedPaths.kotlin)
  if (lang === 'php') {
    if (imp.kind === 'require') return resolveRelativeFile(fromRel, imp.specifier, ctx.indexed)
    // composer PSR-4 映射优先（支持任意目录布局），点分后缀匹配兜底
    return resolvePhpSpecifier(imp.specifier, ctx.phpPsr4, ctx.phpPaths)
      ?? resolveDottedSpecifier(imp.specifier, ctx.dottedPaths.php, { lowercase: true })
  }
  if (lang === 'ruby') {
    return resolveRubySpecifier(fromRel, imp.specifier, ctx.indexed, ctx.rubyRoots, imp.relative)
  }
  if (lang === 'scala') return resolveDottedSpecifier(imp.specifier, ctx.dottedPaths.scala)
  if (lang === 'swift') return resolveSwiftSpecifier(imp.specifier, ctx.swiftTargets)
  if (lang === 'dart') {
    if (imp.specifier.startsWith('package:')) {
      return resolveDartPackage(imp.specifier, ctx.dartPackages, ctx.indexed)
    }
    return imp.relative ? resolveDartSpecifier(fromRel, imp.specifier, ctx.indexed) : null
  }
  if (lang === 'elixir') return resolveElixirSpecifier(imp.specifier, ctx.elixirModules)
  if (lang === 'lua') return resolveLuaSpecifier(imp.specifier, ctx.luaRoots, ctx.indexed)
  if (lang === 'zig') return resolveZigSpecifier(fromRel, imp.specifier, ctx.indexed)
  if (lang === 'gleam') return resolveGleamSpecifier(imp.specifier, ctx.gleamRoots, ctx.indexed)
  if (lang === 'shell') return resolveShellSpecifier(fromRel, imp.specifier, ctx.indexed)
  if (lang === 'r') return resolveRSpecifier(fromRel, imp.specifier, ctx.indexed)
  if (lang === 'julia') return resolveJuliaInclude(fromRel, imp.specifier, ctx.indexed)
  if (lang === 'nim') return resolveNimSpecifier(fromRel, imp.specifier, ctx.nimRoots, ctx.indexed)
  if (lang === 'c' || lang === 'cpp') {
    return resolveCppInclude(fromRel, imp.specifier, ctx.indexed, ctx.cppRoots, imp.relative)
  }
  // JS/TS：相对 import 走文件路径约定；裸 specifier 先试 tsconfig/jsconfig
  // 的 paths/baseUrl 别名，再试 monorepo 工作区包名，外部包不建边
  if (imp.relative) return resolveJsSpecifier(fromRel, imp.specifier, ctx.indexed)
  return resolveJsAlias(fromRel, imp.specifier, ctx.jsAliases, ctx.indexed)
    ?? resolveWorkspaceSpecifier(imp.specifier, ctx.workspacePackages, ctx.indexed)
}

/**
 * 读取并解析单个源码文件（并行 worker 的最小工作单元）。
 * 读取失败或超过单文件上限时返回 skipped，不阻断整体索引。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {{abs:string, rel:string}} entry - 遍历得到的文件条目。
 * @param {Map<string, object>} previousFiles - 旧索引条目表（增量复用与新增/变更归类）。
 * @param {boolean} allowReuse - 解析规则版本是否允许复用旧结果。
 * @returns {Promise<{file: object|null, kind: 'reused'|'added'|'changed'|'skipped', reason?: 'unreadable'|'too-large'}>}
 *   索引条目与增量归类（skipped 时 file 为 null，reason 说明原因）。
 */
async function indexOneFile(fs, entry, previousFiles, allowReuse) {
  const { abs, rel } = entry
  const ext = rel.slice(rel.lastIndexOf('.') + 1)
  const lang = EXTENSION_LANGS[ext]
  let text
  try {
    const target = await fs.resolve(abs)
    text = await fs.readText(target)
  } catch {
    return { file: null, kind: 'skipped', reason: 'unreadable' }
  }
  if (text.length > MAX_FILE_BYTES) return { file: null, kind: 'skipped', reason: 'too-large' }
  const digest = digestText(text)
  const cached = previousFiles.get(rel)
  let symbols
  let imports
  let kind
  if (allowReuse && cached && cached.digest === digest
    && Array.isArray(cached.symbols) && Array.isArray(cached.imports)) {
    // 内容未变：复用旧条目的解析结果（提取是 CPU 大头；读盘省不了）
    symbols = cached.symbols
    imports = cached.imports
    kind = 'reused'
  } else {
    kind = cached ? 'changed' : 'added'
    symbols = extractSymbols(text, lang)
    imports = extractImports(text, lang)
  }
  return {
    file: {
      path: rel,
      // 模块归属（目录层级，见 modules.js）：供清单、检索过滤与面板分组
      module: moduleOf(rel),
      lang,
      // 字段名为历史约定：值是 readText 解码后的字符数（UTF-8 字节数约为
      // 其 1–3 倍），见 schema.js MAX_FILE_BYTES 注释
      sizeBytes: text.length,
      lines: countSourceLines(text),
      digest,
      symbols,
      imports,
    },
    kind,
  }
}

/**
 * 构建完整索引文档并写盘。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} rootAbs - 项目根绝对路径。
 * @param {BuildOptions} [opts] - 构建选项（opts.previous 为上一版索引，用于增量复用）。
 * @returns {Promise<object>} 索引文档（调用方转成工具结果）。
 */
export async function buildIndex(fs, rootAbs, opts = {}) {
  const startedAt = Date.now()
  const exclude = new Set([...EXCLUDE_DIRS, ...(opts.extraExclude ?? [])])
  const maxFiles = opts.maxFiles ?? MAX_FILES_DEFAULT

  const sourceFiles = []
  const manifests = []
  const budget = { count: 0, stopped: false, aborted: false, ignored: 0, ignoreWarnings: [] }
  const ignore = await loadIgnoreRules(fs, rootAbs)
  await walk(fs, rootAbs, rootAbs, exclude, maxFiles, 0, sourceFiles, manifests, ignore.rules, budget, createDirPrefetcher(fs, WALK_PREFETCH_LIMIT), opts.signal)

  // 第一遍只登记路径（依赖边解析需要全集）
  const indexed = new Set(sourceFiles.map(f => f.rel))
  // 旧索引条目按路径建表，供增量复用判定
  const previousFiles = new Map((opts.previous?.files ?? []).map(f => [f.path, f]))
  // 解析规则升级后，即使源码 digest 没变，也不能复用旧 symbols/imports；
  // 仍保留 previousFiles 以正确报告 changed/removed，而非把全库误报为新增。
  const allowReuse = opts.previous?.parserVersion === INDEX_PARSER_VERSION
  let reused = 0
  let added = 0
  let changed = 0
  let skipped = 0
  let skippedTooLarge = 0

  const files = []
  const edges = []
  // 有界并行读取/解析：worker 从共享游标领取文件，结果写回固定位置，
  // 装配顺序与遍历顺序一致（保证 index.json 可复现、Git diff 稳定）
  const readConcurrency = Number.isInteger(opts.readConcurrency)
    ? Math.min(INDEX_READ_CONCURRENCY_MAX, Math.max(1, opts.readConcurrency))
    : INDEX_READ_CONCURRENCY
  /** @type {({file:object|null, kind:string}|null)[]} */
  const results = new Array(sourceFiles.length).fill(null)
  let cursor = 0
  let aborted = false
  const worker = async () => {
    while (true) {
      // 协作式取消：调用方超时/取消后不再派发新的读盘与解析
      if (aborted || opts.signal?.aborted) { aborted = true; return }
      const position = cursor++
      if (position >= sourceFiles.length) return
      results[position] = await indexOneFile(fs, sourceFiles[position], previousFiles, allowReuse)
    }
  }
  const workerCount = Math.min(readConcurrency, sourceFiles.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  if (aborted) budget.aborted = true
  for (const result of results) {
    if (!result) continue // 取消后未派发的位置：不计入跳过
    if (!result.file) {
      if (result.kind === 'skipped') {
        skipped++
        if (result.reason === 'too-large') skippedTooLarge++
      }
      continue
    }
    files.push(result.file)
    if (result.kind === 'reused') reused++
    else if (result.kind === 'changed') changed++
    else if (result.kind === 'added') added++
  }

  // 产物按路径排序：与遍历/后端顺序解耦，index.json 的 Git diff 稳定
  files.sort(comparePath)

  // 清单文件读取与技术栈识别
  const manifestTexts = {}
  let jsConfigsRead = 0
  let cmakeManifestsRead = 0
  let goModsRead = 0
  let composerManifestsRead = 0
  let mixManifestsRead = 0
  let gleamManifestsRead = 0
  let zigManifestsRead = 0
  let nimbleManifestsRead = 0
  /** @type {Array<{abs:string, rel:string}>} */
  const selectedManifests = []
  for (const { abs, rel } of manifests) {
    const baseName = path.posix.basename(rel)
    const nestedConfig = !MANIFEST_FILES[rel] && isJsConfigName(baseName)
    if (nestedConfig) {
      if (jsConfigsRead >= MAX_JS_CONFIGS) continue
      jsConfigsRead++
    }
    const nestedCmake = !MANIFEST_FILES[rel] && baseName === 'CMakeLists.txt'
    if (nestedCmake) {
      if (cmakeManifestsRead >= MAX_CMAKE_MANIFESTS) continue
      cmakeManifestsRead++
    }
    const nestedGoMod = !MANIFEST_FILES[rel] && baseName === 'go.mod'
    if (nestedGoMod) {
      if (goModsRead >= MAX_GO_MODS) continue
      goModsRead++
    }
    const nestedComposer = !MANIFEST_FILES[rel] && baseName === 'composer.json'
    if (nestedComposer) {
      if (composerManifestsRead >= MAX_COMPOSER_MANIFESTS) continue
      composerManifestsRead++
    }
    const nestedMix = !MANIFEST_FILES[rel] && baseName === 'mix.exs'
    if (nestedMix) {
      if (mixManifestsRead >= MAX_MIX_MANIFESTS) continue
      mixManifestsRead++
    }
    const nestedGleam = !MANIFEST_FILES[rel] && baseName === 'gleam.toml'
    if (nestedGleam) {
      if (gleamManifestsRead >= MAX_GLEAM_MANIFESTS) continue
      gleamManifestsRead++
    }
    const nestedZig = !MANIFEST_FILES[rel] && baseName === 'build.zig.zon'
    if (nestedZig) {
      if (zigManifestsRead >= MAX_ZIG_MANIFESTS) continue
      zigManifestsRead++
    }
    const nimble = !MANIFEST_FILES[rel] && baseName.endsWith('.nimble')
    if (nimble) {
      if (nimbleManifestsRead >= MAX_NIMBLE_MANIFESTS) continue
      nimbleManifestsRead++
    }
    selectedManifests.push({ abs, rel })
  }
  // 有界并发读取（远程 fs 每文件一次 RTT）：先按遍历顺序选好清单（上限
  // 判定与串行一致），再并发读取，最后按选择顺序写入 manifestTexts，
  // 保证键顺序与结果完全可复现。
  const manifestTextsByIndex = new Array(selectedManifests.length)
  let manifestCursor = 0
  const manifestWorkers = Math.min(MANIFEST_READ_CONCURRENCY, selectedManifests.length)
  await Promise.all(Array.from({ length: manifestWorkers }, async () => {
    while (true) {
      const index = manifestCursor++
      if (index >= selectedManifests.length) return
      try {
        const target = await fs.resolve(selectedManifests[index].abs)
        manifestTextsByIndex[index] = await fs.readText(target)
      } catch {
        // 清单缺失（如 package.json 超限）只影响技术栈段落，不阻断索引
        manifestTextsByIndex[index] = null
      }
    }
  }))
  for (let index = 0; index < selectedManifests.length; index++) {
    const text = manifestTextsByIndex[index]
    if (typeof text === 'string') manifestTexts[selectedManifests[index].rel] = text
  }
  const stack = detectStack(manifestTexts)
  // R 包的导出以根 NAMESPACE 为权威证据；在卡片/检索使用符号前收紧标记
  applyRNamespaceExports(files, manifestTexts['NAMESPACE'])
  const modules = buildModules(files)

  // 依赖边第二遍：需要完整文件集合与清单（go.mod 的 module 前缀、
  // Rust crate 根、Java 包路径），因此放在第一遍解析之后统一解析。
  // JS/TS 额外建立别名配置（就近优先）与工作区包索引。
  const jsAliases = []
  for (const [rel, text] of Object.entries(manifestTexts)) {
    if (!isJsConfigName(path.posix.basename(rel))) continue
    const cfg = buildAliasConfig(rel, text)
    if (cfg) jsAliases.push(cfg)
  }
  jsAliases.sort((a, b) => dirDepth(b.dir) - dirDepth(a.dir) || a.dir.localeCompare(b.dir))
  const resolveCtx = {
    indexed,
    javaPaths: buildJavaPaths(indexed),
    goDirs: buildGoDirs(indexed),
    goModules: goModules(manifestTexts),
    rustRoots: buildRustCrateRoots(indexed),
    swiftTargets: buildSwiftTargets(indexed, parseSwiftTargetPaths(manifestTexts['Package.swift'])),
    jsAliases,
    workspacePackages: buildWorkspacePackages(manifestTexts),
    dartPackages: buildDartPackages(manifestTexts),
    elixirModules: buildElixirModules(files),
    luaRoots: buildLuaRoots(indexed),
    gleamRoots: buildGleamRoots(indexed),
    nimRoots: buildNimRoots(indexed),
    phpPsr4: buildPhpPsr4(manifestTexts),
    phpPaths: buildPhpPaths(indexed),
    pythonRoots: buildPythonRoots(indexed, pyprojectRoots(manifestTexts['pyproject.toml'])),
    rubyRoots: buildRubyRoots(indexed),
    cppRoots: buildCppRoots(indexed),
    dottedPaths: {
      csharp: buildDottedPaths(indexed, ['.cs']),
      kotlin: buildDottedPaths(indexed, ['.kt']),
      php: buildDottedPaths(indexed, ['.php'], { lowercase: true }),
      scala: buildDottedPaths(indexed, ['.scala']),
    },
  }
  /** Go internal 可见性违规（去重后进入 warnings）。 */
  const internalViolations = new Set()
  for (const file of files) {
    for (const imp of file.imports ?? []) {
      const resolved = resolveImportEdge(file.lang, file.path, imp, resolveCtx)
      // 自引用边（如目标代表文件 import 自身所在目标）不产生依赖信息
      if (resolved && resolved !== file.path) {
        edges.push({
          from: file.path,
          to: resolved,
          kind: EDGE_KIND_IMPORT,
          // import/use/require 所在行：反向引用可定位到具体语句（v5）
          line: imp.line,
          symbols: imp.imported,
        })
        // Go internal 规则：跨边界导入在真实构建中会编译失败，索引阶段告警
        if (file.lang === 'go') {
          const violation = goInternalViolation(file.path, resolved)
          if (violation) internalViolations.add(violation)
        }
      }
    }
  }

  // 边按 from/行号/to 排序：同一文件内保持源码顺序，跨文件可复现
  edges.sort((a, b) => (a.from === b.from ? 0 : a.from < b.from ? -1 : 1)
    || (a.line ?? 0) - (b.line ?? 0)
    || (a.to === b.to ? 0 : a.to < b.to ? -1 : 1))

  // 语言分布（面板与状态工具用；键排序保证 Git diff 稳定）
  const languageCounts = {}
  for (const file of files) languageCounts[file.lang] = (languageCounts[file.lang] ?? 0) + 1
  const languages = Object.fromEntries(Object.keys(languageCounts).sort().map(k => [k, languageCounts[k]]))

  // Git 溯源（只读 .git/HEAD，不执行命令；非 Git 仓库为 null）
  const git = await readGitInfo(fs, rootAbs)

  // 违规列表上限：极端仓库可能产生大量跨边界导入，防止 index.json 膨胀
  const violations = [...internalViolations]
  const internalWarnings = violations.length > MAX_INTERNAL_WARNINGS
    ? [
      ...violations.slice(0, MAX_INTERNAL_WARNINGS),
      `… ${violations.length - MAX_INTERNAL_WARNINGS} more Go internal visibility violation(s) omitted (capped at ${MAX_INTERNAL_WARNINGS}).`,
    ]
    : violations

  const doc = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    parserVersion: INDEX_PARSER_VERSION,
    generatedAt: new Date().toISOString(),
    root: '.',
    stats: {
      files: files.length,
      symbols: files.reduce((n, f) => n + f.symbols.length, 0),
      edges: edges.length,
      modules: modules.length,
      languages,
      durationMs: Date.now() - startedAt,
      // capped 的真值：遍历确实因预算提前终止（而非"恰好收集到 maxFiles 个
      // 源码文件"——预算对全部路过文件计数，非源码文件同样消耗它）
      capped: budget.stopped,
      // 调用方取消：docs 为部分结果，调用方不得写盘覆盖旧索引
      aborted: budget.aborted,
      ignored: budget.ignored,
      // 读取失败或超过单文件上限而未索引的源码文件（不静默丢文件）
      skipped,
      skippedTooLarge,
      reused,
      added,
      changed,
      // 删除只在完整遍历时可信：预算截断/取消时未扫到的旧文件不是"删除"
      removed: !budget.stopped && !budget.aborted
        ? [...previousFiles.keys()].filter(rel => !indexed.has(rel)).length
        : 0,
    },
    stack,
    modules,
    files,
    edges,
    ...(git ? { git } : {}),
    ...(ignore.warnings.length > 0 || budget.ignoreWarnings.length > 0 || skipped > 0 || internalWarnings.length > 0
      ? {
        warnings: [
          ...ignore.warnings,
          ...budget.ignoreWarnings,
          ...(skipped > 0
            ? [`${skipped} source file(s) skipped (unreadable or above the per-file size limit); they are absent from the index.`]
            : []),
          ...internalWarnings,
        ],
      }
      : {}),
  }
  return doc
}
