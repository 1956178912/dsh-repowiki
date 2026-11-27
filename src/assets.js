/**
 * 资产层：定位项目资产根、读写 index.json 与知识卡片（全部经 ctx.fs）。
 *
 * 设计依据：
 * - 方案 §9.1：资产文件一律走 ctx.fs（resolve/readText/write），不裸用
 *   node fs，以保持策略一致性与跨后端行为一致。
 * - 方案 §8.2-1：会话 cwd 可变，资产定位先从当前目录向上查找已存在的
 *   .dsh-repowiki/，找不到再以当前目录为根新建（与"资产放仓库根"的
 *   设计语义一致）。
 * - 依赖注入：本模块所有函数接收 fs（ctx.fs）作为参数，纯函数化，
 *   单元测试传入最小 fake fs 即可。
 */

import * as path from 'node:path'
import {
  ASSET_DIR, INDEX_REL_PATH, INDEX_SCHEMA_VERSION, INDEX_COMPATIBLE_VERSIONS, DEFAULT_RESULT_LIMIT,
} from './schema.js'
import { moduleOf, buildModules } from './modules.js'
import { writeTextVerified, projectRelativePath } from './util.js'

/**
 * 定位结果。
 * @typedef {Object} AssetRoot
 * @property {string} root - 资产根目录的绝对路径（.dsh-repowiki 的父目录）。
 * @property {string} assetDir - .dsh-repowiki 的绝对路径。
 * @property {boolean} created - 本次调用前资产目录是否不存在（新建语义）。
 */

/**
 * 判断目录是否存在且为目录。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} dirPath - 绝对路径。
 * @returns {Promise<boolean>} 目录存在且为目录。
 */
async function isDirectory(fs, dirPath) {
  try {
    const target = await fs.resolve(dirPath)
    const info = await fs.stat(target)
    return info?.type === 'directory'
  } catch {
    return false
  }
}

/**
 * 解析资产根：从 startDir 向上查找已存在的 .dsh-repowiki/；
 * 找不到则把 startDir 自身作为根（并不立即创建目录——写盘由
 * writeIndex 隐式完成，避免只读调用留下空目录）。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} startDir - 起点（一般是会话当前目录）。
 * @returns {Promise<AssetRoot>} 资产根定位结果。
 */
