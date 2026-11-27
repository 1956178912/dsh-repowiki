/**
 * 函数级圈复杂度估算单元测试：分支计数、阈值排序与降级。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeComplexity, COMPLEXITY_THRESHOLD, MAX_COMPLEXITY_ENTRIES,
} from '../src/complexity.js'

test('computeComplexity：行首分支与逻辑运算符计数', () => {
  const text = [
    'export function simple(a) {',
    '  if (a) {',
    '    return 1',
    '  }',
    '  for (const x of a) {',
    '    if (x && a) {',
    '      return 2',
    '    }',
    '  }',
    '  return a && a.length',
    '}',
  ].join('\n')
  const source = { path: 'src/a.ts', text }
  const files = [{
    path: 'src/a.ts',
    symbols: [{ name: 'simple', kind: 'function', line: 1, endLine: 11 }],
  }]
  const result = computeComplexity(files, [source])
  assert.equal(result.total, 1)
  assert.equal(result.max, 6, '1 + if + for + if + && + &&')
  assert.deepEqual(result.high, [])
  assert.equal(result.threshold, COMPLEXITY_THRESHOLD)
})

test('computeComplexity：非函数符号不计、缺失源码跳过', () => {
  const files = [
    {
      path: 'a.ts',
      symbols: [
        { name: 'C', kind: 'class', line: 1, endLine: 5 },
        { name: 'v', kind: 'variable', line: 2, endLine: 2 },
      ],
    },
    { path: 'missing.ts', symbols: [{ name: 'f', kind: 'function', line: 1, endLine: 3 }] },
  ]
  const result = computeComplexity(files, [{ path: 'a.ts', text: 'class C {}\n' }])
  assert.equal(result.total, 0)
  assert.equal(result.average, 0)
  assert.equal(result.max, 0)
  assert.deepEqual(result.high, [])
})

test('computeComplexity：高复杂度函数按复杂度降序并有界', () => {
  const bigLines = ['export function huge() {']
  for (let i = 0; i < 16; i++) bigLines.push('  if (x) { return 1 }')
  bigLines.push('}')
  const midLines = ['export function mid() {']
  for (let i = 0; i < 14; i++) midLines.push('  if (x) { return 1 }')
  midLines.push('}')
  const files = [
    { path: 'big.ts', symbols: [{ name: 'huge', kind: 'function', line: 1, endLine: bigLines.length }] },
    { path: 'mid.ts', symbols: [{ name: 'mid', kind: 'function', line: 1, endLine: midLines.length }] },
  ]
  const sources = [
    { path: 'big.ts', text: bigLines.join('\n') },
    { path: 'mid.ts', text: midLines.join('\n') },
  ]
  const result = computeComplexity(files, sources)
  assert.equal(result.total, 2)
  assert.equal(result.max, 17)
  assert.deepEqual(result.high.map(entry => [entry.path, entry.name, entry.complexity]), [
    ['big.ts', 'huge', 17],
    ['mid.ts', 'mid', 15],
  ])
  assert.equal(MAX_COMPLEXITY_ENTRIES, 10)

  const strict = computeComplexity(files, sources, { threshold: 20 })
  assert.deepEqual(strict.high, [])
})

test('computeComplexity：endLine 越过文件尾时截断', () => {
  const files = [{
    path: 'a.ts',
    symbols: [{ name: 'f', kind: 'function', line: 1, endLine: 999 }],
  }]
  const result = computeComplexity(files, [{ path: 'a.ts', text: 'function f() {\n  if (x) {}\n}' }])
  assert.equal(result.total, 1)
  assert.equal(result.max, 2)
})

test('computeComplexity：highTotal 精确、high 按 limit 截断', () => {
  const lines = ['function f() {']
  for (let i = 0; i < 12; i++) lines.push('  if (x) { return 1 }')
  lines.push('}')
  const files = [{ path: 'a.js', symbols: [{ name: 'f', kind: 'function', line: 1, endLine: lines.length }] }]
  const sources = [{ path: 'a.js', text: lines.join('\n') }]
  const bounded = computeComplexity(files, sources, { threshold: 5, limit: 2 })
  assert.equal(bounded.highTotal, 1, '只有一个函数达到阈值')
  assert.equal(bounded.high.length, 1)

  const manyFiles = Array.from({ length: 4 }, (_, index) => ({
    path: `f${index}.js`,
    symbols: [{ name: `f${index}`, kind: 'function', line: 1, endLine: lines.length }],
  }))
  const manySources = manyFiles.map(file => ({ path: file.path, text: lines.join('\n') }))
  const capped = computeComplexity(manyFiles, manySources, { threshold: 5, limit: 2 })
  assert.equal(capped.highTotal, 4, 'highTotal 不受明细上限影响')
  assert.equal(capped.high.length, 2)
})

test('computeComplexity：空输入返回零值', () => {
  const result = computeComplexity([], [])
  assert.deepEqual(result, {
    total: 0, threshold: COMPLEXITY_THRESHOLD, average: 0, max: 0, highTotal: 0, high: [],
  })
})
