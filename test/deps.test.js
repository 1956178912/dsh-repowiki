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
    "export * as ns from './ns-barrel';",
    "const r = require('./cjs');",
    "const d = await import('./dyn');",
    "// import 'not-a-line'",
  ].join('\n')
  const refs = extractImports(code, 'javascript')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))

  assert.ok(bySpec.has('react') && !bySpec.get('react').relative, '裸包非相对')
  assert.deepEqual(bySpec.get('react').imported, ['default:react'], '默认导入记为待解析标记')
  assert.ok(bySpec.get('./foo').relative, './foo 相对')
  assert.ok(bySpec.get('../pkg/mod').relative, '../pkg/mod 相对')
  assert.equal(bySpec.get('./foo').imported.length, 2, '具名导入两个符号')
  assert.ok(bySpec.get('./foo').imported.includes('a'))
  assert.ok(bySpec.get('./foo').imported.includes('b'), 'as 别名归一为原名')
  assert.deepEqual(bySpec.get('./foo').aliases, [{ from: 'b', to: 'c' }], '本地别名进入 aliases')
  assert.equal(bySpec.get('./types').imported[0], 'T', 'type 导入保留符号名')
  assert.deepEqual(bySpec.get('../pkg/mod').imported, ['*'], '命名空间导入记为通配符')
  assert.deepEqual(bySpec.get('./star').imported, ['*'], 'export * 再导出全部符号')
  assert.deepEqual(bySpec.get('./ns-barrel').imported, [],
    'export * as ns 只导出命名空间对象，不展开目标符号')
  assert.equal(bySpec.get('./ns-barrel').kind, 'export-from')
  assert.equal(bySpec.get('./re-export').kind, 'export-from', 're-export 形态')
  assert.equal(bySpec.get('./cjs').kind, 'require', 'require 形态')
  assert.equal(bySpec.get('./dyn').kind, 'require', '动态 import 形态')
  assert.ok(bySpec.has('side-effect.css'), '副作用 import')
  assert.equal(refs.filter(r => r.specifier === 'not-a-line').length, 0, '注释行不算')
})

test('JS：多行 import/export-from 保留起始行与具名符号', () => {
  const code = [
    'import {',
    '  alpha,',
    '  beta as renamed,',
    '  // 注释不是符号',
    '  type Gamma,',
    "} from './multi';",
    'import main, {',
    '  delta,',
    "} from './mixed';",
    'export {',
    '  epsilon,',
    '  zeta as alias,',
    "} from './re-export';",
    "const later = require('./later');",
  ].join('\n')
  const refs = extractImports(code, 'typescript')
  const bySpec = new Map(refs.map(ref => [ref.specifier, ref]))
  assert.deepEqual(bySpec.get('./multi').imported, ['alpha', 'beta', 'Gamma'])
  assert.deepEqual(bySpec.get('./multi').aliases, [{ from: 'beta', to: 'renamed' }])
  assert.equal(bySpec.get('./multi').line, 1)
  assert.deepEqual(bySpec.get('./mixed').imported, ['default:main', 'delta'], '默认 + 具名混合')
  assert.equal(bySpec.get('./mixed').line, 7)
  assert.deepEqual(bySpec.get('./re-export').imported, ['epsilon', 'zeta'])
  assert.equal(bySpec.get('./re-export').kind, 'export-from')
  assert.equal(bySpec.get('./re-export').line, 10)
  assert.equal(bySpec.get('./later').line, 14, '多行语句后的依赖行号不漂移')
})

test('JS：export-from 别名记录原名与导出名', () => {
  const refs = extractImports([
    "export { foo as bar, baz } from './x';",
    "export { type T as U } from './types';",
  ].join('\n'), 'typescript')
  const bySpec = new Map(refs.map(ref => [ref.specifier, ref]))
  assert.deepEqual(bySpec.get('./x').imported, ['foo', 'baz'])
  assert.deepEqual(bySpec.get('./x').aliases, [{ from: 'foo', to: 'bar' }])
  assert.deepEqual(bySpec.get('./types').aliases, [{ from: 'T', to: 'U' }])
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

test('Python：from x import * 保留通配符，别名仍归一为原名', () => {
  const refs = extractImports([
    'from .core import *',
    'from .util import a as b, c  # 行尾注释',
  ].join('\n'), 'python')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))
  assert.deepEqual(bySpec.get('.core').imported, ['*'], '星号导入不再被丢弃')
  assert.deepEqual(bySpec.get('.util').imported, ['a', 'c'], '行尾注释不进入符号名')
  assert.deepEqual(bySpec.get('.util').aliases, [{ from: 'a', to: 'b' }], '别名记录原名与本地名')
})

test('Go：单条 import、分组 import、别名与点导入', () => {
  const code = [
    'package main',
    '',
    'import "fmt"',
    'import alias "example.com/demo/internal/greeter"',
    'import . "example.com/demo/dotpkg"',
    'import (',
    '  "os"',
    '  _ "embed"',
    ')',
    '// import "commented/out"',
  ].join('\n')
  const refs = extractImports(code, 'go')
  const specs = refs.map(r => r.specifier)
  assert.deepEqual(specs, ['fmt', 'example.com/demo/internal/greeter', 'example.com/demo/dotpkg', 'os', 'embed'])
  assert.ok(refs.every(r => r.relative), 'Go import 统一作为本地解析候选')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))
  assert.deepEqual(bySpec.get('example.com/demo/internal/greeter').imported, ['greeter'])
  assert.deepEqual(bySpec.get('example.com/demo/internal/greeter').aliases,
    [{ from: 'greeter', to: 'alias' }], 'Go 别名记录本地名')
  assert.deepEqual(bySpec.get('example.com/demo/dotpkg').imported, ['*'],
    '点导入把包内符号带入作用域，按潜在通配引用')
  assert.deepEqual(bySpec.get('embed').imported, [], '空白导入仅副作用，无符号引用')
  assert.equal(bySpec.get('fmt').aliases, undefined, '无别名不产生 aliases')
})

