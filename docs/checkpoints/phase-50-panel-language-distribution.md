# 检查点：面板语言分布 v0.75.0（phase-50）

- 日期：2026-11-27
- 目标：语言数只显示总数（如“语言 3”），看不出构成；C/C++ 接入后
  13 种语言的实际分布对使用者有价值。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - `languageDistribution` memo：优先 `index.stats.languages`，旧索引
    回退按文件行 `lang` 统计；按文件数降序、同数按 id 字典序（可复现）；
  - 单库视图统计行下新增分布行：可读语言名 + 文件数，最多 8 个 chip，
    溢出显示 `+N more`；仅多语言时渲染；
  - 文案 key `langDistribution` / `langsMore`（中英）。
- 测试 `test/client-smoke.test.js`：语言筛选夹具断言分布行存在且包含
  `C++ 1`（展示名 + 计数）。
- 文档：两份 CHANGELOG、README 双语（stage/路线图/面板能力行）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：337/337 通过。
- `npm run coverage:check`：行 97.84%、分支 87.08%、函数 94.48%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 优先 `stats.languages`、回退文件行：新索引的分布是权威且无需重算；
  旧索引（schema v2–v4 可能有、也可能没有）仍能显示正确数据。
- 上限 8 + 溢出计数：13 种语言全展开会挤占筛选区；8 个覆盖绝大多数
  仓库的主语言，其余以计数提示。
- 单语言隐藏：只有一种语言时分布行没有信息量，与语言筛选（单语言也
  隐藏）保持一致。
- chip 只用边框/次要文字色，不引入新状态色，保持与官方令牌体系一致。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- 提交/推送与版本 tag 由用户确认后执行。
