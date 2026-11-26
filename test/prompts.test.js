/**
 * prompt 构造单元测试。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { extractPrompt, generatePrompt } from '../src/prompts.js'

test('extractPrompt：自包含文件信息、符号、语言指令', () => {
  const p = extractPrompt({
    path: 'src/indexer.js', lang: 'javascript', source: 'export function buildIndex() {}',
    symbols: [{ name: 'buildIndex', kind: 'function', line: 1, endLine: 1 }], truncated: false,
  }, 'zh')
  assert.match(p, /src\/indexer\.js/)
  assert.match(p, /buildIndex \(function, line 1\)/)
  assert.match(p, /中文/)
  assert.match(p, /```javascript/)
  assert.match(p, /export function buildIndex/)
  assert.match(p, /matching the requested schema/)
  assert.ok(!p.includes('NOTE: the source is truncated'))
})

test('extractPrompt：截断时包含截断提示', () => {
  const p = extractPrompt({ path: 'a.ts', lang: 'typescript', source: 'x'.repeat(100), symbols: [], truncated: true }, 'en')
  assert.match(p, /truncated at/)
})

test('generatePrompt：卡片摘要、技术栈与分组指令', () => {
  const p = generatePrompt(
    [{ path: 'src/a.js', title: 'A', summary: '做 A 事', keySymbols: [{ name: 'fa', note: '函数 a' }], tags: ['x'] }],
    { projectName: 'demo', technologies: [{ name: 'React', ecosystem: 'npm' }] },
    'en',
  )
  assert.match(p, /Project: demo/)
  assert.match(p, /React \(npm\)/)
  assert.match(p, /src\/a\.js — A/)
  assert.match(p, /做 A 事/)
  assert.match(p, /fa \(函数 a\)/)
  assert.match(p, /Do not produce one page per card/)
  assert.match(p, /English/)
})
