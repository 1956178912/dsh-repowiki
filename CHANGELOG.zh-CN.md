# 变更记录（中文摘要）

本文件是 [CHANGELOG.md](CHANGELOG.md) 的中文摘要镜像：英文版为权威记录，
此处每版给出 1–4 条要点。版本遵循 README 路线图的阶段划分。

## [0.23.0] - 2026-11-26

- **门面双语补齐**：新增 `CHANGELOG.zh-CN.md`（本文件，摘要式镜像并与英文版
  互链）；`README.zh-CN.md` 从 v0.20.0 同步到最新（令牌实证、漂移自检、npm
  scripts、目录结构、用例数）。
- **插件元数据更正**：`locale/{en,zh}.json` 的 meta 描述停留在 Phase 1
  （"提供 repowiki-index 与 repowiki-cards"），现改为完整能力描述并列出全部
  八个工具名。
- 新增 `test/locale.test.js` 门面一致性守卫（123/123）。

## [0.22.0] - 2026-11-26

- 新增**宿主主题令牌漂移自检**：`scripts/verify-host-tokens.mjs`
  （`npm run verify:host`）解析本机 app.asar，核对 client.js 引用的每个
  `--dsw-alias-*` 令牌在 dsh 自带 CSS 中仍有定义且有深色变体
  （`body[data-ds-dark-theme]`）。令牌清单从 client.js 自动收集，不过期；
  CI 无 app.asar 时 exit=3 跳过而非失败。同步落地为
  `test/host-tokens.test.js`（本机断言、CI 跳过）。
- 补 npm scripts（`test` / `test:coverage` / `verify:host`）；README 补
  升级回归流程说明。

## [0.21.0] - 2026-11-26

- **主题令牌从二手推断升级为一级实证**：直接解析 app.asar 提取官方
  CSS——`dsh-client-ui-theme/src/styles/design-platform.css` 定义全部 264
  个 `--dsw-alias-*` 令牌（每个含深色重定义），主前端壳消费 348 处，
  本插件 7+1 个令牌全部命中；方法与证据见 ADR-0004 §5。
- 修复用户反馈的"灰蓝状态点难区分"：已生成点改用语义令牌
  `state-done-primary`（紫 rgb(124,58,237)），smoke 测试加回归断言。

## [0.20.0] - 2026-11-26

- 新增**故障注入 DOM 测试套件**（8 例）：ErrorBoundary 在真实 React 下
  正向验证（渲染期抛错显示内联错误而非白屏）；加载失败→错误码插值+重试；
  单库无会话/无资产分支；总览逐工作区失败行；损坏远端结果不殃及整页；
  谎报 eof 的分页仍然正确。
- DOM 测试机械抽取为 `test/lib/dom-harness.mjs`。

## [0.19.0] - 2026-11-26

- 修复 `repowiki-extract` 结果缺 `skippedManual`/`orphaned` 字段
  （output schema 声明为必填，渲染层会打印 "undefined"）。
- 新增 LLM 执行路径的**契约级子代理桩**测试（`test/tool-llm.test.js`）：
  activation 契约、首轮写卡带 `sourceDigest`、digest 命中跳过、人工编辑
  保护、失败上报、Wiki 消费卡片；覆盖率 89.9% → 94.7%。

## [0.18.0] - 2026-11-26

- **多工作区总览**（ui-plan 切片 2）：面板默认总览模式，每行一个工作区
  （标题/路径/状态点/统计/最近索引时间），点击下钻单库视图。技术顾虑
  消解：每条目自带 `sessionIds`，复用既有按会话 scope 的读取通道。
- 修复主按钮 style 警告（shorthand/longhand 混用）。

## [0.17.0] - 2026-11-26

- 新增**真实 React 18 + jsdom 的 DOM 集成测试**：对真实 DOM 派发真实
  change/click/keydown 事件（React 合成事件根委托），闭合"点击无反应"
  的复现盲区——事件级接线验证健康。
- 新增 devOnly 测试依赖（react/react-dom/jsdom，均 MIT），不改变零运行
  时依赖形态；CI 安装 dev 依赖后跑套件。

## [0.16.0] - 2026-11-26

- 新增**真实语料客户端回归测试**：把本仓库自产的 `.dsh-repowiki/` 卡片
  灌入面板渲染路径（LLM 生成内容与手写 fixture 形态不同）。
