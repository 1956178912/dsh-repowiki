// @ts-check
/**
 * 符号级反向引用（import 级，纯函数）。
 *
 * index.json 的 edges 记录了"引用方文件 → 被引用文件 + 具名导入符号"。
 * 本模块把边反转成 `目标文件 → 符号名 → 引用方文件列表`，供
 * `repowiki-cards` 回答"这个符号被哪些文件引用"。
 *
 * 语义边界：这是 import/use/require 级引用，不是调用图或类型使用分析；
 * 未经 import 的同文件使用、反射/动态加载不会出现在结果中（不猜测）。
 * 命名空间导入（`import * as ns`）与 `export * from` 记为 `*` 通配符：
 * 它们可能引用目标文件的任意符号，因此按"潜在引用"合并到每个符号，
 * 但不声称具体使用了哪一个。
 */

import {
  barrelFiles, buildReexportMaps, exportedNamesByFile, reexportTargets, resolveReexportOrigins,
} from './reexports.js'

/** 单次检索返回的反向引用条目上限（与其它有界输出一致）。 */
export const MAX_REFERENCE_ENTRIES = 100

/**
 * 索引边（结构见 src/indexer.js 的 edges 输出；v5 起带 line）。
 * @typedef {{from:string, to:string, kind?:string, line?:number, symbols?:string[],
 *   aliases?:Array<{from:string, to:string}>}} IndexEdge
 */

/**
 * 一处引用位置：引用方文件与（可选）import 行号。
 * @typedef {{path:string, line?:number}} ReferenceSite
 */

/**
 * 单条反向引用结果。
 * @typedef {{path:string, symbol:string, referencedBy:ReferenceSite[]}} ReferenceEntry
 */

/**
 * 引用位置排序：先按路径，再按行号（无行号视为 0）。
 * @param {ReferenceSite} a - 位置 A。
 * @param {ReferenceSite} b - 位置 B。
 * @returns {number} 排序值。
 */
function compareSite(a, b) {
  return a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0)
}

/**
 * 构建反向引用索引。
 * @param {IndexEdge[]} [edges] - 索引中的依赖边。
 * @param {Array<{path?:string, symbols?:Array<{name?:string, exported?:boolean}>}>} [files]
 *   索引文件条目；提供时沿 `export * from`/具名再导出链把引用归到真实
 *   定义文件（缺省保持只按直接边记账）。
 * @returns {Map<string, Map<string, ReferenceSite[]>>}
 *   目标文件 → 符号名 → 已排序引用位置（同一文件同一行只记一次）。
 */
export function buildReferenceIndex(edges = [], files = []) {
  /** @type {Map<string, Map<string, Map<string, ReferenceSite>>>} */
  const byTarget = new Map()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.from === edge.to) continue // 自引用不产生反向引用
    const names = (Array.isArray(edge.symbols) ? edge.symbols : [])
      .filter(name => typeof name === 'string' && name.length > 0)
    if (names.length === 0) continue // 副作用导入没有符号级引用信息
    const line = Number.isInteger(edge.line) && edge.line > 0 ? edge.line : undefined
    /** @type {ReferenceSite} */
    const site = { path: edge.from, ...(line ? { line } : {}) }
    const siteKey = `${edge.from}\u0000${line ?? 0}`
    let byName = byTarget.get(edge.to)
    if (!byName) {
      byName = new Map()
      byTarget.set(edge.to, byName)
    }
    for (const name of names) {
      let refs = byName.get(name)
      if (!refs) {
        refs = new Map()
        byName.set(name, refs)
      }
      refs.set(siteKey, site)
    }
  }
  // barrel 再导出链：把 `import { x } from './barrel'` 的引用归到真实定义文件
  if (files.length > 0) {
    const definitions = exportedNamesByFile(files)
    const maps = buildReexportMaps(edges, files)
    const barrels = new Set(barrelFiles(maps))
    if (barrels.size > 0) {
      /** @type {Map<string, IndexEdge[]>} */
      const byBarrel = new Map()
      for (const edge of edges) {
        if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
        if (edge.from === edge.to || !barrels.has(edge.to)) continue
        const list = byBarrel.get(edge.to)
        if (list) list.push(edge)
        else byBarrel.set(edge.to, [edge])
      }
      /**
       * 写入一条引用位置（同文件同行只保留一次）。
       * @param {string} target - 目标文件。
       * @param {string} name - 符号名（`*` 表示潜在引用）。
       * @param {ReferenceSite} site - 引用位置。
       * @returns {void}
       */
      const addSite = (target, name, site) => {
        let byName = byTarget.get(target)
        if (!byName) {
          byName = new Map()
          byTarget.set(target, byName)
        }
        let refs = byName.get(name)
        if (!refs) {
          refs = new Map()
          byName.set(name, refs)
        }
        refs.set(`${site.path}\u0000${site.line ?? 0}`, site)
      }
      for (const barrel of [...barrels].sort()) {
        for (const edge of byBarrel.get(barrel) ?? []) {
          const names = (Array.isArray(edge.symbols) ? edge.symbols : [])
            .filter(name => typeof name === 'string' && name.length > 0)
          if (names.length === 0) continue
          const line = Number.isInteger(edge.line) && edge.line > 0 ? edge.line : undefined
          /** @type {ReferenceSite} */
          const site = { path: edge.from, ...(line ? { line } : {}) }
          if (names.includes('*')) {
            // 通配导入/再导出：barrel 下游文件的任意符号都可能被使用
            for (const target of reexportTargets(barrel, maps)) addSite(target, '*', site)
            continue
          }
          for (const name of new Set(names)) {
            // barrel 自身导出同名符号时引用属于 barrel，不再下传
            if (definitions.get(barrel)?.has(name)) continue
            const origins = resolveReexportOrigins(barrel, name, maps, definitions)
            if (origins.length !== 1) continue
            addSite(origins[0].path, origins[0].name, site)
          }
        }
      }
    }
  }
  // Map → 排序数组，保证输出稳定（index.json 的 edges 顺序可能随遍历变化）
  /** @type {Map<string, Map<string, ReferenceSite[]>>} */
  const out = new Map()
  for (const [target, byName] of byTarget) {
    const sorted = new Map()
    for (const [name, refs] of byName) sorted.set(name, [...refs.values()].sort(compareSite))
    out.set(target, sorted)
  }
  return out
}

