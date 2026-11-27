/**
 * 技术栈识别单元测试。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { detectStack } from '../src/stack.js'

test('package.json：项目元数据 + 常规/scoped 依赖识别 + 去重', () => {
  const pkg = JSON.stringify({
    name: 'demo-app',
    version: '1.2.3',
    dependencies: { react: '^18', '@nestjs/core': '^10', axios: '^1' },
    devDependencies: { vitest: '^1', 'react': '^18' }, // 与 dependencies 重复
  })
  const info = detectStack({ 'package.json': pkg })
  assert.equal(info.projectName, 'demo-app')
  assert.equal(info.projectVersion, '1.2.3')
  assert.equal(info.dependencyCounts.npm, 4)
  const names = info.technologies.map(t => t.name)
  assert.ok(names.includes('React'))
  assert.ok(names.includes('NestJS'), 'scoped 包按精确名命中')
  assert.ok(names.includes('Axios'))
  assert.ok(names.includes('Vitest'))
  // 同一技术来自 deps+devDeps 只计一次
  assert.equal(names.filter(n => n === 'React').length, 1)
})

test('requirements.txt：版本约束剥离与常见包识别', () => {
  const reqs = [
    '# 注释行',
    'django==4.2.0',
    'fastapi>=0.100',
    'requests>=2,<3',
    'unknown-pkg-xyz ; python_version>"3.8"',
    'pytest',
  ].join('\n')
  const info = detectStack({ 'requirements.txt': reqs })
  const names = info.technologies.map(t => t.name)
  assert.ok(names.includes('Django'))
  assert.ok(names.includes('FastAPI'))
  assert.ok(names.includes('Requests'))
  assert.ok(names.includes('pytest'))
  assert.ok(!names.some(n => n.includes('unknown')), '未命中映射不产生技术条目')
})

test('go.mod：require 块与单行 require 均可识别', () => {
  const goMod = [
    'module example.com/demo',
    'go 1.22',
    'require (',
    '\tgithub.com/gin-gonic/gin v1.9',
    '\tgithub.com/spf13/cobra v1.8',
    ')',
    'require github.com/stretchr/testify v1.9',
  ].join('\n')
  const info = detectStack({ 'go.mod': goMod })
  const names = info.technologies.map(t => t.name)
  assert.ok(names.includes('Gin'))
  assert.ok(names.includes('Cobra'))
  assert.ok(names.includes('testify'), '单行 require 也识别')
})

test('Cargo.toml：[dependencies] 段 crate 识别', () => {
  const cargo = [
    '[dependencies]',
    'tokio = { version = "1", features = ["full"] }',
    'serde = "1"',
    'reqwest = "0.12"',
    '',
    '[dev-dependencies]',
    'criterion = "0.5"',
  ].join('\n')
  const info = detectStack({ 'Cargo.toml': cargo })
  const names = info.technologies.map(t => t.name)
  assert.ok(names.includes('Tokio'))
  assert.ok(names.includes('Serde'))
  assert.ok(names.includes('Reqwest'))
  assert.ok(!names.includes('criterion'), '表外 crate 不误识别')
})

test('pom.xml：Maven 依赖识别与项目名', () => {
  const pom = [
    '<project>',
    '  <artifactId>demo-service</artifactId>',
    '  <name>Demo Service</name>',
    '  <dependencies>',
    '    <dependency>',
    '      <groupId>org.springframework.boot</groupId>',
    '      <artifactId>spring-boot-starter-web</artifactId>',
    '      <version>3.2.0</version>',
    '    </dependency>',
    '    <dependency>',
    '      <groupId>org.junit.jupiter</groupId>',
    '      <artifactId>junit-jupiter</artifactId>',
    '      <scope>test</scope>',
    '    </dependency>',
    '    <dependency>',
    '      <groupId>com.acme</groupId>',
    '      <artifactId>unknown-lib</artifactId>',
    '    </dependency>',
    '    <dependency>',
    '      <groupId>org.springframework</groupId>',
    '      <artifactId>spring-beans</artifactId>',
    '    </dependency>',
    '  </dependencies>',
    '</project>',
  ].join('\n')
  const info = detectStack({ 'pom.xml': pom })
  const names = info.technologies.map(t => t.name)
  assert.equal(info.projectName, 'demo-service', '项目名取 dependencies 外的首个 artifactId')
  assert.equal(info.dependencyCounts.maven, 4)
  assert.ok(names.includes('Spring Boot'))
  assert.ok(names.includes('Spring Framework'), 'artifact 未命中时按 groupId 前缀兜底')
  assert.ok(names.includes('JUnit 5'))
  assert.ok(!names.some(n => n.includes('unknown')), '未命中映射不产生技术条目')
  assert.equal(info.technologies[0].ecosystem, 'jvm')
})

test('build.gradle：Groovy/Kotlin DSL 依赖坐标', () => {
  const gradle = [
    'rootProject.name = "demo-gradle"',
    'dependencies {',
    "  implementation 'org.springframework.boot:spring-boot-starter-web:3.2.0'",
    '  implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.0")',
    "  testImplementation 'org.junit.jupiter:junit-jupiter:5.10.0'",
    "  runtimeOnly 'com.h2database:h2:2.2.0'",
    '}',
  ].join('\n')
  const info = detectStack({ 'build.gradle.kts': gradle })
  const names = info.technologies.map(t => t.name)
  assert.equal(info.projectName, 'demo-gradle')
  assert.equal(info.dependencyCounts.gradle, 4)
  assert.ok(names.includes('Spring Boot'))
  assert.ok(names.includes('Kotlin'))
  assert.ok(names.includes('JUnit 5'))
  assert.ok(!names.includes('h2'), '表外依赖不误识别')
})

test('composer.json：PHP 依赖识别、前缀兜底与项目名', () => {
  const composer = JSON.stringify({
    name: 'acme/app',
    require: {
      'laravel/framework': '^10.0',
      'symfony/console': '^6.4',
      'php': '^8.2',
      'acme/unknown': '^1.0',
    },
    'require-dev': { 'phpunit/phpunit': '^10.0' },
  })
  const info = detectStack({ 'composer.json': composer })
  const names = info.technologies.map(t => t.name)
  assert.equal(info.projectName, 'acme/app')
  assert.equal(info.dependencyCounts.composer, 5)
  assert.ok(names.includes('Laravel'))
  assert.ok(names.includes('Symfony'))
  assert.ok(names.includes('PHPUnit'))
  assert.ok(!names.some(n => n.includes('unknown')), '未命中映射不产生技术条目')
  assert.ok(info.technologies.every(t => t.ecosystem === 'composer'))
})

test('Gemfile：gem 声明、版本约束与生态标签', () => {
  const gemfile = [
    "source 'https://rubygems.org'",
    "gem 'rails', '~> 7.1'",
    'gem "puma", ">= 6.0"',
    "gem 'rspec-rails', group: :test",
    "gem 'unknown-gem'",
    '# gem \'commented\'',
  ].join('\n')
  const info = detectStack({ Gemfile: gemfile })
  const names = info.technologies.map(t => t.name)

  assert.equal(info.dependencyCounts.bundler, 4)
  assert.ok(names.includes('Ruby on Rails'))
  assert.ok(names.includes('Puma'))
  assert.ok(names.includes('RSpec'))
  assert.ok(!names.some(n => n.includes('unknown')), '表外 gem 不误识别')
  const rails = info.technologies.find(t => t.name === 'Ruby on Rails')
  assert.match(rails.version, /7\.1/, '版本约束保留')
  assert.ok(info.technologies.every(t => t.ecosystem === 'bundler'))
})

test('Package.swift：远端包、仓库名归一与项目名', () => {
  const manifest = [
    '// swift-tools-version:5.9',
    'import PackageDescription',
    '',
    'let package = Package(',
    '    name: "DemoServer",',
    '    dependencies: [',
    '        .package(url: "https://github.com/vapor/vapor.git", from: "4.92.0"),',
    '        .package(url: "https://github.com/apple/swift-argument-parser", .upToNextMajor(from: "1.3.0")),',
    '        .package(url: "https://github.com/unknown/thing.git", from: "0.1.0"),',
    '    ],',
    '    targets: [.executableTarget(name: "App", dependencies: ["Vapor"])]',
    ')',
  ].join('\n')
  const info = detectStack({ 'Package.swift': manifest })
  const names = info.technologies.map(t => t.name)

  assert.equal(info.projectName, 'DemoServer')
  assert.equal(info.dependencyCounts.swiftpm, 3)
  assert.ok(names.includes('Vapor'))
  assert.ok(names.includes('ArgumentParser'))
  assert.ok(!names.some(n => n.includes('unknown')))
  assert.ok(info.technologies.every(t => t.ecosystem === 'swiftpm'))
})

test('build.sbt：libraryDependencies 坐标、groupId 兜底与项目名', () => {
  const sbt = [
    'ThisBuild / scalaVersion := "3.3.1"',
    'name := "demo-scala"',
    '',
    'libraryDependencies ++= Seq(',
    '  "org.apache.spark" %% "spark-core" % "3.5.0",',
    '  "org.typelevel" %% "cats-effect" % "3.5.2",',
    '  "org.scalatest" %% "scalatest" % "3.2.17" % Test,',
    '  "com.acme" %% "unknown-lib" % "0.1.0"',
    ')',
  ].join('\n')
  const info = detectStack({ 'build.sbt': sbt })
  const names = info.technologies.map(t => t.name)

  assert.equal(info.projectName, 'demo-scala')
  assert.equal(info.dependencyCounts.sbt, 4)
  assert.ok(names.includes('Apache Spark'))
  assert.ok(names.includes('Cats Effect'))
  assert.ok(names.includes('ScalaTest'))
  assert.ok(!names.some(n => n.includes('unknown')))
  assert.ok(info.technologies.every(t => t.ecosystem === 'sbt'))
})

test('build.zig.zon：项目名/版本/依赖直系子键计数', () => {
  const zon = [
    '.{',
    '    .name = .demo_app,',
    '    .version = "0.3.1",',
    '    .fingerprint = 0x1234,',
    '    .dependencies = .{',
    '        .zap = .{',
    '            .url = "git+https://github.com/zigzap/zap#v0.9.0",',
    '            .hash = "zap-123",',
    '        },',
    '        .known_folders = .{',
    '            .path = "../known-folders",',
    '        },',
    '        // .commented = .{ .path = "../x" },',
    '    },',
    '    .paths = .{ "", "build.zig", "src" },',
    '}',
  ].join('\n')
  const info = detectStack({ 'build.zig.zon': zon })
  assert.equal(info.projectName, 'demo_app')
  assert.equal(info.projectVersion, '0.3.1')
  assert.equal(info.dependencyCounts.zig, 2, '只数 dependencies 的直接子键')
})

test('build.zig.zon：旧版字符串项目名', () => {
  const zon = '.{ .name = "old_app", .version = "1.0.0", .dependencies = .{ .foo = .{} } }'
  const info = detectStack({ 'build.zig.zon': zon })
  assert.equal(info.projectName, 'old_app')
  assert.equal(info.projectVersion, '1.0.0')
  assert.equal(info.dependencyCounts.zig, 1)
})

test('gleam.toml：项目名/版本与依赖段计数', () => {
  const toml = [
    'name = "demo"',
    'version = "1.2.0"',
    '',
    '[dependencies]',
    'gleam_stdlib = ">= 0.44.0"',
    'wisp = "~> 1.0"',
    '',
    '[dev-dependencies]',
    'gleeunit = "~> 1.0"',
    'wisp = "~> 1.0"',
    '',
    '[erlang]',
    'extra_applications = ["logger"]',
  ].join('\n')
  const info = detectStack({ 'gleam.toml': toml })
  assert.equal(info.projectName, 'demo')
  assert.equal(info.projectVersion, '1.2.0')
  assert.equal(info.dependencyCounts.gleam, 3, '依赖去重且不跨段误计')
  assert.ok(info.technologies.some(t => t.name === 'Wisp' && t.ecosystem === 'gleam'))
  assert.ok(info.technologies.some(t => t.name === 'gleeunit'))
  assert.ok(!info.technologies.some(t => t.name === 'gleam_stdlib'), 'stdlib 只计数不列技术')
})

test('gleam.toml：monorepo 子包依赖合并、根项目名优先', () => {
  const info = detectStack({
    'gleam.toml': 'name = "root"\nversion = "0.1.0"\n[dependencies]\nwisp = "~> 1.0"\n',
    'apps/web/gleam.toml': 'name = "web"\n[dependencies]\nlustre = "~> 4.0"\n',
  })
  assert.equal(info.projectName, 'root', '项目名只取根清单')
  assert.equal(info.projectVersion, '0.1.0')
  assert.equal(info.dependencyCounts.gleam, 2, '子包依赖累加')
  assert.ok(info.technologies.some(t => t.name === 'Lustre' && t.source === 'apps/web/gleam.toml'))
})

test('build.zig.zon：monorepo 子包依赖累加、根元数据优先', () => {
  const info = detectStack({
    'build.zig.zon': '.{ .name = .root_app, .version = "0.1.0", .dependencies = .{ .zap = .{} } }',
    'apps/tool/build.zig.zon': '.{ .name = .tool, .version = "9.9.9", .dependencies = .{ .clap = .{}, .zap = .{} } }',
  })
  assert.equal(info.projectName, 'root_app', '项目名只取根清单')
  assert.equal(info.projectVersion, '0.1.0')
  assert.equal(info.dependencyCounts.zig, 3, '子包依赖直接子键累加')
  assert.deepEqual(info.technologies, [], 'zon 依赖键是自定义别名，不臆造技术名')
})

test('DESCRIPTION：DCF 续行、依赖去重与版本约束剥离', () => {
  const text = [
    'Package: demo',
    'Version: 0.2.0',
    'Depends:',
    '    R (>= 4.0),',
    '    methods',
    'Imports:',
    '    dplyr (>= 1.0.0),',
    '    ggplot2,',
    '    dplyr',
    'Suggests: testthat (>= 3.0.0)',
    'LinkingTo: Rcpp',
    'Description: A demo package.',
  ].join('\n')
  const info = detectStack({ DESCRIPTION: text })
  assert.equal(info.projectName, 'demo')
  assert.equal(info.projectVersion, '0.2.0')
  assert.equal(info.dependencyCounts.r, 5, 'R 本身剔除、重复依赖去重')
  assert.ok(info.technologies.some(t => t.name === 'ggplot2' && t.ecosystem === 'r'))
  assert.ok(info.technologies.some(t => t.name === 'Rcpp'))
})

test('多清单混合：生态不串扰', () => {
  const info = detectStack({
    'package.json': JSON.stringify({ dependencies: { vue: '^3' } }),
    'requirements.txt': 'flask\n',
  })
  const names = info.technologies.map(t => t.name)
  assert.ok(names.includes('Vue'))
  assert.ok(names.includes('Flask'))
})

test('坏 JSON 与空清单不抛异常', () => {
  const info = detectStack({ 'package.json': '{not json' })
  assert.deepEqual(info.technologies, [])
})

test('CMakeLists.txt：project 名与 find_package 技术识别（大小写/去重）', () => {
  const cmake = [
    'cmake_minimum_required(VERSION 3.20)',
    'PROJECT(DemoC LANGUAGES C CXX)',
    'find_package(Qt6 COMPONENTS Widgets REQUIRED)',
    'find_package(fmt CONFIG REQUIRED)',
    'find_package(UnknownPkg REQUIRED)',
    'FIND_PACKAGE(OpenCV 4 REQUIRED)',
    'find_package(fmt REQUIRED)',
  ].join('\n')
  const info = detectStack({ 'CMakeLists.txt': cmake })
  assert.equal(info.projectName, 'DemoC')
  assert.equal(info.dependencyCounts.cmake, 4, '同名 find_package 去重后计数')
  const names = info.technologies.map(t => t.name)
  assert.ok(names.includes('Qt'))
  assert.ok(names.includes('fmt'))
  assert.ok(names.includes('OpenCV'))
  assert.ok(!names.includes('UnknownPkg'), '未收录包名不臆造技术')
  assert.ok(info.technologies.every(t => t.ecosystem === 'cmake' && t.source === 'CMakeLists.txt'))
})

test('CMake 嵌套子项目：根项目名优先、依赖计数累加、技术去重', () => {
  const info = detectStack({
    'plugins/plugin/CMakeLists.txt': 'project(Plugin)\nfind_package(fmt REQUIRED)\nfind_package(Qt6 COMPONENTS Core)\n',
    'CMakeLists.txt': 'project(Workspace)\nfind_package(fmt REQUIRED)\n',
  })
  assert.equal(info.projectName, 'Workspace', '项目名只取根清单，不随遍历顺序漂移')
  assert.equal(info.dependencyCounts.cmake, 3, '根与子项目 find_package 次数累加')
  assert.equal(info.technologies.filter(t => t.name === 'fmt').length, 1, '同名技术跨清单去重')
  assert.equal(info.technologies.find(t => t.name === 'Qt')?.source, 'plugins/plugin/CMakeLists.txt')
})