test('Dart：import/export/part 的通配、show/hide 与 as 前缀', () => {
  const code = [
    "import 'package:flutter/material.dart';",
    "import 'src/a.dart' show A, B;",
    "import 'src/b.dart' hide Hidden;",
    "import 'src/c.dart' show C hide D;",
    "import 'src/d.dart' as d;",
    "export 'src/e.dart' show E;",
    "export 'src/f.dart';",
    "part 'app.g.dart';",
    '// import commented/out.dart',
  ].join('\n')
  const refs = extractImports(code, 'dart')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))

  assert.deepEqual(bySpec.get('package:flutter/material.dart').imported, ['*'], '无组合子导入按潜在通配')
  assert.deepEqual(bySpec.get('src/a.dart').imported, ['A', 'B'], 'show 精确导入')
  assert.equal(bySpec.get('src/a.dart').hidden, undefined)
  assert.deepEqual(bySpec.get('src/b.dart').imported, ['*'])
  assert.deepEqual(bySpec.get('src/b.dart').hidden, ['Hidden'], 'hide 记排除名')
  assert.deepEqual(bySpec.get('src/c.dart').imported, ['C'], 'show 与 hide 组合时 hide 生效')
  assert.deepEqual(bySpec.get('src/d.dart').imported, ['*'], 'as 前缀不改变符号可见性')
  assert.equal(bySpec.get('src/e.dart').kind, 'export-from')
  assert.deepEqual(bySpec.get('src/e.dart').imported, ['E'], 'export show 记再导出名')
  assert.equal(bySpec.get('src/f.dart').kind, 'export-from')
  assert.deepEqual(bySpec.get('src/f.dart').imported, ['*'], '无组合子 export 记星号再导出')
  assert.deepEqual(bySpec.get('app.g.dart').imported, [], 'part 是同一编译单元')
  assert.ok(!bySpec.has('commented/out.dart'))
})

test('Rust：mod 声明、crate/self/super use 与分组 use', () => {
  const code = [
    'mod parser;',
    'pub mod ast;',
    'use crate::parser::Token;',
    'use super::util::Helper;',
    'use self::inner::Thing;',
    'use crate::{graph, lexer::{Lexer, Token as T}};',
    'use crate::parser::{self, Token};',
    'use crate::lexer::{self as lex};',
    'use serde::Serialize;',
    '// use not::real;',
  ].join('\n')
  const refs = extractImports(code, 'rust')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))

  assert.equal(bySpec.get('parser').kind, 'mod', 'mod 声明单独形态')
  assert.equal(bySpec.get('ast').kind, 'mod')
  assert.ok(bySpec.has('crate::parser::Token'))
  assert.deepEqual(bySpec.get('crate::parser::Token').imported, ['Token'])
  assert.ok(bySpec.has('super::util::Helper'))
  assert.ok(bySpec.has('self::inner::Thing'))
  assert.ok(bySpec.has('crate::graph'), '分组 use 展开为叶子路径')
  assert.ok(bySpec.has('crate::lexer::Lexer'))
  assert.deepEqual(bySpec.get('crate::lexer::Token').imported, ['Token'], '别名导入记录目标原名')
  assert.deepEqual(bySpec.get('crate::lexer::Token').aliases, [{ from: 'Token', to: 'T' }], '本地别名进入 aliases')
  assert.ok(bySpec.has('serde::Serialize'), '外部 crate 也记录（解析失败不计边）')
  assert.ok(!bySpec.has('not::real'), '注释不提取')
  // `use a::b::{self}` 等价于 `use a::b;`，不能产生 `::self` 伪路径
  assert.ok(!bySpec.has('crate::parser::self'), '{self} 不产生伪路径')
  assert.deepEqual(bySpec.get('crate::parser').imported, ['parser'], '{self} 导入模块名')
  assert.equal(bySpec.get('crate::parser').aliases, undefined, '无 as 不产生别名')
  assert.deepEqual(bySpec.get('crate::lexer').imported, ['lexer'], '{self as lex} 导入别名')
  assert.deepEqual(bySpec.get('crate::lexer').aliases, [{ from: 'lexer', to: 'lex' }],
    '{self as lex} 记录原名→本地名')
})

