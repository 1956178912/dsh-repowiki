# 检查点：mermaid 指令与渲染器对齐 v0.105.0（phase-80）

- 日期：2026-11-27
- 目标：面板已能渲染 `flowchart` + `subgraph`（v0.96/v0.103），但合成
  prompt 只说"加一个 mermaid 图"。模型可能输出 `sequenceDiagram` 等面板
  不支持的类型，导致降级为代码块。把指令与渲染器能力对齐。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/prompts.js` 的指令 4：
  - 明确 `flowchart TD` / `flowchart LR`；
  - 同模块/同层的节点用 `subgraph <name>` … `end` 包裹（渲染为分组框）；
  - 节点标签保持简短；
  - 仍要求 mermaid 语法裸文本（无围栏），无图时留空。
- 测试（`test/prompts.test.js`）：新用例断言上述四类指令文案。
- 文档：两份 CHANGELOG、README 双语（stage/路线图）、`docs/coverage.md`。

## 验证（本地全量）

- `node --test test/prompts.test.js`：11/11 通过。
- `npm test`：387/387 通过。
- `npm run coverage:check`：行 97.99%、分支 87.51%、函数 95.26%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **约束而非自由发挥**：prompt 指定渲染器支持的子集，减少"生成图但面板
  显示源码"的落差；这是提示词与实现对齐，不是限制表达力（模型仍可写
  任意 Markdown 段落）。
- **subgraph 用于模块/层边界**：与 v0.103 的分组框语义一致，读者能直接
  看出架构分层。
- **简短标签**：节点宽度由标签长度估算，过长会挤压画布；提前约束比在
  渲染器里截断更可控。

## 遗留 / 下一步

- 面板 Wiki 页顶部风险摘要（当前模块页正文已含 fan-in 节，需求再评估）。
- 大量索引告警时的上限与汇总（防 index.json 膨胀）。
- mermaid 组内节点较多时的紧凑排布。
- 提交/推送与版本 tag 由用户确认后执行。
