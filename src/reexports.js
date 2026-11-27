// @ts-check
/**
 * 再导出链解析（纯函数）。
 *
 * 支持三类能由索引边证明的形态：
 * - ES 模块：`export * from './x'` 与同名 `export { x } from './x'`；
 * - Python 包 barrel：`from .core import parse` 会把 `parse` 绑定进当前
 *   模块的命名空间，因此 `from pkg import parse` 可沿 `__init__.py` 归到
 *   `core.py`；
 * - Dart part：`part 'x.dart'` 把 part 文件并入当前库，主库对外导出
 *   part 内的全部声明（等价于星号再导出，`part` 边本身不声称符号引用）。
 *
 * 别名再导出在 deps 中记录的是原名，无法从边数据恢复导出名，因此不猜测
 * （保守漏报）；barrel 自身导出的同名符号会遮蔽星号来源；多个来源同时
 * 导出同名符号按歧义处理，返回空。
 */

/** 再导出链的最大跳数（防止异常图把查询拖成长链）。 */
export const MAX_BARREL_DEPTH = 4

/**
 * 索引边子集（与 references/usages 共用）。
 * @typedef {{from:string, to:string, kind?:string, line?:number, symbols?:string[],
 *   aliases?:Array<{from:string, to:string}>}} ReexportEdge
 */

/**
 * 从索引文件条目建立"可被再导出解析"的符号集合：
 * - 一般语言要求 `exported !== false`；
 * - Python 没有 export 关键字（提取器统一记 `exported: false`），模块级
 *   函数/类均可被具名导入，因此按“非 method”纳入；
 * 缺符号信息的文件不登记（保守，不猜测）。
 * @param {Array<{path?:string, lang?:string, symbols?:Array<{name?:string, kind?:string, exported?:boolean}>}>} files
 *   索引文件。
 * @returns {Map<string, Set<string>>} 文件 → 可再导出符号名。
 */
export function exportedNamesByFile(files = []) {
  /** @type {Map<string, Set<string>>} */
  const definitions = new Map()
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || !Array.isArray(file.symbols)) continue
    const python = file.lang === 'python'
    const names = new Set()
    for (const symbol of file.symbols) {
      if (!symbol || typeof symbol.name !== 'string' || symbol.name === '') continue
      if (python ? symbol.kind === 'method' : symbol.exported === false) continue
      names.add(symbol.name)
    }
    if (names.size > 0) definitions.set(file.path, names)
  }
  return definitions
}

/**
 * Python 星号导入可见的名字：`__all__` 排除项与下划线开头符号不可见；
 * 其他语言不建表（星号再导出沿用普通导出集合）。
 * @param {Array<{path?:string, lang?:string,
 *   symbols?:Array<{name?:string, kind?:string, starExported?:boolean}>}>} [files]
 *   索引文件。
 * @returns {Map<string, Set<string>>} Python 文件 → 星号可见名。
 */
export function starExportedNamesByFile(files = []) {
  /** @type {Map<string, Set<string>>} */
  const out = new Map()
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || file.lang !== 'python') continue
    const names = new Set()
    for (const symbol of Array.isArray(file.symbols) ? file.symbols : []) {
      if (!symbol || typeof symbol.name !== 'string' || symbol.name === '') continue
      if (symbol.kind === 'method' || symbol.starExported === false || symbol.name.startsWith('_')) continue
      names.add(symbol.name)
    }
    out.set(file.path, names)
  }
  return out
}

/**
 * 汇总再导出边：
 * - JS/TS：`export * from`、同名 `export { x } from` 与别名
 *   `export { x as y } from`；
 * - Python：具名 `from .x import y`（y 进入当前模块命名空间，等价于
 *   同名再导出；`as` 别名记为导出名）；
 * - Rust：`pub use`（别名同样记录）；
 * - Dart：`part 'x.dart'`（part 文件声明并入主库，按星号再导出登记）。
 * @param {ReexportEdge[]} edges - 索引边。
 * @param {Array<{path?:string, lang?:string,
 *   symbols?:Array<{name?:string, default?:boolean}>}>} [files] - 索引文件
 *   （用于识别 Python barrel 与具名默认导出；缺省时只处理显式再导出）。
 * @returns {{stars:Map<string, string[]>,
 *   named:Map<string, Map<string, Set<string>>>,
 *   aliases:Map<string, Map<string, Array<{target:string, local:string}>>>,
 *   defaults:Map<string, string>, starDefinitions:Map<string, Set<string>>}}
 *   barrel → 星号目标；barrel → 同名导出 → 目标；barrel → 别名导出 →
 *   {目标文件, 目标原名}；文件 → 具名默认导出符号；Python 文件 →
 *   星号可见名。
 */