- 新增**事件处理器兜底**：React 错误边界不捕获事件处理器抛错（表现为
  "点击无反应"），所有交互处理器包 guard，抛错/拒绝转为可读状态行。
- 新增 **CI 门禁**（`.github/workflows/tests.yml`，Node 22/24）：补齐方案
  §10.3-8 最后一条硬条款。

## [0.15.0] - 2026-11-26

- DRY 重构：`cwdOf`（8 处重复）、`resolveTarget`（2 处）、frontmatter
  编解码（3 处）收敛进 `src/util.js`，行为字节一致，净 −139 行。

## [0.14.0] - 2026-11-26

- 面板级 **ErrorBoundary**：渲染期抛错显示内联错误行而非白屏整个 main
  slot；`componentDidCatch` 以 `repowiki:` 前缀写 console。

## [0.13.1] - 2026-11-26

- 修复深色模式：此前使用的 `--dsw-alias-color-*` 令牌名在本机构型不存在，
  所有 `var()` 回退浅色字面量（用户看到的 wiki `a.js` 白底白字）。换成
  官方页面验证过的令牌名（label/bg-layer/border/state-*）。

## [0.13.0] - 2026-11-26

- Wiki 与记忆详情改为**排版文字渲染**（零依赖 Markdown 渲染器）而非源码；
- 卡片详情展示完整正文（摘要之外的用途/关键符号/陷阱/关联模块）。

## [0.12.0] - 2026-11-26

- 面板新增 **Memory 页签**：列出记忆条目（状态徽章着色）并查看原文；
- 会话记忆三出口齐备（生成汇总 v0.10.0 / 检索 v0.11.0 / 面板本版）。

## [0.11.0] - 2026-11-26

- `repowiki-cards` 新增 `includeMemory`：把已 accept 的记忆条目按同一查询
  附到检索结果。

## [0.10.0] - 2026-11-26

- `repowiki-generate` 读取已 accept 的记忆作为项目约定/决策注入综合
  prompt，输出 `memoriesRead` 报告用量。

## [0.9.0] - 2026-11-26

- 新增 `repowiki-edit`：手工卡片 `create`（路径可不在索引内）与 `update`，
  均置 `manuallyEdited` 停止自动刷新；纯文件操作无模型调用。

## [0.8.1] - 2026-11-26

- 修复面板读取：`remote.workspaceFiles` 返回 RemoteResult
  （`{ok,value}`/`{ok:false,error}` 且永不 reject），此前直取 payload 导致
  全部加载失败（伪 `workspace-file/bad-read`）。

## [0.8.0] - 2026-11-26

- 新增 `repowiki-memory` 工具：会话知识写入 `.dsh-repowiki/memory/<locale>/`
  + `list`/`accept`/`reject` 审核闭环；偏离方案（投影候选→模型显式写入）
  记录于 `docs/checkpoints/phase-4a.md`。

## [0.7.0] - 2026-11-26

- 面板切片 3：**待更新检测**（digest 不一致的卡片计入提示并加 Stale 筛选）
  与 **Wiki 页签**。

## [0.6.0] - 2026-11-26

- 新增 `repowiki-export`/`-import`：整树快照备份/还原，overwrite 保护、
  index 兼容校验；Phase 3 完成。

## [0.5.1] - 2026-11-26

- 人工编辑保护（`manuallyEdited` 卡片不被自动刷新）与孤儿卡计数上报。

## [0.5.0] - 2026-11-26

- **内容 digest 增量重建索引**（sha256 前 12 位；未变化文件复用旧条目）；
- 卡片 frontmatter 记 `sourceDigest`，源文件变化才刷新。

## [0.4.0] - 2026-11-26

- Repo Wiki 面板切片 1：统计、全部/已生成/未生成筛选、搜索、网格/列表、
  卡片详情（Escape 关闭）。

## [0.3.0] - 2026-11-26

- Web 客户端模块：侧栏入口 + 独立页面 + 四个生成动作（经
  `ctx.uiWorkspace.startSession`，ADR-0004）。

## [0.2.0] - 2026-11-26

- 新增 `repowiki-extract`（每文件一个 spawn 子代理生成知识卡片）与
  `repowiki-generate`（消费卡片综合 Wiki）+ 项目级 plan 配置。

## [0.1.0] - 2026-11-25

- `repowiki-index`（零 LLM 确定性符号索引）+ `repowiki-cards`（跨会话检索）；
- 零 npm 运行时依赖、零构建工具。
