# 方案覆盖率报告：修订版方案 ↔ 实现（v0.265.0）

- 依据：`方案评审与修订版-v1.md`（§6 修订版方案、§10.3 升级韧性、§11.5 速查表）
- 核对对象：本仓库当前实现（v0.265.0）；测试 817/817（`LANG=en` 与 `LANG=zh` 双环境）；`npm run coverage:check` 汇总行覆盖 98.11%、分支 87.9%、函数 95.47%（多次运行波动约 0.2pp，源于定时器/取消分支的调度次序；全量口径）
- 图例：✅ 按方案实现 ｜ ⚠️ 有据偏离（评审中已决策）｜ ❌ 未做（后置/不做）

## 1. §6.1 架构：一个 bundle，资产层

| 方案条目 | 状态 | 实现与位置 |
|---|---|---|
| 单一本地 bundle `dsh-repowiki`，零第三方 dsh 插件 | ✅ | `package.json`（`dsh.bundle.patch` 指向 `cordis.patch.yml`）；`files` 全覆盖 `index.js/client.js/src/locale/icon`；`engines.dsh: >=0.2.2-rc.5` 仅作下界（§10.3-2） |
| 包内 4 个插件条目（index-service / wiki-tools / card-tools / memory-tools） | ⚠️ | 实现为**单 Host 插件** `index.js`（`apply(ctx)` + `inject:['fs','tools','subagents']`）注册全部 11 个工具。方案拆条目的唯一理由是"服务导出与 apply 不可混用"；本项目索引器是纯函数模块（非 Cordis 服务），无混写问题，单条目更简单（奥卡姆剃刀）。决策见 ADR-0001 |
| 资产目录 `<cwd>/.dsh-repowiki/` | ✅ | `src/schema.js` `ASSET_DIR`；全部读写经 `ctx.fs` |
| `knowledge/{locale}/` 只生成当前 locale | ✅ | `getLocale(ctx)`（`src/spawn.js`）；工具 `locale` 参数可显式覆盖 |
| `wiki/{locale}/` | ✅ | `WIKI_DIR`；`wikiPath` + `writeWiki`；模块页写入 `wiki/{locale}/modules/` |
| `index.json` 符号表 + 依赖边 + 技术栈 | ✅ | `src/indexer.js`（`INDEX_SCHEMA_VERSION=6`、sha256-12 digest、增量复用 `stats.reused`、`.gitignore` 子集）、`src/stack.js`（技术栈扫描）、`src/symbols.js`（依赖边）、`src/modules.js`（模块树） |
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
| 4 | 资产数据版本化 + 读取校验降级 | ✅ | `INDEX_SCHEMA_VERSION=6`（兼容读取 v2–v5 并在内存补齐模块树/语言分布，ADR-0007）、`CARD_SCHEMA_VERSION`、`MEMORY_SCHEMA_VERSION`；`parseCard`/`parseMemoryText` 版本不符返回 null（v0.15.0 起统一为 `parseFrontmatter(text, version)`）；所有资产写入经 `writeTextVerified` 回读校验 |
| 5 | 配置走 patch 层、警惕整体替换 | ✅ | `cordis.patch.yml` 只含插件注册行；`wiki-plan.yaml` 项目级随 Git |
| 6 | LLM 子任务一律 outputSchema 约束 | ✅ | `src/card-schema.js`/wiki schema；`runSubagent` 强制 |
| 7 | 不碰保留与实验机制 | ✅ | 未用 `appendPluginRecord`/`Session.append`/`@Remote` |
| 8 | 升级回归门禁（代码改↔Wiki 跟、dsh 变↔冒烟跑） | ✅ | 自动化部分已落地：`.github/workflows/tests.yml` 在 Linux/macOS（阻塞）与 Windows（canary）× Node 22/24 上跑 lint、typecheck、密钥扫描、`node --test test/*.test.js`（773/773，含 LLM 执行路径契约回归、多 locale、有界并发与重试、运行快照、行号级反向引用、Wiki 引用反查/跳转与引用完整性、行号越界与内容漂移、保守导出审计、模块耦合指标、架构分层违规检查、重复代码检测、圈复杂度估算、坏相对导入、可配置分析阈值、含新信号的健康分、43 语言提取（含 Elixir/Lua/Zig/Gleam/Shell/R/Julia/Nim/OCaml/Haskell/Erlang/Solidity/Clojure/HCL/Groovy/PowerShell/Fortran/Perl/Pascal/Nix/VB.NET/Tcl/F#/Ada/Verilog/SystemVerilog/Objective-C/MATLAB）、符号级影响证据与词法使用点、barrel 再导出链的引用/使用点解析、受影响测试路由、PageRank 核心文件与 repo map 兜底、符号锚点上下文包、面板核心文件 chip 与引用问题徽章、真实 React+jsdom 的 DOM 事件回归与故障注入降级链、并发锁接线、打包与版本一致性守卫），架构侧的循环/分层/坏导入/重复/复杂度/架构分由 `verify:arch` 基线棘轮独立拦截（`verify-arch` job 自证通过→新增循环失败），并通过 `scripts/check-coverage.mjs` 卡门禁（行 ≥95 / 分支 ≥85 / 函数 ≥85）；CodeQL + `npm audit` + SBOM 独立工作流。dsh 版本变更侧的回归另有 `npm run verify:host` 解析本机 app.asar 核对 --dsw-* 令牌漂移，UI 侧仍靠安装验证流程（remove→install→GUI 冒烟），无 CI 可跑 dsh 本身 |
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
| 不可信资产路径 | 索引随 Git 传播 → `readIndex` 把 `files[].path` 当不可信输入：归一正斜杠/`.` 段，丢弃绝对、空与向上越界条目，并连带丢弃指向被弃文件的边；`untrusted` 输出有界计数与前 5 条原始路径，`repowiki-status` 转成告警；`projectRelativePath` 与快照导入共用，`readCardFor`/上下文/抽取/影响面只见到安全路径 | v0.170.0 |
| 可复现索引产物 | 遍历前对每层目录条目按名称字节序排序（不依赖 ICU），超预算截断在任意机器命中同一批文件；产物 `files` 按路径、`edges` 按来源/行号/目标排序，后端 `listDir` 顺序不同也生成同一 `index.json` | v0.171.0 |
| 目录列举预取 | DFS 进入某目录前，按遍历顺序提前发起后续兄弟目录的 `listDir`（在途上限 8）；消费顺序与预算计数不变，结果与串行一致；预取 Promise 挂空 catch，预算截断/取消不产生未处理拒绝；远程 `ctx.fs` 的目录往返改为重叠等待 | v0.173.0 |
| 清单并发读取 | 配置清单先按遍历顺序与既有分类上限选定，再以 8 路并发读取、按选择顺序装配；远程 `ctx.fs` 的清单 RTT 重叠，截断判定、键顺序与全部派生结果与串行一致 | v0.181.0 |
| Markdown 表格与嵌套列表 | 零依赖渲染器新增 GFM 表格（表头/表体、分割行驱动左/中/右对齐、单元格内加粗/代码/链接、`\|` 转义、表头 `scope="col"`）与缩进嵌套列表（按两空格一层构建树，子 `ul`/`ol` 渲染在父 `li` 内，支持逐层有序/无序混排）；标题支持 `#`–`######`（页面 h1 由外层承担，钳制到 `h6`，均带锚点）；链接仍走协议白名单，无新依赖 | v0.174.0 / v0.180.0 |
| 中文查询分词 | 文档侧保留 CJK 单字 + 双字组（支持单字查询）；查询侧连续段长度 ≥2 时只取双字组，避免“无匹配”因单字“无”命中所有含该字的文档；单字查询与拉丁词行为不变；BM25 与面板搜索共用同一规则 | v0.175.0 |
| 产品与体验 | `.gitignore` 子集、零依赖 BM25 检索、模块级 Wiki + 清单、陈旧/孤儿检测、`repowiki-status`、面板分页/排序/标签/Wiki 搜索/可访问性 | v0.45.0 |
| 工程门禁与发布 | TypeScript `checkJs`（渐进）、ESLint、3 OS CI 矩阵、覆盖率/密钥/依赖/CodeQL 门禁、SBOM、发布脚本、runbook/兼容矩阵/基准文档（ADR-0007） | v0.46.0 |
| 语言与生态扩展 | Go/Rust/Java 符号与本地依赖边（go.mod / Rust 模块约定 / Java 包后缀）、Maven/Gradle 技术栈、Git 溯源（只读 `.git/HEAD`）、语言分布、多 locale 抽取/生成、索引 schema v4（兼容 v2/v3）、记忆重写标题重复修复 | v0.47.0 |
| 反向引用 | `src/references.js` 按需反演 `index.edges`；`repowiki-cards references=true` 有界返回（100 条 + 截断标记）；面板详情展示 import 级引用方；跳过自引用与副作用导入 | v0.48.0 |
| 行号级引用 | 索引 schema v5：`edges[].line` 记录 import/use/require 行号；反引用与面板输出 `path:Lx`；旧索引降级为仅路径；读取兼容 v2–v4 | v0.49.0 |
| Wiki 引用反查 | Wiki 清单 v2 记录章节级 `sections`；`src/wiki-references.js` 反演为源文件 → 页面/章节；`repowiki-cards wikiReferences=true` 有界返回；面板详情展示；v1 清单降级为页面级 | v0.50.0 |
| 8 语言覆盖 | C#/Kotlin/PHP 符号与点分路径依赖边、PHP 大小写不敏感与 `__DIR__` require、Composer 技术栈、全部语言 prompt 围栏；语言表与已知限制写入兼容矩阵 | v0.51.0 |
| PHP PSR-4 自动加载 | 根与嵌套 `composer.json` 的 `autoload` / `autoload-dev` `psr-4` 映射（字符串/数组目录、空前缀兜底、最长前缀优先、命名空间边界匹配）；`use` 先走 PSR-4 再回退点分后缀，类名大小写不敏感；绝对/向上越界目录忽略，外部包不建边；嵌套清单上限 50，技术栈计数仍只取根清单 | v0.169.0 |
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
| 文档覆盖率与健康度 | status 的 `coverage` 以 plan 复杂度阈值下有资格生成卡片的文件为分母，输出已覆盖/新鲜/陈旧/百分比与缺口最大的模块（≤5）；`health` 四分量加权（40/25/20/15）给出 A–D 等级、分量明细与前四条待办；v0.130.0 起引用缺陷计入 Wiki 分量，v0.158.0 起失败页与非法路径也计入 | v0.114.0 / v0.130.0 |
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
| 引用行号越界 | 索引 schema v6 记录 `files[].lines`（空文件 0 行、结尾换行不加行）；`parseWikiSource` 解析 `#Lx-Ly`/`#Lx`/`#Lx-y`；`findCitationRangeIssues` 标记零起始/倒置/超出 EOF，行数未知计入 unchecked，status 有界输出并渲染；页级与章节 sources 去重后统计（v0.137.0 修复重复计数） | v0.126.0 / v0.137.0 |
| 面板引用问题 | 客户端 `parseCitation`/`citationIssuesFor` 从清单与索引行数派生越界/未检查；Wiki 页签展示汇总与逐页 `⚠ N` 徽章（可访问 title）；不做文件系统存在性检查 | v0.127.0 / v0.132.0 |
| 面板指纹覆盖率 | 客户端从清单派生页级/汇总覆盖率，不读源码；未覆盖页显示弱化的 `◌ N` 徽章与 `tracked/total` 汇总，旧清单只显示一次无指纹记录；页级/章节 `sources` 去重后再统计引用问题与覆盖率 | v0.132.0 / v0.134.0 |
| 面板未覆盖原因 | 客户端读取清单 `citationMisses`，在 `◌ N` 徽章 tooltip/可访问标签与覆盖率汇总中展示 `unreadable`/`range`/`cap`/`unknown` 的本地化分类；旧清单不逐页展示，仍不读源码 | v0.134.0 |
| 面板未覆盖筛选 | Wiki 页签提供“仅看未覆盖”开关（带页面数、`aria-pressed`），与搜索组合过滤；筛选/搜索无结果时使用专门文案而非“尚未生成” | v0.138.0 |
| 面板生成诊断 | Wiki 页签从清单与已加载目录列表派生上次生成失败页（`failedTotal`，≤5 个 slug tooltip）、磁盘缺失页与路径非法页，`role=status` 展示在引用摘要上方；页面列表为空时同样显示；非法路径从缺页计数中排除；v0.157.0 起同区提示重复 slug/清单条目；v0.148.0 起用 Web Crypto 重算卡片 `inputDigest`，v0.149.0 起同时重算已采信记忆 `memoryDigest`，v0.176.0 起再重算结构 `graphDigest`（索引文件集合 + 依赖边，与 `src/wiki-graph.js` 同构），任一不一致即提示“Wiki 落后”，不可用时静默降级 | v0.144.0 / v0.153.0 / v0.176.0 |
| 引用内容漂移 | 清单 v3 的 `citationDigests` 记录每条引用（行范围/整文件）的 sha256-12；生成在锁外按白名单读取（200 上限），status 重算（100 读取上限）并报告变化，不可读/非法/超限计入 unchecked；旧清单不判定 | v0.128.0 |
| 漂移感知增量生成 | `checkCitationDrift` 由 status 与 generate 共用；generate 在 fresh 短路前重算指纹，`total > 0` 或 `unchecked > 0`（含超出 500 条比较上限）时不跳过，`hint` 说明原因；验证通过返回 `citationDrift: 0`，无指纹旧清单保持原行为 | v0.129.0 |
| 引用感知健康分 | `assessHealth` 接收 `broken/outOfRange/drift/unchecked`；缺失路径 10 分/条（上限 40），越界与漂移各 5 分/条（各上限 20），总扣分上限 80；`unchecked` 只报告不扣分；status 把三类计数接入组件明细与前四条待办，并把引用告警从卫生分量排除以避免双扣；v0.158.0 起失败页按缺页权重计入分母、非法路径 5 分/条 | v0.130.0 / v0.158.0 |
| 引用指纹覆盖率 | `summarizeCitationCoverage` 按页去重统计 `total/tracked/untracked/hasDigests`；generate 在短路与写入后输出 `citationCoverage`，未覆盖时渲染提示，旧清单明确降级；status 输出并仅在覆盖率不完整或清单早于 v3 时渲染 `Citation digests` 行 | v0.131.0 |
| 未覆盖原因分类 | 生成清单页记录 `citationMisses`（source → `unreadable`/`range`/`cap`/`unknown`）；`summarizeCitationCoverage` 输出与 `untracked` 同口径的 `reasons`；generate hint/渲染与 status `Citation digests` 行展示分类，旧清单为 `unknown` | v0.133.0 |
| 有界并发漂移读取 | `checkCitationDrift` 先收集安全且在上限内的唯一路径，按默认 8（硬上限 16，`options.concurrency`）并发预取，再按清单顺序比较；结果、截断与 `unchecked` 口径不变 | v0.135.0 |
| 页级覆盖率明细 | `citationCoveragePages` 复用页级计数，列出最多 10 个未覆盖页面（按未覆盖数降序，带 `reasons` 与 `truncated`）；status 输出并在 `Citation digests` 行点名示例；health 只加提示不扣分 | v0.136.0 |
| 陈旧 Wiki 检测 | `scripts/verify-wiki.mjs` 读取 `knowledge/<locale>/*.md`，按 `path:sourceDigest` 排序哈希重算 `inputDigest`（与 generate 同口径，sha256-16），与清单不一致时默认失败；v0.140.0 起同时按 `slug:body` 重算已采信记忆的 `memoryDigest`（与 generate 增量短路同口径），`staleReasons` 区分 `cards`/`memory`/`graph`（v0.176.0：`graphDigest` 覆盖索引文件集合与依赖边，配置驱动的边变化同样命中；旧清单缺该字段时跳过），文本报告标记 `(stale: cards, memory, graph)`；旧清单缺 input/memory 指纹时默认告警、`--strict` 失败。`--require` 让无 Wiki 清单也失败，避免 CI 静默通过 | v0.139.0 / v0.140.0 / v0.176.0 |
| 页面完整性 | 递归枚举 `wiki/<locale>` 的 `.md`（slug 优先取 frontmatter，深度 ≤3，与 `listWikiPages` 一致）；清单登记但磁盘缺失的页面默认失败并点名示例，未入清单的孤儿页仅告警；JSON 输出 `missingPages`/`orphanedPages` 与 `pageFiles`；`repowiki-status` 以同口径输出 `wiki.missing`/`wiki.missingPages`、`wiki.invalid`/`wiki.invalidPages`、`wiki.duplicate`/`wiki.duplicateSlugs`/`wiki.duplicatePaths` 并在文本 `Wiki:` 行显示；健康分把缺页计入 Wiki 分母并按 40 分权重扣减 | v0.141.0 / v0.152.0 |
| 页面结构与链接 | 清单页面路径必须位于 `wiki/<locale>/`、不含 `..`/绝对路径且以 `.md` 结尾；清单 `path` 与实际文件位置不符、重复登记同一 slug/路径即失败；两个页面文件声明同一 slug 也失败（`wiki/duplicate-page-slug`），避免 Map 静默覆盖；页面正文的相对链接（`.md` 页面与源码/文档文件）按 Markdown 语义相对页面目录解析，目标缺失或越出**项目根**即失败，存在性探测上限 200（strict 下截断失败）；JSON 输出 `invalidPagePaths`/`pagePathMismatches`/`brokenLinks`/`unsafeLinks`；v0.155.0 修正合法项目内链接被误判越界，v0.156.0 增加重复页检测 | v0.146.0 / v0.156.0 |
| 结构化问题码 | `--json` 在 issues/warnings 之外输出 `problems[{code, severity, message, locale?}]`；码覆盖索引读取/版本过旧、清单缺失/非法/空、断链/越界/漂移/未覆盖/未验证/探测截断、卡片/记忆陈旧、缺页/孤儿、页面路径/内部链接、生成失败与资产缺失，CI 可按码聚合或抑制；README 双语问题码表列出默认级别与 strict/require 升级 | v0.142.0 / v0.154.0 |
| CI 自证 job | `.github/workflows/tests.yml` 的 `verify-wiki` job 生成 fixture，先断言 `--strict --require` 通过，再改卡片指纹断言退出码 1；文档配方在每次推送被执行，而不是只写在 README | v0.145.0 |
| 生成失败持久化 | `repowiki-generate` 在清单写 `failed`（最多 10 条 slug/reason）与 `failedTotal`；`verify:wiki` 以 `wiki/generation-failed` 报告（默认警告、`--strict` 失败，locale 输出 `failedPages`）；`repowiki-status` 输出 `wiki.failed`/`wiki.failedPages` 并在文本 `Wiki:` 行显示 | v0.143.0 |
| CI Wiki 门禁 | `scripts/verify-wiki.mjs` 复用 `wiki-references`/`citation-drift`：断链（索引 + 200 探测）、越界（索引 v6）、漂移（清单 v3）、陈旧 Wiki（卡片/已采信记忆指纹变化）、清单页缺失、页面路径非法与内部死链默认失败；上次生成失败页默认警告、`--strict` 失败；空清单默认告警、`--strict`/`--require` 失败；未覆盖/未验证/探测截断/旧索引默认警告、`--strict` 失败；`--require` 要求存在非空清单；卡片/记忆/页面按 8 路有界并发读取，链接/存在性探测保持上限与串行；支持 `--root`/`--locale`/`--json`（含 `problems[].code`），退出码 0/1/2 | v0.137.0 / v0.151.0 |
| 多行 JS/TS 导入与解析缓存版本 | 跨行 import/export-from 保留起始行与完整具名符号；`parserVersion` 在解析规则升级时使旧 symbols/imports 缓存失效，保留正确增量统计，同版本后续恢复复用；v2 批量失效 v1 之后的 15+ 语言与解析修复（升级首轮 changed=文件数、reused=0）；v3 失效 R6 方法符号之前的 R 解析缓存；v4 失效 R S4 声明之前的 R 解析缓存；v5 失效 Julia `@kwdef`/`@enum` 之前的 Julia 解析缓存；`repowiki-status` 输出 `index.parserVersion` 并在版本不一致时告警 | v0.117.0 / v0.190.0 / v0.193.0 / v0.195.0 / v0.197.0 / v0.198.0 |

