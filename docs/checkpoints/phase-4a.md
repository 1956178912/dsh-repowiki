# 检查点：Phase 4 会话记忆（repowiki-memory）

- 日期：2026-11-26
- 版本：v0.8.0
- 目标：方案 §6.4 Phase 4 的 `repowiki-memory`——会话知识沉淀与审核闭环。

## 完成情况

- `src/schema.js`：`MEMORY_DIR = 'memory'`、`MEMORY_SCHEMA_VERSION`、
  `MEMORY_STATUS = ['pending','accepted','rejected']`。
- `src/memory.js`：记忆条目存储层——`slugifyMemory`（纯 ASCII 归一，
  48 字符截断；纯非中文标题归一为空串时由调用方用 `memory-<timestamp>`
  兜底）、`writeMemory`（JSON frontmatter + kind=memory + 正文）、
  `listMemory`（按状态过滤，坏条目跳过，不存在目录降级空数组）、
  `setMemoryStatus`（重写 frontmatter，保留正文）。
- `src/tool-memory.js`：工具四动作——`write`（title/body 必填；
  tags/path 可选；status 默认 pending，可显式 accepted）、`list`
  （默认 pending，可过滤 accepted/rejected）、`accept`/`reject`
  （按 slug 状态流转，不存在给出可读提示）。
- `index.js` 注册第 7 个工具；plugin.test 注册名列表同步。
- 测试：memory 存储层单测（4 条）+ 工具端到端审核闭环（75/75 全绿）。

## 设计决策（对方案的偏离）

1. **显式写入替代日志投影**：方案设想由 sessionProjections 投影会话
   日志自动产生候选。实现改为模型显式调用 `repowiki-memory write`：
   投影自动候选需要文本判定（长消息/问句/决策线索）规则，噪声大且
   维护成本高；显式写入与"工具由模型调用"的整体架构一致，候选质量
   由调用方保证。审核闭环（pending → accepted/rejected）与方案的
   "候选审核"语义完全一致。
2. **条目独立目录而非 knowledge/ 卡片**：记忆条目不是文件级卡片
   （无源文件摘要契约），放 `memory/<locale>/` 与卡片解耦；frontmatter
   复用 JSON+--- 形态与 schemaVersion 版本化约定。
3. **纯非 ASCII 标题兜底**：中文标题 slug 化为空串，用时间戳兜底
   （`memory-<ts>`），保证写盘稳定且可列。

## 风险与遗留

- 记忆条目尚未被 `repowiki-cards` 检索与 `repowiki-generate` 消费：
  候选沉淀后缺少"被用起来"的出口。下一步可让 generate 的卡片汇总
  包含 accepted 记忆条目，或 cards 工具加 includeMemory。
- 审核状态仅本地（Git 共享），多人协作时审核冲突未处理（写时覆盖）。
- GUI 面板未展示记忆条目（切片未覆盖）。

## 消费侧（v0.10.0）：记忆进入 Wiki 生成

- `repowiki-generate` 读 accepted 记忆（标题 + 正文首行，上限
  `MAX_MEMORIES_IN_PROMPT = 20`），注入生成 prompt 的 "Reviewed session
  knowledge" 段与任务第 5 条（作为项目约定/决策上下文组织进页面、保持
  标题可追溯）；输出新增 `memoriesRead`。
- `listMemory` 增 `withBody` 可选参数（去 frontmatter 与标题行的正文）；
  `generatePrompt` 增可选 `memories` 参数（空时渲染 (none)）。
- 测试：prompt 注入与 withBody 分支（78/78 全绿）。

## 消费侧扩展（v0.11.0）：检索可见记忆

- `repowiki-cards` 新增 `includeMemory`（默认 false）：附已采信记忆条目
  （slug/title/tags/summary/可选 path），query 非空时对 title+tags+body
  做同一查询的子串过滤；render 附加 "Memory: …" 行。
- 至此记忆的三个出口齐备：沉淀（write）、审核（accept/reject）、消费
  （generate 汇总 v0.10.0 / 检索可见 v0.11.0）。
- 测试：默认关闭、空 query、query 过滤、pending 排除（LANG 环境隔离；
  79/79 全绿）。

## 面板视图（v0.12.0）：记忆第三页签

- Cards / Wiki / Memory 三页签；记忆页列 `.dsh-repowiki/memory/<locale>/`
  条目，按状态着色徽章（accepted 主色 / pending 灰 / rejected danger），
  点击以 pre 原文呈现，附返回控件；Escape 同时关闭卡片与记忆详情。
- `loadMemoryEntries` 经同一 `ctx.remote.workspaceFiles` 通道（目录缺失
  时降级空数组）；挂载/切换/页面重新可见时随主加载一并刷新。
- 记忆三出口齐备：generate 汇总（v0.10.0）、检索可见（v0.11.0）、面板
  展示（v0.12.0）。
- 测试：记忆页签列表+徽章+详情（80/80 全绿）。

## 下一步

- 切片 2（多工作区总览）受跨工作区读取限制，需真实环境验证。
- Phase 4"可选语义索引"按方案保持后置（YAGNI）。
