# 检查点：索引告警可展开 v0.104.0（phase-79）

- 日期：2026-11-27
- 目标：v0.99.0 的告警计数只有 tooltip 前三条，第四条之后不可见。把计数
  改为可展开按钮，原地读完整告警列表。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - 新 state `warningsOpen`；
  - 统计行告警计数由 `span` 改为 `button`：`aria-expanded`、
    `aria-controls="repowiki-index-warnings"`、下划线提示可点击，悬停
    `title` 保留三条预览 + `… +N` + 展开提示；
  - 展开后在统计行下方渲染 `ul#repowiki-index-warnings`（`aria-label`
    为告警明细），逐条列出全部告警；再次点击收起；
  - 文案：`warningsDetails`（索引告警明细 / Index warnings）、
    `warningsToggleHint`（点击展开全部告警 / Click to expand all warnings）。
- 测试（`test/client-smoke.test.js`）：
  - 既有告警用例扩展：按钮形态与 `aria-expanded=false`、tooltip 5 行
    （3 条 + 计数 + 提示）、点击展开后 4 条全部可见、`aria-expanded=true`、
    再次点击收起、无告警时不渲染。
- 文档：两份 CHANGELOG、README 双语（stage/面板行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/client-smoke.test.js`：26/26 通过。
- `npm test`：386/386 通过。
- `npm run coverage:check`：行 97.99%、分支 87.51%、函数 95.26%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **按钮 + 列表而非弹层**：展开内容属于当前页面信息，内联列表无需新
  交互层，键盘与读屏可直接到达（`aria-expanded`/`aria-controls`）。
- **保留 tooltip 预览**：不展开也能看到主要告警；展开用于完整核对。
- **全部列出不截断**：告警来自索引阶段，数量有限且用户主动展开；若未来
  出现大量告警，再按需加上限。
- **无告警不渲染**：与 v0.99.0 一致，干净索引保持统计行精简。

## 遗留 / 下一步

- 面板 Wiki 页面顶部展示模块级风险摘要（复用模块页 fan-in 数据）。
- mermaid 组内节点较多时的紧凑排布（按真实资产反馈）。
- 告警条目是否可点击跳到对应文件详情（需要从告警文本解析路径，语义弱，
  暂不做）。
- 提交/推送与版本 tag 由用户确认后执行。