**剩余未覆盖项全部集中在浏览器侧**（无浏览器控制，见 `docs/checkpoints/phase-15-convergence.md`）。
| 文档版本一致性 | `docs/compatibility.md` 的资产版本与 `src/schema.js` 常量绑定；新增 `KNOWLEDGE_INDEX_SCHEMA_VERSION`/`WIKI_MANIFEST_SCHEMA_VERSION`，抽取/生成不再写内联数字 | v0.159.0 |
| 分页检索 | `searchIndex`/`rankDocuments` 支持 `offset`；`total` 精确、`truncated` 表示本页之后仍有结果；`repowiki-cards` 输出 `offset` 并在文本显示起止区间 | v0.160.0 |
| 嵌套忽略规则 | 遍历到含 `.gitignore`/`.repowikiignore` 的子目录时读取并追加；规则带 `base` 作用域（锚定/目录/无斜杠都只匹配该子树），更深规则后置优先；不可读规则记入索引告警；字符类 `[abc]`/`[a-z]`/`[!a-z]` 生效，非法范围与含 `/` 的类按字面降级 | v0.161.0 / v0.162.0 |
| 依赖目录排除 | `EXCLUDE_DIRS` 无条件排除 `node_modules`、`vendor`（Composer/Go 第三方代码）、`.dart_tool`（Dart/Flutter 生成缓存）等目录，已安装依赖不参与索引、不消耗文件预算 | v0.169.0 |
| 快照完整性 | `repowiki-export` 每个文件写后回读校验，再写 `_snapshot.json`（路径 + sha256-16 + `partial`）；`repowiki-import` 复制前以 8 路有界并发逐文件校验（上限 2 万），指纹不符/缺失/不可读/路径非法/部分导出默认拒绝，`allowCorrupt=true` 强制；旧快照无清单仍可导入并提示未校验，清单文件不进入资产目录；导入只复制清单登记的相对路径，快照里多出的文本文件跳过并计数（`snapshotUnlisted`，前 5 条路径），清单路径先归一、绝对/越界条目丢弃；清单本身也校验 schemaVersion（非当前判无效）、显式 count 与 files 长度一致、JSON 必须是对象，并按 stat 大小拒绝超过 8 MiB 的清单 | v0.163.0 / v0.165.0 / v0.168.0 / v0.172.0 |
| Dart 支持 | 15 语言：class/mixin/enum/extension/extension type/typedef、构造器/方法/getter、顶层函数与变量、`_` 私有；相对 `import`/`export`/`part` 边（含 `show` 符号）；`pubspec.yaml` → `pub` 项目名/依赖计数/技术映射；`package:<仓库内包名>/x.dart` 解析到 `<包根>/lib/x.dart`（含嵌套包），外部 `package:`/`dart:` 不建边 | v0.166.0 / v0.167.0 |
| Elixir 支持 | 16 语言：`defmodule`（嵌套完整名）/ `def` / `defp` / `defmacro(p)` / `defguard(p)` / `defdelegate`，do/end 配平、`do:` 单行、多行函数头与私有可见性；`alias`/`import`/`require`/`use` 经模块名映射到声明文件（含分组/重命名 alias），外部模块不建边；根与 `apps/*/mix.exs` → mix 项目名（根）/依赖计数/技术映射（嵌套合并，来源可追溯）；`.exs` 测试/脚本进入索引（`mix.exs` 仍为清单），测试文件的 alias 边可供影响面路由 | v0.177.0 / v0.178.0 / v0.179.0 |
| Lua 支持 | 17 语言：模块表变量、`function`/`local function`、`M.foo`/`M:foo` 方法（parent 归属）与 `M.foo = function` 赋值；块范围按 function/if/for/while/do/repeat…end/until 配平并屏蔽注释/长字符串；`require` 经 `lua/` 根与项目根解析 `<mod>.lua`/`<mod>/init.lua`，外部模块不建边 | v0.182.0 |
| Zig 支持 | 18 语言：`struct`/`enum`/`union`/`opaque` 容器类型（含 `pub`/`extern`/`packed`/`union(enum)`）、顶层 `fn`/`extern fn`/`export fn`（原型与块体）、具名 `test "…"`、顶层常量/变量、`pub const x = @import("x.zig")` 再导出；容器成员带 `parent` 且只识别一层；私有 `@import`/`@cImport`/`@This` 别名跳过；注释与 `\\` 多行字符串屏蔽后配平；`@import("x.zig")` 相对引用文件解析并限制在项目内，`build.zig.zon` 提供项目名/版本/依赖计数；嵌套 monorepo 清单（上限 20）累加依赖、根元数据优先 | v0.183.0 / v0.188.0 / v0.189.0 |
| 不可信索引状态 | `readIndex` 净化被篡改索引（绝对/越界文件路径与指向它们的边）时，`repowiki-status` 结构化返回 `index.untrusted.files`/`edges` 并在 `Index:` 行展示，JSON/CI 无需解析告警文案；原始路径不回显，原告警保留 | v0.170.0 / v0.184.0 |
| Gleam 支持 | 19 语言：`type`/`opaque type`/`external type` 容器、`type` 别名（kind type）、`fn`/`external fn`（跨行签名、单行块体）、顶层 `const`；`pub` 决定导出，函数体内 `let`/匿名函数不登记；注释与字符串（含跨行）屏蔽后配平；`import package/module`（`as` 与 `.{type Foo, Foo as F}`，跨行列表拼接到闭合 `}`）经 `src/`/`test/` 源根与项目根解析 `<module>.gleam`，外部包不建边；`gleam.toml` 提供项目名/版本/依赖计数与技术映射，嵌套 monorepo 清单（上限 20）合并依赖且项目名只取根 | v0.185.0 / v0.187.0 |
| Shell 支持 | 20 语言：`function foo`/`function foo()`/`foo() {`（含分行 `{`）与单行函数体、`export`/`readonly`/`declare`/`typeset` 显式变量；普通赋值/`local` 不登记；`#` 注释、引号（含跨行）与 heredoc 屏蔽，`${…}` 不参与配平；`source`/`.` 先脚本目录再项目根，尝试 `.sh`/`.bash`，动态参数不建边 | v0.191.0 |
| R 支持 | 21 语言：`name <- function(...)`/`name = function(...)`（含 `<<-`）跨行签名、分行 `{`、单行表达式体；`setClass`/`setRefClass`/`R6Class` 类与方法（method + parent）、`setGeneric` 泛型与 `setMethod` 方法（签名类为 parent）；注释/字符串屏蔽；`source`/`sys.source` 先文件目录再项目根（`.R`/`.r`），动态参数不建边；`DESCRIPTION`（DCF）提供包名/版本/依赖计数与技术映射；根 `NAMESPACE` 的 `export`/`exportClasses`/`exportMethods`/`S3method` 决定 `exported`（`exportPattern` 回退约定）；`.bats` 并入 Shell | v0.192.0 / v0.194.0 / v0.195.0 / v0.197.0 |
| Julia 支持 | 22 语言：`module`/`baremodule`、`struct`/`mutable struct`（含 `@kwdef` 宏前缀）、`abstract`/`primitive` 类型、`@enum`（类型 + 非导出枚举值）、`function`（`Type.method` → method + parent）、短函数、`macro`、`const`；函数/结构体/宏体跳过；注释/块注释/三引号屏蔽，`a[end]` 不计 end；含 `module` 的文件按 `export` 标记可见性；`include` 相对引用文件（缺省补 `.jl`），动态参数不建边；`Project.toml` 提供包名/版本/依赖计数与技术映射 | v0.196.0 / v0.198.0 |
| Nim 支持 | 38 语言：`proc`/`func`/`method`/`iterator`/`template`/`macro`/`converter`、`type` 容器、`type` 单独成段时的缩进成员（逐成员独立范围与 `*` 导出，字段/枚举值不误登记）、顶层 `const`/`let`/`var`；`*` 后缀导出；缩进体与嵌套例程不登记，多行签名先定位；注释/块注释/字符串（含三引号）屏蔽；`import`/`from … import`/`include`/`export` 经文件目录、`src/` 根与项目根解析（`.nim`/`.nims`），`std/` 外部不建边；`*.nimble` 提供项目名/版本/`requires` 依赖计数与技术映射 | v0.200.0 |
| OCaml 支持 | 38 语言：顶层 `let`/`let rec`（含 `let%ppx`、属性）与 `and` 续接互递归函数、`type` 容器/别名（参数化名称取末尾标识符）与 `and` 续接类型、`module`/`module type`、`class`/`class type`、`exception`、`val`/`external`；缩进体与嵌套定义不登记；`(* … *)` 可嵌套注释、字符串与 `{|…|}`/`{id|…|id}` 原始字符串屏蔽；`struct`/`sig`/`object` 体按配对 `end` 结束；`open`/`include`/`open!`/`module M = Foo` 经文件名→模块名映射解析（`.ml` 优先于 `.mli`，`Foo.Bar` → `foo.ml`；同名模块选与引用文件共享目录最深者），外部库不建边；`dune-project` 提供项目名/版本，`*.opam` 提供版本/`depends` 依赖计数与技术映射 | v0.212.0 |
| Haskell 支持 | 38 语言：`module` 声明（范围至文件尾）与导出列表可见性（未列出的顶层符号非导出，类方法跟随类）、`data`/`newtype`（含 `data family`）、`type`/`type family`、`class` 与类方法签名（含多行签名，`parent` 归属类）、`pattern` 同义词、顶层值签名（含多行签名）与定义（含中缀操作符），签名与同名定义合并；缩进 `where`/`let` 体与 `instance` 方法不登记；`--` 注释、可嵌套 `{- … -}`（含 pragma）、字符串/字符字面量屏蔽；`import [qualified] [safe] ["pkg"] Module` 按 GHC 模块路径在每个 `src`/`app`/`lib`/`test` 源根、cabal `hs-source-dirs` 与项目根下解析（`.hs` 后 `.lhs`），外部包不建边；`*.cabal` 提供包名/版本/跨行 `build-depends` 依赖计数与技术映射 | v0.208.0 |
| Rust workspace crate 解析 | 嵌套 `Cargo.toml`（上限 20）的 `[package] name` → crate 根目录，包名按 Cargo 规则 `-`→`_` 归一；`path` 依赖补全未声明 name 的成员；`use other_crate::module` 解析到该 crate 的 `src/` 子模块并回退 `lib.rs`/`main.rs` 入口；外部 crate 不建边；根 `Cargo.toml` 继续驱动 cargo 技术栈 | v0.205.0 |
| Erlang 支持 | 38 语言：`-module`、`-record`、`-type`/`-opaque`、`-define` 宏、顶层函数（多子句、`when` 守卫、跨行签名）；`-export([f/1])` 决定可见性（默认私有，同名不同 arity 合并）；`%` 注释、字符串、引号原子与 `$x` 字符字面量屏蔽；`-include` 经文件目录与 `src`/`include` 根解析（原路径与补 `.hrl`），`-include_lib` 额外剥离应用名前缀；外部头文件不建边；`rebar.config` 的 `{deps, …}` 提供依赖计数与技术映射 | v0.209.0 |
| Solidity 支持 | 38 语言：`contract`/`library`/`interface`（含 `abstract contract`）容器；成员 `function`/`constructor`/`receive`/`fallback`/`modifier`/`event`/`error`/`struct`/`enum`/`type X is`（带 `parent`）；文件级函数与类型；`private`/`internal` 非导出；注释/字符串屏蔽；范围按花括号配平（`;` 声明单行）；相对 `import` 按文件目录解析并补 `.sol`，外部路径不建边；`foundry.toml` 标记 Foundry 工具链 | v0.213.0 |
| Clojure 支持 | 38 语言：`ns`（class）、`defn`/`defn-`/`defmacro`/`defmulti`/`defmethod`（function）、`def`/`defonce`（variable）、`defrecord`/`deftype`/`defprotocol`/`definterface`（class）；`^:private`/`defn-` 非导出；`;` 注释、字符串屏蔽、`(comment …)` 整体跳过；形式范围按括号配平；`(:require …)`/`(:use …)` 经 `src`/`test` 根解析（同类扩展优先），外部命名空间不建边；`deps.edn`/`project.clj` 提供依赖计数与版本/技术映射 | v0.214.0 |
| HCL 支持 | 38 语言：`resource`/`data`（`type.name`）、`module`/`provider`/`terraform` 块（class）、`variable`/`output`/`locals`（variable）；嵌套块不登记；注释/字符串屏蔽（标签取字符串原文、范围用掩码配平）；`source = "./modules/x"` 解析到模块目录 `main.tf`（否则字典序首个 `.tf`），registry/git 不建边；`.terraform.lock.hcl` 提供 provider 依赖计数与技术映射 | v0.215.0 |
| Groovy 支持 | 38 语言：顶层 `class`/`interface`/`trait`/`enum` 容器（容忍注解与修饰符）、类内第一层方法与顶层 `def` 脚本方法；`private`/`protected` 非导出，控制流不误登记；`//`/`/* */` 注释与单/双/三引号字符串屏蔽；`import a.b.C` 经与 Java 共享的点分路径解析，`import static` 去掉末段成员，外部/通配导入不建边 | v0.217.0 |
| PowerShell 支持 | 38 语言：`function`/`filter`/`workflow`/`configuration`（连字符名称、作用域前缀、`private:` 非导出）与顶层 `class`/`enum`；类内第一层方法带 `parent`，`hidden` 非导出，属性不登记；`#`/`<# … #>` 注释、单/双引号与 here-string 屏蔽；`using module`/`Import-Module`/dot-source 相对脚本解析（补 `.ps1`/`.psm1`/`.psd1` 与模块目录形式），纯模块名不建边 | v0.218.0 |
| Fortran 支持 | 38 语言：`module`/`program`/`subroutine`/`function`（类型前缀与修饰）、派生类型 `type [::]`/`type, extends(…) ::`、具名 `interface`；`end`/`end <unit>` 配平，`end do`/`end if` 不关闭单元，模块内过程带 `parent`；`!` 注释与引号字符串屏蔽；`use`（含 `::`/`only:`/`non_intrinsic`）经大小写不敏感模块名映射解析，intrinsic 与外部模块不建边 | v0.219.0 |
| Perl 支持 | 38 语言：`package`（语句/块）与 `sub`（包内 method + `parent`，`_` 非导出）；`#`（`$#array` 除外）、POD、heredoc 与引号屏蔽；`use`/`require Foo::Bar` 经 `::`→路径在每个 `lib/` 根与项目根解析，`parent`/`base` 记录父模块，相对 `require` 先项目根再脚本目录，pragma/版本跳过 | v0.220.0 |
| Pascal 支持 | 38 语言：`unit`/`program`/`library`、`type X = class/interface/record/object`（`end` 配平）、`procedure`/`function`/`constructor`/`destructor`（声明止于本行，实现按 `begin`/`case`/`try`/`asm` ↔ `end`）、`property`；`TFoo.Bar` 以类为 `parent`；注释与引号屏蔽；`uses`（跨行、大小写不敏感单元名、`in 'path'` 覆盖）解析，外部单元不建边 | v0.221.0 |
| Nix 支持 | 38 语言：属性集/`let` 绑定（点分键、`{`/`rec {` class、lambda function、嵌套 `parent`）与注释/字符串/缩进字符串屏蔽；`import`/`callPackage`/`builtins.readFile|readDir|path` 相对路径解析（补 `.nix` 与 `default.nix`），`<nixpkgs>`/绝对路径不建边 | v0.222.0 |
| VB.NET 支持 | 38 语言：`Namespace`/`Class`/`Module`/`Structure`/`Interface`/`Enum`、`Sub`/`Function`/`Property`/`Event`（`End <type>` 配平；接口/MustOverride 单行；Property 覆盖 Get/Set）、构造器 `Sub New`、修饰符与可见性；注释/字符串屏蔽；`Imports`/`Inherits`/`Implements` 点分 + 命名空间后缀解析，外部程序集不建边 | v0.223.0 |
| 圈复杂度 | `repowiki-status` 对每个 function/method 符号范围统计行首分支关键字与 `&&`/`||`，输出函数数/平均/最大与 ≤10 个 ≥15 的函数；注释/字符串未屏蔽，定位为复核启发式 | v0.227.0 |
| F# 支持 | 38 语言：`namespace`/`module`/`type`（class/interface/type）、`member`/`abstract member`/`override`、`let`（function/variable）；`end`/缩进块范围；注释与字符串屏蔽；`open` 经命名空间/模块映射（含 `Parent.Module` 别名与逐段回退） | v0.231.0 |
| 分析阈值配置 | plan 的 `complexityThreshold`（1–100）、`duplicateMinLines`（4–50）、`maxStatusSourceFiles`（20–500）驱动 status 分析；越界钳制、非法回退，实际值回显在区块中 | v0.230.0 |
| 坏相对导入 | 索引 import 记录与边表对照：以 `.` 开头且无 edge 的说明符计入 `status.unresolved`（总数精确、明细 ≤50、含 `path:line specifier`）；裸包导入不在此范围 | v0.229.0 |
| 健康分新信号 | 架构分量计入分层违规（5/条，≤30）、重复块（3/块，≤20）与高复杂度函数（2/个，≤20），各生成待办；新输入可选，缺省时分数与旧版一致 | v0.228.0 |
| 重复代码检测 | `repowiki-status` 有界读取（≤150 文件、≤400 行/文件、8 路并发）后按 8 行窗口归一化指纹，跨文件共享窗口合并为块：总数精确、≤20 组、每组 ≤5 处；空窗口与单文件重复不计，定位为复核线索 | v0.226.0 |
| 架构分层 | `repowiki-plan.json` 的 `layers`（名称/路径前缀/`mayDependOn`）驱动跨层依赖检查：最长前缀归属、同层允许、未声明跨层违规计入 `status.layers`（总数精确、明细上限 50、未知层引用告警）；非法条目在读取时丢弃 | v0.225.0 |
| Tcl 支持 | 38 语言：`proc`（命名空间限定 `parent`）、`namespace eval`、TclOO `oo::class create` 与类内 `method`/`constructor`/`destructor`；整行花括号净值配平（参数列表 + body），双引号字符串屏蔽；`source` 相对路径先项目根再脚本目录，动态 `[file join]` 不建边 | v0.224.0 |
| Wiki 陈旧原因 | `repowiki-status` 输出 `wiki.staleReasons`（`cards`/`graph`/`memory`，值域与顺序同 `verify:wiki`）并在 `Wiki:` 行展示；页面级 stale 计数为 0 时也能区分依赖图/已采信记忆导致的陈旧 | v0.186.0 |
| 架构基线棘轮 | `scripts/verify-arch.mjs` 复用 `snapshotArchitecture`（循环组、按层对计数的分层违规、坏相对导入、重复块/高复杂度/最大复杂度、健康分架构分量）生成 `.dsh-repowiki/arch-baseline.json`：身份型信号按签名只拦新增，上限型与分值型按数值只拦上升/下降；`--update` 写入、`--require` 无基线失败、`--json` 输出 `index/*`/`plan/*`/`baseline/*` 问题码与结构化 `regressions`/`improvements`，退出码 0/1/2；基线无时间戳、列表排序去重，可逐字节复现；CI `verify-arch` job 自证"无基线失败 → 写基线通过 → 新增循环失败" | v0.232.0 |
| 基线感知状态 | `repowiki-status` 用 `architectureFactsSnapshot`（与 `verify:arch` 同一函数）把已算事实压成快照并读取 `.dsh-repowiki/arch-baseline.json`：输出 `archBaseline`（`exists`/`schemaVersion`/`ok`/`regressionTotal`/有界 `regressions`（cycle/layer/unresolved/ceiling/score）/`improvements`）与 `Arch baseline:` 行，新增退化附告警且不计入卫生分量；坏 JSON/不支持版本报告为不可用；`computeComplexity.highTotal` 与 `evaluateLayers.pairs` 提供不受展示上限影响的精确计数 | v0.233.0 |
| Ada 支持 | 第 39 种语言：`package`/`package body`（class；嵌套包与点分子单元带 `parent`）、`procedure`/`function`（声明到声明头、body 到 `end [Name];`；表达式函数/`is separate`/`renames` 不展开）、`type`/`subtype`/`task type`/`protected type`（record 覆盖到 `end record;`）与包级对象（variable）；`private` 段非导出；`--` 注释与双引号字符串（`""` 转义）屏蔽；`end if/loop/case/record/select/block` 不关闭单元，`declare … begin … end;` 单独记账；`with`/`limited with`/`private with` 单元名大小写不敏感，GNAT 连字符文件名与任意源根目录形式都映射为点分单元名（spec 优先、body 兜底），`use`/generic 形式子程序/外部标准库不建边 | v0.234.0 |
| Verilog/SystemVerilog 支持 | 41 语言：`module`/`package`/`program`/`class`（class 容器）与 `interface`（interface）、`function`/`task`（function；class/interface 内或 `C::f` 限定名为 method 并带 `parent`；`extern`/`pure virtual` 原型只占声明头，`local`/`protected` 非导出）、`typedef`（enum/struct/union 体与简单别名）、容器内 `parameter`/`localparam`（`parameter type` 为 type）与 `` `define `` 宏；`//`、`/* */`、字符串与宏续行屏蔽；`end*` 关键字按类型配对、单行块识别、未闭合块延伸到文件尾；`` `include `` 引号形式先查引用方目录再经 `include`/`inc`/`src`/`rtl`/`hdl` 根（尖括号跳过文件目录），`import pkg::*` 经容器名映射；Coq 写法的 `.v` 按内容归为 `coq` | v0.237.0 |
| 确定性架构页 | `src/architecture-page.js`：`repowiki-generate` 在模块/主题页之前写入固定 slug `architecture`（无模型）：总览（文件/符号/边/模块/语言/架构分）、声明分层与精确层对+示例边、循环组与代表性路径、fan-in/PageRank 入口、重复代码候选、复杂度热点（`#Lx-Ly`）、未解析相对导入（`#Lx`）与架构基线四态；引用白名单放宽到全部索引文件（`deterministic` 标记），条目数与引用数有界，同一输入生成逐字节相同页面；slug 保留、同名主题页改名；`verify:wiki --strict` 全绿。另修复 `verify:wiki` 的 `loadIndex` 漏读 `edges` 导致有边仓库误报 `wiki/stale-graph` | v0.235.0 |
| 面板架构基线漂移 | 单库视图读取 `.dsh-repowiki/arch-baseline.json`（缺失/损坏/超大均忽略）：当前 SCC 循环组与 `cycles` 签名对比得出新增/已修复数量（新增示例进 tooltip），并展示基线 `architectureScore` 与 `ceilings`（重复块/高复杂度/最大复杂度）；`cycleAnalysisFor` 以 WeakMap 按 index 缓存，徽章与基线共用一次 Tarjan；无基线时整行隐藏，DOM 测试覆盖有/无基线两种状态 | v0.241.0 |
| SwiftPM 本地包 | `swiftPackageDeps` 同时解析 `.package(url:)` 与 `.package(path:)`：远端取仓库名、本地取目录 basename（小写、去尾斜杠），一并计入 `dependencyCounts.swiftpm`；本地名不进入 `SWIFT_TECH` 猜测 | v0.248.0 |
| iOS 依赖元数据与测试路由 | `*.podspec` 与 `*.podspec.json`（根/嵌套，共用上限 20）：`s.name`/`s.version` 项目元数据、`s.dependency` 与 subspec `sp.dependency` 计入 `dependencyCounts.cocoapods`，`IOS_TECH` 映射技术并保留版本约束；`Podfile`（根/嵌套，`pod 'Name', '~> 1.0'`、`Firebase/Core` 子规格、`:path` 本地 pod）与 `Cartfile`/`Cartfile.private`（`github`/`git`/`binary`，仓库名取 URL 末段）计入 `dependencyCounts.cocoapods`/`carthage`，`IOS_TECH` 只映射经过核对的主流库；嵌套清单上限各 20；`*Tests.m`/`*Tests.mm`/`*Spec.m` 纳入测试路径，影响面据此路由 `affectedTests` | v0.240.0 |
| Objective-C 支持 | 第 42 种语言：`@interface`/`@implementation`（class；类扩展成员非导出，category 归到所属类）、`@protocol`（interface）、`-`/`+` 方法（method，完整选择器，原型止于 `;`、实现按花括号配平）、`@property`（variable，含 block `(^name)`）；`//`、`/* */`、字符串/字符字面量屏蔽；与 `extractCpp` 合并（结构体/typedef/函数保留）；`.h` 按 `@` 声明改判、MATLAB 写法的 `.m` 归为 `matlab`；`#import`/`#include` 经引用方目录与 `include`/`src`/`inc` 根，框架头与 `@import` 不建边 | v0.239.0 |
| MATLAB 支持 | 第 43 种语言：`function`（多输出 `[a,b] = f`、单输出/无输出；嵌套函数带 `parent` 且非导出）、`classdef`（class）、`properties` 块成员（variable，`(Access=private)` 块非导出）与 `methods` 块函数（method，`parent` 为类，私有块非导出）；`%` 行注释、`%{`…`%}` 块注释、单/双引号字符串屏蔽，`x'` 转置不误判；范围按 `end` 在 `if`/`for`/`while`/`switch`/`try`/`spmd`/`arguments` 间配平，紧凑 `if x, y; end` 与无 `end` 风格函数（下一个同缩进 `function` 前收尾）均正确；与 Objective-C 共用 `.m`，按内容改判 | v0.249.0 |
| 默认导入解析 | JS/TS `import Foo from './a'` 在 `deps.js` 记录 `default:Foo` 临时标记（纯默认、与具名/命名空间混合、`type` 前缀均支持）；索引器在边排序后调用 `resolveDefaultImportSymbols`，仅当目标文件存在同名导出符号（`exported !== false`）时替换为真实名字，否则丢弃标记并保留文件级边；不猜别名、匿名默认导出或唯一导出。引用/使用点/影响面自动继承解析结果 | v0.246.0 |
| 上下文包使用点 | `collectSymbolUsages` 移入 `src/usages.js`（cards/context 共用）：`repowiki-context usages=true` 把已解析锚点按定义文件分组，收集直接具名/命名空间导入方与定义文件的使用点；关系段追加 `usage <symbol> in <path>: N site(s)`、每符号 ≤2 条站点与不可读提示，结果输出 `usages`/`usagesSkipped`/`usagesSkippedFiles`/`usagesTruncated`；默认关闭，不影响无 usages 请求 | v0.245.0 |
| 再导出链影响面 | `computeSymbolImpact(edges, resolved, depth, limit, files)` 经 `reexportImportSites`（`includeReexports: true`）把 barrel 导入方与中间再导出 barrel 计为直接影响，`symbolReferences` 带 barrel 导入行号；文件级影响/风险分不变；`repowiki-impact` 传入 `index.files` | v0.251.0 |
| 再导出链引用/使用点 | `src/reexports.js` 由 references/usages 共用：`export * from` 与同名 `export { x } from` 链最多 4 跳，具名导入的最终导入方归到真实定义文件；barrel 自身同名导出遮蔽星号来源，多来源按歧义跳过，再导出边本身不算使用点；`import * as ns` 导入方把 `*` 潜在引用传到下游 barrel 的目标文件；索引器保留 `edges[].kind`（`import`/`export-from`/`require`/`mod`），旧索引重建后生效 | v0.250.0 |
| Rust `{self}` 导入 | `expandRustUse` 对分组内 `self` 叶子改记为前缀模块路径本身（不再追加 `::self`），导入名为模块末段；`{self as local}` 把本地别名写入 aliases，引用归原名、使用点按本地名；解析器 v21 | v0.265.0 |
| `export * as ns` 再导出 | `extractJsImports` 区分 `export * from`（展开全部符号，记 `*`）与 `export * as ns from`（只导出命名空间对象，记空符号）：后者不进入 `buildReexportMaps` 的 stars，下游具名导入不会归到目标文件；解析器 v20 | v0.264.0 |
| Dart 导入可见性 | `extractDartImports` 解析 `show`/`hide` 组合子：无组合子的 import/export 记 `symbols: ['*']`（前者潜在引用、后者星号再导出）；`show` 精确、`hide` 写边 `hidden`，`show … hide …` 时 hide 生效；`buildReferenceIndex` 对有 `hidden` 的星号边按目标导出名展开（扣除隐藏名后记具名潜在引用），`usageImporters` 跳过隐藏名；`part` 不声称符号引用；解析器 v19 | v0.263.0 |
| Go 导入语义 | `extractGoImports` 区分 `import alias "pkg"`/`import . "pkg"`/`import _ "pkg"`：别名写 `aliases: [{from: 包名末段, to: 本地名}]`（词法使用点按本地名扫描）；点导入 `symbols: ['*']`（references 合并到目标全部符号、usageImporters 作潜在导入方）；空白导入 `symbols: []` 保留依赖边但不声称符号引用；解析器 v18 | v0.262.0 |
| PHP/Scala 导入别名 | `extractPhpImports` 的 `use … as`（单个与分组）与 `extractScalaImports` 的 `=>`/`as` 重命名保留原名作为 `imported`，本地名写 `aliases: [{from: 原名, to: 本地名}]`；修复 Scala 曾把别名当导入符号导致引用/影响面匹配不到定义的问题，`=> _`/`as _` 隐藏不登记；词法使用点经 `usageImporters` 按本地名扫描；解析器 v17 | v0.261.0 |
| C#/Kotlin 导入别名 | `extractCSharpImports` 对 `using Alias = App.Models.User;` 保持 `imported: ['User']` 并写 `aliases: [{from:'User', to:'Alias'}]`；`extractKotlinImports` 对 `import a.b.C as D` 同理。引用/影响面按原名归因，`usageImporters` 取 `aliases` 的本地名作为词法扫描名；`using static`、`.*` 通配符不产生别名，C# 泛型/元组别名形态不登记（不猜测）；解析器 v16 | v0.260.0 |
| Python `__all__` 星号可见性 | `src/symbols.js` 的 `pythonAllNames` 解析模块级 `__all__`（`=`/`+=`、`append`/`extend`、跨行列表/元组，上限 20 行），无声明时按下划线前缀判定；符号标记 `starExported`。`src/reexports.js` 的 `starExportedNamesByFile` 产出可见名集合，`resolveReexportOrigins` 的星号队列项按可见名收窄，具名/别名路径不受影响、`default` 不沿星号下传；`src/references.js`/`src/usages.js` 的 Python `*` 边展开为可见名，被排除符号无潜在引用；`__all__` 声明行加入导入块起始跳过规则；解析器 v15 | v0.259.0 |
| 导入别名证据 | JS/TS `import { x as y }` 与 Rust 普通 `use … as` 记录 `imported` 原名与 `aliases [{from:x,to:y}]`（parser v14）；引用/影响面按原名归因，`usageImporters` 只从非再导出边读取 aliases 作为本地扫描名，`reexportImportSites` 亦优先用导入边别名；再导出边别名不会被误当本地绑定 | v0.258.0 |
| 默认导入 barrel | `resolveDefaultImportSymbols` 对 `default:Local` 标记：同名导出优先；否则 `resolveReexportOrigins(edge.to,'default')` 解析具名默认/再导出链，直连目标写入真实符号并记录本地别名，经 barrel 时保留 `default` 导出名并记录别名；`export *` 不转发 default；解析不到丢弃标记保留文件级边；usageImporters/reexportImportSites 把本地别名传给词法扫描 | v0.257.0 |
| tsconfig extends | `parseAliasConfig` 读取 `extends`（字符串/数组）、`baseUrl`、`paths`；`resolveAliasConfig` 递归跟随相对 extends（最多 5 跳、循环检测、结果 memo），子 `paths` 替换父条目并绑定有效 baseUrl，继承 patterns 保留各自 `baseDir`，数组后者覆盖前者；被 extends 的基础配置不单独生效（除 `tsconfig.json`/`jsconfig.json`）；包名 extends 与 `node_modules` 不读取 | v0.256.0 |
| 默认导出再导出 | JS/TS 具名 `export default function/class/interface` 在符号上标 `default: true`；`buildReexportMaps` 汇总 `defaults`（文件 → 默认符号名），`resolveReexportOrigins` 把 `default` 解析到该文件真实具名符号；`export { default as X }` 经别名映射、`export { default }` 经同名映射均可归到定义；匿名默认导出不登记；解析器 v13 | v0.255.0 |
| 别名再导出 | deps 在 JS `export { x as y } from`、Python `from .x import a as b`、Rust `pub use … as y` 上记录 `aliases: [{from, to}]`，indexer 透传到 `edges[].aliases`；`buildReexportMaps` 把别名放进独立映射，`resolveReexportOrigins` 返回 `{path, name}` 原名位置；引用/影响面归到原名，使用点把导入方实际使用的别名传给 `findSymbolUsages`（`aliasNames`）；目标文件未定义原名时不解析（不伪造符号）；解析器 v12 | v0.254.0 |
| Rust `pub use` 再导出 | `deps.js` 把 `pub use`（含 `::*`，符号记 `*`、路径去除 `::*`）记为 `kind: 'reexport'`；indexer 的 `buildRustRootExports` 汇总 crate 入口的公开符号与再导出名，`resolveRustUse` 在 `crate::` 模块路径未命中时仅对入口确实导出的叶子名回退 `lib.rs`/`main.rs`；引用/使用点/影响面经 `reexports.js` 沿链归到定义文件；解析器 v11 | v0.253.0 |
| Python 包 barrel | `buildReexportMaps(edges, files)` 把 Python 文件（`lang: 'python'`）的具名 `from .x import y` 当作同名再导出，`from .x import *` 记为星号再导出；`exportedNamesByFile` 对 Python 按"非 method"纳入模块级符号（该语言提取器统一 `exported: false`）；`__all__` 未解析，星号潜在引用由词法扫描确认；解析器 v10 使旧导入缓存失效 | v0.252.0 |
| 通配引用证据 | `import * as ns` 与 `export * from` 在 `deps.js` 记为 `*`（不再当作无符号副作用导入）：`referencesFor` 把 `*` 合并到目标全部符号（与具名引用去重排序），`usageImporters` 接受 `*` 作为潜在导入方（`usages` 仍经词法扫描确认实际使用），`computeSymbolImpact` 把 `*` 展开为所选符号的直接影响；默认导入保持文件级边、不猜默认导出名 | v0.243.0 |
| 同文件使用点 | `repowiki-cards usages=true` 追加扫描定义文件：`findSymbolUsages` 新增 `skipRanges`（闭区间、非法区间忽略），定义范围不参与匹配，因此递归/签名文本不会被误算；定义文件优先读取且不占 20 个导入方上限，`filesScanned` 同时计入定义文件；DOM/工具测试覆盖定义行跳过、局部调用命中与上限记账 | v0.242.0 |
| 符号使用点查询 | `repowiki-cards usages=true`：对命中符号取直接具名导入方（`usageImporters`，要求 `edge.symbols` 含该符号），在导入方源码中按标识符边界定位使用行（`findSymbolUsages`，排除 import 行/块与整行注释），输出 `symbolUsages`（定义文件、导入位置、站点、已扫描文件数、不可读导入方、单符号截断）；上限 5 符号 / 20 文件 / 100 站点（单符号 10），超出部分计入 `symbolUsagesSkipped` / `symbolUsagesSkippedFiles`，不可读文件披露为 unknown；import 边不带具名符号的语言不产生证据 | v0.238.0 |
| 影响面架构上下文 | `src/impact-architecture.js` + `repowiki-impact`：声明层与索引文件数、改动/受影响文件所属层、改动↔受影响文件之间的跨层边（按层对精确计数，只统计一端改动、另一端受影响的边）与改动文件内高复杂度函数（精确总数 + ≤10 明细）；`src/layers.js` 导出 `assignLayer`（最长前缀优先），status/棘轮门禁/影响面共用同一归属规则；文本渲染 `Architecture:` 行，跨层与热点进入 hint | v0.236.0 |
