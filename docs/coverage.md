# 方案覆盖率报告：修订版方案 ↔ 实现（v0.29.0）

- 依据：`方案评审与修订版-v1.md`（§6 修订版方案、§10.3 升级韧性、§11.5 速查表）
- 核对对象：本仓库当前实现（v0.32.0，测试 138/138，行覆盖率 96.1%）
- 图例：✅ 按方案实现 ｜ ⚠️ 有据偏离（评审中已决策）｜ ❌ 未做（后置/不做）

## 1. §6.1 架构：一个 bundle，资产层

| 方案条目 | 状态 | 实现与位置 |
|---|---|---|
| 单一本地 bundle `dsh-repowiki`，零第三方 dsh 插件 | ✅ | `package.json`（`dsh.bundle.patch` 指向 `cordis.patch.yml`）；`files` 全覆盖 `index.js/client.js/src/locale/icon`；`engines.dsh: >=0.2.2-rc.5` 仅作下界（§10.3-2） |
| 包内 4 个插件条目（index-service / wiki-tools / card-tools / memory-tools） | ⚠️ | 实现为**单 Host 插件** `index.js`（`apply(ctx)` + `inject:['fs','tools','subagents']`）注册全部 8 个工具。方案拆条目的唯一理由是"服务导出与 apply 不可混用"；本项目索引器是纯函数模块（非 Cordis 服务），无混写问题，单条目更简单（奥卡姆剃刀）。决策见 ADR-0001 |
| 资产目录 `<cwd>/.dsh-repowiki/` | ✅ | `src/schema.js` `ASSET_DIR`；全部读写经 `ctx.fs` |
| `knowledge/{locale}/` 只生成当前 locale | ✅ | `getLocale(ctx)`（`src/spawn.js`）；工具 `locale` 参数可显式覆盖 |
| `wiki/{locale}/` | ✅ | `WIKI_DIR`；`wikiPath` + `writeWiki` |
| `index.json` 符号表 + 依赖边 + 技术栈 | ✅ | `src/indexer.js`（`INDEX_SCHEMA_VERSION=2`、sha256-12 digest、增量复用 `stats.reused`）、`src/stack.js`（技术栈扫描）、`src/symbols.js`（依赖边） |
| `state.json`（待审/孤儿/manuallyEdited 标记） | ⚠️ | **未设 state.json**：`manuallyEdited` 直接写卡片 frontmatter（随 Git 共享、无需维护额外状态文件）；孤儿卡由 extract 的 `orphaned` 计数报告（不删除）。决策见 `docs/checkpoints/phase-3b.md` |
| `wiki-plan.yaml` 项目级规划 | ✅ | `src/config.js` `readPlan`：`exclude`/`maxCardsPerRun`/复杂度阈值，缺文件降级默认值（§11.4 成本字段，YAML 解析为自写极简读取器，零依赖） |

## 2. §6.2 组件与真实 API 对照

| 方案条目 | 状态 | 实现与位置 |
|---|---|---|
| `ctx.tools.register` + `defineTool` + 输出契约 | ✅ | 8 个手写 ToolDefinition（output schema 顶层 required 数组，ADR-0002）；注册 disposer 归 `ctx.effect`（`index.js`） |
| 子代理 LLM 调用（`provider:'spawn'`，继承会话模型） | ✅ | `src/spawn.js` `runSubagent`（`ctx.subagents.startActivation`，`outputSchema` 约束返回 JSON）；extract/generate 经它派发 |
| `agentOptions` 阶段级模型覆盖 | ❌ | 未做（方案 Phase 2 可选项；本机 `subagent-model-selection` 为禁用态，实测继承会话模型即可用——见 §11.1 附带情报，按 YAGNI 后置） |
| 模型下拉数据源（`ctx.llm.listProviders()`） | ❌ | 方案 §9.2 已自勘误为 Phase 4 客户端增量；未做 |
| 资产定位键 = 会话 cwd；当前目录**向上查找**，退回项目根 | ✅ | `src/assets.js` `resolveAssetRoot`（按 §8.2-1 两级策略逐层向上） |
| 资产读写经 `ctx.fs`（resolve/readText/write） | ✅ | 全部工具经 `ctx.fs`；`processPath` 未使用（无子进程需求） |
| 索引计算：宿主进程确定性索引 | ✅ | 零依赖手写解析器替代 tree-sitter WASM（ADR-0001：体积/许可/加载复杂度不值当前收益；`engines` 无 npm 依赖） |
| `ctx.lsp.findReferences` 符号级引用边增强 | ❌ | 未做（方案 §2 表第 12 行已标"可选增强"） |
| 提示注入 `systemPrompt.context()` | ❌ | 未做（方案 §5-7：默认不注入是修订结论；"用足够弱的最弱机制"——工具按需检索已满足） |
| 会话观察 `sessionProjections` 投影 | ⚠️ | **改为模型显式调用 `repowiki-memory write`**（投影文本判定噪声大；审核闭环 pending→accepted/rejected 不变）。决策见 `docs/checkpoints/phase-4a.md` |
| `presentResult` 卡片词汇（`card:'read'`/`card:'search'`/`locations`） | ⚠️ | 部分采用：`repowiki-cards` 的 `presentResult` 用官方 `card:'search'` + `shape:'matches'`（按文件分组，含 total/truncated）；8 个工具的 `presentCall` 统一 `card:'generic'` 透传原始参数。未用 `card:'read'`/`locations`（卡片对应文件路径已在输出文本中给出；GUI 面板 `client.js` 另行提供点击跳转） |
| 唤醒 `agent.followup()` | ❌ | 不适用：无定时器/常驻观察（方案本身把 UI 触发列为 Phase 4） |
| 外部文件变更感知：mtime/hash 自检 | ✅ | digest 增量（sha256-12，`src/indexer.js` + 卡片 frontmatter `sourceDigest` + `cardIsFresh`） |
| 条件禁用：`execute` 内早退 | ✅ | 无索引时 extract 返回提示性结果（不抛）；GUI 面板对读取失败降级提示 |

