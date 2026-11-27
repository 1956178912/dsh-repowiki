/**
 * 词法级符号使用点：标识符边界、注释/导入块排除、截断与依赖方聚合。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findSymbolUsages, usageImporters, selectUsageFiles,
  MAX_USAGES_PER_SYMBOL, MAX_USAGE_FILES,
} from '../src/usages.js'

test('usages：标识符边界与大小写敏感', () => {
  const source = [
    "import { parseConfig } from './config'",
    'const a = parseConfig()',
    'const b = parseConfigV2()',
    'const c = myParseConfig',
    'const d = ParseConfig',
  ].join('\n')
  const found = findSymbolUsages(source, 'parseConfig', { skipLines: [1] })
  assert.deepEqual(found.usages.map(item => item.line), [2])
  assert.equal(found.usages[0].text, 'const a = parseConfig()')
  assert.equal(found.truncated, false)
})

test('usages：跳过整行注释、空行与给定行号', () => {
  const source = [
    '// parseConfig in a line comment',
    '',
    '/* parseConfig in a block comment */',
    '  # parseConfig in Python/Ruby/Shell',
    'const ok = parseConfig(1)',
    '-- parseConfig in SQL/Lua',
    '<!-- parseConfig in HTML -->',
  ].join('\n')
  const found = findSymbolUsages(source, 'parseConfig')
  assert.deepEqual(found.usages.map(item => item.line), [5])
  const skipped = findSymbolUsages(source, 'parseConfig', { skipLines: [5] })
  assert.deepEqual(skipped.usages, [])
})

test('usages：单行与多行导入块不产生使用点', () => {
  const multi = [
    'import {',
    '  a1,',
    '  a2 as renamed,',
    "} from './a'",
    'export const b1 = a1',
  ].join('\n')
  assert.deepEqual(findSymbolUsages(multi, 'a1').usages.map(item => item.line), [5])
  assert.deepEqual(findSymbolUsages(multi, 'renamed').usages, [])

  const python = [
    'from a import (',
    '    helper,',
    ')',
    'value = helper()',
  ].join('\n')
  assert.deepEqual(findSymbolUsages(python, 'helper').usages.map(item => item.line), [4])

  const rust = [
    'use crate::{',
    '    helper,',
    '};',
    'let value = helper();',
  ].join('\n')
  assert.deepEqual(findSymbolUsages(rust, 'helper').usages.map(item => item.line), [4])

  const single = "import { helper } from './a'\nconst value = helper()"
  assert.deepEqual(findSymbolUsages(single, 'helper').usages.map(item => item.line), [2])
})

test('usages：解构绑定与 require 行不作为使用点', () => {
  const destructure = [
    'const {',
    '  helper,',
    "} = require('./a')",
    'const value = helper()',
  ].join('\n')
  assert.deepEqual(findSymbolUsages(destructure, 'helper').usages.map(item => item.line), [4])

  const single = "const { helper } = require('./a')\nhelper()"
  assert.deepEqual(findSymbolUsages(single, 'helper').usages.map(item => item.line), [2])

  const arrayForm = [
    'const [',
    '  helper,',
    '] = load()',
    'helper()',
  ].join('\n')
  assert.deepEqual(findSymbolUsages(arrayForm, 'helper').usages.map(item => item.line), [4])
})

test('usages：非整数 skipLines 与 limit 参数被忽略', () => {
  const source = 'a = helper()\nb = helper()'
  const found = findSymbolUsages(source, 'helper', { skipLines: [0, -1, 1.5], limit: 0 })
  assert.deepEqual(found.usages.map(item => item.line), [1, 2])
  const skipSecond = findSymbolUsages(source, 'helper', { skipLines: [2] })
  assert.deepEqual(skipSecond.usages.map(item => item.line), [1])
})

test('usages：上限截断与超长行截断', () => {
  const lines = Array.from({ length: 15 }, () => 'x = parseConfig()')
  const found = findSymbolUsages(lines.join('\n'), 'parseConfig', { limit: 3 })
  assert.equal(found.usages.length, 3)
  assert.equal(found.truncated, true)

  const long = `z = parseConfig(${'a'.repeat(300)})`
  const one = findSymbolUsages(long, 'parseConfig')
  assert.equal(one.usages[0].text.length, 200)
  assert.ok(one.usages[0].text.endsWith('…'))
  assert.equal(MAX_USAGES_PER_SYMBOL, 10)
})

test('usages：aliasNames 按导入方实际使用的别名定位', () => {
  const source = ['import { parseValue } from "./core"', 'const x = parseValue()', 'const y = parse()'].join('\n')
  const found = findSymbolUsages(source, 'parse', { skipLines: [1], aliasNames: ['parseValue'] })
  assert.deepEqual(found.usages.map(item => item.line), [2, 3])
})

