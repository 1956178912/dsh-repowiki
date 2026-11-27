# 兼容性矩阵

## 运行环境

| 项 | 基线 | 说明 |
|---|---|---|
| DSH | `>=0.2.2-rc.5`（`engines.dsh`） | 仅作下界；rc 阶段每次升级必须跑 `npm test` + `npm run verify:host` + 会话冒烟 |
| Node | 22 / 24 | CI 阻塞矩阵；测试与脚本使用 node:test |
| OS | Linux / macOS | CI 阻塞 |
| OS | Windows | CI 兼容性 canary（非阻塞）；路径断言仍在补齐 |
| React | 18.3.1 | 与宿主 web-frontend 内嵌版本对齐（`test/react-parity.test.js`） |
| 浏览器 | 宿主 web GUI | 面板经 `ctx.remote.workspaceFiles` 读取资产 |

## 资产格式

| 文件 | 版本 | 读取兼容 |
|---|---|---|
| `index.json` | schemaVersion 6 | 可读 v2–v5（内存补模块树/语言分布/Git，下次 index 写 v6）；v6 增加 `files[].lines`（行数快照）与 `edges[].line`（import/use/require 行号），`stats.skipped` / `stats.skippedTooLarge` 记录不可读/超大文件；旧索引无行数时行号越界检查降级为 `citation/range-unchecked`；未知版本拒绝 |
| 卡片 frontmatter | 1 | 版本不符按坏卡跳过；`manuallyEdited` 卡片不被自动刷新 |
| Wiki 页面 frontmatter | 1 | `schemaVersion`/`title`/`slug`/`locale`/`generatedAt`，可选 `inputDigest`；缺字段按旧页处理 |
| `knowledge/<locale>/_index.json` | 2（v1 可读） | 模块→卡片 + `lastRun` 最近运行快照；缺失不影响读取 |
| `wiki/<locale>/_index.json` | 3（v1/v2 可读） | v1 页面级 `sources`；v2 增加章节级 `sections`；v3 增加 `inputDigest`/`memoryDigest`/`graphDigest`（生成增量短路与陈旧检测；graphDigest 覆盖索引文件集合与依赖边，缺失时只做卡片/记忆检查）、`citationDigests`/`citationMisses`（引用内容指纹与未覆盖原因）、`failed`/`failedTotal`（上次生成失败页）；旧清单按可得字段降级 |
| 记忆 frontmatter | 1 | `status` 为 `pending`/`accepted`/`rejected`；可选 `reviewedAt` |
| `repowiki-plan.json` | 无版本字段 | `exclude`/`includeOnly`/`maxCardsPerRun`/`cardComplexityThreshold`/`concurrency`/`attempts`；损坏时回退默认值并告警 |

## 语言覆盖

| 语言 | 符号 | 本地依赖边 |
|---|---|---|
| JavaScript / TypeScript | 函数/类/方法/interface/type/变量 | 相对 import / re-export / require / 动态 import；`tsconfig`/`jsconfig` 的 `paths` + `baseUrl` 别名；工作区包名经 `exports`/`main` → 源码入口 |
| Vue SFC | 只解析 `<script>` / `<script setup>` 块，符号规则同 JS/TS，行号与源文件一致 | 脚本块内的 import 按 JS/TS 规则解析（相对路径、tsconfig 别名、工作区包）；`<template>`/`<style>` 不产符号、不建边 |
| Svelte | 只解析 `<script context="module">` 与实例 `<script>` 块，符号规则同 JS/TS | 同上；标记与样式不产符号、不建边 |
| Python | class / def / async def（含方法归属） | 相对 from-import；绝对 `import a.b` / `from a.b import c` 在项目根、pyproject 自定义根与 `src`/`lib` 布局根下解析，`from 包 import 名` 优先子模块 |
| Go | func / 接收者方法 / struct / interface / 别名 / 导出常量变量 | 根与嵌套 `go.mod`（多模块仓库，单次上限 20）的 module 前缀 → 包目录代表文件；跨 `internal` 边界的导入以 `warnings` 报告（根 `internal/` 不受限） |
| Rust | fn / impl 与 trait 方法 / struct / enum / trait / type / const | `mod`、`crate::`、`self::`、`super::`（crate 根 + 模块约定） |
| Java | class / interface / enum / record / 构造器 / 第一层方法 | 包后缀匹配（含通配符与 static 成员导入） |
| C# | class / interface / struct / record / enum / 第一层方法 / 构造器 | `using`（global/static/别名）经点分路径索引 |
| Kotlin | class / data class / enum class / object / interface / fun / 构造器 | `import`（含 `.*` 与 `as`）经点分路径索引 |
| PHP | class / interface / trait / enum / 方法 / 顶层函数 | `use`（分组/function/const/别名）大小写不敏感；根与嵌套 `composer.json` 的 `autoload`/`autoload-dev` `psr-4` 前缀映射优先（字符串/数组目录、空前缀兜底、最长前缀优先），未命中回退命名空间后缀；字面量 `require`/`include` |
| Ruby | class / module / def（含 `self.` 与 `?!=` 后缀/表达式体）/ attr_* / 常量 | `require_relative` 与显式 `./` require 相对文件；裸 `require` 按任意层级 `lib/` 加载路径及项目根解析；gem require 不建边 |
| Swift | class / struct / actor / enum / protocol / extension / func / init / typealias | `import` 按 `Package.swift` 的 target `path:`（支持多行声明与注释）解析到目标目录代表文件；未声明 path 时回退 `Sources/<Target>`（兼容旧版 `Source/<Target>`）；外部模块不建边 |
| Scala | class / case class / trait / object / enum / def / given / extension 成员归属 | `import`（分组、`=>` 重命名、`._`/`.*` 通配、`as` 别名）经点分路径后缀匹配；多行参数与跨行声明头（`{`/`=`/`:`）范围正确 |
| Dart | class / mixin / enum / extension / extension type / typedef / 构造器 / 方法 / getter / 顶层函数与变量；`_` 前缀标记私有 | 相对 `import`/`export`/`part`（含同目录裸 `x.dart`）与 `show` 符号；`package:<本仓库 pubspec 名>/x.dart` 解析到对应包的 `lib/x.dart`（含嵌套包），外部 `package:`/`dart:` 不建边；`pubspec.yaml` 的 `dependencies`/`dev_dependencies` 计入 pub 技术栈与项目名 |
| Elixir | `defmodule`（嵌套记录完整 `Outer.Inner`）/ `def` / `defp` / `defmacro(p)` / `defguard(p)` / `defdelegate`；私有形式标记非导出 | `alias` / `import` / `require` / `use` 经 `defmodule` 模块名映射到声明文件（含 `alias A.{B, C}` 与 `as:`）；外部模块不建边；根与 `apps/*/mix.exs` 的 `app: :name` / 依赖元组计入 mix 项目名（根清单）、依赖计数与技术栈（嵌套清单合并，来源可追溯） |
| C | struct / union / enum / typedef（含匿名 typedef）/ 函数 / 原型 | `#include`（引号先查文件目录，两种形式都经 `include`/`src`/`inc` 根与项目根）；`static` 函数标记非导出 |
| C++ | 以上 + class / 构造 / 析构 / 类内方法 / 类外 `Foo::bar` 定义 | 同上；尖括号形式只在 include 根命中时建边，系统头不建边 |

