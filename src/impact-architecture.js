// @ts-check
/**
 * 变更影响面的架构上下文（纯函数）。
 *
 * `repowiki-impact` 已给出"谁会被改坏"，但缺少"这次改动在架构上意味着
 * 什么"：改动落在哪个声明层、受影响的文件分布在哪些层、是否存在跨层
 * 依赖事实、以及改动文件里是否有高复杂度函数（复核重点）。这些事实
 * 都来自索引 + plan 分层 + 改动文件的源码，不需要模型或全库源码。
 *
 * 分层口径与 `repowiki-status`/`verify:arch` 完全一致（最长路径前缀、
 * 同层允许），因此三个工具对同一改动的层归属不会互相矛盾。
 */

import { assignLayer } from './layers.js'
import { computeComplexity, COMPLEXITY_THRESHOLD } from './complexity.js'

/** 输出的层/热点条数上限（页面/JSON 都有界）。 */
export const MAX_IMPACT_LAYERS = 20
export const MAX_IMPACT_HOTSPOTS = 10

/**
 * 按层聚合文件计数。
 * @param {Array<{name:string, paths:string[]}>} layers - 层配置。
 * @param {Iterable<string>} paths - 文件路径集合。
 * @returns {Array<{layer:string, files:number}>} 按文件数降序、层名升序。
 */
function countByLayer(layers, paths) {
  const counts = new Map()
  for (const path of paths) {
    const hit = assignLayer(layers, path)
    if (!hit) continue
    counts.set(hit.layer, (counts.get(hit.layer) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([layer, files]) => ({ layer, files }))
    .sort((a, b) => b.files - a.files || a.layer.localeCompare(b.layer))
    .slice(0, MAX_IMPACT_LAYERS)
}

/**
 * 计算改动在架构上的影响。
 * @param {object} input - 输入。
 * @param {Array<{path:string, symbols?:Array}>} [input.files] - 索引文件。
 * @param {Array<{from:string, to:string}>} [input.edges] - 依赖边。
 * @param {Array<{name:string, paths:string[], mayDependOn:string[]}>} [input.layers]
 *   - 已归一化的 plan 分层。
 * @param {string[]} [input.changed] - 改动文件（已解析的索引路径）。
 * @param {string[]} [input.impacted] - 受影响文件（依赖方，含传递）。
 * @param {Array<{path:string, text:string}>} [input.sources] - 改动文件源码。
 * @param {number} [input.threshold] - 高复杂度阈值。
 * @returns {{declaredLayers:Array<{name:string, files:number}>,
 *   changedLayers:string[],
 *   impactedLayers:Array<{layer:string, files:number}>,
 *   crossLayerPairs:Array<{from:string, to:string, count:number}>,
 *   hotspots:Array<{path:string, name:string, line:number, endLine:number, complexity:number}>,
 *   hotspotTotal:number}} 架构影响摘要。
 */
export function architectureImpact(input = {}) {
  const files = Array.isArray(input.files) ? input.files : []
  const edges = Array.isArray(input.edges) ? input.edges : []
  const layers = Array.isArray(input.layers) ? input.layers : []
  const changed = Array.isArray(input.changed) ? input.changed : []
  const impacted = Array.isArray(input.impacted) ? input.impacted : []
  const sources = Array.isArray(input.sources) ? input.sources : []
  const threshold = Number.isInteger(input.threshold)
    ? /** @type {number} */ (input.threshold)
    : COMPLEXITY_THRESHOLD
  const changedSet = new Set(changed)
  const impactedSet = new Set(impacted)

  const declaredLayers = layers.map((layer) => {
    let count = 0
    for (const file of files) {
      const hit = assignLayer(layers, file?.path)
      if (hit && hit.layer === layer.name) count++
    }
    return { name: layer.name, files: count }
  }).slice(0, MAX_IMPACT_LAYERS)

  const changedLayers = [...new Set(
    changed.map(path => assignLayer(layers, path)?.layer).filter(Boolean),
  )].sort()
  const impactedLayers = countByLayer(layers, impactedSet)

  // 跨层影响：恰好一端是改动文件、另一端是受影响文件的边，且两端层不同
  const pairCounts = new Map()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    const fromChanged = changedSet.has(edge.from)
    const toChanged = changedSet.has(edge.to)
    if (fromChanged === toChanged) continue
    const other = fromChanged ? edge.to : edge.from
    if (!impactedSet.has(other)) continue
    const fromLayer = assignLayer(layers, edge.from)
    const toLayer = assignLayer(layers, edge.to)
    if (!fromLayer || !toLayer || fromLayer.layer === toLayer.layer) continue
    const key = `${fromLayer.layer}\u0000${toLayer.layer}`
    const bucket = pairCounts.get(key)
    if (bucket) bucket.count++
    else pairCounts.set(key, { from: fromLayer.layer, to: toLayer.layer, count: 1 })
  }
  const crossLayerPairs = [...pairCounts.values()]
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))

  const changedFiles = files.filter(file => changedSet.has(file?.path))
  const complexity = sources.length > 0 && changedFiles.length > 0
    ? computeComplexity(changedFiles, sources, { threshold, limit: MAX_IMPACT_HOTSPOTS })
    : null

  return {
    declaredLayers,
    changedLayers,
    impactedLayers,
    crossLayerPairs,
    hotspots: complexity ? complexity.high : [],
    hotspotTotal: complexity ? complexity.highTotal : 0,
  }
}
