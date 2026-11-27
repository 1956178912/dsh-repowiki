/**
 * 模块耦合：Ca/Ce/不稳定性、去重、未知模块与上限。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { moduleCoupling, MAX_COUPLING_MODULES } from '../src/coupling.js'

test('coupling：跨模块边计算 Ca/Ce/不稳定性并降序', () => {
  const files = [
    { path: 'src/a/x.ts', module: 'src/a' },
    { path: 'src/b/y.ts', module: 'src/b' },
    { path: 'src/c/z.ts', module: 'src/c' },
  ]
  const edges = [
    { from: 'src/b/y.ts', to: 'src/a/x.ts' },
    { from: 'src/c/z.ts', to: 'src/a/x.ts' },
    { from: 'src/a/x.ts', to: 'src/b/y.ts' },
    { from: 'src/a/x.ts', to: 'src/a/x.ts' },
    { from: 'src/b/y.ts', to: 'src/b/y.ts' },
  ]
  const out = moduleCoupling(files, edges)
  assert.deepEqual(out.modules, [
    { module: 'src/c', ca: 0, ce: 1, instability: 1 },
    { module: 'src/b', ca: 1, ce: 1, instability: 0.5 },
    { module: 'src/a', ca: 2, ce: 1, instability: 0.333 },
  ])
  assert.equal(out.truncated, false)
})

test('coupling：重复边去重、未知模块与无效边忽略', () => {
  const files = [
    { path: 'a1', module: 'a' },
    { path: 'b1', module: 'b' },
    { path: 'x1' },
  ]
  const edges = [
    { from: 'b1', to: 'a1' },
    { from: 'b1', to: 'a1' },
    { from: 'x1', to: 'a1' },
    { from: 'a1', to: 'x1' },
    null,
    { from: 1, to: 'a1' },
  ]
  const out = moduleCoupling(files, edges)
  assert.deepEqual(out.modules, [
    { module: 'b', ca: 0, ce: 1, instability: 1 },
    { module: 'a', ca: 1, ce: 0, instability: 0 },
  ])
})

test('coupling：上限、最小耦合门槛与空输入', () => {
  const files = [
    { path: 'a1', module: 'a' },
    { path: 'b1', module: 'b' },
    { path: 'c1', module: 'c' },
  ]
  const edges = [
    { from: 'b1', to: 'a1' },
    { from: 'c1', to: 'b1' },
  ]
  const limited = moduleCoupling(files, edges, { limit: 1 })
  assert.equal(limited.modules.length, 1)
  assert.equal(limited.truncated, true)

  const strict = moduleCoupling(files, edges, { minCoupling: 2 })
  assert.deepEqual(strict.modules, [{ module: 'b', ca: 1, ce: 1, instability: 0.5 }])
  assert.equal(strict.truncated, false)

  assert.deepEqual(moduleCoupling([], []), { modules: [], truncated: false })
  assert.equal(MAX_COUPLING_MODULES, 10)
})
