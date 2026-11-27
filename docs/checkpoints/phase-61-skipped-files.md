# 检查点：跳过文件计数 v0.86.0（phase-61）

- 日期：2026-11-27
- 目标：索引对读取失败与超大文件是静默 `continue`——用户看到 files 比预期
  少却无从判断原因。行业工具会把跳过原因作为一等诊断输出；补上计数与
  告警，让"少文件"可解释。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/indexer.js`：
  - `indexOneFile` 的 skipped 结果带 `reason`（`unreadable` / `too-large`）；
  - 装配循环统计 `skipped` 与 `skippedTooLarge`（取消后未派发的位置为
    null，不计入）；
  - `stats.skipped` / `stats.skippedTooLarge` 写入 index.json；
  - 有跳过时 warnings 追加一条可读说明。
- `src/tool-index.js`：输出 schema/结果增 `skipped` 与 `skippedTooLarge`，
  渲染追加 `(N skipped)`；取消分支同样返回。
- `src/tool-status.js`：`index.skipped` 透传（仅 >0 时输出），Index 行
  追加 ` / N skipped`。
- 测试：
  - `test/indexer.test.js`：4MB+ 超大文件不入索引、计数与告警正确；
  - `test/tools.test.js`：正常项目 `skipped === 0`；
  - `test/status.test.js`：手工写入 `stats.skipped = 2` 后状态输出与渲染。
- 文档：两份 CHANGELOG、README 双语（stage/索引与状态能力行/路线图）、
  `docs/compatibility.md`、`docs/coverage.md`。

## 验证（本地全量）

- `npm test`：364/364 通过。
- `npm run coverage:check`：行 97.93%、分支 87.34%、函数 94.68%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **只加两个计数，不输出文件清单**：索引输出已被大仓库撑得很长；计数
  足以让用户判断"是否漏了文件"，具体定位可缩小 exclude 或看告警。
- **取消位置不计入 skipped**：取消表示"还没处理"，不是"处理失败"；
  混入会让取消路径的数字失真。
- **warnings 而非 error**：跳过单个文件不阻断整体索引，告警符合既有
  可恢复问题分级；也避免把正常大仓库（含打包产物的边界情况）变成错误。
- **schema 不升版本**：新增 stats 字段是向后兼容的增量，旧读取器忽略
  未知键；升级版本会让用户无谓地重建索引。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- 面板统计行是否展示 skipped（当前只有工具与状态行）。
- 提交/推送与版本 tag 由用户确认后执行。