test('Rust：pub use 标记为再导出，星号与分组星号保留', () => {
  const code = [
    'pub use crate::core::Foo;',
    'use crate::core::Bar;',
    'pub use crate::core::*;',
    'pub use crate::core::{Baz, *};',
    'pub use crate::core::Old as Renamed;',
    'use crate::core::Local as Alias;',
  ].join('\n')
  const refs = extractImports(code, 'rust')
  assert.equal(refs.find(ref => ref.specifier === 'crate::core::Foo').kind, 'reexport')
  assert.equal(refs.find(ref => ref.specifier === 'crate::core::Bar').kind, 'import')
  const stars = refs.filter(ref => ref.imported.includes('*'))
  assert.deepEqual(stars.map(ref => [ref.specifier, ref.kind]), [
    ['crate::core', 'reexport'],
    ['crate::core', 'reexport'],
  ], '单条与分组星号都去掉 * 后按目标模块解析')
  const renamed = refs.find(ref => ref.specifier === 'crate::core::Old')
  assert.deepEqual([renamed.kind, renamed.imported, renamed.aliases], [
    'reexport', ['Old'], [{ from: 'Old', to: 'Renamed' }],
  ], 'pub use 别名记录目标原名并用于再导出解析')
  const localAlias = refs.find(ref => ref.specifier === 'crate::core::Local')
  assert.deepEqual([localAlias.kind, localAlias.imported, localAlias.aliases], [
    'import', ['Local'], [{ from: 'Local', to: 'Alias' }],
  ], '普通 use 也记录原名与本地别名')
})

test('Java：普通/静态/通配符 import', () => {
  const code = [
    'package com.acme;',
    'import com.acme.util.Helper;',
    'import static com.acme.util.Helper.run;',
    'import java.util.*;',
    'import static org.junit.Assert.*;',
  ].join('\n')
  const refs = extractImports(code, 'java')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))

  const helperRefs = refs.filter(r => r.specifier === 'com.acme.util.Helper')
  assert.deepEqual(helperRefs.map(r => r.imported), [['Helper'], ['run']],
    '普通导入归类名、static 导入归成员名')
  assert.ok(bySpec.get('java.util.*'))
  assert.deepEqual(bySpec.get('java.util.*').imported, [], '普通通配导入不声称具体符号')
  const assertRefs = refs.filter(r => r.specifier === 'org.junit.Assert')
  assert.deepEqual(assertRefs.map(r => r.imported), [['*']], '静态通配导入按潜在通配引用')
})

test('C#：using / global using / static / 别名', () => {
  const code = [
    'using System;',
    'global using App.Common;',
    'using static System.Math;',
    'using Alias = App.Models.User;',
    'using (var scope = Begin()) { }',
    '// using Commented.Out;',
  ].join('\n')
  const refs = extractImports(code, 'csharp')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))

  assert.ok(bySpec.has('System'))
  assert.ok(bySpec.has('App.Common'), 'global using')
  assert.ok(bySpec.has('System.Math'), 'using static 路径')
  assert.deepEqual(bySpec.get('System.Math').imported, ['Math'])
  assert.ok(bySpec.has('App.Models.User'), '别名右侧路径')
  assert.deepEqual(bySpec.get('App.Models.User').imported, ['User'], '别名导入仍归到原名')
  assert.deepEqual(bySpec.get('App.Models.User').aliases, [{ from: 'User', to: 'Alias' }],
    'using 别名进入 aliases')
  assert.equal(bySpec.get('System.Math').aliases, undefined, 'using static 不产生别名')
  assert.ok(!bySpec.has('Commented.Out'), '注释不提取')
  assert.ok(refs.every(r => r.relative), '统一作为本地解析候选')
})

test('C#：泛型/元组别名不做猜测', () => {
  const code = [
    'using Pair = (int a, int b);',
    'using ListOfInts = System.Collections.Generic.List<int>;',
    'using Plain = App.Models.Widget;',
  ].join('\n')
  const refs = extractImports(code, 'csharp')

  assert.equal(refs.length, 1, '泛型/元组别名形态不登记')
  assert.deepEqual(refs[0].aliases, [{ from: 'Widget', to: 'Plain' }])
})

test('Kotlin：import / 通配符 / as 别名', () => {
  const code = [
    'package com.acme',
    'import com.acme.util.Helper',
    'import com.acme.util.*',
    'import com.acme.util.Helper as H',
    '// import commented.out',
  ].join('\n')
  const refs = extractImports(code, 'kotlin')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))

  assert.deepEqual(bySpec.get('com.acme.util.Helper').imported, ['Helper'])
  assert.ok(bySpec.has('com.acme.util.*'))
  assert.deepEqual(bySpec.get('com.acme.util.*').imported, [])
  assert.equal(refs.filter(r => r.specifier === 'com.acme.util.Helper').length, 2, '别名导入仍是同一路径')
  const aliased = refs.find(r => Array.isArray(r.aliases))
  assert.deepEqual(aliased.imported, ['Helper'], 'Kotlin 别名导入归到原名')
  assert.deepEqual(aliased.aliases, [{ from: 'Helper', to: 'H' }], 'Kotlin as 别名进入 aliases')
  assert.ok(!bySpec.has('commented.out'))
})

test('PHP：use 分组/function/别名与 require 字面量', () => {
  const code = [
    '<?php',
    'use App\\Models\\User;',
    'use App\\Models\\{Post, Comment as C};',
    'use function App\\Helpers\\format;',
    'use App\\Support\\Clock as Time;',
    "require_once __DIR__ . '/bootstrap.php';",
    "require '../vendor/autoload.php';",
    '// use Commented\\Out;',
  ].join('\n')
  const refs = extractImports(code, 'php')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))

  assert.deepEqual(bySpec.get('App.Models.User').imported, ['User'])
  assert.equal(bySpec.get('App.Models.User').aliases, undefined, '无 as 不产生别名')
  assert.ok(bySpec.has('App.Models.Post'))
  assert.ok(bySpec.has('App.Models.Comment'), '分组别名保留原名')
  assert.deepEqual(bySpec.get('App.Models.Comment').imported, ['Comment'], '分组别名归到原名')
  assert.deepEqual(bySpec.get('App.Models.Comment').aliases, [{ from: 'Comment', to: 'C' }],
    '分组 as 别名进入 aliases')
  assert.deepEqual(bySpec.get('App.Support.Clock').imported, ['Clock'], 'use as 归到原名')
  assert.deepEqual(bySpec.get('App.Support.Clock').aliases, [{ from: 'Clock', to: 'Time' }],
    'use as 别名进入 aliases')
  assert.ok(bySpec.has('App.Helpers.format'), 'use function 路径')
  assert.equal(bySpec.get('./bootstrap.php').kind, 'require')
  assert.equal(bySpec.get('../vendor/autoload.php').kind, 'require')
  assert.ok(!bySpec.has('Commented.Out'))
})

