// @ts-check
/**
 * 模块耦合与不稳定性（纯函数）。
 *
 * 在模块级 import 图上计算 Martin 指标：
 * - Ca（afferent）：有多少个其他模块依赖本模块；
 * - Ce（efferent）：本模块依赖多少个其他模块；
 * - instability = Ce / (Ca + Ce)，0 表示稳定（被依赖多、依赖少），
 *   1 表示不稳定（依赖多、被依赖少）。
 *
 * 只统计跨模块边；同模块内部引用、未知模块与自引用不计。指标是静态
 * import 图的描述性统计，不是运行时调用关系，也不评价模块好坏。
 */

/** 返回的模块数上限。 */
export const MAX_COUPLING_MODULES = 10

/**
 * 索引文件条目（本模块只读取 path 与 module）。
 * @typedef {{path:string, module?:string}} CouplingFile
 */

/**
 * 索引边（本模块只读取 from/to）。
 * @typedef {{from:string, to:string}} CouplingEdge
 */

/**
 * 计算模块级 Ca/Ce/不稳定性排行。
 * @param {CouplingFile[]} [files] - 索引文件（需带 module 字段）。
 * @param {CouplingEdge[]} [edges] - 依赖边。
 * @param {{limit?:number, minCoupling?:number}} [options] - 返回上限与最小
 *   Ca+Ce 门槛（默认 1，即排除完全孤立的模块）。
 * @returns {{modules:Array<{module:string, ca:number, ce:number, instability:number}>,
 *   truncated:boolean}} 按不稳定性降序（同分按耦合总量、模块名）。
 */
export function moduleCoupling(files = [], edges = [], options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0
    ? Math.min(MAX_COUPLING_MODULES * 10, Math.floor(options.limit))
    : MAX_COUPLING_MODULES
  const minCoupling = Number.isInteger(options.minCoupling) && options.minCoupling > 0
    ? Math.floor(options.minCoupling)
    : 1
  /** @type {Map<string, string>} */
  const moduleOf = new Map()
  for (const file of files) {
    if (!file || typeof file.path !== 'string') continue
    if (typeof file.module === 'string' && file.module) moduleOf.set(file.path, file.module)
  }
  /** @type {Map<string, Set<string>>} */
  const outgoing = new Map()
  /** @type {Map<string, Set<string>>} */
  const incoming = new Map()
  /** @param {Map<string, Set<string>>} map @param {string} key @param {string} value */
  const add = (map, key, value) => {
    let set = map.get(key)
    if (!set) {
      set = new Set()
      map.set(key, set)
    }
    set.add(value)
  }
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.from === edge.to) continue
    const fromModule = moduleOf.get(edge.from)
    const toModule = moduleOf.get(edge.to)
    if (!fromModule || !toModule || fromModule === toModule) continue
    add(outgoing, fromModule, toModule)
    add(incoming, toModule, fromModule)
  }
  const modules = new Set([...outgoing.keys(), ...incoming.keys()])
  const entries = [...modules]
    .map(module => {
      const ce = outgoing.get(module)?.size ?? 0
      const ca = incoming.get(module)?.size ?? 0
      const total = ca + ce
      return {
        module,
        ca,
        ce,
        instability: total > 0 ? Math.round((ce / total) * 1000) / 1000 : 0,
        total,
      }
    })
    .filter(entry => entry.total >= minCoupling)
    .sort((a, b) => b.instability - a.instability
      || b.total - a.total
      || a.module.localeCompare(b.module))
  return {
    modules: entries.slice(0, limit).map(entry => ({
      module: entry.module,
      ca: entry.ca,
      ce: entry.ce,
      instability: entry.instability,
    })),
    truncated: entries.length > limit,
  }
}
