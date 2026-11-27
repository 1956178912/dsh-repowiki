# 检查点：Ruby 加载路径 require v0.67.0（phase-42）

- 日期：2026-11-27
- 目标：修正 Ruby 裸 `require` 的解析基准。此前所有 require 都相对
  "引用方文件目录"，导致 `lib/billing/invoice.rb` 里的
  `require 'billing/base'` 被解析成 `lib/billing/billing/base.rb`——
  gem 标准布局下聚合入口与嵌套 require 全部丢失依赖边。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/indexer.js`：
  - `buildRubyRoots`：任意层级 `lib/` 目录（按深度、字典序）+ 项目根，
    作为裸 `require` 的候选加载路径；
  - `resolveRubySpecifier` 接收 `relative` 标志：
    `require_relative` / 显式 `./`、`../` 仍以引用方文件目录为基准；
    裸 `require` 依次在加载路径根下查找 `<base>.rb`、原路径与
    `index.rb`；
  - `resolveImportEdge` 传入 `imp.relative`；`resolveCtx.rubyRoots`
    接线。
- 测试 `test/indexer.test.js`：聚合入口 `lib/billing.rb`、嵌套
  `lib/billing/invoice.rb`、`require_relative 'tax'`、多级
  `packages/core/lib/`、根目录文件走加载路径、外部 gem 不建边。
- 文档：两份 CHANGELOG、README 双语（stage/路线图/架构要点）、
  `docs/compatibility.md`（Ruby 行与已知限制）、`docs/coverage.md`。

## 验证（本地全量）

- `npm test`：328/328 通过。
- `npm run coverage:check`：行 97.87%、分支 87.08%、函数 94.44%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 用 deps 层已有的 `relative` 标志区分两种语义，而不是靠 specifier
  前缀：`require_relative 'base'` 本身不带 `./`，只看字符串会误判。
- `lib/` 优先于项目根：gem 的 `$LOAD_PATH` 以 `lib/` 为准；两者同名
  文件极少，固定顺序保证可复现。
- 不读取 `.ruby-version`、Gemfile 的 `require_paths` 或运行时
  `$LOAD_PATH` 修改：宿主仓库是静态索引，不执行 Ruby；作为已知限制
  记录。
- 外部 gem 无法在仓库内命中文件，自然不建边，无需维护 gem 名单。

## 遗留 / 下一步

- 目录级并行索引（大仓库吞吐）。
- 多行 Scala 参数子句。
- 提交/推送与版本 tag 由用户确认后执行。