test('Ruby：require / require_relative / load 的相对语义', () => {
  const code = [
    "require 'json'",
    "require 'active_support/all'",
    "require_relative '../lib/helper'",
    "require './local/config'",
    "load 'tasks/build.rake'",
    "# require 'commented'",
  ].join('\n')
  const refs = extractImports(code, 'ruby')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))

  assert.equal(bySpec.get('json').kind, 'require')
  assert.ok(!bySpec.get('json').relative, 'gem require 非相对')
  assert.ok(bySpec.get('../lib/helper').relative, 'require_relative 视为相对')
  assert.ok(bySpec.get('./local/config').relative, '显式 ./ 视为相对')
  assert.ok(!bySpec.get('tasks/build.rake').relative, '裸 load 走加载路径')
  assert.ok(!bySpec.has('commented'), '注释不提取')
})

test('Swift：module import、@testable 与子模块导入', () => {
  const code = [
    'import Foundation',
    '@testable import DemoCore',
    'import struct SwiftUI.Text',
    '// import Commented',
  ].join('\n')
  const refs = extractImports(code, 'swift')
  const specs = refs.map(r => r.specifier)

  assert.ok(specs.includes('Foundation'))
  assert.ok(specs.includes('DemoCore'), '@testable 导入')
  assert.ok(specs.includes('SwiftUI.Text'), '子模块导入保留点分路径')
  assert.ok(refs.every(r => r.relative), 'Swift import 作为本地目标候选（indexer 按 Sources/<Target> 解析）')
  assert.ok(!specs.includes('Commented'))
})

test('Scala：import 分组/重命名/通配与 as 别名', () => {
  const code = [
    'import com.acme.util.Helper',
    'import com.acme.util.{Api, Client => HttpClient, _}',
    'import scala.concurrent.ExecutionContext.Implicits.global',
    'import com.acme.core.*',
    'import com.acme.model.User as U',
    'import com.acme.store.{Repo as Store, Hidden => _}',
    '// import commented.out',
  ].join('\n')
  const refs = extractImports(code, 'scala')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))

  assert.deepEqual(bySpec.get('com.acme.util.Helper').imported, ['Helper'])
  assert.deepEqual(bySpec.get('com.acme.util.Api').imported, ['Api'])
  assert.deepEqual(bySpec.get('com.acme.util.Client').imported, ['Client'], '分组重命名归到原名')
  assert.deepEqual(bySpec.get('com.acme.util.Client').aliases, [{ from: 'Client', to: 'HttpClient' }],
    'Scala 2 分组重命名进入 aliases')
  assert.ok(bySpec.has('com.acme.util'), '分组内通配展开为包前缀')
  assert.deepEqual(bySpec.get('com.acme.util').imported, [])
  assert.deepEqual(bySpec.get('scala.concurrent.ExecutionContext.Implicits.global').imported, ['global'])
  assert.ok(bySpec.has('com.acme.core'), '.* 通配归为包路径')
  assert.deepEqual(bySpec.get('com.acme.model.User').imported, ['User'], 'as 别名归到原名')
  assert.deepEqual(bySpec.get('com.acme.model.User').aliases, [{ from: 'User', to: 'U' }],
    'Scala 3 as 别名进入 aliases')
  assert.deepEqual(bySpec.get('com.acme.store.Repo').aliases, [{ from: 'Repo', to: 'Store' }],
    'Scala 3 分组 as 重命名')
  assert.ok(!bySpec.has('com.acme.store.Hidden'), '重命名为 _ 表示隐藏')
  assert.ok(!bySpec.has('commented.out'))
})

test('边界：空字符串与不支持语言', () => {
  assert.deepEqual(extractImports('', 'python'), [])
  assert.deepEqual(extractImports('puts 1', 'lua'), [])
})

test('Vue SFC：只提取 script 块内的 import，行号与源文件一致', () => {
  const code = [
    '<template>',
    '  <div>{{ label }}</div>',
    '</template>',
    '',
    '<script setup lang="ts">',
    "import { ref } from 'vue'",
    "import { helper } from './util'",
    'const label = ref(helper())',
    '</script>',
    '',
    '<style scoped>',
    '.a { color: red }',
    '</style>',
  ].join('\n')
  const imports = extractImports(code, 'vue')
  assert.deepEqual(imports.map(i => [i.specifier, i.line, i.relative]), [
    ['vue', 6, false],
    ['./util', 7, true],
  ])
  // 单行 script 与块外文本不产生引用
  assert.deepEqual(
    extractImports('<script>import a from "./a"</script>\n<template>import b from "./b"</template>\n', 'vue')
      .map(i => [i.specifier, i.line]),
    [['./a', 1]],
  )
})

