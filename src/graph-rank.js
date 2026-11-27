// @ts-check
/**
 * 文件级图重要性排名（PageRank，纯函数）。
 *
 * 只依赖 index.json 的静态 import 边：被核心模块依赖的文件即使自身
 * fan-in 不高，也会因上游权重获得更高排名。这是 repo map（仓库地图）
 * 的经典做法，用于在"没有直接词法命中"时给出仓库的架构中心，而不是
 * 凭文件名猜测相关性。
 *
 * 边界：静态 import 图不是运行时调用图；dangling 节点的权重按标准
 * PageRank 均分回全图。迭代次数与收敛阈值固定，结果确定且可复现。
 */

/** 返回的核心文件上限。 */
export const MAX_CORE_FILES = 10

/** PageRank 阻尼系数（随机游走继续沿边前进的概率）。 */
export const RANK_DAMPING = 0.85

/** 收敛阈值（相邻两轮 L1 差）。 */
export const RANK_EPSILON = 1e-6

/** 迭代上限（收敛更快时提前结束）。 */
export const MAX_RANK_ITERATIONS = 50

/**
 * 索引边（本模块只读取 from/to）。
 * @typedef {{from:string, to:string}} RankEdge
 */

/**
 * 排名条目。
 * @typedef {{path:string, score:number, inDegree:number, outDegree:number}} RankEntry
 */

/**
 * 把边归一为去重邻接表：忽略自引用与无效端点，同一对 from→to 只计一次。
 * @param {RankEdge[]} edges - 索引依赖边。
 * @returns {{nodes:string[], out:Map<string, Set<string>>, inDegree:Map<string, number>,
 *   outDegree:Map<string, number>}} 邻接表与度统计。
 */
function buildGraph(edges) {
  /** @type {Map<string, Set<string>>} */
  const out = new Map()
  /** @type {Set<string>} */
  const nodes = new Set()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.from === edge.to) continue
    nodes.add(edge.from)
    nodes.add(edge.to)
    let targets = out.get(edge.from)
    if (!targets) {
      targets = new Set()
      out.set(edge.from, targets)
    }
    targets.add(edge.to)
  }
  /** @type {Map<string, number>} */
  const inDegree = new Map()
  /** @type {Map<string, number>} */
  const outDegree = new Map()
  for (const [from, targets] of out) {
    outDegree.set(from, targets.size)
    for (const to of targets) inDegree.set(to, (inDegree.get(to) ?? 0) + 1)
  }
  return { nodes: [...nodes].sort(), out, inDegree, outDegree }
}

/**
 * 计算文件级 PageRank。
 *
 * 节点集合为 `options.files` 与边端点的并集；无边文件获得基础份额，但
 * 没有出边时其权重按 dangling 规则均分回全图。输出按分数降序、同分按
 * 路径升序，分数保留 6 位小数（确定性输出）。
 * @param {RankEdge[]} [edges] - 索引依赖边。
 * @param {{files?:string[], limit?:number, damping?:number, epsilon?:number,
 *   maxIterations?:number}} [options] - 参与排名的全量文件、返回条数与算法参数。
 * @returns {{entries:RankEntry[], nodes:number, iterations:number, converged:boolean}}
 *   排名条目与迭代信息。
 */
export function computeFileRank(edges = [], options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0
    ? Math.min(MAX_CORE_FILES * 10, Math.floor(options.limit))
    : MAX_CORE_FILES
  const damping = typeof options.damping === 'number' && Number.isFinite(options.damping)
    ? Math.min(0.99, Math.max(0.01, options.damping))
    : RANK_DAMPING
  const epsilon = typeof options.epsilon === 'number' && Number.isFinite(options.epsilon)
    ? Math.max(1e-12, options.epsilon)
    : RANK_EPSILON
  const maxIterations = Number.isInteger(options.maxIterations) && options.maxIterations > 0
    ? Math.min(1000, Math.floor(options.maxIterations))
    : MAX_RANK_ITERATIONS
  const graph = buildGraph(edges)
  /** @type {Set<string>} */
  const allNodes = new Set(graph.nodes)
  for (const file of options.files ?? []) {
    if (typeof file === 'string' && file.length > 0) allNodes.add(file)
  }
  const nodes = [...allNodes].sort()
  const total = nodes.length
  if (total === 0) return { entries: [], nodes: 0, iterations: 0, converged: true }

  /** @type {Map<string, number>} */
  const rank = new Map(nodes.map(path => [path, 1 / total]))
  let converged = false
  let iterations = 0
  for (; iterations < maxIterations; iterations++) {
    // dangling：没有出边的节点把自身权重均分给全部节点（标准 PageRank）
    let danglingMass = 0
    for (const path of nodes) {
      if ((graph.outDegree.get(path) ?? 0) === 0) danglingMass += rank.get(path) ?? 0
    }
    const base = (1 - damping) / total + (damping * danglingMass) / total
    /** @type {Map<string, number>} */
    const next = new Map()
    for (const path of nodes) next.set(path, base)
    for (const [from, targets] of graph.out) {
      const weight = (rank.get(from) ?? 0) / targets.size
      for (const to of targets) next.set(to, (next.get(to) ?? 0) + damping * weight)
    }
    let delta = 0
    for (const path of nodes) delta += Math.abs((next.get(path) ?? 0) - (rank.get(path) ?? 0))
    for (const [path, value] of next) rank.set(path, value)
    if (delta < epsilon) {
      converged = true
      iterations++
      break
    }
  }

  const entries = nodes
    .map(path => ({
      path,
      score: Math.round((rank.get(path) ?? 0) * 1e6) / 1e6,
      inDegree: graph.inDegree.get(path) ?? 0,
      outDegree: graph.outDegree.get(path) ?? 0,
    }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit)
  return { entries, nodes: total, iterations, converged }
}