test('usages：正则特殊字符符号名按字面量匹配', () => {
  const source = ['const $ = 1', '$(el).hide()', 'const y = $x'].join('\n')
  const found = findSymbolUsages(source, '$', { skipLines: [1] })
  assert.deepEqual(found.usages.map(item => item.line), [2])
  const empty = findSymbolUsages('const x = 1', '')
  assert.deepEqual(empty, { usages: [], truncated: false })
})

test('usages：usageImporters 只认具名导入、排除自引用并聚合行号', () => {
  const edges = [
    { from: 'b.ts', to: 'a.ts', line: 2, symbols: ['a1'] },
    { from: 'b.ts', to: 'a.ts', line: 5, symbols: ['a1'] },
    { from: 'c.ts', to: 'a.ts', line: 1, symbols: ['a2'] },
    { from: 'd.ts', to: 'a.ts', line: 3 },
    { from: 'a.ts', to: 'a.ts', line: 1, symbols: ['a1'] },
    { from: 'e.ts', to: 'x.ts', line: 1, symbols: ['a1'] },
    { from: 'f.ts', to: 'a.ts', symbols: ['a1'] },
    null,
    { from: 42, to: 'a.ts', symbols: ['a1'] },
  ]
  assert.deepEqual(usageImporters(edges, { path: 'a.ts', name: 'a1' }), [
    { path: 'b.ts', importLines: [2, 5] },
    { path: 'f.ts', importLines: [] },
  ])
  assert.deepEqual(usageImporters(edges, { path: 'a.ts', name: 'a2' }), [
    { path: 'c.ts', importLines: [1] },
  ])
  assert.deepEqual(usageImporters(edges, { path: 'a.ts', name: 'nope' }), [])
  assert.deepEqual(usageImporters([], { path: 'a.ts', name: 'a1' }), [])
  assert.deepEqual(usageImporters(edges, { path: 'a.ts', name: '' }), [])
  assert.deepEqual(usageImporters(edges, null), [])
  assert.deepEqual(
    usageImporters([{ from: 'ns.ts', to: 'a.ts', line: 1, symbols: ['*'] }], { path: 'a.ts', name: 'a1' }),
    [{ path: 'ns.ts', importLines: [1] }],
    '命名空间导入作为潜在导入方参与词法扫描',
  )
})

test('usages：usageImporters 沿 barrel 再导出链纳入最终导入方', () => {
  const edges = [
    { from: 'index.ts', to: 'core.ts', kind: 'export-from', line: 1, symbols: ['*'] },
    { from: 'app.ts', to: 'index.ts', kind: 'import', line: 2, symbols: ['parse'] },
    { from: 'other.ts', to: 'index.ts', kind: 'import', line: 3, symbols: ['other'] },
  ]
  const files = [
    { path: 'index.ts', symbols: [] },
    { path: 'core.ts', symbols: [{ name: 'parse', exported: true }] },
  ]
  assert.deepEqual(usageImporters(edges, { path: 'core.ts', name: 'parse' }, files), [
    { path: 'app.ts', importLines: [2] },
    { path: 'index.ts', importLines: [1] },
  ], '链上导入方与 barrel 本身都进入候选（后者靠词法扫描确认）')
  assert.deepEqual(usageImporters(edges, { path: 'core.ts', name: 'other' }, files), [
    { path: 'index.ts', importLines: [1] },
  ], '未在定义文件出现的符号不因同名边被误认')
})

test('usages：多级 barrel 与具名再导出链', () => {
  const edges = [
    { from: 'index.ts', to: 'impl/index.ts', kind: 'export-from', line: 1, symbols: ['*'] },
    { from: 'impl/index.ts', to: 'impl/core.ts', kind: 'export-from', line: 2, symbols: ['parse'] },
    { from: 'app.ts', to: 'index.ts', kind: 'import', line: 4, symbols: ['parse'] },
  ]
  const files = [
    { path: 'index.ts', symbols: [] },
    { path: 'impl/index.ts', symbols: [] },
    { path: 'impl/core.ts', symbols: [{ name: 'parse', exported: true }] },
  ]
  assert.deepEqual(usageImporters(edges, { path: 'impl/core.ts', name: 'parse' }, files), [
    { path: 'app.ts', importLines: [4] },
    { path: 'impl/index.ts', importLines: [2] },
  ], '中间 barrel 的再导出边不作为使用点，最终导入方沿链补齐')
})

test('usages：usageImporters 识别 Python 包 __init__ barrel', () => {
  const edges = [
    { from: 'pkg/__init__.py', to: 'pkg/core.py', kind: 'import', line: 1, symbols: ['parse'] },
    { from: 'pkg/app.py', to: 'pkg/__init__.py', kind: 'import', line: 1, symbols: ['parse'] },
  ]
  const files = [
    { path: 'pkg/__init__.py', lang: 'python', symbols: [] },
    { path: 'pkg/core.py', lang: 'python', symbols: [{ name: 'parse', exported: true }] },
    { path: 'pkg/app.py', lang: 'python', symbols: [] },
  ]
  assert.deepEqual(usageImporters(edges, { path: 'pkg/core.py', name: 'parse' }, files), [
    { path: 'pkg/__init__.py', importLines: [1] },
    { path: 'pkg/app.py', importLines: [1] },
  ])
  assert.deepEqual(usageImporters(edges, { path: 'pkg/core.py', name: 'parse' }, []), [
    { path: 'pkg/__init__.py', importLines: [1] },
  ])
})