export async function resolveAssetRoot(fs, startDir) {
  // 向上最多走到文件系统根；每层检查 .dsh-repowiki 是否存在
  let current = path.resolve(startDir)
  const visited = new Set()
  while (!visited.has(current)) {
    visited.add(current)
    if (await isDirectory(fs, path.join(current, ASSET_DIR))) {
      return {
        root: current,
        assetDir: path.join(current, ASSET_DIR),
        created: false,
      }
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return {
    root: path.resolve(startDir),
    assetDir: path.join(path.resolve(startDir), ASSET_DIR),
    created: true,
  }
}

/**
 * 读取索引并做版本校验与路径净化。
 * v2/v3 索引在内存中补齐 module/modules（模块树）与语言分布，下一次
 * repowiki-index 写 v4；未知版本返回 null（调用方降级提示重建）。
 *
 * 索引随 Git 传播，`files[].path` 与 `edges[]` 属于不可信输入：越界/
 * 绝对路径的文件被丢弃，指向被丢弃文件的边一并丢弃，并在 `untrusted`
 * 中记录计数（files/edges）与前 5 条原始路径，避免读取仓库外文件。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根目录绝对路径（.dsh-repowiki 的父目录）。
 * @returns {Promise<object|null>} 索引文档；不存在/版本不兼容返回 null。
 */
export async function readIndex(fs, root) {
  try {
    const target = await fs.resolve(INDEX_REL_PATH, { cwd: root })
    const text = await fs.readText(target)
    const doc = JSON.parse(text)
    // 版本校验：缺失/未知版本即视为不可用（方案 §10.3-4）
    if (typeof doc?.schemaVersion !== 'number' || !INDEX_COMPATIBLE_VERSIONS.has(doc.schemaVersion)) {
      return null
    }
    const rawFiles = Array.isArray(doc.files) ? doc.files : []
    const files = []
    const unsafePaths = []
    for (const file of rawFiles) {
      if (!file || typeof file !== 'object') continue
      const safe = projectRelativePath(file.path)
      if (!safe) {
        if (unsafePaths.length < 5) unsafePaths.push(typeof file.path === 'string' ? file.path : '')
        continue
      }
      file.path = safe
      files.push(file)
    }
    const rawEdges = Array.isArray(doc.edges) ? doc.edges : []
    const knownPaths = new Set(files.map(file => file.path))
    const edges = rawEdges.filter(edge => edge && typeof edge === 'object'
      && knownPaths.has(edge.from) && knownPaths.has(edge.to))
    doc.files = files
    doc.edges = edges
    const droppedFiles = rawFiles.length - files.length
    const droppedEdges = rawEdges.length - edges.length
    if (droppedFiles > 0 || droppedEdges > 0) {
      doc.untrusted = { files: droppedFiles, edges: droppedEdges, paths: unsafePaths }
    }
    // 旧版本 → v4 的内存兼容层：只补派生字段，不改变磁盘内容
    if (doc.schemaVersion !== INDEX_SCHEMA_VERSION) {
      for (const file of files) {
        if (typeof file.module !== 'string' || !file.module) file.module = moduleOf(file.path)
      }
      doc.modules = buildModules(files)
      if (doc.stats && typeof doc.stats === 'object') doc.stats.modules = doc.modules.length
    } else if (!Array.isArray(doc.modules)) {
      doc.modules = buildModules(files)
    }
    if (doc.stats && typeof doc.stats === 'object' && !doc.stats.languages) {
      const counts = {}
      for (const file of files) {
        if (typeof file.lang === 'string') counts[file.lang] = (counts[file.lang] ?? 0) + 1
      }
      doc.stats.languages = Object.fromEntries(Object.keys(counts).sort().map(k => [k, counts[k]]))
    }
    return doc
  } catch {
    return null
  }
}

/**
 * 写入索引（JSON、LF、2 空格缩进，便于 diff 与 Git 共享）。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根目录绝对路径。
 * @param {object} doc - 索引文档。
 * @returns {Promise<string>} 写入文件的 displayPath。
 */
export async function writeIndex(fs, root, doc) {
  const target = await fs.resolve(INDEX_REL_PATH, { cwd: root })
  await writeTextVerified(fs, target, JSON.stringify(doc, null, 2) + '\n')
  return target.displayPath
}

/**
 * 符号名与查询的匹配强度：精确 3 > 前缀 2 > 子串 1 > 不匹配 0。
 * @param {string} name - 符号名。
 * @param {string} query - 已小写化的查询。
 * @returns {number} 匹配强度。
 */
function symbolMatchScore(name, query) {
  const lower = name.toLowerCase()
  if (lower === query) return 3
  if (lower.startsWith(query)) return 2
  return lower.includes(query) ? 1 : 0
}

/**
 * 从索引文档中按条件检索符号/文件。
 *
 * 有 query 时结果按匹配质量排序（精确 > 前缀 > 子串；同一强度内公开符号
 * 优先，再按行号），文件按各自最佳符号排序、同分按路径；无 query 时保持
 * 索引遍历顺序，避免无条件列举被重排。
 * @param {object} index - readIndex 返回的索引文档。
 * @param {{query?:string, kind?:string, pathPrefix?:string, module?:string,
 *   lang?:string, exportedOnly?:boolean, limit?:number, offset?:number}} opts
 *   - query：符号名子串（大小写不敏感）；为空则不做名称过滤。
 *   - kind：符号种类过滤（function/class/method/variable/interface/type）。
 *   - pathPrefix：文件路径子串过滤。
 *   - module：模块路径精确过滤（旧索引无 module 字段时按路径实时推导）。
 *   - lang：语言标识过滤（如 typescript / python / go）。
 *   - exportedOnly：仅返回公开/导出符号。
 *   - limit：结果上限（默认 DEFAULT_RESULT_LIMIT）。
 *   - offset：跳过前 N 个匹配（分页，默认 0）。
 * @returns {{matches:Array, total:number, truncated:boolean}} 检索结果。
 */
export function searchIndex(index, opts = {}) {
  const limit = opts.limit ?? DEFAULT_RESULT_LIMIT
  const offset = Number.isInteger(opts.offset) && opts.offset > 0 ? opts.offset : 0
  const query = opts.query?.trim().toLowerCase()
  const kind = opts.kind
  const prefix = opts.pathPrefix?.trim()
  const wantedModule = opts.module?.trim()
  const wantedLang = opts.lang?.trim()
  const exportedOnly = opts.exportedOnly === true
  const matchesModule = (file) => {
    if (!wantedModule) return true
    const actual = file.module ?? moduleOf(file.path)
    return actual === wantedModule || actual.startsWith(`${wantedModule}/`)
  }
  const matches = []
  for (const file of index.files ?? []) {
    if (!matchesModule(file)) continue
    if (prefix && !file.path.includes(prefix)) continue
    if (wantedLang && file.lang !== wantedLang) continue
    /** @type {{sym:object, score:number}[]} */
    const hits = []
    for (const sym of file.symbols ?? []) {
      if (kind && sym.kind !== kind) continue
      if (exportedOnly && sym.exported !== true) continue
      const score = query ? symbolMatchScore(sym.name, query) : 0
      if (query && score === 0) continue
      hits.push({ sym, score })
    }
    const listAll = !query && !kind && !prefix && !wantedLang && !exportedOnly
    if (hits.length === 0 && !listAll) continue
    if (query) {
      // 命中强度降序；同强度内导出符号优先，再按定义行号保持阅读顺序
      hits.sort((a, b) => (b.score - a.score)
        || (Number(b.sym.exported === true) - Number(a.sym.exported === true))
        || ((a.sym.line ?? 0) - (b.sym.line ?? 0)))
    }
    const best = query ? hits.reduce((n, hit) => Math.max(n, hit.score), 0) : 0
    matches.push({ path: file.path, lang: file.lang, symbols: hits.map(hit => hit.sym), best })
  }
  // 文件按最佳命中排序；分数相同按路径，保证输出稳定
  if (query) matches.sort((a, b) => (b.best - a.best) || a.path.localeCompare(b.path))
  const total = matches.length
  const truncated = total > offset + limit
  const page = matches.slice(offset, offset + limit)
  return {
    matches: page.map(({ path, lang, symbols }) => ({ path, lang, symbols })),
    total,
    truncated,
  }
}
