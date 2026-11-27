# 变更记录（中文摘要）

本文件是 [CHANGELOG.md](CHANGELOG.md) 的中文摘要镜像：英文版为权威记录，
此处每版给出 1–4 条要点。版本遵循 README 路线图的阶段划分。

## [0.228.0] - 2026-11-28

- **健康分信号**：架构分量在环与最高 fan-in 之外，新增分层违规（每条
  5 分，上限 30）、跨文件重复块（每块 3 分，上限 20）与高复杂度函数
  （每个 2 分，上限 20）；每个信号同时作为待办参与排序，分量说明给出
  计数。
- **输入向后兼容**：三个新输入均可选；缺省时分数与旧版完全一致，未
  计算这些信号的调用方不受影响。
- **测试**：679 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖扣分算术、
  上限（新信号下架构分下限 30）、分量说明与待办条目。

## [0.227.0] - 2026-11-28

- **复杂度估算**：复用重复检测已有的有界源码读取，对每个索引
  `function`/`method` 符号范围统计行首分支关键字（`if`/`for`/`while`/
  `case`/`catch`/`when`/`elif`/`elseif`/`except`/`match`）与 `&&`/`||`，
  复杂度 = 1 + 分支数。
- **报告**：`status.complexity` 输出参与统计的函数数、平均（2 位小数）、
  最大与最多 10 个 ≥15 的函数（复杂度降序，含路径/名称/行号/结束行）；
  高复杂度列表非空时进入告警，文本报告新增 `Complexity:` 行。注释与
  字符串未屏蔽，因此是复核启发式而非精确 McCabe 值。
- **测试**：678 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖分支计数、
  非函数排除、缺失源码、阈值排序、结束行截断与 status 集成。

## [0.226.0] - 2026-11-28

- **重复代码检测**：`repowiki-status` 以 8 路有界并发读取最多 150 个索引
  文件（超过 400 行跳过并计数），逐行空白归一后对每个 8 行窗口生成指纹；
  两个及以上文件共享的窗口合并为重复块（相邻窗口延长块），以
  `duplicates` 输出——总数精确、最多 20 组、每组最多 5 处。
- **信号约束**：全空窗口忽略，单文件内重复不计；重复块定位为人工复核
  线索而非语义级克隆判定；总数大于 0 时同时进入告警并在文本报告新增
  `Duplicates:` 行。
- **测试**：672 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖空白归一、
  跨文件合并、单文件/短块排除、空窗口、组数/行数上限与 status 集成。

## [0.225.0] - 2026-11-28

- **架构分层**：`repowiki-plan.json` 支持 `layers: [{ name, paths,
  mayDependOn }]`；索引文件按最长路径前缀归属层，同层边始终允许，未列入
  源层 `mayDependOn` 的跨层 import 判定为违规；不属于任何层的文件忽略，
  不做猜测。
- **分层报告**：`repowiki-status` 返回 `layers` 区块——违规总数精确、
  明细有界（50 条，含 `from`/`fromLayer`/`to`/`toLayer`/`line`）、
  参与判定的边数、各层文件数与未知 `mayDependOn` 引用；违规总数与未知
  引用同时进入告警，文本报告新增 `Layers:` 行。
- **配置校验**：无名、重名或无路径的层条目丢弃；路径归一（去 `./`、尾
  斜杠、反斜杠）；`mayDependOn` 只保留非空字符串。
- **测试**：664 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖层归一、
  最长前缀归属、允许/同层边、违规总数与明细上限、未知引用、非法边与
  status 集成（报告、告警与文本渲染）。

## [0.224.0] - 2026-11-28

- **Tcl 支持（第 37 种语言）**：`proc name {args} {…}`（命名空间限定名
  `::Foo::bar` 以 `Foo` 为 `parent`）、`namespace eval Foo {…}` 命名空间与
  TclOO `oo::class create Foo {…}` 类，类体内 `method`/`constructor`/
  `destructor`（method + `parent`）；块范围按整行花括号净值配平，proc 的
  参数列表与 body 都计入。
- **Tcl 屏蔽**：行首 `#` 注释、`; #` 尾注释与双引号字符串（反斜杠转义）
  屏蔽；引号内花括号不会截断 proc/类范围。
- **Tcl `source` 边**：`source ./x.tcl` 与 `source scripts/x.tcl` 先按
  项目根、再回退脚本目录并补 `.tcl`；动态 `[file join …]` 不建边。
- **测试**：656 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖命名空间、
  proc、TclOO 类、方法与构造器、花括号配平、字符串屏蔽、`source` 路径
  与注释过滤。

## [0.223.0] - 2026-11-28

- **VB.NET 支持（第 36 种语言）**：`Namespace`/`Class`/`Module`/
  `Structure`/`Interface`/`Enum` 声明（类型范围按 `End <type>` 配平）、
  `Sub`/`Function`/`Property`/`Event` 成员（修饰符栈含 `Partial`/
  `Shared`/`Async` 等），构造器为 `Sub New`，`Property` 块覆盖其
  `Get`/`Set` 体；接口与 `MustOverride` 声明止于本行；
  `Private`/`Friend`/`Protected` 标记非导出。
- **VB.NET 屏蔽**：`'` 行注释、`REM` 注释行与双引号字符串（双写转义）
  在配平前屏蔽。
- **VB.NET 依赖边**：`Imports`（含 `Alias = …`）与 `Inherits`/
  `Implements` 经点分路径与命名空间后缀匹配解析，根命名空间不在目录
  布局中也能命中；外部程序集不建边。
- **测试**：653 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖命名空间、
  类、接口、枚举、构造器、属性、事件、可见性、注释屏蔽与
  `Imports`/`Inherits` 解析。

## [0.222.0] - 2026-11-28

- **Nix 支持（第 35 种语言）**：属性集与 `let` 内的属性绑定登记为符号——
  `name = value;` 与点分路径（`packages.default = …`）为 variable，
  `{`/`rec {` 值为 class（花括号配平范围），`x:`/`{ … }:` lambda 为
  function；具名属性集内的绑定带 `parent`。
- **Nix 屏蔽**：`#` 行注释、`/* … */` 块、双引号字符串（反斜杠转义）与
  `''…''` 缩进字符串（`'''`/`''${`/`''\` 转义）屏蔽，字符串内花括号不会
  破坏属性集范围。
- **Nix 依赖边**：`import ./x.nix`、`callPackage ./pkg.nix` 与
  `builtins.readFile|readDir|path ./x` 相对引用文件解析，尝试原路径、
  `.nix` 后缀与目录 `default.nix`；`<nixpkgs>` 与绝对路径不建边。
- **测试**：650 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖属性绑定、
  嵌套属性集、点分键、lambda、缩进字符串屏蔽与三种引用 + 目录
  `default.nix` 解析。

## [0.221.0] - 2026-11-28

- **Object Pascal 支持（第 34 种语言）**：`.pas`/`.pp`/`.dpr`/`.dpk`/
  `.lpr` 提取 `unit`/`program`/`library` 与 `type X = class/interface/
  record/object` 声明（后两者映射 class/interface/type）、`procedure`/
  `function`/`constructor`/`destructor`（接口声明止于本行；实现体按
  `begin`/`case`/`try`/`asm` ↔ `end` 配平）与 `property` 成员；类内声明
  的方法带类名 `parent`，`TFoo.Bar` 实现继承 `TFoo`。
- **Object Pascal 屏蔽**：`//` 行注释、`{ … }`（含 `{$…}` 指令）与
  `(* … *)` 块注释、单引号字符串（双写转义）在配平前屏蔽。
- **Object Pascal `uses` 边**：跨行 `uses` 列表经按文件名构建的大小写
  不敏感单元名映射解析（Delphi 要求单元名与文件名一致），`Unit in
  'path.pas'` 显式路径先按项目根、再回退脚本目录并补 `.pas`/`.pp`/
  `.lpr`；外部单元不建边。
- **测试**：647 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖单元/类/记录/
  接口/属性、声明与实现范围、注释屏蔽、`uses` 与 `in` 路径、Pascal
  测试路径（`*Test.pas`/`*.Tests.pas`）。

## [0.220.0] - 2026-11-28

- **Perl 支持（第 33 种语言）**：`.pl`/`.pm`/`.t` 提取 `package Foo::Bar;`
  （语句形式，作用于后续声明直到下一个 package）与 `package Foo { … }`
  块类（结束后恢复外层包）；`sub name` 登记为 function，包内为 method 并
  带 `parent`，`_` 前缀按惯例非导出。
- **Perl 屏蔽**：`#` 行注释（`$#array` 除外）、`=pod … =cut` 块、`<<EOF`/
  `<<'EOF'`/`<<"EOF"`/`<<~EOF` heredoc 内容与单/双引号字符串在配平前屏蔽，
  POD、heredoc 文本与引号内花括号不会登记符号或破坏范围。
- **Perl 依赖边**：`use Foo::Bar`/`require Foo::Bar` 把 `::` 换算为路径，
  在每个 `lib/` 根与项目根下解析；`use parent 'Foo'`/`use base qw(Foo)`
  记录父模块；`require './x.pl'` 与 `require 'Foo/Bar.pm'` 先按项目根、
  再回退脚本目录解析；pragma（`strict`/`warnings` 等）与版本声明跳过，
  外部 CPAN 模块不建边。
- **测试**：644 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖包作用域、
  块 package、sub 可见性、POD/heredoc 屏蔽、pragma 过滤、parent/base、
  `lib/` 解析与 Perl `t/`/`*.t` 测试路径识别。

## [0.219.0] - 2026-11-28

- **Fortran 支持（第 32 种语言）**：`.f`/`.for`/`.f77`/`.f90`/`.f95`/`.f03`/
  `.f08`（含大写预处理变体）提取 `module`/`program` 单元、`subroutine`/
  `function`（含类型前缀与 `pure`/`recursive`/`elemental`/`module` 修饰）、
  派生类型（`type [::] name`、`type, extends(…) :: name`）与具名
  `interface`；`end`/`end <unit>` 配平范围，模块内过程带 `parent`，
  `end do`/`end if`/`end select`/`end where` 不关闭程序单元。
- **Fortran 屏蔽**：`!` 行注释与单/双引号字符串（双写转义）屏蔽，引号内
  文本与注释不会登记伪单元。
- **Fortran `use` 边**：`use name`、`use :: name`、`use name, only: …` 与
  `use, non_intrinsic :: name` 经大小写不敏感的模块名映射解析（模块名与
  文件名无需一致）；`use, intrinsic :: …`（标准库）与外部模块不建边。
- **测试**：641 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖程序单元、类型
  前缀、派生类型、interface、`end do`/`end if`、注释屏蔽、intrinsic 过滤
  与大小写不敏感解析。

## [0.218.0] - 2026-11-28

- **PowerShell 支持（第 31 种语言）**：`.ps1`/`.psm1` 提取 `function`/
  `filter`/`workflow`/`configuration` 定义（连字符 `Verb-Noun` 名称，
  `global:`/`script:`/`local:`/`private:` 作用域前缀，`private:` 非导出）
  与顶层 `class`/`enum`；类内第一层成员登记为带 `parent` 的方法（含
  构造器），`hidden` 成员非导出，属性声明不登记。
- **PowerShell 屏蔽**：`#` 行注释、`<# … #>` 块注释、单引号（`''` 转义）
  与双引号（反引号转义）字符串、`@'…'@`/`@"…"@` here-string 在配平前
  屏蔽，内部花括号与伪声明不会登记。
- **PowerShell 依赖边**：`using module ./X.psm1`、`Import-Module ./X` 与
  dot-source（`. ./X.ps1`）相对引用脚本解析，尝试原路径、`.ps1`/`.psm1`/
  `.psd1` 后缀与 `Foo/Foo.psm1` 模块目录形式；纯模块名（`Pester`）与
  越出项目的路径不建边。
- **测试**：638 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖函数/filter/
  类/方法/构造器、作用域可见性、`hidden` 成员、注释与 here-string 屏蔽
  及三种引用形式。

## [0.217.0] - 2026-11-28

- **Groovy 支持（第 30 种语言）**：`.groovy` 提取顶层 `class`/`interface`/
  `trait`/`enum` 容器与第一层方法（容忍注解与 `public`/`private`/`static`/
  `final`/`abstract`/`synchronized` 修饰符），以及 Gradle/Jenkinsfile 风格
  的顶层 `def` 脚本方法；`private`/`protected` 成员标记为非导出，控制流
  调用不会被误识别为方法。
- **Groovy 导入**：`import a.b.C` 经与 Java 源码共享的点分模块路径解析，
  Groovy 可导入 Java 类（反之亦然）；`import static a.b.C.member` 去掉
  末段成员，边落到定义文件。`//`、`/* … */` 注释与单/双/三引号字符串
  （含插值文本）在两种提取前统一屏蔽，内部花括号与调用不破坏范围、也不
  登记符号。
- **测试**：635 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖类/trait/方法/
  脚本函数、可见性、屏蔽与两种 import 形式，含 Groovy→Java 点分解析。

## [0.216.0] - 2026-11-28

- **索引规模/性能回归守卫**：每次测试都会索引一个 300 文件的合成
  TypeScript 仓库，断言 `stats.files`、符号数下限与 `stats.edges`，并设置
  宽松的 5 秒上限。提取器回归导致符号静默丢失、导入边缺失或意外二次方
  路径时会立即让 CI 失败，而不是留到后续才暴露。
- **测试**：632 例在 LANG=en 与 LANG=zh 下全通过；守卫本地约增加 35ms，
  阈值远高于实际耗时以避免慢机器抖动。

## [0.215.0] - 2026-11-28

- **Terraform/HCL 支持（第 29 种语言）**：`.tf` 提取 `resource`/`data`
  块（`type.name`）、`module`/`provider`/`terraform` 块与 `variable`/
  `output`/`locals`。块标签从字符串原文读取、范围用掩码视图配平，字符串
  内花括号不破坏配平；嵌套块（`lifecycle`/`dynamic`/`required_providers`）
  不登记。`source = "./modules/x"` 解析到该目录的 `main.tf`（否则字典序
  首个 `.tf`），registry/git 源不建边。`.terraform.lock.hcl` 提供 provider
  名与 Terraform 技术映射（AWS/Google Cloud/Azure/Kubernetes/Helm 等）。
  Prompt 围栏与面板语言筛选识别 `hcl`。
- **测试**：631 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖块种类与范围、
  嵌套块排除、模块源提取/解析、外部排除与 lock 文件 provider 元数据。

## [0.214.0] - 2026-11-28

- **Clojure 支持（第 28 种语言）**：`.clj`/`.cljs`/`.cljc` 提取 `ns`
  （class）、`defn`/`defn-`/`defmacro`/`defmulti`/`defmethod`（function）、
  `def`/`defonce`（variable）与 `defrecord`/`deftype`/`defprotocol`/
  `definterface`（class）。`^:private` 与 `defn-` 标记非导出；`;` 注释与
  字符串屏蔽，`(comment …)` 整体跳过，每个形式范围按括号配平。
  `(:require …)`/`(:use …)` 命名空间经每个 `src/`/`test/` 根解析，同类
  扩展优先（`.clj`/`.cljc`/`.cljs`），外部命名空间不建边。`deps.edn`
  `:deps` 与 `project.clj` `:dependencies` 提供坐标（版本映射不参与
  解析）、项目名/版本与 Clojure 技术映射。Prompt 围栏与面板语言筛选
  识别 `clojure`。
- **测试**：627 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖形式种类与
  括号范围、`defn-`/`^:private` 可见性、`(comment …)` 跳过、require
  提取、同类扩展解析、外部排除与 deps.edn/project.clj 元数据。

## [0.213.0] - 2026-11-28

- **Solidity 支持（第 27 种语言）**：`.sol` 提取 `contract`/`library`/
  `interface`（含 `abstract contract`）容器，成员 `function`/
  `constructor`/`receive`/`fallback`/`modifier`/`event`/`error`/`struct`/
  `enum`/自定义值类型（`parent` 归属），以及文件级函数/类型。
  `private`/`internal` 成员非导出；注释与字符串屏蔽；容器与成员范围
  按花括号配平（以 `;` 结尾的声明记为单行）。`import "./X.sol"`（含
  `import {A} from` 与 `import * as X from`）按引用文件相对路径解析并
  补 `.sol`，外部路径不建边。`foundry.toml` 标记 Foundry 工具链。
  Prompt 围栏与面板语言筛选识别 `solidity`。
- **测试**：623 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖容器/成员
  种类、归属与范围、`internal` 可见性、注释屏蔽、import 变体、相对
  解析、外部排除与 foundry 识别。

## [0.212.0] - 2026-11-28

- **OCaml 同名模块近邻解析**：`buildOcamlModules` 现在保留每个模块名的
  全部候选（`.ml` 先于 `.mli`，再字典序），`resolveOcamlSpecifier`
  选择与引用文件共享目录最深的候选。多库仓库中的同名模块，
  `open`/`include`/`module M = Foo` 会落到同库文件，而不是全局字典序
  的第一个；外部模块仍返回 null。
- **测试**：620 例在 LANG=en 与 LANG=zh 下全通过；`lib/a/foo.ml` 与
  `lib/b/foo.ml` 夹具验证各自引用方连到最近模块。

## [0.211.0] - 2026-11-28

- **跨语言测试路径**：受影响测试路由新增 Erlang `*_SUITE.erl`
  （common_test）与 `*_tests.erl`（eunit）、R testthat `test-*.R`
  （大小写）与 Julia `runtests.jl`，与既有测试目录、`*.test.*`/
  `*.spec.*`、`test_*`/`*_test.*`、`*_spec.rb` 及 JVM/C#/Swift 命名
  并列；`suite.erl`、`api.R`、`core.jl` 等近似形态仍不误判。
- **测试**：619 例在 LANG=en 与 LANG=zh 下全通过；启发式夹具覆盖三种
  新约定与近似负例。

## [0.210.0] - 2026-11-28

- **语言接入完整性守卫**：`test/docs-consistency.test.js` 遍历
  `SYMBOL_LANGUAGES` 的每种语言，缺少 Prompt 围栏（`fenceLang`）或面板
  `LANGUAGE_LABELS` 条目即失败。给 `src/schema.js` 增加扩展名不再可能
  只接入一半。`fenceLang` 为守卫导出，Prompt 输出不变。
- **测试**：619 例在 LANG=en 与 LANG=zh 下全通过；新增用例覆盖全部
  28 种符号语言（26 种语言 + Vue/Svelte SFC）的围栏与面板标签。

## [0.209.0] - 2026-11-28

- **Erlang 支持（第 26 种语言）**：`.erl`/`.hrl` 提取 `-module`、
  `-record`、`-type`/`-opaque`、`-define` 宏与顶层函数（多子句、`when`
  守卫、跨行签名）。`-export([f/1, …])` 决定可见性（默认私有；同名不同
  arity 合并为一个符号），`%` 注释、字符串、引号原子与 `$x` 字符字面量
  先屏蔽。`-include("…")` 经引用文件目录与每个 `src/`/`include/` 根
  解析，`-include_lib("app/…")` 还会尝试剥离应用名前缀的路径；外部头
  文件不建边。`rebar.config` 的 `{deps, …}` 提供依赖计数与 rebar 技术
  映射。Prompt 围栏与面板语言筛选识别 `erlang`。
- **测试**：618 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖符号种类、
  多子句范围、导出可见性、注释/字符串屏蔽、include/include_lib 提取、
  rebar 依赖，以及根解析与应用名前缀剥离的索引端到端夹具。

## [0.208.0] - 2026-11-28

