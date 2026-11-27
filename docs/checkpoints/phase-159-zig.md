# 检查点：Zig 支持（phase-159）

- 日期：2026-11-28
- 合入版本：v0.183.0
- 目标：Zig 在系统工具、游戏与 WASM 项目中增长迅速，项目此前完全没有
  Zig 符号与依赖数据：`fn`/容器类型无法检索、`@import("x.zig")` 不形成
  边，`build.zig.zon` 的项目元数据也不进入技术栈。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/symbols.js`：
  - `zigCodeLines`：去 `//`/`///`/`//!` 行注释（Zig 无块注释），把
    `\\` 多行字符串行的剩余内容清空，字符串/字符字面量内的 `//` 不截断；
  - `zigBraceDelta`：字符串/字符字面量感知的花括号增量；
  - `zigBlockEnd`：块体按花括号配平，块开始前的 `;`（`extern fn` 原型、
    单行常量）或单行闭合块（`fn f() void {}`）返回声明行；
  - `extractZig`：顶层容器类型（`struct`/`enum`/`union`/`opaque`，含
    `pub`/`extern`/`packed`/`union(enum)`）、`fn`/`extern fn`/`export fn`、
    具名 `test "…"`、顶层常量/变量；容器成员在容器体一层识别，方法带
    `parent`，嵌套容器独立成类型；`@import`/`@cImport`/`@This` 绑定跳过，
    函数体与 `comptime` 块内的局部量不登记。
- `src/deps.js`：`maskZigLine`（注释/多行字符串截断、字符串内容掩码）
  与 `extractZigImports`（`@import("x.zig")`，字符串内伪引用不提取；
  `@cImport`/`@cInclude` 不提取）。
- `src/indexer.js`：`resolveZigSpecifier` 以引用文件所在目录为基准归一，
  拒绝绝对路径、反斜杠与越界路径；`std`/`builtin`/`root` 等不以 `.zig`
  结尾的模块名不建边。
- `src/schema.js`：`zig → zig`，`MANIFEST_FILES` 增加 `build.zig.zon`。
- `src/stack.js`：`zonSectionKeys`（ZON 对象直接子键扫描，跳过字符串与
  `//` 注释）与 `zigZonInfo`（兼容 `.name = .demo` 枚举字面量与旧版
  `"demo"` 字符串），产出项目名、版本与 `dependencyCounts.zig`。
- `src/prompts.js` 围栏、`client.js` 展示名补 `zig`。
- 测试：
  - `symbols.test.js`：容器/成员归属、单行块体、`extern` 原型、注释与
    多行字符串屏蔽、`union(enum)`、测试块、`@import`/`@This` 跳过；
  - `deps.test.js`：`@import` 引号形式、行/文档注释与字符串内伪引用、
    `@cImport` 不提取；
  - `stack.test.js`：`build.zig.zon` 枚举/字符串项目名、版本与依赖直接
    子键计数（嵌套 `.url`/`.hash` 不误计）；
  - `indexer.test.js`：同目录、子目录与 `../` 相对解析，`std`/`builtin`
    不建边，符号进入索引，`build.zig.zon` 元数据进入技术栈。

## 语义边界

- Zig 的 `@import` 路径恒相对于**引用文件**（不是模块根），因此解析只用
  `fromRel` 目录；不接受绝对路径与反斜杠，越界路径直接拒绝。
- 包名导入（`std`、`builtin`、`root`、`build.zig` 通过 `addImport` 注入
  的模块名）没有静态文件证据，不猜测。
- `const std = @import("std")`、`const Self = @This()` 是模块别名而非业务
  符号，跳过可避免每个文件都出现 `std` 噪声；被跳过的 `@import` 仍通过
  deps 提取形成依赖边。
- 匿名 `test {` 不产符号（无检索价值）；具名测试以描述文本为符号名，
  `exported=false`。
- 容器成员只在其类型体的一层识别；`comptime` 块、函数体与更深嵌套里的
  声明不登记，避免局部量淹没符号表。
- `build.zig.zon` 只统计 `dependencies` 的直接子键，不展开依赖自身的
  `.url`/`.hash`/`.path`，也不解析传递依赖。

## 验证

- `LANG=en node --test --test-name-pattern="Zig" test/symbols.test.js test/deps.test.js test/stack.test.js test/indexer.test.js`：
  4 例通过。
- 全量门禁：`npm test`（双语言 570/570）、`coverage:check`（行 98.12 /
  分支 86.79 / 函数 95.37）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
