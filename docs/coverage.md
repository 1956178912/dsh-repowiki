# 方案覆盖率报告：修订版方案 ↔ 实现（v0.125.0）

- 依据：`方案评审与修订版-v1.md`（§6 修订版方案、§10.3 升级韧性、§11.5 速查表）
- 核对对象：本仓库当前实现（v0.125.0）；测试 466/466（`LANG=en` 与 `LANG=zh` 双环境）；`npm run coverage:check` 汇总行覆盖 98.15%、分支 86.43%、函数 95.22%（多次运行波动约 0.2pp，源于定时器/取消分支的调度次序；全量口径；`src/` + `index.js` + `client.js` 的运行时行覆盖约 97.8%）
- 图例：✅ 按方案实现 ｜ ⚠️ 有据偏离（评审中已决策）｜ ❌ 未做（后置/不做）

## 1. §6.1 架构：一个 bundle，资产层

| 方案条目 | 状态 | 实现与位置 |
|---|---|---|
| 单一本地 bundle `dsh-repowiki`，零第三方 dsh 插件 | ✅ | `package.json`（`dsh.bundle.patch` 指向 `cordis.patch.yml`）；`files` 全覆盖 `index.js/client.js/src/locale/icon`；`engines.dsh: >=0.2.2-rc.5` 仅作下界（§10.3-2） |
| 包内 4 个插件条目（index-service / wiki-tools / card-tools / memory-tools） | ⚠️ | 实现为**单 Host 插件** `index.js`（`apply(ctx)` + `inject:['fs','tools','subagents']`）注册全部 11 个工具。方案拆条目的唯一理由是"服务导出与 apply 不可混用"；本项目索引器是纯函数模块（非 Cordis 服务），无混写问题，单条目更简单（奥卡姆剃刀）。决策见 ADR-0001 |
| 资产目录 `<cwd>/.dsh-repowiki/` | ✅ | `src/schema.js` `ASSET_DIR`；全部读写经 `ctx.fs` |
| `knowledge/{locale}/` 只生成当前 locale | ✅ | `getLocale(ctx)`（`src/spawn.js`）；工具 `locale` 参数可显式覆盖 |
| `wiki/{locale}/` | ✅ | `WIKI_DIR`；`wikiPath` + `writeWiki`；模块页写入 `wiki/{locale}/modules/` |
| `index.json` 符号表 + 依赖边 + 技术栈 | ✅ | `src/indexer.js`（`INDEX_SCHEMA_VERSION=5`、sha256-12 digest、增量复用 `stats.reused`、`.gitignore` 子集）、`src/stack.js`（技术栈扫描）、`src/symbols.js`（依赖边）、`src/modules.js`（模块树） |
| `state.json`（待审/孤儿/manuallyEdited 标记） | ⚠️ | **未设 state.json**：`manuallyEdited` 直接写卡片 frontmatter（随 Git 共享、无需维护额外状态文件）；孤儿卡由 extract 的 `orphaned` 计数报告（不删除）。决策见 `docs/checkpoints/phase-3b.md` |
| `wiki-plan.yaml` 项目级规划 | ✅ | `src/config.js` `readPlan`：`exclude`/`maxCardsPerRun`/复杂度阈值，缺文件降级默认值（§11.4 成本字段，YAML 解析为自写极简读取器，零依赖） |

## 2. §6.2 组件与真实 API 对照

