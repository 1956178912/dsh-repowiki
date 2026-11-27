/**
 * 索引编排器单元测试：在真实临时目录里造项目，验证遍历、提取、依赖边。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { buildIndex, digestText, stripJsonc } from '../src/indexer.js'
import { INDEX_SCHEMA_VERSION, INDEX_PARSER_VERSION, DIGEST_CHARS, MAX_FILE_BYTES } from '../src/schema.js'

/**
 * 创建临时项目并写入 fixture 文件。
 * @param {Record<string,string>} files - 相对路径 → 内容。
 * @returns {string} 项目根绝对路径。
 */
function makeProject(files) {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-idx-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    nodefs.mkdirSync(path.dirname(abs), { recursive: true })
    nodefs.writeFileSync(abs, content)
  }
  return dir
}

test('端到端：JS/TS 项目产出符号、依赖边与技术栈', async () => {
  const dir = makeProject({
    'package.json': JSON.stringify({ name: 'demo', version: '0.1.0', dependencies: { express: '^4' } }),
    'src/app.ts': 'export function start(port: number) { return port }\n',
    'src/util.js': 'const help = (x) => x\nmodule.exports = { help }\n',
    'src/index.ts': "import { start } from './app';\nstart(3000);\n",
  })
  const fs = makeFakeFs(dir)
  const doc = await buildIndex(fs, dir)

  assert.equal(doc.schemaVersion, INDEX_SCHEMA_VERSION)
  assert.equal(doc.stack.projectName, 'demo')
  assert.ok(doc.stack.technologies.some(t => t.name === 'Express'))
  const paths = doc.files.map(f => f.path)
  assert.ok(paths.includes('src/app.ts'))
  assert.ok(paths.includes('src/util.js'))
  assert.ok(paths.includes('src/index.ts'))

  const app = doc.files.find(f => f.path === 'src/app.ts')
  assert.ok(app.symbols.some(s => s.name === 'start' && s.kind === 'function' && s.exported))
  assert.equal(app.lines, 1, 'v6 记录源码行数')
  assert.equal(doc.files.find(f => f.path === 'src/util.js').lines, 2)

  // 依赖边：src/index.ts → src/app.ts（.ts 后缀解析）
  const edge = doc.edges.find(e => e.from === 'src/index.ts')
  assert.ok(edge, '存在依赖边')
  assert.equal(edge.to, 'src/app.ts')
  assert.equal(edge.line, 1, '边记录 import 所在行（v5）')
  assert.deepEqual(edge.symbols, ['start'], '符号级引用')

  // stats 自洽
  assert.equal(doc.stats.files, 3)
  assert.equal(doc.stats.symbols, doc.files.reduce((n, f) => n + f.symbols.length, 0))
  assert.equal(doc.stats.edges, doc.edges.length)
})

