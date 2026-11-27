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

test('extractPrompt：python 围栏、方法父级与未知语言空围栏', () => {
  const py = extractPrompt({
    path: 'pkg/mod.py', lang: 'python', source: 'def f(): pass',
    symbols: [{ name: 'f', kind: 'method', line: 2, parent: 'Service' }], truncated: false,
  }, 'en')
  assert.match(py, /- f \(method, line 2, in Service\)/)
  assert.match(py, /```python/)

  // Ruby/Swift/Scala 使用各自围栏，未知语言保持无语言标识
  for (const lang of ['ruby', 'swift', 'scala']) {
    const fenced = extractPrompt({ path: `a.${lang}`, lang, source: 'x', symbols: [], truncated: false }, 'en')
    assert.match(fenced, new RegExp('````' + lang), `${lang} 围栏`)
  }
  const other = extractPrompt({ path: 'a.f90', lang: 'fortran', source: 'print *, 1', symbols: [], truncated: false }, 'en')
  assert.match(other, /````\nprint \*, 1/)
})

test('extractPrompt：项目技术栈与模块路径约束 relatedModules', () => {
  const file = { path: 'src/a.ts', lang: 'typescript', source: 'x', symbols: [], truncated: false }
  const full = extractPrompt(file, 'en', {
    projectName: 'demo', technologies: ['React', 'TypeScript'], modules: ['src', 'src/tools'],
  })
  assert.match(full, /Project: demo \(React, TypeScript\)/)
  assert.match(full, /Modules: src, src\/tools/)
  assert.match(full, /do not invent new ones/)

  const stackOnly = extractPrompt(file, 'en', { technologies: ['Go'] })
  assert.match(stackOnly, /Project stack: Go/)
  assert.doesNotMatch(stackOnly, /Modules:/)

  const plain = extractPrompt(file, 'en')
  assert.doesNotMatch(plain, /Project:/, '无上下文时不注入项目行')
})

test('generatePrompt：卡片摘要、符号行号、技术栈与分组指令', () => {
  const p = generatePrompt(
    [{
      path: 'src/a.js', title: 'A', summary: '做 A 事', module: 'src',
      symbols: [{ name: 'fa', kind: 'function', line: 12, endLine: 20 }], tags: ['x'],
    }],
    { projectName: 'demo', technologies: [{ name: 'React', ecosystem: 'npm' }] },
    'en',
  )
  assert.match(p, /Project: demo/)
  assert.match(p, /React \(npm\)/)
  assert.match(p, /src\/a\.js — A/)
  assert.match(p, /module: src/)
  assert.match(p, /做 A 事/)
  assert.match(p, /fa \(function, L12-L20\)/)
  assert.match(p, /"sources" array/)
  assert.match(p, /Do not produce one page per card/)
  assert.match(p, /English/)
})

test('generatePrompt：已采信记忆注入约定/决策指令', () => {
  const withMem = generatePrompt(
    [{ path: 'src/a.js', title: 'A', summary: 's', symbols: [], tags: [] }],
    { technologies: [] },
    'zh',
    [{ title: '索引前先建清单', summary: '变更传导按文件级为主。' }],
  )
  assert.match(withMem, /Reviewed session knowledge \(1\):/)
  assert.match(withMem, /索引前先建清单 — 变更传导按文件级为主。/)
  assert.match(withMem, /authoritative project convention and decision context/)

  const withoutMem = generatePrompt([], { technologies: [] }, 'zh')
  assert.match(withoutMem, /Reviewed session knowledge \(0\):\n\(none\)/)
})

test('generatePrompt：缺符号数组/缺行号/同行号与空技术栈', () => {
  const p = generatePrompt(
    [
      // 无 symbols / module / tags：全部走默认占位
      { path: 'src/a.js', title: 'A', summary: 's', tags: [] },
      {
        path: 'src/b.js', title: 'B', summary: 's', module: '', tags: ['t'],
        symbols: [
          { name: 'fb', kind: 'function', line: 3, endLine: 3 },
          { name: 'constC', kind: 'variable' },
        ],
      },
    ],
    { technologies: [] },
    'zh',
  )
  assert.match(p, /module: \./)
  assert.match(p, /symbols: \(none\)/)
  assert.match(p, /fb \(function, L3\)/, 'endLine 与 line 相同不输出区间')
  assert.match(p, /constC \(variable\)/, '缺行号只输出符号名与类型')
  assert.match(p, /Tech stack: \(none detected\)/)
  assert.match(p, /Project: \(unnamed\)/)
})

test('generatePrompt：模块依赖摘要与约束指令', () => {
  const p = generatePrompt(
    [{ path: 'src/a.js', title: 'A', summary: 's', symbols: [], tags: [] }],
    { technologies: [] },
    'zh',
    [],
    [{ from: 'src', to: 'src/core', count: 2 }],
  )
  assert.match(p, /Module dependencies computed from the index \(1\):/)
  assert.match(p, /- src → src\/core \(2 edge\(s\)\)/)
  assert.match(p, /use only those directions and do not add dependencies/)
  const empty = generatePrompt([], { technologies: [] }, 'zh')
  assert.match(empty, /Module dependencies computed from the index \(0\):\n\(none\)/)
})

test('generatePrompt：循环依赖组与架构风险指令', () => {
  const p = generatePrompt(
    [{ path: 'src/a.js', title: 'A', summary: 's', symbols: [], tags: [] }],
    { technologies: [] },
    'en',
    [],
    [],
    [{ files: ['src/a.ts', 'src/b.ts'], size: 2 }],
  )
  assert.match(p, /Import cycles detected in the index \(1\):/)
  assert.match(p, /- src\/a\.ts ↔ src\/b\.ts/)
  assert.match(p, /call out the circular dependency as an architectural risk/)

  // 带代表性环路径时附加 cycle 提示（便于模型指出具体断链位置）
  const withSample = generatePrompt([], { technologies: [] }, 'en', [], [], [
    { files: ['a.ts', 'b.ts'], size: 2, sample: ['a.ts', 'b.ts', 'a.ts'] },
  ])
  assert.match(withSample, /- a\.ts ↔ b\.ts — cycle: a\.ts → b\.ts → a\.ts/)

  // 大组只列前 4 个文件并标注剩余数量
  const big = generatePrompt([], { technologies: [] }, 'en', [], [], [
    { files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'], size: 5 },
  ])
  assert.match(big, /- a\.ts ↔ b\.ts ↔ c\.ts ↔ d\.ts \(\+1 more\)/)

  const empty = generatePrompt([], { technologies: [] }, 'en')
  assert.match(empty, /Import cycles detected in the index \(0\):\n\(none\)/)
  assert.match(empty, /when the list is \(none\), do not invent cycles/)
})

test('generatePrompt：mermaid 指令引导 flowchart 与 subgraph 分组', () => {
  const prompt = generatePrompt([], { technologies: [] }, 'zh')
  assert.match(prompt, /add a mermaid diagram in the mermaid field/)
  assert.match(prompt, /mermaid syntax only, no fences/)
  assert.match(prompt, /"flowchart TD" or "flowchart LR"/, '指定支持的图类型')
  assert.match(prompt, /"subgraph <name>" … "end"/, '引导模块/层分组')
  assert.match(prompt, /keep node labels short/)
})

test('generatePrompt：fan-in hub 与改动风险指令', () => {
  const p = generatePrompt(
    [{ path: 'src/a.js', title: 'A', summary: 's', symbols: [], tags: [] }],
    { technologies: [] },
    'zh',
    [],
    [],
    [],
    [{ path: 'src/utils.ts', dependents: 7 }, { path: 'src/types.ts', dependents: 3 }],
  )
  assert.match(p, /High-fan-in files computed from the index \(2\):/)
  assert.match(p, /- src\/utils\.ts \(7 importer\(s\)\)/)
  assert.match(p, /- src\/types\.ts \(3 importer\(s\)\)/)
  assert.match(p, /mention those files by path; when the list is \(none\), do not invent such files/)

  const empty = generatePrompt([], { technologies: [] }, 'en')
  assert.match(empty, /High-fan-in files computed from the index \(0\):\n\(none\)/)
})