export function buildReexportMaps(edges = [], files = []) {
  /** @type {Map<string, string[]>} */
  const stars = new Map()
  /** @type {Map<string, Map<string, Set<string>>>} */
  const named = new Map()
  /** @type {Map<string, Map<string, Array<{target:string, local:string}>>>} */
  const aliases = new Map()
  /**
   * 登记别名导出（同目标同原名只保留一项）。
   * @param {string} barrel - 再导出方。
   * @param {string} exported - 导出名。
   * @param {string} target - 目标文件。
   * @param {string} local - 目标原名。
   * @returns {void}
   */
  const addAlias = (barrel, exported, target, local) => {
    let byName = aliases.get(barrel)
    if (!byName) {
      byName = new Map()
      aliases.set(barrel, byName)
    }
    const list = byName.get(exported) ?? []
    if (!list.some(item => item.target === target && item.local === local)) {
      list.push({ target, local })
      byName.set(exported, list)
    }
  }
  /** @type {Map<string, string>} */
  const defaults = new Map()
  const pythonFiles = new Set()
  for (const file of files) {
    if (!file || typeof file.path !== 'string') continue
    if (file.lang === 'python') pythonFiles.add(file.path)
    const def = (Array.isArray(file.symbols) ? file.symbols : [])
      .find(symbol => symbol && symbol.default === true && typeof symbol.name === 'string' && symbol.name)
    if (def) defaults.set(file.path, def.name)
  }
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.from === edge.to) continue
    // Dart `part 'x.dart'`：主库文件持有 part 文件的全部声明，等价星号
    // 再导出（part 边不声称符号引用，因此不看 symbols）。
    if (edge.kind === 'part') {
      const targets = stars.get(edge.from)
      if (targets) {
        if (!targets.includes(edge.to)) targets.push(edge.to)
      } else stars.set(edge.from, [edge.to])
      continue
    }
    // 显式再导出：JS `export-from` 与 Rust `pub use`（kind reexport）
    const explicitReexport = edge.kind === 'export-from' || edge.kind === 'reexport'
    const pythonBarrel = !explicitReexport && pythonFiles.has(edge.from)
    if (!explicitReexport && !pythonBarrel) continue
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
    const aliasByLocal = new Map()
    for (const alias of Array.isArray(edge.aliases) ? edge.aliases : []) {
      if (!alias || typeof alias.from !== 'string' || typeof alias.to !== 'string') continue
      if (!alias.from || !alias.to) continue
      aliasByLocal.set(alias.from, alias.to)
    }
    for (const name of names) {
      if (name === '*') continue
      const exported = aliasByLocal.get(name)
      if (exported && exported !== name) {
        addAlias(edge.from, exported, edge.to, name)
        continue
      }
      let byName = named.get(edge.from)
      if (!byName) {
        byName = new Map()
        named.set(edge.from, byName)
      }
      let targets = byName.get(name)
      if (!targets) {
        targets = new Set()
        byName.set(name, targets)
      }
      targets.add(edge.to)
    }
  }
  return {
    stars,
    named,
    aliases,
    defaults,
    starDefinitions: starExportedNamesByFile(files),
  }
}

/**
 * 沿再导出链解析符号来源：barrel 自身定义该符号时不返回（本地导出遮蔽
 * 星号再导出，调用方不应把引用记到下游）；具名/别名再导出优先于星号；
 * 多个来源视为歧义，返回空。
 * @param {string} barrel - 起始 barrel 文件。
 * @param {string} name - barrel 导出的符号名。
 * @param {{stars:Map<string, string[]>, named:Map<string, Map<string, Set<string>>>,
 *   aliases:Map<string, Map<string, Array<{target:string, local:string}>>>,
 *   defaults:Map<string, string>, starDefinitions?:Map<string, Set<string>>}} maps
 *   再导出映射。
 * @param {Map<string, Set<string>>} definitions - 文件 → 导出符号。
 * @returns {Array<{path:string, name:string}>} 唯一定义位置（0 或 1 项）。
 */
