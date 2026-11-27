// @ts-check
/**
 * 文件级 import 循环依赖检测（纯函数）。
 *
 * index.json 的 edges 构成有向图：from 文件依赖 to 文件。循环依赖是架构
 * 坏味道，但"找出所有简单环"数量可爆炸且不唯一，因此这里采用业界常用
 * 的强连通分量（SCC）口径：一个 size ≥ 2 的 SCC 表示组内任意两个文件
 * 互相可达——即每个文件都至少位于一个环上。组内文件按字典序输出，
 * 组间按组大小降序、首文件字典序，结果确定可复现。
 *
 * 语义边界：仅基于静态 import/use/require 边，不含运行时动态加载；
 * 自引用边（from === to）不构成跨文件循环，直接忽略。
 */

/** 单次报告返回的循环组上限（与其它有界输出一致）。 */
export const MAX_CYCLE_GROUPS = 10

/** 每个循环组最多列出的文件数（超大 SCC 只报规模，不铺满输出）。 */
export const MAX_FILES_PER_CYCLE = 30

/** 代表性环路径的最多节点数（含首尾重复的起点）；更长的环不给出路径。 */
export const MAX_SAMPLE_NODES = 12

/**
 * 索引边（结构见 src/indexer.js 的 edges 输出）。
 * @typedef {{from:string, to:string, kind?:string, line?:number, symbols?:string[]}} IndexEdge
 */

/**
 * 一个循环依赖组（强连通分量）。
 * @typedef {{files:string[], size:number, truncated:boolean, sample:string[]}} ImportCycle
 */

/**
 * 在强连通分量内找一条从 start 出发回到 start 的最短环。
 * 取"最短"是为了给断链提供最小改动参考；并列时按路径字典序取小，
 * 保证输出确定。环长超过 MAX_SAMPLE_NODES 时返回空数组（避免超长输出）。
 * @param {string} start - 起点（组内字典序最小的文件）。
 * @param {Map<string, string[]>} adjacency - 全图邻接表。
 * @param {Set<string>} members - 当前分量成员集合。
 * @returns {string[]} 环路径（首尾均为 start）；无可用短环时为空。
 */
function shortestCycleFrom(start, adjacency, members) {
  // 从 start 正向 BFS，记录到分量内各节点的最短路径
  /** @type {Map<string, string|null>} */
  const parent = new Map([[start, null]])
  const queue = [start]
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]
    for (const next of adjacency.get(current) ?? []) {
      if (next === start || !members.has(next) || parent.has(next)) continue
      parent.set(next, current)
      queue.push(next)
    }
  }
  // 枚举"回到 start"的入边，取最短闭合路径
  /** @type {string[]|null} */
  let best = null
  for (const member of members) {
    if (member === start || !parent.has(member)) continue
    if (!(adjacency.get(member) ?? []).includes(start)) continue
    const path = []
    let cursor = member
    while (cursor !== null) {
      path.push(cursor)
      cursor = parent.get(cursor) ?? null
    }
    path.reverse()
    const candidate = [...path, start]
    if (!best
      || candidate.length < best.length
      || (candidate.length === best.length && candidate.join('\u0000') < best.join('\u0000'))) {
      best = candidate
    }
  }
  if (!best || best.length > MAX_SAMPLE_NODES + 1) return []
  return best
}

/**
 * 构建文件级邻接表：过滤坏边与自引用，目标节点也登记为空邻接。
 * @param {IndexEdge[]} edges - 索引中的依赖边。
 * @returns {Map<string, string[]>} 节点 → 已排序去重的目标列表。
 */
function buildAdjacency(edges) {
  /** @type {Map<string, Set<string>>} */
  const out = new Map()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.from === edge.to) continue // 自引用不是跨文件循环
    let targets = out.get(edge.from)
    if (!targets) {
      targets = new Set()
      out.set(edge.from, targets)
    }
    targets.add(edge.to)
    if (!out.has(edge.to)) out.set(edge.to, new Set())
  }
  /** @type {Map<string, string[]>} */
  const adjacency = new Map()
  for (const [node, targets] of out) adjacency.set(node, [...targets].sort())
  return adjacency
}

/**
 * 迭代式 Tarjan 求强连通分量（避免大仓库递归爆栈）。
 * @param {Map<string, string[]>} adjacency - 邻接表。
 * @returns {string[][]} size ≥ 2 的分量（成员未排序）。
 */
function stronglyConnectedComponents(adjacency) {
  /** @type {Map<string, number>} */
  const discovery = new Map()
  /** @type {Map<string, number>} */
  const lowLink = new Map()
  /** @type {Set<string>} */
  const onStack = new Set()
  /** @type {string[]} */
  const stack = []
  /** @type {string[][]} */
  const groups = []
  let nextDiscovery = 0

  for (const start of [...adjacency.keys()].sort()) {
    if (discovery.has(start)) continue
    discovery.set(start, nextDiscovery)
    lowLink.set(start, nextDiscovery)
    nextDiscovery++
    stack.push(start)
    onStack.add(start)
    /** @type {Array<{node:string, index:number}>} */
    const frames = [{ node: start, index: 0 }]

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]
      const children = adjacency.get(frame.node) ?? []
      if (frame.index < children.length) {
        const child = children[frame.index++]
        if (!discovery.has(child)) {
          discovery.set(child, nextDiscovery)
          lowLink.set(child, nextDiscovery)
          nextDiscovery++
          stack.push(child)
          onStack.add(child)
          frames.push({ node: child, index: 0 })
        } else if (onStack.has(child)) {
          lowLink.set(frame.node, Math.min(lowLink.get(frame.node) ?? 0, discovery.get(child) ?? 0))
        }
        continue
      }
      frames.pop()
      if (frames.length > 0) {
        const parent = frames[frames.length - 1].node
        lowLink.set(parent, Math.min(lowLink.get(parent) ?? 0, lowLink.get(frame.node) ?? 0))
      }
      if (lowLink.get(frame.node) === discovery.get(frame.node)) {
        /** @type {string[]} */
        const group = []
        for (;;) {
          const member = stack.pop()
          if (member === undefined) break // 理论不可达，防御性退出
          onStack.delete(member)
          group.push(member)
          if (member === frame.node) break
        }
        if (group.length > 1) groups.push(group)
      }
    }
  }
  return groups
}

/**
 * 检测文件级 import 循环依赖组（强连通分量口径）。
 * @param {IndexEdge[]} [edges] - 索引中的依赖边。
 * @param {{limit?:number, filesPerCycle?:number}} [options] - 组数与每组文件数上限。
 * @returns {{cycles: ImportCycle[], truncated: boolean}} 循环组与截断标记。
 */
export function findImportCycles(edges = [], options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : MAX_CYCLE_GROUPS
  const filesPerCycle = Number.isInteger(options.filesPerCycle) && options.filesPerCycle > 0
    ? options.filesPerCycle
    : MAX_FILES_PER_CYCLE
  const adjacency = buildAdjacency(edges)
  const groups = stronglyConnectedComponents(adjacency)
    .map(group => group.sort()) // 组内字典序，保证输出稳定
    .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))

  /** @type {ImportCycle[]} */
  const cycles = []
  let truncated = false
  for (const group of groups) {
    if (cycles.length >= limit) {
      truncated = true
      break
    }
    const files = group.slice(0, filesPerCycle)
    const sample = shortestCycleFrom(group[0], adjacency, new Set(group))
    cycles.push({ files, size: group.length, truncated: group.length > files.length, sample })
  }
  return { cycles, truncated }
}
