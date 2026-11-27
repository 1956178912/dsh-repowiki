# 检查点：默认导入穿过 barrel（phase-233）

- 日期：2026-11-28
- 合入版本：v0.257.0
- 目标：`import Btn from './index'` 在 `index.ts` 仅
  `export { default } from './Button'` 时，旧逻辑只做同名导出匹配，标记被
  丢弃，引用/使用点在 barrel 处断链。本轮复用默认导出与再导出链解析。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/indexer.js`：`resolveDefaultImportSymbols` 重写：
  - 目标同名导出优先；
  - 否则 `resolveReexportOrigins(edge.to, 'default', …)` 解析具名默认/
    再导出链；直连目标写入真实符号并记录本地绑定别名，经 barrel 时保留
    `default` 导出名并记录别名；
  - 解析不到丢弃标记，保留文件级边。
- `src/reexports.js`：`resolveReexportOrigins` 对 `default` 不再沿
  `export *` 下传（ES 语义）；`reexportImportSites` 优先使用边别名作为
  导入方本地扫描名。
- `src/usages.js`：直接导入方读取非再导出边上的 `aliases`，作为词法
  扫描的本地名；再导出边上的 aliases 不误当本地绑定。
- 测试：
  - `test/indexer.test.js`：同名/别名默认导入、barrel 具名 default、
    `export *` 不转发 default；
  - `test/usages.test.js`：默认导入别名作为扫描名；
  - `test/tools.test.js`：真实索引的默认导入穿过 barrel 引用/使用点。
- 文档：README 双语（阶段行、默认导入条目）、CHANGELOG 双语、
  `docs/coverage.md`、`docs/compatibility.md`。

## 语义边界

- 仅解析具名默认导出；匿名默认导出仍不登记，标记降级为文件级边。
- `export *` 不转发 default；`export { default }` / `export { default as X }`
  才构成默认再导出。
- 经 barrel 的边 `symbols` 保留 `default` 供归因，查询仍以真实符号名
  暴露；不会出现名为 default 的假符号。
- 本地绑定别名只用于词法扫描；引用/影响面仍归到定义原名。

## 验证

- `LANG=en npm test`：807/807
- `LANG=zh_CN.UTF-8 npm test`：807/807
- `npm run coverage:check`：行 98.13%、分支 87.77%、函数 95.43%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
