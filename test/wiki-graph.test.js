/**
 * Wiki 结构签名单元测试：文件/边排序、非法条目过滤、顺序无关。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { wikiGraphText } from '../src/wiki-graph.js'

test('wikiGraphText：文件与边排序，顺序无关', () => {
  const a = wikiGraphText({
    files: [{ path: 'b.ts' }, { path: 'a.ts' }],
    edges: [{ from: 'b.ts', to: 'a.ts' }, { from: 'a.ts', to: 'b.ts' }],
  })
  const b = wikiGraphText({
    files: [{ path: 'a.ts' }, { path: 'b.ts' }],
    edges: [{ from: 'a.ts', to: 'b.ts' }, { from: 'b.ts', to: 'a.ts' }],
  })
  assert.equal(a, b, '输入顺序不影响签名')
  assert.equal(a, 'files:\na.ts\nb.ts\nedges:\na.ts>b.ts\nb.ts>a.ts')
})

test('wikiGraphText：忽略非法条目与空索引', () => {
  assert.equal(wikiGraphText(undefined), 'files:\n\nedges:\n')
  assert.equal(wikiGraphText({ files: [{}, { path: '' }], edges: [{ from: 'a' }] }), 'files:\n\nedges:\n')
  assert.equal(
    wikiGraphText({ files: [{ path: 'x.ts' }, null], edges: [{ from: 'x.ts', to: 'y.ts' }, null] }),
    'files:\nx.ts\nedges:\nx.ts>y.ts',
  )
})