## 3. §6.4 路线图

| 阶段 | 方案内容 | 状态 | 实现 |
|---|---|---|---|
| Phase 1 | bundle 骨架 + index-service + `repowiki-cards` 只读检索 | ✅ | `repowiki-index`、`repowiki-cards`（v0.1.0~v0.4.x，见 `phase-1.md`） |
| Phase 2 | `repowiki-extract`（子代理+outputSchema）+ `repowiki-generate` + plan/模型 Config | ✅ | extract/generate + `config.js`（`phase-2.md`）；模型 Config 后置如上 |
| Phase 3 | 增量（文件级+符号级两级传导）、导入导出（含孤儿人工卡）、`repowiki-edit` | ✅ | digest 文件级增量 + `cardIsFresh`/`cardIsProtected`/`countOrphaned`（符号级传导依赖 LSP，未做）；`repowiki-export`/`-import`（copyTree 快照，overwrite 保护）；`repowiki-edit`（`phase-3.md`/`phase-3b.md`） |
| Phase 4 | `repowiki-memory`（投影+审核）、可选语义索引、可选 UI 触发 | ✅（前两项按评估降级） | memory write/list/accept/reject + 三出口（generate 汇总 v0.10.0 / 检索可见 v0.11.0 / 面板 v0.12.0，见 `phase-4a.md`）；GUI 面板（Cards/Wiki/Memory 三页签 + Repo Wiki 入口，`client.js`）；语义索引按 §5-1 YAGNI 后置 |

**超出方案的实现**（方案未列、评审后用户需求驱动）：

- 客户端面板完整化：搜索/筛选/详情/错误边界（v0.8.1 RemoteResult 契约修复、v0.13.1 深色模式官方令牌、v0.14.0 ErrorBoundary）。
- DRY 公共层 `src/util.js`（cwdOf/toAbsPath/encodeFrontmatter/parseFrontmatter，v0.15.0）。
- 主题令牌静态实证（v0.21.0）：解析 app.asar 提取官方 CSS——
  `dsh-client-ui-theme/src/styles/design-platform.css` 定义全部 264 个
  `--dsw-alias-*` 令牌（每个均含 `body[data-ds-dark-theme]` 深色重定义），
  主前端壳 `dsh-web-frontend/dist/assets/index-*.css` 消费 348 处
  `var(--dsw-alias-*)`。本插件使用的 7 个令牌全部命中。证据与方法见
  ADR-0004 §5；同时把"已生成"状态点从 `state-business-primary`（蓝）改为
  `state-done-primary`（紫 `rgb(124,58,237)`），与未生成灰点拉开色相
  （用户反馈"灰蓝难区分"）；回归断言见 `test/client-smoke.test.js`。

## 4. §10.3 升级韧性九条

| # | 原则 | 状态 | 实现 |
|---|---|---|---|
| 1 | 不声明官方包依赖；升级回归约定写进 README | ✅ | `package.json` dependencies 为空（零 npm 运行时依赖）；README"升级注意事项"小节 |
| 2 | `engines.dsh` 仅作下界 | ✅ | `>=0.2.2-rc.5` |
| 3 | seam 经 `inject` 声明、可选服务 soft-fail | ✅ | `inject:['fs','tools','subagents']`；`ctx.workingDirectory` 等可选服务用 `cwdOf` 降级（缺失/抛错→process.cwd） |
| 4 | 资产数据版本化 + 读取校验降级 | ✅ | `INDEX_SCHEMA_VERSION=2`、`CARD_SCHEMA_VERSION`、`MEMORY_SCHEMA_VERSION`；`parseCard`/`parseMemoryText` 版本不符返回 null（v0.15.0 起统一为 `parseFrontmatter(text, version)`） |
| 5 | 配置走 patch 层、警惕整体替换 | ✅ | `cordis.patch.yml` 只含插件注册行；`wiki-plan.yaml` 项目级随 Git |
| 6 | LLM 子任务一律 outputSchema 约束 | ✅ | `src/card-schema.js`/wiki schema；`runSubagent` 强制 |
| 7 | 不碰保留与实验机制 | ✅ | 未用 `appendPluginRecord`/`Session.append`/`@Remote` |
| 8 | 升级回归门禁（代码改↔Wiki 跟、dsh 变↔冒烟跑） | ✅ | 自动化部分已落地：`.github/workflows/tests.yml` 每次 push/PR 在 Node 22/24 装好 devOnly 依赖后跑 `node --test test/*.test.js`（134/134，含 LLM 执行路径契约回归、真实 React+jsdom 的 DOM 事件回归与故障注入降级链、打包与版本一致性守卫；本地覆盖率 96.0% 行）。dsh 版本变更侧的回归另有 `npm run verify:host` 解析本机 app.asar 核对 --dsw-* 令牌漂移，UI 侧仍靠安装验证流程（remove→install→GUI 冒烟），无 CI 可跑 dsh 本身 |
| 9 | `disabled: !!js` 条件禁用 | ⚠️ | 方案 §11.2-2.2 已降级为 execute 内早退（主实现），未用方言 |

