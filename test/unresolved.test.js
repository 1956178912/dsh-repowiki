/**
 * 未解析相对导入检测单元测试。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { findUnresolvedImports, MAX_UNRESOLVED_DETAILS } from '../src/unresolved.js'

test('findUnresolvedImports：已解析的相对导入不算、缺失的计入', () => {
  const files = [{
    path: 'src/a.ts',
    imports: [
      { specifier: './b', line: 1, relative: true },
      { specifier: './missing', line: 2, relative: true },
      { specifier: 'react', line: 3, relative: false },
      { specifier: 'react', line: 4, relative: false },
    ],
  }]
  const edges = [{ from: 'src/a.ts', line: 1, to: 'src/b.ts' }]
  const result = findUnresolvedImports(files, edges)
  assert.equal(result.checked, 2, '只检查以 . 开头的 relative 导入')
  assert.equal(result.total, 1)
  assert.deepEqual(result.details, [{ path: 'src/a.ts', line: 2, specifier: './missing' }])
  assert.equal(MAX_UNRESOLVED_DETAILS, 50)
})

test('findUnresolvedImports：非相对形式与缺行号降级', () => {
  const files = [{
    path: 'a.ts',
    imports: [
      { specifier: 'crate::foo', line: 1, relative: true },
      { specifier: '@app/x', line: 2, relative: true },
      { specifier: './x', line: 3, relative: false },
      { specifier: './no-line', relative: true },
    ],
  }]
  const result = findUnresolvedImports(files, [])
  assert.equal(result.checked, 1)
  assert.deepEqual(result.details, [], '缺行号不计入明细')
})

test('findUnresolvedImports：明细有上限但总数精确、坏输入跳过', () => {
  const imports = Array.from({ length: 60 }, (_, i) => ({
    specifier: `./missing${i}`, line: i + 1, relative: true,
  }))
  const result = findUnresolvedImports([
    { path: 'a.ts', imports },
    { path: 'b.ts', imports: 'bad' },
    null,
    { path: 'c.ts', imports: [{ specifier: './x', line: 1, relative: true }] },
  ], [], { limit: 5 })
  assert.equal(result.total, 61)
  assert.equal(result.details.length, 5)
})