export function resolveReexportOrigins(barrel, name, maps, definitions) {
  /** @type {Array<{path:string, name:string, depth:number, star:boolean}>} */
  const queue = [{ path: barrel, name, depth: 0, star: false }]
  const visited = new Set([`${barrel}\u0000${name}\u00000`])
  /** @type {Map<string, {path:string, name:string}>} */
  const origins = new Map()
  /**
   * 入队一个待解析位置。
   * @param {string} path - 文件。
   * @param {string} nextName - 该文件中的符号名。
   * @param {number} depth - 当前跳数。
   * @param {boolean} star - 是否经星号导入到达（Python 用 __all__ 收窄）。
   * @returns {void}
   */
  const push = (path, nextName, depth, star) => {
    const key = `${path}\u0000${nextName}\u0000${star ? 1 : 0}`
    if (visited.has(key)) return
    visited.add(key)
    queue.push({ path, name: nextName, depth, star })
  }
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]
    // `default` 不是符号名：映射到该文件具名默认导出（本地默认导出优先）
    if (current.name === 'default') {
      const localDefault = maps.defaults.get(current.path)
      if (localDefault) {
        origins.set(`${current.path}\u0000${localDefault}`, { path: current.path, name: localDefault })
        continue
      }
    }
    // 经星号到达时按 Python __all__/下划线规则收窄；其它情况用普通导出集
    const starNames = current.star ? maps.starDefinitions?.get(current.path) : null
    const visible = starNames
      ? starNames.has(current.name)
      : definitions.get(current.path)?.has(current.name)
    if (visible) {
      origins.set(`${current.path}\u0000${current.name}`, { path: current.path, name: current.name })
      continue
    }
    if (current.depth >= MAX_BARREL_DEPTH) continue
    for (const target of maps.named.get(current.path)?.get(current.name) ?? []) {
      push(target, current.name, current.depth + 1, false)
    }
    for (const alias of maps.aliases.get(current.path)?.get(current.name) ?? []) {
      push(alias.target, alias.local, current.depth + 1, false)
    }
    // ES 的 `export *` 不转发 default（Python 星号导入也无 default 概念）
    if (current.name !== 'default') {
      for (const target of maps.stars.get(current.path) ?? []) {
        push(target, current.name, current.depth + 1, true)
      }
    }
  }
  return origins.size === 1 ? [...origins.values()] : []
}

/**
 * 收集 barrel 可再导出的全部下游文件（星号/具名/别名），供通配引用使用。
 * @param {string} barrel - 起始 barrel 文件。
 * @param {{stars:Map<string, string[]>, named:Map<string, Map<string, Set<string>>>,
 *   aliases:Map<string, Map<string, Array<{target:string, local:string}>>>}} maps
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
      ...[...(maps.aliases.get(current.path)?.values() ?? [])].flatMap(list => list.map(item => item.target)),
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
 * @param {{stars:Map<string, string[]>, named:Map<string, Map<string, Set<string>>>,
 *   aliases:Map<string, Map<string, Array<{target:string, local:string}>>>}} maps
 *   再导出映射。
 * @returns {string[]} barrel 路径（升序）。
 */
export function barrelFiles(maps) {
  return [...new Set([...maps.stars.keys(), ...maps.named.keys(), ...maps.aliases.keys()])].sort()
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
 * @returns {Array<{path:string, line?:number, names?:string[]}>} 导入方位置
 *   （别名导入时带导入方实际使用的名字；按路径、行号排序）。
 */
export function reexportImportSites(edges, files, targetPath, name, options = {}) {
  const maps = buildReexportMaps(edges, files)
  const definitions = exportedNamesByFile(files)
  /** @type {Map<string, {path:string, line?:number, names:Set<string>}>} */
  const sites = new Map()
  for (const barrel of barrelFiles(maps)) {
    if (barrel === targetPath) continue
    // 候选导出名：定义名本身（同名/星号链）+ 该 barrel 的别名导出名
    const candidates = new Set([name])
    for (const exported of maps.named.get(barrel)?.keys() ?? []) candidates.add(exported)
    for (const exported of maps.aliases.get(barrel)?.keys() ?? []) candidates.add(exported)
    for (const exported of candidates) {
      const origins = resolveReexportOrigins(barrel, exported, maps, definitions)
      if (origins.length !== 1) continue
      const origin = origins[0]
      if (origin.path !== targetPath || origin.name !== name) continue
      for (const edge of edges) {
        if (!edge || edge.to !== barrel || edge.from === targetPath) continue
        if (!options.includeReexports && (edge.kind === 'export-from' || edge.kind === 'reexport')) continue
        const names = Array.isArray(edge.symbols) ? edge.symbols : []
        if (!names.includes(exported) && !names.includes('*')) continue
        const line = Number.isInteger(edge.line) && edge.line > 0 ? edge.line : undefined
        const key = `${edge.from}\u0000${line ?? 0}`
        const site = sites.get(key) ?? { path: edge.from, ...(line ? { line } : {}), names: new Set() }
        // 通配导入方按定义名扫描；别名导入方优先用它实际绑定的本地名
        if (!names.includes('*')) {
          const localAliases = (Array.isArray(edge.aliases) ? edge.aliases : [])
            .filter(alias => alias && alias.from === exported && typeof alias.to === 'string')
            .map(alias => alias.to)
          if (localAliases.length > 0) {
            for (const local of localAliases) site.names.add(local)
          } else if (exported !== name) {
            site.names.add(exported)
          }
        }
        sites.set(key, site)
      }
    }
  }
  return [...sites.values()]
    .map(site => ({
      path: site.path,
      ...(site.line ? { line: site.line } : {}),
      ...(site.names.size > 0 ? { names: [...site.names].sort() } : {}),
    }))
    .sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0))
}
