# 检查点：上下文包使用点（phase-221）

- 日期：2026-11-28
- 合入版本：v0.245.0
- 目标：`repowiki-context` 是任务开始时的"一次调用证据包"，但不包含符号
  使用点；v0.238–v0.242 已在 `repowiki-cards` 与 `repowiki-impact` 建立
  有界收集器。本轮把它接到 context，让锚点任务同时看到"定义在哪、谁在用"。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/usages.js`：接管 `collectSymbolUsages` 与 `MAX_USAGE_TARGETS`
  （从 tool-cards 移出），成为 cards/context 共用的收集器；JSDoc 改为
  通用定义文件命中。
- `src/tool-cards.js`：改为从 `./usages.js` 导入，行为不变。
- `src/tool-context.js`：
  - 新参数 `usages`（默认 false）；
  - 仅对有已解析符号锚点的请求执行：按定义文件分组后调用共享收集器；
  - 关系段追加 `usage <symbol> in <path>: N site(s)`、每符号最多 2 条
    `path:Lx: text` 与不可读文件提示；
  - 跳过符号/文件/站点截断写入 warnings；
  - 输出 `usages` / `usagesSkipped` / `usagesSkippedFiles` /
    `usagesTruncated`，新增对应 schema；
  - `presentCall` 记录 `usages`。
- 测试：`test/context.test.js` 的符号锚点用例扩展 `usages=true`：结构化
  importers/站点、渲染 `usage ...` 行与 `used at` 行；默认请求无 `usages`。
- 文档：README 双语（阶段行、context 工具行、版本列表）、CHANGELOG 双语、
  `docs/coverage.md`。

## 语义边界

- 使用点仍是词法证据；定义范围排除、import 行/块与整行注释排除，
  字符串/行尾注释与同名实体无法区分。
- 只扫描直接具名/命名空间导入方与定义文件；经 barrel 再导出的消费者
  不展开（通配引用只到 barrel 本身）。
- 收集器预算沿用 cards：最多 5 个锚点符号、20 个导入方文件、100 个站点
  （单符号 10 条）；定义文件不计入导入方上限。
- 读取失败的导入方列入 `unreadable` 并把符号标记 truncated，不伪报零使用。
- 未给符号锚点或未请求 `usages` 时不做任何额外读取。

## 验证

- `LANG=en npm test`：770/770
- `LANG=zh_CN.UTF-8 npm test`：770/770
- `npm run coverage:check`：行 98.07%、分支 87.91%、函数 95.55%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
