# 检查点：面板大索引分页读取 v0.63.0（phase-38）

- 日期：2026-11-27
- 目标：修复大型仓库在 Repo Wiki 面板中"读取失败"的问题——资产 JSON
  （`index.json` 与清单）超过 12 页（6 万行）时被截断，前端把半截文本
  当作 JSON 解析而报错。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - 新增 `READ_MAX_PAGES_JSON = 120`（5000 行/页，最多 60 万行），
    Markdown 页面仍用 `READ_MAX_PAGES = 12`；
  - `readFileText(wf, sessionId, rel, signal, opts)` 新增
    `{ maxPages, failOnTruncate }`：记录是否到达 eof，未读完且
    `failOnTruncate` 时抛 `{ code: 'workspace-file/too-large' }`；
  - `readJson` 以 `maxPages: READ_MAX_PAGES_JSON, failOnTruncate: true`
    调用，截断不再是"坏 JSON"而是明确的过大错误码。
- 测试 `test/client-smoke.test.js`：构造 >60000 行的 `index.json`
  （padding 22000 条），挂载后断言统计行出现、无读取失败提示；既有的
  12 页 Markdown 行为不变。
- 文档：`CHANGELOG.md` / `CHANGELOG.zh-CN.md` 0.63.0 条目；README 双语
  stage 与路线图；`docs/coverage.md` 版本、用例数与防线表。

## 验证（本地全量）

- `npm test`：320/320 通过。
- `npm run coverage:check`：行 97.79%、分支 86.74%、函数 94.2%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 只放宽资产 JSON 的页数，不放宽 Markdown：Wiki/卡片是给人读的文本，
  12 页（6 万行）已远超合理篇幅；资产 JSON 是机器生成的结构化数据，
  行数与仓库规模线性相关，必须给足预算。
- 用 `too-large` 而不是继续截断：截断后的 JSON 一定无效，伪装成解析
  错误会误导排查；明确错误码让面板文案与用户判断都更准确。
- 预算取 120 页而非无限：Remote 调用是逐页 RTT，过大预算会拖慢加载；
  5000 文件上限下 60 万行已覆盖极端情形。

## 遗留 / 下一步

- 目录级并行索引（大仓库吞吐）。
- Swift 自定义 `path:` 目标；多行 Scala 参数子句。
- 提交/推送与版本 tag 由用户确认后执行。
