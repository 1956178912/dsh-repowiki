# UI 方案：Repo Wiki 面板（对齐同类产品形态）

- 日期：2026-11-26
- 状态：切片 1 已实现（v0.4.0，已装验证 + 客户端冒烟测试）；切片 2-4 规划中

## 需求来源

参考界面：同类 Repo Wiki 产品（用户以文字描述）。四类功能：

1. **代码→文档自动化（核心）**：把代码库解析为"技术栈与架构"Wiki 文档，
   并生成便于阅读的知识卡片（如"智能体核心架构设计""实验脚本集架构
   设计""基准实验与冒烟测试"），自动打标签（如"架构设计"）。
2. **项目管理与状态追踪**：Repo Wiki 管理面板展示各项目（如 AITester）
   的生成状态；数据统计（文档数 / 卡片数）；按"全部/已生成/未生成"
   筛选；"有可用更新"提示与最近更新时间；网格与列表两种视图。
3. **知识库浏览与检索**：搜索框；左侧结构化卡片目录（标题、摘要、
   分类标签）。
4. **配置与自动化集成**：English / 简体中文切换；导入导出到
   `.dsh-repowiki` 本地目录（备份或团队共享）；"自动更新""自动导出"
   "智能体引用"开关；作为智能体的引用知识库。

## 已交付的能力底子

- 工具：`repowiki-index`（确定性符号索引、技术栈、依赖边）、
  `repowiki-extract`（spawn 子代理生成卡片）、`repowiki-generate`
  （Wiki 凝练）、`repowiki-cards`（检索）——均已端到端冒烟通过。
- 资产：项目目录的 `.dsh-repowiki/` 普通文件（随 Git 共享）：
  `index.json`、`knowledge/<locale>/*.md`（JSON frontmatter + 正文）、
  `wiki/<locale>/*.md`、`repowiki-plan.json`。
- 客户端模块：侧栏入口 + 简单页面（工作区下拉 + 动作按钮）——v0.3.0，
  激活已验证，页面渲染待 GUI 刷新。

## 技术调研结论（2026-11-26，仅事实）

| 需求 | 结论 | 依据 |
|---|---|---|
| UI 读卡片/索引 | ✅ `ctx.remote.workspaceFiles.read/stat(scope, path, ...)` 可读当前会话工作区的文件；`WorkspaceFileScope` 由 header 派生（sessionId + workspaceRoot） | `dsh-api-workspace-files/src/index.ts` §read（247 行）、`client/provider.ts` |
| 列出工作区 | ✅ `ctx.workspaces.list.getSnapshot().items` → `WorkspaceView {workspaceId, path, title, createdAt}`；`list.subscribe` 订阅变更 | `dsh-api-workspace-controller/src/types.ts`、客户端 navigation |
| 跨工作区读文件 | ⚠️ 以 session 为 scope；聚合多个工作区文件需要逐会话 scope 或新增 Host 数据面 | 同上 |
| UI 触发生成 | ⚠️ 工具只能由模型调用；UI 可 `ctx.uiWorkspace.startSession(workspaceId, {prompt, whenDraftExists:'append'})`——省略 workspaceId 时复用当前工作区的空白会话或追加到当前草稿（官方任务页 `onNewTask` 同款形态） | `dsh-client-ui-workspace/src/client/navigation.ts`、`dsh-client-ui-schedule/src/client/index.ts:225` |
| 完全客户端执行的生成（同类产品形态） | ❌ 插件不可得：生成工具走模型调用，客户端不能直接调工具 | DSH 工具分发架构 |
| 左侧目录 | 同类产品的左侧目录须渲染在我们自己的 `main` 页面内部（ui-schedule 的 TaskManagerPage 不提供第三方注入点） | ui-schedule 源码 |

## 切片划分（每片可独立交付）

### 切片 1 —— 单工作区 Repo Wiki 面板

目标："打开页面即看到同类形态的面板"（单工作区内）。

- 头部：工作区下拉（订阅 `ctx.workspaces`）、统计（文档数、卡片数）、
  最近更新时间（卡片 frontmatter `generatedAt` 的最大值）、
  "全部/已生成/未生成"筛选（未生成 = 在 `index.json` 中但没有卡片）。
- 左侧目录：当前工作区的卡片（`knowledge/<locale>/`），标题 + 摘要 +
  标签徽章；点击打开详情侧栏。
- 主区：搜索框、网格/列表视图切换、筛选后的卡片网格。
- 生成动作：四个按钮，均走
  `startSession(undefined, {prompt, whenDraftExists:'append'})`——执行
  落回当前工作区（复用空白会话/追加草稿），不再强制跳新对话；会话
  结束后面板从 `.dsh-repowiki/` 重新刷新。
- 数据：经 `ctx.remote.workspaceFiles` 读取当前会话工作区的
  `.dsh-repowiki/**`；`repowiki-plan.json` 驱动 exclude/includeOnly。
- 已知差距：统计/更新状态反映磁盘文件而非运行时进度；面板在打开/
  获得焦点时刷新。

### 切片 2 —— 多项目总览

- `ctx.workspaces` 列表 + 每个工作区的状态：是否有 `.dsh-repowiki/`、
  文档/卡片数、最近更新；点击工作区打开切片 1（可能需要其会话 scope
  才能读取——见上文注意事项）。

### 切片 3 —— Wiki 浏览与更新检测

- 面板内渲染 `wiki/<locale>/*.md`（Markdown 视图、mermaid 作代码围栏）；
  "有可用更新"对比索引文件 mtime/版本与卡片 `generatedAt`（在 Phase 3
  commit/diff 增量机制落地前只能是近似）。

### 切片 4 —— 配置与自动化

- 语言切换（面板 locale 命名空间已支持中英）、
  `.dsh-repowiki/` 的导入导出（经文件通道拷目录）、
  自动更新/自动导出/智能体引用开关。自动更新依赖 Phase 3 增量更新；
  智能体引用已由 `repowiki-cards` 工具提供。

## 约束（诚实披露）

- 在 DSH 工具分发架构下，无法做到与同类产品完全等价的"客户端直跑生成"；
  最接近的等价物是"一键生成落回当前工作区会话 + 产物写回
  `.dsh-repowiki/` + 面板从磁盘刷新"。
- 跨工作区聚合在实现时可能暴露 per-session-scope 的限制；切片 2 的
  设计须先以真实读取验证再定稿。
- 主题令牌仍未验证（无 Theme 查询能力），在 `cordis_inspect_query`
  可用前沿用既有回退链样式。

## 下一步

批准后实现切片 1；在此之前保留 v0.3.0 的现有页面。