test('Svelte：模块/实例脚本内的 import 均提取，行号对齐', () => {
  const code = [
    '<script context="module">',
    "import { preload } from './preload'",
    '</script>',
    '',
    '<script>',
    "import { helper } from './helper'",
    'const value = helper()',
    '</script>',
    '',
    '<p>{value}</p>',
  ].join('\n')
  const imports = extractImports(code, 'svelte')
  assert.deepEqual(imports.map(i => [i.specifier, i.line, i.relative]), [
    ['./preload', 2, true],
    ['./helper', 6, true],
  ])
})

test('Dart：import/export/part 提取相对语义与 show 符号', () => {
  const code = [
    "import 'dart:async';",
    "import 'package:flutter/material.dart';",
    "import 'src/b.dart' show B, C;",
    "export 'src/api.dart' show Api;",
    "part 'app.g.dart';",
    "part of 'main.dart';",
    '// import "commented.dart";',
  ].join('\n')
  const imports = extractImports(code, 'dart')
  assert.deepEqual(imports.map(i => [i.specifier, i.line, i.relative, i.kind]), [
    ['dart:async', 1, false, 'import'],
    ['package:flutter/material.dart', 2, false, 'import'],
    ['src/b.dart', 3, true, 'import'],
    ['src/api.dart', 4, true, 'export-from'],
    ['app.g.dart', 5, true, 'import'],
  ])
  assert.deepEqual(imports[2].imported, ['B', 'C'])
  assert.deepEqual(imports[3].imported, ['Api'])
  assert.ok(!imports.some(i => i.specifier === 'commented.dart'), '注释不提取')
})

test('Lua：require 字符串与括号形式，注释不提取', () => {
  const code = [
    'local a = require("my.mod")',
    "local b = require 'single'",
    'local c = require("init")',
    '-- require("commented")',
    '--[[ require("block.commented") ]]',
    'return { a, b, c }',
  ].join('\n')
  const imports = extractImports(code, 'lua')
  assert.deepEqual(imports.map(i => [i.specifier, i.line]), [
    ['my.mod', 1],
    ['single', 2],
    ['init', 3],
  ])
  assert.ok(imports.every(i => i.kind === 'import' && i.relative === false))
})

test('Zig：@import 字符串、注释与字符串内伪引用', () => {
  const code = [
    'const std = @import("std");',
    'const util = @import("util.zig");',
    'const nested = @import("nested/mod.zig");',
    '// @import("commented.zig")',
    '/// @import("doc.zig")',
    'const text = "@import(\\"fake.zig\\")";',
    'const builtin = @import("builtin");',
    'pub fn main() void {',
    '    _ = @import("dynamic.zig");',
    '}',
    'const c = @cImport({ @cInclude("stdio.h"); });',
  ].join('\n')
  const imports = extractImports(code, 'zig')
  assert.deepEqual(imports.map(i => [i.specifier, i.line, i.relative]), [
    ['std', 1, false],
    ['util.zig', 2, true],
    ['nested/mod.zig', 3, true],
    ['builtin', 7, false],
    ['dynamic.zig', 9, true],
  ])
  assert.ok(!imports.some(i => i.specifier.endsWith('.h')), '@cImport/@cInclude 不提取')
})

test('Gleam：模块 import、别名与未限定导入', () => {
  const code = [
    'import gleam/io',
    'import my_app/user',
    'import my_app/user.{type User, User as U}',
    'import my_app/config as cfg',
    '// import commented',
    'const text = "import fake/mod"',
  ].join('\n')
  const imports = extractImports(code, 'gleam')
  assert.deepEqual(imports.map(i => [i.specifier, i.line, i.imported]), [
    ['gleam/io', 1, []],
    ['my_app/user', 2, []],
    ['my_app/user', 3, ['User']],
    ['my_app/config', 4, []],
  ])
  assert.ok(imports.every(i => i.kind === 'import' && i.relative === true))
})

test('Gleam：跨行未限定导入', () => {
  const code = [
    'import my_app/user.{',
    '  type User,',
    '  User as U,',
    '}',
    'import my_app/config',
  ].join('\n')
  const imports = extractImports(code, 'gleam')
  assert.deepEqual(imports.map(i => [i.specifier, i.line, i.imported]), [
    ['my_app/user', 1, ['User']],
    ['my_app/config', 5, []],
  ])
})

test('Shell：source/点命令、动态路径与 heredoc 跳过', () => {
  const code = [
    'source ./lib/util.sh',
    '. lib/config.sh',
    'source "$DIR/dynamic.sh"',
    'if true; then source ./lib/extra.sh; fi',
    '# source ./commented.sh',
    'cat <<EOF',
    'source ./heredoc.sh',
    'EOF',
    'bash ./lib/util.sh',
  ].join('\n')
  const imports = extractImports(code, 'shell')
  assert.deepEqual(imports.map(i => [i.specifier, i.line]), [
    ['./lib/util.sh', 1],
    ['lib/config.sh', 2],
    ['./lib/extra.sh', 4],
  ])
  assert.ok(imports.every(i => i.kind === 'import' && i.relative === true))
})

test('R：source 引号路径、动态参数与字符串内伪引用', () => {
  const code = [
    'source("R/util.R")',
    "source('R/config.R', local = TRUE)",
    'source(file = "R/model.R")',
    'source(paste0("R/", name, ".R"))',
    '# source("R/commented.R")',
    'msg <- "source(\\"R/fake.R\\")"',
    'library(dplyr)',
  ].join('\n')
  const imports = extractImports(code, 'r')
  assert.deepEqual(imports.map(i => [i.specifier, i.line]), [
    ['R/util.R', 1],
    ['R/config.R', 2],
    ['R/model.R', 3],
  ])
  assert.ok(imports.every(i => i.kind === 'import' && i.relative === true))
})

