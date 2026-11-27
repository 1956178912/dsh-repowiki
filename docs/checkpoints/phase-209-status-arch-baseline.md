# 检查点：基线感知的状态报告（phase-209）

- 日期：2026-11-28
- 合入版本：v0.233.0
- 目标：v0.232.0 的 `verify:arch` 只是 CI 侧门禁，用户在会话里看不到
  "相对基线是否退化"；同时 status 与门禁虽然算法相同，但各算一遍、展示
  上限还会截断明细（循环 10 组、坏导入 50 条、高复杂度 10 个），两边比较
  的数字可能不一致。本轮让 status 直接对照基线，并把两处口径收敛到
  `architectureFactsSnapshot`。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/complexity.js`：返回值新增 `highTotal`（精确高复杂度数），`high`
  继续按 `limit` 截断；健康分、status 告警/渲染与基线上限改用精确值。
- `src/layers.js`：返回值新增 `pairs`（`from → to` 精确计数，按名称排序）；
  违规明细仍受 `limit` 限制，计数不受影响。
- `src/arch-baseline.js`：
  - 新增 `architectureFactsSnapshot(facts)`：把已算好的循环/层对/坏导入/
    重复/复杂度/fan-in 归一为基线快照并只取健康分的架构分量；
  - `snapshotArchitecture` 改为"算事实 → 调 facts 快照"，CLI 行为不变；
  - 层对优先取 `pairs`，缺失时回退到明细聚合；复杂度优先取 `highTotal`。
- `src/tool-status.js`：
  - 循环按 `MAX_BASELINE_CYCLES` 取全量（展示仍 10 组），坏导入按
    `MAX_BASELINE_UNRESOLVED` 取全量（展示仍 50 条）；
  - 读取 `.dsh-repowiki/arch-baseline.json`：缺失 → `{exists:false}`；
    坏 JSON → `{ok:false, error:'invalid JSON'}` + 告警；版本/结构不可用
    → `error` 取归一化问题首条 + 告警；可用 → `compareArchitecture`；
  - 输出 `archBaseline`（`exists`/`schemaVersion`/`ok`/`regressionTotal`/
    `improvements`/有界 `regressions`）并在文本渲染 `Arch baseline:` 行；
  - 基线告警单独收集，不进入健康分的卫生分量（架构分量已反映事实）。
- 测试：
  - `test/complexity.test.js`：`highTotal` 在有界明细下仍精确；
  - `test/layers.test.js`：明细截断（limit=1）时 `pairs` 计数仍为 2/1；
  - `test/arch-baseline.test.js`：按事实与按索引生成的快照逐字段一致、
    `highTotal` 优先、事实快照容忍缺省输入；
  - `test/status.test.js`：缺失基线、基线一致、注入循环后回归（含告警与
    渲染）、坏 JSON 与不支持版本四种状态。
- 文档：README 双语（status 工具行、版本列表、阶段行）、CHANGELOG 双语、
  `docs/coverage.md`。

## 语义边界

- 基线告警不改变架构分量，也不改变卫生分量：健康分只由事实决定，避免
  "同一退化被扣两次"。
- status 的源码读取上限与 CLI 一致（`plan.maxStatusSourceFiles`），因此
  同一索引/阈值/分层下两处快照逐字段相同；若两次运行之间源码变化，结果
  差异来自输入而非口径。
- 基线文件损坏时 status 只是报告不可用并继续诊断；CI 门禁会以退出码 1
  失败（`verify:arch` 的 `baseline/invalid`）。

## 验证

- `LANG=en npm test`：728/728
- `LANG=zh_CN.UTF-8 npm test`：728/728
- `npm run coverage:check`：行 98.06%、分支约 87.9%、函数 95.85%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