- **Haskell 导出列表可见性**：`module M (a, B(..), (<+>)) where` 的导出
  列表现在决定 `exported`。未列出的顶层符号标记为非导出（检索排序优先
  导出符号，未使用导出审计会跳过它们），`module X` 重导出忽略，支持
  操作符导出与多行列表，类方法跟随其类的可见性。无导出列表的模块保持
  全部公开。`INDEX_PARSER_VERSION` 提升到 9，旧索引会重新解析 Haskell
  文件。
- **测试**：614 例在 LANG=en 与 LANG=zh 下全通过；夹具覆盖列表内/外
  顶层符号、多行列表（操作符与模块重导出）与无列表的公开默认。

## [0.207.0] - 2026-11-28

- **嵌套清单读取上限**：嵌套 `pubspec.yaml` 最多读取 30 个
  （Dart/Flutter monorepo），嵌套 `dune-project` 最多 20 个
  （OCaml monorepo），与 mix/gleam/zig/composer/opam/cabal/cargo 清单的
  既有上限一致。选择按遍历顺序保持确定性，根清单不受影响，异常目录树
  不会触发无界清单读取。
- **测试**：612 例在 LANG=en 与 LANG=zh 下全通过；夹具构造 35 个 Dart
  包与 25 个 OCaml 项目，通过计数 fs 验证两个上限。

## [0.206.0] - 2026-11-28

- **Haskell `hs-source-dirs`**：解析 cabal 的 `hs-source-dirs:` 声明
  （逗号列表与缩进续行，按 library/executable stanza），并入 Haskell
  模块搜索根，与 `src`/`app`/`lib`/`test` 常规目录及项目根共同参与解析。
  使用 `source/`、`library/` 等自定义布局的项目现在也能建立 `import` 边；
  路径按深度、字典序排序且相对清单目录，保持确定性。
- **测试**：611 例在 LANG=en 与 LANG=zh 下全通过；夹具覆盖 cabal 声明的
  `source/` 库目录与跨行 `app` 源码目录，验证跨目录导入边。

## [0.205.0] - 2026-11-28

- **Rust workspace crate 解析**：嵌套 `Cargo.toml`（上限 20）把
  `[package] name` 映射到 crate 根目录，并按 Cargo 规则把 `-` 归一为
  Rust 代码中的 `_`；`path` 依赖补全未声明 name 的成员。
  `use other_crate::module` 解析到该 crate 的 `src/` 子模块，并回退
  `lib.rs`/`main.rs` 入口（根 crate 的顶层 `lib.rs` 也在回退范围内），
  跨 crate workspace 引用形成真实依赖边。外部 crate 仍不建边，根
  `Cargo.toml` 继续驱动 cargo 技术栈识别。
- **测试**：610 例在 LANG=en 与 LANG=zh 下全通过；夹具覆盖
  `core-lib` → `core_lib` 归一、路径依赖登记、跨 crate 子模块解析与
  入口文件回退。

## [0.204.0] - 2026-11-28

- **Haskell 类方法与多行签名**：`class … where` 体现在按方法层缩进登记
  方法签名（`parent` 归属类；默认方法体与嵌套 `where` 绑定不登记），
  顶层与类方法签名都允许名称与 `::` 分行（`foo` 一行、`::` 下一行）。
  方法按类作用域作为合并键，类方法与同名顶层函数不再合并为一个符号。
  `INDEX_PARSER_VERSION` 提升到 8，旧索引会重新解析 Haskell 文件。
- **测试**：609 例在 LANG=en 与 LANG=zh 下全通过；夹具覆盖类方法归属、
  类/顶层多行签名与定义范围。

## [0.203.0] - 2026-11-28

- **Haskell 支持（第 25 种语言）**：`.hs`/`.lhs` 提取 `module` 声明
  （范围至文件尾）、`data`/`newtype`（含 `data family`）、`type`/
  `type family`、`class`、`pattern` 同义词、顶层值签名（`name ::`）与
  定义（含中缀操作符定义——登记操作符本身而非首个操作数），签名与实现
  合并为一个跨两者的符号。`--` 注释、可嵌套 `{- … -}` 块注释（含
  pragma）、字符串与字符字面量屏蔽；缩进 `where`/`let` 体不登记。
  `import [qualified] [safe] ["pkg"] Module` 按 GHC 模块路径在每个
  `src/`/`app/`/`lib/`/`test/` 源根下解析（`.hs` 后 `.lhs`），外部包
  不建边。`*.cabal` 清单提供包名、版本与跨行 `build-depends` 依赖及
  Haskell 技术映射（嵌套清单上限 20）。Prompt 围栏与面板语言筛选识别
  `haskell`。
- **测试**：608 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖符号种类与
  范围（module/文件尾、data/newtype/type/class、签名+定义合并、中缀
  操作符、注释/字符串屏蔽）、import 变体（qualified/package/hiding）、
  cabal 元数据与跨行 `build-depends`，以及 `src`/`app` 源根解析与外部包
  排除的索引端到端夹具。

## [0.202.0] - 2026-11-28

- **OCaml `and` 续接与原始字符串**：`let rec f … and g …` 现在逐个登记
  互递归函数，`type a = … and b = …` 逐个登记续接类型，行号与范围口径
  与主定义一致。`{|…|}` 与 `{id|…|id}` 原始字符串跨行屏蔽（保留起止
  定界符用于范围测量），内部 `(* … *)` 或 `let` 文本不再遮蔽后续声明。
  缩进判定改为只看行首空白，修复掩码体以空格结尾的顶层行被误跳过。
  `INDEX_PARSER_VERSION` 提升到 7，旧索引会重新解析 OCaml 文件。
- **测试**：604 例在 LANG=en 与 LANG=zh 下全通过；夹具覆盖互递归函数、
  续接类型、单行/跨行原始字符串、内部注释标记与后续声明行号。

## [0.201.0] - 2026-11-28

- **OCaml 支持（第 24 种语言）**：`.ml`/`.mli` 提取顶层 `let`/`let rec`
  （含 `let%ppx`、属性，运算符定义除外）函数、`type` 容器与别名
  （参数化名称取末尾标识符）、`module`/`module type`、`class`/`class type`、
  `exception` 与 `val`/`external` 签名。可嵌套 `(* … *)` 注释与字符串先
  屏蔽，缩进体内部不登记，`struct`/`sig`/`object` 范围按配对 `end` 结束。
  `open`/`include`/`open!`/`module M = Foo` 经"文件名→模块名"映射解析
  （`.ml` 优先于 `.mli`，`Foo.Bar` 归到 `foo.ml`），外部库不建边。
  `dune-project` 提供项目名/版本，`*.opam` 提供版本与 `depends` 依赖及
  OCaml 技术映射（嵌套清单上限 20）。Prompt 围栏与面板语言筛选识别
  `ocaml`。
- **测试**：603 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖符号种类与
  范围（含 `end` 配平的模块/类与 `_` 私有）、注释/字符串屏蔽、
  `open`/`include`/别名提取、dune/opam 元数据，以及模块映射解析与
  `.ml` 优先的索引端到端夹具。

## [0.200.0] - 2026-11-28

- **Nim `type` 块成员**：`type` 单独成段（Nim 模块最常见的多类型写法）时，
  每个缩进的 `Name* = object`/`enum`/`ref object`/`tuple`/别名定义各自
  登记为类符号。成员拥有独立缩进范围（字段与下一个成员界定边界），
  `*` 后缀决定导出标记，字段行（`name*: string`）与枚举值行
  （`red, green`）不会误登记。此前整个段落在 `type` 关键字后被跳过，
  常见 Nim 领域类型对符号检索不可见。`INDEX_PARSER_VERSION` 提升到 6，
  旧索引会重新解析 Nim 文件。
- **测试**：598 例在 LANG=en 与 LANG=zh 下全通过；夹具覆盖导出/私有
  `type` 块成员、逐成员范围、字段与枚举值排除，以及后续例程行号。

## [0.199.0] - 2026-11-28

- **Nim 支持（第 23 种语言）**：`.nim`/`.nims` 提取 `proc`/`func`/
  `method`/`iterator`/`template`/`macro`/`converter`、`type Name = …`
  容器与顶层 `const`/`let`/`var`；`*` 后缀标记模块导出，缩进体内部跳过
  （嵌套例程不浮出），多行签名先定位再计算体范围。`#` 行注释、可嵌套
  `#[ … ]#` 块注释与字符串（含三引号）先屏蔽。`import`/`from … import`/
  `include`/`export` 经引用文件目录、每个 `src/` 根与项目根解析到
  `<module>.nim`/`.nims`；`std/` 与外部包不建边。`*.nimble` 清单提供项目名
  （文件名）、版本与 `requires` 去重依赖及 Nim 技术映射。Prompt 围栏与
  面板语言筛选识别 `nim`。
- **测试**：597 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖全部例程形态、
  缩进范围、多行签名、`*` 导出、注释/块注释/字符串屏蔽、嵌套例程排除、
  import/from/include 与相对路径、`.nimble` 依赖过滤，以及 `src/` 根与
  `../` 解析的索引端到端夹具。

## [0.198.0] - 2026-11-28

- **Julia 宏修饰声明**：`@kwdef struct` / `Base.@kwdef mutable struct` 识别
  为类符号且块范围正确（宏前缀不再隐藏 struct 或破坏配平），
  `@enum Color red green` 登记枚举类型与枚举值（枚举值为非导出变量）。
  `INDEX_PARSER_VERSION` 提升到 5，旧索引会重新解析 Julia 文件。
- **测试**：593 例在 LANG=en 与 LANG=zh 下全通过；夹具覆盖宏前缀 struct
  （含模块限定宏）、枚举类型/值、导出过滤与块范围。

## [0.197.0] - 2026-11-28

- **R S4 声明**：`setGeneric("name", …)` 登记为函数符号（经 `NAMESPACE`
  导出），`setMethod("name", "Class", …)` / `setMethod("name",
  signature("Class"), …)` 登记为方法并以签名类为 `parent`，
  `setRefClass("Name", …)` 与 `setClass`/`R6Class` 一样登记为类。方法即使
  泛型被导出也保持 `exported: false`，与 R 的导出粒度一致。
  `INDEX_PARSER_VERSION` 提升到 4，旧索引会重新解析 R 文件。
- **测试**：592 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖泛型/方法种类与
  parent（字符串与 `signature()` 两种签名）、`setRefClass` 类、
  NAMESPACE 驱动的导出与方法不导出。

## [0.196.0] - 2026-11-28

- **Julia 支持（第 22 种语言）**：`.jl` 提取 `module`/`baremodule`、
  `struct`/`mutable struct`、`abstract type`/`primitive type`、
  `function name(...)`（`Type.method` 归为 method + parent）、短函数
  `name(args) = expr`、`macro` 与顶层 `const`；函数/结构体/宏体内部跳过，
  嵌套定义不会浮出。`#` 行注释、可嵌套 `#= … =#` 块注释、跨行字符串与
  三引号字符串在配平前屏蔽，`a[end]`/`x.end` 不会关闭块。含 `module` 的
  文件以 `export`（逗号分隔、支持续行）作为导出证据，无 module 的脚本
  全部可见。`include("path")` 相对引用文件解析（缺省补 `.jl`），动态
  参数不建边。`Project.toml` 提供包名、版本与 `[deps]`/`[extras]` 去重
  依赖及 Julia 技术映射。Prompt 围栏与面板语言筛选识别 `julia`。
- **测试**：590 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖全部声明形态、
  块范围、`Type.method` 归属、export 过滤、注释/块注释/三引号屏蔽、嵌套
  定义排除、`include` 变体与动态参数跳过、`Project.toml` 依赖去重，以及
  文件相对/`../` 解析的索引端到端夹具。

## [0.195.0] - 2026-11-28

- **R6/S4 方法符号**：`R6Class(...)` / `setClass(...)` 内声明的方法
  （`initialize = function(...)`，含单行表达式体）现在登记为 `method`
  符号并以所属类为 `parent`，不再整体跳过；方法体不参与顶层扫描，局部
  赋值不会被误判为函数；方法 `exported: false`（需经类访问）。符号检索
  因此可以按名称找到 R6 方法。`INDEX_PARSER_VERSION` 提升到 3，旧索引会
  重新解析 R 文件，而不是复用缺少方法符号的缓存。
- **测试**：586 例在 LANG=en 与 LANG=zh 下全通过；R 符号夹具新增方法
  归属、单行方法范围、`exported: false` 与第二个方法后的类范围断言。

## [0.194.0] - 2026-11-28

- **R `NAMESPACE` 导出**：解析根清单，让 R 包符号的 `exported` 来自清单
  证据而不再只靠 `.` 前缀约定。`export(...)`、`exportClasses(...)`、
  `exportMethods(...)` 与 `S3method(generic, class[, method])`（导出
  `generic.class`）在清单读取后应用到所有 R 文件；`exportPattern(...)`
  无法静态展开，回退到约定推断，避免把所有符号标成未导出。
- **测试**：586 例在 LANG=en 与 LANG=zh 下全通过；R 索引夹具覆盖导出/
  未导出函数、`.` 私有名、S3 方法、R6 类与跨文件传播，并新增
  `exportPattern` 回退夹具。

## [0.193.0] - 2026-11-28

- **status 展示解析器版本**：`repowiki-status` 返回 `index.parserVersion`，
  在 `Index:` 行展示，并在缓存索引由不同提取器版本生成时告警。用户在执行
  重建前就能知道“下次会全量重解析、新语言支持为何还没生效”，无需从文件
  计数变化反推。
- **测试**：585 例在 LANG=en 与 LANG=zh 下全通过；`parserVersion: 1`
  夹具固定结构化字段、告警与渲染文本。

## [0.192.0] - 2026-11-28

- **R 支持（第 21 种语言）**：`.R`/`.r` 提取 `name <- function(...)` /
  `name = function(...)`（含 `<<-`）函数符号，支持跨行签名、`{` 写在下一行
  与单行表达式体；`setClass("Name", …)` / `R6Class("Name", …)` 登记为类，
  类调用内部跳过（R6 方法不会误判为顶层函数），函数体内嵌套函数不登记，
  `.` 前缀按 R 约定标记私有；注释与字符串内容在匹配前屏蔽。
  `source("path")` / `sys.source("path")` 先按文件目录、再按项目根解析，
  尝试 `.R`/`.r`，动态参数不建边。`DESCRIPTION`（DCF）提供包名、版本与
  `Depends`/`Imports`/`Suggests`/`LinkingTo` 去重依赖（剔除 `R` 与版本
  约束）。`.bats` 文件并入 Shell 索引。Prompt 围栏与面板语言筛选识别 `r`。
- **测试**：584 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖函数写法与范围、
  单行体、分行 `{`、`.` 私有命名、R6 方法排除、注释/字符串屏蔽、`source`
  变体与动态参数跳过、DCF 续行与依赖去重，以及项目根/`../` 解析与
  `DESCRIPTION` 元数据的索引端到端夹具。

## [0.191.0] - 2026-11-28

- **Shell 支持（第 20 种语言）**：`.sh`/`.bash`/`.zsh` 提取三种函数写法
  （`function foo`、`function foo()`、`foo() {`，含 `{` 写在下一行）与显式
  公开变量（`export`/`readonly`/`declare`/`typeset` 带赋值）；普通赋值与
  `local` 不登记，避免脚本临时变量淹没符号表。`#` 注释、引号字符串（含
  跨行）与 heredoc 内容在花括号配平前屏蔽；`${…}` 参数扩展整体跳过，
  单个扩展不会提前结束函数块。`source path` / `. path` 先按脚本目录、
  再按项目根解析，尝试原路径与 `.sh`/`.bash`；动态参数（变量、命令替换、
  通配符）不建边。Prompt 围栏与面板语言筛选识别 `shell`。
- **测试**：580 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖三种函数写法、
  分行 `{`、单行函数体、显式变量过滤、注释/heredoc 屏蔽、`source`/点命令
  与动态参数跳过，以及脚本目录/项目根/`../` 解析的索引端到端夹具。

## [0.190.0] - 2026-11-28

- **修复升级后的陈旧解析缓存**：`INDEX_PARSER_VERSION` 自 v0.117 起一直是
  1，而提取器此后新增了 15+ 种语言并修复多处解析（Zig 公开再导出、Gleam
  跨行导入、Dart/PHP/Ruby/Swift/Scala 等）。旧版本建立的索引会一直复用
  内容未变文件的陈旧 `symbols`/`imports`，使新语言支持对已有项目不可见。
  版本号提升为 2：升级后首次重建会重解析全部文件（`changed` = 文件数、
  `reused` = 0），随后恢复正常增量复用。
- **测试**：577 例在 LANG=en 与 LANG=zh 下全通过；增量缓存夹具改为显式
  传入旧版 `parserVersion`（`INDEX_PARSER_VERSION - 1`），更贴近真实升级
  场景并固定“先全量重解析、再恢复复用”的行为。

## [0.189.0] - 2026-11-28

- **Zig 公开再导出**：`pub const x = @import("x.zig")` 现在登记为导出变量
  符号，模块门面（转发子模块）可被符号检索与符号级影响分析发现；私有
  别名（`const std = @import("std")`、`const Self = @This()`、`@cImport`）
  仍不进入符号表，保持逐文件导入无噪声。
- **测试**：577 例在 LANG=en 与 LANG=zh 下全通过；Zig 符号夹具新增再导出
  符号（种类/导出/行号）与私有别名排除断言。

## [0.188.0] - 2026-11-28

- **Zig monorepo**：嵌套 `apps/*/build.zig.zon`（上限 20，根清单不受限）
  的直接 `dependencies` 键计入 `dependencyCounts.zig`，项目名/版本仍只取
  根清单。zon 的依赖键是用户自定义别名，因此只计数、不从键名推断技术名，
  避免误判；嵌套清单沿既有有界读取管线按遍历顺序选定，输出保持确定。
- **测试**：577 例在 LANG=en 与 LANG=zh 下全通过；新增嵌套
  `apps/tool/build.zig.zon` 依赖累加、根元数据优先与“不映射技术名”断言。

## [0.187.0] - 2026-11-28

- **Gleam monorepo 与跨行导入**：嵌套 `apps/*/gleam.toml`（上限 20，
  根清单不受限）的依赖计数与技术栈并入项目技术栈，项目名/版本仍只取
  根清单；跨行未限定导入（`import my_app/{\n  type User,\n  User as U,\n}`）
  在解析前拼接到闭合 `}`（上限 50 行），`imported` 符号完整，符号级
  影响证据不再受代码格式化影响。
- **测试**：576 例在 LANG=en 与 LANG=zh 下全通过；新增跨行导入拼接与
  `apps/web/gleam.toml` 夹具，验证依赖累加、根清单元数据优先与子包技术
  栈来源可追溯。

## [0.186.0] - 2026-11-28

- **status 结构化 Wiki 陈旧原因**：`repowiki-status` 输出
  `wiki.staleReasons`（`cards`/`graph`/`memory`，值域与顺序同
  `verify:wiki`）并在 `Wiki:` 行展示。页面级计数为 0 时不再掩盖依赖图或
  已采信记忆导致的陈旧，JSON/CI 消费方可直接决定刷新方式；原告警不变。
- **测试**：574 例在 LANG=en 与 LANG=zh 下全通过；图陈旧与记忆陈旧夹具
  新增原因数组与渲染标注断言。

## [0.185.0] - 2026-11-28

