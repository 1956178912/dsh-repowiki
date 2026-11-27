/**
 * 保守导出审计：具名导入证据、跳过规则、上限与空输入。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  unusedExports, MAX_UNUSED_FILES, MAX_UNUSED_SYMBOLS_PER_FILE,
} from '../src/unused-exports.js'

/** 构造导出符号。 */
function sym(name, line, exported = true) {
  return { name, kind: 'function', line, exported }
}

test('unused-exports：只统计有名导入证据的导出', () => {
  const index = {
    files: [
      { path: 'lib.ts', symbols: [sym('used', 1), sym('unused', 2), sym('other', 3)] },
      { path: 'use.ts', symbols: [] },
    ],
    edges: [{ from: 'use.ts', to: 'lib.ts', symbols: ['used'] }],
  }
  const out = unusedExports(index)
  assert.equal(out.total, 2)
  assert.equal(out.exportedTotal, 3)
  assert.equal(out.skippedFiles, 0)
  assert.deepEqual(out.files, [{
    path: 'lib.ts',
    symbols: [
      { name: 'unused', kind: 'function', line: 2 },
      { name: 'other', kind: 'function', line: 3 },
    ],
    hidden: 0,
  }])
  assert.equal(out.truncated, false)
})

test('unused-exports：副作用导入与无入边文件跳过而非判未使用', () => {
  const index = {
    files: [
      { path: 'named.ts', symbols: [sym('a', 1)] },
      { path: 'side.ts', symbols: [sym('b', 1)] },
      { path: 'entry.ts', symbols: [sym('c', 1)] },
      { path: 'use.ts', symbols: [] },
    ],
    edges: [
      { from: 'use.ts', to: 'named.ts', symbols: ['a'] },
      { from: 'use.ts', to: 'side.ts', symbols: [] },
      { from: 'use.ts', to: 'use.ts', symbols: ['x'] },
    ],
  }
  const out = unusedExports(index)
  assert.equal(out.total, 0)
  assert.equal(out.exportedTotal, 1, '只有具名导入证据的文件被审计')
  assert.equal(out.skippedFiles, 2, '副作用导入文件与无入边文件均跳过')
  assert.deepEqual(out.files, [])
})

test('unused-exports：忽略 default 与非导出符号，明细有界但总数精确', () => {
  const files = [{
    path: 'lib.ts',
    symbols: [
      sym('default', 1),
      sym('hidden', 2, false),
      ...Array.from({ length: 12 }, (_, index) => sym(`s${index}`, index + 3)),
    ],
  }]
  const out = unusedExports(
    { files, edges: [{ from: 'use.ts', to: 'lib.ts', symbols: ['none'] }] },
    { maxSymbolsPerFile: 3, maxFiles: 1 },
  )
  assert.equal(out.total, 12)
  assert.equal(out.files[0].symbols.length, 3)
  assert.equal(out.files[0].hidden, 9)
  assert.equal(out.truncated, true)
  assert.equal(MAX_UNUSED_FILES, 10)
  assert.equal(MAX_UNUSED_SYMBOLS_PER_FILE, 10)
})

test('unused-exports：空索引与无效边返回空结果', () => {
  const empty = { total: 0, exportedTotal: 0, skippedFiles: 0, files: [], truncated: false }
  assert.deepEqual(unusedExports({}), empty)
  assert.deepEqual(unusedExports(null), empty)
  const out = unusedExports({
    files: [{ path: 'x', symbols: [sym('a', 1)] }],
    edges: [null, { from: 1, to: 'x' }, { from: 'y', to: 'x', symbols: ['a'] }],
  })
  assert.equal(out.total, 0)
  assert.equal(out.skippedFiles, 0)
})