test('Julia：include 引号路径、动态参数与字符串/块注释内伪引用', () => {
  const code = [
    'include("util.jl")',
    "include('src/model.jl')",
    'include(joinpath(@__DIR__, "dynamic.jl"))',
    'include("$DIR/var.jl")',
    '# include("commented.jl")',
    '#= include("block.jl") =#',
    'msg = "include(\\"fake.jl\\")"',
    'using DataFrames',
  ].join('\n')
  const imports = extractImports(code, 'julia')
  assert.deepEqual(imports.map(i => [i.specifier, i.line]), [
    ['util.jl', 1],
    ['src/model.jl', 2],
  ])
  assert.ok(imports.every(i => i.kind === 'import' && i.relative === true))
})

test('Nim：import/from/include、相对路径与字符串内伪引用', () => {
  const code = [
    'import std/os, utils/helpers',
    'import ./local',
    'from ../shared/mod import thing',
    'include "templates/base.nim"',
    'export public_api',
    '# import commented',
    'let text = "import fake/mod"',
  ].join('\n')
  const imports = extractImports(code, 'nim')
  assert.deepEqual(imports.map(i => [i.specifier, i.line, i.relative]), [
    ['std/os', 1, false],
    ['utils/helpers', 1, false],
    ['./local', 2, true],
    ['../shared/mod', 3, true],
    ['templates/base.nim', 4, false],
    ['public_api', 5, false],
  ])
})

test('OCaml：open/include/模块别名与注释字符串屏蔽', () => {
  const code = [
    'open Base',
    'open! Util',
    'include Helpers',
    'module Alias = Foo.Bar',
    'module Local = struct end',
    '(* open Hidden *)',
    'let s = "open Nope"',
    'module M = List',
  ].join('\n')
  const imports = extractImports(code, 'ocaml')
  assert.deepEqual(imports.map(i => [i.specifier, i.line]), [
    ['Base', 1],
    ['Util', 2],
    ['Helpers', 3],
    ['Foo', 4],
    ['List', 8],
  ])
  assert.ok(imports.every(i => i.kind === 'import' && i.relative === false))
})

test('Haskell：import qualified/package import/hiding 与注释屏蔽', () => {
  const code = [
    'import qualified Data.Map as M',
    'import Foo.Bar hiding (baz)',
    'import "text" Data.Text (Text)',
    'import safe Control.Exception',
    '-- import Hidden',
    '{- import Blocked -}',
    'let s = "import Nope"',
  ].join('\n')
  const imports = extractImports(code, 'haskell')
  assert.deepEqual(imports.map(i => [i.specifier, i.line]), [
    ['Data.Map', 1],
    ['Foo.Bar', 2],
    ['Data.Text', 3],
    ['Control.Exception', 4],
  ])
  assert.ok(imports.every(i => i.kind === 'import' && i.relative === false))
})

test('Erlang：include/include_lib 与注释屏蔽', () => {
  const code = [
    '-include("records.hrl").',
    '-include_lib("myapp/include/shared.hrl").',
    '%% -include("hidden.hrl").',
    '-define(STR, "-include(fake.hrl)").',
  ].join('\n')
  const imports = extractImports(code, 'erlang')
  assert.deepEqual(imports.map(i => [i.specifier, i.line, i.relative]), [
    ['records.hrl', 1, true],
    ['myapp/include/shared.hrl', 2, false],
  ])
})

test('Solidity：import 变体与注释屏蔽', () => {
  const code = [
    'import "./IERC20.sol";',
    'import {Ownable} from "./access/Ownable.sol";',
    'import * as Math from "./Math.sol";',
    'import "hardhat/console.sol";',
    '// import "./Hidden.sol";',
  ].join('\n')
  const imports = extractImports(code, 'solidity')
  assert.deepEqual(imports.map(i => [i.specifier, i.line, i.relative]), [
    ['./IERC20.sol', 1, true],
    ['./access/Ownable.sol', 2, true],
    ['./Math.sol', 3, true],
    ['hardhat/console.sol', 4, false],
  ])
})

test('Clojure：ns require 提取与注释屏蔽', () => {
  const code = [
    '(ns app.core',
    '  (:require [app.util :as util]',
    '            [clojure.string :as str])',
    '  (:import (java.util Date)))',
    '; (ns fake (:require [hidden.ns]))',
    '(def s ":require [no.such]")',
  ].join('\n')
  const imports = extractImports(code, 'clojure')
  assert.deepEqual(imports.map(i => [i.specifier, i.line]), [
    ['app.util', 2],
    ['clojure.string', 3],
  ])
})

test('HCL：module source 相对路径与外部排除', () => {
  const code = [
    'module "vpc" {',
    '  source = "./modules/vpc"',
    '}',
    'module "registry" {',
    '  source = "terraform-aws-modules/vpc/aws"',
    '}',
    '# source = "./hidden"',
  ].join('\n')
  const imports = extractImports(code, 'hcl')
  assert.deepEqual(imports.map(i => [i.specifier, i.line, i.relative]), [
    ['./modules/vpc', 2, true],
    ['terraform-aws-modules/vpc/aws', 5, false],
  ])
})

