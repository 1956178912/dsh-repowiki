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
  ASSET_DIR, INDEX_REL_PATH, INDEX_SCHEMA_VERSION, DEFAULT_RESULT_LIMIT,
} from './schema.js'

/**
 * 定位结果。
 * @typedef {Object} AssetRoot
 * @property {string} root - 资产根目录的绝对路径（.dsh-repowiki 的父目录）。
 * @property {string} assetDir - .dsh-repowiki 的绝对路径。
 * @property {boolean} created - 本次调用前资产目录是否不存在（新建语义）。
 */

/**
 * 判断目录是否存在且为目录。
 * @param {object} fs - ctx.fs 服务。
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
 * @param {object} fs - ctx.fs 服务。
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
 * 读取索引并做版本校验。
 * @param {object} fs - ctx.fs 服务。
 * @param {string} root - 资产根目录绝对路径（.dsh-repowiki 的父目录）。
 * @returns {Promise<object|null>} 索引文档；不存在返回 null，版本不兼容返回 null（调用方降级提示重建）。
 */
export async function readIndex(fs, root) {
  try {
    const target = await fs.resolve(INDEX_REL_PATH, { cwd: root })
    const text = await fs.readText(target)
    const doc = JSON.parse(text)
    // 版本校验：schemaVersion 缺失或不匹配即视为不可用（方案 §10.3-4）
    if (typeof doc?.schemaVersion !== 'number' || doc.schemaVersion !== INDEX_SCHEMA_VERSION) {
      return null
    }
    return doc
  } catch {
    return null
  }
}

/**
 * 写入索引（JSON、LF、2 空格缩进，便于 diff 与 Git 共享）。
 * @param {object} fs - ctx.fs 服务。
 * @param {string} root - 资产根目录绝对路径。
 * @param {object} doc - 索引文档。
 * @returns {Promise<string>} 写入文件的 displayPath。
 */
export async function writeIndex(fs, root, doc) {
  const target = await fs.resolve(INDEX_REL_PATH, { cwd: root })
  await fs.writeText(target, JSON.stringify(doc, null, 2) + '\n')
  return target.displayPath
}

/**
 * 从索引文档中按条件检索符号/文件。
 * @param {object} index - readIndex 返回的索引文档。
 * @param {{query?:string, kind?:string, pathPrefix?:string, limit?:number}} opts
 *   - query：符号名子串（大小写不敏感）；为空则不做名称过滤。
 *   - kind：符号种类过滤（function/class/method/variable/interface/type）。
 *   - pathPrefix：文件路径子串过滤。
 *   - limit：结果上限（默认 DEFAULT_RESULT_LIMIT）。
 * @returns {{matches:Array, total:number, truncated:boolean}} 检索结果。
 */
export function searchIndex(index, opts = {}) {
  const limit = opts.limit ?? DEFAULT_RESULT_LIMIT
  const query = opts.query?.trim().toLowerCase()
  const kind = opts.kind
  const prefix = opts.pathPrefix?.trim()
  const matches = []
  for (const file of index.files ?? []) {
    if (prefix && !file.path.includes(prefix)) continue
    const symbols = (file.symbols ?? []).filter(sym => {
      if (kind && sym.kind !== kind) return false
      if (query && !sym.name.toLowerCase().includes(query)) return false
      return true
    })
    if (symbols.length > 0 || (!query && !kind && !prefix)) {
      matches.push({ path: file.path, lang: file.lang, symbols })
    }
  }
  const total = matches.length
  const truncated = total > limit
  return { matches: truncated ? matches.slice(0, limit) : matches, total, truncated }
}
