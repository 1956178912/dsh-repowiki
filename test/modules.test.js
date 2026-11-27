/**
 * 模块树单元测试（ADR-0006）：文件归并、祖先占位与稳定排序。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  moduleOf, parentModule, buildModules, summarizeModuleRelations,
  MODULE_MAX_DEPTH, ROOT_MODULE,
} from '../src/modules.js'

test('moduleOf：根目录文件归入 "."，其余按目录层级截断', () => {
  assert.equal(moduleOf('README.md'), ROOT_MODULE)
  assert.equal(moduleOf('src/indexer.js'), 'src')
  assert.equal(moduleOf('src/graph/nodes.ts'), 'src/graph')
  // 超过深度上限的文件归入二级目录
  assert.equal(moduleOf('src/graph/internal/state.ts'), 'src/graph')
  assert.equal(MODULE_MAX_DEPTH, 2)
})

test('parentModule：逐级回溯到根模块', () => {
  assert.equal(parentModule(ROOT_MODULE), '')
  assert.equal(parentModule('src'), ROOT_MODULE)
  assert.equal(parentModule('src/graph'), 'src')
})

test('buildModules：只计直属文件，补齐祖先占位，排序稳定', () => {
  const modules = buildModules([
    { path: 'src/graph/nodes.ts', symbols: [1, 2] },
    { path: 'src/indexer.js', symbols: [1] },
    { path: 'README.md', symbols: [] },
    { path: 'src/graph/internal/state.ts', symbols: [1, 2, 3] },
  ])
  assert.deepEqual(modules.map(m => m.path), ['.', 'src', 'src/graph'])
  const root = modules.find(m => m.path === '.')
  assert.equal(root.files, 1, '根目录只计 README.md')
  assert.equal(root.symbols, 0)
  const src = modules.find(m => m.path === 'src')
  assert.equal(src.files, 1, 'src 只计直属 indexer.js')
  assert.equal(src.symbols, 1)
  const graph = modules.find(m => m.path === 'src/graph')
  assert.equal(graph.files, 2, 'graph 合计直属与更深层文件')
  assert.equal(graph.symbols, 5)
  assert.equal(graph.parent, 'src')
})

test('buildModules：空文件列表仍返回根模块', () => {
  const modules = buildModules([])
  assert.deepEqual(modules, [{ path: '.', parent: '', files: 0, symbols: 0 }])
})

test('summarizeModuleRelations：跨模块边聚合、同模块忽略、排序与截断', () => {
  const files = [
    { path: 'src/app.ts', module: 'src' },
    { path: 'src/core/util.ts', module: 'src/core' },
    { path: 'src/core/base.ts', module: 'src/core' },
    { path: 'lib/legacy.ts', module: 'lib' },
  ]
  const edges = [
    { from: 'src/app.ts', to: 'src/core/util.ts' },
    { from: 'src/app.ts', to: 'src/core/base.ts' },
    { from: 'src/core/util.ts', to: 'src/core/base.ts' }, // 同模块：忽略
    { from: 'lib/legacy.ts', to: 'src/app.ts' },
    { from: 'src/app.ts', to: 'src/core/util.ts' }, // 重复边计数
  ]
  const relations = summarizeModuleRelations(files, edges)
  assert.deepEqual(relations[0], { from: 'src', to: 'src/core', count: 3 })
  assert.deepEqual(relations[1], { from: 'lib', to: 'src', count: 1 })
  assert.equal(relations.length, 2, '同模块边不进入摘要')
  assert.equal(summarizeModuleRelations(files, edges, 1).length, 1, '按上限截断')
  assert.deepEqual(summarizeModuleRelations([], []), [])
})
