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
| `index.json` | schemaVersion 6 | 可读 v2–v5（内存补模块树/语言分布/Git，下次 index 写 v6）；v6 增加 `files[].lines`（行数快照）与 `edges[].line`（import/use/require 行号）；`edges[].kind` 保留引用形态（`import`/`export-from`/`require`/`mod`/`reexport`，旧索引统一为 `import`，重建后升级，读取方不受影响），`edges[].aliases` 记录再导出原名→导出名（可选，旧索引缺省），`stats.skipped` / `stats.skippedTooLarge` 记录不可读/超大文件；旧索引无行数时行号越界检查降级为 `citation/range-unchecked`；未知版本拒绝 |
| 卡片 frontmatter | 1 | 版本不符按坏卡跳过；`manuallyEdited` 卡片不被自动刷新 |
| Wiki 页面 frontmatter | 1 | `schemaVersion`/`title`/`slug`/`locale`/`generatedAt`，可选 `inputDigest`；缺字段按旧页处理 |
| `knowledge/<locale>/_index.json` | 2（v1 可读） | 模块→卡片 + `lastRun` 最近运行快照；缺失不影响读取 |
| `wiki/<locale>/_index.json` | 3（v1/v2 可读） | v1 页面级 `sources`；v2 增加章节级 `sections`；v3 增加 `inputDigest`/`memoryDigest`/`graphDigest`（生成增量短路与陈旧检测；graphDigest 覆盖索引文件集合与依赖边，缺失时只做卡片/记忆检查）、`citationDigests`/`citationMisses`（引用内容指纹与未覆盖原因）、`failed`/`failedTotal`（上次生成失败页）；旧清单按可得字段降级；generate 固定写入 `architecture.md`（确定性架构总览，无模型调用），其 slug 为保留值、引用与指纹照常登记 |
| 记忆 frontmatter | 1 | `status` 为 `pending`/`accepted`/`rejected`；可选 `reviewedAt` |
| `repowiki-plan.json` | 无版本字段 | `exclude`/`includeOnly`/`maxCardsPerRun`/`cardComplexityThreshold`/`concurrency`/`attempts`；损坏时回退默认值并告警 |
| `arch-baseline.json` | 1 | 由 `verify:arch --update` 生成：`cycles`/`layerViolations`/`unresolvedImports` 为身份签名，`ceilings`/`architectureScore` 为数值上限；字段缺失或畸形时对应检查关闭并告警，版本不符拒绝（重跑 `--update`）；无时间戳、列表排序去重，可逐字节复现 |

## 语言覆盖