- **Gleam 支持（第 19 种语言）**：`.gleam` 提取 `type`/`opaque type`/
  `external type` 容器、`type Name = …` 别名（kind `type`）、`fn`/
  `external fn`（跨行签名与单行块体）与顶层 `const`，`pub` 决定导出；
  注释（`//`、`////`）与字符串内容（含跨行字符串）在花括号配平前屏蔽，
  函数体内的 `let`/匿名函数不登记。`import package/module`（含 `as`
  别名与 `.{type Foo, Foo as F}` 未限定导入）经每个 `src/`/`test/` 源根
  与项目根解析到 `<module>.gleam`，`gleam/io` 等外部包不建边；
  `gleam.toml` 提供项目名、版本与 `[dependencies]`/`[dev-dependencies]`
  的去重依赖名，Wisp/Lustre/Mist/gleam_http 等框架技术保留清单来源。
  Prompt 围栏与面板语言筛选识别 `gleam`。
- **测试**：574 例在 LANG=en 与 LANG=zh 下全通过；新增用例覆盖容器/别名
  范围、opaque/external 形态、`external fn` 单行符号、跨行签名、字符串/
  注释屏蔽、`let` 排除、import 别名与未限定导入去重、`gleam.toml` 分段
  计数，以及索引端到端夹具（`src/`、`test/` 与项目根解析，外部包不建边）。

## [0.184.0] - 2026-11-28

- **status 结构化不可信索引计数**：`repowiki-status` 在净化过被篡改索引时
  返回 `index.untrusted`（`files`、`edges`），并在 `Index:` 行内联展示
  丢弃数量；原告警保留，纯文本消费方不受影响，JSON/CI 消费方无需再解析
  告警文案。索引中的原始路径仍不回显。
- **测试**：570 例在 LANG=en 与 LANG=zh 下全通过；越界路径夹具新增对
  结构化计数与渲染行的断言。

## [0.183.0] - 2026-11-28

- **Zig 支持（第 18 种语言）**：`.zig` 提取容器类型（`const Foo =
  struct/enum/union/opaque`，含 `pub`/`extern`/`packed` 与 `union(enum)`）、
  顶层 `fn`/`extern fn`/`export fn`（原型与函数体）、具名 `test "…"` 块
  以及顶层常量/变量；容器成员以所属类型为 `parent`，且只在容器体一层
  识别，函数体内局部量不登记。`@import`/`@cImport`/`@This` 绑定是模块
  别名而非业务符号，跳过；`//`/`///`/`//!` 注释与 `\\` 多行字符串在块
  配平前屏蔽。`@import("x.zig")` 相对引用文件所在目录解析（归一并限制
  在项目内），`std`/`builtin`/`root` 与构建注入的模块名不建边。
  `build.zig.zon` 提供项目名、版本与 `dependencies` 直接子键计数（兼容
  枚举字面量与字符串两种 name）。Prompt 围栏与面板语言筛选识别 `zig`。
- **测试**：570 例在 LANG=en 与 LANG=zh 下全通过；新增用例覆盖容器/
  成员归属、单行块范围、`extern` 原型、注释与多行字符串屏蔽、字符串内
  伪 `@import`、`build.zig.zon` 依赖计数，以及索引端到端夹具（同目录、
  子目录、`../` 相对解析，外部模块不建边）。

## [0.182.0] - 2026-11-28

- **Lua 支持（第 17 种语言）**：`.lua` 提取模块表变量（`local M = {}`）、
  `function name` / `local function name`、`M.foo` / `M:foo` 方法（归一为
  `foo` 方法 + parent `M`）与 `M.foo = function` 赋值；块范围按
  `function/if/for/while/do/repeat … end/until` 配平，并屏蔽 `--` 行注释、
  `--[[ ]]` 块注释与 `[[ ]]` 长字符串。`require("my.mod")` /
  `require 'mod'` 经每个 `lua/` 目录（Neovim 插件布局）与项目根解析到
  `<mod>.lua` 或 `<mod>/init.lua`，外部模块不建边。Prompt 围栏与面板语言
  筛选识别 `lua`。
- **测试**：565 例在 LANG=en 与 LANG=zh 下全通过；新增用例覆盖嵌套
  `if`/`for` 与长字符串屏蔽下的块范围、`M:method` 归一、注释掉的
  require，以及索引端到端夹具（`lua/` 根、点分模块名、`init.lua`，
  外部 `require("socket")` 不建边）；“不支持语言”夹具改用 Fortran。

## [0.181.0] - 2026-11-28

- **清单文件有界并发读取**：配置清单（`package.json`、`tsconfig*`、
  `go.mod`、`CMakeLists.txt`、`composer.json`、`mix.exs` 等）先按遍历
  顺序与既有分类上限选定，再以最多 8 路并发读取并按选择顺序装配。
  远程 `ctx.fs` 不再为每个清单逐个支付往返，而截断判定、`manifestTexts`
  键顺序与全部派生结果与串行版本完全一致。
- **文档**：修正兼容矩阵中“Hatch `packages` 未解析”的过期说明（v0.84.0
  起已支持），并补充 Elixir 轻量解析边界（do/end 范围、动态模块名、
  `defimpl`/`defprotocol` 结构符号）。
- **测试**：562 例在 LANG=en 与 LANG=zh 下全通过；12 个嵌套
  `tsconfig.json` 的延迟读取夹具证明清单读取并发发生（峰值 > 1 且 ≤ 8），
  且 files/edges/技术栈与串行构建完全一致。

## [0.180.0] - 2026-11-28

- **深层 Markdown 标题可渲染**：面板渲染器现在识别 `####` 至 `######`
  （此前只支持 `#`–`###`），保持页面 h1 由外层承担并钳制到 `h6`，模型写的
  子小节不再以字面 `####` 段落出现；深层标题同样带锚点 id，段落中断规则
  也跟随扩展后的标题范围。
- **可访问性**：表头单元格带 `scope="col"`，屏幕阅读器能把数据单元格与
  列关联。
- **测试**：561 例在 LANG=en 与 LANG=zh 下全通过；客户端夹具卡片新增
  `####` 小节，DOM 用例断言 `h5` 节点、锚点 id 与表头 `scope` 属性。

## [0.179.0] - 2026-11-28

- **Elixir `.exs` 文件进入索引**：测试文件（`test/**/*_test.exs`）、脚本与
  `config/*.exs` 现在参与符号索引，测试文件里的 `alias`/`use` 也会产生
  依赖边，`repowiki-impact` 因此能把 Elixir 测试列入受影响测试
  （`test/` 路径与 `*_test.exs` 已有测试启发式）。根 `mix.exs` 仍按清单
  处理，不会被重复计入源码。
- **测试**：561 例在 LANG=en 与 LANG=zh 下全通过；Elixir 夹具新增
  `test/my_app/accounts_test.exs`（断言其到源模块的 alias 边、elixir 文件
  数为 8、外部 `ExUnit.Case` 不建边），测试路径启发式也固定 Elixir 测试
  路径识别。

## [0.178.0] - 2026-11-28

- **Elixir umbrella 依赖聚合**：嵌套 `apps/*/mix.exs`（单次最多 20 个）
  的 Hex 依赖现在计入 `dependencyCounts.mix` 与技术栈识别，每条技术记录
  保留来源清单。项目名仍取根 `mix.exs`——依赖都在各 app 里的 umbrella
  不再显示 `mix: 0`、也不会丢失 Phoenix/Ecto/Plug。
- **测试**：561 例在 LANG=en 与 LANG=zh 下全通过；Elixir 索引夹具新增
  两个子 app 清单，断言合并后的 mix 计数（5）、Plug 来源
  `apps/web/mix.exs`、Oban 来源 `apps/api/mix.exs`，以及项目名仍取根清单。

## [0.177.0] - 2026-11-28

- **Elixir 支持（第 16 种语言）**：`.ex` 文件提取 `defmodule`（嵌套
  `defmodule Inner` 记录完整 `Outer.Inner`）、`def`/`defp`、
  `defmacro(p)`、`defguard(p)` 与 `defdelegate`，范围按 do/end 配平，
  支持 `do:` 单行、多行签名与私有可见性。`alias` / `import` / `require` /
  `use` 解析到声明该模块的文件（含 `alias MyApp.{A, B}` 与 `as:` 别名），
  Phoenix umbrella、嵌套模块与单文件多模块都有真实依赖边；外部模块
  （`Logger`、`Ecto` 等）不建边。`mix.exs` 提供应用名、依赖计数与 Hex
  技术名（Phoenix/Ecto/Plug/Oban 等）。Prompt 围栏与面板语言筛选识别
  `elixir`。
- **测试**：561 例在 LANG=en 与 LANG=zh 下全通过；新增符号用例覆盖
  模块/函数/宏/guard/delegate、嵌套全名、多行函数头与 `do:` 单行；
  依赖夹具覆盖分组/重命名 alias；索引端到端夹具断言 alias/import 行号、
  umbrella 布局、嵌套模块解析、外部包排除与 `mix` 技术栈计数。

## [0.176.0] - 2026-11-28

- **Wiki 新鲜度覆盖依赖图**：Wiki 清单新增 `graphDigest`（索引文件集合 +
  依赖边）。生成侧的增量短路要求它一致，因此只影响解析的变化——新增
  `tsconfig` 别名、composer PSR-4 映射、`go.mod` module 路径、pubspec
  包名，或无卡片文件的新增/删除——都会重新合成，而不是把架构页静默留在
  过期状态。`verify:wiki` 报告 `wiki/stale-graph` 与
  `staleReasons: ['graph']`，`repowiki-status` 给出告警，面板把结构不匹配
  并入既有“Wiki 落后”提示（用已加载的 `index.json` 计算）。旧清单没有
  `graphDigest` 时保持原有卡片/记忆检查，下次生成写入新字段。
- **测试**：558 例在 LANG=en 与 LANG=zh 下全通过；新增用例覆盖签名
  （顺序无关、非法条目忽略）、索引边变化强制重新生成、门禁 graph 陈旧
  原因与问题码、状态告警，以及仅结构指纹不同时的面板提示。

## [0.175.0] - 2026-11-28

- **中文查询不再被单字误召回**：BM25 检索（`tokenizeQuery`）与面板搜索在
  CJK 连续段长度 ≥2 时只保留双字组，文档侧仍索引单字以保证“图”这类单字
  查询可用。此前“无匹配”会命中所有含“无”的卡片，把真正结果淹没；拉丁
  词不变。
- **测试**：552 例在 LANG=en 与 LANG=zh 下全通过；新增用例固定查询分词
  规则（多字只出双字组、单字保留、拉丁原样），并用 BM25 夹具证明仅含
  “无”的文档不再命中“无匹配”。

## [0.174.0] - 2026-11-28

- **面板渲染器支持 GFM 表格与嵌套列表**：生成的卡片/Wiki 常含 Markdown
  表格与缩进子列表，零依赖渲染器此前会把它们压成段落。现在表格渲染为
  `<table>`（表头/表体单元格、分隔行驱动对齐 `:--`/`:--:`/`--:`、单元格
  内行内格式与 `\|` 转义）；列表按缩进构建树，子列表渲染在父 `<li>`
  内，支持每一层有序/无序混排。不引入新依赖，单元格内链接仍走既有协议
  白名单。
- **测试**：550 例在 LANG=en 与 LANG=zh 下全通过；客户端夹具卡片新增
  两列表格与三层列表，新 DOM 用例断言表格节点、居中对齐、`li > ul`
  嵌套与有序/无序混排。

## [0.173.0] - 2026-11-28

- **目录列举有界预取**：DFS 停留在某个目录时，索引器会按遍历顺序提前
  对后续兄弟目录发起 `listDir`（最多 8 个在途）。条目仍按排序后的 DFS
  顺序消费、预算仍按该顺序计数，结果与串行遍历完全一致——远程 `ctx.fs`
  后端不再为每个目录逐个支付往返延迟。预取 Promise 挂有空 catch，预算
  截断或取消不会产生未处理拒绝。
- **测试**：549 例在 LANG=en 与 LANG=zh 下全通过；延迟 `listDir` 夹具
  证明兄弟目录列举发生重叠（峰值 > 1 且 ≤ 8），同时 files 与 edges 与
  串行构建完全一致。

## [0.172.0] - 2026-11-28

- **快照清单按数据校验，而不是信任其结构**：`repowiki-import` 现在拒绝
  `schemaVersion` 非当前的清单（字段语义可能已变）；显式 `count` 与
  `files.length` 不一致视为损坏；超过 8 MiB 的清单在读取前拒绝，避免异常
  快照把整份文件读入内存。非对象 JSON（数组/标量）报“损坏”，不再被当作
  空清单放过。缺省 `count` 的旧清单仍正常校验，`allowCorrupt` 仍是显式
  逃生口。
- **测试**：548 例在 LANG=en 与 LANG=zh 下全通过；新增用例覆盖未知 schema、
  count 不一致（仍逐文件校验以保留细节）、大小上限、非对象清单，以及
  “导出→篡改 schema→导入被拒且不写资产”的端到端链路。

## [0.171.0] - 2026-11-28

- **索引产物可复现**：目录枚举顺序不再影响结果。`walk` 对每层条目按
  名称字节序排序（不依赖 ICU/区域设置），超过 5,000 文件的仓库在任意
  机器上截断到同一批文件；最终 `files` 按路径、`edges` 按来源/行号/目标
  排序。此前后端返回顺序不同会产出不同的 `index.json`（Git 共享资产出现
  无意义 diff），超预算仓库还可能索引到不同子集。
- **测试**：545 例在 LANG=en 与 LANG=zh 下全通过；新增夹具用反向
  `listDir` 包装器构建同一项目，断言 `files`/`edges`/`modules` 完全一致，
  并校验路径与行号排序本身。

## [0.170.0] - 2026-11-28

- **索引路径按不可信输入处理**：`.dsh-repowiki/index.json` 随 Git 传播，
  精心构造的提交过去可让 `repowiki-context` / `repowiki-extract` /
  `repowiki-impact` 读取项目外文件（如 `../` 或绝对路径）并送入模型。
  现在 `readIndex` 会归一每个 `files[].path`，丢弃绝对/空/越界条目，并
  连带丢弃指向被弃文件的边；丢弃计数与前 5 条原始路径写入 `untrusted`，
  由 `repowiki-status` 以告警呈现。正常索引不受影响（不新增字段），
  `projectRelativePath` 与快照导入共用同一规则。
- **测试**：544 例在 LANG=en 与 LANG=zh 下全通过；新增用例覆盖路径助手
  （上跳/绝对/盘符/空白/非字符串）、索引净化（保留并归一、悬空边清理、
  `untrusted` 计数与路径）与文本告警渲染。

## [0.169.0] - 2026-11-28