test('Groovy：import 与 static import', () => {
  const code = [
    'import com.example.Pipeline',
    'import static com.example.Utils.trim',
    '// import hidden.Nope',
    'def s = "import fake.Nope"',
  ].join('\n')
  const imports = extractImports(code, 'groovy')
  assert.deepEqual(imports.map(i => [i.specifier, i.line]), [
    ['com.example.Pipeline', 1],
    ['com.example.Utils', 2],
  ])
})

test('PowerShell：using module / Import-Module / dot-source 路径', () => {
  const code = [
    'using module ./Modules/Logger.psm1',
    'Import-Module ./Tasks/Build.psd1 -Force',
    '. ./Common/Helpers.ps1',
    'Import-Module Pester',
    '# Import-Module ./Commented.psm1',
    '$s = "Import-Module ./InString.psm1"',
    "Import-Module './Quoted.psm1'",
  ].join('\n')
  const imports = extractImports(code, 'powershell')
  assert.deepEqual(imports.map(i => [i.specifier, i.line, i.relative]), [
    ['./Modules/Logger.psm1', 1, true],
    ['./Tasks/Build.psd1', 2, true],
    ['./Common/Helpers.ps1', 3, true],
    ['./Quoted.psm1', 7, true],
  ])
})

test('Fortran：use 模块引用与 intrinsic 过滤', () => {
  const code = [
    'use iso_c_binding, only: c_int',
    'use, intrinsic :: iso_fortran_env',
    "use, non_intrinsic :: my_mod, only: thing",
    'use My_Other_Mod',
    '! use commented_mod',
    'print *, "use string_mod"',
  ].join('\n')
  const imports = extractImports(code, 'fortran')
  assert.deepEqual(imports.map(i => [i.specifier, i.line]), [
    ['iso_c_binding', 1],
    ['my_mod', 3],
    ['My_Other_Mod', 4],
  ])
})

test('Perl：use/require、parent/base 与 pragma 过滤', () => {
  const code = [
    'use strict;',
    'use warnings;',
    'use My::App;',
    'use My::Util qw(trim);',
    "use parent 'Base::Class';",
    'use base qw(Other::Base Legacy::Base);',
    'require "./lib/Local.pm";',
    "require 'Shared/Thing.pm';",
    'use v5.36;',
    '# use Commented::Mod;',
    '=pod',
    'use Pod::Mod;',
    '=cut',
  ].join('\n')
  const imports = extractImports(code, 'perl')
  assert.deepEqual(imports.map(i => [i.specifier, i.line, i.kind]), [
    ['My::App', 3, 'import'],
    ['My::Util', 4, 'import'],
    ['Base::Class', 5, 'import'],
    ['Other::Base', 6, 'import'],
    ['Legacy::Base', 6, 'import'],
    ['./lib/Local.pm', 7, 'require'],
    ['Shared/Thing.pm', 8, 'require'],
  ])
})

test('Pascal：uses 跨行列表与 in 路径', () => {
  const code = [
    'uses',
    "  System.SysUtils, Demo.Base in 'demo/Base.pas',",
    '  Demo.Utils;',
    '',
    'implementation',
    '',
    'uses Demo.Helper;',
    '// uses Commented.Unit;',
    "const S = 'uses String.Unit;';",
  ].join('\n')
  const imports = extractImports(code, 'pascal')
  assert.deepEqual(imports.map(i => [i.specifier, i.line, i.relative]), [
    ['System.SysUtils', 1, false],
    ['demo/Base.pas', 1, true],
    ['Demo.Utils', 1, false],
    ['Demo.Helper', 7, false],
  ])
})

test('Nix：import/callPackage/readFile 相对路径与注释屏蔽', () => {
  const code = [
    '{ pkgs, ... }:',
    '{',
    '  lib = import ./lib;',
    '  pkg = pkgs.callPackage ./pkgs/demo.nix { };',
    '  version = builtins.readFile ./VERSION;',
    '  # fake = import ./fake.nix;',
    "  text = ''",
    '    import ./heredoc.nix',
    "  '';",
    '}',
  ].join('\n')
  const imports = extractImports(code, 'nix')
  assert.deepEqual(imports.map(i => [i.specifier, i.line]), [
    ['./lib', 3],
    ['./pkgs/demo.nix', 4],
    ['./VERSION', 5],
  ])
})

test('VB.NET：Imports（含别名）、Inherits/Implements 与注释屏蔽', () => {
  const code = [
    'Imports System.Text',
    'Imports Alias = Demo.Core.Widget',
    'Imports Demo.Core.Widget',
    "' Imports Commented.Nope",
    'REM Imports Remmed.Nope',
    'Public Class Foo',
    '    Inherits Demo.Base',
    '    Implements Demo.IThing',
    'End Class',
  ].join('\n')
  const imports = extractImports(code, 'vbnet')
  assert.deepEqual(imports.map(i => [i.specifier, i.line]), [
    ['System.Text', 1],
    ['Demo.Core.Widget', 2],
    ['Demo.Core.Widget', 3],
    ['Demo.Base', 7],
    ['Demo.IThing', 8],
  ])
})

test('Tcl：source 路径与注释/字符串过滤', () => {
  const code = [
    'source ./lib/util.tcl',
    'source scripts/init.tcl',
    'source [file join $dir other.tcl]',
    '# source ./commented.tcl',
    'set x "source ./string.tcl"',
    'set y 1 ; # source ./trailing.tcl',
  ].join('\n')
  const imports = extractImports(code, 'tcl')
  assert.deepEqual(imports.map(i => [i.specifier, i.line, i.kind]), [
    ['./lib/util.tcl', 1, 'require'],
    ['scripts/init.tcl', 2, 'require'],
  ])
})

