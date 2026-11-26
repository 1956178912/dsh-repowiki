# 检查点：UI 切片 1（Repo Wiki 面板）

- 日期：2026-11-26
- 版本：v0.4.0
- 目标：实现 docs/ui-plan.md 切片 1——单工作区 Repo Wiki 面板（统计、筛选、搜索、视图切换、详情、生成按钮）。

## 完成情况

- client.js 重写为面板形态：工作区下拉 + 生成按钮 + 统计行（文件/符号/卡片/文档/最近更新）
  + 全部/已生成/未生成筛选 + 搜索框 + 网格/列表视图 + 内联详情列（Escape 关闭）。
- 数据通道：`ctx.remote.workspaceFiles.read/list`，相对工作区根读取
  `.dsh-repowiki/` 下的 index.json、knowledge/<locale>/*.md、wiki/<locale>/*.md；
  read 按页（上限 5000 行/页）拼接至 eof，单文件上限 12 页。
- 授权：选中工作区经 `WorkspaceView.sessionIds[0]` 取任一会话 id（冷会话亦可
  授权，见 dsh-api-workspace-files README"cold Session"路径）。
- 卡片解析复刻 src/knowledge.js（JSON frontmatter + 概要提取），坏卡跳过不阻断。
- 竞态守卫：latestRequest 序号 + AbortController，工作区切换时丢弃旧请求结果。
- 客户端冒烟测试 test/client-smoke.test.js：自写最小 React/hooks stub 挂载页面，
  fake workspaceFiles 跑通"选择工作区 → 加载 → 渲染统计/卡片/未生成条目"与
  "索引缺失走尚未生成分支"两条路径（56/56 全绿）。
- 安装验证：plugin_manager 重装 v0.4.0，application applied，无警告。

## 关键决策

1. **startSession(workspaceId) 而非 ui-plan 提议的 startSession(undefined)**：
   面板数据按"所选工作区"展示，生成动作落在同一工作区语义最一致；且该形态
   自 v0.3.0 已端到端验证。ui-plan 里 undefined 提案的出发点（不跳新会话）由
   `whenDraftExists: 'append'` 部分覆盖；如后续要求"完全不振荡当前会话视图"，
   再切 undefined 方案。
2. **locale 选择兜底**：knowledge/wiki 目录优先匹配面板 locale，否则取第一个
   子目录（资产只有单语时不致空）。
3. **暂不订阅 changes 流**：面板在挂载、工作区切换、页面重新可见时整批刷新；
   watch 流留给切片 3（更新检测）一并设计（ui-plan 已声明该差距）。

## 事实修正（相对 ui-plan 调研表）

- ui-plan 写 `read/stat(scope, path, ...)`，实际 Client 签名是
  `remote.workspaceFiles.read(sessionId, path, range, signal)`——授权单位是
  sessionId，不是 scope 对象（依据 dsh-api-workspace-files README §Use this
  package 与 src/types.ts）。
- `WorkspaceView` 含 `sessionIds`（dsh-api-workspace-controller/src/types.ts），
  免去额外的会话列表查询。

## 风险与遗留

- GUI 渲染未实测（模型无浏览器控制），需用户刷新 GUI 后确认；客户端冒烟测试
  只覆盖数据/结构层，不覆盖真实样式与交互。
- 统计/更新状态反映磁盘文件而非运行时进度（ui-plan 已声明差距）。
- 详情列在刷新后保留旧引用（小数据量下可接受）。
- theme 令牌名仍走 `--dsw-alias-*` + 字面量回退，未经 Theme 查询验证。

## 下一步

- 用户确认 GUI 渲染后，按需进入切片 2（多工作区总览）/切片 3（Wiki 浏览与
  更新检测）；Phase 3（commit/diff 增量、导入导出）另行排期。