- **PHP PSR-4 自动加载解析**：根与嵌套 `composer.json` 的 `autoload` /
  `autoload-dev` `psr-4` 映射（目录可为字符串或数组、支持空前缀兜底）参与
  `use` 解析。命名空间前缀映射到任意目录，不再依赖路径后缀，Symfony/
  Laravel 风格布局（`App\` → `src/`）开始建立真实依赖边；最长前缀优先，
  类名匹配保持大小写不敏感。绝对路径/向上越界目录被忽略，外部包仍不建边；
  Composer 依赖计数仍只统计根清单。
- **默认排除依赖目录**：`vendor/`（Composer 与 Go 的第三方 vendored 代码）
  与 `.dart_tool/`（Dart/Flutter 生成的包配置与构建缓存）不再进入索引，
  避免已安装依赖挤占 5,000 文件预算、把项目自身文件挤出索引。
- **测试**：540 例在 LANG=en 与 LANG=zh 下全通过；新增 PHP 夹具断言最长
  前缀、数组目录、`autoload-dev`、空前缀兜底、嵌套包基准目录与技术栈计数
  不变，另有夹具证明 `vendor/` 与 `.dart_tool/` 被跳过。

## [0.168.0] - 2026-11-28

- **导入不再复制清单外文件**：快照含 `_snapshot.json` 时，`repowiki-import`
  只复制清单登记的相对路径；手工塞进快照目录、或导出后被注入的文本文件
  一律跳过，并计入 `snapshotUnlisted`、在 `snapshotUnlistedPaths`（最多 5
  条）中列出——已校验的快照无法再把额外 Markdown/JSON 带进资产目录。
  无清单的旧快照保持整目录复制；清单路径先归一（反斜杠、`./`），绝对
  路径与向上越界条目在构造过滤集合前丢弃。
- **测试**：538 例在 LANG=en 与 LANG=zh 下全通过；新增 `copyTree` 的
  `only` 过滤（含空清单零复制）与导出→注入→导入端到端用例，断言未登记
  文件既不落盘也不被静默忽略（计数、路径列表与渲染行均校验）。

## [0.167.0] - 2026-11-27

- **Dart 工作区 `package:` 导入**：仓库内任意 pubspec 的包名映射
  `package:<name>/path.dart` 到对应包的 `lib/path.dart`（根包或嵌套
  `packages/*`），Flutter monorepo 的本地包之间开始建立依赖边，而不是
  把全部 `package:` 当外部；同名 pubspec 优先目录更浅者，与 JS 工作区
  规则一致。外部包与 `dart:` 仍不建边。
- **测试**：535 例在 LANG=en 与 LANG=zh 下全通过；Dart 索引夹具新增
  本包与嵌套工作区包的导入，断言两条边、part/import 精确行号与合并后的
  pub 依赖计数。

## [0.166.0] - 2026-11-27

- **Dart 支持（第 15 种语言）**：`.dart` 提取 class/mixin/enum/extension
  （含 extension type）/typedef/构造器（命名构造器为 `Type.name`）/方法/
  getter/setter/顶层函数与变量；`_` 前缀按私有记录。相对
  `import`/`export`/`part` 建立本地依赖边（含同目录裸 `.dart` 与 `show`
  符号），`dart:`/`package:` 保持外部。`pubspec.yaml` 提供项目名与 pub
  依赖计数，Flutter/Provider/Riverpod/Bloc/Dio 等映射为展示名；面板语言
  筛选显示 `Dart`。
- **测试**：535 例在 LANG=en 与 LANG=zh 下全通过；符号、依赖与索引用例
  覆盖构造器/getter/私有成员、相对 `part`/`import` 边、外部包排除与
  pub 技术栈。

## [0.165.0] - 2026-11-27

- **修复大快照导入**：快照校验此前在 500 个文件处停止并判为未通过，
  卡片/Wiki 超过 500 个的仓库无法默认导入。上限提高到 2 万文件，并改为
  8 路有界并发读取，远程工作区不再逐文件累积 RTT；结果仍按清单顺序汇总，
  输出可复现。
- **测试**：532 例在 LANG=en 与 LANG=zh 下全通过；带延迟的文件系统包装器
  断言真实并发且峰值不超过 8，显式低上限断言 `capped`/`verified=false`。

## [0.164.0] - 2026-11-27

- **快照写入回读校验**：`copyTree` 写完后回读比对，只有内容一致才计入
  导出成功；后端截断/写坏进入 `failed` 且不写入快照清单，避免生成一个
  直到导入时才暴露问题的快照。
- **测试**：531 例在 LANG=en 与 LANG=zh 下全通过；截断文件系统包装器
  断言 1 条失败、1 个成功文件，清单只含成功文件。

## [0.163.0] - 2026-11-27

- **带指纹校验的快照**：`repowiki-export` 在快照根写 `_snapshot.json`，
  记录每个复制文件与 sha256-16 内容指纹（取消或有复制失败时标记
  `partial`）；`repowiki-import` 复制前校验清单，指纹不符/缺失/不可读/
  路径非法/部分导出默认拒绝，可用 `allowCorrupt=true` 显式强制。旧快照
  无清单时仍可导入但提示未校验；清单文件本身不会复制进 `.dsh-repowiki/`。
- **测试**：530 例在 LANG=en 与 LANG=zh 下全通过；传输层覆盖指纹条目、
  清单往返与篡改/缺失检测，工具用例覆盖校验通过、篡改拒绝与强制导入。

## [0.162.0] - 2026-11-27

- **忽略规则字符类**：`.gitignore`/`.repowikiignore` 支持 `[abc]`、
  `[a-z]` 与 `[!a-z]`/`[^a-z]`，`*.py[cod]`、`file[0-9].txt` 等常见
  规则开始生效；非法范围与未闭合字符类按字面匹配而不是抛错，含 `/` 的
  字符类按字面处理，避免跨路径段匹配。
- **测试**：527 例在 LANG=en 与 LANG=zh 下全通过；新增正/负字符类、
  目录规则与非法范围降级用例。

## [0.161.0] - 2026-11-27

- **嵌套 `.gitignore` / `.repowikiignore`**：索引遍历时读取子目录规则。
  每条规则只作用于所在目录子树（锚定模式与 `generated/` 不会越界），
  更深目录的规则后置优先，因此包内 `!keep.skip.ts` 可恢复被根规则忽略
  的文件；根规则行为不变，不可读的嵌套规则文件进入索引告警。
- **测试**：526 例在 LANG=en 与 LANG=zh 下全通过；新增目录作用域、否定
  优先级与真实嵌套 `buildIndex` 夹具。

## [0.160.0] - 2026-11-27

- **`repowiki-cards offset` 分页**：符号文件与文档/BM25 结果在 `limit`
  之外支持 `offset`；`total` 始终为全集计数，`truncated` 表示本页之后
  仍有结果。文本输出显示精确的 `起–止` 区间，不再固定写“前 N 条”。
- **测试**：524 例在 LANG=en 与 LANG=zh 下全通过；符号检索与 BM25 的
  中间页/末页、cards 工具的 offset 返回与渲染区间均有断言。

## [0.159.0] - 2026-11-27

- **修复**：`docs/compatibility.md` 长期停留在索引 v5/清单 v2，实际已是
  v6/v3；兼容矩阵补齐行数、边行号、跳过文件、清单指纹/失败页等字段与
  旧资产读取降级说明，Runbook 不再声称旧索引升级到 v3。
- **增强**：`src/schema.js` 新增 `KNOWLEDGE_INDEX_SCHEMA_VERSION` 与
  `WIKI_MANIFEST_SCHEMA_VERSION` 常量，抽取/生成不再写内联数字。
- **门禁**：新增文档一致性测试，把兼容矩阵中的资产版本与代码常量绑定，
  今后改常量忘改文档会直接失败。
- **测试**：523 例在 LANG=en 与 LANG=zh 下全通过。

## [0.158.0] - 2026-11-27

- **修复**：`repowiki-status` 的 `wiki.invalid` 曾把每个正常页面都误报为
  路径不符——`listWikiPages` 返回项目根相对路径（`.dsh-repowiki/wiki/…`），
  清单路径相对资产根（`wiki/…`）。现比较前剥离资产前缀。
- **增强**：健康分 Wiki 分量纳入上次生成失败页（与缺页同 40 分权重、
  保留 60 分底），并按 5 分/条扣非法页面路径（上限 20）；调用方排除
  已计入缺页的非法路径，避免双扣；待办文案分别点名两类问题。
- **测试**：522 例在 LANG=en 与 LANG=zh 下全通过；新增失败页/非法路径
  扣分用例，并在完整状态夹具中断言正常 Wiki 的 `wiki.invalid = 0`。

## [0.157.0] - 2026-11-27

- **状态重复计数**：`repowiki-status` 新增 `wiki.duplicate`、
  `wiki.duplicateSlugs` 与 `wiki.duplicatePaths`，覆盖磁盘同 slug 文件与
  清单重复 slug/路径；文本 `Wiki:` 行追加 `duplicate N`，与门禁同口径。
- **面板重复提示**：Wiki 页签从已加载页面列表与清单派生同样计数（不额外
  读取），以 `role=status` 提示重复项 slug/路径。
- **测试**：521 例在 LANG=en 与 LANG=zh 下全通过；status 与面板各覆盖
  重复清单页与同 slug 文件。

## [0.156.0] - 2026-11-27

- **重复页检测**：两个页面文件声明同一 slug 时，`verify:wiki` 以
  `wiki/duplicate-page-slug` 失败。此前 slug Map 会静默覆盖其一，被覆盖的
  文件既不展示也不报孤儿。
- **清单重复条目**：清单重复登记同一 slug 或路径时以
  `manifest/duplicate-pages` 失败，在产生歧义解析前拦截合并/复制损坏。
- **测试**：519 例在 LANG=en 与 LANG=zh 下全通过；新增同 slug 文件与
  重复清单页两条断言。

## [0.155.0] - 2026-11-27

- **修复**：`verify:wiki` 的相对链接改为按页面真实位置
  （`.dsh-repowiki/wiki/<locale>/`）相对**项目根**解析。
  `../../../src/indexer.js` 这类项目内链接不再被误判为越界；只有真正越出
  项目根的目标报 `wiki/unsafe-link`。
- **增强**：门禁校验页面内**全部**相对 Markdown 链接（源码、文档、目录），
  不只 `.md`；`#Lx-Ly` 片段先剥离再做存在性探测，缺失目标报
  `wiki/broken-link` 并显示项目根相对路径。
- **测试**：518 例在 LANG=en 与 LANG=zh 下全通过；新增源码/文档/根
  README 链接通过、删除目标后失败的用例。

## [0.154.0] - 2026-11-27

- **文档**：README（中英文）新增 `verify:wiki --json` 的问题码参考表，
  列出 code、默认级别、`--strict`/`--require` 升级与含义，CI 无需读脚本
  即可按码聚合或抑制；同时修掉英文快速开始块里重复的一行门禁命令。

## [0.153.0] - 2026-11-27

- **面板路径非法提示**：Wiki 页签提示路径越出 `wiki/<locale>/`、含 `..`/
  绝对路径、非 `.md` 或与实际加载文件不符的清单页。非法路径从面板的
  缺页计数中排除，避免同一问题报两次。
- **测试**：517 例在 LANG=en 与 LANG=zh 下全通过；新增清单路径
  `../secret.md` 时显示非法提示、缺失提示保持隐藏的面板用例。

## [0.152.0] - 2026-11-27

- **状态路径非法计数**：`repowiki-status` 新增 `wiki.invalid`/
  `wiki.invalidPages`，报告路径越出 `wiki/<locale>/`、含 `..`/绝对路径、
  非 `.md` 或与实际文件位置不符的清单页。与门禁的路径校验同口径，但不读
  正文，保持诊断轻量。
- **测试**：516 例在 LANG=en 与 LANG=zh 下全通过；新增把清单路径改为
  `../secret.md` 后断言计数、slug 列表与文本的 status 用例。

## [0.151.0] - 2026-11-27

- **门禁有界并发读取**：`verify:wiki` 通过 `mapLimit` 以 8 路并发读取
  卡片、已采信记忆与 Wiki 页面文件，保持结果顺序与重复 slug 覆盖语义。
  大仓库不再为逐文件串行读取付出 CI 时间；链接/存在性探测仍保持上限与
  串行。
- **测试**：515 例在 LANG=en 与 LANG=zh 下全通过；新增并发读取两张有效
  卡片加一张坏卡、指纹仍匹配的用例。

## [0.150.0] - 2026-11-27

- **缺页健康分惩罚**：`assessHealth` 接受 `wiki.missing`，把缺页计入
  Wiki 总页数并按 `40 * missing / total` 扣减 Wiki 分量；status 透传
  `wiki.missing`，分量明细显示 `N missing`，待办优先报缺页而非陈旧页。
  页面全部缺失时分量保留 60 分底，避免直接归零后失去可解释性。
- **测试**：514 例在 LANG=en 与 LANG=zh 下全通过；新增 1/5 与 0/5 缺页
  的健康分用例，status 缺页用例补充分量分数与待办文本断言。

## [0.149.0] - 2026-11-27

- **面板记忆陈旧提示**：Wiki 页签同时重算已采信记忆的 `memoryDigest`
  （与 generate 相同的 `slug:body` 排序，正文去掉一级标题），与清单不
  一致时提示“Wiki 落后于已采信记忆”。连同卡片指纹，面板的陈旧视图与
  `verify:wiki` 对齐；Web Crypto 不可用时仍静默降级。
- **测试**：513 例在 LANG=en 与 LANG=zh 下全通过；新增清单写入错误
  `memoryDigest` 后面板显示记忆陈旧提示的用例。

## [0.148.0] - 2026-11-27

- **面板卡片陈旧提示**：Wiki 页签在浏览器侧重算卡片 `inputDigest`
  （Web Crypto SHA-256，与 generate 相同的 `path:sourceDigest` 排序），
  与清单不一致时提示“Wiki 落后于当前卡片”。Web Crypto 不可用时静默
  降级，不显示可能错误的告警。
- **测试**：512 例在 LANG=en 与 LANG=zh 下全通过；新增清单写入错误
  digest 后面板显示陈旧提示的用例。

## [0.147.0] - 2026-11-27

- **状态缺页计数**：`repowiki-status` 新增 `wiki.missing` 与
  `wiki.missingPages`（最多 10 个 slug），与 `verify:wiki` 使用相同的
  slug 比较；文本 `Wiki:` 行显示 `missing N`。至此门禁、面板与诊断工具
  对“清单缺页”的口径一致。
- **测试**：511 例在 LANG=en 与 LANG=zh 下全通过；新增删除已生成模块页后
  断言缺页计数、slug 列表与文本的 status 用例。

## [0.146.0] - 2026-11-27

- **页面结构与链接完整性**：`verify:wiki` 校验清单页面路径（必须在
  `wiki/<locale>/` 下、不含 `..`/绝对路径、以 `.md` 结尾）以及清单记录
  路径与实际文件位置一致；同时从正文提取相对 `.md` 链接（跳过代码块、
  行内代码、图片、外链与纯锚点），对越出项目根的链接
  （`wiki/unsafe-link`）与目标缺失的链接（`wiki/broken-link`）失败，
  存在性探测上限 200（strict 下截断即失败）。新增问题码
  `wiki/invalid-page-path`、`wiki/page-path-mismatch`、`wiki/unsafe-link`、
  `wiki/broken-link`、`wiki/link-probe-capped`。
- **测试**：510 例在 LANG=en 与 LANG=zh 下全通过；新增内部死链、越界
  链接与清单路径非法/位置不符用例。

## [0.145.0] - 2026-11-27

- **索引版本门禁**：`index.json` 早于 schema v6（无行数）时默认告警，
  `--strict` 下失败，避免行号校验静默只覆盖一部分。无法验证的
  `#Lx-Ly` 范围（`ranges.unchecked`）同样默认告警、`--strict` 失败
  （`citation/range-unchecked`）。
- **CI fixture job**：`.github/workflows/tests.yml` 新增 `verify-wiki` job：
  构造干净 fixture 断言严格门禁通过，再修改卡片指纹断言门禁退出码为 1，
  每次推送都实际执行文档中的 `--strict --require` 配方。
- **测试**：508 例在 LANG=en 与 LANG=zh 下全通过；新增 v5 索引告警与
  严格模式下旧索引/未验证范围失败的用例。

## [0.144.0] - 2026-11-27

- **面板 Wiki 诊断**：Wiki 页签直接显示清单级问题——上次生成失败页
  （`failedTotal`，tooltip 附最多 5 个 slug）与磁盘缺失的清单页。两条
  提示使用 `role=status`，位于引用摘要上方，并在页面列表为空（最需要
  诊断的状态）时同样显示。数据只来自清单与已加载的目录列表，不读源码。
- **测试**：507 例在 LANG=en 与 LANG=zh 下全通过；新增面板用例注入失败页
  与缺失页，断言两条提示及可访问的明细 title。

## [0.143.0] - 2026-11-27

- **生成失败页持久化**：`repowiki-generate` 在清单记录写失败的页面
  （`failed` 最多 10 条，`failedTotal` 记录完整数量）。此前部分失败仍会
  推进输入指纹，下一次门禁会把不完整的 Wiki 当成新鲜。
- **门禁报告**：`verify:wiki` 以 `wiki/generation-failed` 报告（默认警告、
  `--strict` 失败），locale 结果新增 `failedPages`。
- **状态诊断**：`repowiki-status` 新增 `wiki.failed`/`wiki.failedPages`，
  并在 `Wiki:` 行显示失败数。
- **测试**：506 例在 LANG=en 与 LANG=zh 下全通过；新增清单失败页的
  宽松/严格门禁用例与 status 结构/文本用例，以及干净生成的空字段断言。

## [0.142.0] - 2026-11-27

- **结构化问题码**：`verify:wiki --json` 在 issues/warnings 之外输出
  `problems[{code, severity, message, locale?}]`，稳定码包括
  `citation/missing`、`citation/range`、`citation/drift`、
  `wiki/stale-cards`、`wiki/stale-memory`、`wiki/missing-pages`、
  `manifest/empty`、`assets/missing` 等，CI 可按码聚合或抑制。
- **空清单语义**：清单没有任何页面时默认告警，`--strict` 与 `--require`
  下失败（generate 对空清单不会短路，放过它会掩盖生成失败）。
- **`--strict` 收紧**：引用存在性探测触及 200 路径上限时也失败
  （`citation/probe-capped`），与“不可验证即失败”一致。
- **测试**：504 例在 LANG=en 与 LANG=zh 下全通过；新增空清单矩阵与
  断链/陈旧/页面完整性用例的问题码断言。

## [0.141.0] - 2026-11-27

- **页面完整性门禁**：`verify:wiki` 递归枚举 Wiki 页面文件（slug 优先取
  frontmatter，深度 ≤3，与 `listWikiPages` 一致）。清单登记但磁盘缺失的
  页面默认失败（`N page(s) in the manifest have no file on disk`），未入
  清单的孤儿页仅告警；JSON 输出 `missingPages`/`orphanedPages`。
- **测试**：503 例在 LANG=en 与 LANG=zh 下全通过；新增删除清单页、加入
  孤儿页后断言失败、告警与两个列表的用例。

## [0.140.0] - 2026-11-27

- **记忆感知的陈旧门禁**：`verify:wiki` 同时重算已采信记忆的
  `memoryDigest`（与 `repowiki-generate` 相同的 `slug:body` 排序），记忆在
  生成后变化即失败；`staleReasons` 区分 `cards`/`memory`，文本报告标记
  `(stale: cards, memory)`。
- **`--require`**：没有 Wiki 清单时失败，避免 CI 因 root 写错或漏跑生成而
  静默通过。
- **`--strict` 收紧**：清单缺少 `inputDigest`/`memoryDigest`（陈旧性不可
  验证）时也失败，与“未验证指纹即失败”的语义一致。
- **测试**：502 例在 LANG=en 与 LANG=zh 下全通过；新增已采信记忆漂移、
  pending/rejected 不参与指纹、`--require` 空目录经 API 与 CLI 失败用例。

## [0.139.0] - 2026-11-27

- **陈旧 Wiki 门禁**：`verify:wiki` 现在重算卡片 `inputDigest`（与
  `repowiki-generate` 相同的 `path:sourceDigest` 排序），并与清单比较。
  不一致时默认失败并提示
  “wiki is stale: cards changed since generation (run repowiki-generate)”，
  即使所有引用路径仍然有效。旧清单没有 `inputDigest` 时仅警告并跳过。
- **测试**：500 例在 LANG=en 与 LANG=zh 下全通过；新增卡片写入、匹配清单
  通过、修改卡片后 stale 失败与 `(stale)` 报告标记用例。

## [0.138.0] - 2026-11-27

- **“仅看未覆盖”筛选**：只要存在未覆盖引用的页面，Wiki 页签就显示带页面
  数量的筛选按钮；与搜索组合生效，用 `aria-pressed` 表示状态，隐藏引用
  全部有指纹的页面。
- **修复**：有页面但搜索/筛选无结果时，Wiki 页签改为“没有符合条件的
  页面”，不再误用“尚未生成 Wiki 页面”。
- **测试**：499 例在 LANG=en 与 LANG=zh 下全通过；面板用例驱动筛选开关，
  断言筛选前后页面标题与 `aria-pressed`，旧清单降级用例保持通过。

## [0.137.0] - 2026-11-27

- **`verify:wiki` CI 门禁**：`npm run verify:wiki`（或
  `node scripts/verify-wiki.mjs`）校验全部 Wiki 清单：缺失引用路径
  （索引 + 有界文件系统探测）、行号越界（索引 v6）、内容漂移（清单 v3）
  与指纹覆盖率。支持 `--root`、可重复 `--locale`、`--json` 与 `--strict`；
  断链/越界/漂移默认失败，未覆盖/未验证默认警告、严格模式失败。没有 Wiki
  资产退出 0；显式请求缺失 locale 失败。退出码：0 通过、1 失败、2 参数/读取错误。
- **修复**：页级 `sources` 是章节 `sources` 的并集，服务端
  `findCitationRangeIssues` 此前两者都计数，导致越界/未检查总数与健康分
  扣分翻倍；现按页去重，与面板/覆盖率口径一致。
- **测试**：498 例在 LANG=en 与 LANG=zh 下全通过；新增门禁的干净/严格、
  断链/越界/漂移、未覆盖、缺失 locale、参数解析、main 输出与 CLI 退出码
  用例，以及页级/章节重叠计数回归。

## [0.136.0] - 2026-11-27

- **页级覆盖率明细**：`repowiki-status` 新增 `citationCoveragePages`，
  最多列出 10 个存在未覆盖引用的页面（未覆盖最多者优先），每页带
  `total`/`tracked`/`untracked` 与原因分类；`Citation digests` 行追加
  首个示例页面，调用方可直接定位需要刷新的页面。该明细与汇总共用同一套
  页级计数逻辑。
- **覆盖率提示不扣分**：健康分待办新增“N 条引用没有内容指纹”，但分数
  不变——未覆盖代表未知，不等于已证明有问题。
- **测试**：490 例在 LANG=en 与 LANG=zh 下全通过；新增页级排序/截断、
  status 明细与渲染、健康分提示不扣分用例。

## [0.135.0] - 2026-11-27

- **有界并发漂移读取**：`checkCitationDrift` 先对唯一引用文件做有界并发
  预取（默认 8，硬上限 16，可用 `concurrency` 覆盖），再按清单顺序比较，
  不再逐个串行读取。结果、上限与 `unchecked` 口径完全不变；大仓库的
  status 延迟降低，输出不受影响。
- **测试**：489 例在 LANG=en 与 LANG=zh 下全通过；新增并发上限断言
  （并发 3 与 `concurrency: 1` 时均正确验证全部指纹）。

## [0.134.0] - 2026-11-27

- **面板未覆盖原因**：Wiki 页签读取清单的 `citationMisses`，在逐页 `◌ N`
  徽章的 tooltip/可访问标签与汇总行中展示本地化原因（不可读、行号非法、
  读取上限、原因未知），全程不读源码；旧清单仍只显示一行无指纹记录。
- **测试**：487 例在 LANG=en 与 LANG=zh 下全通过；面板夹具为越界引用补充
  `citationMisses`，并断言徽章 title 与原因提示标签。

## [0.133.0] - 2026-11-27

- **未覆盖引用原因分类**：生成时在清单页面记录 `citationMisses`
  （source → 原因），`citationCoverage.reasons` 输出 `unreadable`（文件不可读）、
  `range`（行号非法/倒置/越界）、`cap`（生成读取上限）与 `unknown`（旧清单
  无原因数据）。原因会出现在生成 `hint`/渲染与 status 的 `Citation digests`
  行；计数按页面口径与覆盖率一致，旧清单回退为 unknown 而不是猜测。
- **测试**：487 例在 LANG=en 与 LANG=zh 下全通过；新增原因分桶、越界引用
  归为 range、不可读文件归为 unreadable、旧清单归为 unknown 的用例。

## [0.132.0] - 2026-11-27

- **面板引用指纹覆盖率**：Wiki 页签从清单派生页级与汇总覆盖率，无需读取
  源码。有引用但无指纹的页面显示弱化的 `◌ N` 徽章（带可访问 title），
  覆盖率不完整时列表头部展示 `tracked/total`；旧清单没有任何指纹时只显示
  一行"清单无指纹记录"，不会逐页打扰。
- **修复**：清单页级 `sources` 是章节 `sources` 的并集，此前两者都计入
  导致越界/未检查数重复。现在按页去重后统计，与 status/generate 口径一致。
- **测试**：486 例在 LANG=en 与 LANG=zh 下全通过；面板夹具升级为 v3 并
  保留 4/5 指纹，断言 `◌ 1` 徽章与覆盖率摘要；新增旧 v2 清单仅显示无指纹
  行、不逐页显示徽章的用例。

## [0.131.0] - 2026-11-27

- **引用指纹覆盖率**：`repowiki-generate` 与 `repowiki-status` 输出
  `citationCoverage`（`total` / `tracked` / `untracked` / `hasDigests`），
  由清单派生：生成时读取失败或超过读取上限的引用会被如实标为未覆盖，
  不再被静默当作已验证。生成会渲染未覆盖提示，fresh 短路的 `hint`
  区分"已记录指纹已验证"与"存在未覆盖引用"；无指纹旧清单也给出明确
  状态。`summarizeCitationCoverage` 为共享纯函数；status 仅在覆盖率不完整
  或清单早于 v3 时渲染 `Citation digests` 行。
- **测试**：485 例在 LANG=en 与 LANG=zh 下全通过；新增覆盖率助手
  （按页去重、空页面、空指纹、旧清单）、生成（短路完整覆盖、删除源文件
  后未覆盖、旧清单措辞）与 status（不完整覆盖行）用例。

## [0.130.0] - 2026-11-27

- **引用感知健康分**：`repowiki-status` 把引用完整性计入加权健康分。缺失
  引用路径每条扣 Wiki 分量 10 分（上限 40）；行号越界与内容漂移每条各扣
  5 分（各上限 20），总扣分上限 80，Wiki 分量不会归零。引用缺陷进入前四条
  待办，Wiki 分量明细标注缺陷数；`unchecked`（未验证）只报告不扣分，
  避免把"未知"当成"已知有问题"。
- **测试**：483 例在 LANG=en 与 LANG=zh 下全通过；新增扣分算术、上限与
  status 集成（缺失路径 + 漂移指纹）用例。

## [0.129.0] - 2026-11-27

- **增量生成纳入引用漂移**：`repowiki-generate` 在沿用 fresh 短路前重算
  清单 v3 的引用内容指纹。卡片与已采信记忆未变、但被引用代码已变时不再
  跳过：`citationDrift > 0`，或存在无法验证的引用（文件不可读、范围非法、
  超过 500 条比较上限 / 200 文件读取上限），都会重新合成并在 `hint`
  说明原因。验证通过时返回 `citationDrift: 0`；无指纹的旧清单保持原行为。
- **共享漂移检查模块**：status 与 generate 共用 `src/citation-drift.js`
  （同样的上限、路径拒绝与按文件读取缓存）；超出比较上限的条目计入
  unchecked 而非静默忽略，截断的检查不会被当作最新。
- **测试**：481 例在 LANG=en 与 LANG=zh 下全通过；新增共享检查器
  （一致/变化/不可读/不安全路径/读取上限/条目上限）与生成侧（引用未变
  仍短路、引用变化重合成、无法验证时保守重合成）用例。

## [0.128.0] - 2026-11-27

- **引用内容漂移**：Wiki 清单升级到 schema v3，为每条引用记录 sha256-12
  内容指纹（`citationDigests`），生成时按引用行范围计算（无行号则整文件）。
  被引用路径先走与页面 sources 相同的白名单净化，并在写锁外读取（每次
  上限 200 文件）。`repowiki-status` 重新计算（读取上限 100 文件），把
  变化的引用列入 `citationDrift`（页面明细有界）并给出告警；完全一致时
  显示 `(none; N verified)`。v1/v2 清单没有指纹，不做漂移断言；读取失败、
  非法范围与超上限条目计入 unchecked，绝不判为已变化。
- **公共指纹助手**：`src/citation-digest.js` 的行切片与 `countSourceLines`
  语义对齐（空文件 0 行，结尾换行不额外加行）。
- **测试**：474 例在 LANG=en 与 LANG=zh 下全通过；模块页生成用例断言
  两个源文件都有 v3 指纹，状态漂移用例覆盖一致、不一致、不可读与旧清单。

## [0.127.0] - 2026-11-27

- **面板引用问题**：Wiki 页签在客户端由清单与索引派生引用问题。索引记录
  行数（v6）时，超出文件末尾的 `#Lx-Ly` 按页计数并显示 `⚠ N` 徽章
  （可访问 title）；列表头部展示"越界 / 未检查"汇总。行数未知的引用
  （未索引文件或旧索引）计入未检查而非断链；文件系统存在性检查仍由
  `repowiki-status` 负责。
- **测试**：471 例在 LANG=en 与 LANG=zh 下全通过；客户端夹具补充 `lines`
  并断言 10 行文件上的 `#L11` 产生汇总与 `⚠ 1` 徽章。

## [0.126.0] - 2026-11-27

- **引用行号越界校验**：索引 schema v6 记录 `files[].lines`（源码行数，
  由索引时已读取的文本直接计算），读取侧兼容 v2–v5。`repowiki-status`
  解析 `#Lx-Ly` / `#Lx` / `#Lx-y` 引用并按索引行数校验：起始为 0/负数、
  起止倒置、超出文件末尾都进入 `citationRangeIssues`（页面明细有界）；
  对存在但行数未知的文件（未索引或旧索引）计入 `unchecked` 而不是猜测。
  文本新增 `Citation ranges` 行与告警；无清单时不做行号断言。
- **公共行数助手**：`src/util.js` 的 `countSourceLines` 统一行数语义
  （空文件 0 行，结尾换行不额外加行）。
- **测试**：471 例在 LANG=en 与 LANG=zh 下全通过；覆盖率与基准见
  `docs/coverage.md`、`docs/benchmarks.md`。

## [0.125.0] - 2026-11-27

- **模块耦合与不稳定性**：新增纯函数 `src/coupling.js`，按跨模块静态 import
  计算 Martin 指标——Ca（有多少个其他模块依赖本模块）、Ce（本模块依赖多少
  个其他模块）与不稳定性 `Ce/(Ca+Ce)`。同模块内部边、自引用与无 module
  字段的文件忽略；模块对去重。`repowiki-status` 输出 `moduleCoupling`
  （按不稳定性降序、同分按耦合总量、再按模块名，前 10），并在模块依赖
  热点旁渲染 `Module instability` 行。
- **测试**：466 例在 LANG=en 与 LANG=zh 下全通过；覆盖率与基准见
  `docs/coverage.md`、`docs/benchmarks.md`。

## [0.124.0] - 2026-11-27

- **保守导出审计**：`repowiki-status` 报告没有具名 import 证据的导出符号。
  只有"至少一条入边且所有入边都带具名符号"的文件才被审计；无入边（可能是
  入口）或存在无名导入（默认/副作用/C/Go 风格）的文件计入 `skippedFiles`
  而不猜测。忽略 `default` 名称；明细有界（10 文件 × 10 符号）但总数精确；
  文本新增 `Unused export candidates` 行并显示未审计文件数。输出措辞为
  "无 import 证据"，绝不宣称死代码。
- **测试**：462 例在 LANG=en 与 LANG=zh 下全通过；覆盖率与基准见
  `docs/coverage.md`、`docs/benchmarks.md`。

## [0.123.0] - 2026-11-27

- **Wiki 引用完整性**：`repowiki-status` 校验清单中的页面级/章节级引用：
  先查索引，非索引引用（如 README）再查文件系统。输出 `brokenCitations`
  （去重缺失路径数、引用出现次数、最多 10 个页面 × 每页 10 条、截断标记）；
  文本新增 `Broken citations` 行并给出重新生成告警。绝对路径与 `..` 段
  不做探测、直接按缺失报告；需要超过 200 次文件系统探测时，未验证引用
  按存在处理并在告警中说明，绝不冒充缺失。无清单时不输出该判定。
- **测试**：457 例在 LANG=en 与 LANG=zh 下全通过；覆盖率与基准见
  `docs/coverage.md`、`docs/benchmarks.md`。

## [0.122.0] - 2026-11-27

- **影响面列出受影响测试**：`repowiki-impact` 用路径启发式识别受影响文件中的
  测试（`test`/`spec`/`__tests__` 目录、`*.test.*`/`*.spec.*`、
  `test_*`/`*_test.*`/`*_spec.rb`、`FooTest`/`FooTests`/`FooSpec`/`FooIT`
  等命名），在文件级与符号级输出 `affectedTests`（最近跳数优先、上限 50、
  附 `affectedTestsTruncated`）。测试在完整图遍历中收集，明细被截断时
  列表仍准确；文本新增 `Affected tests` 行，第一条验证建议直接点名要跑的
  测试文件。启发式可能误判，输出中如实标注为路径推断。
- **测试**：454 例在 LANG=en 与 LANG=zh 下全通过；覆盖率与基准见
  `docs/coverage.md`、`docs/benchmarks.md`。

## [0.121.0] - 2026-11-27

- **面板核心文件**：单库视图新增 `核心文件` chip 行，使用与
  `src/graph-rank.js` 相同的 PageRank 参数（边去重、忽略自引用、dangling
  均分、阻尼 0.85、迭代上限 50）。分数保留三位小数，chip 为可键盘操作的
  按钮并打开对应文件详情；索引无依赖边时整行隐藏。它与既有 fan-in 行互补：
  PageRank 计入间接重要性，让"通过下游变重要"的模块也能浮出。
- **测试**：449 例在 LANG=en 与 LANG=zh 下全通过；覆盖率与基准见
  `docs/coverage.md`、`docs/benchmarks.md`。

## [0.120.0] - 2026-11-27

- **任务上下文符号锚点**：`repowiki-context` 在路径与自然语言任务之外新增
  `symbols`（裸名或 `path#name`）。已解析定义所在文件排第一，锚点符号名
  驱动源码片段选择；提供锚点时 query 可省略。限定路径复用影响面工具的
  路径匹配（精确/后缀/唯一 basename）；裸名在多个文件定义时报告歧义候选
  而不猜；未命中的锚点如实报告，绝不扩大为文件级或词法搜索。显式锚点
  全部失败时不触发 PageRank repo map 兜底，避免掩盖锚点错误。
- **测试**：448 例在 LANG=en 与 LANG=zh 下全通过；覆盖率与基准见
  `docs/coverage.md`、`docs/benchmarks.md`。

## [0.119.0] - 2026-11-27

- **PageRank 核心文件排名**：新增纯函数 `src/graph-rank.js`，在静态 import
  图上计算确定性 PageRank（边去重、忽略自引用、dangling 权重均分、固定
  阻尼与收敛上限、同分按路径稳定排序）。`repowiki-status` 新增 `coreFiles`
  （前 10，仅索引有依赖边时）并渲染 `Core files (PageRank)` 行，补上单看
  fan-in 计数看不到的间接重要性。
- **repo map 兜底**：`repowiki-context` 在任务未命中任何索引文件且 import
  图有边时，用同一排名给出前 5 个文件作为仓库地图起点，逐条标 `(repo map)`，
  结构化输出带 `fallback: 'repo-map'`，包内 Caveats 与 hint 均说明"起点
  而非任务相关性"；任何词法/文档命中时行为不变。
- **测试**：446 例在 LANG=en 与 LANG=zh 下全通过；覆盖率与基准见
  `docs/coverage.md`、`docs/benchmarks.md`。

## [0.118.0] - 2026-11-27

- **使用点证据**：`repowiki-impact` 在符号模式扫描直接具名导入方，按标识符
  边界定位所选符号的出现行，输出 `usages`（`path:line` + 去空白源码行，
  超长截断）。多行 import/export 列表（JS/TS、Python `from … import (`、
  Go `import (`、Rust/PHP `use … {`）与解构绑定、整行注释均被排除。语义
  仍是词法出现而非解析后的调用点（字符串与行尾注释可能命中），输出中明确
  标注。读取有界：最多 20 个导入方文件、每符号 10 条、总计 100 条；
  读不到的文件列入 `usagesUnreadable`（未知而非无使用），因文件上限跳过
  的计入 `usagesSkippedFiles`；`includeUsages=false` 完全跳过源码读取。
- **测试**：438 例在 LANG=en 与 LANG=zh 下全通过；覆盖率与基准见
  `docs/coverage.md`、`docs/benchmarks.md`。

## [0.117.0] - 2026-11-27

- **符号级影响面**：`repowiki-impact` 新增 `symbols`（裸名或 `path#name`）。
  直接依赖方必须具有所选符号的具名 import 证据，排除副作用导入和只导入
  同文件其他符号的模块；传递层仍是反向文件图的保守展开，另以
  `conservativeImpactedTotal` 保留文件级上界。符号未解析时如实报告，绝不
  静默扩大为文件级分析。
- **任务上下文打包**：新增第 11 个工具 `repowiki-context`，按标识符、路径、
  显式 anchor 与卡片/Wiki/已采信记忆 BM25 命中排序文件，一次返回相关符号、
  带行号源码、直接 imports/dependents、相关循环和 fan-in 热点。字符预算
  2,000–40,000（默认 12,000）为硬上限，源码/文档/关系省略分别计数；无索引、
  空查询和无源码命中均给出可操作的降级提示。
- **多行导入与缓存修复**：跨行 JS/TS import/export-from 现在保留起始行号、
  完整具名符号与默认+具名混合导入；`index.json` 新增 `parserVersion`，解析
  规则升级时即使源码 digest 未变也会重解析旧缓存，且 added/changed/removed
  统计保持正确，同版本的下一次索引恢复增量复用。
- **测试**：425 例在 LANG=en 与 LANG=zh 下全通过；覆盖率与基准记录分别见
  `docs/coverage.md`、`docs/benchmarks.md`。

## [0.115.0] - 2026-11-27

- **变更影响面工具**：新增 `repowiki-impact` —— 给定准备修改的文件，在
  反向 import 图上返回直接/传递依赖方（1–3 跳，明细有界但总数精确）、
  涉及变更文件的循环组（含代表路径）、变更文件 fan-in、会受影响的
  卡片（含陈旧标记）与 Wiki 页面/章节引用；风险分由直接依赖、传递
  依赖、循环、hub 四个显式因子计算（low–critical），并按优先级给出
  验证建议。路径匹配支持绝对路径、后缀与唯一 basename，歧义只列候选
  不猜；只读、确定性、无模型调用。
- **测试**：415 例全通过（LANG=en 与 LANG=zh 双环境）；覆盖率数字见
  `docs/coverage.md`。

## [0.114.0] - 2026-11-27

- **文档覆盖率与健康度**：`repowiki-status` 新增 `coverage` —— 分母是
  plan 复杂度阈值下"有资格生成卡片"的文件（而非全部文件），输出已覆盖/
  新鲜/陈旧数与缺口最大的模块（最多 5 个）；新增 `health` 四分量加权
  健康分（文档 40 / Wiki 25 / 架构 20 / 卫生 15，A–D 等级），同时输出
  每个分量的得分/权重/说明与前四条待办，文本报告新增两行摘要。
- **测试**：新增 health 纯函数与状态接线用例；覆盖率数字见
  `docs/coverage.md`。

## [0.113.0] - 2026-11-27

- **跨语言资产自动回退**：`repowiki-cards`（正文检索、`includeMemory`、
  Wiki 引用）与 `repowiki-status` 在未显式指定 locale 时，按"环境语言 →
  实际有卡片/Wiki/记忆的另一语言"选择读取目录；显式 locale 保持严格。
  修复了资产生成在 `zh`、宿主语言为 `en` 时检索静默为空、Wiki 陈旧
  被误判为 0 的环境相关缺陷；输出新增 `locale`/`localeRequested`/
  `localeSource`（以及 status 的 `availableLocales`）。面板加载卡片/Wiki/
  记忆时也改为"目录内有 Markdown 才算有内容"，空 `en/` 不再压过有内容的 `zh/`。
- **测试**：新增 `test/asset-locale.test.js`；全套测试在 `LANG=en` 与
  `LANG=zh` 下均全绿（此前 3 例仅在 zh 环境通过）；覆盖率数字见
  `docs/coverage.md`。

## [0.112.0] - 2026-11-27

- **依赖条目可点击**：卡片详情的"依赖文件"与"依赖本文件"列表中的路径
  改为按钮，点击打开该文件详情（同一面板、深度重置、本地化可访问名），
  行号仍附着在路径上。沿依赖链双向浏览不再需要关闭面板。打开文件回调
  与环路径链接共用，统一命名为 `openFile`。
- **测试**：391 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.111.0] - 2026-11-27

- **循环路径可点击**：详情循环摘要中的其他文件改为按钮（当前文件保持
  纯文本），点击跳到该文件详情，带本地化可访问名。沿着 2–3 文件环浏览
  不再需要关闭面板再找卡片；依赖深度与焦点行为与其他卡片打开一致。
- **测试**：390 例全通过（hub 点击用例追加环内跳转断言）；覆盖率数字见
  `docs/coverage.md`。

## [0.110.0] - 2026-11-27

- **卡片详情展示循环摘要**：打开处于 import 环中的文件时，详情显示一行
  `⟲`，包含组大小；2–3 文件环追加代表性路径（`a.js → c.js → a.js`）。
  不必悬停列表徽章即可知道如何断环；无卡片的索引文件同样展示该行。
- **测试**：390 例全通过（hub 点击用例追加循环摘要断言）；覆盖率数字见
  `docs/coverage.md`。

## [0.109.0] - 2026-11-27

- **面板循环徽章附环路径**：循环成员的 `⟲` tooltip 对 2–3 文件环追加一条
  代表性最短闭合路径（`a.js → c.js → a.js`），与状态工具同语义。客户端
  本地计算 SCC 与最短环（12 节点上限），徽章保留组大小提示并给出可操作的
  断链点；更长环仍只显示组大小。
- **测试**：390 例全通过（循环徽章用例增加路径后缀断言）；覆盖率数字见
  `docs/coverage.md`。

## [0.108.0] - 2026-11-27

- **代表性环路径**：每个文件级 import 环新增 `sample` 字段——从组内字典序
  最小文件出发回到自身的最短环（并列按路径字典序，确定可复现），最多 12
  个节点（更长的环返回空数组而非超长路径）。`repowiki-status` 对短环渲染
  `e.g. a.ts → b.ts → a.ts`；Wiki 合成 prompt 同步列出该路径，架构章节可
  指向具体断链边。
- **测试**：390 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.107.0] - 2026-11-27

- **状态报告 warnings 有界**：文本报告最多打印 3 条告警，其余折叠为
  `… +N more (see the structured warnings array)`；结构化 `warnings` 数组
  仍保留全部条目。大量 internal 违规不再淹没报告其余内容。
- **测试**：389 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.106.0] - 2026-11-27

- **internal 违规告警有界化**：索引阶段 Go `internal` 可见性告警上限 50 条，
  其余折叠为一条汇总（`… N more … omitted (capped at 50)`），避免大量跨
  边界导入撑大 `index.json` 与状态输出。
- **测试**：388 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.105.0] - 2026-11-27

- **mermaid 指令与渲染器对齐**：Wiki 合成 prompt 现在要求使用
  `flowchart TD`/`flowchart LR`，把同模块/同层的节点包进 `subgraph` 块，
  并保持节点标签简短——与面板零依赖渲染器能力一致，生成图会渲染为分组
  框而不是降级为代码块。
- **测试**：387 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.104.0] - 2026-11-27

- **索引告警可展开**：统计行的告警计数改为按钮（`aria-expanded` /
  `aria-controls`），点击在统计行下方展开完整告警列表，tooltip 前三条之外
  的条目可原地阅读；悬停仍保留三条预览与展开提示，无告警时整块隐藏。
- **测试**：386 例全通过（告警用例扩展为展开/收起闭环）；覆盖率数字见
  `docs/coverage.md`。

## [0.103.0] - 2026-11-27

- **mermaid subgraph 分组**：`flowchart`/`graph` 中的 `subgraph 名称` …
  `end` 块渲染为带组名的虚线分组框（绘制在边与节点之下）；组内节点保持
  原形状，跨组边照常连接；空/异常的 subgraph 头部回退为普通组名。其余
  渲染行为不变（不支持的类型仍降级为代码块）。
- **基准复测（v0.103.0）**：1000 文件约 31ms / 69MiB、5000 文件约
  120ms / 97MiB（串行 32 / 124ms），较 v0.91.0 无回退；`docs/benchmarks.md`
  已更新。
- **测试**：386 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.102.0] - 2026-11-27

- **模块页新增高风险入口节**：确定性模块页（无模型调用）在末尾追加
  "高风险入口"节，列出模块内被最多不同文件依赖的前三个文件（重复 import
  只计一次、自引用忽略、并列按路径）；跨模块依赖方计入；模块无入边时
  不产生该节。主题页与模块页现在共享同一风险轴。
- **测试**：385 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.101.0] - 2026-11-27

- **合成 prompt 注入 fan-in 热点**：`repowiki-generate` 把被最多文件依赖的
  前五个文件（不同依赖方计数，与 `repowiki-status` 同口径）连同指令一起
  注入主题 prompt：描述改动风险热点时按路径引用，列表为空时不得虚构。
  架构章节获得可追溯的风险轴，而非泛泛而谈。
- **测试**：384 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.100.0] - 2026-11-27

- **高风险入口可点击**：单库视图的 fan-in chip 由静态文本改为按钮，点击
  打开对应文件的卡片详情（与卡片瓦片同一个详情面板，复用行索引），风险
  提示同时成为导航入口；chip 保留本地化可访问名 `path (N)`。
- **测试**：383 例全通过（客户端 fixture 的卡片瓦片选择器排除新的 chip
  形态）；覆盖率数字见 `docs/coverage.md`。

## [0.99.0] - 2026-11-27

- **面板展示索引告警**：`index.json` 带 `warnings` 时，单库统计行追加
  `索引告警 N`，悬停列出前三条并提示剩余数量；Go `internal` 越界导入与
  跳过文件提示在浏览时即可看到，无需跑 `repowiki-status`；无告警时隐藏。
- **测试**：383 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.98.0] - 2026-11-27

- **Go `internal` 可见性诊断**：索引阶段按 Go 工具链规则检查 import 边：
  `a/b/internal/...` 下的包只能被 `a/b/` 树内导入（根 `internal/` 对全
  仓库开放；嵌套 internal 取最内层边界）。违规导入仍建边，但去重后写入
  `index.json` 的 `warnings`（状态工具随即可见），把编译期错误提前到
  索引阶段暴露。
- **测试**：382 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.97.0] - 2026-11-27

- **面板展示高风险入口**：单库视图新增"高风险入口"行，列出 fan-in 前三
  的 file（按不同依赖方文件数，并列按路径），与状态工具 `Fan-in hubs`
  同口径；同一文件重复 import 只计一次、自引用忽略，索引无依赖边时整行
  隐藏。
- **测试**：381 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.96.0] - 2026-11-27

- **面板渲染 mermaid 图**：Wiki 页面与卡片正文里的 ```` ```mermaid ````
  围栏从源码文本改为内联 SVG。零依赖子集支持 `flowchart`/`graph` 的
  `TD`/`TB`/`LR`、节点形状 `[label]`/`(label)`/`{label}`/`((label))`/
  `[[label]]`/`{{label}}`/`[(label)]`、边 `-->`/`---`/`==>`/`-.->` 与
  `|label|` 边标签。布局确定性分层（环最多 12 层），主题走
  `--dsw-alias-*` 令牌；不支持的类型或无法解析的源码降级为原代码块。
- **测试**：380 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.95.0] - 2026-11-27

- **状态报告新增 fan-in hub**：`repowiki-status` 按"不同依赖方文件数"排名
  （`topDependents`，上限 10、并列按路径），渲染 `Fan-in hubs:` 行；同一
  文件重复 import 只计一次、自引用忽略，直接回答"改哪个文件风险最高"，
  不依赖调用图猜测。
- **测试**：379 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.94.0] - 2026-11-27

- **反向影响面**：`repowiki-cards` 新增 `dependents=true`，返回"谁 import
  了命中文件"（`imports=true` 的反向）；`depth=2..3` 按反向图 BFS 展开
  间接依赖方，回答"改动这个文件会影响谁"。输出 100 条有界并带截断标记，
  渲染用 `←`（直接）/`⇠`（间接）+ `N hops`，与正向共用 `depth` 参数。
- **面板依赖方区块**：卡片详情在"依赖文件"之外新增文件级"依赖本文件"
  列表；同一个 1/2/3 跳控件同时驱动两个方向（最小跳数优先、自身不列出、
  环收敛），`←` 直接依赖方、`↔` 双向导入、`⇠` 间接依赖方。
- **测试**：377 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.93.0] - 2026-11-27

- **面板依赖深度切换**：卡片详情的"依赖文件"区块新增 1/2/3 跳选择器。
  客户端 `importsForPath` 原先只走直接边，现与 `src/references.js` 同语义
  做 BFS 展开（最小跳数优先、命中文件不作为自身依赖、环收敛、100 条有界）；
  更深跳数用 `⇢` 加 `N hops` 后缀标注，直接依赖仍用 `→`，双向边仍用 `↔`；
  重新打开卡片自动重置为 1 跳。
- **测试**：374 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.92.0] - 2026-11-27

- **传递依赖展开**：`repowiki-cards` 的 `imports=true` 支持 `depth`
  （1–3，默认 1）。depth 2–3 按 BFS 遍历 import 图，每个可达文件只记录
  一次并取最小跳数，命中文件自身不作为依赖返回，环不会无限展开；条目
  新增 `depth` 字段，渲染用 `⇢` 与 `N hops` 标出更深跳数，直接依赖仍用
  `→`；输出仍有界（100 条 + 截断标记）。
- **测试**：373 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.91.0] - 2026-11-27

- **Go 多模块仓库**：任意层级 `go.mod`（单次最多 20 个）各自贡献 module
  前缀，子模块内部 import 解析到本子模块的包，不再被当作外部包；解析
  按目录更深、module 更长优先，根模块行为不变。Go `internal` 可见性
  仍未校验（已列入已知限制）。
- **基准刷新**：`docs/benchmarks.md` 按 v0.91.0 复测（1000 文件约 31ms、
  5000 文件约 119ms，默认 8 路读并发，附串行对照）。
- **测试**：371 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.90.0] - 2026-11-27

- **面板循环依赖徽章**：文件属于 import 环（size ≥ 2 的强连通分量）时，
  卡片瓦片与列表行显示 `⟲` 徽章；客户端用与 `src/cycles.js` 相同的迭代
  Tarjan 从 `index.edges` 计算，徽章带本地化可访问名与悬停提示
  （`参与 N 个文件的循环依赖`），浏览列表即可发现环。
- **测试**：370 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.89.0] - 2026-11-27

- **面板展示跳过文件数**：单库统计行在 `index.stats.skipped > 0` 时追加
  `跳过文件 N`，悬停提示说明原因（不可读或超过单文件上限）；为 0 时
  统计行不变。
- **测试**：369 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.88.0] - 2026-11-27

- **Svelte 单文件组件**：`.svelte` 复用 Vue 的脚本块提取，`<script
  context="module">` 与实例 `<script>` 均按源文件行号解析，标记与样式不产
  符号；`src/sfc.js` 导出名泛化为 `scriptBlockText`，面板展示 `Svelte`，
  卡片围栏用 `svelte`。
- **测试**：368 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.87.0] - 2026-11-27

- **面板搜索覆盖卡片正文**：卡片列表检索在标题/符号/标签/摘要/路径之外
  新增正文（职责、关键符号、陷阱）打分，只出现在正文里的词也能定位文件。
  正文与符号文本在构建行时一次小写（短字段同理），保证逐键搜索成本可控。
- **测试**：365 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.86.0] - 2026-11-27

- **跳过文件计数**：索引不再静默丢弃不可读或超大源码文件。
  `index.json` 新增 `stats.skipped` 与 `stats.skippedTooLarge`，warnings
  说明数量，`repowiki-index` 输出并在渲染中显示 `(N skipped)`，
  `repowiki-status` 在 Index 行追加 `N skipped`；取消未派发的位置不计入。
- **测试**：364 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.85.0] - 2026-11-27

- **Vue 单文件组件**：`.vue` 文件进入索引。新增 `src/sfc.js`，只保留
  `<script>` / `<script setup>` 块内容、其余行替换为空行，符号与 import
  提取直接复用 JS/TS 解析器且行号与源文件一致（template/style 不产符号、
  不建边）。相对导入、tsconfig 别名与工作区包名照常解析；符号规则同
  JS（函数/类/方法与导出常量），面板展示可读名 `Vue`。
- **测试**：362 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.84.0] - 2026-11-27

- **Hatch 导入根**：`pyproject.toml` 解析新增
  `[tool.hatch.build]` / `[tool.hatch.build.targets.wheel|sdist]` 的
  `packages` 列表，以包目录的父目录作为 Python 导入根（`src/foo` →
  `src`）；支持多行数组，单段包名（等于项目根）与 `..`/绝对路径忽略。
  至此 setuptools / PDM / poetry / Hatch 四类常见构建后端齐备。
- **测试**：359 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.83.0] - 2026-11-27

- **模块页标注循环依赖**：确定性模块页新增"循环依赖"节，列出与本模块
  双向 import 的模块；判断基于完整边计数（不受各方向前 8 条截断影响），
  无双向依赖的页面保持原样。
- **测试**：357 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.82.0] - 2026-11-27

- **面板详情展示出边**：卡片详情新增"依赖文件（import 级）"区块，与反向
  引用对称；有行号/符号的索引显示 `→ c.js:L3 (z)`，目标文件也反向引用
  本文件时用 `↔` 标记，两文件成环一眼可见；最多 8 行 + `另有 N 个`。
- **测试**：356 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.81.0] - 2026-11-27

- **循环依赖检测**：`src/cycles.js` 以强连通分量口径从 `index.edges`
  计算文件级循环依赖（迭代 Tarjan，深图不爆栈）；size ≥ 2 的组按大小
  降序输出，组内文件排序，并有界（10 组、每组 30 文件，均如实标记截断）；
  自引用与坏边忽略。
- **`repowiki-status` 报告循环**：新增 `cycles` 字段并渲染
  `Import cycles: a.ts ↔ b.ts (+N)` 或 `(none)`，不装额外工具即可看到
  架构环。
- **Wiki 合成注入循环上下文**：主题 prompt 携带最多 5 组循环（每组 6 个
  文件）并要求把循环依赖作为架构风险指出，无环时不得臆造。
- **测试**：355 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.80.0] - 2026-11-27

- **`repowiki-cards` 支持文件出边查询**：`imports=true` 返回命中文件的
  出边 `imports: [{path, line?, symbols}]`（附 `importsTruncated`，上限
  100 条），与 `references=true` 的反向引用互补。副作用导入保留（符号
  为空）、自引用跳过，结果按命中顺序再按边顺序输出，可复现。
- **测试**：346 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.79.0] - 2026-11-27

- **`repowiki-status` 展示模块依赖热点**：健康报告新增
  `moduleDependencies`（最多 10 条跨模块 import 边，来自
  `summarizeModuleRelations`），渲染为 `src → lib (3); …` 或 `(none)`，
  不必生成 Wiki 就能看到架构热点。
- **测试**：341 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.78.0] - 2026-11-27

- **Wiki 主题合成注入模块依赖**：主题 prompt 携带跨模块 import 边摘要
  （模块 → 模块计数，最多 15 条，由 `summarizeModuleRelations` 生成），并
  要求模型只使用这些方向。架构与数据流章节因此以索引进图为依据，减少
  臆造关系；同模块边忽略，按计数、路径排序，prompt 可复现。
- **测试**：340 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.77.0] - 2026-11-27

- **尖括号 include 经 include 根解析**：`#include <core/api.hpp>` 现在会被
  提取（标记为非相对），在 `include`/`src`/`inc` 根与项目根下查找，覆盖
  常见的 `-I include` 布局。引号形式仍先查文件目录；系统头
  （`<vector>`、`<stdio.h>`）因无索引文件命中仍不建边。宏与注释行保持
  忽略。
- **测试**：337 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.76.0] - 2026-11-27

- **模块页区分依赖方向**：确定性模块 Wiki 页把原来的“相关模块”拆成
  `依赖模块`（出边）与 `被依赖模块`（入边），各自按边数、路径排序并
  截断到 8 条，架构页可看出依赖流向。
- **测试**：337 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.75.0] - 2026-11-27

- **面板语言分布**：单库视图新增分布行（`JavaScript 12 · C++ 3 · …`），
  使用可读语言名、按文件数降序，最多 8 个 chip 并显示 `+N` 溢出计数。
  数据优先取 `index.stats.languages`，旧索引回退按文件行统计；只有一种
  语言时整行隐藏。
- **测试**：337 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.74.0] - 2026-11-27

- **Python `pyproject.toml` 自定义导入根**：索引读取
  `[tool.setuptools] package-dir`（内联表）、PDM 的字符串形式、
  `[tool.setuptools.packages.find] where = [...]` 与 `[tool.poetry]`
  的 `packages = [{ include = …, from = … }]`，把目录并入既有 `src`/`lib`
  约定的导入根。绝对路径与含 `..` 的值被忽略，坏配置不会把解析指到
  仓库外。
- **测试**：337 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.73.0] - 2026-11-27

- **面板可读语言名**：语言筛选与卡片详情展示 `JavaScript`、`C#`、`C++`
  等展示名，不再显示原始索引 id（`javascript`/`csharp`/`cpp`）。筛选值
  仍是原始 id，选择逻辑与读取不受影响；未知语言回退显示 id，不会消失。
- **测试**：335 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.72.0] - 2026-11-27

- **修复 Scala 多行签名**：参数列表跨多行、函数体在 `extends … {`、`=`
  或 Scala 3 `:` 之后开始的声明，现在得到正确的 `endLine` 与 `parent`
  归属。声明头扫描跟踪括号深度与字符串，忽略默认参数里的 `=` 与类型
  标注里的 `:`，并跨 `extends`/`with`/行尾 `(`/`,` 继续；缩进体以签名
  结束行（而非 `def` 行）为基准计算。
- **测试**：335 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.71.0] - 2026-11-27

- **嵌套 CMake 子项目**：参与技术栈汇总的不再只有根清单——任意层级
  `CMakeLists.txt`（嵌套上限 50 份）都会贡献 `find_package`：依赖次数
  累加进 `dependencyCounts.cmake`，技术条目保留各自清单来源，跨清单
  去重；项目名只取根清单，不随遍历顺序漂移。
- **测试**：334 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.70.0] - 2026-11-27

- **CMake 技术栈识别**：`CMakeLists.txt` 成为受支持的清单；`project()`
  提供项目名，`find_package(<Name>)`（大小写不敏感、去重）计入
  `dependencyCounts.cmake`。常见包映射到技术（Qt、Boost、OpenCV、Eigen、
  fmt、spdlog、Protocol Buffers、gRPC、Vulkan、SDL、SFML、GLFW、Catch2、
  GoogleTest、nlohmann/json、OpenSSL、zlib、SQLite、libcurl、libxml2、
  CUDA）；未知包只计数，不臆造技术名。
- **测试**：333 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.69.0] - 2026-11-27

- **C/C++ 支持（13 语言）**：`.c`、`.h`、`.cc`、`.cpp`、`.cxx`、`.hpp`、
  `.hh`、`.hxx`、`.ipp` 进入索引。符号覆盖 class/struct/union/enum/
  typedef（含匿名 typedef）、函数、类内方法、构造/析构、类外
  `Foo::bar` 定义与原型；支持多行参数、`static` 可见性与 `parent` 归属。
  引号 `#include "..."` 先按文件目录、再经 `include`/`src`/`inc` 根与
  项目根解析；尖括号系统头不建边，宏生成的声明按已知限制跳过。
- **测试**：332 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.68.0] - 2026-11-27

- **有界并行索引**：`buildIndex` 默认以 8 路并发读取/解析源码文件
  （`readConcurrency` 可覆盖，硬顶 16）。结果写回遍历位置，产物与串行
  完全一致（Git diff 顺序稳定）。取消后不再派发新文件，已在飞行的读取
  完成后仍上报 `aborted` 的部分结果。基准：本地同步 fs 上 5000 文件
  126ms → 120ms；结构收益主要在远程 `ctx.fs`（RTT 受限）场景。带延迟的
  fs 测试断言真实并发不超过上限，且并行输出与串行逐字段一致。
- **测试**：329 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.67.0] - 2026-11-27

- **修复 Ruby 裸 `require` 解析**：此前 `require 'billing/base'` 被当成
  相对当前文件目录，得到 `lib/billing/billing/base.rb`。现按 Ruby 的
  `$LOAD_PATH` 语义：先试任意层级 `lib/` 目录（按深度、字典序），再回退
  项目根，候选为 `.rb`、原路径与 `index.rb`。`require_relative` 与
  `./`/`../` 开头仍相对当前文件；聚合入口（`lib/billing.rb` require
  `billing/invoice`）现在能建边，外部 gem 仍不建边。
- **测试**：328 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.66.0] - 2026-11-27

- **SwiftPM 自定义 `path:` 目标**：索引解析 `Package.swift` 的 target
  声明（`.target` / `.executableTarget` / `.testTarget`，支持多行、字符串
  感知并剥离注释），`import 模块` 解析到声明目录下字典序最小的 Swift
  文件。显式声明优先于 `Sources/<Target>/` 约定（含声明目录无源码的
  情形）；依赖数组中的 `.target(name:)` 引用不会被误认为声明。
- **测试**：327 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.65.0] - 2026-11-27

- **Python 绝对导入依赖边**：`import a.b` / `from a.b import c` 在项目根
  与任意 `src`/`lib` 布局根下解析（候选根按深度、字典序排序，结果可复现）；
  `from 包 import 名` 优先同名子模块文件（`包/名.py`、
  `包/名/__init__.py`），符合 Python 导入语义；相对导入行为不变，
  标准库与第三方 import 仍不建边。
- **测试**：326 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.64.0] - 2026-11-27

- **JS/TS 别名与工作区依赖边**：索引额外读取 `tsconfig.json` /
  `jsconfig.json` / `tsconfig.*.json` 与嵌套 `package.json`（容忍 JSONC
  注释与尾逗号，上限 200 份配置）。非相对 import 依次解析：
  `compilerOptions.paths`（精确与 `*` 通配）与 `baseUrl` 绝对导入（就近
  配置优先，monorepo 包之间不串味）；工作区包名（`@acme/ui`、
  `@acme/ui/button`）经 `exports`（字符串/条件/数组回退/`./*` 通配）→
  `main`/`module`/`types` → `src/index`/`index`。外部包仍不建边；入口
  指向未索引构建产物时回退源码入口。
- **测试**：325 例全通过；覆盖率数字见 `docs/coverage.md`。

## [0.63.0] - 2026-11-27

- **修复大索引读取**：面板读取资产 JSON（index 与清单）改用 120 页预算
  （最多 60 万行），大型仓库的 index.json 不再因超过 12 页（6 万行）被
  截断成坏 JSON 而显示"读取失败"；仍超限时报
  `workspace-file/too-large`，而不是 JSON 解析错误。Markdown 页面保持
  12 页上限。
- **测试**：320 例全通过；覆盖率行 97.79%、分支 86.74%、函数 94.2%。

## [0.62.0] - 2026-11-27

- **卡片 prompt 注入项目上下文**：`repowiki-extract` 把项目名、技术栈
  （≤8）与模块路径（≤20）带进卡片 prompt，并要求模型在 `relatedModules`
  中复用这些真实模块路径，不臆造新名字。
- **Scala 3 `extension` / `given`**：extension 方法归属被扩展类型
  （不重复产出类型符号）；`given` 实例登记为 variable 并计算块范围，
  given 内的方法归属该实例。
- **测试**：319 例全通过；覆盖率行 97.84%、分支 86.84%、函数 94.2%。

## [0.61.0] - 2026-11-27

- **主题合成重试**：`repowiki-generate` 新增 `attempts`（1–3，默认 2）。
  模型抛错或返回空页面列表时按 200ms/400ms（上限 1s）可取消退避重试；
  结果报告 `attempts`/`retried`，渲染行标注重试次数。
- **索引变更计数**：`repowiki-index` 在 `reused` 之外新增 `added` /
  `changed` / `removed`，增量运行能看出实际变化（遍历被上限截断或取消时
  `removed` 恒为 0，因为未扫到不等于删除）。
- **重构**：`delayWithSignal` 收敛到 `src/util.js`，抽取与生成重试共用。
- **测试**：318 例全通过；覆盖率行 97.83%、分支 86.92%、函数 94.15%。

## [0.60.0] - 2026-11-27

- **Swift 本地 target 依赖边**：`import Core` 解析到
  `Sources/Core/`（兼容旧版 `Source/Core/`）的代表文件，SwiftPM 多 target
  仓库因此获得文件级依赖边、反向引用与面板引用行；子模块导入
  （`import Core.Models`）按首段解析到 `Core`；Foundation/XCTest 等外部
  模块不建边。
- **修复**：解析结果等于文件自身时不再产生自引用边（如 target 代表文件
  import 自己所在模块）。
- **测试**：317 例全通过；覆盖率行 97.8%、分支 86.7%、函数 94.14%。

## [0.59.0] - 2026-11-27

- **Wiki 增量合成**：`repowiki-generate` 比对 Wiki 清单里的卡片指纹与新增
  的已采信记忆指纹；两者一致且清单页面都在磁盘上时，主题合成直接跳过
  （不调用模型，返回 `skippedFresh: true`）；`force=true` 可强制重跑。
  卡片、记忆或页面缺失任一变化都会走正常生成，跳过时仍报告孤儿页。
- **记忆新鲜度告警**：`repowiki-status` 比对清单记忆指纹与当前已采信条目，
  Wiki 落后于记忆变化时给出告警，避免 `stale=0` 掩盖下一次会重新生成。
- **兼容**：Wiki 清单 v2 新增可选 `memoryDigest`（旧清单会重新生成一次）；
  module/all 粒度保持确定性，不做短路。
- **测试**：316 例全通过；覆盖率行 97.81%、分支 86.84%、函数 93.95%。

## [0.58.0] - 2026-11-27

- **面板符号搜索**：卡片列表搜索同时匹配索引里的符号名（权重次于标题），
  未生成卡片的文件也能用函数/类名定位；搜索框提示更新为
  "标题 / 路径 / 标签 / 符号"。
- **方法归属可见**：`repowiki-cards` 的命中方法带 `parent`（所属类型），
  输出 schema 与渲染文本都展示（如 `run (method:2, in Service)`）。
- **修复 Scala 3 缩进语法**：无花括号的类型体与 `def` 体（`object App:` /
  `def run(): Unit =`）按缩进推导范围，成员获得正确 `parent` 与
  `endLine`，不再被当成顶层函数。
- **测试**：314 例全通过；覆盖率行 97.8%、分支 86.76%、函数 94.05%。

## [0.57.0] - 2026-11-27

- **符号检索排序**：`repowiki-cards` 按名称匹配质量排序（精确 > 前缀 >
  子串；同一强度内公开/导出符号优先），文件按最佳命中排序，不再沿用
  索引顺序；无 query 时保持原有稳定顺序。
- **按语言检索**：`repowiki-cards` 新增 `lang` 与 `exportedOnly` 过滤；
  Repo Wiki 面板在索引含多种语言时显示语言下拉，按语言过滤卡片列表，
  切换工作区时自动清除失效选择。
- **测试**：311 例全通过；覆盖率行 97.8%、分支 86.83%、函数 94.02%。

## [0.56.0] - 2026-11-27

- **Wiki 章节 chips**：卡片详情"被 Wiki 引用"按章节渲染可点击 chip（最多
  4 个，溢出显示 `+N`）。点击 chip 打开页面并跳到该章节；页面标题按钮
  仍跳到首个被引章节；chip 的可访问名称带"页面 · 章节"上下文。
- **修复 Ruby 块范围**：heredoc 内容与 `=begin/=end` 块注释不再参与块
  配平（内容里的 `end` 不会提前截断 class/方法范围），注释掉的 def 不再
  被索引；`list << ITEM` 追加写法不会被误判为 heredoc 起始。
- **测试**：307 例全通过；覆盖率行 97.77%、分支 86.63%、函数 93.91%。

## [0.55.0] - 2026-11-27

- **Ruby 支持**：class/module/def（单例 `self.`、`?!=` 后缀、表达式体）、
  `attr_reader/writer/accessor` 属性与常量；`require`/`require_relative`/
  `load` 导入，本地 `.rb`/`index.rb` 建边；Gemfile 技术栈识别（Rails、
  Sinatra、RSpec、Puma、Sidekiq 等）。
- **Swift 支持**：class/struct/actor/enum/protocol/extension 与
  func/init/typealias；extension 方法归属被扩展类型；模块级 `import`
  （含 `@testable` 与子模块）只登记不臆造文件边；Package.swift 依赖识别。
- **Scala 支持**：class/case class/trait/object/enum 与 def；分组、
  `=>` 重命名、`as` 与 `._`/`.*` 通配导入经点分路径后缀解析；build.sbt
  依赖识别（Spark、Akka、Cats、ZIO、http4s、ScalaTest 等）。
- **范围变化**：索引语言 8 → 11；清单识别新增 Gemfile、Package.swift、
  build.sbt，`.rb`/`.rake`/`.swift`/`.scala` 纳入源码索引。
- **测试**：305 例全通过；覆盖率行 97.77%、分支 86.53%、函数 93.88%。

## [0.54.1] - 2026-11-27

- **面板运行快照**：单库统计行渲染知识清单里的最近一次抽取
  （`lastExtract`，含失败与重试数）；有失败时切换错误色并加
  `role="status"`，悬停可看本次运行时间。切换到无会话/无资产的工作区时
  快照清零，避免展示上一次的陈旧结果。
- **修复**：只生成过索引、尚无 `knowledge/` 目录的库此前会整页报读取
  失败，现按空卡片集呈现。
- **测试**：客户端用例覆盖快照行的成功态、失败态配色、清单缺失与
  "仅有索引"分支。

## [0.54.0] - 2026-11-27

- **抽取运行快照**：`knowledge/<locale>/_index.json` 升至 schema v2，新增
  `lastRun`（时间、抽取/跳过计数、孤儿、失败、重试、截断、并发、尝试次数、
  耗时）。
- **状态诊断**：`repowiki-status` 读取并展示 `lastExtract`，输出可读的
  "Last extract" 行；清单缺失时显示 none 而不报错。

## [0.53.2] - 2026-11-27

- **章节级 Wiki 深链**：点击 Wiki 引用会打开页面并滚动到首个被引用章节。
  客户端复用共享的标题锚点函数，Markdown 标题与滚动目标一致；手动选页/
  返回会清空目标章节。

## [0.53.1] - 2026-11-27

- **Wiki 引用可点击**：卡片详情"被 Wiki 引用"中的页面标题改为按钮，点击
  切换到 Wiki 页签并打开对应页面；按钮带 `aria-label`，兼顾键盘与读屏
  用户。桩 React 回归覆盖完整跳转链路。

## [0.53.0] - 2026-11-27

- **抽取失败重试与指数退避**：每个文件最多 `attempts`（1–3，默认 2）次模型
  调用；抛错或返回不可用结构时按 200ms/400ms（上限 1s）退避重试；模型明确
  `skip` 视为终态不重试。退避可被取消信号打断，取消不计入文件失败。
- **计划字段**：`repowiki-plan.json` 新增 `attempts` 并做归一化钳制；工具
  参数优先。结果返回生效的 `attempts` 与实际 `retried` 次数。

## [0.52.0] - 2026-11-27

- **有界并发抽取**：`repowiki-extract` 新增 `concurrency`（1–4，默认取
  `repowiki-plan.json` 或 1），并行派发多个文件的子代理。模型调用在资产锁
  之外，卡片写入仍逐张进入临界区；取消后不再派发新任务。失败清单按路径
  排序，保证并发运行输出可复现。
- **计划字段**：`repowiki-plan.json` 新增 `concurrency`，归一化并钳制到
  1–4；工具参数优先。

## [0.51.0] - 2026-11-27

- **C# / Kotlin / PHP 索引**：C#（class/interface/struct/record/enum、第一层
  方法与构造器）、Kotlin（class/data class/enum class/object/interface、fun、
  构造器、嵌套类型归属）、PHP（class/interface/trait/enum、方法与顶层函数）
  符号提取与可见性；支持语言增至 8 种。
- **本地依赖边**：C# `using`（global/static/别名）、Kotlin `import`
  （含 `.*` 与 `as`）经点分路径索引解析；PHP `use`（分组/function/const/
  别名）大小写不敏感匹配，字面量 `require`/`include`（含
  `__DIR__ . '/x.php'`）按文件相对路径解析。
- **Composer 技术栈**：`composer.json` 依赖映射到 Laravel、Symfony、PHPUnit、
  Doctrine、Guzzle 等，支持包名前缀兜底并计入 `dependencyCounts.composer`。

## [0.50.0] - 2026-11-27

- **Wiki 引用反查**：`repowiki-cards wikiReferences=true` 返回命中文件被哪些
  Wiki 页面/章节引用（`wikiReferences: [{path, slug, title, sections}]`，
  上限 100 条）；面板详情新增"被 Wiki 引用"，展示页面与章节；两者都只读
  `wiki/<locale>/_index.json`，不重读页面正文。
- **Wiki 清单 v2**：每页在页面级 `sources` 之外新增
  `sections: [{heading, sources}]`，支持章节级反查；v1 清单仍可读并降级到
  页面级。新增纯函数模块 `src/wiki-references.js` 与单测。

## [0.49.0] - 2026-11-27

- **行号级反向引用**：索引边新增 `line`（import/use/require 语句行），
  `repowiki-cards references=true` 的 `referencedBy` 升级为
  `[{path, line}]`（按路径、行号排序）；面板详情显示 `path:Lx`。
  schema v5 之前的旧索引自动降级为仅路径，不报错。
- **索引 schema v5**：`edges[].line` 正式入契约；读取兼容 v2–v4 并在内存
  补齐派生字段，下次索引写 v5。

## [0.48.0] - 2026-11-27

- **符号级反向引用**：`repowiki-cards` 新增 `references=true`，对每个命中符号
  返回"哪些已索引文件 import 了它"（`references: [{path, symbol, referencedBy}]`，
  上限 100 条并带 `referencesTruncated`）。语义为 import/use/require 级，
  不冒充调用图；跳过副作用导入与自引用。
- **面板反引用**：卡片详情新增"被引用（import 级）"区，直接由 `index.edges`
  计算，无额外远端读取；新增纯函数模块 `src/references.js` 与单测。

## [0.47.0] - 2026-11-27

- **多语言索引**：Go（函数/接收者方法/struct/interface/别名/导出常量）、
  Rust（fn/impl 与 trait 方法/struct/enum/type/const、`mod` 与嵌套 `use`）、
  Java（class/interface/enum/record、构造器与第一层方法），并记录可见性。
- **本地依赖边**：Go 按 `go.mod` module 前缀解析到包代表文件；Rust 按 crate
  根与 `mod`/`crate::`/`self::`/`super::` 约定解析；Java 支持通配符/static
  成员导入，经“类名索引 + 包后缀”匹配；外部或无法解析的 import 不建边。
- **JVM 技术栈**：识别 `pom.xml`、`build.gradle(.kts)`，Maven/Gradle 坐标
  映射到 Spring Boot、JUnit 5、Kotlin 等；artifact 未命中时按 groupId 前缀兜底。
- **Git 溯源与多语言产物**：索引新增 `git`（分支/提交，只读 `.git/HEAD`）与
  `stats.languages`，status 与面板展示；`repowiki-extract`/`-generate` 支持
  `locales: ['zh','en']`，按 `byLocale` 分语言汇报；索引 schema 升到 v4
  （v2/v3 仍可读并内存补齐）。另修复记忆 accept/reject 重写时标题重复的缺陷。

## [0.46.0] - 2026-11-27

- **工程门禁**：TypeScript `checkJs`（渐进式，新模块 `// @ts-check` + 公共
  `src/types.d.ts`）、ESLint flat config、`typecheck`/`lint` 脚本全绿。
- **CI 与安全**：Linux/macOS 阻塞 + Windows canary × Node 22/24；覆盖率门禁
  （行 ≥95、分支 ≥85、函数 ≥85）、密钥扫描、CodeQL、Dependabot、`npm audit`
  与 CycloneDX SBOM。
- **发布与文档**：发布脚本（干净工作区/WITH CHANGELOG/测试/本地 commit+tag，
  不 push）与 tag 发布工作流；CONTRIBUTING、SECURITY、runbook、兼容矩阵、
  基准文档；基准实测 1000 文件 32ms / 5000 文件 123ms。
- **ADR-0007**：数据版本（schema v3）与写入回读校验的契约说明。

## [0.45.0] - 2026-11-27

- **`.gitignore` 子集与零依赖 BM25 检索**：索引尊重根目录忽略规则并统计
  `ignored`；`repowiki-cards` 新增 `target=symbols|docs|all` 与 `includeMemory`，
  对卡片/Wiki/已采信记忆做排序检索并返回有界摘要。
- **模块级 Wiki 与清单**：`repowiki-generate` 支持 `granularity=theme|module|all`，
  模块页确定性生成（无模型调用），每次生成写 `wiki/<locale>/_index.json`。
- **陈旧/孤儿检测与诊断**：Wiki 页携带 `inputDigest`，面板按清单分组并标记孤儿；
  新增第 9 个只读工具 `repowiki-status` 汇总索引/卡片/Wiki/记忆/plan/锁状态。
- **面板体验**：搜索延迟过滤、分页（120 + 加载更多）、排序、标签筛选、Wiki 搜索、
  复制路径、页签语义与 `aria-live`、`/` 聚焦搜索。

## [0.44.0] - 2026-11-27

- **安全基线**：面板链接协议白名单（仅 `#`/`http(s)`/`mailto`，危险协议降级为
  文本）；所有资产写入改为写后回读校验，截断/后端正异常立即报错。
- **端到端取消**：索引与导入/导出接受 `AbortSignal`，取消时如实上报 `aborted`，
  索引取消不覆盖旧索引；长任务不再只能等超时。
- **索引 schema v3**：`module`/`modules` 正式入契约，v2 索引内存兼容读取，
  下次索引自动升级；记忆同名 slug 不同标题哈希共存、同标题覆盖并记录 `reviewedAt`。
- **锁范围收窄**（ADR-0005 修订）：extract/generate 的 LLM 派发在锁外，写前
  二次判定后在临界区写盘；index/import/edit/memory 保持整段锁。

## [0.43.0] - 2026-11-27

- **模块层级**（对齐 Qoder Repo Wiki，ADR-0006）：索引文件条目新增 `module`
  （目录归组，深度 ≤2），索引新增 `modules[]`（路径/父模块/直属文件数/直属符号数）。
  `repowiki-cards` 支持 `module` 过滤（含子模块）并返回模块树；
  `repowiki-extract` 额外写 `knowledge/<locale>/_index.json`（模块 → 卡片 slug
  的派生清单）。
- **可溯源引用**：卡片标注源文件与索引符号行号；Wiki 页面自动生成页级引用块、
  目录（≥2 节）与每节"章节来源"（相对路径 + 可选 `#Lx-Ly`）。LLM 返回的引用
  先经 `sanitizeSources`（卡片/索引白名单 + 合法行号形态）净化后渲染。
- **面板模块分组**：卡片页签新增"按模块分组"开关，兼容网格/列表视图；
  旧索引按文件路径实时推导模块。
- **并发写串行化**（phase-16 评审 O5，ADR-0005）：index/extract/generate/
  import/edit/memory 六个写路径按资产根进程内 FIFO 排队，并发工具调用或
  同目录多会话不再交错读-改-写；只读路径（cards/export/list）不加锁。
  已知限制（仅进程内、LLM 派发期间持锁）见 ADR。

## [0.42.0] - 2026-11-27

- **空状态优化**：改进空状态消息的样式和间距，使其与整体 UI 更协调一致。

## [0.41.0] - 2026-11-27

- **卡片列表样式优化**（用户反馈"列表视图下宽度太长了"）：将卡片行从带边框和圆角的卡片风格改为紧凑列表风格，用细化的 0.5px 下分隔线替代外接边框，减少内外边距，消除视觉上的厚重感，更符合传统列表视图的使用体验。

## [0.40.0] - 2026-11-27

- **知识卡片自动滚动到详情面板**（用户需求）：点击卡片后，详情面板会平滑滚动到页面视图中心，让用户能看到完整内容。已在测试环境中做防护。

## [0.39.0] - 2026-11-27

- **空状态主机模式**（practices.md 要求“复制宿主页面的间距、字号、颜色”）：
  空状态容器现在用 `padding: 48px 20px`，文本居中，颜色为
  tertiary 14px/1.6 行高。替代原有简略的 muted 段落。
- **卡片的统计文案使用 tertiary**（practices.md）：统计项字体改为 11.5px，
  行高 16px，颜色 tertiary，替代 12px/secondary。同时卡片行主文本权重从 600
  降到 500，间距从 10 改到 16 以匹配 host 行模式。

## [0.38.0] - 2026-11-27

- **总览行政用官方管理列表模式**（practices.md 点名：管理列表以插件管理页
  为参照）：对照其 CSS——无边框行 + 0.5px 发丝分隔（border-l2、末行无）、
  padding 12px 2px、间隔 16、标题 13.5px/500、次行等宽字体 11.5px/16 配
  label-tertiary。我们的行原为卡片片（边框+圆角+外边距）。--dsw-font-mono
  在官方样式中无 CSS 定义，官方页亦靠其回退链——直接使用同款回退链；
  label-tertiary 纳入漂移自检（15 令牌）。

## [0.37.0] - 2026-11-27

- **页面结构对齐参照页**（滚动 bug 开启的布局审计继续）：最近兄弟页
  （任务管理，与我们的入口同处自动化区）用两层结构——全宽滚动器 +
  内层居中 960 内容列，“让滚动条贴到视口边”。我们单层 960 滚动器在宽
  屏上滚动条浮在内容列内侧。重构为官方同款：外层掌滚动
  （height:100%、overflow-y/x、scrollbar-gutter:stable）、自绘底色
  （--dsw-alias-bg-base）与基础排版（14px/1.6）；内层 960 列 + 响应式
  clamp 内边距 + 48px 底部留白 + 顶条留白令牌。DOM 回归断言两层结构。

## [0.36.0] - 2026-11-27

- **macOS 顶部窗口条留白**（v0.35 布局审计同批）：官方 AppFrame CSS
  注明入口页需以 `--dsh-frame-top-clearance`（darwin 48px）补顶部留白，
  否则首行内容被交通灯/侧栏开关压住；两个参照页（插件管理/任务管理）
  均如此。页面根现用 `padding-top: calc(24px + var(--dsh-frame-top-clearance,
  0px))`（无该变量的平台回退原 24px），底部留白加宽到 48px 对齐参照页。
- 漂移自检扩展到 `--dsh-*` 布局令牌（定义源加布局包 AppFrame CSS），
  现追踪 13 个令牌（9 alias + 4 尺寸）。

## [0.35.0] - 2026-11-27

- **修复面板页面无法滑动**（用户反馈"知识库页面无法滑动，导致信息无法
  看见"）：页面根原为普通带 padding 的 div，而宿主 mainPanel 是
  `overflow:hidden` 的 flex 列——页面须自管滚动（从官方 AppFrame CSS 与
  PluginManagerPage 参照页实证：两者用 `height:100%` + `overflow-y:auto`，
  "头部与内容共用一个滚动器"）。页面根现带 `height:100%; box-sizing:
  border-box; overflow-y:auto; overflow-x:hidden`，整个面板可滚动。
  回归断言锁住根元素的滚动声明。

## [0.34.1] - 2026-11-27

- 修复 react-parity 导入 verify 脚本的进程退出副作用：CI 无 asar 时
  exit 3 杀死测试文件；本地有 asar 时 exit 0 造成**假通过**（断言从未
  执行）。脚本现在仅作入口运行时执行 main()，import 无副作用。
  （v0.34.0 tag 落在红提交上，修正在此版。）

## [0.34.0] - 2026-11-27

- **React 版本一致性守卫**（`test/react-parity.test.js`）：`npm outdated`
  提示 react 18.3.1 → latest 19.3.1，不盲目升级——解析 app.asar 证实
  宿主前端 bundle 内嵌 **React 18.3.1**，与 devDependency 精确一致
  （测试侧即运行时同一 API 面，无需追 19）。宿主未来升级分叉时本地
  测试转红，CI 无 asar 时跳过（同令牌漂移自检策略）。
- 核验 `npm audit`：0 漏洞（v0.17.0 的供应链声明历次刷新后仍成立）。
- 141/141。

## [0.33.0] - 2026-11-27

- **O7 卡片 slug 碰撞不再静默覆盖**（v0.32 评审延后项）：cardSlug 把
  'src/a b.js' 与 'src/a-b.js' 都归一为 'src-a-b'，第二张卡曾直接覆盖
  第一张。writeCard 现在先读目标文件 frontmatter，若记录的源路径不同则
  改用源路径 8 位哈希后缀写盘（后缀稳定，重跑不漂移）。
- **O2 复制失败携带原因**（同延后项）：copyTree 返回有界 failed 列表
  （{path, reason}，前 20 条），export/import 工具经 schema 透传并在
  render 中列出——“50 skipped”不再需要猜是哪些、为什么。
- 两条新回归（碰撞双卡落盘/失败明细），140/140。

## [0.32.0] - 2026-11-27

Host 侧独立代码评审（子代理通读全部 22 个 src 模块；记录见
`docs/checkpoints/phase-16-code-review.md`）发现的应修项与观察项：

- **F1 Wiki slug 净化**：LLM 输出的 page.slug 曾直接 posix.join，`../../../../tmp/evil` 可写出资产目录；新增 `wikiSlug()` 白名单净化（在 `wikiPath` 内强制，所有调用方自动安全）+ schema pattern 双重防线。回归：穿越尝试落盘仍在 wiki/<locale>/ 内。
- **F2 `hint` 字段入 schema**：六个工具的降级分支返回 hint 但 schema 声明 `additionalProperties:false`——宿主一旦校验 execute 结果则降级全塌。零行为变更。
- **F3 取消语义**：extract 每次派发子代理前检查 `exec.signal.aborted`（此前超时后继续派发并把剩余候选逐个记 failed，白烧 LLM 成本）；generate 写盘前同检；均返回 `Cancelled: …` 提示。
- **F4 capped 不再撒谎**：文件预算对全部路过文件计数（非仅源码），非源码文件耗尽预算时旧实现 `capped:false` 谎报完整；现以显式 stopped 标志求真。
- **F5 import 描述修正**：overwrite 一直是“合并不删除”，描述却写成 replace；改为如实描述（无行为变更）。
- **F6 memory accept/reject slug 白名单**：write 路径本有 slugifyMemory 净化，accept/reject 没有；不符合白名单的 slug 返回 invalid + hint。
- **O1 copyTree 深度上限 24**、**O6 maxFiles/limit 下界钳制**、**O8 提取 prompt 改四反引号围栏**（源码含 ``` 可逃逸三反引号注入指令）。
- 死代码清理（listKnowledgeFiles 无生产调用方、writeIndex 未用变量）；index.json 的 sizeBytes 注释更正为字符数（字段名保留兼容）。
- 共 4 条新回归（穿越/取消/预算诚实/白名单拒绝），138/138。

## [0.31.0] - 2026-11-26

- **记忆与 Wiki 详情的焦点对齐**（v0.30.0 卡片详情焦点管理的推广）：
  打开记忆条目或 Wiki 页面时聚焦返回按钮，关闭（按钮或 Escape）归还
  焦点。发现并处理了一个结构性差异：这两类详情是整面板切换，触发的列表
  条目会被卸载——直接归还焦点是对已分离节点的空操作（第一版测试恰好
  抓到）。归还前现在检查 `isConnected`，失联回退到对应页签按钮。
- 焦点助手（openWithFocus/closeWithFocus）被三类详情流复用。
- 真实语料 fixture 补记忆条目（memory/zh/ui-panel-state-machine.md），
  使记忆详情的 DOM 焦点回归可测（136/136）。

## [0.30.0] - 2026-11-26

- **详情焦点管理**（v0.27.0 评审留下的无障碍观察项）：打开卡片详情时焦点
  移到详情的关闭按钮（键盘用户可直接操作）；经按钮或 Escape 关闭后焦点
  归还触发的瓦片。焦点捕获用鸭子类型而非全局 `HTMLElement`（DOM 测试
  harness 只注入了 document，`instanceof` 会抛错并被 guard 吞掉——发布前
  测试失败先抓到了这一点）。
- 新增焦点回归测试（真实 click→聚焦关闭按钮→Escape→焦点归还瓦片），
  135/135。

## [0.29.0] - 2026-11-26

- 新增**版本一致性守卫**（`test/pack.test.js`）：package.json 版本必须与
  两份 CHANGELOG 的最新版本条目一致——只 bump 版本不写 changelog 从此是
  测试失败而非静默漂移。（它第一次运行就抓到了自己：我先 bump 了版本、
  还没写条目，套件直接红。）
- README（双语）测试计数 122 → 133（v0.23 以来已过期）。

## [0.28.0] - 2026-11-26

- **圆角改用宿主令牌**（practices.md 要求“复制同类宿主页面的间距/字号/
  行模式”）：审计官方 Plugin Manager 页 CSS，其控件与卡片用
  `--dsw-radius-sm/md`（8/12px，定义于主题包 base.css）。面板硬编码圆角
  现已令牌化：按钮/输入框/代码块 → radius-sm（原 8）、卡片/详情/页容器 →
  radius-md（原 10，与官方卡片圆角一致）、小徽章 → radius-xs（原 4）；
  状态点 50% 与标签 999 保持全圆。令牌缺失时回退原值。
- **漂移自检覆盖全部 `--dsw-*` 令牌**（不再只查 alias：现有 9 alias +
  3 radius = 12 个）。规则分两类：alias 颜色/语义令牌须有深色重定义，
  尺寸令牌存在即可；收集正则不再把文档注释里的 `var(--dsw-alias-*)`
  通配写法误当令牌。

## [0.27.0] - 2026-11-26

- **修复空结果文案 bug**（UI/UX 评审发现）：筛选或搜索为 0 行时面板固定
  渲染“该文件尚未生成知识卡片”，在“已生成/待更新”筛选或搜索无匹配时
  误导用户。现按上下文区分文案（emptySearch 带查询插值、按筛选的
  emptyCards/emptyGenerated/emptyDone/emptyStale），并加回归测试。
- 总览模式在页面重新可见时也刷新统计（此前只刷单库视图，生成完回来
  看到旧数字）；单库未选工作区补引导文案。
- 主按钮文字换官方 `--dsw-alias-label-on-color` 令牌（深色按钮底变浅时
  对比度有对应重定义），漂移自检随之覆盖 9 个令牌。
- test/icon.test.js 增加全出血 tile 断言（补评审指出的测试盲区；居中
  22x22 卡片与官方 forge-bundle 样本一致，保留）。
- 新增 `docs/checkpoints/phase-14-ux-review.md` 评审记录与保留观察项。

## [0.26.0] - 2026-11-26

- **图标对齐官方处理**（按 dsh-doc artwork.md 与两个官方一级样本）：
  - `icon.svg`：原为 96×96 全出血蓝色圆角 tile（官方明令 Plugin Manager
    自绘外框，插件不要画背景）；重绘为 36×36 画布 + 22×22 渐变卡片
    （#69B9FF→#324DE2，与官方 forge-bundle 图标同款）+ 白色书本字形。
  - 侧栏图标 `RepoWikiIcon`：由 96×96 固定配色改为 24×24 currentColor
    描边字形（fill=none），随侧栏文字色适配明暗主题。
- 语料 fixture 中图标描述同步；新增 `test/icon.test.js` 结构守卫
  （132/132）。图标渲染效果仍需用户在浏览器确认。

## [0.25.0] - 2026-11-26

- 新增**插件管理页详情页**（按官方 plugin-details 约定）：`docs/detail/DETAIL.md`
  （+中文版）恰为一行图片引用，配一张 text-free 640×300 特性图（源文件→符号
  索引→知识卡片与 Wiki 页面；无文字/字体/脚本/远程资源，自含浅色背景在深色
  主题也可读）。`locale/{en,zh}.json` 声明 `meta.detail`；`files` 只装
  `docs/detail`（内部 ADR/检查点文档不进包）。
- **元描述补全**：两语 `meta.description` 现含触发位置（侧栏“Repo wiki”入口）、
  新增的 LLM 请求（extract/generate 继承会话模型的子代理）、数据位置与关闭
  插件的影响。
- 测试更新：pack 守卫要求详情页三文件入包且内部文档仍排除；locale 守卫
  覆盖详情文档单行图片形式与 SVG 约定（130/130）。

## [0.24.0] - 2026-11-26

- 新增**打包完整性守卫**（`test/pack.test.js`）：跑 `npm pack --dry-run`
  断言产物含全部运行时文件（入口、客户端、loader patch、图标、双 locale、
  全部 `src/*.js`）并排除开发目录；`files` 字段手工维护，新增模块忘加时
  CI 此前无法发现。
- **漂移自检脚本自身被测试**（`test/verify-host-tokens.test.js`）：在临时
  目录构造合成 asar（真实 header + offset 布局），用 `DSH_APP_ASAR` 指向
  夹具，驱动 pass / 缺失 / 无深色三条路径——该脚本此前只在有真 asar 的
  机器上运行（CI 永远跳过），解析逻辑零回归保护。

## [0.23.0] - 2026-11-26

- **门面双语补齐**：新增 `CHANGELOG.zh-CN.md`（本文件，摘要式镜像并与英文版
  互链）；`README.zh-CN.md` 从 v0.20.0 同步到最新（令牌实证、漂移自检、npm
  scripts、目录结构、用例数）。
- **插件元数据更正**：`locale/{en,zh}.json` 的 meta 描述停留在 Phase 1
  （"提供 repowiki-index 与 repowiki-cards"），现改为完整能力描述并列出全部
  八个工具名。
- 新增 `test/locale.test.js` 门面一致性守卫（123/123）。

## [0.22.0] - 2026-11-26

- 新增**宿主主题令牌漂移自检**：`scripts/verify-host-tokens.mjs`
  （`npm run verify:host`）解析本机 app.asar，核对 client.js 引用的每个
  `--dsw-alias-*` 令牌在 dsh 自带 CSS 中仍有定义且有深色变体
  （`body[data-ds-dark-theme]`）。令牌清单从 client.js 自动收集，不过期；
  CI 无 app.asar 时 exit=3 跳过而非失败。同步落地为
  `test/host-tokens.test.js`（本机断言、CI 跳过）。
- 补 npm scripts（`test` / `test:coverage` / `verify:host`）；README 补
  升级回归流程说明。

## [0.21.0] - 2026-11-26

- **主题令牌从二手推断升级为一级实证**：直接解析 app.asar 提取官方
  CSS——`dsh-client-ui-theme/src/styles/design-platform.css` 定义全部 264
  个 `--dsw-alias-*` 令牌（每个含深色重定义），主前端壳消费 348 处，
  本插件 7+1 个令牌全部命中；方法与证据见 ADR-0004 §5。
- 修复用户反馈的"灰蓝状态点难区分"：已生成点改用语义令牌
  `state-done-primary`（紫 rgb(124,58,237)），smoke 测试加回归断言。

## [0.20.0] - 2026-11-26

- 新增**故障注入 DOM 测试套件**（8 例）：ErrorBoundary 在真实 React 下
  正向验证（渲染期抛错显示内联错误而非白屏）；加载失败→错误码插值+重试；
  单库无会话/无资产分支；总览逐工作区失败行；损坏远端结果不殃及整页；
  谎报 eof 的分页仍然正确。
- DOM 测试机械抽取为 `test/lib/dom-harness.mjs`。

## [0.19.0] - 2026-11-26

- 修复 `repowiki-extract` 结果缺 `skippedManual`/`orphaned` 字段
  （output schema 声明为必填，渲染层会打印 "undefined"）。
- 新增 LLM 执行路径的**契约级子代理桩**测试（`test/tool-llm.test.js`）：
  activation 契约、首轮写卡带 `sourceDigest`、digest 命中跳过、人工编辑
  保护、失败上报、Wiki 消费卡片；覆盖率 89.9% → 94.7%。

## [0.18.0] - 2026-11-26

- **多工作区总览**（ui-plan 切片 2）：面板默认总览模式，每行一个工作区
  （标题/路径/状态点/统计/最近索引时间），点击下钻单库视图。技术顾虑
  消解：每条目自带 `sessionIds`，复用既有按会话 scope 的读取通道。
- 修复主按钮 style 警告（shorthand/longhand 混用）。

## [0.17.0] - 2026-11-26

- 新增**真实 React 18 + jsdom 的 DOM 集成测试**：对真实 DOM 派发真实
  change/click/keydown 事件（React 合成事件根委托），闭合"点击无反应"
  的复现盲区——事件级接线验证健康。
- 新增 devOnly 测试依赖（react/react-dom/jsdom，均 MIT），不改变零运行
  时依赖形态；CI 安装 dev 依赖后跑套件。

## [0.16.0] - 2026-11-26

- 新增**真实语料客户端回归测试**：把本仓库自产的 `.dsh-repowiki/` 卡片
  灌入面板渲染路径（LLM 生成内容与手写 fixture 形态不同）。
- 新增**事件处理器兜底**：React 错误边界不捕获事件处理器抛错（表现为
  "点击无反应"），所有交互处理器包 guard，抛错/拒绝转为可读状态行。
- 新增 **CI 门禁**（`.github/workflows/tests.yml`，Node 22/24）：补齐方案
  §10.3-8 最后一条硬条款。

## [0.15.0] - 2026-11-26

- DRY 重构：`cwdOf`（8 处重复）、`resolveTarget`（2 处）、frontmatter
  编解码（3 处）收敛进 `src/util.js`，行为字节一致，净 −139 行。

## [0.14.0] - 2026-11-26

- 面板级 **ErrorBoundary**：渲染期抛错显示内联错误行而非白屏整个 main
  slot；`componentDidCatch` 以 `repowiki:` 前缀写 console。

## [0.13.1] - 2026-11-26

- 修复深色模式：此前使用的 `--dsw-alias-color-*` 令牌名在本机构型不存在，
  所有 `var()` 回退浅色字面量（用户看到的 wiki `a.js` 白底白字）。换成
  官方页面验证过的令牌名（label/bg-layer/border/state-*）。

## [0.13.0] - 2026-11-26

- Wiki 与记忆详情改为**排版文字渲染**（零依赖 Markdown 渲染器）而非源码；
- 卡片详情展示完整正文（摘要之外的用途/关键符号/陷阱/关联模块）。

## [0.12.0] - 2026-11-26

- 面板新增 **Memory 页签**：列出记忆条目（状态徽章着色）并查看原文；
- 会话记忆三出口齐备（生成汇总 v0.10.0 / 检索 v0.11.0 / 面板本版）。

## [0.11.0] - 2026-11-26

- `repowiki-cards` 新增 `includeMemory`：把已 accept 的记忆条目按同一查询
  附到检索结果。

## [0.10.0] - 2026-11-26

- `repowiki-generate` 读取已 accept 的记忆作为项目约定/决策注入综合
  prompt，输出 `memoriesRead` 报告用量。

## [0.9.0] - 2026-11-26

- 新增 `repowiki-edit`：手工卡片 `create`（路径可不在索引内）与 `update`，
  均置 `manuallyEdited` 停止自动刷新；纯文件操作无模型调用。

## [0.8.1] - 2026-11-26

- 修复面板读取：`remote.workspaceFiles` 返回 RemoteResult
  （`{ok,value}`/`{ok:false,error}` 且永不 reject），此前直取 payload 导致
  全部加载失败（伪 `workspace-file/bad-read`）。

## [0.8.0] - 2026-11-26

- 新增 `repowiki-memory` 工具：会话知识写入 `.dsh-repowiki/memory/<locale>/`
  + `list`/`accept`/`reject` 审核闭环；偏离方案（投影候选→模型显式写入）
  记录于 `docs/checkpoints/phase-4a.md`。

## [0.7.0] - 2026-11-26

- 面板切片 3：**待更新检测**（digest 不一致的卡片计入提示并加 Stale 筛选）
  与 **Wiki 页签**。

## [0.6.0] - 2026-11-26

- 新增 `repowiki-export`/`-import`：整树快照备份/还原，overwrite 保护、
  index 兼容校验；Phase 3 完成。

## [0.5.1] - 2026-11-26

- 人工编辑保护（`manuallyEdited` 卡片不被自动刷新）与孤儿卡计数上报。

## [0.5.0] - 2026-11-26

- **内容 digest 增量重建索引**（sha256 前 12 位；未变化文件复用旧条目）；
- 卡片 frontmatter 记 `sourceDigest`，源文件变化才刷新。

## [0.4.0] - 2026-11-26

- Repo Wiki 面板切片 1：统计、全部/已生成/未生成筛选、搜索、网格/列表、
  卡片详情（Escape 关闭）。

## [0.3.0] - 2026-11-26

- Web 客户端模块：侧栏入口 + 独立页面 + 四个生成动作（经
  `ctx.uiWorkspace.startSession`，ADR-0004）。

## [0.2.0] - 2026-11-26

- 新增 `repowiki-extract`（每文件一个 spawn 子代理生成知识卡片）与
  `repowiki-generate`（消费卡片综合 Wiki）+ 项目级 plan 配置。

## [0.1.0] - 2026-11-25

- `repowiki-index`（零 LLM 确定性符号索引）+ `repowiki-cards`（跨会话检索）；
- 零 npm 运行时依赖、零构建工具。
