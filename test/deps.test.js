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
  assert.equal(bySpec.get('./multi').line, 1)
  assert.deepEqual(bySpec.get('./mixed').imported, ['delta'])
  assert.equal(bySpec.get('./mixed').line, 7)
  assert.deepEqual(bySpec.get('./re-export').imported, ['epsilon', 'zeta'])
  assert.equal(bySpec.get('./re-export').kind, 'export-from')
  assert.equal(bySpec.get('./re-export').line, 10)
  assert.equal(bySpec.get('./later').line, 14, '多行语句后的依赖行号不漂移')
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
  assert.deepEqual(refs.find(r => r.specifier === 'example.com/demo/internal/greeter').imported, ['greeter'])
})

test('Rust：mod 声明、crate/self/super use 与分组 use', () => {
  const code = [
    'mod parser;',
    'pub mod ast;',
    'use crate::parser::Token;',
    'use super::util::Helper;',
    'use self::inner::Thing;',
    'use crate::{graph, lexer::{Lexer, Token as T}};',
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
  assert.deepEqual(bySpec.get('crate::lexer::Token').imported, ['T'], 'as 别名作为导入名')
  assert.ok(bySpec.has('serde::Serialize'), '外部 crate 也记录（解析失败不计边）')
  assert.ok(!bySpec.has('not::real'), '注释不提取')
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

  assert.deepEqual(bySpec.get('com.acme.util.Helper').imported, ['Helper'])
  assert.deepEqual(bySpec.get('com.acme.util.Helper.run').imported, ['Helper'], 'static 成员导入归到类名')
  assert.ok(bySpec.get('java.util.*'))
  assert.deepEqual(bySpec.get('java.util.*').imported, [])
  assert.ok(bySpec.get('org.junit.Assert.*'))
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
  assert.ok(!bySpec.has('Commented.Out'), '注释不提取')
  assert.ok(refs.every(r => r.relative), '统一作为本地解析候选')
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
  assert.ok(!bySpec.has('commented.out'))
})

test('PHP：use 分组/function/别名与 require 字面量', () => {
  const code = [
    '<?php',
    'use App\\Models\\User;',
    'use App\\Models\\{Post, Comment as C};',
    'use function App\\Helpers\\format;',
    "require_once __DIR__ . '/bootstrap.php';",
    "require '../vendor/autoload.php';",
    '// use Commented\\Out;',
  ].join('\n')
  const refs = extractImports(code, 'php')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))

  assert.deepEqual(bySpec.get('App.Models.User').imported, ['User'])
  assert.ok(bySpec.has('App.Models.Post'))
  assert.ok(bySpec.has('App.Models.Comment'), '分组别名保留原名')
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
    '// import commented.out',
  ].join('\n')
  const refs = extractImports(code, 'scala')
  const bySpec = new Map(refs.map(r => [r.specifier, r]))

  assert.deepEqual(bySpec.get('com.acme.util.Helper').imported, ['Helper'])
  assert.deepEqual(bySpec.get('com.acme.util.Api').imported, ['Api'])
  assert.deepEqual(bySpec.get('com.acme.util.Client').imported, ['HttpClient'], '分组重命名保留原路径')
  assert.ok(bySpec.has('com.acme.util'), '分组内通配展开为包前缀')
  assert.deepEqual(bySpec.get('com.acme.util').imported, [])
  assert.deepEqual(bySpec.get('scala.concurrent.ExecutionContext.Implicits.global').imported, ['global'])
  assert.ok(bySpec.has('com.acme.core'), '.* 通配归为包路径')
  assert.deepEqual(bySpec.get('com.acme.model.User').imported, ['U'], 'as 别名')
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
