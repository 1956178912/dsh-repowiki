# 检查点：解析缓存版本升级（phase-166）

- 日期：2026-11-28
- 合入版本：v0.190.0
- 目标：`INDEX_PARSER_VERSION` 自 v0.117 引入后一直等于 1，但此后
  `src/symbols.js` / `src/deps.js` 新增了 Elixir、Lua、Zig、Gleam 等 15+
  种语言并修复多处解析规则。增量索引只在 parserVersion 相同时复用
  per-file `symbols`/`imports`，因此旧版本建立的索引会持续复用陈旧结果，
  新语言支持与解析修复对已有项目不可见，直到文件内容发生变化。
- 状态：代码、测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/schema.js`：`INDEX_PARSER_VERSION` 1 → 2，注释记录 v2 覆盖的规则
  演进范围与升级后的统计表现（`changed` = 文件数、`reused` = 0）。
- `test/indexer.test.js`：增量缓存夹具从“删除 parserVersion”改为显式
  `parserVersion = INDEX_PARSER_VERSION - 1`，更贴近真实旧索引；继续断言
  失效不误报新增、边被重建、随后恢复复用。

## 语义边界

- 版本提升只影响解析缓存复用，不改变 `INDEX_SCHEMA_VERSION` 与产物结构；
  旧索引仍可读取（v2–v5 兼容），首次重建写回 v6 + parserVersion 2。
- 首次重建会把所有文件标为 `changed`（不是 `added`），不改变文件数/删除
  统计，也不会产生重复文件条目。
- 恢复复用后，下一次重建 `reused` 回到文件数、`changed` 为 0。
- 该版本号为人工维护；后续任何影响 `symbols`/`imports` 结果的解析改动都
  应同步 +1（schema.js 注释已写明）。

## 验证

- `LANG=en node --test --test-name-pattern="解析器版本变化" test/indexer.test.js`：
  通过。
- 全量门禁：`npm test`（双语言 577/577）、`coverage:check`、
  `typecheck`、`lint`、`scan:secrets`、`verify:host`、`git diff --check`。
