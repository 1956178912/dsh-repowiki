// @ts-check
/**
 * ES 模块再导出链解析（纯函数）。
 *
 * 只处理能由索引边证明的形态：`export * from './x'` 与同名
 * `export { x } from './x'`。别名再导出在 deps 中记录的是原名，无法
 * 从边数据恢复导出名，因此不猜测（保守漏报）；barrel 自身导出的同名
 * 符号会遮蔽星号来源；多个来源同时导出同名符号按 ES 的歧义星号语义
 * 视为不可导入，返回空。
 */

/** 再导出链的最大跳数（防止异常图把查询拖成长链）。 */
export const MAX_BARREL_DEPTH = 4

/**
 * 索引边子集（与 references/usages 共用）。
 * @typedef {{from:string, to:string, kind?:string, line?:number, symbols?:string[]}} ReexportEdge
 */

/**
 * 从索引文件条目建立"导出符号"集合：`exported === false` 的符号不算，
 * 缺符号信息的文件不登记（保守，不猜测）。
 * @param {Array<{path?:string, symbols?:Array<{name?:string, exported?:boolean}>}>} files - 索引文件。
 * @returns {Map<string, Set<string>>} 文件 → 导出符号名。
 */
export function exportedNamesByFile(files = []) {
  /** @type {Map<string, Set<string>>} */
  const definitions = new Map()
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || !Array.isArray(file.symbols)) continue
    const names = new Set()
    for (const symbol of file.symbols) {
      if (!symbol || typeof symbol.name !== 'string' || symbol.name === '') continue
      if (symbol.exported === false) continue
      names.add(symbol.name)
    }
    if (names.size > 0) definitions.set(file.path, names)
  }
  return definitions
}

/**
 * 汇总 JS/TS 再导出边：`export * from` 与同名 `export { x } from`。
 * @param {ReexportEdge[]} edges - 索引边。
 * @returns {{stars:Map<string, string[]>, named:Map<string, Map<string, Set<string>>>}}
 *   barrel → 星号目标列表；barrel → 符号名 → 具名再导出目标。
 */
export function buildReexportMaps(edges = []) {
  /** @type {Map<string, string[]>} */
  const stars = new Map()
  /** @type {Map<string, Map<string, Set<string>>>} */
  const named = new Map()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.from === edge.to || edge.kind !== 'export-from') continue
    const names = (Array.isArray(edge.symbols) ? edge.symbols : [])
      .filter(name => typeof name === 'string' && name.length > 0)
    if (names.length === 0) continue
    if (names.includes('*')) {
      const targets = stars.get(edge.from)
      if (targets) {
        if (!targets.includes(edge.to)) targets.push(edge.to)
      } else stars.set(edge.from, [edge.to])
      continue
    }
    let byName = named.get(edge.from)
    if (!byName) {
      byName = new Map()
      named.set(edge.from, byName)
    }
    for (const name of names) {
      let targets = byName.get(name)
      if (!targets) {
        targets = new Set()
        byName.set(name, targets)
      }
      targets.add(edge.to)
    }
  }
  return { stars, named }
}

/**
 * 沿再导出链解析符号来源：barrel 自身定义该符号时不返回（本地导出遮蔽
 * 星号再导出，调用方不应把引用记到下游）；具名再导出优先于星号；多个
 * 来源视为歧义，返回空。
 * @param {string} barrel - 起始 barrel 文件。
 * @param {string} name - 符号名。
 * @param {{stars:Map<string, string[]>, named:Map<string, Map<string, Set<string>>>}} maps
 *   再导出映射。
 * @param {Map<string, Set<string>>} definitions - 文件 → 导出符号。
 * @returns {string[]} 唯一来源文件（升序，0 或 1 项）。
 */
export function resolveReexportOrigins(barrel, name, maps, definitions) {
  /** @type {Array<{path:string, depth:number}>} */
  const queue = [{ path: barrel, depth: 0 }]
  const visited = new Set([barrel])
  const origins = new Set()
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]
    if (definitions.get(current.path)?.has(name)) {
      origins.add(current.path)
      continue
    }
    if (current.depth >= MAX_BARREL_DEPTH) continue
    const namedTargets = maps.named.get(current.path)?.get(name)
    const targets = namedTargets ? [...namedTargets] : (maps.stars.get(current.path) ?? [])
    for (const target of targets) {
      if (visited.has(target)) continue
      visited.add(target)
      queue.push({ path: target, depth: current.depth + 1 })
    }
  }
  return origins.size === 1 ? [...origins] : []
}

/**
 * 收集 barrel 可再导出的全部下游文件（星号 + 具名），供通配引用使用。
 * @param {string} barrel - 起始 barrel 文件。
 * @param {{stars:Map<string, string[]>, named:Map<string, Map<string, Set<string>>>}} maps
 *   再导出映射。
 * @returns {string[]} 下游文件（不含自身，去重升序）。
 */
export function reexportTargets(barrel, maps) {
  const out = new Set()
  /** @type {Array<{path:string, depth:number}>} */
  const queue = [{ path: barrel, depth: 0 }]
  const visited = new Set([barrel])
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]
    if (current.depth >= MAX_BARREL_DEPTH) continue
    const targets = [
      ...(maps.stars.get(current.path) ?? []),
      ...[...(maps.named.get(current.path)?.values() ?? [])].flatMap(set => [...set]),
    ]
    for (const target of targets) {
      if (visited.has(target)) continue
      visited.add(target)
      out.add(target)
      queue.push({ path: target, depth: current.depth + 1 })
    }
  }
  return [...out].sort()
}

/**
 * 列出参与再导出的 barrel 文件。
 * @param {{stars:Map<string, string[]>, named:Map<string, Map<string, Set<string>>>}} maps
 *   再导出映射。
 * @returns {string[]} barrel 路径（升序）。
 */
export function barrelFiles(maps) {
  return [...new Set([...maps.stars.keys(), ...maps.named.keys()])].sort()
}

/**
 * 找出经由 barrel 再导出 `targetPath#name` 的导入边。默认跳过再导出边
 * 本身（它只说明符号继续下传，不构成使用证据）；影响面分析可开启
 * `includeReexports` 把中间 barrel 也视为直接受影响文件。
 * @param {ReexportEdge[]} edges - 索引边。
 * @param {Array<{path?:string, symbols?:Array<{name?:string, exported?:boolean}>}>} files - 索引文件。
 * @param {string} targetPath - 符号定义文件。
 * @param {string} name - 符号名。
 * @param {{includeReexports?:boolean}} [options] - 是否包含再导出边。
 * @returns {Array<{path:string, line?:number}>} 导入方位置（按路径、行号排序）。
 */
export function reexportImportSites(edges, files, targetPath, name, options = {}) {
  const maps = buildReexportMaps(edges)
  const definitions = exportedNamesByFile(files)
  /** @type {Array<{path:string, line?:number}>} */
  const sites = []
  for (const barrel of barrelFiles(maps)) {
    if (barrel === targetPath) continue
    const origins = resolveReexportOrigins(barrel, name, maps, definitions)
    if (origins.length !== 1 || origins[0] !== targetPath) continue
    for (const edge of edges) {
      if (!edge || edge.to !== barrel || edge.from === targetPath) continue
      if (!options.includeReexports && edge.kind === 'export-from') continue
      const names = Array.isArray(edge.symbols) ? edge.symbols : []
      if (!names.includes(name) && !names.includes('*')) continue
      sites.push({
        path: edge.from,
        ...(Number.isInteger(edge.line) && edge.line > 0 ? { line: edge.line } : {}),
      })
    }
  }
  return sites.sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0))
}