test('F#：open 命名空间/类型与注释屏蔽', () => {
  const code = [
    'open System',
    'open Demo.Core',
    'open type Demo.Core.Point',
    '// open Commented.Nope',
    'let s = "open String.Fake"',
  ].join('\n')
  const imports = extractImports(code, 'fsharp')
  assert.deepEqual(imports.map(i => [i.specifier, i.line]), [
    ['System', 1],
    ['Demo.Core', 2],
    ['Demo.Core.Point', 3],
  ])
})

test('Elixir：alias/import/require/use 与分组别名', () => {
  const code = [
    'defmodule MyApp.Accounts do',
    '  alias MyApp.Repo',
    '  alias MyApp.{Helpers, Format}',
    '  alias MyApp.Legacy, as: Old',
    '  import MyApp.QueryHelpers, only: [where: 2]',
    '  require Logger',
    '  use MyApp.Schema',
    '  # alias MyApp.Commented',
    '  def list, do: Repo.all()',
    'end',
  ].join('\n')
  const imports = extractImports(code, 'elixir')
  assert.deepEqual(imports.map(i => [i.specifier, i.line]), [
    ['MyApp.Repo', 2],
    ['MyApp.Helpers', 3],
    ['MyApp.Format', 3],
    ['MyApp.Legacy', 4],
    ['MyApp.QueryHelpers', 5],
    ['Logger', 6],
    ['MyApp.Schema', 7],
  ])
  assert.ok(imports.every(i => i.kind === 'import' && i.relative === false))
  assert.deepEqual(imports[1].imported, ['Helpers'])
  assert.deepEqual(imports[3].imported, ['Legacy'], 'as: 别名不改变目标模块')
  assert.ok(!imports.some(i => i.specifier.includes('Commented')), '注释行不提取')
})

test('C/C++：#include 引号与尖括号都提取，仅引号为相对语义', () => {
  const code = [
    '#include "core/util.h"',
    '# include <vector>',
    '  #include "local.h" // 行尾注释',
    '// #include "commented.h"',
    '#define INCLUDE "macro.h"',
  ].join('\n')
  const imports = extractImports(code, 'cpp')
  assert.deepEqual(imports.map(i => i.specifier), ['core/util.h', 'vector', 'local.h'])
  assert.deepEqual(imports.map(i => i.line), [1, 2, 3])
  assert.deepEqual(imports.map(i => i.relative), [true, false, true], '尖括号标记为非相对')
  assert.ok(imports.every(i => i.kind === 'import'))
  assert.deepEqual(extractImports('#include <memory>\n', 'c').map(i => i.specifier), ['memory'])
})

test('Ada：with/limited with/private with 提取，use 与 generic 形式参数不建边', () => {
  const code = [
    'with Ada.Text_IO, Demo.Utils;',
    'limited with Demo.Other;',
    'private with Demo.Secret;',
    '-- with Commented.Out;',
    'with function Formal (X : Integer) return Integer;',
    'with procedure Hook;',
    'use Ada.Text_IO;',
    '',
    'procedure Main is',
    'begin',
    '   null;',
    'end Main;',
  ].join('\n')
  const imports = extractImports(code, 'ada')
  assert.deepEqual(imports.map(item => [item.line, item.specifier, item.relative]), [
    [1, 'Ada.Text_IO', false],
    [1, 'Demo.Utils', false],
    [2, 'Demo.Other', false],
    [3, 'Demo.Secret', false],
  ])
})

test('SystemVerilog：`include 与 import 提取，注释/字符串屏蔽', () => {
  const code = [
    '/* `include "commented.svh"',
    '   import fake_pkg::*; */',
    '`include "defs.svh"',
    '`include <vendor/top.svh>',
    '// `include "nope.svh"',
    'import fifo_pkg::*;',
    'import types_pkg::state_t, util_pkg::*;',
    'module m; string s = "`include \\"str.svh\\""; endmodule',
  ].join('\n')
  const imports = extractImports(code, 'systemverilog')
  assert.deepEqual(imports.map(item => [item.line, item.specifier, item.kind, item.relative]), [
    [3, 'defs.svh', 'require', true],
    [4, 'vendor/top.svh', 'require', false],
    [6, 'fifo_pkg', 'import', false],
    [7, 'types_pkg', 'import', false],
    [7, 'util_pkg', 'import', false],
  ])
  assert.deepEqual(imports.filter(item => item.kind === 'import').map(item => item.imported), [[], ['state_t'], []])
})

test('Objective-C：#import/#include 提取，注释/字符串/模块导入屏蔽', () => {
  const code = [
    '// #import "nope.h"',
    '/* #import "also_nope.h" */',
    '#import "Widget.h"',
    '#import <UIKit/UIKit.h>',
    '#include "CHeader.h"',
    '@import Foundation;',
    'NSString *s = @"#import \\"str.h\\"";',
  ].join('\n')
  const imports = extractImports(code, 'objc')
  assert.deepEqual(imports.map(item => [item.line, item.specifier, item.kind, item.relative]), [
    [3, 'Widget.h', 'import', true],
    [4, 'UIKit/UIKit.h', 'import', false],
    [5, 'CHeader.h', 'import', true],
  ], '@import 模块与注释/字符串中的伪 import 不产生引用')
})
