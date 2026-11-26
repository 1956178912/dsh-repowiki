# ADR-0004：UI 触发走"工作区选择 + startSession(prompt)"，不建 Host 服务，不 import 客户端 primitives

- 日期：2026-11-26
- 状态：已采纳（Phase B，后续按 docs/ui-plan.md 演进）

## 背景

用户要求在"自动化任务"区域加入口按钮，点进去选择项目并生成 Repo Wiki 与
知识卡片。调研结论：

1. `ui-schedule` 的 `TaskManagerPage`（自动化任务页）**没有向第三方暴露页面
   内注入 slot**；可行路径是与它并列：`sidebar.panellist` 图标入口 +
   `main`（keyed）独立页面（ui-schedule 自己就是这套机制）。
2. "选择单位"经用户确认为**工作区**（不是裸目录）：客户端
   `ctx.workspaces.list.getSnapshot().items`（`WorkspaceView`：
   workspaceId/path/title），`list.subscribe` 订阅变更。
3. user-actions.md 的标准模式是"操作实现为 Host 服务方法 + UI 经 remote
   入口调用 + agent 工具同源"。但本 bundle 是 apply 函数形式的 Host 工具
   插件，暴露 ctx 服务需要 service class 形态（与 ADR-0002 的零 import
   形态相悖）。
4. ui-schedule 的 `onNewTask` 示范了更轻的一条路：
   `ctx.uiWorkspace.startSession(workspaceId, { prompt, whenDraftExists })`；
   省略 workspaceId 时复用当前工作区的空白会话或追加到当前草稿。

## 决策

1. **UI 注入**：`sidebar.panellist`（图标入口，`order: 20` 与任务页图标
   同级）+ `main`（`key: 'repowiki'` 独立页面）。
2. **选择工作区**：页面下拉展示 `ctx.workspaces` 列表并订阅其变更。
3. **触发执行**：`startSession(workspaceId, { prompt, whenDraftExists:
   'append' })`；新会话的 cwd 即所选工作区目录，工具用默认 root 锚定它
   （资产写到该工作区的 `.dsh-repowiki/`）。
4. **图标自绘 SVG**：practices 规则禁止 `require('@deepseek-ai/dsh-client
   -ui-primitives')`（该包变更无通知）；artwork 允许使用自有颜色。
5. **主题令牌**：本会话无 cordis_inspect 的 Theme 查询，`--dsw-alias-*`
   令牌名未经运行时确认；样式采用 `var(--dsw-alias-*, <字面色>)` 回退
   链，令牌缺失时回退到字面色而非破版。

## 理由

1. startSession+prompt 是官方任务页同款轻路径；不引入 Host 服务方法就
   不需要改插件形态（service class），保持 ADR-0002 的零外部 import。
2. 工具的 `root` 参数在设计上就支持任意路径（Phase 1 的
   resolveAssetRoot），默认锚定会话 cwd；以工作区为选择单位让"选项目"
   直接复用用户已有的工作区组织，无需目录→workspace 转换胶水。
3. 生成是长任务（可能数十次 LLM 调用）：把它放在会话里既让进度可见可
   回看，产物又落回工作区目录。

## 后果（诚实披露）

- **不是 user-actions 的标准模式**：按钮没有直接调 Host 服务方法，而是
  经"会话 + 模型"执行。代价是失败处理依赖模型遵循 prompt（prompt 已
  逐步骤化并要求报告）；收益是零额外 Host 服务。
- 令牌名未经运行时验证（本会话无 Theme 查询能力），首版用回退链；可用
  `cordis_inspect_query` 时应核对并对齐真实令牌名。
- `client.js` 的加载需客户端构建发现（dsh.client.platform: web +
  `immediately: true`），安装后需刷新页面才能看到侧栏图标。
- 界面后续按 docs/ui-plan.md 的切片演进（面板化、浏览检索等），本 ADR
  的"简单页面"形态会被切片 1 取代。

## 回滚

删除 client.js 与 package.json 的 `dsh.client` 节 + `./client` 导出，
回到纯 Host 工具插件（Phase 1+2 功能层不受影响）。