| 语言 | 符号 | 本地依赖边 |
|---|---|---|
| JavaScript / TypeScript | 函数/类/方法/interface/type/变量 | 相对 import / re-export / require / 动态 import；`tsconfig`/`jsconfig` 的 `paths` + `baseUrl` 别名；工作区包名经 `exports`/`main` → 源码入口；`import { x as y }` 与 `export { x as y } from` 均记录别名，引用归到目标 x、使用点按 y 扫描；具名 `export default` 标记 default，`export { default [as y] } from` 归到真实具名符号（匿名默认导出不登记）；默认导入经具名 default 再导出链解析并保留本地绑定别名，`export *` 不转发 default；`export * as ns from` 只导出命名空间对象，不展开目标符号（解析器 v20） |
| Vue SFC | 只解析 `<script>` / `<script setup>` 块，符号规则同 JS/TS，行号与源文件一致 | 脚本块内的 import 按 JS/TS 规则解析（相对路径、tsconfig 别名、工作区包）；`<template>`/`<style>` 不产符号、不建边 |
| Svelte | 只解析 `<script context="module">` 与实例 `<script>` 块，符号规则同 JS/TS | 同上；标记与样式不产符号、不建边 |
| Python | class / def / async def（含方法归属） | 相对 from-import；绝对 `import a.b` / `from a.b import c` 在项目根、pyproject 自定义根与 `src`/`lib` 布局根下解析，`from 包 import 名` 优先子模块；`from x import *` 记为 `*` 通配符（解析器 v10），`__init__.py` 的具名/星号导入作为包 barrel 参与引用/使用点/影响面，`as` 别名记录原名→本地名；模块级 `__all__`（`=`/`+=`、跨行列表/元组、`append`/`extend`）解析后与下划线前缀共同决定 `from x import *` 的可见名（解析器 v15），星号再导出链与使用点只归因可见符号，`__all__` 声明行不计为使用点 |
| Go | func / 接收者方法 / struct / interface / 别名 / 导出常量变量 | 根与嵌套 `go.mod`（多模块仓库，单次上限 20）的 module 前缀 → 包目录代表文件；`import` 支持别名（记录包名→本地名）、`.` 点导入（按 `*` 潜在引用，仅大写导出的包级标识符）与 `_` 空白导入（仅依赖边、无符号引用，解析器 v18）；跨 `internal` 边界的导入以 `warnings` 报告（根 `internal/` 不受限） |
| Rust | fn / impl 与 trait 方法 / struct / enum / trait / type / const | `mod`、`crate::`、`self::`、`super::`（crate 根 + 模块约定）；`use other_crate::…` 经嵌套 `Cargo.toml` 的包名（`-`→`_`）与 `path` 依赖映射到 workspace crate 的 `src/` 子模块，回退 `lib.rs`/`main.rs` 入口；`pub use` 记为 `reexport`（含 `::*`，`as` 别名记录原名→导出名）；普通 `use … as` 同样记录原名→本地名（引用归原名、使用点按本地名），`use a::b::{self}` 等价于 `use a::b`（解析器 v21），`use crate::Foo` 在模块路径未命中时仅对入口公开符号/再导出名回退入口；`use a::*` 的潜在引用按目标公开模块级符号收窄（私有项与 impl 方法不归因，barrel 目标保留通配）；外部 crate 与笔误路径不建边 |
| Java | class / interface / enum / record / 构造器 / 第一层方法 | 包后缀匹配（含通配符与 static 成员导入）；`import static a.b.C.member` 依赖边指向类文件、符号归成员名（解析器 v22），`import static a.b.C.*` 按 `*` 潜在引用，普通通配导入保持文件级 |
| C# | class / interface / struct / record / enum / 第一层方法 / 构造器 | `using`（global/static/别名）经点分路径索引；`using Alias = A.B.C;` 记录原名与本地别名（解析器 v16），`using static X;`/`global using static X;` 记 `*` 潜在引用（依赖边仍指向类文件，解析器 v25），`global::` 限定符解析前剥离，泛型/元组别名不登记 |
| Kotlin | class / data class / enum class / object / interface / fun / 构造器 | `import`（含 `.*` 与 `as`）经点分路径索引；`import a.b.C as D` 的引用归到 C，D 作为词法使用点扫描名（解析器 v16）；`import a.b.C.*` 在符号表确认前缀为 class/object/interface/type 时指向该类型文件并记 `*` 成员潜在引用，包通配保持代表文件级空符号（解析器 v25） |
| PHP | class / interface / trait / enum / 方法 / 顶层函数 | `use`（分组/function/const/别名）大小写不敏感，分组内混写的 `function f`/`const C` 修饰词剥离后登记（解析器 v23）；`as` 别名记录原名→本地名（解析器 v17），引用归原名、词法使用点按本地名；根与嵌套 `composer.json` 的 `autoload`/`autoload-dev` `psr-4` 前缀映射优先（字符串/数组目录、空前缀兜底、最长前缀优先），未命中回退命名空间后缀；字面量 `require`/`include` |
| Ruby | class / module / def（含 `self.` 与 `?!=` 后缀/表达式体）/ attr_* / 常量 | `require_relative` 与显式 `./` require 相对文件；裸 `require` 按任意层级 `lib/` 加载路径及项目根解析；gem require 不建边 |
| Swift | class / struct / actor / enum / protocol / extension / func / init / typealias | `import` 按 `Package.swift` 的 target `path:`（支持多行声明与注释）解析到目标目录代表文件；未声明 path 时回退 `Sources/<Target>`（兼容旧版 `Source/<Target>`）；外部模块不建边 |
| Scala | class / case class / trait / object / enum / def / given / extension 成员归属 | `import`（分组、`=>`/`as` 重命名、`._`/`.*` 通配）经点分路径后缀匹配；重命名保留原名归因并记录本地名（解析器 v17），`=> _`/`as _` 隐藏不登记；多行参数与跨行声明头（`{`/`=`/`:`）范围正确 |
| Dart | class / mixin / enum / extension / extension type / typedef / 构造器 / 方法 / getter / 顶层函数与变量；`_` 前缀标记私有 | 相对 `import`/`export`/`part`（含同目录裸 `x.dart`）；无组合子 import/export 记 `*`（import 侧按库的公开顶层声明展开为潜在引用，export 侧作为星号再导出），`show A, B` 精确，`hide X` 记排除名（引用/使用点在同一可导入集合上过滤），`show … hide …` 组合时 hide 生效，`as` 前缀不改变可见性；`part 'x.dart'` 记为独立 `part` 边且不声称符号引用，主库文件按星号 barrel 把 part 声明归到导入方（解析器 v26），`part of` 不建反向边；使用点扫描把主库与 part 视为同库文件（单独上限 10 个、不占导入方名额）；`package:<本仓库 pubspec 名>/x.dart` 解析到对应包的 `lib/x.dart`（含嵌套包，读取上限 30），外部 `package:`/`dart:` 不建边；`pubspec.yaml` 的 `dependencies`/`dev_dependencies` 计入 pub 技术栈与项目名 |
| Elixir | `defmodule`（嵌套记录完整 `Outer.Inner`）/ `def` / `defp` / `defmacro(p)` / `defguard(p)` / `defdelegate`；私有形式标记非导出 | `alias` / `import` / `require` / `use` 经 `defmodule` 模块名映射到声明文件（含 `alias A.{B, C}` 与 `as:`）；外部模块不建边；根与 `apps/*/mix.exs` 的 `app: :name` / 依赖元组计入 mix 项目名（根清单）、依赖计数与技术栈（嵌套清单合并，来源可追溯）；`.exs`（测试/脚本/config）作为源码索引，`mix.exs` 仅作清单 |
| Lua | `local M = {}` 模块表、`function` / `local function`、`M.foo` / `M:foo`（归一为 method + parent）、`M.foo = function` 赋值；`local` 形式非导出，函数体内局部变量不登记 | `require "a.b"` / `require([[a.b]])` 不支持（仅引号形式）→ 点分名换算路径，经每个 `lua/` 根与项目根匹配 `a/b.lua` / `a/b/init.lua`；外部模块不建边 |
| Zig | `const Foo = struct/enum/union/opaque`（含 `pub`/`extern`/`packed`/`union(enum)`）、顶层 `fn` / `extern fn` / `export fn`、具名 `test "…"` 块、顶层常量与变量、`pub const x = @import("x.zig")` 再导出；容器成员带 `parent`，`pub` 决定导出；私有 `@import`/`@cImport`/`@This` 别名不登记 | `@import("x.zig")` 相对引用文件所在目录归一解析并限制在项目内；`std`/`builtin`/`root` 与构建注入的模块名不建边；`@cImport`/`@cInclude` 不提取；`build.zig.zon` 提供项目名/版本/依赖计数，嵌套 monorepo 清单（上限 20）只累加依赖计数、项目名只取根 |
| Gleam | `type` / `opaque type` / `external type` 容器、`type Name = …` 别名（kind type）、`fn` / `external fn`（跨行签名与单行块体）、顶层 `const`；`pub` 决定导出，函数体内 `let`/匿名函数不登记 | `import package/module`（含 `as` 别名与 `.{type Foo, Foo as F}` 未限定导入，跨行列表拼接到闭合 `}`）经每个 `src/`/`test/` 源根与项目根解析 `<module>.gleam`；`gleam/io` 等外部包不建边；`gleam.toml` 提供项目名/版本/依赖计数，根与嵌套 monorepo 清单聚合依赖（嵌套上限 20，项目名只取根） |
| Shell | `function foo` / `function foo()` / `foo() {`（含 `{` 写在下一行）与单行函数体；`export`/`readonly`/`declare`/`typeset` 带赋值的显式变量；普通赋值与 `local` 不登记 | `source path` / `. path` 先按脚本目录、再按项目根解析，尝试原路径与 `.sh`/`.bash`；变量/命令替换/通配符参数不建边；`#` 注释、引号（含跨行）与 heredoc 内容在配平前屏蔽 |
| R | `name <- function(...)` / `name = function(...)`（含 `<<-`，跨行签名、分行 `{`、单行表达式体）、`setClass`/`setRefClass`/`R6Class` 类及类内方法（method + parent）、`setGeneric` 泛型与 `setMethod` 方法（签名类为 parent）；`.` 前缀非导出；普通赋值与函数体内嵌套函数不登记 | `source("path")` / `sys.source("path")` 先按文件目录、再按项目根解析，尝试 `.R`/`.r`；`library()` 与动态参数不建边；`DESCRIPTION` 提供包名/版本/依赖（Depends/Imports/Suggests/LinkingTo）；根 `NAMESPACE` 的 `export`/`exportClasses`/`exportMethods`/`S3method` 决定 `exported`（`exportPattern` 回退约定） |
| Julia | `module`/`baremodule`、`struct`/`mutable struct`（含 `@kwdef`/模块限定宏前缀）、`abstract type`/`primitive type`、`@enum`（类型 + 非导出枚举值）、`function name(...)`（`Type.method` → method + parent）、短函数 `name(args) = expr`、`macro`、顶层 `const`；函数/结构体/宏体内部不登记；含 `module` 的文件按 `export` 标记可见性 | `include("path")` 相对引用文件解析（缺省补 `.jl`）；动态参数（`$` 插值/`joinpath`）不建边；`Project.toml` 提供包名/版本与 `[deps]`/`[extras]` 依赖计数 |
| OCaml | 顶层 `let`/`let rec`（含 `let%ppx`、属性；运算符定义除外）与 `and` 续接的互递归函数、`type` 容器/别名（参数化名称取末尾标识符）与 `and` 续接类型、`module`/`module type`、`class`/`class type`、`exception`、`val`/`external`；缩进体内部与嵌套定义不登记；`(* … *)` 可嵌套注释、字符串与 `{|…|}`/`{id|…|id}` 原始字符串屏蔽；`struct`/`sig`/`object` 范围按配对 `end` 结束 | `open`/`include`/`open!`/`module M = Foo` 经"文件名→模块名"映射解析（首字母大写，`.ml` 优先于 `.mli`，`Foo.Bar` 归到 `foo.ml`）；同名模块选与引用文件共享目录最深者（同库优先）；外部库不建边；`dune-project` 提供项目名/版本（嵌套上限 20），`*.opam` 提供版本与 `depends` 依赖 |
| HCL | `resource`/`data`（`type.name`）、`module`/`provider`/`terraform` 块（class）、`variable`/`output`/`locals`（variable）；嵌套块不登记；`#`/`//` 注释、`/* */` 与字符串屏蔽（标签从字符串原文读取，范围用掩码配平） | `source = "./modules/x"` 按引用文件目录解析到模块目录的 `main.tf`（否则字典序首个 `.tf`）；registry/git 与 `${}` 插值源不建边；`.terraform.lock.hcl` 的 `provider "…"` 提供依赖计数与技术映射 |
| Groovy | 顶层 `class`/`interface`/`trait`/`enum` 容器（容忍注解与 `public`/`private`/`protected`/`static`/`final`/`abstract` 修饰符）、类内第一层方法（含构造器）与 Gradle/Jenkinsfile 风格顶层 `def` 脚本方法；`private`/`protected` 非导出；控制流/调用关键字不登记；`//`、`/* */` 注释与单/双/三引号字符串（含插值文本）屏蔽 | `import a.b.C` 经点分路径后缀匹配，与 Java 文件共享同一索引（Groovy→Java 与 Java→Groovy 均可解析）；`import static a.b.C.member` 去掉末段成员后落到定义文件、符号记成员名，`import static a.b.C.*` 记 `*` 潜在引用；`import a.b.*` 包级通配保持空符号；`as` 别名记录原名→本地名（解析器 v24） |
| PowerShell | `function`/`filter`/`workflow`/`configuration` 定义（连字符 `Verb-Noun` 名称，`global:`/`script:`/`local:`/`private:` 作用域前缀，`private:` 非导出）与顶层 `class`/`enum`；类内第一层成员为带 `parent` 的 method（含构造器），`hidden` 成员非导出，属性声明不登记；控制流关键字不误登记；`#` 行注释、`<# … #>` 块注释、单/双引号字符串与 here-string 屏蔽 | `using module ./X.psm1`、`Import-Module ./X`（含 `-Name`）与 dot-source（`. ./X.ps1`）按引用脚本目录解析，尝试原路径、`.ps1`/`.psm1`/`.psd1` 后缀与 `Foo/Foo.psm1` 模块目录形式；反斜杠归一；纯模块名与越出项目的路径不建边 |
| Fortran | `module`/`program`/`subroutine`/`function`（含 `integer function`/`real(kind=8) function` 等类型前缀与 `pure`/`recursive`/`elemental`/`module` 修饰）、派生类型 `type [::] name`/`type, extends(…) :: name`、具名 `interface`；`end`/`end <unit>` 配平范围，模块内过程带 `parent`，`end do`/`end if`/`end select`/`end where` 不关闭程序单元；`!` 注释与单/双引号字符串（双写转义）屏蔽 | `use name`、`use :: name`、`use name, only: …`、`use, non_intrinsic :: name` 经大小写不敏感的 `module` 符号映射解析（模块名与文件名无需一致，同名取字典序最小文件）；`use, intrinsic :: …` 与未索引的外部模块不建边 |
| Perl | `package Foo::Bar;`（语句形式，后续声明归属直到下一个 package）与 `package Foo { … }` 块形式登记为 class；`sub name` 为 function，包内为 method + `parent`；`_` 前缀按惯例非导出；`#` 注释（`$#array` 除外）、`=pod … =cut`、heredoc 与引号字符串屏蔽 | `use`/`require Foo::Bar` 把 `::` 换算路径，在每个 `lib/` 根与项目根下尝试 `.pm`/`.pl`；`use parent 'Foo'`/`use base qw(Foo)` 记录父模块；`require './x.pl'` 先项目根再脚本目录；pragma 与版本声明跳过，外部 CPAN 模块不建边 |
| Pascal | `unit`/`program`/`library` 与 `type X = class/interface/record/object`（范围按 `class`/`record`/`interface` ↔ `end` 配平，`class function`/`class of` 不计新块）；`procedure`/`function`/`constructor`/`destructor`（接口声明止于本行，实现体按 `begin`/`case`/`try`/`asm` ↔ `end` 配平）、`property`（variable）；`TFoo.Bar` 实现以类为 `parent`；`//`、`{ … }`、`(* … *)` 与引号字符串屏蔽 | `uses` 跨行列表经大小写不敏感单元名映射（按文件名主干，Delphi 要求单元名与文件名一致）解析；`Unit in 'path.pas'` 先项目根再脚本目录，补 `.pas`/`.pp`/`.lpr`；外部单元不建边 |
| Nix | 属性集与 `let` 内绑定：`name = value;`/`a.b.c = value;`（variable）、`{`/`rec {` 值（class，花括号配平）、`x:`/`{ … }:` lambda（function）；嵌套属性集成员带 `parent`；`#`、`/* */`、双引号与 `''…''` 缩进字符串（`'''`/`''${`/`''\` 转义）屏蔽 | `import`、`callPackage`、`builtins.readFile|readDir|path` 的相对路径按引用文件目录解析，尝试原路径、`.nix` 与目录 `default.nix`；`<nixpkgs>` 搜索路径与绝对路径不建边 |
| VB.NET | `Namespace`/`Class`/`Module`/`Structure`/`Interface`/`Enum`（类型范围按 `End <type>` 配平）、`Sub`/`Function`/`Property`/`Event`（接口与 `MustOverride` 声明止于本行，`Property` 块覆盖 `Get`/`Set`）；构造器为 `Sub New`；修饰符栈；`Private`/`Friend`/`Protected` 非导出；`'`、`REM` 与引号字符串屏蔽 | `Imports`（含 `Alias = …`）与 `Inherits`/`Implements` 经点分路径解析（精确 → 简单名后缀 → 命名空间后缀），根命名空间不在目录布局也能命中；外部程序集不建边 |
| Tcl | `proc name {args} {…}`（function；`::Foo::bar` 以 `Foo` 为 `parent`）、`namespace eval Foo {…}` 与 TclOO `oo::class create Foo {…}`（class）、类体内 `method`/`constructor`/`destructor`（method + `parent`）；块范围按整行花括号净值配平；行首 `#`、`; #` 尾注释与双引号字符串屏蔽 | `source` 相对路径或 `.tcl` 文件先项目根、再脚本目录，补 `.tcl`；`source [file join …]` 等动态形式不建边 |
| F# | `namespace`/`module`（class，嵌套模块带命名空间 `parent`）、`type`（显式 `class … end`/构造参数 → class，显式 `interface` → interface，record/union/缩写 → type）、`member`/`abstract member`/`override`（method + `parent`）、`let`（带参数 function，否则 variable）；`end` 或缩进块定范围；`//`、可嵌套 `(* *)`、引号/三引号字符串屏蔽 | `open Foo.Bar`/`open type Foo.Bar` 经命名空间/模块映射解析（精确 → 逐段前缀回退），并登记 `Parent.Module` 组合名；外部命名空间不建边 |
| Ada | `package`/`package body`（class，嵌套包与点分子单元带 `parent`）、`procedure`/`function`（声明按声明头收尾，body 按 `end [Name];` 收尾；表达式函数 `is (…)`、`is separate` 与 `renames` 不展开）、`type`/`subtype`/`task type`/`protected type`（type，`record … end record;` 覆盖整体）、包级对象声明（variable）；`private` 段内声明与含 `private` 段的嵌套单元为非导出；`--` 注释与双引号字符串（`""` 转义）屏蔽；`end if/loop/case/record/select/block` 不关闭单元，匿名 `declare … begin … end;` 单独记账；generic 形式参数（`type T is private;`、`with function …;`）不登记 | `with`/`limited with`/`private with` 单元名大小写不敏感，GNAT 连字符文件名（`Parent-Child.ads`）与任意源根下的目录形式（`src/parent/child.ads`）都映射到点分单元名；同一单元 spec 优先、仅有 body 时回退；`use` 不建边，generic 形式子程序与外部标准库/第三方 crate 不建边 |
| Clojure | `ns`（class）、`defn`/`defn-`/`defmacro`/`defmacro-`/`defmulti`/`defmethod`（function）、`def`/`defonce`（variable）、`defrecord`/`deftype`/`defprotocol`/`definterface`（class）；`^:private` 与 `defn-`/`defmacro-` 非导出；`;` 注释、字符串屏蔽、`(comment …)` 整体跳过；形式范围按圆/方/花括号配平 | `(:require …)`/`(:use …)` 的 `[ns.name …]` 命名空间点分换算路径，在每个 `src/`/`test/` 根与项目根下尝试同类扩展优先的 `.clj`/`.cljc`/`.cljs`；外部命名空间不建边；`deps.edn` `:deps` 与 `project.clj` `:dependencies` 提供依赖计数/版本与技术映射 |
| Solidity | `contract`/`library`/`interface`（含 `abstract contract`）容器；成员 `function`/`constructor`/`receive`/`fallback`/`modifier`/`event`/`error`/`struct`/`enum`/`type X is`（method/type/class，带 `parent`）；文件级函数与类型；`private`/`internal` 非导出；`//`、`/* */` 与字符串屏蔽；范围按花括号配平（`;` 声明单行） | 相对 `import`（`import "…"`、`import {A} from "…"`、`import * as X from "…"`）按引用文件目录解析并补 `.sol`；npm/`hardhat/…` 等外部路径不建边；`foundry.toml` 标记 Foundry 工具链 |
| Erlang | `-module`、`-record`、`-type`/`-opaque`、`-define` 宏、顶层函数（多子句、`when` 守卫、跨行签名）；`-export([f/1])` 决定可见性（默认私有，同名不同 arity 合并），`-module` 自身公开；缩进体与匿名函数不登记；`%` 注释、字符串、引号原子与 `$x` 字符字面量屏蔽 | `-include("…")` 先按引用文件目录，再经每个 `src/`/`include/` 根与项目根（原路径与补 `.hrl`）；`-include_lib("app/…")` 额外尝试剥离首段应用名的路径；外部头文件不建边；`rebar.config` 的 `{deps, …}` 提供依赖计数与 rebar 技术映射 |
| Haskell | `module` 声明（范围至文件尾）与导出列表可见性（未列出的顶层符号非导出，类方法跟随类）、`data`/`newtype`（含 `data family`）、`type`/`type family`、`class` 与类方法签名（含多行签名，`parent` 归属类）、`pattern` 同义词、顶层值签名（`name ::`，含多行签名）与定义（含中缀操作符定义）；签名与同名定义合并为一个符号；缩进 `where`/`let` 体、`instance` 方法与构造器不登记；`--` 注释、可嵌套 `{- … -}`（含 pragma）、字符串与字符字面量屏蔽 | `import [qualified] [safe] ["pkg"] Module` 按 GHC 模块路径换算（`Foo.Bar` → `Foo/Bar.hs`）在每个 `src`/`app`/`lib`/`test` 源根、cabal `hs-source-dirs` 声明目录与项目根下尝试 `.hs`/`.lhs`；外部包不建边；`*.cabal` 提供包名/版本与跨行 `build-depends` 依赖 |
| Nim | `proc`/`func`/`method`/`iterator`/`template`/`macro`/`converter`、`type Name = …` 容器、`type` 单独成段时的缩进成员（`Name* = object`/`enum`/`ref object`/`tuple`/别名，逐成员独立范围与 `*` 导出）、顶层 `const`/`let`/`var`；`*` 后缀标记导出；缩进体内部与嵌套例程不登记；只识别缩进 0 的声明 | `import`/`from … import`/`include`/`export` 经引用文件目录、每个 `src/` 根与项目根解析 `<module>.nim`/`.nims`；`std/` 与外部包不建边；`*.nimble` 提供项目名（文件名）/版本/`requires` 依赖 |
| C | struct / union / enum / typedef（含匿名 typedef）/ 函数 / 原型 | `#include`（引号先查文件目录，两种形式都经 `include`/`src`/`inc` 根与项目根）；`static` 函数标记非导出 |
| C++ | 以上 + class / 构造 / 析构 / 类内方法 / 类外 `Foo::bar` 定义 | 同上；尖括号形式只在 include 根命中时建边，系统头不建边 |
| Verilog | `module`（含 `macromodule`）与 `package`/`program`/`class`（class 容器）、`interface`（interface）、`function`/`task`（function；class/interface 内或 `C::f` 限定名为 method，带 `parent`；`extern`/`pure virtual` 原型只占声明头，`local`/`protected` 非导出）、`typedef`（enum/struct/union 体与简单别名，type）、容器内 `parameter`/`localparam`（variable；`parameter type` 为 type）与 `` `define `` 宏（variable）；`//`、`/* */`、双引号字符串与 `` `define `` 续行屏蔽；`end*` 关键字按类型配对，单行块可识别，未闭合块保守延伸到文件尾 | `` `include `` 引号形式先查引用方目录，再经任意层级 `include`/`inc`/`src`/`rtl`/`hdl` 根与项目根；尖括号形式跳过文件目录；外部头文件不建边 |
| SystemVerilog | 同 Verilog（同一提取器）；`interface class`/`virtual class` 记为 class | 同 Verilog；`import pkg::*;` / `import pkg::sym;` 按 package/module/interface/class 容器名映射到声明文件（同名取字典序最小文件），外部包不建边 |
| Objective-C | `.m`/`.mm`（以及含 `@interface`/`@protocol`/`@property` 的 `.h`）：`@interface`/`@implementation`（class；类扩展 `@interface Foo ()` 内成员非导出，category 归到所属类）、`@protocol`（interface）、`-`/`+` 方法（method，完整选择器；原型止于 `;`，实现按花括号配平）、`@property`（variable，含 block `(^name)`）；`//`、`/* */`、双引号字符串与字符字面量屏蔽；C/C++ 声明合并提取（结构体/typedef/函数不丢失） | `#import`/`#include`：引号形式先查引用方目录，两种形式都经 `include`/`src`/`inc` 根与项目根；尖括号框架头（`<UIKit/UIKit.h>`）不建边；`@import Module;` 是模块导入，不建文件边 |