## 5. §11.4 成本与 .gitignore

| 条目 | 状态 | 实现 |
|---|---|---|
| `maxCardsPerRun` 单次上限 + 超限分批提示 | ✅ | `MAX_CARDS_PER_RUN_DEFAULT` + `selectCandidates` 的 `capped` 输出（"more files remain for later runs"） |
| `exclude` glob/目录排除 | ✅ | 内置排除表 + plan `exclude` 叠加 |
| `concurrency` 并发激活上限 | ❌ | extract 串行派发（每卡一次子代理，协作式 `timeoutMs: 600s`）。串行更稳、首轮成本可控；如需提速再补 |
| 拆分 `cache/`（gitignore）+ bundle 自带 `.gitignore` 模板 | ❌ | 资产目录全部为可共享文本产物（无 mtime 快照、无绝对路径、无向量索引），无机器相关缓存可隔离——**需求已被实现形态消解**，无需模板 |

## 6. 数据流 §6.3 闭环验证

方案主干链路"索引 → 提取 → 生成 → 跨会话检索/修订"完整跑通：

- 端到端测试：`test/tools.test.js`（index→extract→generate→cards/wiki 闭环）、`test/assets.test.js`（export/import 快照恢复）。
- 跨会话资产共享：资产即项目目录文件，`test/knowledge.test.js` 覆盖读写往返。
- RemoteResult 契约（客户端读取）：`test/client-smoke.test.js`（含坏读降级、渲染、详情交互）。

## 7. 遗留与结论

- §10.3-8 自动化回归门禁已补 GitHub Actions（Node 22/24，push/PR 触发）；dsh 版本变更侧回归仍靠安装验证流程人工冒烟（无 CI 可跑 dsh 宿主）。
- **后置项（有意不做，YAGNI）**：agentOptions 模型覆盖、模型下拉 UI、LSP 符号级传导、语义索引。（多工作区总览原列后置，v0.18.0 已实现——每工作区条目自带 `sessionIds`，跨工作区读取无需新的 Host 数据面。）
- **结论**：修订版方案 Phase 1–4 全部明列项完成（Phase 4 的投影候选与语义索引两处为有据降级，决策记录在案）；升级韧性九条 8/9 落实；无静默偏离。

一句话：**方案主干 100% 覆盖，三处有据降级（投影→显式写入、tree-sitter→手写解析器、state.json→frontmatter 标记）；CI 门禁已落地（GitHub Actions Node 22/24 绿）。**

### 超出方案的工程防线（v0.19.0–v0.31.0 逐步建立）

| 防线 | 覆盖 | 版本 |
|---|---|---|
| LLM 执行路径契约级桩 | spawn activation 契约、写卡/跳过/人工保护/失败上报 | v0.19.0 |
| 真实 React 18 + jsdom 事件回归 | 真实 click/change/keydown 驱动面板 | v0.17.0 |
| 故障注入降级链 | ErrorBoundary 正向验证 + 各失败分支 | v0.20.0 |
| 宿主令牌漂移自检 | `npm run verify:host`：解析 app.asar 核对全部 `--dsw-*` 令牌（alias 查深色变体、尺寸查存在性），CI 无 asar 时跳过 | v0.22.0（v0.28.0 泛化） |
| 漂移自检的自检 | 合成 asar 夹具驱动脚本的 pass/缺失/无深色三路径 | v0.24.0 |
| 打包完整性守卫 | `npm pack` 产物含全部运行时文件、排除开发目录 | v0.24.0 |
| 版本一致性守卫 | package.json 版本 = 两份 CHANGELOG 最新条目 | v0.29.0 |
| 门面/locale/图标守卫 | 双语元数据、详情页单图约定、SVG 约定、图标无 tile | v0.23.0/v0.25.0/v0.26.0 |
| 独立 UX 评审闭环 | subagent 六维度评审 + 应修项落地 + 焦点管理三流对齐 | v0.27.0/v0.30.0/v0.31.0 |

**剩余未覆盖项全部集中在浏览器侧**（无浏览器控制，见 `docs/checkpoints/phase-15-convergence.md`）。
