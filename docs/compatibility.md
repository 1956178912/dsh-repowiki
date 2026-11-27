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
| Elixir | `defmodule`（嵌套记录完整 `Outer.Inner`）/ `def` / `defp` / `defmacro(p)` / `defguard(p)` / `defdelegate`；私有形式标记非导出 | `alias` / `import` / `require` / `use` 经 `defmodule` 模块名映射到声明文件（含 `alias A.{B, C}` 与 `as:`）；外部模块不建边；根与 `apps/*/mix.exs` 的 `app: :name` / 依赖元组计入 mix 项目名（根清单）、依赖计数与技术栈（嵌套清单合并，来源可追溯）；`.exs`（测试/脚本/config）作为源码索引，`mix.exs` 仅作清单 |
| Lua | `local M = {}` 模块表、`function` / `local function`、`M.foo` / `M:foo`（归一为 method + parent）、`M.foo = function` 赋值；`local` 形式非导出，函数体内局部变量不登记 | `require "a.b"` / `require([[a.b]])` 不支持（仅引号形式）→ 点分名换算路径，经每个 `lua/` 根与项目根匹配 `a/b.lua` / `a/b/init.lua`；外部模块不建边 |
| Zig | `const Foo = struct/enum/union/opaque`（含 `pub`/`extern`/`packed`/`union(enum)`）、顶层 `fn` / `extern fn` / `export fn`、具名 `test "…"` 块、顶层常量与变量、`pub const x = @import("x.zig")` 再导出；容器成员带 `parent`，`pub` 决定导出；私有 `@import`/`@cImport`/`@This` 别名不登记 | `@import("x.zig")` 相对引用文件所在目录归一解析并限制在项目内；`std`/`builtin`/`root` 与构建注入的模块名不建边；`@cImport`/`@cInclude` 不提取；`build.zig.zon` 提供项目名/版本/依赖计数，嵌套 monorepo 清单（上限 20）只累加依赖计数、项目名只取根 |
| Gleam | `type` / `opaque type` / `external type` 容器、`type Name = …` 别名（kind type）、`fn` / `external fn`（跨行签名与单行块体）、顶层 `const`；`pub` 决定导出，函数体内 `let`/匿名函数不登记 | `import package/module`（含 `as` 别名与 `.{type Foo, Foo as F}` 未限定导入，跨行列表拼接到闭合 `}`）经每个 `src/`/`test/` 源根与项目根解析 `<module>.gleam`；`gleam/io` 等外部包不建边；`gleam.toml` 提供项目名/版本/依赖计数，根与嵌套 monorepo 清单聚合依赖（嵌套上限 20，项目名只取根） |
| Shell | `function foo` / `function foo()` / `foo() {`（含 `{` 写在下一行）与单行函数体；`export`/`readonly`/`declare`/`typeset` 带赋值的显式变量；普通赋值与 `local` 不登记 | `source path` / `. path` 先按脚本目录、再按项目根解析，尝试原路径与 `.sh`/`.bash`；变量/命令替换/通配符参数不建边；`#` 注释、引号（含跨行）与 heredoc 内容在配平前屏蔽 |
| R | `name <- function(...)` / `name = function(...)`（含 `<<-`，跨行签名、分行 `{`、单行表达式体）、`setClass`/`setRefClass`/`R6Class` 类及类内方法（method + parent）、`setGeneric` 泛型与 `setMethod` 方法（签名类为 parent）；`.` 前缀非导出；普通赋值与函数体内嵌套函数不登记 | `source("path")` / `sys.source("path")` 先按文件目录、再按项目根解析，尝试 `.R`/`.r`；`library()` 与动态参数不建边；`DESCRIPTION` 提供包名/版本/依赖（Depends/Imports/Suggests/LinkingTo）；根 `NAMESPACE` 的 `export`/`exportClasses`/`exportMethods`/`S3method` 决定 `exported`（`exportPattern` 回退约定） |
| Julia | `module`/`baremodule`、`struct`/`mutable struct`（含 `@kwdef`/模块限定宏前缀）、`abstract type`/`primitive type`、`@enum`（类型 + 非导出枚举值）、`function name(...)`（`Type.method` → method + parent）、短函数 `name(args) = expr`、`macro`、顶层 `const`；函数/结构体/宏体内部不登记；含 `module` 的文件按 `export` 标记可见性 | `include("path")` 相对引用文件解析（缺省补 `.jl`）；动态参数（`$` 插值/`joinpath`）不建边；`Project.toml` 提供包名/版本与 `[deps]`/`[extras]` 依赖计数 |
| Nim | `proc`/`func`/`method`/`iterator`/`template`/`macro`/`converter`、`type Name = …` 容器、顶层 `const`/`let`/`var`；`*` 后缀标记导出；缩进体内部与嵌套例程不登记；只识别缩进 0 的声明 | `import`/`from … import`/`include`/`export` 经引用文件目录、每个 `src/` 根与项目根解析 `<module>.nim`/`.nims`；`std/` 与外部包不建边；`*.nimble` 提供项目名（文件名）/版本/`requires` 依赖 |
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
setuptools/PDM `package-dir`、`packages.find where`、poetry `from` 与
Hatch 的 `packages`（取其父目录）也会并入导入根；带点的模块路径未命中任何
索引文件时视为外部包，不建边。Swift 的 target 解析读取 `Package.swift`
的 `name:`/`path:` 字段，不解析 `sources:` 白名单、`exclude:` 列表与
条件编译表达式；代表文件取目录下字典序最小的 `.swift`。Ruby 裸 require
只按 `lib/` 与项目根推断 `$LOAD_PATH`，不读取 `.ruby-version`、Gemfile 的
`require_paths` 或运行时 `$LOAD_PATH` 修改。Dart 为轻量行级解析：不解析
跨行声明头、泛型约束与条件导入；`part of` 不建边（`part` 指令已建），
`package:` 只解析仓库内 pubspec 声明的包（不读 `.dart_tool/package_config.json`），`dart:` 与外部包不建边；getter/setter 归为方法，`_` 前缀按
Dart 约定标记私有。Lua 为轻量行级解析：块范围按 `function/if/for/while/do/repeat … end/until` 配平，短字符串内的 `--` 与嵌套长括号 `--[==[` 不识别；`require` 只识别引号形式，`[[...]]` 长字符串、动态模块名与外部模块不建边。Elixir 为轻量行级解析：块范围按 `do`/`fn`/`end`
配平，heredoc/字符串中的关键字可能影响 `endLine`（不影响符号名）；
模块名以 `defmodule` 声明为准（嵌套记录完整名），`alias __MODULE__.X`、
`unquote(...)` 等动态模块名不解析；`defimpl`/`defprotocol` 体不产出
结构符号（内部 def 仍会登记）；外部模块不建边。C/C++ 为轻量行级解析：不展开
宏与条件编译，不解析多行模板参数、函数指针声明与运算符重载；类内方法
归属依赖类型块的括号配平，`#define` 生成的声明不会产出符号；`#include`
的尖括号形式只按仓库内 `include`/`src`/`inc` 根推断 `-I`，仓库外或
生成的头文件搜索路径不解析。Zig 为轻量行级解析：块范围按花括号配平，
`//`/`///`/`//!` 注释与 `\\` 多行字符串行在匹配前屏蔽（Zig 无块注释）；
`comptime` 块与函数体内的声明不登记，匿名 `test {` 不产符号，
`@import` 绑定（`const std = @import("std")`）视为模块别名而非常量，
只有 `pub const x = @import(...)` 作为再导出登记为变量符号；
`@import` 参数必须是字符串字面量，构建期生成的模块名与外部包不建边；
`build.zig.zon` 只统计 `dependencies` 的直接子键，不解析嵌套依赖图；zon
的依赖键是用户自定义别名，因此只计数、不推断技术名；嵌套清单聚合以
20 个为限，项目名/版本只取根清单。Gleam
为轻量行级解析：字符串内容（含跨行字符串）在配平前屏蔽，`//`/`////`
注释不产符号；函数体内 `let`、匿名函数与 `case` 分支不登记；类型别名与
`external` 声明按单行处理（跨行别名只给首行范围）；跨行未限定导入拼接
上限 50 行，超出后只保留已拼接部分；`gleam.toml` 只读根级
`name`/`version` 与 `[dependencies]`/`[dev-dependencies]` 的键，不解析
版本约束；嵌套清单聚合以 20 个为限。Shell 为轻量行级解析：heredoc 只识别
`<<`/`<<-` 与简单分隔符（含引号），`eval`/动态拼接的 `source` 与函数体内
单边 `}` 不解析；`bin/` 属构建产物目录默认排除，脚本放在 `scripts/` 等
目录才会进入索引；`${…}` 参数扩展不参与块配平。R 为轻量行级解析：
R6/setClass 类内 `name = function(...)` 登记为方法（parent 为类名），
类调用体内其他赋值不登记；`setGeneric`/`setMethod` 只识别字符串形式的
名称与签名（`signature()`/`c()` 取第一个字符串），动态构造的泛型/方法
不登记；函数签名定位上限 50 行，无块体的
表达式体按 `)` 所在行结束；`assign()`/`do.call()` 等动态定义不登记；
普通赋值不登记（只登记函数与类）；`DESCRIPTION` 只读根清单，不聚嵌套包；
`NAMESPACE` 只解析单行导出调用，`exportPattern` 等动态导出回退 `.` 前缀
约定（不猜测展开结果）。Julia 为轻量行级解析：块配平按行首关键字加行内
`do`/`begin`/`let`/`try`/`quote`，`x = if` 等行内控制块不计数（只影响
`endLine`）；`a[end]`/`x.end` 不计入块结束，推导式 `for` 不计块；短函数
与 `abstract`/`primitive` 类型按单行处理；`export` 名称全局应用到文件
（多 module 文件不区分作用域）；`Project.toml` 只读根清单。Nim 为轻量
行级解析：只识别缩进 0 的声明，`type` 块（单独 `type` + 缩进成员）的
成员不登记；`when isMainModule` 等缩进块内的定义不登记；`requires` 只
识别单行；缩进按 Tab=4 列归一；`*` 是唯一导出证据。

## 升级检查清单

1. `npm ci && npm test`
2. `npm run lint && npm run typecheck`
3. `npm run verify:host`（本机有 app.asar 时）
4. 会话内最小冒烟：`repowiki-index` → `repowiki-cards` → `repowiki-status`
5. GUI 冒烟：面板分组/分页/排序/Wiki 清单/目录锚点/深色模式
