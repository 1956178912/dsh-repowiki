# dsh-repowiki

**仓库符号级知识索引 + 跨会话检索** —— 一个 DeepSeek Harness (DSH) 本地插件 bundle。

把当前仓库索引为符号级知识库 `.dsh-repowiki/`（随 Git 共享），任意会话打开同一目录即可查询符号、文件与依赖关系，无需重读源码。

[中文](README.zh-CN.md) | English（见 [README.md](README.md)）

> 设计依据：仓库 Wiki / 知识卡片功能移植方案的内部评审记录（评审文档本身不包含在本仓库中）。硬约束：零第三方 dsh 插件依赖，全部能力来自 dsh 官方机制。

## 当前阶段：Phase 1–4 完成 + 面板视图 + 多工作区总览（v0.22.0）

| 能力 | 说明 |
|---|---|
| `repowiki-index` 工具 | 确定性（零 LLM）重建索引：符号表、import 依赖边、技术栈识别，写入 `.dsh-repowiki/index.json`；增量——内容摘要未变的文件直接复用上一版条目 |
| `repowiki-cards` 工具 | 跨会话只读检索：按符号名 / 种类 / 路径过滤，返回文件+符号与项目技术栈；`includeMemory` 附带同查询命中的已采信会话记忆 |
| `repowiki-extract` 工具 | 每文件一个 spawn 子代理（继承会话模型）生成知识卡片（职责、关键符号、陷阱、相关模块），写入 `.dsh-repowiki/knowledge/<locale>/`；源文件摘要变化时卡片自动刷新，但标记为 `manuallyEdited` 的卡片受保护；源文件已消失的卡片报告为孤儿 |
| `repowiki-generate` 工具 | 只读卡片集合 + 技术栈（+ 已采信的会话记忆作为约定/决策），凝练为按主题分组的 Wiki 页面（Markdown + 可选 mermaid），写入 `.dsh-repowiki/wiki/<locale>/` |
| 项目级规划 | `.dsh-repowiki/repowiki-plan.json`（随 Git 共享）：exclude / includeOnly / maxCardsPerRun / cardComplexityThreshold |
| `repowiki-export` 工具 | 把 `.dsh-repowiki/` 资产复制为目录快照（备份或转移；仅 Markdown/JSON，无模型调用）；目标非空时默认拒绝，除非 `overwrite` |
| `repowiki-import` 工具 | 从快照目录恢复 `.dsh-repowiki/`；已有资产默认受保护，除非 `overwrite`；恢复后校验 `index.json` 兼容性 |
| `repowiki-edit` 工具 | 人工修订知识卡片：`create` 新建人工卡（path 可为索引外路径），`update` 改写现有卡片；两者置 `manuallyEdited`，`repowiki-extract` 不再自动刷新该卡 |
| `repowiki-memory` 工具 | 把本会话学到的知识沉淀到 `.dsh-repowiki/memory/<locale>/`（默认 `pending` 待审），再经 `list` / `accept` / `reject` 完成审核闭环；条目为带 JSON frontmatter 的 Markdown，随 Git 共享 |
| Repo Wiki 面板（web） | 侧栏"自动化任务"旁的"Repo Wiki"入口，打开工作区页面。**默认总览模式**列出所有工作区的状态点与统计；点击行下钻单库视图：文件/符号/卡片/文档统计与最近更新、"全部/已生成/未生成/待更新"筛选（未生成 = 在 `index.json` 中但没有卡片；待更新 = 卡片 digest 与索引不一致）、搜索、网格与列表视图、卡片详情、以及浏览已生成页面的 Wiki 页签——数据经 `ctx.remote.workspaceFiles` 从 `.dsh-repowiki/` 读取——以及生成动作（ADR-0004） |

路线图：
- Phase 3（v0.6.0 完成）：内容摘要驱动的索引增量重建、卡片自动刷新、人工修订保护、孤儿卡片报告、目录导入导出
- Phase 4（v0.12.0 完成）：会话记忆工具与完整审核闭环、记忆三出口（生成汇总 / 检索可见 / 面板页签）、Repo Wiki 面板
- 巩固（v0.15.0）：重复的路径解析与 frontmatter 编解码逻辑收敛进 `src/util.js`（净 −139 行）；方案覆盖率见 `docs/coverage.md`
- 稳定性加固（v0.16.0）：真实语料客户端回归测试（本仓库自产卡片灌入面板渲染路径）、事件处理器兜底（抛错转为可读状态行而非静默无反应）、Node 22/24 CI 门禁
- DOM 集成（v0.17.0）：真实 React 18 + jsdom 测试套件用真实 click/change/keydown 事件驱动面板（语料同上）——闭合"用户点击无反应"的复现盲区（事件级接线已验证健康）；devOnly 测试依赖（react/react-dom/jsdom）不改变零运行时依赖形态
- 多工作区总览（v0.18.0，ui-plan 切片 2）：每行一个工作区带状态与统计，点击下钻；复用各工作区自身的会话 scope，无需新的 Host 数据面
- 主题令牌实证（v0.21.0）：解析 app.asar 提取官方主题 CSS——`design-platform.css` 定义全部 264 个 `--dsw-alias-*` 令牌（含深色重定义），主前端壳消费 348 处，本插件令牌全部命中；同时"已生成"状态点改用 `state-done-primary`（紫），解决灰蓝难区分
- 宿主漂移自检（v0.22.0）：`npm run verify:host` 直接核对 client.js 引用的令牌在新版 dsh 自带 CSS 中是否仍存在且有深色变体；CI 无宿主时自动跳过
- 可选语义索引按方案保持后置（YAGNI）
- 会话记忆条目对后续会话可见，与知识卡片一同构成知识库

