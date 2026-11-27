/**
 * 架构分层规则单元测试：配置归一、最长前缀归属、跨层违规与上限。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLayers, evaluateLayers, MAX_LAYER_VIOLATIONS } from '../src/layers.js'

test('normalizeLayers：丢弃非法条目、去重、路径归一', () => {
  const layers = normalizeLayers([
    { name: 'ui', paths: ['./src/ui/', 'src\\ui\\widgets'], mayDependOn: ['core'] },
    { name: 'ui', paths: ['dup'] },
    { name: '', paths: ['x'] },
    { name: 'empty', paths: [] },
    { name: 'core', paths: ['src/core'], mayDependOn: ['missing', ''] },
    null,
    'bad',
  ])
  assert.deepEqual(layers, [
    { name: 'ui', paths: ['src/ui', 'src/ui/widgets'], mayDependOn: ['core'] },
    { name: 'core', paths: ['src/core'], mayDependOn: ['missing'] },
  ])
})

test('evaluateLayers：同层允许、mayDependOn 允许、未声明跨层违规', () => {
  const layers = normalizeLayers([
    { name: 'ui', paths: ['src/ui'], mayDependOn: ['core'] },
    { name: 'core', paths: ['src/core'], mayDependOn: [] },
    { name: 'data', paths: ['src/data'] },
  ])
  const edges = [
    { from: 'src/ui/a.ts', to: 'src/core/b.ts', line: 3 },
    { from: 'src/ui/a.ts', to: 'src/ui/c.ts', line: 4 },
    { from: 'src/core/b.ts', to: 'src/ui/a.ts', line: 5 },
    { from: 'src/data/d.ts', to: 'src/core/b.ts', line: 6 },
    { from: 'src/ui/a.ts', to: 'lib/x.ts', line: 7 },
  ]
  const report = evaluateLayers(layers, edges, [
    'src/ui/a.ts', 'src/ui/c.ts', 'src/core/b.ts', 'src/data/d.ts', 'lib/x.ts',
  ])
  assert.equal(report.total, 2)
  assert.equal(report.checkedEdges, 4, '两端都属于层的边才参与判定')
  assert.equal(report.truncated, false)
  assert.deepEqual(report.violations.map(v => [v.fromLayer, v.from, v.toLayer, v.to, v.line]), [
    ['core', 'src/core/b.ts', 'ui', 'src/ui/a.ts', 5],
    ['data', 'src/data/d.ts', 'core', 'src/core/b.ts', 6],
  ])
  assert.deepEqual(report.layers.map(l => [l.name, l.files]), [
    ['ui', 2], ['core', 1], ['data', 1],
  ])
  // 层对计数始终精确，且按 from/to 排序（架构基线比较依赖）
  assert.deepEqual(report.pairs, [
    { from: 'core', to: 'ui', count: 1 },
    { from: 'data', to: 'core', count: 1 },
  ])
})

test('evaluateLayers：明细截断时层对计数仍精确', () => {
  const layers = normalizeLayers([
    { name: 'ui', paths: ['src/ui'] },
    { name: 'core', paths: ['src/core'] },
  ])
  const edges = [
    { from: 'src/ui/a.ts', to: 'src/core/b.ts' },
    { from: 'src/ui/c.ts', to: 'src/core/b.ts' },
    { from: 'src/core/b.ts', to: 'src/ui/a.ts' },
  ]
  const report = evaluateLayers(layers, edges, [], { limit: 1 })
  assert.equal(report.total, 3)
  assert.equal(report.violations.length, 1)
  assert.equal(report.truncated, true)
  assert.deepEqual(report.pairs, [
    { from: 'core', to: 'ui', count: 1 },
    { from: 'ui', to: 'core', count: 2 },
  ])
})

test('evaluateLayers：最长前缀优先与未知层引用', () => {
  const layers = normalizeLayers([
    { name: 'src', paths: ['src'] },
    { name: 'ui', paths: ['src/ui'], mayDependOn: ['ghost'] },
  ])
  const report = evaluateLayers(layers, [], ['src/ui/a.ts', 'src/core/b.ts'])
  assert.deepEqual(report.layers.map(l => [l.name, l.files]), [['src', 1], ['ui', 1]])
  assert.deepEqual(report.unknownRefs, ['ghost'])
})

test('evaluateLayers：违规明细有上限但总数精确', () => {
  const layers = normalizeLayers([
    { name: 'a', paths: ['a'] },
    { name: 'b', paths: ['b'] },
  ])
  const edges = Array.from({ length: 60 }, (_, i) => ({
    from: `a/f${i}.ts`, to: `b/g${i}.ts`, line: i + 1,
  }))
  const report = evaluateLayers(layers, edges, [], { limit: 5 })
  assert.equal(report.total, 60)
  assert.equal(report.violations.length, 5)
  assert.equal(report.truncated, true)
  assert.equal(MAX_LAYER_VIOLATIONS, 50)
})

test('evaluateLayers：非法边与缺失行号降级', () => {
  const layers = normalizeLayers([
    { name: 'a', paths: ['a'] },
    { name: 'b', paths: ['b'] },
  ])
  const report = evaluateLayers(layers, [
    null,
    { from: 1, to: 'b/x.ts' },
    { from: 'a/x.ts', to: 'b/y.ts' },
  ])
  assert.equal(report.total, 1)
  assert.equal(report.violations[0].line, 0, '旧索引无行号时记 0')
})