/** 单次检索返回的出边条目上限（与反向引用一致）。 */
export const MAX_IMPORT_ENTRIES = 100

/** 出边展开的最大跳数（传递依赖上限）。 */
export const MAX_IMPORT_DEPTH = 3

/**
 * 一处出边：被引用文件、语句行号、具名符号与跳数（1 = 直接依赖）。
 * @typedef {{path:string, line?:number, symbols:string[], depth:number}} ImportEntry
 */

/**
 * 为检索命中的文件收集其 import 出边（"这个文件依赖谁"）。
 * `depth > 1` 时按 BFS 展开传递依赖（上限 MAX_IMPORT_DEPTH 跳）：同一
 * 目标只保留首次到达（最小跳数），命中文件本身不作为依赖返回。副作用
 * 导入（无具名符号）同样保留，因为出边语义关注"文件之间的关系"而非
 * 符号绑定。
 * @param {IndexEdge[]} [edges] - 索引中的依赖边。
 * @param {Array<{path:string}>} [matches] - searchIndex 的命中文件。
 * @param {number} [limit] - 返回条目上限（默认 MAX_IMPORT_ENTRIES）。
 * @param {number} [depth] - 展开跳数（1–MAX_IMPORT_DEPTH，默认 1）。
 * @returns {{imports: ImportEntry[], truncated: boolean}} 出边与截断标记。
 */
export function importsFor(edges = [], matches = [], limit = MAX_IMPORT_ENTRIES, depth = 1) {
  const maxDepth = Number.isInteger(depth)
    ? Math.min(MAX_IMPORT_DEPTH, Math.max(1, depth))
    : 1
  /** @type {Map<string, IndexEdge[]>} */
  const byFrom = new Map()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.from === edge.to) continue
    const list = byFrom.get(edge.from)
    if (list) list.push(edge)
    else byFrom.set(edge.from, [edge])
  }
  /** @type {ImportEntry[]} */
  const imports = []
  /** 已记录/已作为起点的文件：避免把命中文件自身列为依赖，并保证去重。 */
  const seen = new Set(matches.map(match => match.path))
  /** @type {Array<{path:string, depth:number}>} */
  const queue = matches.map(match => ({ path: match.path, depth: 0 }))
  let truncated = false
  let head = 0
  while (head < queue.length && !truncated) {
    const { path: current, depth: currentDepth } = queue[head++]
    if (currentDepth >= maxDepth) continue
    for (const edge of byFrom.get(current) ?? []) {
      if (seen.has(edge.to)) continue
      if (imports.length >= limit) {
        truncated = true
        break
      }
      seen.add(edge.to)
      const symbols = (Array.isArray(edge.symbols) ? edge.symbols : [])
        .filter(name => typeof name === 'string' && name.length > 0)
      imports.push({
        path: edge.to,
        ...(Number.isInteger(edge.line) && edge.line > 0 ? { line: edge.line } : {}),
        symbols,
        depth: currentDepth + 1,
      })
      queue.push({ path: edge.to, depth: currentDepth + 1 })
    }
  }
  return { imports, truncated }
}

/**
 * 为检索命中的文件收集依赖方（"谁依赖我"）。
 * `depth > 1` 时按反向 BFS 展开传递影响面（上限 MAX_IMPORT_DEPTH 跳）：
 * 同一文件只保留首次到达（最小跳数），命中文件本身不作为依赖方返回。
 * 与 `importsFor` 方向相反、去重与有界策略一致；无具名符号的副作用导入
 * 同样计入，因为影响面关注"文件之间的关系"。
 * @param {IndexEdge[]} [edges] - 索引中的依赖边。
 * @param {Array<{path:string}>} [matches] - searchIndex 的命中文件。
 * @param {number} [limit] - 返回条目上限（默认 MAX_IMPORT_ENTRIES）。
 * @param {number} [depth] - 展开跳数（1–MAX_IMPORT_DEPTH，默认 1）。
 * @returns {{dependents: ImportEntry[], truncated: boolean}} 依赖方与截断标记。
 */
