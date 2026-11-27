# 检查点：卡片文件出边查询 v0.80.0（phase-55）

- 日期：2026-11-27
- 目标：`repowiki-cards` 已能回答"这个符号被谁引用"（`references=true`），
  但无法回答反向问题"这个文件依赖谁"；调用方只能靠 `repowiki-status`
  的全局热点或重读源码。补上出边查询，让跨会话检索覆盖双向依赖。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/references.js`：
  - 新增 `MAX_IMPORT_ENTRIES = 100`、`ImportEntry` 类型说明与
    `importsFor(edges, matches, limit)`；
  - 按 `from` 建桶，按命中文件顺序再按边顺序输出；自引用跳过，
    副作用导入（`symbols: []`）保留，坏边安静跳过；
  - 有行号时带 `line`，旧索引降级为仅路径；超限返回 `truncated`。
- `src/tool-cards.js`：
  - 新参数 `imports`（boolean，默认 false）与工具描述说明；
  - 输出 schema 增 `imports`（required `path`/`symbols`）与
    `importsTruncated`；`target=docs/all` 时为空数组而非缺字段；
  - 渲染 `Imports:` 段（前 10 条 + 截断提示，副作用导入只显示目标），
    `presentCall` 透传 `imports`。
- 测试：
  - `test/references.test.js`：4 个用例覆盖顺序、副作用导入、自引用、
    旧索引无边号、截断与空输入；
  - `test/tools.test.js`：端到端建索引后断言 `imports` 值、渲染文本、
    叶子文件空数组与 `target=docs` 空数组。
- 文档：两份 CHANGELOG、README 双语（stage/能力行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：346/346 通过。
- `npm run coverage:check`：行 97.88%、分支 87.20%、函数 94.56%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **与 `references=true` 一样按需计算**：出边只读 `index.edges`，不新增
  索引字段，旧索引（v2–v4 无边号）自动降级，不需要重新索引。
- **保留副作用导入**：`import './polyfill'` 没有具名符号，但它确实是
  文件依赖；出边语义关注文件关系，与反向引用（关注符号绑定）刻意不同。
- **按命中顺序输出而非全局排序**：调用方看的是"每个命中文件依赖什么"，
  保持与 `matches` 对齐便于逐文件阅读；确定性由命中排序与边顺序保证。
- **上限 100 与反向引用一致**：两者都是单次检索的有界输出，避免大仓
  文件（如 barrel 文件）把输出撑爆。
- 不在渲染中展开全部出边：文本前 10 条 + 截断提示，完整数据在结构化
  输出里，符合"渲染面向阅读、数据面向程序"的既有分工。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- 提交/推送与版本 tag 由用户确认后执行。
