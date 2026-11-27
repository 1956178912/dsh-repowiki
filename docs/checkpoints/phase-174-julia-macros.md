# 检查点：Julia 宏修饰声明（phase-174）

- 日期：2026-11-28
- 合入版本：v0.198.0
- 目标：v0.196 的 Julia 支持只识别行首 `struct`，`@kwdef struct` /
  `Base.@kwdef mutable struct` 这类常见声明被漏掉，且宏前缀会让块配平
  少计一层；`@enum` 定义的枚举类型与值完全不产符号。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/symbols.js`：
  - `structRe` 支持可选的模块限定宏前缀
    （`(?:\w+(?:\.\w+)*\.)?@\w+\s+`），普通 struct 保持第二分支；
  - `juliaBlockDelta` 的块开关键字识别同样允许宏前缀，`@kwdef struct`
    能正确开块；
  - `enumRe` 匹配 `@enum Name[::Base] value…`，登记枚举类型（class）与
    枚举值（variable，`exported: false`，经类型访问）。
- `src/schema.js`：`INDEX_PARSER_VERSION` 4 → 5（Julia 提取规则变化）。
- `test/symbols.test.js`：新增 `@kwdef struct`、`Base.@kwdef mutable
  struct`、`@enum Color::UInt8 red green blue` 夹具，断言块范围、种类、
  枚举值行号与导出过滤。

## 语义边界

- 宏前缀只接受“模块限定 + 单词宏”形式；复杂宏调用（带参数）不展开。
- 枚举值按空白拆分，显式赋值（`red = 1`）取名称；类型基（`::UInt8`）
  不产符号。
- 枚举值不是独立导出（Julia 通过 `Color.red` 访问），统一
  `exported: false`；类型本身按 `export` 判断。
- 该版本不改变 `include` 解析或 `Project.toml` 元数据。

## 验证

- `LANG=en node --test --test-name-pattern="Julia" test/symbols.test.js`：
  2 例通过。
- 全量门禁：`npm test`（双语言 593/593）、`coverage:check`（行 98.13 /
  分支 86.87 / 函数 95.53）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
