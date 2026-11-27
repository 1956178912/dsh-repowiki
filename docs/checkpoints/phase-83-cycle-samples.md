# 检查点：循环代表性路径 v0.108.0（phase-83）

- 日期：2026-11-27
- 目标：循环检测只报 SCC 成员列表，用户知道"谁和谁成环"但不知道从哪条
  边断开。为每个环组计算一条最短闭合路径，供状态报告与合成 prompt 引用。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/cycles.js`：
  - 新常量 `MAX_SAMPLE_NODES = 12`；
  - 新函数 `shortestCycleFrom(start, adjacency, members)`：从组内字典序
    最小文件出发做一次 BFS，枚举回到起点的入边，取最短闭合路径（并列按
    路径字典序），超过 12 节点返回空数组；
  - `ImportCycle` 增 `sample` 字段（首尾同为起点）；`findImportCycles`
    对每个 size ≥ 2 的分量计算。
- `src/tool-status.js`：
  - `formatCycles` 对 2–3 节点短环追加 ` (e.g. a → b → a)`；
  - cycles 输出 schema 增 `sample`（required，带描述）。
- `src/prompts.js`：循环组行追加 ` — cycle: a → b → a`（有 sample 时），
  让模型可指出具体断链边。
- 测试：
  - `test/cycles.test.js`：既有断言补 sample；新增 12/13 节点上限用例与
    超长环空数组断言；
  - `test/status.test.js`：cycles 断言补 sample，并断言渲染含 `e.g.` 路径；
  - `test/prompts.test.js`：带 sample 的循环行断言；
  - `test/tool-llm.test.js`：真实索引链路的 prompt 断言含 cycle 路径。
- 文档：两份 CHANGELOG、README 双语（stage / 状态工具行 / 路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/cycles.test.js test/status.test.js test/prompts.test.js`：30/30 通过。
- `npm test`：390/390 通过。
- `npm run coverage:check`：行 98.04%、分支 87.59%、函数 95.27%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **最短环而非任意环**：最短环意味着最小改动（断一条边即可解开该环），
  对用户最有操作价值。
- **起点取字典序最小**：输出确定可复现，测试可断言；换起点会得到等价
  环的旋转。
- **12 节点上限**：超长环的路径文本无阅读价值，且会撑大输出/提示词；
  空数组时仍保留成员列表与规模。
- **渲染只对 ≤3 节点环追加路径**：状态行保持单行可扫读；完整 sample 在
  结构化输出与 prompt 中可用。

## 遗留 / 下一步

- mermaid 组内节点较多时的紧凑排布。
- 面板循环徽章 tooltip 是否展示代表性路径（当前只给组大小）。
- 面板 Wiki 页顶部风险摘要（需求再评估）。
- 提交/推送与版本 tag 由用户确认后执行。
