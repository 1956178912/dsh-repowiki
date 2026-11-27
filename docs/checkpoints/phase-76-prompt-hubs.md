# 检查点：生成 prompt 注入 fan-in 热点 v0.101.0（phase-76）

- 日期：2026-11-27
- 目标：v0.95.0/v0.97.0 让 fan-in hub 在工具与面板可见，但 Wiki 主题
  合成仍不知道这些热点。把前五个 fan-in 文件注入生成 prompt，让架构
  章节的风险描述有索引依据。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/prompts.js`：
  - `generatePrompt` 新增第 7 参数 `hubs`（`[{path, dependents}]`）；
  - prompt 新增段 `High-fan-in files computed from the index (N):` 与
    `- path (N importer(s))`（空为 `(none)`）；
  - 新约束指令 9：描述架构热点/改动风险时按路径引用这些文件，列表为空
    时不得虚构。
- `src/tool-generate.js`：
  - import `topDependents`，在 locale 无关区计算 `hubs = topDependents(index.edges, 5)`；
  - 传入 `generatePrompt(..., hubs)`；
  - 注释同步（跨模块摘要、循环、fan-in 三类索引信号）。
- 测试：
  - `test/prompts.test.js`：新用例断言 hub 段、条目格式、约束指令与空列表；
  - `test/tool-llm.test.js`：既有"注入跨模块摘要与循环组"用例追加
    `High-fan-in files computed from the index (2):` 与 `- a.ts (1 importer(s))`
    断言，验证派发链路真正带上 hubs。
- 文档：两份 CHANGELOG、README 双语（stage / generate 工具行 / 路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/prompts.test.js`：10/10 通过。
- `node --test test/tool-llm.test.js`：33/33 通过。
- `npm test`：384/384 通过。
- `npm run coverage:check`：行 97.98%、分支 87.38%、函数 95.14%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **只注入前 5 个**：prompt 预算有限，热点信号 5 条足够；完整排名在状态
  工具与面板。
- **复用 `topDependents`**：与状态工具、面板同一纯函数，口径不会漂移。
- **反虚构指令**：列表为空时明确禁止编造热点，与循环组的既有约束一致。
- **默认参数**：`hubs = []` 保持向后兼容（测试与其它调用方无需改动）。

## 遗留 / 下一步

- mermaid 子集按真实资产反馈扩展 subgraph 分组。
- 模块页（确定性）是否也展示 fan-in 提示（当前只在主题 prompt）。
- 索引告警明细可点击跳转状态工具。
- 提交/推送与版本 tag 由用户确认后执行。
