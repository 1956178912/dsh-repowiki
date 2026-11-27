/**
 * 影响面的架构上下文：层归属、跨层影响边与改动文件热点函数。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { architectureImpact } from '../src/impact-architecture.js'
import { assignLayer } from '../src/layers.js'

/** 两个层的 plan 分层。 */
const LAYERS = [
  { name: 'ui', paths: ['src/ui'], mayDependOn: ['core'] },
  { name: 'core', paths: ['src/core'], mayDependOn: [] },
]

/** 索引文件。 */
function files() {
  return [
    { path: 'src/ui/a.ts', symbols: [] },
    { path: 'src/ui/widgets/w.ts', symbols: [] },
    { path: 'src/core/b.ts', symbols: [{ name: 'b', kind: 'function', line: 1, endLine: 9 }] },
    { path: 'src/other/c.ts', symbols: [] },
  ]
}

test('assignLayer：最长前缀优先，未命中返回 null', () => {
  const nested = [
    { name: 'app', paths: ['src'], mayDependOn: [] },
    { name: 'ui', paths: ['src/ui'], mayDependOn: [] },
  ]
  assert.deepEqual(assignLayer(nested, 'src/ui/a.ts'), { layer: 'ui', prefix: 'src/ui' })
  assert.deepEqual(assignLayer(nested, 'src/core/b.ts'), { layer: 'app', prefix: 'src' })
  assert.equal(assignLayer(nested, 'lib/x.ts'), null)
  assert.equal(assignLayer([], 'src/a.ts'), null)
})

test('architectureImpact：层计数、改动层与受影响层分布', () => {
  const result = architectureImpact({
    files: files(),
    edges: [{ from: 'src/ui/a.ts', to: 'src/core/b.ts' }],
    layers: LAYERS,
    changed: ['src/core/b.ts'],
    impacted: ['src/ui/a.ts', 'src/ui/widgets/w.ts', 'src/other/c.ts'],
    sources: [],
  })
  assert.deepEqual(result.declaredLayers, [
    { name: 'ui', files: 2 },
    { name: 'core', files: 1 },
  ])
  assert.deepEqual(result.changedLayers, ['core'])
  assert.deepEqual(result.impactedLayers, [{ layer: 'ui', files: 2 }])
  assert.deepEqual(result.crossLayerPairs, [{ from: 'ui', to: 'core', count: 1 }])
})

test('architectureImpact：只统计改动↔受影响的跨层边', () => {
  const result = architectureImpact({
    files: files(),
    edges: [
      { from: 'src/ui/a.ts', to: 'src/core/b.ts' },
      // 端点不在受影响集合内：不计
      { from: 'src/other/c.ts', to: 'src/core/b.ts' },
      // 两端都不是改动文件：不计
      { from: 'src/ui/a.ts', to: 'src/ui/widgets/w.ts' },
    ],
    layers: LAYERS,
    changed: ['src/core/b.ts'],
    impacted: ['src/ui/a.ts'],
    sources: [],
  })
  assert.deepEqual(result.crossLayerPairs, [{ from: 'ui', to: 'core', count: 1 }])
})

test('architectureImpact：改动文件的热点函数（含精确总数）', () => {
  const lines = ['export function b() {']
  for (let i = 0; i < 6; i++) lines.push('  if (x) { return 1 }')
  lines.push('}')
  const result = architectureImpact({
    files: files(),
    edges: [],
    layers: LAYERS,
    changed: ['src/core/b.ts'],
    impacted: [],
    sources: [{ path: 'src/core/b.ts', text: lines.join('\n') }],
    threshold: 5,
  })
  assert.equal(result.hotspotTotal, 1)
  assert.equal(result.hotspots.length, 1)
  assert.equal(result.hotspots[0].name, 'b')
  assert.equal(result.hotspots[0].complexity, 7)
})

test('architectureImpact：无分层/无源码时输出空结构', () => {
  const result = architectureImpact({ files: files(), changed: ['src/core/b.ts'] })
  assert.deepEqual(result.declaredLayers, [])
  assert.deepEqual(result.changedLayers, [])
  assert.deepEqual(result.impactedLayers, [])
  assert.deepEqual(result.crossLayerPairs, [])
  assert.deepEqual(result.hotspots, [])
  assert.equal(result.hotspotTotal, 0)
})
