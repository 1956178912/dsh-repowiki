/**
 * 依赖边提取单元测试。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { extractImports } from '../src/deps.js'

test('JS：各类 import 形态均可提取', () => {
  const code = [
    "import react from 'react';",
    "import { a, b as c } from './foo';",
    "import * as ns from '../pkg/mod';",
    "import 'side-effect.css';",
    "import type { T } from './types';",
    "export { x } from './re-export';",
    "export * from './star';",
    "const r = require('./cjs');",
    "const d = await import('./dyn');",
    "// import 'not-a-line'",
  ].join('\n')
  const refs = extractImports(code, 'javascript')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))

  assert.ok(bySpec.has('react') && !bySpec.get('react').relative, '裸包非相对')
  assert.ok(bySpec.get('./foo').relative, './foo 相对')
  assert.ok(bySpec.get('../pkg/mod').relative, '../pkg/mod 相对')
  assert.equal(bySpec.get('./foo').imported.length, 2, '具名导入两个符号')
  assert.ok(bySpec.get('./foo').imported.includes('a'))
  assert.ok(bySpec.get('./foo').imported.includes('b'), 'as 别名归一为原名')
  assert.equal(bySpec.get('./types').imported[0], 'T', 'type 导入保留符号名')
  assert.equal(bySpec.get('./re-export').kind, 'export-from', 're-export 形态')
  assert.equal(bySpec.get('./cjs').kind, 'require', 'require 形态')
  assert.equal(bySpec.get('./dyn').kind, 'require', '动态 import 形态')
  assert.ok(bySpec.has('side-effect.css'), '副作用 import')
  assert.equal(refs.filter(r => r.specifier === 'not-a-line').length, 0, '注释行不算')
})

test('JS：imported 为空时不是 undefined', () => {
  const refs = extractImports("import 'x';\n", 'javascript')
  assert.deepEqual(refs[0].imported, [])
})

test('Python：import / from-import / 相对 import', () => {
  const code = [
    'import os',
    'import a.b.c as abc',
    'from os.path import join, dirname as dn',
    'from . import sibling',
    'from ..pkg import mod as m',
  ].join('\n')
  const refs = extractImports(code, 'python')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))

  assert.ok(bySpec.has('os') && !bySpec.get('os').relative)
  assert.ok(bySpec.has('a.b.c'))
  assert.deepEqual(bySpec.get('os.path').imported, ['join', 'dirname'], 'as 别名归一为原名')
  assert.ok(bySpec.get('.').relative, 'from . import 相对')
  assert.ok(bySpec.get('..pkg').relative, 'from ..pkg 相对')
  assert.deepEqual(bySpec.get('..pkg').imported, ['mod'], '具名符号')
})

test('边界：空字符串与不支持语言', () => {
  assert.deepEqual(extractImports('', 'python'), [])
  assert.deepEqual(extractImports('puts 1', 'ruby'), [])
})
