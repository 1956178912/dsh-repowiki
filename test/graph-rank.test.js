/**
 * 文件级 PageRank：链式/环状图、去重、孤立文件、参数钳制与确定性。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeFileRank, MAX_CORE_FILES, RANK_DAMPING,
} from '../src/graph-rank.js'

test('graph-rank：依赖链中越靠下游排名越高', () => {
  const result = computeFileRank([
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ])
  assert.deepEqual(result.entries.map(entry => entry.path), ['c', 'b', 'a'])
  assert.ok(result.entries[0].score > result.entries[1].score)
  assert.ok(result.entries[1].score > result.entries[2].score)
  assert.equal(result.nodes, 3)
  assert.equal(result.converged, true)
  assert.ok(result.iterations > 0 && result.iterations <= 50)
  assert.deepEqual(
    result.entries.map(entry => [entry.inDegree, entry.outDegree]),
    [[1, 0], [1, 1], [0, 1]],
  )
})

test('graph-rank：对称环平分权重并按路径稳定排序', () => {
  const result = computeFileRank([
    { from: 'b', to: 'a' },
    { from: 'a', to: 'b' },
  ])
  assert.deepEqual(result.entries.map(entry => entry.path), ['a', 'b'])
  assert.equal(result.entries[0].score, result.entries[1].score)
  assert.equal(result.converged, true)
})

test('graph-rank：自引用与重复边不改变图结构', () => {
  const result = computeFileRank([
    { from: 'a', to: 'a' },
    { from: 'a', to: 'b' },
    { from: 'a', to: 'b' },
  ])
  assert.equal(result.nodes, 2)
  const b = result.entries.find(entry => entry.path === 'b')
  const a = result.entries.find(entry => entry.path === 'a')
  assert.equal(b.inDegree, 1)
  assert.equal(a.outDegree, 1)
  assert.deepEqual(result.entries.map(entry => entry.path), ['b', 'a'])
})

test('graph-rank：files 选项纳入无边文件但排名低于核心节点', () => {
  const result = computeFileRank([{ from: 'a', to: 'b' }], { files: ['z', 'b', '', 42] })
  assert.equal(result.nodes, 3)
  assert.deepEqual(result.entries.map(entry => entry.path), ['b', 'a', 'z'])
  const isolated = result.entries.find(entry => entry.path === 'z')
  assert.ok(isolated.score > 0)
  assert.equal(isolated.inDegree, 0)
  assert.equal(isolated.outDegree, 0)
})

test('graph-rank：limit 与算法参数被钳制，迭代上限可提前结束', () => {
  const edges = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'd' },
    { from: 'd', to: 'e' },
  ]
  const limited = computeFileRank(edges, { limit: 2 })
  assert.equal(limited.entries.length, 2)
  assert.deepEqual(limited.entries.map(entry => entry.path), ['e', 'd'])

  const capped = computeFileRank(edges, { maxIterations: 1 })
  assert.equal(capped.iterations, 1)
  assert.equal(capped.converged, false)

  const fallback = computeFileRank(edges, { maxIterations: 0, damping: 5, epsilon: -1 })
  assert.ok(fallback.iterations <= 50)
  assert.equal(fallback.entries.length, 5)

  const huge = computeFileRank(edges, { limit: 10_000 })
  assert.equal(huge.entries.length, 5)
  assert.equal(MAX_CORE_FILES, 10)
  assert.equal(RANK_DAMPING, 0.85)
})

test('graph-rank：空输入与无效边返回空结果', () => {
  assert.deepEqual(computeFileRank([]), { entries: [], nodes: 0, iterations: 0, converged: true })
  assert.deepEqual(
    computeFileRank([null, { from: 1, to: 'a' }, { from: 'a', to: 2 }, {}]),
    { entries: [], nodes: 0, iterations: 0, converged: true },
  )
})

test('graph-rank：相同输入产生完全一致的结果', () => {
  const edges = [
    { from: 'src/a.js', to: 'src/util.js' },
    { from: 'src/b.js', to: 'src/util.js' },
    { from: 'src/util.js', to: 'src/base.js' },
  ]
  assert.deepEqual(computeFileRank(edges), computeFileRank(edges))
})
