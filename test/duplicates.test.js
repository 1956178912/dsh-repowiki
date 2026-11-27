/**
 * 重复代码检测单元测试：窗口指纹、空白归一、单文件排除与上限。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findDuplicates, normalizeDuplicateLine,
  DUPLICATE_WINDOW_LINES, MAX_DUPLICATE_GROUPS,
} from '../src/duplicates.js'

/** 10 行共享块（含空行，跨 3 个 8 行窗口）。 */
const SHARED_BLOCK = [
  'function shared(a, b) {',
  '  const total = a + b',
  '  if (total > 0) {',
  '    console.log("positive")',
  '  }',
  '  return total',
  '}',
  '',
  'const extra = 1',
  'export { shared, extra }',
]

test('normalizeDuplicateLine：去首尾空白并压缩连续空白', () => {
  assert.equal(normalizeDuplicateLine('   const   x =   1  '), 'const x = 1')
  assert.equal(normalizeDuplicateLine('\t\t'), '')
  assert.equal(normalizeDuplicateLine(null), '')
})

test('findDuplicates：跨文件相同块合并为一个重复组', () => {
  const result = findDuplicates([
    { path: 'src/a.ts', text: SHARED_BLOCK.join('\n') },
    { path: 'src/b.ts', text: SHARED_BLOCK.map(line => `    ${line}`).join('\n') },
  ])
  assert.equal(result.total, 1)
  assert.equal(result.windowLines, DUPLICATE_WINDOW_LINES)
  assert.equal(result.filesScanned, 2)
  assert.equal(result.groups.length, 1)
  assert.equal(result.groups[0].lines, 10, '3 个连续窗口合并为 10 行')
  assert.deepEqual(result.groups[0].occurrences.map(o => [o.path, o.start, o.end]), [
    ['src/a.ts', 1, 10],
    ['src/b.ts', 1, 10],
  ])
})

test('findDuplicates：单文件重复与短块不计', () => {
  const single = findDuplicates([
    { path: 'src/a.ts', text: `${SHARED_BLOCK.join('\n')}\n${SHARED_BLOCK.join('\n')}` },
  ])
  assert.equal(single.total, 0)

  const short = findDuplicates([
    { path: 'src/a.ts', text: SHARED_BLOCK.slice(0, 5).join('\n') },
    { path: 'src/b.ts', text: SHARED_BLOCK.slice(0, 5).join('\n') },
  ])
  assert.equal(short.total, 0, '不足窗口行数不检测')
})

test('findDuplicates：全空窗口不计、空文件跳过', () => {
  const blanks = Array.from({ length: 20 }, () => '').join('\n')
  const result = findDuplicates([
    { path: 'a.ts', text: blanks },
    { path: 'b.ts', text: blanks },
    { path: 'c.ts', text: '' },
  ])
  assert.equal(result.total, 0)
  assert.equal(result.filesScanned, 3)
})

test('findDuplicates：组数上限截断但总数精确', () => {
  const first = SHARED_BLOCK
  const second = [
    'class Other {',
    '  run() {',
    '    return 1',
    '  }',
    '  stop() {',
    '    return 2',
    '  }',
    '  reset() {',
    '    return 3',
    '  }',
  ]
  const result = findDuplicates([
    { path: 'a.ts', text: first.join('\n') },
    { path: 'b.ts', text: first.join('\n') },
    { path: 'c.ts', text: second.join('\n') },
    { path: 'd.ts', text: second.join('\n') },
  ], { maxGroups: 1, windowLines: 6 })
  assert.ok(result.total >= 2, `期望至少两个块，实际 ${result.total}`)
  assert.equal(result.groups.length, 1)
  assert.equal(MAX_DUPLICATE_GROUPS, 20)
})

test('findDuplicates：超行数上限的文件跳过并计数', () => {
  const long = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
  const result = findDuplicates([
    { path: 'a.ts', text: long },
    { path: 'b.ts', text: long },
  ], { maxLinesPerFile: 10 })
  assert.equal(result.filesScanned, 0)
  assert.equal(result.filesSkipped, 2)
  assert.equal(result.total, 0)
})