test('usages：usageImporters 识别 Rust pub use 再导出', () => {
  const edges = [
    { from: 'src/lib.rs', to: 'src/core.rs', kind: 'reexport', line: 2, symbols: ['Foo'] },
    { from: 'src/app.rs', to: 'src/lib.rs', kind: 'import', line: 1, symbols: ['Foo'] },
  ]
  const files = [
    { path: 'src/lib.rs', lang: 'rust', symbols: [] },
    { path: 'src/core.rs', lang: 'rust', symbols: [{ name: 'Foo', kind: 'class', exported: true }] },
    { path: 'src/app.rs', lang: 'rust', symbols: [] },
  ]
  assert.deepEqual(usageImporters(edges, { path: 'src/core.rs', name: 'Foo' }, files), [
    { path: 'src/app.rs', importLines: [1] },
    { path: 'src/lib.rs', importLines: [2] },
  ])
})

test('usages：usageImporters 识别别名再导出', () => {
  const edges = [
    { from: 'src/index.ts', to: 'src/core.ts', kind: 'export-from', line: 1, symbols: ['parse'], aliases: [{ from: 'parse', to: 'parseValue' }] },
    { from: 'src/app.ts', to: 'src/index.ts', kind: 'import', line: 1, symbols: ['parseValue'] },
  ]
  const files = [
    { path: 'src/index.ts', symbols: [] },
    { path: 'src/core.ts', symbols: [{ name: 'parse', exported: true }] },
    { path: 'src/app.ts', symbols: [] },
  ]
  assert.deepEqual(usageImporters(edges, { path: 'src/core.ts', name: 'parse' }, files), [
    { path: 'src/app.ts', importLines: [1], names: ['parseValue'] },
    { path: 'src/index.ts', importLines: [1] },
  ], '别名导入方带实际扫描名')
})

test('usages：具名导入别名作为本地扫描名', () => {
  const edges = [
    { from: 'src/app.ts', to: 'src/a.ts', line: 1, symbols: ['parse'], aliases: [{ from: 'parse', to: 'parseValue' }] },
    { from: 'src/barrel.ts', to: 'src/a.ts', line: 2, kind: 'export-from', symbols: ['parse'], aliases: [{ from: 'parse', to: 'exported' }] },
  ]
  assert.deepEqual(usageImporters(edges, { path: 'src/a.ts', name: 'parse' }, []), [
    { path: 'src/app.ts', importLines: [1], names: ['parseValue'] },
    { path: 'src/barrel.ts', importLines: [2] },
  ], '普通导入别名进入扫描名，再导出别名不误当本地绑定')
})

test('usages：默认导入别名作为本地扫描名', () => {
  const edges = [
    { from: 'src/app.ts', to: 'src/a.ts', line: 1, symbols: ['parse'], aliases: [{ from: 'parse', to: 'thing' }] },
  ]
  const files = [{ path: 'src/a.ts', symbols: [{ name: 'parse', exported: true, default: true }] }]
  assert.deepEqual(usageImporters(edges, { path: 'src/a.ts', name: 'parse' }, files), [
    { path: 'src/app.ts', importLines: [1], names: ['thing'] },
  ])
})

test('usages：selectUsageFiles 去重排序并按上限截断', () => {
  const selected = selectUsageFiles([{ path: 'b.ts' }, { path: 'a.ts' }, { path: 'b.ts' }], 1)
  assert.deepEqual(selected, { scanned: ['a.ts'], skipped: 1 })
  assert.deepEqual(selectUsageFiles([{ path: 'a.ts' }, { path: 'b.ts' }]), {
    scanned: ['a.ts', 'b.ts'], skipped: 0,
  })
  assert.deepEqual(selectUsageFiles([{ path: 'a.ts' }, { path: 42 }, null], 0), {
    scanned: ['a.ts'], skipped: 0,
  })
  assert.equal(MAX_USAGE_FILES, 20)
})

test('usages：skipRanges 排除定义范围并忽略非法区间', () => {
  const source = [
    'export function parseConfig() {',
    '  return parseConfig.cache',
    '}',
    'export const first = parseConfig()',
  ].join('\n')
  const found = findSymbolUsages(source, 'parseConfig', { skipRanges: [[1, 3]] })
  assert.deepEqual(found.usages.map(item => item.line), [4], '定义体内部不计入使用点')

  const invalid = findSymbolUsages(source, 'parseConfig', {
    skipRanges: [[0, 2], [4, 2], ['a', 2], [1], null],
  })
  assert.deepEqual(invalid.usages.map(item => item.line), [1, 2, 4], '非法区间被忽略')
})