已知限制：轻量解析不覆盖多行签名、单行类体成员、宏展开、完整泛型与条件编译；
C#/Kotlin/Scala 的命名空间解析优先按“点分路径后缀/前缀”匹配（不解析完整
项目文件），无法解析的外部 import 不创建依赖边（不猜测）。Ruby 的块范围
按 `end` 关键字配平，已忽略 heredoc 内容与 `=begin/=end` 块注释；剩余限制
是一行多个 heredoc 只识别首个、`%q{}` 等跨行字面量不屏蔽（只影响
`endLine` 精度，不影响符号名）。Scala 3 的缩进语法（无花括号的
`enum`/`object` 体）已按缩进推导类型与 `def` 的块范围；`extension` 方法
归属被扩展类型，`given` 实例登记为 variable 且内部方法归属该实例（匿名
given 以类型名登记）。宏展开与条件编译仍不解析；Scala 声明头可跨行
（参数逐行书写、`extends` 续行），缩进体从签名结束行开始计算。JS/TS 别名按文件
所在目录的就近配置解析（根配置兜底），不跟随 `extends` 链；工作区包只
按 `exports`/`main` 等入口与源码目录解析，不读取 `node_modules`，入口
指向未索引构建产物时回退 `src/index`/`index`。Python 绝对导入只识别
项目根与 `src`/`lib` 布局根，不读取 `site-packages`；`pyproject.toml` 的
setuptools/PDM `package-dir`、`packages.find where` 与 poetry `from` 也会
并入导入根（Hatch 的 `packages` 列表未解析）；带点的模块路径未命中任何
索引文件时视为外部包，不建边。Swift 的 target 解析读取 `Package.swift`
的 `name:`/`path:` 字段，不解析 `sources:` 白名单、`exclude:` 列表与
条件编译表达式；代表文件取目录下字典序最小的 `.swift`。Ruby 裸 require
只按 `lib/` 与项目根推断 `$LOAD_PATH`，不读取 `.ruby-version`、Gemfile 的
`require_paths` 或运行时 `$LOAD_PATH` 修改。Dart 为轻量行级解析：不解析
跨行声明头、泛型约束与条件导入；`part of` 不建边（`part` 指令已建），
`package:` 只解析仓库内 pubspec 声明的包（不读 `.dart_tool/package_config.json`），`dart:` 与外部包不建边；getter/setter 归为方法，`_` 前缀按
Dart 约定标记私有。C/C++ 为轻量行级解析：不展开
宏与条件编译，不解析多行模板参数、函数指针声明与运算符重载；类内方法
归属依赖类型块的括号配平，`#define` 生成的声明不会产出符号；`#include`
的尖括号形式只按仓库内 `include`/`src`/`inc` 根推断 `-I`，仓库外或
生成的头文件搜索路径不解析。

## 升级检查清单

1. `npm ci && npm test`
2. `npm run lint && npm run typecheck`
3. `npm run verify:host`（本机有 app.asar 时）
4. 会话内最小冒烟：`repowiki-index` → `repowiki-cards` → `repowiki-status`
5. GUI 冒烟：面板分组/分页/排序/Wiki 清单/目录锚点/深色模式