test('依赖边：未解析的相对 import 不产生边（JS/Python 均返回 null）', async () => {
  const dir = makeProject({
    'src/a.ts': "import { x } from './missing'\nimport './also/missing'\n",
    'py/b.py': 'from .gone import x\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  assert.equal(doc.edges.length, 0, '目标文件不在索引中时不建边')
})

test('Python 项目：相对与绝对 import 解析、方法归属', async () => {
  const dir = makeProject({
    'pkg/__init__.py': '',
    'pkg/mod.py': 'def hello():\n    return 1\n',
    'pkg/main.py': 'from .mod import hello\n\nhello()\n',
    'pkg/other.py': 'from pkg.mod import hello\n',
  })
  const fs = makeFakeFs(dir)
  const doc = await buildIndex(fs, dir)
  const edges = doc.edges.filter(e => e.to === 'pkg/mod.py')
  assert.ok(edges.some(e => e.from === 'pkg/main.py'), 'from .mod 相对引用解析')
  assert.equal(edges.find(e => e.from === 'pkg/other.py')?.line, 1, '绝对包名引用解析到同仓库文件')

  const mod = doc.files.find(f => f.path === 'pkg/mod.py')
  assert.ok(mod.symbols.some(s => s.name === 'hello' && s.kind === 'function'))
})

test('Python 绝对导入：项目根与 src/lib 导入根，from-import 优先子模块', async () => {
  const dir = makeProject({
    'src/app/__init__.py': '',
    'src/app/core.py': 'def core():\n    return 1\n',
    'src/app/services/__init__.py': '',
    'src/app/services/user.py': 'def get_user():\n    return 1\n',
    'src/app/main.py': [
      'import app.core',
      'from app.services.user import get_user',
      'from app.services import user',
      'from app import core',
      'import os',
      'from requests import get',
    ].join('\n'),
    'tests/test_main.py': 'from app.core import core\n',
    'lib/toolkit/__init__.py': '',
    'lib/toolkit/strings.py': 'def clean():\n    return ""\n',
    'lib/toolkit/user.py': 'from toolkit.strings import clean\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const edge = (from, to) => doc.edges.find(e => e.from === from && e.to === to)
  assert.deepEqual(
    doc.edges.filter(e => e.from === 'src/app/main.py').map(e => [e.line, e.to]),
    [
      [1, 'src/app/core.py'],
      [2, 'src/app/services/user.py'],
      [3, 'src/app/services/user.py'],
      [4, 'src/app/core.py'],
    ],
    'import a.b、from a.b.c、from 包 import 子模块、from app import core 各自解析；标准库/第三方不建边',
  )
  assert.equal(edge('tests/test_main.py', 'src/app/core.py')?.line, 1, '测试目录同样使用 src 导入根')
  assert.equal(edge('lib/toolkit/user.py', 'lib/toolkit/strings.py')?.line, 1, 'lib 布局作为导入根')
})

test('多语言：Go/Rust/Java 符号、本地依赖边、语言分布与 JVM 技术栈', async () => {
  const dir = makeProject({
    'go.mod': 'module example.com/demo\n\ngo 1.22\n',
    'main.go': 'package main\n\nimport "example.com/demo/internal/greeter"\n\nfunc main() { greeter.Hello() }\n',
    'internal/greeter/greeter.go': 'package greeter\n\nfunc Hello() {}\n',
    'Cargo.toml': '[package]\nname = "demo"\n',
    'src/lib.rs': 'pub mod a;\npub mod b;\n',
    'src/a.rs': 'pub struct Thing;\npub fn hello() {}\n',
    'src/b.rs': 'use crate::a::{hello, Thing};\n',
    'pom.xml': [
      '<project>',
      '  <artifactId>demo</artifactId>',
      '  <dependencies>',
      '    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId><version>3.2.0</version></dependency>',
      '  </dependencies>',
      '</project>',
    ].join('\n'),
    'src/main/java/com/acme/App.java': 'package com.acme;\nimport com.acme.util.Helper;\npublic class App { public static void main(String[] args) { Helper.run(); } }\n',
    'src/main/java/com/acme/util/Helper.java': 'package com.acme.util;\npublic class Helper { public static void run() {} }\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)

  assert.deepEqual(doc.stats.languages, { go: 2, java: 2, rust: 3 })
  assert.ok(doc.files.find(f => f.path === 'main.go').symbols.some(s => s.name === 'main' && s.kind === 'function'))
  assert.ok(doc.files.find(f => f.path === 'src/a.rs').symbols.some(s => s.name === 'Thing' && s.kind === 'class'))
  assert.ok(doc.files.find(f => f.path === 'src/main/java/com/acme/App.java').symbols.some(s => s.name === 'App' && s.kind === 'class'))

  const edge = (from, to) => doc.edges.find(e => e.from === from && e.to === to)
  assert.equal(edge('main.go', 'internal/greeter/greeter.go')?.line, 3, 'Go import 行号')
  assert.equal(edge('src/b.rs', 'src/a.rs')?.line, 1, 'Rust use 行号')
  assert.equal(edge('src/lib.rs', 'src/a.rs')?.line, 1, 'Rust mod 行号')
  assert.equal(edge('src/main/java/com/acme/App.java', 'src/main/java/com/acme/util/Helper.java')?.line, 2, 'Java import 行号')

  assert.equal(doc.stack.projectName, 'demo')
  assert.ok(doc.stack.technologies.some(t => t.name === 'Spring Boot' && t.ecosystem === 'jvm'))
  assert.equal(doc.stack.dependencyCounts.maven, 1)
})

test('Java：通配符与 static 成员 import 解析到类文件', async () => {
  const dir = makeProject({
    'src/main/java/com/acme/util/Helper.java': 'package com.acme.util;\npublic class Helper { public static void run() {} }\n',
    'src/main/java/com/acme/App.java': [
      'package com.acme;',
      'import com.acme.util.*;',
      'import static com.acme.util.Helper.run;',
      'public class App {}',
    ].join('\n'),
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const fromApp = doc.edges.filter(e => e.from === 'src/main/java/com/acme/App.java')
  assert.equal(fromApp.length, 2, '通配符与 static 导入各产生一条边')
  assert.ok(fromApp.every(e => e.to === 'src/main/java/com/acme/util/Helper.java'))
})

test('Go：无 go.mod 时不解析、module 根导入解析到根包文件', async () => {
  const noMod = makeProject({
    'main.go': 'package main\nimport "fmt"\nfunc main() {}\n',
    'internal/pkg/pkg.go': 'package pkg\nfunc F() {}\n',
  })
  const without = await buildIndex(makeFakeFs(noMod), noMod)
  assert.equal(without.edges.length, 0, '缺少 go.mod module 路径时外部 import 不建边')

  const withMod = makeProject({
    'go.mod': 'module example.com/demo\n\ngo 1.22\n',
    'app.go': 'package main\nfunc App() {}\n',
    'main.go': 'package main\nimport "example.com/demo"\nfunc main() { App() }\n',
  })
  const doc = await buildIndex(makeFakeFs(withMod), withMod)
  assert.ok(doc.edges.some(e => e.from === 'main.go' && e.to === 'app.go'), 'module 根导入解析到根包代表文件')
})

test('Rust：self/super 相对模块、无 crate 根降级', async () => {
  const dir = makeProject({
    'src/lib.rs': 'pub mod a;\n',
    'src/a.rs': 'pub mod inner;\npub fn hello() {}\n',
    'src/a/inner.rs': 'use super::hello;\nuse self::leaf::Y;\n',
    'src/a/inner/leaf.rs': 'pub struct Y;\n',
    'standalone.rs': 'use crate::missing::Z;\nuse local::Thing;\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const inner = doc.edges.filter(e => e.from === 'src/a/inner.rs')
  assert.ok(inner.some(e => e.to === 'src/a.rs'), 'super::hello 解析到父模块文件')
  assert.ok(inner.some(e => e.to === 'src/a/inner/leaf.rs'), 'self::leaf 解析到子模块文件')
  assert.equal(doc.edges.filter(e => e.from === 'standalone.rs').length, 0, 'crate 根之外与未知本地路径不建边')
})

test('C#/Kotlin/PHP：符号、本地依赖边与 Composer 技术栈', async () => {
  const dir = makeProject({
    'composer.json': JSON.stringify({
      name: 'acme/app',
      require: { 'laravel/framework': '^10', php: '^8.2' },
    }),
    'app/Models/User.php': '<?php\nnamespace App\\Models;\nclass User {}\n',
    'app/Services/UserService.php': [
      '<?php',
      'namespace App\\Services;',
      'use App\\Models\\User;',
      "require_once __DIR__ . '/bootstrap.php';",
      'class UserService {',
      '  public function run(): void {}',
      '}',
    ].join('\n'),
    'app/Services/bootstrap.php': '<?php\n',
    'src/App/Models/User.cs': 'namespace App.Models;\npublic class User {}\n',
    'src/App/Services/UserService.cs': [
      'using App.Models;',
      'namespace App.Services;',
      'public class UserService {',
      '  public int Add(int a, int b) { return a + b; }',
      '}',
    ].join('\n'),
    'src/main/kotlin/com/acme/App.kt': [
      'package com.acme',
      'import com.acme.util.Helper',
      'class App {',
      '  fun run() {}',
      '}',
    ].join('\n'),
    'src/main/kotlin/com/acme/util/Helper.kt': 'package com.acme.util\nobject Helper {\n  fun help() {}\n}\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)

  assert.deepEqual(doc.stats.languages, { csharp: 2, kotlin: 2, php: 3 })
  assert.ok(doc.files.find(f => f.path === 'src/App/Services/UserService.cs').symbols.some(s => s.name === 'Add' && s.kind === 'method'))
  assert.ok(doc.files.find(f => f.path === 'src/main/kotlin/com/acme/App.kt').symbols.some(s => s.name === 'run' && s.parent === 'App'))
  assert.ok(doc.files.find(f => f.path === 'app/Services/UserService.php').symbols.some(s => s.name === 'run' && s.parent === 'UserService'))

  const edge = (from, to) => doc.edges.find(e => e.from === from && e.to === to)
  assert.equal(edge('app/Services/UserService.php', 'app/Models/User.php')?.line, 3, 'PHP use 行号')
  assert.equal(edge('app/Services/UserService.php', 'app/Services/bootstrap.php')?.line, 4, 'PHP __DIR__ require')
  assert.equal(edge('src/App/Services/UserService.cs', 'src/App/Models/User.cs')?.line, 1, 'C# using 行号')
  assert.equal(edge('src/main/kotlin/com/acme/App.kt', 'src/main/kotlin/com/acme/util/Helper.kt')?.line, 2, 'Kotlin import 行号')

  assert.equal(doc.stack.projectName, 'acme/app')
  assert.ok(doc.stack.technologies.some(t => t.name === 'Laravel' && t.ecosystem === 'composer'))
  assert.equal(doc.stack.dependencyCounts.composer, 2)
})

test('Ruby/Swift/Scala：符号、本地依赖边与三生态技术栈', async () => {
  const dir = makeProject({
    Gemfile: "source 'https://rubygems.org'\ngem 'rails', '~> 7.1'\n",
    'Package.swift': [
      '// swift-tools-version:5.9',
      'import PackageDescription',
      'let package = Package(',
      '    name: "DemoServer",',
      '    dependencies: [.package(url: "https://github.com/vapor/vapor.git", from: "4.92.0")],',
      '    targets: [.target(name: "App")]',
      ')',
    ].join('\n'),
    'build.sbt': [
      'name := "demo-scala"',
      'libraryDependencies += "org.typelevel" %% "cats-effect" % "3.5.2"',
    ].join('\n'),
    'lib/billing/base.rb': [
      'module Billing',
      '  class Base',
      '    def id',
      '      1',
      '    end',
      '  end',
      'end',
    ].join('\n'),
    'lib/billing/invoice.rb': [
      "require_relative 'base'",
      "require 'json'",
      'module Billing',
      '  class Invoice < Base',
      '    def total(items)',
      '      items.sum',
      '    end',
      '  end',
      'end',
    ].join('\n'),
    'Sources/App/main.swift': 'import Foundation\nstruct App {\n  func run() {}\n}\n',
    'Sources/App/Helper.swift': 'func helper() {}\n',
    'src/main/scala/com/acme/App.scala': [
      'package com.acme',
      'import com.acme.util.Helper',
      'object App {',
      '  def run(): Unit = Helper.run()',
      '}',
    ].join('\n'),
    'src/main/scala/com/acme/util/Helper.scala': 'package com.acme.util\nobject Helper {\n  def run(): Unit = {}\n}\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)

  assert.deepEqual(doc.stats.languages, { ruby: 2, scala: 2, swift: 2 }, 'Package.swift 作为清单不计入源码')
  assert.ok(!doc.files.some(f => f.path === 'Package.swift'), 'Package.swift 只作清单')

  const rubyFile = doc.files.find(f => f.path === 'lib/billing/invoice.rb')
  assert.ok(rubyFile.symbols.some(s => s.name === 'total' && s.kind === 'method' && s.parent === 'Invoice'))
  assert.ok(doc.files.find(f => f.path === 'Sources/App/main.swift').symbols.some(s => s.name === 'run' && s.parent === 'App'))
  assert.ok(doc.files.find(f => f.path === 'src/main/scala/com/acme/App.scala').symbols.some(s => s.name === 'run' && s.parent === 'App'))

  const edge = (from, to) => doc.edges.find(e => e.from === from && e.to === to)
  assert.equal(edge('lib/billing/invoice.rb', 'lib/billing/base.rb')?.line, 1, 'require_relative 行号')
  assert.ok(!doc.edges.some(e => e.from === 'lib/billing/invoice.rb' && e.to === 'json'), 'gem require 不建本地边')
  assert.equal(edge('src/main/scala/com/acme/App.scala', 'src/main/scala/com/acme/util/Helper.scala')?.line, 2, 'Scala 点分包导入')
  assert.equal(doc.edges.filter(e => e.from === 'Sources/App/main.swift').length, 0, '外部 Swift 模块（Foundation）不建边')

  // 多清单仓库的项目名取首个提供者（依赖目录遍历顺序），两者都是合法来源
  assert.ok(['DemoServer', 'demo-scala'].includes(doc.stack.projectName), '项目名来自 Swift 或 sbt 清单')
  assert.ok(doc.stack.technologies.some(t => t.name === 'Ruby on Rails' && t.ecosystem === 'bundler'))
  assert.ok(doc.stack.technologies.some(t => t.name === 'Vapor' && t.ecosystem === 'swiftpm'))
  assert.ok(doc.stack.technologies.some(t => t.name === 'Cats Effect' && t.ecosystem === 'sbt'))
  assert.deepEqual(doc.stack.dependencyCounts, { bundler: 1, sbt: 1, swiftpm: 1 })
})

test('Dart：符号、本地 import/part 边与 pub 技术栈', async () => {
  const dir = makeProject({
    'pubspec.yaml': [
      'name: demo_app',
      'environment:',
      '  sdk: ">=3.0.0 <4.0.0"',
      'dependencies:',
      '  flutter:',
      '    sdk: flutter',
      '  provider: ^6.1.0',
      'dev_dependencies:',
      '  flutter_test:',
      '    sdk: flutter',
    ].join('\n'),
    'lib/app.dart': [
      "import 'package:flutter/material.dart';",
      "import 'src/screen.dart' show Screen;",
      "import 'package:demo_app/src/screen.dart';",
      "import 'package:shared_ui/widgets/button.dart';",
      "part 'app.g.dart';",
      'class App extends StatelessWidget {',
      '  const App({super.key});',
      '  @override',
      '  Widget build(BuildContext context) => Screen();',
      '}',
    ].join('\n'),
    'lib/src/screen.dart': [
      'class Screen extends StatelessWidget {',
      '  const Screen({super.key});',
      '  @override',
      '  Widget build(BuildContext context) => const Placeholder();',
      '}',
    ].join('\n'),
    'lib/app.g.dart': "part of 'app.dart';\nclass Generated {}\n",
    'test/app_test.dart': [
      "import 'package:flutter_test/flutter_test.dart';",
      "import '../lib/app.dart';",
      'void main() {}',
    ].join('\n'),
    'packages/shared/pubspec.yaml': [
      'name: shared_ui',
      'dependencies:',
      '  flutter:',
      '    sdk: flutter',
    ].join('\n'),
    'packages/shared/lib/widgets/button.dart': 'class SharedButton {}\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)

  assert.deepEqual(doc.stats.languages, { dart: 5 })
  assert.ok(!doc.files.some(f => f.path === 'pubspec.yaml'), 'pubspec 只作清单')
  assert.ok(!doc.files.some(f => f.path === 'packages/shared/pubspec.yaml'), '嵌套 pubspec 只作清单')
  const appSymbols = doc.files.find(f => f.path === 'lib/app.dart').symbols
  assert.ok(appSymbols.some(s => s.name === 'App' && s.kind === 'class'))
  assert.ok(appSymbols.some(s => s.name === 'build' && s.parent === 'App'))
  assert.ok(doc.files.find(f => f.path === 'test/app_test.dart').symbols.some(s => s.name === 'main'))

  const edge = (from, to) => doc.edges.find(e => e.from === from && e.to === to)
  assert.equal(edge('lib/app.dart', 'lib/src/screen.dart')?.line, 2, '相对 import 行号')
  assert.equal(edge('lib/app.dart', 'lib/app.g.dart')?.line, 5, 'part 指令建本地边')
  assert.equal(edge('test/app_test.dart', 'lib/app.dart')?.line, 2, '../lib 相对路径解析')
  const selfPackage = doc.edges.find(e => e.from === 'lib/app.dart' && e.to === 'lib/src/screen.dart' && e.line === 3)
  assert.ok(selfPackage, 'package:<本包>/src/screen.dart 解析到 lib/src/screen.dart')
  const shared = doc.edges.find(e => e.from === 'lib/app.dart'
    && e.to === 'packages/shared/lib/widgets/button.dart')
  assert.equal(shared?.line, 4, '工作区 package: 解析到嵌套包的 lib/')
  assert.ok(!doc.edges.some(e => e.from === 'lib/app.dart' && e.to.includes('flutter')), 'package: 外部依赖不建边')

  assert.equal(doc.stack.projectName, 'demo_app')
  assert.ok(doc.stack.technologies.some(t => t.name === 'Flutter' && t.ecosystem === 'pub'))
  assert.ok(doc.stack.technologies.some(t => t.name === 'Provider' && t.ecosystem === 'pub'))
  assert.equal(doc.stack.dependencyCounts.pub, 4, '根包 3 + 嵌套包 1')
})

test('Swift：本地 target 导入解析到 Sources/<Target> 代表文件', async () => {
  const dir = makeProject({
    'Package.swift': '// swift-tools-version:5.9\nimport PackageDescription\n',
    // 代表文件 import 自身所在 target：解析结果等于文件自身，应跳过自引用
    'Sources/Core/Core.swift': 'import Core\npublic struct Core {}\n',
    'Sources/Core/Util.swift': 'func helper() {}\n',
    'Sources/App/main.swift': 'import Core\nimport Foundation\nimport Core.Models\n',
    'Tests/AppTests/AppTests.swift': 'import Core\nimport App\nimport XCTest\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)

  const edge = (from, to) => doc.edges.find(e => e.from === from && e.to === to)
  assert.equal(edge('Sources/App/main.swift', 'Sources/Core/Core.swift')?.line, 1, '本地 target 建边（代表文件）')
  assert.equal(edge('Sources/App/main.swift', 'Sources/Core/Core.swift')?.to, 'Sources/Core/Core.swift')
  assert.ok(!doc.edges.some(e => e.from === 'Sources/Core/Core.swift' && e.to === 'Sources/Core/Core.swift'), '自引用不建边')
  assert.equal(doc.edges.filter(e => e.from === 'Sources/App/main.swift').length, 2, 'Core 与 Core.Models 两处 import 各记一条边')
  assert.equal(edge('Tests/AppTests/AppTests.swift', 'Sources/Core/Core.swift')?.line, 1, '测试 target 可导入被测模块')
  assert.equal(edge('Tests/AppTests/AppTests.swift', 'Sources/App/main.swift')?.line, 2, 'App target 解析到其代表文件')
  assert.equal(doc.edges.filter(e => e.from === 'Tests/AppTests/AppTests.swift').length, 2, 'XCTest 外部模块不建边')
})

test('Swift：Package.swift 自定义 path 目标优先于 Sources 约定，注释声明被忽略', async () => {
  const dir = makeProject({
    'Package.swift': [
      '// swift-tools-version:5.9',
      'import PackageDescription',
      '',
      '// 注释里的声明不应生效：.target(name: "Ghost", path: "Modules/CoreKit")',
      'let package = Package(',
      '  name: "Demo",',
      '  targets: [',
      '    .executableTarget(',
      '      name: "App",',
      '      dependencies: [.target(name: "CoreKit")],',
      '      path: "Modules/App"',
      '    ),',
      '    .target(name: "CoreKit", path: "Modules/CoreKit"),',
      '    .testTarget(name: "AppTests", dependencies: ["App"], path: "Modules/AppTests")',
      '  ]',
      ')',
    ].join('\n'),
    'Modules/App/main.swift': 'import CoreKit\nimport AppTests\nimport Ghost\n',
    'Modules/CoreKit/Zeta.swift': 'public let zeta = 1\n',
    'Modules/CoreKit/Alpha.swift': 'public let version = 1\n',
    'Modules/AppTests/AppTests.swift': 'import App\n',
    // 同名目录约定存在时，显式 path 仍优先
    'Sources/CoreKit/Convention.swift': 'public let convention = 1\n',
    'Sources/Legacy/entry.swift': 'import CoreKit\nimport Ghost\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const edge = (from, to) => doc.edges.find(e => e.from === from && e.to === to)
  assert.equal(edge('Modules/App/main.swift', 'Modules/CoreKit/Alpha.swift')?.line, 1, '自定义 path 目录代表文件（字典序最小）')
  assert.equal(edge('Modules/App/main.swift', 'Modules/AppTests/AppTests.swift')?.line, 2, 'testTarget 同样可被导入')
  assert.equal(doc.edges.filter(e => e.from === 'Modules/App/main.swift').length, 2, '注释声明/未声明 target 不建边')
  assert.equal(edge('Modules/AppTests/AppTests.swift', 'Modules/App/main.swift')?.line, 1, 'testTarget 依赖 App 目标')
  assert.equal(edge('Sources/Legacy/entry.swift', 'Modules/CoreKit/Alpha.swift')?.line, 1, '显式 path 优先于 Sources 约定')
  assert.ok(!doc.edges.some(e => e.to === 'Sources/CoreKit/Convention.swift'), '同名约定目录不参与解析')
})

test('Ruby：裸 require 按 lib 加载路径解析，require_relative 保持文件相对', async () => {
  const dir = makeProject({
    'lib/billing.rb': "require 'billing/invoice'\n",
    'lib/billing/invoice.rb': "require 'billing/base'\nrequire_relative 'tax'\n",
    'lib/billing/base.rb': 'module Base; end\n',
    'lib/billing/tax.rb': 'module Tax; end\n',
    // 多级 lib：全局加载路径依次尝试
    'packages/core/lib/core.rb': "require 'core/util'\n",
    'packages/core/lib/core/util.rb': 'module Core::Util; end\n',
    'app.rb': "require 'billing/invoice'\nrequire 'json'\n",
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const edge = (from, to) => doc.edges.find(e => e.from === from && e.to === to)
  assert.equal(edge('lib/billing/invoice.rb', 'lib/billing/base.rb')?.line, 1, '裸 require 相对 lib 根而非当前文件目录')
  assert.equal(edge('lib/billing/invoice.rb', 'lib/billing/tax.rb')?.line, 2, 'require_relative 仍相对文件目录')
  assert.equal(edge('lib/billing.rb', 'lib/billing/invoice.rb')?.line, 1, '包入口 require 命中 lib 根')
  assert.equal(edge('packages/core/lib/core.rb', 'packages/core/lib/core/util.rb')?.line, 1, '多级 lib 目录参与加载路径')
  assert.equal(edge('app.rb', 'lib/billing/invoice.rb')?.line, 1, '根目录文件的裸 require 也走加载路径')
  assert.equal(doc.edges.filter(e => e.from === 'app.rb').length, 1, '外部 gem require 不建边')
})

test('Git 元数据：索引记录分支与提交（只读 .git/HEAD）', async () => {
  const dir = makeProject({
    'a.ts': 'export function main() {}\n',
    '.git/HEAD': 'ref: refs/heads/main\n',
    '.git/refs/heads/main': `${'b'.repeat(40)}\n`,
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  assert.deepEqual(doc.git, { branch: 'main', commit: 'b'.repeat(40), shortCommit: 'bbbbbbb' })
  assert.ok(!doc.files.some(f => f.path.startsWith('.git/')), '.git 不进入文件索引')
})

test('排除规则：node_modules/.git/资产目录不进入索引', async () => {
  const dir = makeProject({
    'keep.ts': 'export const a = 1\n',
    'node_modules/lib/index.js': 'export const b = 2\n',
    '.git/HEAD': 'ref: refs/heads/main',
    'dist/bundle.js': 'var c = 3\n',
    '.dsh-repowiki/index.json': '{}',
  })
  const fs = makeFakeFs(dir)
  const doc = await buildIndex(fs, dir)
  const paths = doc.files.map(f => f.path)
  assert.ok(paths.includes('keep.ts'))
  for (const p of paths) {
    assert.ok(!p.startsWith('node_modules/'), p)
    assert.ok(!p.startsWith('.git/'), p)
    assert.ok(!p.startsWith('dist/'), p)
    assert.ok(!p.startsWith('.dsh-repowiki/'), p)
  }
})

test('maxFiles 上限停扫且 capped=true', async () => {
  const files = {}
  for (let i = 0; i < 10; i++) files[`f${i}.ts`] = 'export const x = 1\n'
  const dir = makeProject(files)
  const fs = makeFakeFs(dir)
  const doc = await buildIndex(fs, dir, { maxFiles: 4 })
  assert.equal(doc.stats.capped, true)
  assert.ok(doc.stats.files <= 4)
})

test('F4 回归：非源码文件耗尽预算时 capped 必须为真（不得谎报索引完整）', async () => {
  // 5000 个 .md 文件（不入索引）+ 10 个源码文件；maxFiles=100 时预算在
  // 非源码文件上耗尽——旧实现 capped=false，用户会误以为索引完整
  const files = {}
  for (let i = 0; i < 150; i++) files[`note${i}.md`] = '# note\n'
  for (let i = 0; i < 10; i++) files[`s${i}.ts`] = 'export const x = 1\n'
  const dir = makeProject(files)
  const fs = makeFakeFs(dir)
  const doc = await buildIndex(fs, dir, { maxFiles: 100 })
  assert.equal(doc.stats.capped, true, '遍历因预算提前终止时 capped 必须为真')
  assert.ok(doc.stats.files < 10, '预算被非源码文件占用，源码文件应有遗漏')
})

test('不可读文件不阻断整体索引', async () => {
  const dir = makeProject({
    'good.ts': 'export const fine = 1\n',
    'bad.ts': 'export const oops = 2\n',
  })
  nodefs.chmodSync(path.join(dir, 'bad.ts'), 0o000)
  const fs = makeFakeFs(dir)
  try {
    const doc = await buildIndex(fs, dir)
    assert.ok(doc.files.some(f => f.path === 'good.ts'))
  } finally {
    nodefs.chmodSync(path.join(dir, 'bad.ts'), 0o644)
  }
})

test('增量重建：未变文件复用旧条目，变化文件重算', async () => {
  const dir = makeProject({
    'package.json': '{}',
    'src/stable.ts': 'export const a = 1\n',
    'src/moving.ts': 'export const b = 2\n',
  })
  const fs = makeFakeFs(dir)
  const first = await buildIndex(fs, dir)
  assert.equal(first.stats.reused, 0, '无基准时全量提取')
  assert.equal(first.stats.added, 2, '首版两个源码文件均为新增')
  assert.equal(first.stats.changed, 0)
  assert.equal(first.stats.removed, 0)

  // 内容未变：全部复用，条目内容与首版一致
  const same = await buildIndex(fs, dir, { previous: first })
  assert.equal(same.stats.reused, first.stats.files)
  assert.equal(same.stats.added, 0)
  assert.equal(same.stats.changed, 0)
  assert.equal(same.stats.removed, 0)
  assert.deepEqual(
    same.files.find(f => f.path === 'src/stable.ts'),
    first.files.find(f => f.path === 'src/stable.ts'),
  )

  // 修改一个文件：只有它重算，digest 变化可观测
  nodefs.writeFileSync(path.join(dir, 'src/moving.ts'), 'export const b = 22\n')
  const after = await buildIndex(fs, dir, { previous: first })
  assert.equal(after.stats.reused, first.stats.files - 1)
  assert.equal(after.stats.added, 0)
  assert.equal(after.stats.changed, 1, '修改文件计入 changed')
  assert.equal(after.stats.removed, 0)
  assert.notEqual(
    after.files.find(f => f.path === 'src/moving.ts').digest,
    first.files.find(f => f.path === 'src/moving.ts').digest,
  )
  assert.equal(
    after.files.find(f => f.path === 'src/stable.ts').digest,
    first.files.find(f => f.path === 'src/stable.ts').digest,
  )
  for (const f of after.files) {
    assert.equal(typeof f.digest, 'string')
    assert.equal(f.digest.length, DIGEST_CHARS)
  }

  // 删除一个文件：不再出现在索引
  nodefs.unlinkSync(path.join(dir, 'src/stable.ts'))
  const dropped = await buildIndex(fs, dir, { previous: after })
  assert.ok(!dropped.files.some(f => f.path === 'src/stable.ts'))
  assert.equal(dropped.stats.removed, 1, '删除文件计入 removed')
  assert.equal(dropped.stats.added, 0)
  assert.equal(dropped.stats.changed, 0)
})

test('增量重建：解析器版本变化使旧 imports 缓存失效且保留变更统计', async () => {
  const dir = makeProject({
    'src/a.ts': 'export const alpha = 1\n',
    'src/b.ts': "import {\n  alpha,\n} from './a'\nexport const beta = alpha\n",
  })
  const fs = makeFakeFs(dir)
  const first = await buildIndex(fs, dir)
  assert.equal(first.parserVersion, INDEX_PARSER_VERSION)
  const legacy = JSON.parse(JSON.stringify(first))
  delete legacy.parserVersion
  legacy.files.find(file => file.path === 'src/b.ts').imports = []
  legacy.edges = []

  const rebuilt = await buildIndex(fs, dir, { previous: legacy })
  assert.equal(rebuilt.stats.reused, 0, '旧解析规则的结果不能复用')
  assert.equal(rebuilt.stats.added, 0, '缓存失效不把已存在文件误报为新增')
  assert.equal(rebuilt.stats.changed, first.stats.files)
  assert.equal(rebuilt.stats.removed, 0)
  assert.deepEqual(rebuilt.edges.map(edge => ({ from: edge.from, to: edge.to, symbols: edge.symbols })),
    [{ from: 'src/b.ts', to: 'src/a.ts', symbols: ['alpha'] }])

  const next = await buildIndex(fs, dir, { previous: rebuilt })
  assert.equal(next.stats.reused, first.stats.files, '同解析规则的下一次恢复增量复用')
  assert.equal(next.stats.changed, 0)
})

test('digestText：同一内容稳定、不同内容相异', () => {
  assert.equal(digestText('hello'), digestText('hello'))
  assert.notEqual(digestText('hello'), digestText('hello!'))
  assert.equal(digestText('hello').length, DIGEST_CHARS)
})

test('buildIndex：协作式取消（预 abort）返回 aborted，调用方可安全丢弃', async () => {
  const dir = makeProject({ 'app.ts': 'export function main() {}\n' })
  const ac = new AbortController()
  ac.abort()
  const doc = await buildIndex(makeFakeFs(dir), dir, { signal: ac.signal })
  assert.equal(doc.stats.aborted, true)
  assert.equal(doc.files.length, 0, '取消后不再读取/解析文件')
})

test('索引并发：读取并发有界，装配顺序与串行一致', async () => {
  const files = {}
  for (let i = 0; i < 24; i++) files[`mod/f${i}.ts`] = `export const v${i} = ${i}\n`
  const dir = makeProject(files)
  const base = makeFakeFs(dir)
  let active = 0
  let maxActive = 0
  const delayed = {
    ...base,
    async readText(target) {
      active++
      maxActive = Math.max(maxActive, active)
      try {
        await new Promise(resolve => setTimeout(resolve, 5))
        return await base.readText(target)
      } finally {
        active--
      }
    },
  }
  const fast = await buildIndex(delayed, dir, { readConcurrency: 4 })
  assert.ok(maxActive > 1, '并发读取实际发生')
  assert.ok(maxActive <= 4, '并发不超过上限')
  const slow = await buildIndex(base, dir, { readConcurrency: 1 })
  assert.deepEqual(fast.files, slow.files, '并行与串行的文件条目完全一致（顺序与内容）')
  assert.equal(fast.stats.files, 24)
})

test('Python 自定义布局：pyproject package-dir / poetry from 作为导入根', async () => {
  const dir = makeProject({
    'pyproject.toml': [
      '[tool.setuptools]',
      'package-dir = {"" = "backend"}',
      '[tool.poetry]',
      'packages = [{ include = "acme", from = "python" }]',
    ].join('\n'),
    'backend/app/core.py': 'def core():\n    return 1\n',
    'backend/app/main.py': 'from app.core import core\n',
    'python/acme/util.py': 'def helper():\n    return 1\n',
    'tools/run.py': 'from acme.util import helper\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const edge = (from, to) => doc.edges.find(e => e.from === from && e.to === to)
  assert.equal(edge('backend/app/main.py', 'backend/app/core.py')?.line, 1, 'setuptools package-dir 作为导入根')
  assert.equal(edge('tools/run.py', 'python/acme/util.py')?.line, 1, 'poetry from 作为导入根')
  assert.deepEqual(doc.stats.languages, { python: 4 })
})

test('Python 自定义布局：非法导入根（绝对/上跳）被忽略', async () => {
  const dir = makeProject({
    'pyproject.toml': [
      '[tool.setuptools]',
      'package-dir = {"" = "/abs/path"}',
      '[tool.poetry]',
      'packages = [{ include = "acme", from = "../outside" }]',
    ].join('\n'),
    'app/core.py': 'def core():\n    return 1\n',
    'main.py': 'from app.core import core\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  assert.ok(doc.edges.some(e => e.from === 'main.py' && e.to === 'app/core.py'), '合法导入不受非法根影响')
})

test('索引跳过：超大文件计入 skipped 并给出告警（不静默丢文件）', async () => {
  const dir = makeProject({
    'ok.ts': 'export function ok() { return 1 }\n',
    'huge.ts': `export function huge() { return 1 }\n// ${'x'.repeat(MAX_FILE_BYTES)}\n`,
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  assert.equal(doc.stats.files, 1, '超大文件不进入索引')
  assert.equal(doc.stats.skipped, 1)
  assert.equal(doc.stats.skippedTooLarge, 1)
  assert.ok(doc.warnings?.some(w => /1 source file\(s\) skipped/.test(w)), '跳过原因进入 warnings')
})

test('Go 多模块：嵌套 go.mod 的 module 前缀解析到子模块包', async () => {
  const dir = makeProject({
    'go.mod': 'module example.com/root\n\ngo 1.22\n',
    'api/go.mod': 'module example.com/api\n\ngo 1.22\n',
    'api/handler/h.go': 'package handler\n\nfunc Handle() {}\n',
    'api/main.go': 'package main\n\nimport "example.com/api/handler"\n',
    'rootpkg/x.go': 'package rootpkg\n\nfunc X() {}\n',
    'main.go': 'package main\n\nimport "example.com/root/rootpkg"\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const edge = (from, to) => doc.edges.find(e => e.from === from && e.to === to)
  assert.equal(edge('api/main.go', 'api/handler/h.go')?.line, 3, '子模块 module 前缀生效')
  assert.equal(edge('main.go', 'rootpkg/x.go')?.line, 3, '根模块仍可解析')
})

test('Go internal 可见性：跨边界导入进入 warnings，树内导入不告警', async () => {
  const dir = makeProject({
    'go.mod': 'module example.com/demo\n\ngo 1.22\n',
    'pkg/internal/secret/s.go': 'package secret\n\nfunc S() {}\n',
    'pkg/ok/ok.go': 'package ok\n\nimport "example.com/demo/pkg/internal/secret"\n',
    'other/use.go': 'package other\n\nimport "example.com/demo/pkg/internal/secret"\n',
    'nested/internal/deep/internal/leaf/l.go': 'package leaf\n\nfunc L() {}\n',
    'nested/x.go': 'package nested\n\nimport "example.com/demo/nested/internal/deep/internal/leaf"\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const edge = (from, to) => doc.edges.find(e => e.from === from && e.to === to)
  assert.ok(edge('pkg/ok/ok.go', 'pkg/internal/secret/s.go'), '树内导入仍建边')
  assert.ok(edge('other/use.go', 'pkg/internal/secret/s.go'), '违规导入仍建边（索引不隐藏事实）')
  const warnings = (doc.warnings ?? []).filter(w => w.includes('internal'))
  assert.equal(warnings.length, 2, '两条跨边界导入各一条 warning')
  assert.ok(warnings.some(w => w.includes('other/use.go') && w.includes('pkg/internal')),
    '外层越界导入告警并指明边界')
  assert.ok(warnings.some(w => w.includes('nested/x.go') && w.includes('nested/internal/deep/internal')),
    '嵌套 internal 取最内层边界')
  assert.ok(!warnings.some(w => w.includes('pkg/ok/ok.go')), '树内导入不告警')

  // 根 internal 对所有包可见：不告警
  const rootDir = makeProject({
    'go.mod': 'module example.com/demo\n\ngo 1.22\n',
    'internal/util/u.go': 'package util\n\nfunc U() {}\n',
    'cmd/use.go': 'package cmd\n\nimport "example.com/demo/internal/util"\n',
  })
  const rootDoc = await buildIndex(makeFakeFs(rootDir), rootDir)
  assert.deepEqual((rootDoc.warnings ?? []).filter(w => w.includes('internal')), [], '根 internal 不限制导入方')
})

test('Go internal 违规超过 50 条时折叠为汇总（防止索引膨胀）', async () => {
  const fixture = {
    'go.mod': 'module example.com/demo\n\ngo 1.22\n',
    'pkg/internal/secret/s.go': 'package secret\n\nfunc S() {}\n',
  }
  // 60 个模块外文件各越界导入同一 internal 包 → 60 条违规
  for (let i = 0; i < 60; i++) {
    fixture[`use${String(i).padStart(2, '0')}.go`] =
      'package use\n\nimport "example.com/demo/pkg/internal/secret"\n'
  }
  const dir = makeProject(fixture)
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const internal = (doc.warnings ?? []).filter(w => w.includes('internal'))
  assert.equal(internal.length, 51, '前 50 条 + 1 条汇总')
  assert.match(internal.at(-1), /… 10 more Go internal visibility violation\(s\) omitted \(capped at 50\)\./)
})

test('Vue SFC：脚本块符号与相对导入进入索引，行号对齐', async () => {
  const dir = makeProject({
    'App.vue': [
      '<template>',
      '  <div>{{ label }}</div>',
      '</template>',
      '',
      '<script setup lang="ts">',
      "import { helper } from './util'",
      'const label = helper()',
      'export function boot() {',
      '  return label',
      '}',
      '</script>',
    ].join('\n'),
    'util.ts': 'export function helper() { return 1 }\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const app = doc.files.find(f => f.path === 'App.vue')
  assert.equal(app?.lang, 'vue')
  assert.deepEqual(app?.symbols.map(s => [s.name, s.line]), [['boot', 8]])
  const edge = doc.edges.find(e => e.from === 'App.vue')
  assert.equal(edge?.to, 'util.ts', 'SFC 内相对导入解析为本地边')
  assert.equal(edge?.line, 6, 'import 行号指向源文件而非 script 块内偏移')
  assert.deepEqual(doc.stats.languages, { typescript: 1, vue: 1 })
})

test('Svelte：脚本块符号与相对导入进入索引', async () => {
  const dir = makeProject({
    'Counter.svelte': [
      '<script context="module">',
      "import { helper } from './util'",
      '</script>',
      '',
      '<script>',
      'export let count = 0',
      '</script>',
      '',
      '<button>{count}</button>',
    ].join('\n'),
    'util.ts': 'export function helper() { return 1 }\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const counter = doc.files.find(f => f.path === 'Counter.svelte')
  assert.equal(counter?.lang, 'svelte')
  assert.deepEqual(counter?.symbols.map(s => [s.name, s.line]), [['count', 6]])
  const edge = doc.edges.find(e => e.from === 'Counter.svelte')
  assert.equal(edge?.to, 'util.ts')
  assert.equal(edge?.line, 2, '模块脚本行号对齐')
  assert.deepEqual(doc.stats.languages, { svelte: 1, typescript: 1 })
})

test('Python 自定义布局：Hatch packages 的父目录作为导入根', async () => {
  const dir = makeProject({
    'pyproject.toml': [
      '[tool.hatch.build.targets.wheel]',
      'packages = [',
      '  "src/foo",',
      '  "backend/bar",',
      ']',
    ].join('\n'),
    'src/foo/core.py': 'def core():\n    return 1\n',
    'backend/bar/util.py': 'def helper():\n    return 1\n',
    'apps/main.py': 'from foo.core import core\nfrom bar.util import helper\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const edge = (from, to) => doc.edges.find(e => e.from === from && e.to === to)
  assert.equal(edge('apps/main.py', 'src/foo/core.py')?.line, 1, 'Hatch src/foo → 导入根 src')
  assert.equal(edge('apps/main.py', 'backend/bar/util.py')?.line, 2, 'Hatch backend/bar → 导入根 backend')
})

test('Python 自定义布局：Hatch 单段包名与非法值被忽略', async () => {
  const dir = makeProject({
    'pyproject.toml': [
      '[tool.hatch.build]',
      'packages = ["app", "../outside/pkg"]',
    ].join('\n'),
    'app/core.py': 'def core():\n    return 1\n',
    'main.py': 'from app.core import core\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  assert.ok(doc.edges.some(e => e.from === 'main.py' && e.to === 'app/core.py'), '项目根导入仍生效')
})

test('JS/TS 别名：tsconfig paths（通配/精确）与 baseUrl 解析为本地边', async () => {
  const dir = makeProject({
    // JSONC：注释与尾逗号是 tsconfig 的常态写法
    'tsconfig.json': `{
      // 路径别名
      "compilerOptions": {
        "baseUrl": ".",
        "paths": {
          "@/*": ["src/*"],
          "@config": ["src/config/index.ts"],
        },
      },
    }`,
    'src/app.ts': [
      "import { x } from '@/lib/util';",
      "import cfg from '@config';",
      "import { y } from 'src/lib/util';",
      "import { z } from 'react';",
    ].join('\n'),
    'src/lib/util.ts': 'export const x = 1\nexport const y = 1\n',
    'src/config/index.ts': 'export default 1\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const edges = doc.edges.filter(e => e.from === 'src/app.ts')
  assert.deepEqual(
    edges.map(e => [e.line, e.to]).sort((a, b) => a[0] - b[0]),
    [
      [1, 'src/lib/util.ts'],
      [2, 'src/config/index.ts'],
      [3, 'src/lib/util.ts'],
    ],
    '通配别名、精确别名与 baseUrl 绝对导入各自建边；外部包不建边',
  )
})

test('JS/TS 别名：就近 tsconfig 优先，跨包别名不互相污染', async () => {
  const dir = makeProject({
    'tsconfig.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }',
    'packages/ui/tsconfig.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }',
    'src/helper.ts': 'export const which = "root"\n',
    'src/b.ts': "import { which } from '@/helper';\n",
    'packages/ui/src/helper.ts': 'export const which = "ui"\n',
    'packages/ui/src/a.ts': "import { which } from '@/helper';\n",
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const edge = (from, to) => doc.edges.find(e => e.from === from && e.to === to)
  assert.ok(edge('packages/ui/src/a.ts', 'packages/ui/src/helper.ts'), '包内文件用包自己的配置')
  assert.ok(!edge('packages/ui/src/a.ts', 'src/helper.ts'), '不得解析到根目录同名文件')
  assert.ok(edge('src/b.ts', 'src/helper.ts'), '根目录文件用根配置')
})

test('JS/TS 工作区：monorepo 包名导入解析到 exports / 入口 / 子路径', async () => {
  const dir = makeProject({
    'package.json': JSON.stringify({ name: 'monorepo', private: true, workspaces: ['packages/*'] }),
    'packages/ui/package.json': JSON.stringify({
      name: '@acme/ui',
      main: 'dist/index.js',
      // 子路径导出（含通配）；main 指向未索引的 dist，需回退源码入口
      exports: {
        '.': './src/index.ts',
        './button': './src/button.ts',
        './hooks/*': './src/hooks/*.ts',
      },
    }),
    'packages/ui/src/index.ts': 'export const Button = 1\n',
    'packages/ui/src/button.ts': 'export const thing = 2\n',
    'packages/ui/src/hooks/use-thing.ts': 'export const useThing = 3\n',
    // 条件导出（无子路径键）：根入口按值顺序收集
    'packages/config/package.json': JSON.stringify({
      name: '@acme/config',
      exports: { '.': { import: './src/main.ts', default: ['./src/fallback.ts'] } },
    }),
    'packages/config/src/main.ts': 'export const config = 1\n',
    'apps/web/src/app.ts': [
      "import { Button } from '@acme/ui';",
      "import { thing } from '@acme/ui/button';",
      "import { useThing } from '@acme/ui/hooks/use-thing';",
      "import { config } from '@acme/config';",
      "import lodash from 'lodash';",
    ].join('\n'),
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const edge = (to) => doc.edges.find(e => e.from === 'apps/web/src/app.ts' && e.to === to)
  assert.equal(edge('packages/ui/src/index.ts')?.line, 1, 'exports "." 映射到源码入口')
  assert.equal(edge('packages/ui/src/button.ts')?.line, 2, '精确子路径导出')
  assert.equal(edge('packages/ui/src/hooks/use-thing.ts')?.line, 3, '通配子路径导出')
  assert.equal(edge('packages/config/src/main.ts')?.line, 4, '条件导出取首个可解析目标')
  assert.equal(doc.edges.filter(e => e.from === 'apps/web/src/app.ts').length, 4, '外部包 lodash 不建边')
})

test('JS/TS 别名容错：坏配置/缺 name/非数组 paths 均静默降级；同名包根目录优先', async () => {
  const dir = makeProject({
    'tsconfig.json': '{ "compilerOptions": { "paths": { "@bad": "src/x", "@/ok/*": [1, "src/*"] } } }',
    'tsconfig.node.json': '{ "compilerOptions": ',
    'package.json': JSON.stringify({ name: 'dup' }),
    'src/index.ts': 'export const root = 1\n',
    'src/x.ts': 'export const x = 1\n',
    'packages/x/package.json': JSON.stringify({ name: 'dup', main: 'src/main.ts' }),
    'packages/x/src/main.ts': 'export const nested = 1\n',
    'packages/y/package.json': JSON.stringify({ private: true }),
    'app.ts': "import { root } from 'dup';\nimport { x } from '@bad';\nimport { ok } from '@/ok/x';\n",
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const edges = doc.edges.filter(e => e.from === 'app.ts')
  assert.equal(edges.find(e => e.line === 1)?.to, 'src/index.ts', '同名包取目录更浅的（根包）')
  assert.equal(edges.find(e => e.line === 2), undefined, '非数组 paths 目标被跳过')
  assert.equal(edges.find(e => e.line === 3)?.to, 'src/x.ts', '数组中的非法项被跳过，合法项仍生效')
})

test('stripJsonc：注释与尾逗号，字符串内的 // 与逗号不受影响', () => {
  const text = `{
    // 行注释
    "url": "http://example.com//path",
    /* 块注释 */
    "list": [1, 2,],
  }`
  assert.deepEqual(JSON.parse(stripJsonc(text)), {
    url: 'http://example.com//path',
    list: [1, 2],
  })
  assert.equal(stripJsonc('{ "a": 1, }'), '{ "a": 1 }')
  assert.equal(typeof stripJsonc('/* 未闭合'), 'string', '未闭合注释不抛错')
})

test('C/C++：#include 相对目录与 include/src 根解析，系统头不建边', async () => {
  const dir = makeProject({
    'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.20)\nproject(DemoC)\nfind_package(fmt REQUIRED)\n',
    'plugins/extra/CMakeLists.txt': 'project(Extra)\nfind_package(Qt6 COMPONENTS Core)\n',
    'src/main.c': '#include "util/helpers.h"\n#include <stdio.h>\n#include "local.h"\n',
    'src/util/helpers.h': '#pragma once\nint helper(void);\n',
    'src/local.h': '#pragma once\n',
    'include/core/api.hpp': '#pragma once\nclass Api { public: void run(); };\n',
    'src/service.cpp': '#include <core/api.hpp>\n#include "../src/util/helpers.h"\n#include <vector>\n',
  })
  const doc = await buildIndex(makeFakeFs(dir), dir)
  const edge = (from, to) => doc.edges.find(e => e.from === from && e.to === to)
  assert.equal(edge('src/main.c', 'src/util/helpers.h')?.line, 1, '同目录相对 include')
  assert.equal(edge('src/main.c', 'src/local.h')?.line, 3)
  assert.equal(doc.edges.filter(e => e.from === 'src/main.c').length, 2, '系统头 <stdio.h> 不建边')
  assert.equal(edge('src/service.cpp', 'include/core/api.hpp')?.line, 1, '尖括号 include 经 include 根解析')
  assert.equal(edge('src/service.cpp', 'src/util/helpers.h')?.line, 2, '相对路径规范化（../src）')
  assert.equal(doc.edges.filter(e => e.from === 'src/service.cpp').length, 2, '系统头 <vector> 不建边')
  assert.deepEqual(doc.stats.languages, { c: 3, cpp: 2 })
  assert.equal(doc.stack.projectName, 'DemoC', 'CMake project() 提供项目名')
  assert.ok(doc.stack.technologies.some(t => t.name === 'fmt' && t.ecosystem === 'cmake'), 'CMake find_package 技术识别')
  assert.equal(doc.stack.dependencyCounts.cmake, 2, '嵌套子项目 CMake 依赖计数合并')
  assert.ok(doc.stack.technologies.some(t => t.name === 'Qt' && t.source === 'plugins/extra/CMakeLists.txt'), '子项目清单来源可追溯')
  const header = doc.files.find(f => f.path === 'src/util/helpers.h')
  assert.ok(header.symbols.some(s => s.name === 'helper' && s.kind === 'function'), '头文件原型计入符号')
})
