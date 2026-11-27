# 检查点：面板卡片正文检索 v0.87.0（phase-62）

- 日期：2026-11-27
- 目标：面板搜索覆盖标题/符号/标签/摘要/路径，但卡片正文（职责、关键
  符号、陷阱）是知识库最详细的部分；用户按正文里的概念搜索会 miss。
  补齐正文打分，并顺手消除逐键重复小写的浪费。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - `rows` 预算 `bodyText`（卡片正文小写副本）与既有小写的
    `symbolText`；
  - `scoreCard` 字段增正文（权重 1），短字段在构建字段表时统一小写，
    循环内只做 `includes`；
  - 搜索框文案补"正文 / content"。
- 测试 `test/client-smoke.test.js`：卡片正文加入唯一标记
  `BodyMarkerOnly`，新增用例搜索小写 `bodymarkeronly`，断言命中 A 卡片、
  排除 C 卡片（标题/摘要/标签/符号/路径均不含）。
- 文档：两份 CHANGELOG、README 双语（stage/面板能力行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：365/365 通过。
- `npm run coverage:check`：行 97.94%、分支 87.37%、函数 94.68%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **正文权重 1（与摘要/路径同级）**：标题/符号仍应优先；正文只是
  扩大召回，不改变排序语义。
- **一次小写 + 多次 includes**：CJK token 数量多（单字+二元组），若每次
  比较都 `toLowerCase()` 一份数 KB 正文，逐键开销会放大；预算是零风险的
  优化。
- **只用客户端本地过滤**：卡片数受 extract 上限约束，正文子串匹配在
  120~数千行规模下足够；引入 BM25 会与工具侧 `target=docs` 语义重复，
  且增加面板复杂度。
- **不改 `target=docs` 的 BM25**：工具侧已是全文检索，这次补的是面板
  默认视图的召回，两者互补。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- 面板统计行是否展示 skipped（当前只有工具与状态行）。
- 提交/推送与版本 tag 由用户确认后执行。
