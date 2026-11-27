# 检查点：Elixir umbrella 依赖聚合（phase-154）

- 日期：2026-11-28
- 合入版本：v0.178.0
- 目标：v0.177.0 的 Elixir 支持只读取根 `mix.exs`。umbrella 项目的根清单
  通常只有 `app:` 与 `deps: deps()`，真正的 Hex 依赖分散在
  `apps/*/mix.exs`，导致依赖计数为 0、Phoenix/Ecto/Plug 等技术全部缺失。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/indexer.js`：
  - `isConfigManifest` 纳入 `mix.exs`，嵌套 app 清单也会被读取；
  - 新增 `MAX_MIX_MANIFESTS = 20`，在清单读取循环中对嵌套 mix.exs 限流
    （根清单不受限）。
- `src/stack.js`：mix 分支接受根与 `*/mix.exs`；依赖计数累加、技术栈逐
  清单登记 `source`；项目名仍只取根 `mix.exs`（`app: :name`）。
- 测试：Elixir 索引夹具新增 `apps/web/mix.exs`（phoenix/plug）与
  `apps/api/mix.exs`（oban），断言 `dependencyCounts.mix = 5`、Plug/Oban
  的来源清单、根项目名不被子 app 覆盖。

## 语义边界

- 只累加带字符串版本的依赖元组（`{:dep, "~> x"}`）；`in_umbrella: true`
  的内部依赖不是外部技术，不计数。
- 嵌套上限 20：超出的 app 清单不读取（技术栈少统计，不影响源码索引与
  依赖边）；根清单始终读取。
- 技术栈按清单来源可追溯；同一技术出现在多个 app 时保留多条记录，与
  CMake/pubspec 的聚合方式一致。
- 项目名保持“根清单优先”，避免 umbrella 子 app 名覆盖整体项目名。

## 验证

- `LANG=en node --test --test-name-pattern="Elixir" test/indexer.test.js`：
  通过。
- 全量门禁：`npm test`（双语言 561/561）、`coverage:check`（行 98.11 /
  分支 86.70 / 函数 95.38）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
