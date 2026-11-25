/**
 * 索引编排器：递归遍历项目文件、提取符号与依赖、组装并写回 index.json。
 *
 * 全部确定性、零 LLM（方案 §6.3：index-service 在宿主进程完成，确定性，
 * 不调用模型）。fs 作为参数注入，便于单元测试。
 */

import * as path from 'node:path'
import {
  EXCLUDE_DIRS, EXTENSION_LANGS, MANIFEST_FILES, MAX_FILES_DEFAULT, MAX_FILE_BYTES,
  INDEX_SCHEMA_VERSION, EDGE_KIND_IMPORT, JS_PATH_CANDIDATES, PY_PATH_CANDIDATES,
} from './schema.js'
import { extractSymbols } from './symbols.js'
import { extractImports } from './deps.js'
import { detectStack } from './stack.js'

/**
 * 索引构建选项。
 * @typedef {Object} BuildOptions
 * @property {string[]} [extraExclude] - 调用方追加排除的目录名。
 * @property {number} [maxFiles] - 文件数上限（默认 MAX_FILES_DEFAULT）。
 */

/** 递归遍历时栈深度上限，防御过深目录树。 */
const MAX_DEPTH = 24

/**
 * 递归遍历项目目录，收集源码文件与清单文件。
 * @param {object} fs - ctx.fs 服务。
 * @param {string} rootAbs - 项目根绝对路径（相对路径换算的唯一锚点）。
 * @param {string} dirPath - 当前遍历目录的绝对路径。
 * @param {Set<string>} exclude - 排除目录名集合。
 * @param {number} maxFiles - 文件上限。
 * @param {number} depth - 当前深度。
 * @param {Array<{abs:string, rel:string}>} sourceFiles - 累积的源码文件。
 * @param {Array<{abs:string, rel:string}>} manifests - 累积的清单文件。
 * @param {{count:number}} budget - 文件计数预算（引用传递，超限即停）。
 * @returns {Promise<void>}
 */
async function walk(fs, rootAbs, dirPath, exclude, maxFiles, depth, sourceFiles, manifests, budget) {
  if (depth > MAX_DEPTH || budget.count >= maxFiles) return
  let entries
  try {
    const dirTarget = await fs.resolve(dirPath)
    entries = await fs.listDir(dirTarget)
  } catch {
    return // 不可读目录安静跳过（权限/IO 问题不阻断整体索引）
  }
  for (const entry of entries) {
    if (budget.count >= maxFiles) return
    if (entry.type === 'directory') {
      if (exclude.has(entry.name)) continue
      await walk(fs, rootAbs, path.posix.join(dirPath, entry.name), exclude, maxFiles, depth + 1, sourceFiles, manifests, budget)
    } else if (entry.type === 'file') {
      budget.count++
      const rel = toRelative(entry.target.displayPath, rootAbs)
      if (rel === null) continue
      if (MANIFEST_FILES[rel]) {
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
 * 尝试把 JS/TS 相对 import specifier 解析为项目内的实际文件。
 * @param {string} fromRel - 引用方文件的相对路径。
 * @param {string} specifier - 相对 specifier（./ 或 ../）。
 * @param {Set<string>} indexed - 已索引文件相对路径集合。
 * @returns {string|null} 命中的相对路径；未命中返回 null。
 */
function resolveJsSpecifier(fromRel, specifier, indexed) {
  const dir = path.posix.dirname(fromRel)
  const base = path.posix.normalize(path.posix.join(dir, specifier))
  for (const suffix of JS_PATH_CANDIDATES) {
    for (const candidate of [base + suffix, path.posix.join(base, 'index' + (suffix || '.js'))]) {
      if (indexed.has(candidate)) return candidate
    }
  }
  return null
}

/**
 * 尝试把 Python 相对 import 解析为项目内的实际文件。
 * @param {string} fromRel - 引用方文件的相对路径。
 * @param {string} specifier - 形如 '.foo' / '..pkg.mod' 的相对 specifier。
 * @param {Set<string>} indexed - 已索引文件相对路径集合。
 * @returns {string|null} 命中的相对路径；未命中返回 null。
 */
function resolvePySpecifier(fromRel, specifier, indexed) {
  if (!specifier.startsWith('.')) return null
  // 点数 = 层级；'.'=1（当前目录），'..'=2（父目录）
  const dots = specifier.match(/^\.+/)[0].length
  const rest = specifier.slice(dots)
  let dir = path.posix.dirname(fromRel)
  for (let i = 1; i < dots; i++) dir = path.posix.dirname(dir)
  const base = rest ? path.posix.join(dir, rest) : dir
  for (const suffix of PY_PATH_CANDIDATES) {
    for (const candidate of [base + suffix, path.posix.join(base, '__init__.py')]) {
      if (indexed.has(candidate)) return candidate
    }
  }
  return null
}

/**
 * 构建完整索引文档并写盘。
 * @param {object} fs - ctx.fs 服务。
 * @param {string} rootAbs - 项目根绝对路径。
 * @param {BuildOptions} [opts] - 构建选项。
 * @returns {Promise<object>} 索引文档（调用方转成工具结果）。
 */
export async function buildIndex(fs, rootAbs, opts = {}) {
  const startedAt = Date.now()
  const exclude = new Set([...EXCLUDE_DIRS, ...(opts.extraExclude ?? [])])
  const maxFiles = opts.maxFiles ?? MAX_FILES_DEFAULT

  const sourceFiles = []
  const manifests = []
  await walk(fs, rootAbs, rootAbs, exclude, maxFiles, 0, sourceFiles, manifests, { count: 0 })

  // 第一遍只登记路径（依赖边解析需要全集）
  const indexed = new Set(sourceFiles.map(f => f.rel))

  const files = []
  const edges = []
  for (const { abs, rel } of sourceFiles) {
    const ext = rel.slice(rel.lastIndexOf('.') + 1)
    const lang = EXTENSION_LANGS[ext]
    let text = ''
    try {
      const target = await fs.resolve(abs)
      text = await fs.readText(target)
    } catch {
      continue // 单文件读取失败不阻断整体索引
    }
    if (text.length > MAX_FILE_BYTES) continue
    const symbols = extractSymbols(text, lang)
    const imports = extractImports(text, lang)
    files.push({
      path: rel,
      lang,
      sizeBytes: text.length,
      symbols,
      imports,
    })
    // 相对 import → 文件级/符号级依赖边
    for (const imp of imports) {
      const resolved = lang === 'python'
        ? resolvePySpecifier(rel, imp.specifier, indexed)
        : (imp.relative ? resolveJsSpecifier(rel, imp.specifier, indexed) : null)
      if (resolved) {
        edges.push({ from: rel, to: resolved, kind: EDGE_KIND_IMPORT, symbols: imp.imported })
      }
    }
  }

  // 清单文件读取与技术栈识别
  const manifestTexts = {}
  for (const { abs, rel } of manifests) {
    try {
      const target = await fs.resolve(abs)
      manifestTexts[rel] = await fs.readText(target)
    } catch {
      // 清单缺失（如 package.json 超限）只影响技术栈段落，不阻断索引
    }
  }
  const stack = detectStack(manifestTexts)

  const doc = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    root: '.',
    stats: {
      files: files.length,
      symbols: files.reduce((n, f) => n + f.symbols.length, 0),
      edges: edges.length,
      durationMs: Date.now() - startedAt,
      capped: sourceFiles.length + manifests.length >= maxFiles,
    },
    stack,
    files,
    edges,
  }
  return doc
}
