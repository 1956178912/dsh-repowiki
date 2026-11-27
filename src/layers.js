// @ts-check
/**
 * 架构分层规则（纯函数）。
 *
 * 项目在 repowiki-plan.json 里声明若干层（路径前缀）与每层允许依赖的层，
 * 索引完成后按 import 边检查跨层依赖：未在 `mayDependOn` 中列出的跨层
 * 边即为违规。同层依赖始终允许；不属于任何层的文件不参与判定。
 */

/** 单层违规明细上限（total 始终精确）。 */
export const MAX_LAYER_VIOLATIONS = 50

/**
 * 归一化层配置：丢弃无名/重名/无路径条目；路径去 `./`、尾斜杠并统一
 * 正斜杠；`mayDependOn` 只保留非空字符串。
 * @param {unknown} raw - plan 中的原始 layers 值。
 * @returns {Array<{name:string, paths:string[], mayDependOn:string[]}>} 归一化层。
 */
export function normalizeLayers(raw) {
  if (!Array.isArray(raw)) return []
  const layers = []
  const seen = new Set()
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const record = /** @type {Record<string, unknown>} */ (item)
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (name === '' || seen.has(name)) continue
    const paths = Array.isArray(record.paths)
      ? record.paths
        .filter(value => typeof value === 'string')
        .map(value => value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, ''))
        .filter(value => value !== '')
      : []
    if (paths.length === 0) continue
    const mayDependOn = Array.isArray(record.mayDependOn)
      ? record.mayDependOn
        .filter(value => typeof value === 'string' && value.trim() !== '')
        .map(value => value.trim())
      : []
    seen.add(name)
    layers.push({ name, paths, mayDependOn })
  }
  return layers
}

/**
 * 判断文件是否落在某路径前缀下（前缀本身或其后跟 `/`）。
 * @param {string} rel - 文件相对路径。
 * @param {string} prefix - 归一化前缀。
 * @returns {boolean} 是否命中。
 */
function underPrefix(rel, prefix) {
  return rel === prefix || rel.startsWith(prefix + '/')
}

/**
 * 计算文件所属层：命中最长路径前缀的层（更深、更具体的层优先）。
 * @param {Array<{name:string, paths:string[]}>} layers - 层配置。
 * @param {string} rel - 文件相对路径。
 * @returns {{layer:string, prefix:string}|null} 归属；未命中返回 null。
 */
function layerOf(layers, rel) {
  let best = null
  for (const layer of layers) {
    for (const prefix of layer.paths) {
      if (!underPrefix(rel, prefix)) continue
      if (!best || prefix.length > best.prefix.length) best = { layer: layer.name, prefix }
    }
  }
  return best
}

/**
 * 公开的层归属查询（最长前缀优先），供影响面等只读分析复用。
 * @param {Array<{name:string, paths:string[]}>} layers - 层配置。
 * @param {string} rel - 文件相对路径。
 * @returns {{layer:string, prefix:string}|null} 归属；未命中返回 null。
 */
export function assignLayer(layers, rel) {
  if (!Array.isArray(layers) || layers.length === 0) return null
  if (typeof rel !== 'string' || rel === '') return null
  return layerOf(layers, rel)
}

/**
 * 按分层规则检查依赖边。
 * @param {Array<{name:string, paths:string[], mayDependOn:string[]}>} layers - 归一化层配置。
 * @param {Array<{from:string, to:string, line?:number}>} edges - 索引依赖边。
 * @param {Array<string|{path:string}>} [files] - 索引文件（用于层文件统计）。
 * @param {{limit?:number}} [opts] - 明细上限。
 * @returns {{total:number, truncated:boolean, checkedEdges:number, unknownRefs:string[],
 *   violations:Array<{from:string, fromLayer:string, to:string, toLayer:string, line:number}>,
 *   pairs:Array<{from:string, to:string, count:number}>,
 *   layers:Array<{name:string, paths:string[], mayDependOn:string[], files:number}>}} 检查结果。
 */
export function evaluateLayers(layers, edges, files = [], opts = {}) {
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : MAX_LAYER_VIOLATIONS
  const layerByName = new Map(layers.map(layer => [layer.name, layer]))
  const names = new Set(layerByName.keys())
  /** @type {string[]} */
  const unknownRefs = []
  for (const layer of layers) {
    for (const dependency of layer.mayDependOn) {
      if (!names.has(dependency) && !unknownRefs.includes(dependency)) unknownRefs.push(dependency)
    }
  }

  /** @type {Map<string, {layer:string, prefix:string}|null>} */
  const cache = new Map()
  /**
   * 带缓存的层归属查询。
   * @param {string} rel - 文件路径。
   * @returns {{layer:string, prefix:string}|null} 归属。
   */
  const assign = (rel) => {
    if (cache.has(rel)) return cache.get(rel) ?? null
    const hit = typeof rel === 'string' && rel !== '' ? layerOf(layers, rel) : null
    cache.set(rel, hit)
    return hit
  }

  let total = 0
  let checkedEdges = 0
  /** @type {Array<{from:string, fromLayer:string, to:string, toLayer:string, line:number}>} */
  const violations = []
  // 层对精确计数（明细有上限，计数不受影响；基线比较依赖它）
  /** @type {Map<string, {from:string, to:string, count:number}>} */
  const pairCounts = new Map()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    const from = assign(edge.from)
    const to = assign(edge.to)
    if (!from || !to) continue
    checkedEdges++
    if (from.layer === to.layer) continue
    const allowed = layerByName.get(from.layer)?.mayDependOn ?? []
    if (allowed.includes(to.layer)) continue
    total++
    const pairKey = `${from.layer}\u0000${to.layer}`
    const pair = pairCounts.get(pairKey)
    if (pair) pair.count++
    else pairCounts.set(pairKey, { from: from.layer, to: to.layer, count: 1 })
    if (violations.length < limit) {
      violations.push({
        from: edge.from,
        fromLayer: from.layer,
        to: edge.to,
        toLayer: to.layer,
        line: Number.isInteger(edge.line) && edge.line > 0 ? edge.line : 0,
      })
    }
  }

  // 层文件统计：覆盖全部索引文件（不只是出现在边里的文件）
  const counts = new Map(layers.map(layer => [layer.name, 0]))
  for (const entry of files) {
    const rel = typeof entry === 'string' ? entry : entry?.path
    if (typeof rel !== 'string' || rel === '') continue
    const hit = assign(rel)
    if (hit && counts.has(hit.layer)) counts.set(hit.layer, (counts.get(hit.layer) ?? 0) + 1)
  }

  return {
    total,
    truncated: total > violations.length,
    checkedEdges,
    unknownRefs,
    violations,
    pairs: [...pairCounts.values()]
      .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    layers: layers.map(layer => ({
      name: layer.name,
      paths: [...layer.paths],
      mayDependOn: [...layer.mayDependOn],
      files: counts.get(layer.name) ?? 0,
    })),
  }
}
