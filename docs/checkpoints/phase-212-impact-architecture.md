# 检查点：影响面的架构上下文（phase-212）

- 日期：2026-11-28
- 合入版本：v0.236.0
- 目标：`repowiki-impact` 已能回答"谁会被改坏"，但改动的架构含义（落在
  哪个声明层、受影响方分布在哪些层、是否产生跨层边、改动文件里有没有
  高复杂度函数）仍要靠人拼。本轮把这些事实并入影响面，且层归属与
  `repowiki-status`、`verify:arch` 共用同一实现，避免三个工具给出不同答案。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/layers.js`：导出 `assignLayer(layers, rel)`（最长路径前缀优先），
  `evaluateLayers` 内部改用同一函数。
- `src/impact-architecture.js`（新模块，纯函数）：
  - `declaredLayers`：声明层 + 索引文件数（有界 20）；
  - `changedLayers`：改动文件所属层（排序去重）；
  - `impactedLayers`：受影响依赖方按层计数（文件数降序、层名升序）；
  - `crossLayerPairs`：只统计"一端改动、另一端受影响"且两层不同的
    import 边，按层对精确计数；
  - `hotspots` / `hotspotTotal`：只读改动文件源码，按 plan 阈值给出高复杂
    度函数（精确总数 + ≤10 明细）。
- `src/tool-impact.js`：
  - 读取 plan（阈值/分层）与改动文件源码（8 路并发、失败跳过）；
  - 输出 `architecture` 字段并补全 schema；
  - 文本渲染 `Architecture:` 行（层与文件数、changed、impacted、
    cross-layer、hotspots 示例）；
  - 跨层与热点各追加一条 hint，提示验证两侧/先复核热点。
- 测试：
  - `test/impact-architecture.test.js`（5 例）：`assignLayer` 最长前缀、
    层计数与分布、跨层边过滤、热点精确总数、空输入；
  - `test/impact.test.js`：真实链路（plan 分层 + 热点函数）断言
    `architecture` 字段、hint 与渲染行。
- 文档：README 双语（影响面工具行、版本列表、阶段行）、CHANGELOG 双语、
  `docs/coverage.md`。

## 语义边界

- 跨层边只覆盖"改动 ↔ 受影响"的直接边；受影响方之间的跨层边不属于
  本次改动的影响。
- 热点只统计改动文件（不扫全库），读取失败的文件不计入，也不会伪报为 0
  复杂度。
- 未声明分层时 `declaredLayers`/`changedLayers` 为空，热点仍照常输出。
- 与 `verify:arch` 的层对计数口径一致（同一 `assignLayer` 与边过滤方向），
  但影响面只报告与本次改动相关的边，不是全库违规总数。

## 验证

- `LANG=en npm test`：748/748
- `LANG=zh_CN.UTF-8 npm test`：748/748
- `npm run coverage:check`：行 98.03%、分支约 87.8%、函数 95.75%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