已知限制：轻量解析不覆盖多行签名、单行类体成员、宏展开、完整泛型与条件编译；
C#/Kotlin/Scala 的命名空间解析优先按“点分路径后缀/前缀”匹配（不解析完整
项目文件），无法解析的外部 import 不创建依赖边（不猜测）。Ruby 的块范围
按 `end` 关键字配平，已忽略 heredoc 内容与 `=begin/=end` 块注释；剩余限制
是一行多个 heredoc 只识别首个、`%q{}` 等跨行字面量不屏蔽（只影响
`endLine` 精度，不影响符号名）。Scala 3 的缩进语法（无花括号的
`enum`/`object` 体）已按缩进推导类型与 `def` 的块范围；`extension` 方法
归属被扩展类型，`given` 实例登记为 variable 且内部方法归属该实例（匿名
given 以类型名登记）。宏展开与条件编译仍不解析；`.m`/`.h` 与 MATLAB/Mathematica 等共用扩展名，按内容识别（含 Objective-C 标记的 `.h` 改判为 objc 且合并 C 符号；MATLAB 写法的 `.m` 归为 `matlab` 并提取函数/类/属性符号（含转置感知的字符串屏蔽；无 `end` 风格函数按下一个同缩进 `function` 收尾）；无法判断时 `.m` 保持 objc），`@class` 前向声明与 `NS_ENUM` 等宏不登记；`.v` 与 Coq 共用扩展名，索引时按内容识别（含 Coq 声明且无 HDL 结构标记的文件记为 `coq` 且不提取符号，无法判断时保持 Verilog）；Scala 声明头可跨行
（参数逐行书写、`extends` 续行），缩进体从签名结束行开始计算。JS/TS 别名按文件
所在目录的就近配置解析（根配置兜底），相对 `extends`（字符串或数组，最多
5 跳）继承 `baseUrl`/`paths`，子配置 `paths` 覆盖父配置，包名 extends 不读取
（不访问 node_modules）；工作区包只
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
行级解析：只识别缩进 0 的声明；`when isMainModule` 等缩进块内的定义不
登记；`requires` 只识别单行；缩进按 Tab=4 列归一；`*` 是唯一导出证据。
OCaml 为轻量行级解析：只识别缩进 0 的声明；`module`/`class` 的 `endLine`
按 `struct`/`sig`/`object`/`begin` 与 `end` 单词配平（字段名恰为 `struct`
等极端情况可能提前结束）；`.mli` 的精确可见性不跨文件合并，`_` 前缀视为
私有；`open`/`module` 别名之外的模块调用（`Foo.bar`）不建边；`dune`
构建描述文件不读取（仅 `dune-project` 与 `*.opam`，嵌套 `dune-project`
上限 20）。Haskell 为轻量
行级解析：只识别缩进 0 的声明，`where` 绑定与 `instance` 方法不登记；
类方法只登记签名（默认方法体不单独登记）；中缀操作符定义只识别简单
形态；导出列表只解析第一层的值/类型/操作符名（`module` 重导出忽略、
`type` 关键字导出不做特殊展开）；源根为
`src`/`app`/`lib`/`test`、cabal `hs-source-dirs` 与项目根；
`stack.yaml` 不作为依赖清单。Erlang 为轻量行级解析：只识别缩进 0 的
声明与函数头；同名不同 arity 合并为一个符号；`-export` 只解析同文件内
的列表（`-export_type`/`-import` 不参与可见性）；`-include_lib` 剥离
首段后可能与 OTP 同名头文件误配（少量场景）；`rebar.config` 只读
`{deps, …}`，profiles 内依赖不解析。Solidity 为轻量行级解析：只识别
文件级与合约第一层的声明（嵌套合约/库不登记）；状态变量不产符号；
`internal`/`private` 是唯一可见性证据；多行接口声明（换行后 `external;`）
的 `endLine` 可能延伸到下一个块。Clojure 为轻量括号解析：只识别行首
`(` 的顶层形式（`#_(defn …)` 丢弃形式与 metadata 内的定义不登记）；
`defmulti`/`defmethod` 同名合并；`deps.edn` 只读顶层 `:deps`，别名
`(:require … :as-alias)` 仍指向原命名空间。HCL 为轻量行级解析：块头
必须与 `{` 同行（跨行块头不识别）；字符串插值 `${…}` 内引号可能提前
结束字符串（仅影响该行后续识别）；`source` 属性按模块源解析，资源内
同名属性可能在恰好存在同名目录时误连。Groovy 为轻量行级解析：只识别
顶层类型与类内第一层方法，闭包体内方法与嵌套类不登记；注解参数内的
括号不影响方法识别，但多行方法头（参数跨行）只按首行登记范围起点；
GString 内 `${…}` 的花括号随字符串一起屏蔽，不参与配平。
PowerShell 为轻量行级解析：只识别顶层定义与类内第一层成员，方法体内与
scriptblock 内的嵌套函数不登记；属性（`[string]$Name`）不产符号；
多行 `param(...)` 块与多行方法头按首行登记范围起点；`hidden` 是成员的
唯一可见性证据，`private:` 仅作用于函数作用域前缀；`Import-Module` 的
`-Name` 参数只识别首个路径 token，`-ModuleInfo`/管道等动态形式不建边；
`.psd1` 清单不参与符号提取，指向它的路径只能命中显式索引的脚本文件。
Fortran 为轻量行级解析：固定格式（`.f`/`.f77`）列首 `C`/`*` 注释不识别
（避免把 `C = 1` 赋值误当注释）；`include "x.h"` 与预处理 `#include` 不
建边；`private`/`public` 语句不改变 `exported`（Fortran 符号全部视为
模块可见）；`submodule`/`block data` 不登记；`end` 与声明同行的单行
程序单元按首行登记范围起点。Perl 为轻量行级解析：只识别行首
`package`/`sub`（`my $f = sub { … }` 匿名子程序不登记）；语句式 `package`
的 `endLine` 延续到下一个 `package` 或文件尾，块式结束后恢复外层包；
`use lib` 的额外加载路径不参与解析（只认 `lib/` 根与项目根）；`bin/`
目录沿用既有排除规则，其中的脚本不索引（`script/`、根目录脚本正常索引）。
Object Pascal 为轻量行级解析：`type` 段只识别 `Name = class/interface/
record/object` 形式（`type TFoo = ...` 同行写法不识别）；方法体按
`begin`/`case`/`try`/`asm` 与 `end` 配平，`case` 之外的变体记录与
匿名方法可能使范围偏长；`{$IFDEF}` 条件编译的两个分支都会解析；
`{$I file.inc}` 与 `.inc` 文件不建边；`class of` 元类按单行 class 登记。
Nix 为轻量行级解析：只识别行首绑定（`inherit`、`let … in` 同行写法与
属性集内联单行绑定可能漏登记）；跨行 lambda 参数模式按 class 处理；
`builtins.readFile` 之外的裸路径（如 `src = ./src;`）不建边；
`flake.nix` 不作为技术栈清单，Nix 项目暂无 stack 识别。
VB.NET 为轻量行级解析：`Sub`/`Function` 范围按 `End <keyword>` 配对，
接口与 `MustOverride` 声明靠"下一个声明"提前结束；自动实现属性
（无 `Get`/`Set`/`End Property`）按单行处理；`Operator` 重载名不是
标识符，不登记；`Imports` 一行多模块（逗号分隔）只取首个。
F# 为轻量行级+缩进解析：只识别行首声明（`namespace`/`module`/`type`/
`member`/`let`）；以 `abstract member` 定义的接口按 type 登记（无显式
`interface` 关键字）；计算表达式、`and` 互递归绑定与匿名 record 字段不
逐个登记；跨行 `let` 表达式按缩进块给出范围；`open` 的外部程序集不建边。
Tcl 为轻量行级解析：只识别行首 `proc`/`namespace eval`/`oo::class create`/
`method` 等形式（`{*}` 展开、动态 proc 名与 `interp alias` 不登记）；
proc body 内嵌套 proc 会带外层命名空间作为 `parent`；`source` 只识别
字面量路径，`$dir`/`[file join]` 拼接不建边。
Ada 为轻量行级解析：单元名以文件名（GNAT 约定，含连字符与目录两种形式）
为准，不从 `package` 声明反推；`entry`、`task body`/`protected body` 内的
accept 与 entry 不产符号；记录变体部与 `declare` 块的复杂嵌套按关键字
保守配平（`end if/loop/case/record/select/block` 不关闭单元）；generic
形式参数不登记、也不建边；`with` 外部标准库/第三方 crate 不建边。

## 升级检查清单

1. `npm ci && npm test`
2. `npm run lint && npm run typecheck`
3. `npm run verify:host`（本机有 app.asar 时）
4. 会话内最小冒烟：`repowiki-index` → `repowiki-cards` → `repowiki-status`
5. GUI 冒烟：面板分组/分页/排序/Wiki 清单/目录锚点/深色模式
