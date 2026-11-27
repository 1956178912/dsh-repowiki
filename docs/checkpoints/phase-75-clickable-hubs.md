# 检查点：可点击高风险入口 v0.100.0（phase-75）

- 日期：2026-11-27
- 目标：v0.97.0 的 fan-in chip 只展示不可操作。把它变为导航入口：点击
  直接打开对应文件详情，风险提示与下钻动作合一。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - 新 `rowByPath` useMemo（rows 每文件唯一）；
  - hub chip 由 `span` 改为 `button`：`onClick` 经 `guard('open-hub')`
    打开 `openDetail(row)`（与卡片瓦片同一详情面板，自动重置依赖深度）；
    `aria-label` 为 `path (N)`，`title` 为路径；视觉与语言分布 chip 一致
    （透明背景、pointer 光标、`fontFamily: inherit`）。
- 测试：
  - `test/client-smoke.test.js`：hub 用例扩展为点击 `c.js (2)` 后断言详情
    region 的 `aria-label` 为 `C 卡片`；
  - `test/client-dom.test.js` / `test/client-faults.test.js`：卡片瓦片
    选择器排除 `path (N)` 形态的 hub chip（新按钮不再被当成卡片）。
- 文档：两份 CHANGELOG、README 双语（stage/面板行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/client-smoke.test.js`：25/25 通过。
- `node --test test/client-dom.test.js test/client-faults.test.js`：20/20 通过。
- `npm test`：383/383 通过。
- `npm run coverage:check`：行 98.01%、分支 87.49%、函数 95.14%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **复用 openDetail 而非新交互**：与卡片瓦片共享详情面板、焦点管理、
  深度重置逻辑，行为一致。
- **保留 chip 视觉**：不改成链接样式，避免与筛选 chips 混淆；可 hover
  与键盘聚焦（原生 button）。
- **测试选择器按形态排除**：`path (N)` 是 hub chip 的稳定形态；比给 DOM
  加私有标记更符合"语义选择器"的测试习惯。
- **找不到行时 no-op**：edges 只解析到已索引文件，理论上一定命中；
  guard 内 `if (row)` 作为防御，不引入额外分支 UI。

## 遗留 / 下一步

- mermaid 子集按真实资产反馈扩展 subgraph 分组。
- Wiki 生成 prompt 注入 fan-in hub 作为架构热点依据（评估）。
- 索引告警明细点击跳转状态工具（当前 tooltip 只读）。
- 提交/推送与版本 tag 由用户确认后执行。
