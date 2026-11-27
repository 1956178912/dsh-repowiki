# 检查点：面板高风险入口 v0.97.0（phase-72）

- 日期：2026-11-27
- 目标：v0.95.0 让状态工具有了 fan-in hub 排名，但用户必须跑工具才能
  看到。把同一信号兑现到面板单库视图，浏览仓库时即可识别改动风险最高的
  文件。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - 新函数 `topDependentsFor(index, limit = 3)`：按 `to` 聚合不同 `from`
    （Set 去重，同一文件重复 import 只计一次），跳过自引用与坏边；按依赖方
    数量降序、并列按路径升序；
  - `hubs` useMemo（依赖 index）；
  - 单库视图在语言分布之后渲染"高风险入口"chip 行：`aria-label` 为
    `hubLabel`、整行 `title` 为 `hubHint`（说明"被最多文件依赖（改动
    影响面最大）"），chip 文本 `path (N)`；无依赖边时不渲染；
  - 文案：`hubLabel`（高风险入口 / High-fan-in files）、`hubHint`
    （被最多文件依赖（改动影响面最大）/ Most imported files (largest change impact)）。
- 测试（`test/client-smoke.test.js`）：
  - 新用例断言 hub 行标签、`a.js (2)`、`c.js (2)`、`d.js (1)`、无依赖方
    文件不出现；空 edges fixture 下整行隐藏。
- 文档：两份 CHANGELOG、README 双语（stage/面板行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/client-smoke.test.js`：24/24 通过。
- `npm test`：381/381 通过。
- `npm run coverage:check`：行 97.95%、分支 87.19%、函数 95.10%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **客户端重复实现**：`client.js` 不能 import `src/`，fan-in 聚合本地实现，
  测试锁定与 `repowiki-status` 同口径（去重、自引用、并列路径）。
- **只显示前三**：面板是浏览界面，hub 行是"抬头可见"的风险提示；完整
  排名留在状态工具。
- **chip 与语言分布同风格**：复用现有视觉语言，不引入新组件或布局。
- **无依赖边时隐藏**：空仓库/旧索引不出现空行，避免噪声。

## 遗留 / 下一步

- Go `internal` 包可见性诊断。
- mermaid 子集按真实资产反馈扩展 subgraph 分组。
- 面板 hub chip 点击跳转到对应卡片详情（当前仅展示）。
- 提交/推送与版本 tag 由用户确认后执行。
