// @ts-check
/**
 * 模块树：把索引文件按目录归并为模块（对齐 Qoder Repo Wiki 的模块层级）。
 *
 * 约定（决策见 ADR-0006）：
 * - 模块路径为相对仓库根的目录路径，深度上限 MODULE_MAX_DEPTH（默认 2）；
 *   更深的文件归入二级目录（如 src/graph/nodes/x.ts → src/graph）；
 * - 仓库根下的文件归入 '.'（ROOT_MODULE）；
 * - 每个模块只统计"直属文件"的 files/symbols，不向上汇总；父子关系由
 *   parent 字段表达，UI/清单按需聚合；
 * - 输出按路径排序（'.' 最前），保证 index.json 的 Git diff 稳定。
 */

/** 模块路径的最大目录层级（含）。 */
export const MODULE_MAX_DEPTH = 2

/** 根目录模块的路径标识。 */
export const ROOT_MODULE = '.'

/**
 * @typedef {{path:string, parent:string, files:number, symbols:number}} ModuleEntry
 */

/**
 * 文件相对路径 → 所属模块路径。
 * @param {string} relPath - 相对仓库根的 POSIX 路径。
 * @param {number} [maxDepth] - 目录层级上限。
 * @returns {string} 模块路径（根目录文件为 '.'）。
 */
export function moduleOf(relPath, maxDepth = MODULE_MAX_DEPTH) {
  const segments = String(relPath).split('/').filter(Boolean)
  const dirs = segments.slice(0, -1)
  if (dirs.length === 0) return ROOT_MODULE
  return dirs.slice(0, maxDepth).join('/')
}

/**
 * 模块路径 → 父模块路径（根模块返回空串，表示无父）。
 * @param {string} modulePath - 模块路径。
 * @returns {string} 父模块路径；根模块返回 ''。
 */
export function parentModule(modulePath) {
  if (modulePath === ROOT_MODULE) return ''
  const cut = modulePath.lastIndexOf('/')
  return cut === -1 ? ROOT_MODULE : modulePath.slice(0, cut)
}

/**
 * 模块列表稳定排序：根模块最前，其余按路径字典序。
 * @template {{path:string}} T
 * @param {T[]} modules - 模块条目。
 * @returns {T[]} 排序后的同一数组副本。
 */
export function sortModules(modules) {
  return [...modules].sort((a, b) => {
    if (a.path === ROOT_MODULE) return -1
    if (b.path === ROOT_MODULE) return 1
    return a.path.localeCompare(b.path)
  })
}

/**
 * 模块间依赖边上限（喂给 Wiki 主题合成 prompt 的摘要行数）。
 */
export const MAX_MODULE_RELATIONS = 15

/**
 * 汇总跨模块 import 边（模块 → 模块计数），供 Wiki 主题合成 prompt 使用。
 * 同模块内的边与无法归属的端点被忽略；按边数降序、再按路径排序，
 * 截断到 MAX_MODULE_RELATIONS 条，保证 prompt 与产物可复现。
 * @param {Array<{path:string, module?:string}>} files - 索引文件条目。
 * @param {Array<{from:string, to:string}>} edges - 依赖边。
 * @param {number} [limit] - 最大条目数。
 * @returns {Array<{from:string, to:string, count:number}>} 模块依赖摘要。
 */
export function summarizeModuleRelations(files, edges, limit = MAX_MODULE_RELATIONS) {
  const moduleByPath = new Map()
  for (const file of files ?? []) {
    if (typeof file?.path !== 'string' || file.path.length === 0) continue
    moduleByPath.set(file.path, file.module ?? moduleOf(file.path))
  }
  const counts = new Map()
  for (const edge of edges ?? []) {
    if (typeof edge?.from !== 'string' || typeof edge?.to !== 'string') continue
    const from = moduleByPath.get(edge.from) ?? moduleOf(edge.from)
    const to = moduleByPath.get(edge.to) ?? moduleOf(edge.to)
    if (!from || !to || from === to) continue
    const key = `${from}\u0000${to}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split('\u0000')
      return { from, to, count }
    })
    .sort((a, b) => (b.count - a.count)
      || a.from.localeCompare(b.from)
      || a.to.localeCompare(b.to))
    .slice(0, limit)
}

/**
 * 汇总索引文件为模块列表。
 * @param {Array<{path:string, symbols?:Array}>} files - 索引文件条目。
 * @param {number} [maxDepth] - 目录层级上限。
 * @returns {Array<{path:string, parent:string, files:number, symbols:number}>}
 *   模块列表（含祖先占位模块，按路径排序，'.' 最前）。
 */
export function buildModules(files, maxDepth = MODULE_MAX_DEPTH) {
  const byPath = new Map()
  /**
   * 确保模块条目存在（祖先也补齐，供 UI 渲染树）。
   * @param {string} modulePath - 模块路径。
   * @returns {ModuleEntry} 模块条目。
   */
  const ensure = (modulePath) => {
    let entry = byPath.get(modulePath)
    if (!entry) {
      entry = { path: modulePath, parent: parentModule(modulePath), files: 0, symbols: 0 }
      byPath.set(modulePath, entry)
    }
    return entry
  }

  ensure(ROOT_MODULE)
  for (const file of files) {
    if (typeof file?.path !== 'string' || file.path.length === 0) continue
    const modulePath = moduleOf(file.path, maxDepth)
    let cursor = modulePath
    while (cursor) {
      ensure(cursor)
      cursor = parentModule(cursor)
    }
    const entry = ensure(modulePath)
    entry.files += 1
    entry.symbols += Array.isArray(file.symbols) ? file.symbols.length : 0
  }

  return sortModules([...byPath.values()])
}