## 架构要点

- **单 bundle、单插件条目、零 npm 运行时依赖、零构建工具**：纯 ES Module，手写 `ToolDefinition`（不 import `@deepseek-ai/dsh-tools`），安装目录即可运行。
- **资产即文件**：索引、卡片与 Wiki 全部落入 `<项目根>/.dsh-repowiki/`，随 Git 共享；定位策略为"当前目录向上查找，退回当前目录"。
- **全部文件 IO 走 `ctx.fs`**（方案 §9.1），不经裸 node fs，保持策略一致性。
- **LLM 子任务走 spawn 子代理**（ADR-0003）：`ctx.subagents.startActivation({provider:'spawn'})` 继承会话模型；结构化输出经 `outputSchema` 约束；取消走 `exec.signal`；Markdown 格式由插件渲染，模型不决定格式。
- **`inject: ['fs', 'tools', 'subagents']`**：均为能力 seam，缺失时插件在该 profile 不激活而非抛错。
- **符号提取为零依赖轻量解析**（ADR-0001），不引入外部解析框架：JS/TS/Python 的函数/类/方法/接口/类型/导入。

## 客户端 UI（web）

`client.js` 是 bundle 的浏览器半边（经 `dsh.client.platform: web` 注册）：
`sidebar.panellist` 侧栏入口 + `main`（key: 'repowiki'）工作区页面。选择
工作区后，页面经 `ctx.remote.workspaceFiles`（由该工作区的任一成员会话授权，
见 `WorkspaceView.sessionIds`）读取
`.dsh-repowiki/`，渲染面板：统计、"全部/已生成/未生成"筛选、搜索、网格/列表
视图与卡片详情。生成动作用 `ctx.uiWorkspace.startSession(workspaceId, ...)`；
图标为自绘 SVG（不 import `dsh-client-ui-primitives`，因其稳定性不受保证）。
安装或升级后需刷新一次 GUI 让客户端模块加载。

```
DSH Plugins > Add plugin > 选择本目录
```

或用 `plugin_manager` 的 `install_bundle`，target 为本目录绝对路径。安装影响该 profile 的所有会话。

## 开发与测试

```sh
# 单元测试（node 内置 test runner，零依赖）
npm test

# 带覆盖率
npm run test:coverage

# 宿主漂移自检：解析本机 app.asar，核对 client.js 引用的每个
# --dsw-alias-* 令牌在 dsh 自带 CSS 中仍有定义且有深色变体；
# 找不到 app.asar（如 CI）时以 exit=3 跳过（v0.22.0）
npm run verify:host
```

## 升级运维约定（dsh 处于 rc 阶段，公开 seam 高频变动）

- 本 bundle **不声明** `@deepseek-ai/dsh-*` 依赖（shipped packages 从 dsh 安装目录解析）——代价是**每次 dsh 升级都必须回归**：跑一遍 `npm test`，再跑 `npm run verify:host`（对照升级后 app 自带 CSS 抓主题令牌改名/删除），并在会话里执行 `repowiki-index` 与 `repowiki-cards` 的最小冒烟。
- `engines.dsh` 只作版本下界，不是兼容性证明。
- `index.json` 带 `schemaVersion`；版本不兼容时读取侧降级提示重建而非崩溃。

## 目录结构

```
index.js               插件入口（apply + inject: fs/tools/subagents）
scripts/verify-host-tokens.mjs  本地宿主漂移自检（令牌存活性，v0.22.0）
docs/detail/           插件管理页详情页（一图式文档，v0.25.0）
cordis.patch.yml       Loader patch（插入插件行）
src/schema.js          常量与领域约定（单一来源）
src/symbols.js         零依赖符号提取（JS/TS/Python）
src/deps.js            import/require 依赖边提取
src/stack.js           技术栈识别（npm/pip/go/cargo）
src/assets.js          资产定位与读写（ctx.fs 注入）
src/indexer.js         索引编排（遍历+提取+边解析+组装）
src/card-schema.js     卡片/Wiki 的 outputSchema（子代理契约）
src/prompts.js         子代理 prompt 构造
src/render.js          卡片/Wiki Markdown 渲染
src/knowledge.js       knowledge/wiki 目录读写、frontmatter 解析
src/config.js          repowiki-plan.json 读取与候选筛选
src/spawn.js           spawn 子代理调用封装
src/transfer.js        导入导出的快照拷贝（ctx.fs 注入）
src/tool-index.js      repowiki-index 工具
src/tool-cards.js      repowiki-cards 工具
src/tool-extract.js    repowiki-extract 工具
src/tool-generate.js   repowiki-generate 工具
src/tool-export.js     repowiki-export 工具
src/tool-import.js     repowiki-import 工具
src/memory.js          会话记忆条目（写读/状态流转）
src/tool-memory.js     repowiki-memory 工具
src/tool-edit.js       repowiki-edit 工具
test/                  单元与集成测试（122 用例）
docs/adr/              架构决策记录（中文）
docs/checkpoints/      阶段检查点（中文）
```

## 许可

MIT（见 [LICENSE](LICENSE)）。
