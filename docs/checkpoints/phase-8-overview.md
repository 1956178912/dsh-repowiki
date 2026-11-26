# 检查点：多工作区总览（ui-plan 切片 2）

- 日期：2026-11-26
- 版本：v0.18.0
- 目标：实现 ui-plan 切片 2（多项目总览）——用户产品愿景第 2 条
  "Repo Wiki 管理面板展示各项目的生成状态"。

## 完成情况

- 数据层（`client.js`）：
  - `loadWorkspaceStats(wf, sessionId, signal)`：读 `index.json`
    （缺失按 no-asset）+ 并行计 knowledge/wiki 首个 locale 子目录的
    Markdown 文件数（`countDirMd`）；输出 status/files/symbols/cards/
    docs/updatedAt（最近索引时间取 index.generatedAt，不为读卡片正文
    而打 N 次远程调用）。
  - 总览 effect：`mapLimit(items, OVERVIEW_CONCURRENCY=3)` 并发统计，
    latestRequest 竞态守卫 + AbortController；每工作区复用自身
    `sessionIds[0]` 的会话 scope——与单库视图同一通道。
- 视图：默认进入总览模式（`overview` 状态，初始 true），OverviewPanel
  每行一个工作区：状态点（ready 主色/未生成灰）、标题、路径、统计
  chips 或状态文案（noAsset/noSession/loadFailed）；点击行
  `guard('open-workspace')` 下钻单库视图；头部有"总览/单库"模式切换
  按钮；下拉选择工作区也直接进入单库（退出总览）。
- 顺手修了一个真实样式 bug：primaryStyle 用长属性 borderColor
  覆盖 buttonStyle 的简写 border，React 重渲染时报警告并且可能样式
  不一致——改为同形态简写 `border: '1px solid transparent'`。
- 测试 97→99：
  - stub：三工作区（已生成/空/无会话）总览渲染 + 点击行下钻单库；
  - DOM：双工作区真实点击下钻（真实 React 事件代理）。
- docs：ui-plan.md 切片 2 状态更新（含技术顾虑澄清）、CHANGELOG、
  双语 README、coverage.md（后置项列表同步）。

## 设计决策

1. **默认总览**：产品愿景是管理面板；单工作区用户多一次点击，
   下拉与行点击都可直达单库，摩擦可控。
2. **不引入新数据面**：原 ui-plan 忧虑"跨工作区聚合可能需要新增
   Host 数据面 / 暴露 per-session-scope 限制"——实现证明每个
   workspace 条目自带 `sessionIds`，直接复用即可。约束是被假设放大
   的，不是被事实验证的。
3. **统计粒度最小化**：总览只做 3 次远程调用/工作区（index.json +
   两个目录列表），最近更新用索引时间而非卡片正文时间——面板首屏
   成本与工作区数成线性且可容忍。
4. **状态点语义**：ready=已建索引（有 index.json），与单库视图的
   已生成（有卡片）语义略有差别——总览看"库是否存在"，下钻看细节。

## 验证

- 99/99 全绿；DOM 测试零 React 警告（含修复的样式警告）。
- 安装验证 + CI 见发布流程（v0.18.0）。

## 下一步

- 用户 GUI 现场反馈（总览模式首屏 + 下钻）。
- ui-plan 切片 4（自动化开关）仍后置（依赖增量更新机制，YAGNI）。
