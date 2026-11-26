# Phase B 检查点（UI 触发）

- 日期：2026-11-26
- 状态：客户端插件已写；安装激活与页面渲染待 GUI 刷新验证

## 目标

在"自动化任务"区域旁加入口按钮：点进去选择项目目录，执行索引 / 卡片 /
Wiki 生成。

## 已完成

- 客户端模块 `client.js` 注册两个 seat（ADR-0004）：
  - `sidebar.panellist`：侧栏 Repo Wiki 图标入口（order: 20，与任务页
    图标同级）；
  - `main`（key=repowiki）：独立页面——工作区下拉选择（订阅
    `ctx.workspaces` 列表）+ 四个动作（生成索引 / 生成知识卡片 /
    生成 Wiki / 一键生成全部）。
- 选择单位是**工作区**（WorkspaceView：workspaceId/path/title），不是裸
  目录：用户按工作区组织项目，下拉直接复用。
- 生成动作经 `ctx.uiWorkspace.startSession(workspaceId,
  { prompt, whenDraftExists: 'append' })` 在所选工作区开新会话；新会话
  cwd 即工作区目录，工具默认 root 锚定它（产物写该工作区的
  `.dsh-repowiki/`）。
- 图标自绘 SVG（practices 规则：禁止 require dsh-client-ui-primitives）；
- 样式用 `var(--dsw-alias-*, <字面色>)` 回退链（本会话无 Theme 查询，
  令牌名未经运行时确认）。
- `package.json` 增加 `dsh.client`（platform: web, immediately: true）与
  `./client` 导出；UI 文案走客户端 locale 命名空间（repowiki.ui，中英）。

## 未验证（诚实披露）

- **激活**：客户端模块需 remove+install 才会被客户端构建发现；页面渲染
  需刷新 GUI。两者都还没通过连接的页面观察（本会话无浏览器控制）。
- `--dsw-alias-*` 令牌名未验证（无 cordis_inspect Theme 查询），回退
  字面色兜底。
- 侧栏图标 → main 页面的导航关联假设框架按 `key` 连接（官方插件以同样
  方式配对 `sidebar.panellist` 与 `main`）；页面级导航尚未实际观察。

## 下一步

1. remove+install v0.3.0，刷新 GUI，确认：侧栏出现 Repo Wiki 图标、页面
  渲染、目录选择器可用、生成动作开启的会话能对所选项目跑工具。
2. 在同一插件内修复观察到的视觉/行为缺陷。