| 方案条目 | 状态 | 实现与位置 |
|---|---|---|
| `ctx.tools.register` + `defineTool` + 输出契约 | ✅ | 11 个手写 ToolDefinition（output schema 顶层 required 数组，ADR-0002）；注册 disposer 归 `ctx.effect`（`index.js`） |
| 子代理 LLM 调用（`provider:'spawn'`，继承会话模型） | ✅ | `src/spawn.js` `runSubagent`（`ctx.subagents.startActivation`，`outputSchema` 约束返回 JSON）；extract/generate 经它派发 |
| `agentOptions` 阶段级模型覆盖 | ❌ | 未做（方案 Phase 2 可选项；本机 `subagent-model-selection` 为禁用态，实测继承会话模型即可用——见 §11.1 附带情报，按 YAGNI 后置） |
| 模型下拉数据源（`ctx.llm.listProviders()`） | ❌ | 方案 §9.2 已自勘误为 Phase 4 客户端增量；未做 |
| 资产定位键 = 会话 cwd；当前目录**向上查找**，退回项目根 | ✅ | `src/assets.js` `resolveAssetRoot`（按 §8.2-1 两级策略逐层向上） |
| 资产读写经 `ctx.fs`（resolve/readText/write） | ✅ | 全部工具经 `ctx.fs`；`processPath` 未使用（无子进程需求） |
| 索引计算：宿主进程确定性索引 | ✅ | 零依赖手写解析器替代 tree-sitter WASM（ADR-0001：体积/许可/加载复杂度不值当前收益；`engines` 无 npm 依赖） |
| `ctx.lsp.findReferences` 符号级引用边增强 | ❌ | 未做（方案 §2 表第 12 行已标"可选增强"） |
| 提示注入 `systemPrompt.context()` | ❌ | 未做（方案 §5-7：默认不注入是修订结论；"用足够弱的最弱机制"——工具按需检索已满足） |
| 会话观察 `sessionProjections` 投影 | ⚠️ | **改为模型显式调用 `repowiki-memory write`**（投影文本判定噪声大；审核闭环 pending→accepted/rejected 不变）。决策见 `docs/checkpoints/phase-4a.md` |
| `presentResult` 卡片词汇（`card:'read'`/`card:'search'`/`locations`） | ⚠️ | 部分采用：`repowiki-cards` 的 `presentResult` 用官方 `card:'search'` + `shape:'matches'`（按文件分组，含 total/truncated）；11 个工具的 `presentCall` 统一 `card:'generic'` 透传原始参数。未用 `card:'read'`/`locations`（卡片对应文件路径已在输出文本中给出；GUI 面板 `client.js` 另行提供点击跳转） |
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
| 4 | 资产数据版本化 + 读取校验降级 | ✅ | `INDEX_SCHEMA_VERSION=5`（兼容读取 v2–v4 并在内存补齐模块树/语言分布，ADR-0007）、`CARD_SCHEMA_VERSION`、`MEMORY_SCHEMA_VERSION`；`parseCard`/`parseMemoryText` 版本不符返回 null（v0.15.0 起统一为 `parseFrontmatter(text, version)`）；所有资产写入经 `writeTextVerified` 回读校验 |
| 5 | 配置走 patch 层、警惕整体替换 | ✅ | `cordis.patch.yml` 只含插件注册行；`wiki-plan.yaml` 项目级随 Git |
| 6 | LLM 子任务一律 outputSchema 约束 | ✅ | `src/card-schema.js`/wiki schema；`runSubagent` 强制 |
| 7 | 不碰保留与实验机制 | ✅ | 未用 `appendPluginRecord`/`Session.append`/`@Remote` |
| 8 | 升级回归门禁（代码改↔Wiki 跟、dsh 变↔冒烟跑） | ✅ | 自动化部分已落地：`.github/workflows/tests.yml` 在 Linux/macOS（阻塞）与 Windows（canary）× Node 22/24 上跑 lint、typecheck、密钥扫描、`node --test test/*.test.js`（466/466，含 LLM 执行路径契约回归、多 locale、有界并发与重试、运行快照、行号级反向引用、Wiki 引用反查/跳转与引用完整性、保守导出审计、模块耦合指标、16 语言提取、符号级影响证据与词法使用点、受影响测试路由、PageRank 核心文件与 repo map 兜底、符号锚点上下文包、面板核心文件 chip、真实 React+jsdom 的 DOM 事件回归与故障注入降级链、并发锁接线、打包与版本一致性守卫），并通过 `scripts/check-coverage.mjs` 卡门禁（行 ≥95 / 分支 ≥85 / 函数 ≥85）；CodeQL + `npm audit` + SBOM 独立工作流。dsh 版本变更侧的回归另有 `npm run verify:host` 解析本机 app.asar 核对 --dsw-* 令牌漂移，UI 侧仍靠安装验证流程（remove→install→GUI 冒烟），无 CI 可跑 dsh 本身 |
| 9 | `disabled: !!js` 条件禁用 | ⚠️ | 方案 §11.2-2.2 已降级为 execute 内早退（主实现），未用方言 |

