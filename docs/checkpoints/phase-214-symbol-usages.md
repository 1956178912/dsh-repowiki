# 检查点：符号使用点查询（phase-214）

- 日期：2026-11-28
- 合入版本：v0.238.0
- 目标：`repowiki-cards` 能回答"符号在哪定义/谁 import 了它"，但回答不了
  日常最高频的"这个函数/类型在代码里哪里被用到"。影响面分析（`symbols=`
  + `usages`）已经实现了有界的词法扫描，本轮把同一能力开放到检索侧，让
  任意会话都能从符号名直接拿到使用点证据。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/tool-cards.js`：
  - 新参数 `usages`（默认 false），只对符号/混合检索生效；
  - `collectSymbolUsages(fs, root, edges, matches)`：
    - 目标符号取 `matches[].symbols` 的顺序，最多 5 个，其余计入
      `symbolUsagesSkipped`；
    - 每个目标经 `usageImporters` 取直接具名导入方（要求 `edge.symbols`
      显式包含该符号），按导入方去重后合并扫描计划；
    - `selectUsageFiles` 限制 20 个文件，超出计入
      `symbolUsagesSkippedFiles`，相关符号标记 `truncated`；
    - 逐文件读取（失败列入 `unreadable`，不当作未使用），对每个导入符号
      调用 `findSymbolUsages`（排除 import 行与导入块、整行注释），单符号
      10 条、总计 100 条；
    - 输出 `symbolUsages` 条目：定义文件、`symbol`、`importers`
      （`{path, line}`，按路径/行排序去重）、`usages`
      （`{path, line, text}`）、`filesScanned`、`unreadable`、`truncated`。
  - 文本渲染新增 `Usages:` 段（每符号一行汇总 + 最多 5 条站点 + 不可读
    提示），并追加缺口/截断说明；
  - 输出 schema、工具描述与 `presentCall.rawInput` 同步。
- 测试（`test/tools.test.js`，3 例）：
  - 使用点与注释/import 排除、不可读导入方披露、渲染与 docs 目标空结果；
  - 5 符号目标上限 + 单符号 10 站点上限与 `[truncated]` 渲染；
  - 21 个导入方 → 20 文件上限与 `symbolUsagesSkippedFiles`。
- 文档：README 双语（阶段行、cards 工具行、版本列表）、CHANGELOG 双语、
  `docs/coverage.md`。

## 语义边界

- 证据是**词法出现**：按标识符边界匹配，大小写敏感；字符串与行尾注释中
  的同名文本无法排除，同名不同实体也无法区分——文档明确要求人工确认。
- 只扫描直接具名导入方；副作用导入、引用同文件其他符号的边不算证据；
  import 边不带具名符号的语言（如 Go 包导入、C `#include`）不会产生
  "零使用"的假结论。
- 不可读的导入方计为 unknown 并进入 `unreadable`；因文件上限未扫描的
  导入方使相关符号 `truncated=true`，不静默丢弃。
- 目标符号上限 5：查询越宽（如空 query）越容易触顶，缺口通过
  `symbolUsagesSkipped` 如实输出。

## 验证

- `LANG=en npm test`：756/756
- `LANG=zh_CN.UTF-8 npm test`：756/756
- `npm run coverage:check`：行 98.05%、分支 87.85%、函数 95.83%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