export function dependentsFor(edges = [], matches = [], limit = MAX_IMPORT_ENTRIES, depth = 1) {
  const maxDepth = Number.isInteger(depth)
    ? Math.min(MAX_IMPORT_DEPTH, Math.max(1, depth))
    : 1
  /** @type {Map<string, IndexEdge[]>} */
  const byTo = new Map()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.from === edge.to) continue
    const list = byTo.get(edge.to)
    if (list) list.push(edge)
    else byTo.set(edge.to, [edge])
  }
  /** @type {ImportEntry[]} */
  const dependents = []
  /** 已记录/已作为起点的文件：避免把命中文件自身列为依赖方，并保证去重。 */
  const seen = new Set(matches.map(match => match.path))
  /** @type {Array<{path:string, depth:number}>} */
  const queue = matches.map(match => ({ path: match.path, depth: 0 }))
  let truncated = false
  let head = 0
  while (head < queue.length && !truncated) {
    const { path: current, depth: currentDepth } = queue[head++]
    if (currentDepth >= maxDepth) continue
    for (const edge of byTo.get(current) ?? []) {
      if (seen.has(edge.from)) continue
      if (dependents.length >= limit) {
        truncated = true
        break
      }
      seen.add(edge.from)
      const symbols = (Array.isArray(edge.symbols) ? edge.symbols : [])
        .filter(name => typeof name === 'string' && name.length > 0)
      dependents.push({
        path: edge.from,
        ...(Number.isInteger(edge.line) && edge.line > 0 ? { line: edge.line } : {}),
        symbols,
        depth: currentDepth + 1,
      })
      queue.push({ path: edge.from, depth: currentDepth + 1 })
    }
  }
  return { dependents, truncated }
}

/**
 * 状态工具展示的文件级 hub 数量上限。
 */
export const MAX_HUB_ENTRIES = 10

/**
 * 文件级 fan-in 排名：被最多文件 import 的目标文件（架构 hub）。
 * 同一文件多处 import 同一目标只计一次，自引用忽略；并列时按路径升序，
 * 保证输出稳定。这是"改哪个文件最危险"的静态信号，不含调用图信息。
 * @param {IndexEdge[]} [edges] - 索引中的依赖边。
 * @param {number} [limit] - 返回条目上限（默认 MAX_HUB_ENTRIES）。
 * @returns {Array<{path:string, dependents:number}>} 按依赖方数量降序排序。
 */
export function topDependents(edges = [], limit = MAX_HUB_ENTRIES) {
  /** @type {Map<string, Set<string>>} */
  const byTo = new Map()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.from === edge.to) continue
    let set = byTo.get(edge.to)
    if (!set) {
      set = new Set()
      byTo.set(edge.to, set)
    }
    set.add(edge.from)
  }
  return [...byTo.entries()]
    .map(([path, froms]) => ({ path, dependents: froms.size }))
    .sort((a, b) => b.dependents - a.dependents || a.path.localeCompare(b.path))
    .slice(0, Math.max(1, Math.floor(limit)))
}

/**
 * 为检索命中的符号收集反向引用。
 * @param {Map<string, Map<string, ReferenceSite[]>>} referenceIndex - buildReferenceIndex 的结果。
 * @param {Array<{path:string, symbols?:Array<{name:string}>}>} matches - searchIndex 的命中文件。
 * @param {number} [limit] - 返回条目上限（默认 MAX_REFERENCE_ENTRIES）。
 * @returns {{references: ReferenceEntry[], truncated: boolean}} 反向引用与截断标记。
 */
export function referencesFor(referenceIndex, matches = [], limit = MAX_REFERENCE_ENTRIES) {
  /** @type {ReferenceEntry[]} */
  const references = []
  let truncated = false
  for (const match of matches) {
    if (truncated) break
    const byName = referenceIndex.get(match.path)
    if (!byName) continue
    // `*` 边代表命名空间导入/`export *`：目标文件里的任意符号都可能被使用，
    // 按潜在引用合并；具体使用点由 repowiki-cards usages=true 的词法扫描确认。
    const wildcard = byName.get('*')
    for (const symbol of match.symbols ?? []) {
      if (typeof symbol?.name !== 'string') continue
      const direct = byName.get(symbol.name)
      if ((!direct || direct.length === 0) && (!wildcard || wildcard.length === 0)) continue
      /** @type {Map<string, ReferenceSite>} */
      const sites = new Map()
      for (const site of [...(direct ?? []), ...(wildcard ?? [])]) {
        sites.set(`${site.path}\u0000${site.line ?? 0}`, site)
      }
      const referencedBy = [...sites.values()]
        .sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0))
      if (references.length >= limit) {
        truncated = true
        break
      }
      references.push({ path: match.path, symbol: symbol.name, referencedBy })
    }
  }
  return { references, truncated }
}