## 5. §11.4 成本与 .gitignore

| 条目 | 状态 | 实现 |
|---|---|---|
| `maxCardsPerRun` 单次上限 + 超限分批提示 | ✅ | `MAX_CARDS_PER_RUN_DEFAULT` + `selectCandidates` 的 `capped` 输出（"more files remain for later runs"） |
| `exclude` glob/目录排除 | ✅ | 内置排除表 + plan `exclude` 叠加 |
| `concurrency` 并发激活上限 | ✅ | extract 按 `concurrency`（1–4，plan/工具参数）有界并发派发子代理；模型调用在资产锁外，写卡逐张进入临界区；取消后不再派发；默认 1 保持旧行为 |
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
| Qoder Repo Wiki 对齐 | 模块树 + 相对路径/行号引用 + 自动目录/章节来源 + 面板分组；引用白名单净化（ADR-0006） | v0.43.0 |
| 并发写串行化 | 六个写工具按资产根进程内 FIFO 排队；原语与工具接线各有回归（ADR-0005） | v0.43.0 |
| 安全与正确性基线 | 面板链接协议白名单、端到端 `AbortSignal` 取消、写后回读校验、索引 schema v3（兼容 v2）、记忆哈希后缀防覆盖；锁范围收窄（ADR-0005 修订） | v0.44.0 |
| 产品与体验 | `.gitignore` 子集、零依赖 BM25 检索、模块级 Wiki + 清单、陈旧/孤儿检测、`repowiki-status`、面板分页/排序/标签/Wiki 搜索/可访问性 | v0.45.0 |
| 工程门禁与发布 | TypeScript `checkJs`（渐进）、ESLint、3 OS CI 矩阵、覆盖率/密钥/依赖/CodeQL 门禁、SBOM、发布脚本、runbook/兼容矩阵/基准文档（ADR-0007） | v0.46.0 |
| 语言与生态扩展 | Go/Rust/Java 符号与本地依赖边（go.mod / Rust 模块约定 / Java 包后缀）、Maven/Gradle 技术栈、Git 溯源（只读 `.git/HEAD`）、语言分布、多 locale 抽取/生成、索引 schema v4（兼容 v2/v3）、记忆重写标题重复修复 | v0.47.0 |
| 反向引用 | `src/references.js` 按需反演 `index.edges`；`repowiki-cards references=true` 有界返回（100 条 + 截断标记）；面板详情展示 import 级引用方；跳过自引用与副作用导入 | v0.48.0 |
| 行号级引用 | 索引 schema v5：`edges[].line` 记录 import/use/require 行号；反引用与面板输出 `path:Lx`；旧索引降级为仅路径；读取兼容 v2–v4 | v0.49.0 |
| Wiki 引用反查 | Wiki 清单 v2 记录章节级 `sections`；`src/wiki-references.js` 反演为源文件 → 页面/章节；`repowiki-cards wikiReferences=true` 有界返回；面板详情展示；v1 清单降级为页面级 | v0.50.0 |
| 8 语言覆盖 | C#/Kotlin/PHP 符号与点分路径依赖边、PHP 大小写不敏感与 `__DIR__` require、Composer 技术栈、全部语言 prompt 围栏；语言表与已知限制写入兼容矩阵 | v0.51.0 |
| 有界并发抽取 | `concurrency`（1–4）计划字段与工具参数；worker 池共享游标、模型调用锁外并发、写卡仍串行；取消停止派发；失败清单按路径排序 | v0.52.0 |
| 抽取重试 | `attempts`（1–3，默认 2）计划/工具参数；抛错与坏输出按指数退避重试（可取消），模型 skip 终止；结果报告 `attempts`/`retried`；取消不计失败 | v0.53.0 |
| Wiki 引用跳转 | 详情"被 Wiki 引用"标题为可点击按钮，按 slug/标题匹配后切换 Wiki 页签并打开页面；`aria-label` 可供键盘/读屏；桩 React 端到端回归 | v0.53.1 |
| Wiki 章节深链 | 引用跳转携带首个被引用章节；WikiPanel 用与 Markdown 渲染相同的 `anchorOf` 计算锚点并 `scrollIntoView`；手动选页/返回清空目标；桩测试断言滚动锚点 | v0.53.2 |
| 抽取运行诊断 | 知识清单 v2 写 `lastRun`（计数/孤儿/失败/重试/截断/并发/尝试/耗时）；`readKnowledgeIndex` 容错读取；`repowiki-status` 输出并渲染 `lastExtract`，缺失显示 none | v0.54.0 |
| 面板运行快照 | 单库统计行读取 `knowledge/<locale>/_index.json` 的 `lastRun` 并渲染抽取/失败/重试；失败数切错误色 + `role=status`；无会话/无资产/无清单时清零，不展示陈旧结果；仅有索引（无 `knowledge/`）按空卡片集呈现而非读取失败 | v0.54.1 |
| 十一语言覆盖 | Ruby（class/module/def/attr/常量，`require_relative` 本地边）、Swift（class/struct/actor/enum/protocol/extension/func/init/typealias，模块级 import 不建边）、Scala（class/case class/trait/object/enum/def，分组/重命名/通配导入经点分后缀解析）；`.rb`/`.rake`/`.swift`/`.scala` 入索引；Gemfile/Package.swift/build.sbt 技术栈 | v0.55.0 |
| 章节 chips 与 Ruby 精度 | 详情按被引章节渲染 chip（上限 4 + `+N`），点击跳到该章节，页面标题按钮仍跳首节，chip 带"页面 · 章节"可访问名；Ruby 块配平忽略 heredoc 内容与 `=begin/=end` 注释，`list << ITEM` 不误判 heredoc | v0.56.0 |
| 检索排序与语言过滤 | `searchIndex` 按精确 > 前缀 > 子串（同强度导出优先）排序符号，文件按最佳命中排序，无 query 保持索引顺序；`repowiki-cards` 增 `lang`/`exportedOnly`；面板多语言时显示语言下拉并在切换工作区时清除失效选择 | v0.57.0 |
| 符号感知搜索与 Scala 3 | 面板卡片搜索加权索引符号名（未生成卡片也可按函数/类名定位）；`repowiki-cards` 输出方法 `parent` 并在渲染中显示"in Type"；Scala 3 缩进体（`object X:` / `def f =`）按缩进推导范围，成员归属正确 | v0.58.0 |
| Wiki 增量合成 | 清单记录卡片指纹 + 已采信记忆指纹；两者一致且清单页面都在磁盘时跳过主题合成（`skippedFresh`，无模型调用），`force` 强制重跑；卡片/记忆/页面缺失任一变化走正常生成；状态工具对"记忆晚于 Wiki"告警 | v0.59.0 |
| SwiftPM target 边 | `Sources/<Target>`（兼容 `Source/<Target>`）建立目标→代表文件索引；`import Core` / `Core.Models` 解析到 `Core` 代表文件；外部模块忽略；解析结果等于自身时丢弃自引用边 | v0.60.0 |
| 生成重试与索引变更计数 | `repowiki-generate` 主题合成支持 `attempts`（1–3，默认 2），抛错/空输出按可取消退避重试，报告 `attempts`/`retried`；`repowiki-index` 报告 `added`/`changed`/`removed`（截断或取消时 removed 不推断） | v0.61.0 |
| 上下文感知卡片与 Scala 3 成员 | 抽取 prompt 注入项目名/技术栈（≤8）/模块路径（≤20）并约束 relatedModules；Scala 3 `extension` 方法归属被扩展类型、`given` 实例登记 variable 且内部方法归属它 | v0.62.0 |
| 大索引面板加载 | 资产 JSON（index 与清单）按 120 页（最多 60 万行）读取，Markdown 页面保持 12 页；仍截断时报 `workspace-file/too-large`，不再把截断内容当 JSON 解析错误；面板桩测试用 6 万行以上索引回归 | v0.63.0 |
| JS/TS 别名与工作区边 | 索引读取 JSONC 容忍的 `tsconfig`/`jsconfig`/`tsconfig.*.json`（上限 200）与嵌套 `package.json`；非相对 import 经 `paths`（精确/通配）+ `baseUrl`（就近配置优先）或工作区包 `exports`（字符串/条件/数组/通配）→ `main` → 源码入口解析；外部包不建边 | v0.64.0 |
| Python 绝对导入边 | `import a.b` / `from a.b import c` 在项目根与任意 `src`/`lib` 布局根下解析；`from 包 import 名` 优先子模块文件；候选根按深度+字典序稳定排序；标准库/第三方不建边 | v0.65.0 |
| SwiftPM 自定义路径 | 解析 `Package.swift` 的 `.target`/`.executableTarget`/`.testTarget` 声明（注释剥离、多行、字符串感知）；显式 `path:` 优先于 `Sources/<Target>` 约定；依赖数组内的 target 引用不被误判；代表文件字典序最小 | v0.66.0 |
| Ruby 加载路径 | 裸 `require 'pkg/file'` 按任意层级 `lib/`（深度优先）再回退项目根解析，修正此前相对当前文件目录的错误；`require_relative` 与显式相对路径保持文件相对；外部 gem 不建边 | v0.67.0 |
| 有界并行索引 | 源码读取/解析默认 8 路并发（`readConcurrency` 1–16）；结果按遍历位置装配，并行/串行产物逐字段一致；取消停止派发并上报部分结果；带延迟 fs 的测试断言真实并发有界 | v0.68.0 |
| C/C++ 支持 | `.c/.h/.cc/.cpp/.cxx/.hpp/.hh/.hxx/.ipp` 索引；类型（含匿名 typedef）、函数/方法/构造/析构/原型与多行签名；引号 `#include` 按文件目录 + `include`/`src`/`inc` 根解析；系统头与宏生成声明不建边/不产符号 | v0.69.0 |
| CMake 技术栈 | `CMakeLists.txt` 的 `project()` 提供项目名，`find_package()`（大小写不敏感、去重）计数并映射常见主流包（Qt/Boost/OpenCV/Eigen/fmt/spdlog/protobuf/gRPC/Catch2/GoogleTest 等）；未知包只计数不臆造 | v0.70.0 |
| 嵌套 CMake | 任意层级 `CMakeLists.txt`（嵌套上限 50）贡献依赖计数与技术，条目带清单来源，跨清单去重；项目名只取根清单 | v0.71.0 |
| Scala 多行签名 | 声明头跨行扫描（括号深度 + 字符串，忽略默认参数 `=` 与类型 `:`），支持 `{`/`=`/`:` 终止与 `extends` 续行；缩进体从签名结束行起算，范围与归属正确 | v0.72.0 |
| 面板可读语言名 | 语言筛选与卡片详情用 `JavaScript`/`C#`/`C++` 等展示名，筛选值保持原始 id；未知语言回退 id | v0.73.0 |
| pyproject 导入根 | setuptools/PDM `package-dir`、`packages.find where` 与 poetry `from` 并入 Python 导入根；绝对路径与 `..` 值忽略；Hatch 列表未解析 | v0.74.0 |
| 面板语言分布 | 单库视图按文件数展示可读语言名（前 8 + `+N`）；优先 `stats.languages`，旧索引回退文件行；单语言隐藏 | v0.75.0 |
| 模块页依赖方向 | 确定性模块页拆分 `依赖模块`（出边）与 `被依赖模块`（入边），各自按边数/路径排序并截断 8 条 | v0.76.0 |
| 尖括号 include | `#include <...>` 提取为非相对，仅在 `include`/`src`/`inc` 根与项目根命中时建边；系统头零边；引号形式保持文件目录优先 | v0.77.0 |
| 模块依赖 prompt | 主题合成注入最多 15 条跨模块边摘要（`summarizeModuleRelations`，同模块忽略、计数/路径排序），并约束只用这些方向 | v0.78.0 |
| 状态模块热点 | `repowiki-status` 输出并渲染前 10 条跨模块依赖边；无索引时为 `(none)` | v0.79.0 |
| 文件出边查询 | `repowiki-cards imports=true` 返回命中文件的出边（目标路径、语句行号、具名符号），与 `references=true` 互补；副作用导入保留、自引用跳过、上限 100 + 截断标记 | v0.80.0 |
| 循环依赖检测 | `src/cycles.js` 以 SCC 口径（迭代 Tarjan）从 `index.edges` 求文件级循环组；`repowiki-status` 输出/渲染前 10 组（每组 ≤30 文件），生成 prompt 注入前 5 组并要求作为架构风险指出 | v0.81.0 |
| 面板依赖列表 | 卡片详情新增出边区块（`→ path:Lx (symbols)`，目标反向引用本文件时 `↔`），上限 8 行 + `+N`；桩测试与真实 DOM 测试各覆盖一次 | v0.82.0 |
| 模块页循环节 | 模块页在出边/入边之外新增"循环依赖"节，列出双向 import 的模块；判断基于完整计数，先于各方向 8 条截断 | v0.83.0 |
| Hatch 导入根 | `pyproject.toml` 的 `[tool.hatch.build]` 与 target 段 `packages` 取父目录为 Python 导入根；多行数组支持，单段/绝对/上跳值忽略 | v0.84.0 |
| Vue SFC | `src/sfc.js` 只保留 script 块、块外置空，符号/import 复用 JS/TS 解析且行号对齐；相对导入、别名与工作区包名照常解析 | v0.85.0 |
| 跳过文件计数 | `stats.skipped` / `stats.skippedTooLarge` 记录不可读与超大文件，warnings、index 工具输出与 status Index 行均展示；取消未派发位置不计入 | v0.86.0 |
| 卡片正文检索 | 面板 `scoreCard` 增正文权重 1；`rows` 预算小写 `bodyText`，短字段构建时小写，避免逐键重复 lower | v0.87.0 |
| Svelte SFC | `.svelte` 与 Vue 共用 `scriptBlockText`；模块与实例 script 块均按源文件行号解析，标记/样式零产出 | v0.88.0 |
| 面板跳过统计 | 单库统计行在 `stats.skipped > 0` 时展示 `跳过文件 N`，title 走本地化文案；为 0 时不渲染 | v0.89.0 |
| 面板循环徽章 | 卡片瓦片/列表行对 SCC 成员渲染 `⟲`（客户端迭代 Tarjan，同 `src/cycles.js` 口径），带本地化 aria/title；非成员不渲染 | v0.90.0 |
| Go 多模块 | 任意层级 `go.mod`（单次 ≤20）各自贡献 module 前缀；解析按目录更深、module 更长优先 | v0.91.0 |
| Go `internal` 可见性 | 目标路径含 `/internal/` 时导入方必须位于其父目录树内（根 `internal/` 不受限，嵌套取最内层边界）；违规仍建边但去重写入 `warnings`，状态工具可见 | v0.98.0 |
| 传递依赖 | `imports=true` 的 `depth`（1–3）按 BFS 展开出边；最小跳数去重、命中文件不作为依赖、环有限、上限 100；条目带 `depth`，渲染 `⇢`/`N hops` | v0.92.0 |
| 面板依赖深度 | 卡片详情"依赖文件"区块提供 1/2/3 跳选择器；客户端 `importsForPath` 与服务端同语义 BFS（最小跳数、自身不列出、环收敛、100 条上限）；`⇢` + `N hops` 标注更深边，重开卡片重置 | v0.93.0 |
| 反向影响面 | `dependents=true` 返回反向 import 边（谁依赖命中文件）；`depth=2..3` 按反向图 BFS 展开间接依赖方，100 条有界、最小跳数、环收敛；渲染 `←`/`⇠` + hops；面板详情新增依赖方区块，与出边共用深度控件 | v0.94.0 |
| fan-in hub | `repowiki-status` 的 `topDependents` 按不同依赖方文件数排名（去重、自引用忽略、并列按路径、上限 10），渲染 `Fan-in hubs:` 行，作为改动风险热点 | v0.95.0 |
| 面板 mermaid | Wiki/卡片 Markdown 的 ` ```mermaid ` 围栏由零依赖渲染器画成内联 SVG：flowchart/graph TD/TB/LR、常用节点形状与箭头、`|label|` 边标签；确定性分层、环上限 12 层、主题令牌；不支持类型降级代码块 | v0.96.0 |
| 面板高风险入口 | 单库视图渲染 fan-in 前三（不同依赖方文件数、并列按路径、去重计数），与 `repowiki-status` 同口径；无依赖边时隐藏 | v0.97.0 |
| 面板索引告警 | `index.json` 的 `warnings` 非空时统计行展示计数，悬停列出前 3 条 + 剩余数量；无告警隐藏 | v0.99.0 |
| 高风险入口可点击 | fan-in chip 为按钮，点击打开对应文件详情（复用行索引与同一详情面板），带本地化可访问名 | v0.100.0 |
| 生成注入 fan-in | 主题 prompt 带前 5 个 fan-in 热点（不同依赖方计数）与"按路径引用、列表为空不得虚构"指令 | v0.101.0 |
| 模块页 fan-in 节 | 确定性模块页追加本模块 fan-in 前三文件（跨模块依赖方计入、自引用忽略、并列按路径），无入边时不产节 | v0.102.0 |
| mermaid subgraph | `subgraph 名称` … `end` 渲染为带组名的虚线分组框（底层），组内节点保持形状、跨组边照常连接 | v0.103.0 |
| 索引告警展开 | 统计行告警计数为按钮（`aria-expanded`/`aria-controls`），点击展开完整列表；悬停保留三条预览 + 展开提示 | v0.104.0 |
| mermaid 指令对齐 | 合成 prompt 要求 `flowchart TD/LR`、同模块/层节点包进 `subgraph`、标签简短；与面板零依赖渲染器能力一致 | v0.105.0 |
| internal 告警有界 | Go `internal` 违规告警上限 50 条，其余折叠为一条汇总，避免索引与状态输出膨胀 | v0.106.0 |
| 状态告警有界 | `repowiki-status` 文本报告最多 3 条 warning + 折叠计数；结构化 `warnings` 保留全量 | v0.107.0 |
| 循环代表性路径 | 每个 SCC 附一条从字典序最小文件出发的最短闭合路径 `sample`（≤12 节点，超出为空）；状态行渲染短环 `e.g. a → b → a`，合成 prompt 同步 | v0.108.0 |
| 面板循环徽章路径 | 客户端本地计算 SCC + 最短环；2–3 文件环的 `⟲` tooltip 追加 `（如 a → b → a）`，更长环只给组大小 | v0.109.0 |
| 详情循环摘要 | 卡片详情顶部展示 `⟲` 组大小，2–3 文件环追加代表性路径（无卡片文件同样展示） | v0.110.0 |
| 环内路径可点击 | 详情环路径中的其他文件为按钮（`openFile` 可访问名），点击经行索引打开对应详情；当前文件保持纯文本 | v0.111.0 |
| 依赖条目可点击 | 依赖/依赖方列表中的路径为按钮（保留行号），点击打开目标文件详情；与环路径共用 `openFile` 回调 | v0.112.0 |
| 跨语言资产回退 | 未显式指定 locale 时，cards 的正文检索/记忆/Wiki 引用与 status 按"环境语言 → 实际有卡片/Wiki/记忆的另一语言"回退；显式 locale 严格；输出 `locale`/`localeRequested`/`localeSource`，status 另给 `availableLocales` | v0.113.0 |
| 文档覆盖率与健康度 | status 的 `coverage` 以 plan 复杂度阈值下有资格生成卡片的文件为分母，输出已覆盖/新鲜/陈旧/百分比与缺口最大的模块（≤5）；`health` 四分量加权（40/25/20/15）给出 A–D 等级、分量明细与前四条待办 | v0.114.0 |
| 变更影响面工具 | `repowiki-impact` 匹配变更路径（绝对路径/后缀/唯一 basename，歧义只列候选），反向 BFS 求直接/传递依赖方（1–3 跳、明细有界但总数精确），返回相关循环组、fan-in、受影响卡片（含陈旧）与 Wiki 引用、四因子风险分层与验证建议 | v0.115.0 |
| 符号级影响面 | `symbols` 支持裸名与 `path#name`；直接层要求具名 import 证据，排除副作用导入及同文件其他符号的导入方；传递层保守展开；未解析符号不回退为文件模式；保留文件级影响总数作为上界 | v0.117.0 |
| 任务上下文包 | `repowiki-context` 融合标识符/路径/anchor/文档 BM25 路由，一次输出相关符号、带行号源码、直接 imports/dependents、循环与 fan-in；2,000–40,000 字符硬预算，省略分类计数；单文件读取失败进入 Caveats；无索引/空查询/无命中可降级 | v0.117.0 |
| 词法使用点证据 | 符号模式扫描直接具名导入方，按标识符边界定位出现行；排除多行 import/export 列表、解构绑定与整行注释；20 文件 / 每符号 10 条 / 总计 100 条有界；读取失败与文件上限跳过分别披露；明确非调用图 | v0.118.0 |
| PageRank 核心文件 | `src/graph-rank.js` 在静态 import 图上做确定性 PageRank（边去重、忽略自引用、dangling 均分、阻尼/收敛固定）；status 输出前 10 coreFiles（仅索引有边时）并渲染；context 无命中时用前 5 作 repo map 兜底并显式标注非任务相关性 | v0.119.0 |
| 上下文符号锚点 | `repowiki-context` 支持 `symbols`（裸名/`path#name`），可脱离 query；限定路径复用影响面匹配，裸名多文件定义列候选不猜；锚点失败不扩大搜索且不触发 repo map 兜底 | v0.120.0 |
| 面板核心文件 | 单库视图按与 `src/graph-rank.js` 同参数的 PageRank 渲染前三 chip（分数三位小数），可点击打开详情；无依赖边时隐藏 | v0.121.0 |
| 受影响测试路由 | `src/test-files.js` 路径启发式（测试目录、`*.test/spec.*`、`test_*`/`_test`、`FooTest`/`FooIT` 等）；影响面在完整遍历中收集 `affectedTests`（最近优先、上限 50、可截断），渲染并置于验证建议首位 | v0.122.0 |
| Wiki 引用完整性 | `findBrokenWikiCitations` 校验页面级/章节级 `sources`：先查索引，非索引用 fs 探测；绝对/上跳路径直接判缺失；探测超 200 时未验证引用按存在处理并告警；status 输出有界明细并渲染 | v0.123.0 |
| 保守导出审计 | `src/unused-exports.js` 仅审计"有入边且全部入边具名"的文件；无入边/含无名导入的文件计入 skippedFiles；忽略 default；明细 10×10 有界、总数精确；status 输出并渲染，措辞为"无 import 证据" | v0.124.0 |
| 模块耦合指标 | `src/coupling.js` 在跨模块 import 图上计算 Ca/Ce 与不稳定性 Ce/(Ca+Ce)，同模块/自引用/未知模块忽略，模块对去重；status 输出前 10 并渲染 `Module instability` 行 | v0.125.0 |
| 多行 JS/TS 导入与解析缓存版本 | 跨行 import/export-from 保留起始行与完整具名符号；`parserVersion` 在解析规则升级时使旧 symbols/imports 缓存失效，保留正确增量统计，同版本后续恢复复用 | v0.117.0 |

**剩余未覆盖项全部集中在浏览器侧**（无浏览器控制，见 `docs/checkpoints/phase-15-convergence.md`）。
