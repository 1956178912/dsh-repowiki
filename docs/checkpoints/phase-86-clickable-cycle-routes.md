# 检查点：环内路径可点击 v0.111.0（phase-86）

- 日期：2026-11-27
- 目标：v0.110.0 在详情展示环路径，但仍需关闭面板再到列表找另一张卡。
  把路径中的其他文件变成链接，沿环浏览一步直达。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - `DetailPane` 新 prop `onOpenCycleFile`；
  - 循环摘要路径由 `join(' → ')` 字符串改为元素序列：箭头为纯文本，
    当前文件为纯文本，其他文件为 `button`（下划线、继承色、`aria-label`
    为 `openCycleFile` 插值路径）；
  - App 传入回调：经 `rowByPath` 取行并调用 `openDetail`（自动重置依赖
    深度、焦点行为一致）。
- 测试（`test/client-smoke.test.js`）：hub 用例扩展——在 C 卡片详情中
  点击环内链接后，详情 region 切换为 `A 卡片`。
- 文档：两份 CHANGELOG、README 双语（stage/面板行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/client-smoke.test.js`：26/26 通过。
- `npm test`：390/390 通过。
- `npm run coverage:check`：行 98.05%、分支 87.47%、函数 95.29%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **只对短环（≤3 文件）渲染链接**：与摘要显示条件一致，长环不展示路径。
- **当前文件不渲染为链接**：避免"点击自己"的无操作按钮；纯文本保留
  路径可读性。
- **复用 `openDetail`**：与卡片瓦片/列表行/hub chip 完全同一路径，深度
  重置、焦点与详情内容行为统一。
- **可访问名插值路径**：读屏用户能区分环内多个文件链接。

## 遗留 / 下一步

- mermaid 组内节点较多时的紧凑排布。
- 面板 Wiki 页顶部风险摘要（需求再评估）。
- 详情依赖/依赖方列表中的文件是否也可点击跳转（同类交互，评估成本）。
- 提交/推送与版本 tag 由用户确认后执行。
