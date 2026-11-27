# 检查点：Elixir `.exs` 测试/脚本索引（phase-155）

- 日期：2026-11-28
- 合入版本：v0.179.0
- 目标：v0.177.0 只索引 `.ex`，`.exs` 测试文件不进索引，导致
  `repowiki-impact` 无法列出受影响的 Elixir 测试（测试文件里的 alias
  也不产生依赖边），影响面分析对该生态缺失验证路由。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/schema.js`：`EXTENSION_LANGS` 增加 `exs → elixir`。
- 测试：
  - `test/indexer.test.js` Elixir 夹具新增
    `test/my_app/accounts_test.exs`（`use ExUnit.Case` + `alias MyApp.Accounts`），
    断言：elixir 文件数为 8、测试文件到源模块的 alias 边（行 3）、外部
    `ExUnit.Case` 不建边、总边数 5。
  - `test/test-files.test.js` 常见测试路径新增 `test/my_app/accounts_test.exs`
    与 umbrella 的 `apps/web/test/web/router_test.exs`，固定测试识别。

## 语义边界

- `.exs` 包括测试、脚本与 `config/*.exs`：它们都是项目内可执行代码，
  统一索引；`repowiki-impact` 仅把 `test/` 目录与 `*_test.exs` 归为测试，
  其余按普通源码参与影响面。
- 根 `mix.exs` 仍由 `MANIFEST_FILES` 识别为清单，不会作为 `.exs` 源文件
  重复计数（`config/*.exs` 会索引，通常无 `defmodule`，不产生符号/边）。
- 语言分布与文件预算会包含 `.exs`：这是有意为之，避免“测试不算代码”
  导致覆盖率与影响面缺数据。

## 验证

- `LANG=en node --test test/indexer.test.js test/test-files.test.js`：通过。
- 全量门禁：`npm test`（双语言 561/561）、`coverage:check`（行 98.11 /
  分支 86.79 / 函数 95.38）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
