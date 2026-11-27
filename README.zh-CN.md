# dsh-repowiki

**仓库符号级知识索引 + 跨会话检索** —— 一个 DeepSeek Harness (DSH) 本地插件 bundle。

把当前仓库索引为符号级知识库 `.dsh-repowiki/`（随 Git 共享），任意会话打开同一目录即可查询符号、文件与依赖关系，无需重读源码。

[中文](README.zh-CN.md) | English（见 [README.md](README.md)）

> 设计依据：仓库 Wiki / 知识卡片功能移植方案的内部评审记录（评审文档本身不包含在本仓库中）。硬约束：零第三方 dsh 插件依赖，全部能力来自 dsh 官方机制。

## 当前阶段：Phase 1–4 完成 —— 11 个工具、零依赖符号索引、36 语言与 SFC/工作区/构建文件解析、面板卡片/Wiki/记忆视图与深链及核心文件排名与引用问题/指纹覆盖率徽章、跨语言资产回退、文档健康度与 Wiki 引用完整性、行号越界校验及内容漂移指纹、漂移感知增量合成、引用感知健康分、引用指纹覆盖率与原因分类及面板提示、有界并发指纹校验、页级覆盖率明细、CI Wiki 新鲜度门禁与卡片/记忆陈旧检测、页面完整性校验、生成失败页持久化、结构化问题码与空清单严格化、面板生成失败/缺页/路径非法/卡片/记忆陈旧提示、旧索引/未验证范围严格化、页面相对链接（页面与项目文件）/清单路径与重复页完整性、status 缺页/路径非法/重复页计数、缺页/失败页/非法路径健康分、门禁有界并发读取、CI 门禁自证 job 及资产必需校验、未覆盖页面筛选、保守导出审计、模块耦合/不稳定性指标、符号级影响面与使用点证据及受影响测试路由、PageRank 核心文件、带符号锚点的任务上下文包、分页检索、嵌套/字符类忽略规则、带写后校验与有界并发大快照校验的指纹快照，Dart 支持与工作区 `package:` 解析、按清单限定复制范围的指纹快照、PHP PSR-4 自动加载解析、默认依赖目录排除、不可信索引路径加固与可复现索引产物与更严格的快照清单校验、有界目录预取与 GFM 表格/嵌套列表渲染与更精确的中文查询分词与依赖图感知的 Wiki 新鲜度，以及 Elixir 模块/别名索引与根/umbrella `mix.exs` 技术栈与 `.exs` 测试/脚本索引、深层 Markdown 标题与清单并发读取与 Lua 模块/require 索引与 Zig 容器/成员索引及 `build.zig.zon` 元数据与结构化不可信索引计数与 Gleam 类型/导入索引与结构化 Wiki 陈旧原因与 Gleam monorepo 清单及跨行导入与 Zig monorepo 清单与 Zig 公开再导出与解析缓存版本升级与 Shell 函数/source 索引与 R 函数/类及 `DESCRIPTION` 元数据与 status 解析器版本可见性与 R `NAMESPACE` 导出证据与 R6/S4 方法符号与 Julia 模块/类型/函数及 `Project.toml` 元数据与 R S4 声明与 Julia 宏修饰 struct/枚举与 Nim 例程/类型及 `.nimble` 元数据与 Nim `type` 块成员与 OCaml 模块/类型及 dune/opam 元数据、`and` 续接定义与原始字符串屏蔽与 Haskell 模块/类型及 cabal 元数据、类方法与多行签名与 Rust workspace crate 解析与 Haskell `hs-source-dirs` 与嵌套 `pubspec.yaml`/`dune-project` 读取上限与 Haskell 导出列表可见性与 Erlang 模块/函数及 rebar 元数据与语言接入完整性守卫与跨语言测试路径约定与 OCaml 同名模块近邻解析与 Solidity 合约/函数及 foundry 元数据与 Clojure 命名空间/形式及 deps.edn/project.clj 元数据与 Terraform/HCL 块及模块源/provider 元数据与索引规模/性能回归守卫与 Groovy 类/方法及点分 import 与 PowerShell 函数/类及模块/dot-source 边与 Fortran 模块/过程及大小写不敏感 `use` 解析与 Perl 包/sub 及 `lib/` 模块解析与 Object Pascal 单元/类及 `uses` 解析与 Nix 绑定及 `import`/`callPackage` 路径与 VB.NET 命名空间/类及 `Imports`/`Inherits` 解析（v0.223.0）

| 能力 | 说明 |
|---|---|
| `repowiki-index` 工具 | 确定性（零 LLM）重建索引：JS/TS、Vue 与 Svelte SFC、Python、Go、Rust、Java、C#、Kotlin、PHP、Ruby、Swift、Scala、Dart、Elixir、Lua、Zig、Gleam、Shell、R、Julia、Nim、OCaml、Haskell、Erlang、Solidity、Clojure、HCL、Groovy、PowerShell、Fortran、Perl、Pascal、Nix、Visual Basic .NET、C、C++（含 Scala 3 缩进语法、`extension` 与 `given`；Dart 类/mixin/extension/typedef 与工作区 `package:` 解析）符号表，本地 import 依赖边（含嵌套 `go.mod` 的 Go 多模块仓库），技术栈识别（npm/pip/go/cargo/maven/gradle/composer/bundler/swiftpm/sbt/pub/mix/zig（含 monorepo）/gleam（含 monorepo）/r/julia/nim/ocaml/haskell/erlang/solidity/clojure/hcl/cmake），语言分布与 Git 溯源（只读 `.git/HEAD` 的 `branch`/`commit`），模块树（按目录归组，深度 ≤2），写入 `.dsh-repowiki/index.json`；增量——内容摘要未变的文件直接复用上一版条目，并给出新增/变更/删除计数；尊重文档化的 `.gitignore`/`.repowikiignore` 子集（含字符类与按所在目录作用域的嵌套规则）并统计 `ignored`；不可读或超大源码文件计入 `skipped`（附告警）而非静默消失；Go `internal` 可见性违规以告警报告（边仍保留；上限 50 条，其余折叠为汇总）；取消时不覆盖旧索引 |
| `repowiki-cards` 工具 | 跨会话只读检索：按符号名 / 种类 / 路径 / 模块 / 语言过滤，或只看公开符号（`exportedOnly`）；命中按精确 > 前缀 > 子串排序（同强度内导出优先），文件按最佳命中排序，方法结果带所属类型；返回文件+符号、项目技术栈与模块树；`target=docs/all` 对卡片、Wiki 与已采信记忆做零依赖 BM25 排序检索；`includeMemory` 附带同查询命中的已采信会话记忆；`references=true` 追加带语句行号的 import 级反向引用（`referencedBy: [{path, line}]`，上限 100 条）；`wikiReferences=true` 追加 Wiki 引用（`wikiReferences: [{path, slug, title, sections}]`）；`imports=true` 列出命中文件的出边（`imports: [{path, line, symbols, depth}]`，保留副作用导入、跳过自引用、上限 100 条）；`depth` 2–3 展开传递依赖（最小跳数优先、环保持有界）；`offset` 对文件与文档结果分页，`total` 始终为全集计数；`locale` 省略时自动使用"环境语言 → 实际有资产的另一语言"回退，显式指定则严格读取该语言 |
| `repowiki-extract` 工具 | 每文件一个 spawn 子代理（继承会话模型）生成知识卡片（职责、关键符号、陷阱、相关模块），写入 `.dsh-repowiki/knowledge/<locale>/`；prompt 携带项目名、技术栈与模块路径，`relatedModules` 复用真实模块名；关键符号附索引行号；同目录写 `_index.json` 模块→卡片清单；源文件摘要变化时卡片自动刷新，但标记为 `manuallyEdited` 的卡片受保护；源文件已消失的卡片报告为孤儿；`locales: ['zh','en']` 按 locale 串行处理并在 `byLocale` 分语言汇报；`concurrency`（1–4，默认取计划）并行派发多个文件抽取，写卡仍串行；`attempts`（1–3，默认 2）对抛错/坏输出做可取消的指数退避重试（模型明确 `skip` 不重试） |
| `repowiki-generate` 工具 | 只读卡片集合 + 技术栈（+ 已采信的会话记忆作为约定/决策）与最多 15 条跨模块依赖摘要、最多 5 组文件级循环依赖、最多 5 个 fan-in 热点文件，凝练 Wiki 页面写入 `.dsh-repowiki/wiki/<locale>/`；`granularity=theme/module/all`（模块页确定性生成，无模型调用，区分出边/入边模块依赖、标注双向依赖的循环模块并追加高风险入口节）；`locales: ['zh','en']` 时主题页按 locale 各合成一次；自动目录、页级/章节引用为相对路径 + 可选 `#Lx-Ly` 并按索引白名单净化；每轮写 `wiki/<locale>/_index.json`（含 `inputDigest`（卡片）与 `graphDigest`（索引文件集合 + 依赖边）供陈旧检测；失败页写入 `failed`（最多 10 条）与 `failedTotal`）；重复 slug 自动改名，单页失败进入 `failed` 清单而非丢弃整轮；清单里的卡片指纹与已采信记忆指纹一致、且记录的引用内容指纹仍可验证时跳过主题合成（不调用模型；引用变化或无法验证时报告 `citationDrift` 并重新合成），`force=true` 可强制重跑；抛错或空页面列表按可取消退避重试（`attempts` 1–3）；每轮输出 `citationCoverage` 及原因（不可读/行号非法/读取上限），未记录指纹的引用不会被当成已验证 |
| `repowiki-status` 工具 | 只读健康诊断（无 LLM）：索引存在/版本/兼容、文件/符号/模块数（含跳过文件）、语言分布、Git 分支/提交、最近抽取快照（`lastExtract`：计数、失败/重试、并发、尝试次数、耗时）、卡片陈旧/孤儿、Wiki 清单/陈旧/失败页/缺页/路径非法/重复页/孤儿（失败页、缺页、非法路径各附最多 10 个 slug，重复 slug/路径单独计数）、记忆审核计数、plan 来源、进程内锁队列、跨模块依赖热点、文件级循环依赖组（每组附一条代表性最短环路径）、fan-in hub（被最多文件依赖的入口）、PageRank 核心文件（前 10，计入间接重要性，仅索引有依赖边时）与告警（文本报告最多 3 条 + 折叠计数；被篡改索引被净化时输出结构化 `index.untrusted` 文件/边计数并在 `Index:` 行展示；`wiki.staleReasons`（`cards`/`graph`/`memory`，与 `verify:wiki` 同值域同顺序）在 `Wiki:` 行展示）；新增文档覆盖率（分母为 plan 阈值下有资格生成卡片的文件，附缺口最大的模块）、Wiki 引用完整性（缺失引用先查索引再查文件系统，页面明细有界；索引记录行数时校验 `#Lx-Ly` 越界；清单 v3 的内容指纹可检测引用代码漂移并给出 tracked/untracked 覆盖率与原因、页级覆盖率明细，重算走有界并发读取）、保守导出审计（存在无名入边的文件整体跳过）、模块 Ca/Ce 耦合与不稳定性，以及加权健康分（文档 40 / Wiki 25 / 架构 20 / 卫生 15，A–D 等级 + 前四条待办；引用缺失、行号越界、内容漂移、缺页/生成失败页与非法路径扣减 Wiki 分量，未验证引用只报告不扣分）；读取 locale 支持"环境语言 → 有资产语言"回退并在输出中标注 |
| `repowiki-impact` 工具 | 改动前的影响面分析（只读、确定性、无 LLM）：把变更路径匹配到索引文件（绝对路径/后缀/唯一 basename，歧义只列候选不猜）；在反向 import 图上按最小跳数展开直接与传递依赖方（`depth` 1–3，明细有界但总数精确）；列出涉及变更文件的循环组（含代表路径）、变更文件的 fan-in；返回会受影响的卡片（含陈旧标记）与 Wiki 页面/章节引用；给出可解释的风险分层（直接依赖 / 传递依赖 / 循环 / hub 四个计分因子，low–critical）与按优先级排序的验证建议。可选 `symbols` 支持裸符号名与 `path#name`：直接层要求具名 import 证据，传递层保留文件图保守展开；解析不到时不悄悄放大范围，`conservativeImpactedTotal` 保留文件级上界；默认扫描直接具名导入方并返回 `usages` 词法使用点（`path:line` + 源码行），排除 import/export 列表、解构绑定与整行注释，最多 20 个文件 / 每符号 10 条 / 总计 100 条，读取失败列入 `usagesUnreadable`（未知而非无使用），`includeUsages=false` 可关闭源码读取；受影响的测试文件按路径启发式单列为 `affectedTests`（最近跳数优先、上限 50），并在验证建议中首先点名 |
| `repowiki-context` 工具 | 一次调用生成任务证据包（只读、确定性、无 LLM）：按标识符、路径、显式 anchor 与卡片/Wiki/记忆 BM25 命中给文件排序；把相关符号定义、带真实行号的源码片段、直接 imports/dependents、相关循环与 fan-in 热点合成一个 Markdown 包。`budget` 为 2,000–40,000 字符硬上限（默认 12,000），源码/文档/关系省略分别计数，不把截断内容冒充完整证据；主文件列表与源码读取均有界；任务未命中任何索引文件且 import 图有边时，用 PageRank 前 5 个文件作为 repo map 兜底，逐条标 `(repo map)` 并输出 `fallback: 'repo-map'`，明确"起点而非任务相关性"；可选 `symbols`（裸名或 `path#name`）可脱离 query 直接锚定定义，裸名多文件定义时报告歧义候选而不猜，锚点失败时不扩大搜索、也不被 repo map 兜底掩盖 |
| 项目级规划 | `.dsh-repowiki/repowiki-plan.json`（随 Git 共享）：exclude / includeOnly / maxCardsPerRun / cardComplexityThreshold / concurrency / attempts |
| `repowiki-export` 工具 | 把 `.dsh-repowiki/` 资产复制为目录快照（备份或转移；仅 Markdown/JSON，无模型调用）；每个文件写后回读校验，再写 `_snapshot.json` 记录文件与内容指纹；目标非空时默认拒绝，除非 `overwrite`；取消时如实上报 `aborted` |
| `repowiki-import` 工具 | 从快照目录恢复 `.dsh-repowiki/`；存在 `_snapshot.json` 时以 8 路有界并发逐文件校验指纹（上限 2 万文件），损坏/不完整快照默认拒绝（`allowCorrupt` 可强制；旧快照无清单时提示未校验；未知清单 schema、count 不一致、非对象 JSON 与超过 8 MiB 的清单均视为损坏）；只复制清单列出的文件，快照里多出的文本文件跳过并计数（`snapshotUnlisted`）；已有资产默认受保护，除非 `overwrite`；恢复后校验 `index.json` 兼容性 |
| `repowiki-edit` 工具 | 人工修订知识卡片：`create` 新建人工卡（path 可为索引外路径），`update` 改写现有卡片；两者置 `manuallyEdited`，`repowiki-extract` 不再自动刷新该卡 |
| `repowiki-memory` 工具 | 把本会话学到的知识沉淀到 `.dsh-repowiki/memory/<locale>/`（默认 `pending` 待审），再经 `list` / `accept` / `reject` 完成审核闭环；条目为带 JSON frontmatter 的 Markdown，随 Git 共享；同名 slug 不同标题哈希共存，审核记录 `reviewedAt` |
| Repo Wiki 面板（web） | 侧栏"自动化任务"旁的"Repo Wiki"入口，打开工作区页面。**默认总览模式**列出所有工作区的状态点与统计；点击行下钻单库视图：文件/符号/卡片/文档统计与最近更新、"全部/已生成/未生成/待更新"筛选（未生成 = 在 `index.json` 中但没有卡片；待更新 = 卡片 digest 与索引不一致）、按标题/路径/标签/符号/卡片正文的延迟搜索、分页（120 + 加载更多）、按路径/标题/更新时间排序、多语言索引下的语言筛选（展示可读语言名）与按语言文件分布、索引有跳过文件时的跳过计数、索引告警计数（可展开完整列表，悬停预览前三条）、高风险入口提示行（被最多文件依赖，chip 可点开对应详情）、标签筛选、网格与列表视图、循环依赖文件的 `⟲` 徽章（2–3 文件环的 tooltip 附代表性断链路径）、按模块分组、卡片详情与复制路径、循环摘要（组大小 + 代表性路径，环内其他文件可点击）、行号级 import 反向引用与出边（两个列表中的文件均可点击打开详情；双向依赖用 `↔` 标记，1/2/3 跳深度控件同时驱动依赖与依赖方两个方向）、可点击的 Wiki 引用与章节 chips（跳转到任意被引章节）、最近一次抽取快照（失败数用错误色）、以及 Wiki 页签（搜索、清单分组、孤儿标记、引用问题徽章、带原因的指纹覆盖率徽章、“仅看未覆盖”筛选、生成失败/缺页/路径非法/重复页提示与卡片/记忆陈旧提示）——Wiki/卡片 Markdown 由零依赖渲染器呈现（标题、围栏、带对齐的 GFM 表格、嵌套列表、引用、行内格式与链接），` ```mermaid ` 围栏（含 `subgraph` 分组）会画成带主题令牌的内联 SVG 流程图——数据经 `ctx.remote.workspaceFiles` 从 `.dsh-repowiki/` 读取（资产 JSON 分页上限 60 万行，大型仓库索引可完整加载）——以及生成动作（ADR-0004） |

路线图：
- Phase 3（v0.6.0 完成）：内容摘要驱动的索引增量重建、卡片自动刷新、人工修订保护、孤儿卡片报告、目录导入导出
- Phase 4（v0.12.0 完成）：会话记忆工具与完整审核闭环、记忆三出口（生成汇总 / 检索可见 / 面板页签）、Repo Wiki 面板
- 巩固（v0.15.0）：重复的路径解析与 frontmatter 编解码逻辑收敛进 `src/util.js`（净 −139 行）；方案覆盖率见 `docs/coverage.md`
- 稳定性加固（v0.16.0）：真实语料客户端回归测试（本仓库自产卡片灌入面板渲染路径）、事件处理器兜底（抛错转为可读状态行而非静默无反应）、Node 22/24 CI 门禁
- DOM 集成（v0.17.0）：真实 React 18 + jsdom 测试套件用真实 click/change/keydown 事件驱动面板（语料同上）——闭合"用户点击无反应"的复现盲区（事件级接线已验证健康）；devOnly 测试依赖（react/react-dom/jsdom）不改变零运行时依赖形态
- 多工作区总览（v0.18.0，ui-plan 切片 2）：每行一个工作区带状态与统计，点击下钻；复用各工作区自身的会话 scope，无需新的 Host 数据面
- 主题令牌实证（v0.21.0）：解析 app.asar 提取官方主题 CSS——`design-platform.css` 定义全部 264 个 `--dsw-alias-*` 令牌（含深色重定义），主前端壳消费 348 处，本插件令牌全部命中；同时"已生成"状态点改用 `state-done-primary`（紫），解决灰蓝难区分
- 宿主漂移自检（v0.22.0）：`npm run verify:host` 直接核对 client.js 引用的令牌在新版 dsh 自带 CSS 中是否仍存在且有深色变体；CI 无宿主时自动跳过
- Qoder Repo Wiki 对齐（v0.43.0）：模块树（`modules[]` + `files[].module`）、
  卡片/Wiki 相对路径与行号引用、自动目录与章节来源、面板按模块分组；
  引用经路径白名单净化（ADR-0006）
- 并发写串行化（v0.43.0）：六个写工具按资产根进程内 FIFO 排队（O5，ADR-0005）
- 安全与正确性基线（v0.44.0）：面板链接协议白名单、端到端 `AbortSignal` 取消、
  写入回读校验、索引 schema v3（兼容 v2）、记忆哈希后缀防覆盖；锁范围收窄为
  "写前判定 + 写盘"，LLM 派发不再持锁（ADR-0005 修订）
- 产品力与体验（v0.45.0）：`.gitignore` 子集、零依赖 BM25 正文检索、模块级
  Wiki 与清单、陈旧/孤儿检测、`repowiki-status`、面板分页/排序/标签/Wiki 搜索/
  可访问性
- 工程卓越与发布（v0.46.0）：TypeScript `checkJs`（渐进）、ESLint、3 OS CI 矩阵
  （Windows canary）、覆盖率门禁、密钥扫描、CodeQL、Dependabot、SBOM、发布脚本
  与 runbook/基准文档（ADR-0007）
- 语言与生态扩展（v0.47.0）：Go/Rust/Java 符号与本地依赖边、Maven/Gradle
  技术栈、Git 溯源（`.git/HEAD` 分支/提交）、语言分布、多 locale 抽取与生成、
  索引 schema v4（兼容 v2/v3）
- 反向引用（v0.48.0）：`repowiki-cards references=true` 与面板详情回答
  "哪些文件 import 了这个符号"，由 `index.edges` 按需反演，输出有界且
  如实标注 import 级语义
- 行号级引用（v0.49.0）：索引 schema v5 在每条边上记录 import/use/require
  行号，反引用与面板定位到 `path:Lx`；旧索引自动降级为仅路径
- Wiki 引用反查（v0.50.0）：Wiki 清单 v2 记录章节级来源，
  `repowiki-cards wikiReferences=true` 与面板回答"这个文件被哪些 Wiki
  页面/章节引用"，闭合代码 ↔ 文档双向链路
- 8 语言覆盖（v0.51.0）：C#/Kotlin/PHP 符号与本地依赖边、Composer 技术栈、
  全部受支持语言的 prompt 围栏标识
- 有界并发抽取（v0.52.0）：计划/工具参数 `concurrency` 1–4 并行模型调用，
  写盘仍串行；取消后不再派发，失败清单排序保证输出可复现
- 抽取重试（v0.53.0）：`attempts` 1–3 对抛错/坏输出做可取消的指数退避
  重试；明确 skip 终止，不浪费调用；结果报告 `attempts`/`retried`
- Wiki 引用跳转（v0.53.1）：详情中的引用标题可点击，切换到 Wiki 页签并
  打开对应页面，带可访问名称
- 章节级深链（v0.53.2）：跳转后滚动到首个被引用章节，复用 Markdown 渲染
  的同一锚点函数，目标与标题 id 一致
- 抽取运行诊断（v0.54.0）：知识清单 v2 持久化最近一次运行（计数、失败、
  重试、并发、尝试次数、耗时），`repowiki-status` 直接展示
- 面板运行快照（v0.54.1）：单库统计行展示知识清单里的最近一次抽取，
  失败数用错误色；切换到无会话/无资产工作区时状态干净重置
- 11 语言覆盖（v0.55.0）：Ruby（class/module/def/attr/常量，
  `require_relative` 相对边）、Swift（class/struct/enum/protocol/
  extension/func/init，模块级 import）、Scala（class/case class/trait/
  object/enum/def，分组/重命名 import）；Gemfile、Package.swift、
  build.sbt 技术栈识别
- Wiki 章节 chips（v0.56.0）：每个被引章节一个可点击 chip，跳转到该章节
  （数量有界，溢出显示 +N）；Ruby 块范围忽略 heredoc 内容与
  `=begin/=end` 块注释
- 检索排序与语言过滤（v0.57.0）：符号命中按精确 > 前缀 > 子串排序
  （导出符号优先），文件按最佳命中排序；`repowiki-cards` 新增 `lang` /
  `exportedOnly`，面板新增语言下拉
- 面板符号搜索与 Scala 3（v0.58.0）：面板按索引符号名定位文件；工具结果
  展示方法所属类型；Scala 3 缩进体获得正确的成员范围与归属
- Wiki 增量合成（v0.59.0）：卡片与已采信记忆指纹未变时
  `repowiki-generate` 跳过模型调用（`force` 可覆盖）；记忆变化晚于 Wiki
  时状态工具给出告警
- SwiftPM target 依赖边（v0.60.0）：`import Core` 解析到
  `Sources/Core/` 的代表文件，多 target 仓库获得依赖与反向引用数据；
  自引用边被丢弃
- 生成重试与索引变更计数（v0.61.0）：主题合成抛错/空输出按退避重试
  （`attempts` 1–3）；`repowiki-index` 报告新增/变更/删除数
- 上下文感知卡片与 Scala 3（v0.62.0）：卡片 prompt 携带项目名/技术栈/
  模块路径以约束 `relatedModules`；Scala `extension` 方法与 `given`
  实例获得正确归属与范围
- 大索引面板加载（v0.63.0）：资产 JSON 采用 120 页读取预算，大型仓库的
  `index.json` 不再被截断成坏 JSON；仍超限时报 `too-large` 而非解析错误
- JS/TS 别名与工作区依赖边（v0.64.0）：非相对 import 经
  `tsconfig`/`jsconfig` 的 `paths` + `baseUrl`（就近配置优先）与 monorepo
  包名（`exports`/`main` → 源码入口）解析到本地文件；外部包仍不建边
- Python 绝对导入（v0.65.0）：`import a.b` / `from a.b import c` 在项目根
  与任意 `src`/`lib` 布局根下解析，`from 包 import 名` 优先同名子模块；
  标准库与第三方 import 仍不建边
- SwiftPM 自定义路径（v0.66.0）：解析 `Package.swift` 的 target 声明
  （剥离注释、支持多行），`import 模块` 解析到声明的 `path:` 目录；
  显式声明优先于 `Sources/<Target>/` 约定
- Ruby 加载路径（v0.67.0）：裸 `require 'pkg/file'` 按任意层级 `lib/`
  目录（深度优先）再回退项目根解析；`require_relative` 保持文件相对；
  聚合入口与嵌套 gem 现在能建边，外部 gem 仍不建边
- 有界并行索引（v0.68.0）：源码读取/解析默认 8 路并发
  （`readConcurrency`，硬顶 16），按遍历位置装配，索引保持确定性；
  本地同步 fs 收益有限，远程 RTT 受限的 `ctx.fs` 收益最大
- C/C++ 支持（v0.69.0）：class/struct/union/enum/typedef、函数/方法/
  构造/析构与原型（多行签名、`static` 可见性、匿名 typedef）；引号
  `#include` 先按文件目录、再按 `include`/`src`/`inc` 根解析，系统头不建边
- CMake 技术栈（v0.70.0）：`CMakeLists.txt` 的 `project()` 提供项目名，
  `find_package()` 计入 `dependencyCounts.cmake` 并映射技术（Qt、Boost、
  OpenCV、Eigen、fmt、spdlog、protobuf、gRPC、Catch2、GoogleTest 等）；
  未知包只计数，不臆造技术名
- 嵌套 CMake 子项目（v0.71.0）：任意层级 `CMakeLists.txt` 都贡献
  `find_package` 计数与技术（带各自清单来源，嵌套上限 50 份）；项目名
  仍只取根清单
- Scala 多行签名（v0.72.0）：声明头跨行（`{`、`=` 或 Scala 3 `:` 结束）
  时得到正确的范围与 `parent` 归属，缩进体以签名结束行为基准
- 面板可读语言名（v0.73.0）：语言筛选与卡片详情展示 `JavaScript`、
  `C#`、`C++` 等名称，筛选值仍为原始索引 id
- pyproject 导入根（v0.74.0）：setuptools `package-dir`、PDM 字符串形式、
  `packages.find where` 与 poetry `from` 目录并入 Python 导入根；绝对
  路径与 `..` 值被忽略
- 语言分布（v0.75.0）：单库视图展示可读的按语言文件数（前 8 种 + 溢出），
  旧索引回退按文件行统计
- 模块页依赖方向（v0.76.0）：确定性模块 Wiki 页拆分 `依赖模块`（出边）
  与 `被依赖模块`（入边），各自排序并截断到 8 条
- 尖括号 include（v0.77.0）：`#include <core/api.hpp>` 经
  `include`/`src`/`inc` 根解析（引号形式仍先查文件目录）；系统头不建边
- 模块依赖 prompt（v0.78.0）：主题合成注入最多 15 条跨模块依赖摘要，
  并要求只使用这些方向，架构页以索引进图为依据
- 状态热点（v0.79.0）：`repowiki-status` 返回并渲染前 10 条跨模块 import
  边，不生成 Wiki 也能看到架构热点
- 文件出边查询（v0.80.0）：`repowiki-cards imports=true` 回答"这个文件依赖
  谁"，给出目标路径、语句行号与具名符号，与反向引用互补
- 循环依赖检测（v0.81.0）：`repowiki-status` 以强连通分量口径报告文件级
  循环组，主题合成被要求把循环作为架构风险指出
- 面板依赖列表（v0.82.0）：卡片详情与反向引用并列展示出边，双向依赖用
  `↔` 标记（两文件成环一眼可见）
- 模块页循环节（v0.83.0）：确定性模块页列出双向 import 的模块，判断基于
  完整边计数（先于各方向前 8 条截断）
- Hatch 导入根（v0.84.0）：`[tool.hatch.build]` / target 的 `packages`
  转为 Python 导入根，setuptools / PDM / poetry / Hatch 四类构建后端齐备
- Vue SFC 索引（v0.85.0）：`<script>` / `<script setup>` 内容按 JS/TS
  规则解析，行号与源文件一致；template/style 不产符号
- 跳过文件计数（v0.86.0）：不可读或超大源码文件在索引统计、工具输出、
  状态行与告警中如实报告为 `skipped`
- 卡片正文检索（v0.87.0）：面板搜索同时打分卡片正文（职责/关键符号/
  陷阱），每行预先小写，逐键搜索成本受控
- Svelte SFC 索引（v0.88.0）：模块与实例 script 块按 JS/TS 规则解析，
  行号与源文件一致；标记与样式不产符号
- 面板跳过统计（v0.89.0）：索引报告跳过文件时，统计行追加 `跳过文件 N`
  并附本地化悬停说明
- 面板循环徽章（v0.90.0）：处于 import 环的文件在网格与列表视图显示
  `⟲`，带本地化可访问名与悬停提示
- Go 多模块解析（v0.91.0）：嵌套 `go.mod` 前缀解析子模块 import；
  目录更深/module 更长优先，根模块行为不变
- 传递依赖（v0.92.0）：`repowiki-cards imports=true depth=2..3` 按 BFS
  展开 import 图（最小跳数优先、有界、环不无限展开）
- 面板依赖深度（v0.93.0）：卡片详情"依赖文件"区块提供 1/2/3 跳选择器，
  客户端与服务端同语义 BFS（更深跳数用 `⇢` + `N hops` 标注，重开卡片
  重置为 1 跳）
- 反向影响面（v0.94.0）：`repowiki-cards dependents=true` 回答"谁 import
  了这个文件"，`depth=2..3` 追加间接依赖方（`←` / `⇠`）；面板详情新增
  依赖方列表，与出边共用同一个深度控件
- fan-in hub（v0.95.0）：`repowiki-status` 按不同依赖方数量排名最常被
  导入的文件（并列按路径），作为改动风险热点
- 内联 mermaid 图（v0.96.0）：Wiki 页面与卡片正文里的 ```` ```mermaid ````
  围栏渲染为带主题令牌的 SVG 流程图（确定性分层布局；不支持的类型降级为
  代码块）
- 面板高风险入口（v0.97.0）：单库视图列出 fan-in 前三的文件，与状态工具
  排名同口径
- Go `internal` 检查（v0.98.0）：索引报告跨 `internal` 边界的导入为告警
  （边保留；根 `internal/` 不受限）
- 面板索引告警（v0.99.0）：统计行展示告警数，悬停列出前几条
- 高风险入口可点击（v0.100.0）：fan-in chip 点击打开对应文件详情
- 生成 prompt 注入 fan-in 热点（v0.101.0）：主题合成带上前五个高风险
  入口与"不得虚构"约束
- 模块页高风险入口（v0.102.0）：确定性模块页追加本模块 fan-in 前三文件
  （跨模块依赖方计入）
- mermaid subgraph 分组（v0.103.0）：`subgraph` 块渲染为带组名的虚线分组框
- 索引告警可展开（v0.104.0）：统计行计数按钮切换完整告警列表（悬停保留
  三条预览）
- mermaid 指令对齐（v0.105.0）：合成 prompt 要求 `flowchart` + `subgraph`
  与简短标签
- internal 告警有界化（v0.106.0）：Go `internal` 违规上限 50 条，其余
  折叠为汇总
- 状态报告告警有界（v0.107.0）：文本最多 3 条 + 折叠计数，结构化数组保留
  全量
- 循环代表性路径（v0.108.0）：每个环附一条最短闭合路径（`a → b → a`），
  状态行与合成 prompt 同步展示
- 面板循环徽章附路径（v0.109.0）：`⟲` tooltip 对 2–3 文件环追加该路径
- 详情循环摘要（v0.110.0）：详情面板直接展示组大小与短环路径，无需悬停
- 环内路径可点击（v0.111.0）：路径中的其他文件可点开各自详情
- 依赖条目可点击（v0.112.0）：依赖与依赖方列表均可打开目标文件详情
- 跨语言资产自动回退（v0.113.0）：`repowiki-cards` 的正文/记忆/Wiki 引用
  与 `repowiki-status` 在未显式指定 locale 时自动回退到实际有卡片/Wiki/
  记忆的语言；显式指定保持严格。修复了"资产在 zh、宿主语言是 en 时
  检索静默为空"的环境相关缺陷，测试套件在 `LANG=en` 与 `LANG=zh` 下
  均全绿
- 文档覆盖率与健康度（v0.114.0）：状态工具按 plan 的复杂度阈值统计
  有资格文件的卡片覆盖，输出缺口最大的模块；四分量加权健康分（A–D）
  与前四条待办，让"文档欠债"与架构/告警问题可排序
- 变更影响面工具（v0.115.0）：`repowiki-impact` 在编辑前给出直接/传递
  依赖方、循环组、fan-in、受影响卡片与 Wiki 引用、可解释风险分层与
  验证顺序；路径歧义只列候选不猜
- 符号级影响面（v0.116.0）：`repowiki-impact symbols=[...]` 以具名 import
  证据过滤直接依赖方，同时保留传递层与文件级上界；未解析符号不放大范围
- 有预算的任务上下文（v0.117.0）：`repowiki-context` 一次打包排序文件、
  带行号源码、知识文档与静态关系，按字符预算截断并显式报告各类省略数
- 解析正确的增量索引（v0.117.0）：多行 JS/TS import/export-from 保留起始
  行号与具名符号；`parserVersion` 让旧解析缓存自动失效，同时不把已有文件
  误报为新增
- 使用点证据（v0.118.0）：符号模式下 `repowiki-impact` 扫描直接具名导入方，
  按标识符边界定位符号出现行（排除 import/export 列表、解构与整行注释），
  输出 `path:line` 与源码行；明确标注为词法证据而非解析后的调用点，读取
  20 个文件 / 每符号 10 条 / 总计 100 条有界，失败文件单独披露
- PageRank 核心文件与 repo map 兜底（v0.119.0）：`repowiki-status` 按静态
  import 图 PageRank 排名文件，补上 fan-in 看不到的间接重要性；
  `repowiki-context` 在任务无任何命中时用同一排名兜底，并明确标注
  "起点而非任务相关性"
- 任务上下文符号锚点（v0.120.0）：`repowiki-context symbols=[...]` 支持
  裸名与 `path#name`，无 query 也能定位定义；裸名多文件定义时列候选不猜，
  锚点失败不被 repo map 兜底掩盖
- 面板核心文件（v0.121.0）：单库视图在 fan-in 高风险入口旁新增 PageRank
  chip 行，文件可点击打开详情；索引无依赖边时隐藏
- 受影响测试路由（v0.122.0）：`repowiki-impact` 按路径启发式识别受影响
  测试，最近跳数优先（上限 50），并在验证建议中首先点名要跑的文件
- Wiki 引用完整性（v0.123.0）：`repowiki-status` 将清单引用对索引与文件
  系统校验，缺失路径按页有界报告；未验证引用绝不冒充缺失
- 保守导出审计（v0.124.0）：`repowiki-status` 列出无具名 import 证据的
  导出；仅审计所有入边都具名的文件，其余如实计入未审计数，不猜死代码
- 模块耦合指标（v0.125.0）：`repowiki-status` 按跨模块 import 给出
  Ca/Ce 与不稳定性 `Ce/(Ca+Ce)`，按不稳定性降序
- 引用行号越界校验（v0.126.0）：索引 schema v6 记录源码行数；
  `repowiki-status` 标记零起始/倒置/超出 EOF 的 `#Lx-Ly` 引用，行数未知
  时计入 unchecked 而非猜测
- 面板引用问题（v0.127.0）：Wiki 页签展示越界/未检查汇总与逐页
  `⚠ N` 徽章，数据来自清单与索引行数
- 引用内容漂移（v0.128.0）：清单 v3 为每条引用记录内容指纹；
  `repowiki-status` 重算并报告已变化引用，不可读条目计入 unchecked
- 漂移感知增量（v0.129.0）：`repowiki-generate` 在 fresh 短路前重算清单
  引用指纹；引用变化或无法验证时重新合成并说明原因，干净验证返回
  `citationDrift: 0`，status 与 generate 共用同一套有界检查
- 引用感知健康分（v0.130.0）：引用缺失、行号越界与内容漂移按严重度扣减
  健康分的 Wiki 分量（上限 40/20/20），未验证引用只报告不扣分
- 引用指纹覆盖率（v0.131.0）：generate/status 输出 `citationCoverage`；
  未记录指纹的引用标为未覆盖而非已验证，旧清单单独区分
- 面板指纹覆盖率（v0.132.0）：覆盖率不完整时 Wiki 页签显示弱化的 `◌ N`
  徽章与 `tracked/total` 汇总，旧清单只提示一次无指纹记录，并修复页级/
  章节引用重复计数
- 未覆盖原因分类（v0.133.0）：生成记录引用无指纹的原因（不可读/行号非法/
  读取上限），status 与 hint 展示分类；旧清单回退为 unknown 而不猜测
- 面板原因提示（v0.134.0）：Wiki 页签读取 `citationMisses`，在 `◌ N`
  徽章 tooltip 与覆盖率汇总中展示本地化原因，仍不读取源码
- 并发漂移读取（v0.135.0）：漂移校验先对唯一引用文件做有界并发预取
  （默认 8，上限 16），保持上限、顺序与 unchecked 口径不变
- 页级覆盖率明细（v0.136.0）：`repowiki-status` 列出最多 10 个存在未覆盖
  引用的页面（未覆盖多者优先并带原因），文本报告点名示例页；健康分只提示
  数量、不扣分
- CI Wiki 门禁（v0.137.0）：`verify:wiki` 对断链/越界/漂移失败，未覆盖/
  未验证默认警告、`--strict` 失败；支持 `--root`/`--locale`/`--json`，
  并修复页级/章节重叠引用导致的越界计数翻倍
- 面板未覆盖筛选（v0.138.0）：Wiki 页签可只显示存在未覆盖引用的页面
  （按钮带数量与 `aria-pressed`，可与搜索组合），无结果时使用专门文案
- 陈旧 Wiki 检测（v0.139.0）：`verify:wiki` 按与 generate 相同口径重算
  卡片 `inputDigest`，卡片在生成后变化即失败（即使所有引用路径仍存在）；
  旧清单无 `inputDigest` 时仅告警跳过
- 记忆陈旧与资产必需（v0.140.0）：门禁同时重算已采信记忆的
  `memoryDigest`（与 generate 的增量短路同口径），`staleReasons` 区分
  卡片/记忆；`--strict` 对缺失陈旧指纹的清单失败；`--require` 在无 Wiki
  资产时失败，避免 CI 静默通过
- 页面完整性（v0.141.0）：清单登记的页面在磁盘缺失时失败（generate 会
  重建，缺页不应通过），未入清单的孤儿页仅告警；JSON 输出
  `missingPages`/`orphanedPages`
- 结构化问题码与空清单（v0.142.0）：`--json` 输出稳定
  `problems[].code` 供 CI 聚合；空清单默认告警、`--strict`/`--require`
  失败；`--strict` 对引用探测触及 200 路径上限也失败
- 生成失败页持久化（v0.143.0）：generate 在清单记录写失败页
  （`failed` 最多 10 条 + `failedTotal`）；`verify:wiki` 以
  `wiki/generation-failed` 报告（默认警告、`--strict` 失败），status
  输出 `wiki.failed`/`wiki.failedPages` 并在文本中显示
- 面板 Wiki 诊断（v0.144.0）：Wiki 页签提示上次生成失败页与磁盘缺失的
  清单页；页面列表为空时同样显示，tooltip 附最多 5 个 slug
- 旧索引与 CI 自证（v0.145.0）：`index.json` 早于 v6 或 `#Lx-Ly` 无法
  验证时默认告警、`--strict` 失败；工作流新增 fixture job，实际断言
  严格门禁在干净资产上通过、卡片变化后退出码为 1
- 页面结构与链接（v0.146.0）：清单页面路径必须在 `wiki/<locale>/` 下且
  与实际文件一致；正文中的相对 `.md` 链接指向缺失文件或越出项目根时
  失败，探测上限 200、`--strict` 下截断也失败
- 状态缺页计数（v0.147.0）：`repowiki-status` 输出
  `wiki.missing`/`wiki.missingPages` 并在文本中显示，与门禁和面板同口径
- 缺页健康分（v0.150.0）：缺页计入 Wiki 分母，按 40 分权重扣减分量，
  待办优先提示缺页
- 门禁并发读取（v0.151.0）：卡片、已采信记忆与页面以 8 路有界并发读取，
  保持顺序与重复 slug 覆盖语义
- 状态路径非法（v0.152.0）：`repowiki-status` 报告清单路径非法或与实际
  文件不符的页面，与门禁同口径且不读正文
- 面板路径非法（v0.153.0）：Wiki 页签提示清单路径非法，并从缺页计数中
  排除，避免重复报告
- 面板卡片陈旧提示（v0.148.0）：Wiki 页签用 Web Crypto 重算卡片
  `inputDigest`，与清单不一致即提示；Web Crypto 不可用时静默降级
- 面板记忆陈旧提示（v0.149.0）：同一套检查覆盖已采信记忆的
  `memoryDigest`，与门禁的陈旧视图一致
- 结构化 Wiki 陈旧原因（v0.186.0）：`repowiki-status` 输出 `wiki.staleReasons`（`cards`/`graph`/`memory`，与 `verify:wiki` 一致）并在 `Wiki:` 行展示，页面指纹未变时也能暴露依赖图或记忆陈旧
- Gleam 支持（v0.185.0）：`type`/`opaque type`/`external type` 容器、`type` 别名、跨行 `fn`/`external fn`、顶层 `const`；注释/字符串（含跨行）屏蔽后配平；`import` 别名与未限定导入（含跨行列表拼接）经每个 `src/`/`test/` 源根解析；`gleam.toml` 提供项目名/版本/依赖计数，嵌套 monorepo 清单（上限 20）合并依赖、根元数据优先
- 不可信索引结构化状态（v0.184.0）：`repowiki-status` 返回 `index.untrusted`（`files`/`edges`）并在 `Index:` 行展示丢弃数量，JSON/CI 消费方无需解析告警文案；原告警保持不变
- Zig 支持（v0.183.0）：容器类型（`struct`/`enum`/`union`/`opaque`，含 `pub`/`extern`/`packed`/`union(enum)`）、顶层 `fn`/`extern fn`/`export fn`、具名测试与常量，成员带容器归属；注释与多行字符串屏蔽，`@import`/`@cImport`/`@This` 模块别名不登记；`@import("x.zig")` 相对引用文件解析，`build.zig.zon` 提供项目名/版本/依赖计数，嵌套 monorepo 清单（上限 20）累加依赖、根元数据优先
- Nim 支持（v0.199.0）：proc/func/method/iterator/template/macro/converter、`type` 容器、顶层 const/let/var、`*` 导出、缩进范围与多行签名；import/from/include 经文件目录与 `src/` 根解析；`*.nimble` 提供项目名/版本/依赖
- Nim `type` 块成员（v0.200.0）：`type` 单独成段时，每个缩进的 `Name* = object|enum|ref object|…` 定义各自登记为类符号，带独立缩进范围与 `*` 导出标记；字段行（`name*: string`）与枚举值行（`red, green`）不会误登记；解析器 v6 会重新解析 Nim 文件
- OCaml 支持（v0.201.0）：顶层 `let`/`let rec`（含 `let%ppx` 与属性）、`type` 容器/别名（参数化名称取末尾标识符）、`module`/`module type`、`class`/`class type`、`exception`、`val`/`external`；`(* … *)` 可嵌套注释与字符串先屏蔽，缩进体内部不登记，`struct`/`sig`/`object` 体按配对 `end` 结束；`open`/`include`/`module M = Foo` 经"文件名→模块名"映射解析（`.ml` 优先于 `.mli`，`Foo.Bar` 归到 `foo.ml`）；`dune-project` 提供项目名/版本，`*.opam` 提供版本与 `depends` 依赖及技术映射
- OCaml `and` 续接与原始字符串（v0.202.0）：`let rec f … and g …` 逐个登记互递归函数，`type a = … and b = …` 逐个登记续接类型（行号与范围口径与主定义一致）；`{|…|}`/`{id|…|id}` 原始字符串跨行屏蔽，内部 `(* … *)` 或 `let` 文本不会遮蔽后续声明；解析器 v7 会重新解析 OCaml 文件
- Haskell 支持（v0.203.0）：`module` 声明（范围至文件尾）、`data`/`newtype`（含 `data family`）、`type`/`type family`、`class`、`pattern` 同义词、顶层值签名（`name ::`）与定义（含中缀操作符定义）按名称合并——签名与实现合成一个符号；`--` 注释、可嵌套 `{- … -}` 块注释、字符串与字符字面量屏蔽，缩进 `where`/`let` 体不登记；`import [qualified] [safe] ["pkg"] Module` 按 GHC 模块路径在每个 `src/`/`app/`/`lib/`/`test/` 源根下解析（`.hs` 后 `.lhs`），外部包不建边；`*.cabal` 提供项目名/版本与跨行 `build-depends` 依赖及技术映射
- Haskell 类方法与多行签名（v0.204.0）：`class … where` 体按方法层缩进登记方法签名（`parent` 归属类），顶层与类方法签名都允许名称与 `::` 分行；解析器 v8 会重新解析 Haskell 文件
- Haskell `hs-source-dirs`（v0.206.0）：cabal 声明的源码目录（每 stanza 的逗号列表与缩进续行）并入模块搜索根，自定义布局（`source/`、`library/`）也能解析 `import` 边；`src`/`app`/`lib`/`test` 常规根与项目根保留为兜底
- 嵌套清单读取上限（v0.207.0）：嵌套 `pubspec.yaml` 最多读取 30 个（Dart monorepo），嵌套 `dune-project` 最多 20 个（OCaml monorepo），与 mix/gleam/zig/composer/opam/cabal/cargo 清单的既有上限保持一致，异常目录树不会触发无界清单读取
- Haskell 导出列表可见性（v0.208.0）：`module M (a, B(..), (<+>)) where` 的导出列表决定 `exported`——未列出的顶层符号标记为非导出（检索排序优先导出符号，未使用导出审计会忽略它们），`module X` 重导出忽略，类方法跟随其类的可见性；无导出列表的模块保持全部公开；解析器 v9 会重新解析 Haskell 文件
- Erlang 支持（v0.209.0）：`-module`、`-record`、`-type`/`-opaque`、`-define` 宏与顶层函数（多子句、`when` 守卫、跨行签名），`-export([f/1])` 决定可见性（默认私有，同名不同 arity 合并）；`%` 注释、字符串、引号原子与 `$x` 字符字面量屏蔽；`-include("…")` 经文件目录与每个 `src/`/`include/` 根解析，`-include_lib("app/…")` 还会尝试剥离应用名前缀的路径；`rebar.config` 的 `{deps, …}` 提供依赖计数与 rebar 技术映射
- 语言接入完整性守卫（v0.210.0）：一致性测试遍历 `SYMBOL_LANGUAGES` 的每种语言，缺少 Prompt 围栏（`fenceLang`）或面板 `LANGUAGE_LABELS` 条目即失败，新增语言不再可能只改 `schema.js` 而静默漏接
- 跨语言测试路径（v0.211.0）：受影响测试路由新增 Erlang `*_SUITE.erl`/`*_tests.erl`、R testthat `test-*.R` 与 Julia `runtests.jl`，与既有测试目录、`*.test.*`/`*.spec.*`、`test_*`/`*_test.*` 及 JVM/Swift 约定并列
- OCaml 同名模块近邻解析（v0.212.0）：多个已索引文件同名模块时，`open`/`include`/`module M = Foo` 选择与引用文件共享目录最深的候选（同库优先），`.ml` 优先于 `.mli` 与字典序作为确定性并列裁决
- Solidity 支持（v0.213.0）：`contract`/`library`/`interface`（含 `abstract contract`）容器，成员 `function`/`constructor`/`receive`/`fallback`/`modifier`/`event`/`error`/`struct`/`enum`/自定义值类型（`parent` 归属），以及文件级函数与类型；`private`/`internal` 成员非导出，注释与字符串屏蔽，容器/成员范围按花括号配平；`import "./X.sol"`（含 `{A} from` 与 `* as X from`）按文件相对路径解析并补 `.sol`，外部路径不建边；`foundry.toml` 标记 Foundry 工具链
- Clojure 支持（v0.214.0）：`ns`（class）、`defn`/`defn-`/`defmacro`/`defmulti`/`defmethod`（function）、`def`/`defonce`（variable）、`defrecord`/`deftype`/`defprotocol`/`definterface`（class）；`^:private` 与 `defn-` 标记非导出；`;` 注释与字符串屏蔽，`(comment …)` 整体跳过，每个形式范围按括号配平；`(:require …)`/`(:use …)` 命名空间经每个 `src/`/`test/` 根解析，同类扩展优先（`.clj`/`.cljc`/`.cljs`）；`deps.edn` `:deps` 与 `project.clj` `:dependencies` 提供坐标、版本与 Clojure 技术映射
- Terraform/HCL 支持（v0.215.0）：`resource`/`data` 块登记为 `type.name`，`module`/`provider`/`terraform` 块与 `variable`/`output`/`locals`；块标签从字符串原文提取、范围用掩码视图配平（字符串内花括号不破坏配平，嵌套块 `lifecycle`/`dynamic`/`required_providers` 不登记）；`source = "./modules/x"` 解析到该目录的 `main.tf`（否则字典序首个 `.tf`），registry/git 源不建边；`.terraform.lock.hcl` 提供 provider 名与 Terraform 技术映射
- 索引规模/性能回归守卫（v0.216.0）：每次测试都会索引一个 300 文件的合成 TypeScript 仓库，断言文件/符号/边数量与宽松的 5 秒上限——提取器回归导致符号静默丢失或意外二次方路径时会直接让 CI 失败，而不是留到后续才暴露
- Groovy 支持（v0.217.0）：顶层 `class`/`interface`/`trait`/`enum` 容器与第一层方法（容忍注解与修饰符，`private`/`protected` 成员非导出），以及 Gradle/Jenkinsfile 风格的顶层 `def` 脚本方法；`//`、`/* … */` 注释与单/三引号字符串屏蔽，内部花括号与调用不登记；`import a.b.C` 经与 Java 共享的点分模块路径解析，`import static a.b.C.member` 会去掉末段成员，边落到定义文件
- PowerShell 支持（v0.218.0）：`function`/`filter`/`workflow`/`configuration` 定义（连字符 `Verb-Noun` 名称、`global:`/`script:`/`local:`/`private:` 作用域前缀，`private:` 非导出）与顶层 `class`/`enum`；类内第一层成员登记为带 `parent` 的方法（含构造器），`hidden` 成员非导出，属性声明不登记；`#`/`<# … #>` 注释、单/双引号与 here-string 内容在配平前屏蔽；`using module ./X.psm1`、`Import-Module ./X` 与 dot-source（`. ./X.ps1`）相对引用脚本解析，补 `.ps1`/`.psm1`/`.psd1` 与 `Foo/Foo.psm1` 模块目录形式，纯模块名不建边
- Fortran 支持（v0.219.0）：`module`/`program`/`subroutine`/`function`（含类型前缀与 `pure`/`recursive`/`elemental`/`module` 修饰）、派生类型（`type [::] name`、`type, extends(…) :: name`）与具名 `interface`；`end`/`end <unit>` 配平范围，模块内过程带 `parent`，`end do`/`end if`/`end select` 不关闭程序单元；`!` 注释与引号字符串（双写转义）屏蔽；`use name`、`use :: name`、`use name, only: …` 与 `use, non_intrinsic :: name` 经大小写不敏感的模块名映射解析（模块名与文件名无需一致），`use, intrinsic :: …` 与外部模块不建边
- Perl 支持（v0.220.0）：`package Foo::Bar;`（语句形式，作用于后续声明直到下一个 package）与 `package Foo { … }`（块形式）登记为 class，`sub name` 登记为 function（包内为 method 并带 `parent`），`_` 前缀按惯例非导出；`#` 注释（`$#array` 除外）、`=pod … =cut`、`<<EOF` heredoc 与引号字符串屏蔽；`use Foo::Bar`、`require Foo::Bar`、`use parent 'Foo'`/`use base qw(Foo)` 与 `require './x.pl'`/`require 'Foo/Bar.pm'` 经 `::`→路径换算在每个 `lib/` 根与项目根/脚本相对路径下解析，pragma 与版本声明跳过
- Object Pascal 支持（v0.221.0）：`unit`/`program`/`library` 与 `type X = class/interface/record/object` 声明（范围按 `class`/`record`/`interface` ↔ `end` 配平，`class function`/`class of` 不计新块）、`procedure`/`function`/`constructor`/`destructor`（接口声明止于本行，实现体按 `begin`/`case`/`try`/`asm` ↔ `end` 配平）、`property` 成员，`TFoo.Bar` 实现以类为 `parent`；`//`、`{ … }`、`(* … *)` 注释与引号字符串屏蔽；`uses` 跨行列表经大小写不敏感单元名映射（Pascal 单元名与文件名一致）解析，`Unit in 'path.pas'` 显式路径优先，外部单元不建边
- Nix 支持（v0.222.0）：属性集与 `let` 内的属性绑定（`name = value;`、`packages.default = …` 点分路径），`{`/`rec {` 值登记 class（花括号配平范围），`x:`/`{ … }:` lambda 登记 function，其余为 variable；嵌套属性集成员带 `parent`；`#`、`/* … */`、双引号字符串与 `''…''` 缩进字符串（`'''`/`''${`/`''\` 转义）屏蔽；`import ./x.nix`、`callPackage ./pkg.nix` 与 `builtins.readFile|readDir|path ./x` 相对引用文件解析，补 `.nix` 与目录 `default.nix`，`<nixpkgs>` 与绝对路径不建边
- VB.NET 支持（v0.223.0）：`Namespace`/`Class`/`Module`/`Structure`/`Interface`/`Enum` 声明（类型范围按 `End <type>` 配平）、`Sub`/`Function`/`Property`/`Event` 成员（接口与 `MustOverride` 声明止于本行；`Property` 块覆盖 `Get`/`Set` 体）、修饰符栈（含 `Partial`/`Shared`/`Async`），`Private`/`Friend`/`Protected` 标记非导出；`'` 注释、`REM` 行与引号字符串（双写转义）屏蔽；`Imports`（含别名）与 `Inherits`/`Implements` 经点分路径与命名空间后缀匹配解析（根命名空间不在目录布局中也能命中）
- Rust workspace crate（v0.205.0）：嵌套 `Cargo.toml`（上限 20）把包名映射到 crate 根目录，包名按 Cargo 规则 `-`→`_` 归一，`path` 依赖补全未声明 name 的成员；`use other_crate::module` 现在能解析到该 crate 的 `src/` 子模块并回退 `lib.rs`/`main.rs` 入口，外部 crate 仍不建边
- Julia 宏修饰声明（v0.198.0）：`@kwdef struct` / `Base.@kwdef mutable struct` 登记为类且范围正确，`@enum` 登记类型与非导出枚举值；解析器 v5 会重新解析 Julia 文件
- R S4 声明（v0.197.0）：`setGeneric` 泛型、`setMethod` 方法（签名类为 `parent`）与 `setRefClass` 类；方法即使泛型导出也保持不导出；解析器 v4 会重新解析 R 文件
- Julia 支持（v0.196.0）：`module`/`baremodule`、`struct`/`mutable struct`、`abstract`/`primitive` 类型、`function`（含 `Type.method`）、短函数、`macro` 与 `const`；函数体跳过、注释/块注释/三引号屏蔽、`export` 决定可见性；`include` 相对引用文件；`Project.toml` 提供包名/版本/依赖
- R6/S4 方法（v0.195.0）：`R6Class`/`setClass` 内的方法登记为 `method` 并以类为 `parent`（含单行体），不再随类内部整体跳过；解析器版本提升到 3，旧索引会重新解析 R 文件
- R `NAMESPACE` 导出（v0.194.0）：`export`/`exportClasses`/`exportMethods`/`S3method` 决定 R 符号的 `exported`（S3 方法按 `generic.class`），`exportPattern` 回退到 `.` 前缀约定
- status 解析器版本（v0.193.0）：返回并展示 `index.parserVersion`，缓存索引由不同提取器版本生成时告警，让即将发生的全量重解析在重建前可见
- R 支持（v0.192.0）：`name <- function(...)`/`name = function(...)`（含 `<<-`），跨行签名、分行 `{` 与单行体；`setClass`/`setRefClass`/`R6Class` 类符号（方法归属类、`.` 前缀私有）、`setGeneric` 泛型与 `setMethod` 方法；`source`/`sys.source` 经文件目录与项目根解析；`DESCRIPTION` 提供包名/版本/去重依赖；`NAMESPACE` 提供导出证据
- Shell 支持（v0.191.0）：`.sh`/`.bash`/`.zsh` 函数符号（`function foo`、`function foo()`、`foo() {`、分行 `{`）、显式公开变量；注释/字符串/heredoc 屏蔽且 `${…}` 不参与配平；`source`/`.` 先脚本目录再项目根解析
- 解析缓存版本升级（v0.190.0）：`INDEX_PARSER_VERSION` 提升到 2，Elixir/Lua/Zig/Gleam 等提取器与后续修复之前建立的索引会先全量重解析一次，不再复用陈旧符号/导入缓存；升级后重建表现为 `changed` = 文件数、`reused` = 0，随后恢复正常增量
- Zig 公开再导出（v0.189.0）：`pub const x = @import("x.zig")` 登记为导出变量符号，模块门面可被检索；私有 `@import`/`@This`/`@cImport` 别名仍不进入符号表
- Zig monorepo 清单（v0.188.0）：嵌套 `build.zig.zon` 的直接依赖键只计入 `dependencyCounts.zig`（zon 键是用户别名，不推断技术名），根清单仍是项目名/版本的唯一来源
- Lua 支持（v0.182.0）：模块表、`function`/`local function`、`M.foo`/`M:foo` 方法与 `M.foo = function` 赋值，块范围识别注释与长字符串；`require` 经每个 `lua/` 目录与项目根解析到 `<mod>.lua`/`<mod>/init.lua`
- 清单并发读取（v0.181.0）：配置清单按既有上限选定后以最多 8 路并发读取并按选择顺序装配，远程工作区重叠往返且派生结果不变
- 深层 Markdown 标题与表格可访问性（v0.180.0）：`####`–`######` 正常渲染（带锚点、钳制到 `h6`），表头带 `scope="col"`
- Elixir `.exs` 索引（v0.179.0）：测试文件、脚本与 config 脚本进入索引，测试文件的 alias 产生依赖边，影响面分析可列出受影响的 Elixir 测试；`mix.exs` 仍按清单处理
- Elixir umbrella 技术栈（v0.178.0）：每个 `apps/*/mix.exs` 的 Hex 依赖与技术都参与聚合（嵌套清单上限 20，技术保留来源清单）；项目名仍只取根清单
- Elixir 支持（v0.177.0）：`defmodule` 模块索引（嵌套记录完整名）、`def`/`defp`/`defmacro`/`defguard`/`defdelegate` 的 do/end 范围、`alias`/`import`/`require`/`use` 依赖边（含分组与重命名），以及 `mix.exs` 应用名/依赖计数/Hex 技术识别
- 依赖图感知的 Wiki 新鲜度（v0.176.0）：清单记录索引文件集合与依赖边的 `graphDigest`；增量生成要求其一致，`verify:wiki` 报告 `wiki/stale-graph`，状态工具告警，面板把结构不匹配并入“Wiki 落后”提示——配置驱动的边变化不再让架构页静默过期
- 更精确的中文查询分词（v0.175.0）：多字中文查询只产出双字组（文档侧仍保留单字），"无匹配"不再命中所有含"无"的文档，单字查询照常可用
- GFM 表格与嵌套列表（v0.174.0）：面板渲染器支持列对齐表格（分割行驱动对齐、单元格行内格式与 `\|` 转义）以及按缩进嵌套的 `ul`/`ol`，生成的卡片与 Wiki 按原样呈现
- 有界目录列举预取（v0.173.0）：DFS 过程中最多提前 8 个兄弟目录发起 `listDir`，远程 `ctx.fs` 不再逐目录串行等待往返；消费顺序、预算计数与产物完全不变
- 更严格的快照清单（v0.172.0）：导入拒绝未知 `schemaVersion`、`count` 与文件数不一致、非对象 JSON 以及超过 8 MiB 的清单；缺省 `count` 的旧清单仍可校验，`allowCorrupt` 仍是显式强制开关
- 可复现索引产物（v0.171.0）：遍历前按名称字节序排序目录条目，最终 `files` 按路径、`edges` 按来源/行号/目标排序——后端 `listDir` 顺序不同也产出相同 `index.json`，超预算仓库截断到同一批文件
- 不可信索引路径（v0.170.0）：`readIndex` 归一所有文件路径，丢弃绝对/越界条目及其指向的边，输出有界的 `untrusted` 计数并由 `repowiki-status` 告警——随 Git 传播的资产不能再让 context/extract/impact 读取项目外文件
- PHP PSR-4 自动加载解析（v0.169.0）：根与嵌套 `composer.json` 的 `autoload` / `autoload-dev` `psr-4` 前缀把 `use` 映射到任意目录（最长前缀优先，支持数组目录与空前缀兜底，类名大小写不敏感），绝对/越界目录与外部包不建边
- 依赖目录排除（v0.169.0）：`vendor/` 与 `.dart_tool/` 进入无条件排除列表，已安装的 Composer/pub 依赖与 Dart 生成缓存不再挤占项目文件预算
- 可选语义索引按方案保持后置（YAGNI）
- 会话记忆条目对后续会话可见，与知识卡片一同构成知识库

## 架构要点

- **单 bundle、单插件条目、零 npm 运行时依赖、零构建工具**：纯 ES Module，手写 `ToolDefinition`（不 import `@deepseek-ai/dsh-tools`），安装目录即可运行。
- **资产即文件**：索引、卡片与 Wiki 全部落入 `<项目根>/.dsh-repowiki/`，随 Git 共享；定位策略为"当前目录向上查找，退回当前目录"。
- **全部文件 IO 走 `ctx.fs`**（方案 §9.1），不经裸 node fs，保持策略一致性；资产写入后回读校验，内容不一致立即报错而非静默成功。
- **LLM 子任务走 spawn 子代理**（ADR-0003）：`ctx.subagents.startActivation({provider:'spawn'})` 继承会话模型；结构化输出经 `outputSchema` 约束；取消走 `exec.signal`；Markdown 格式由插件渲染，模型不决定格式。
- **`inject: ['fs', 'tools', 'subagents']`**：均为能力 seam，缺失时插件在该 profile 不激活而非抛错。
- **符号提取为零依赖轻量解析**（ADR-0001），不引入外部解析框架：JS/TS、Python、Go、Rust、Java、C#、Kotlin、PHP、Ruby、Swift、Scala、Elixir、Lua、Zig、Gleam、Shell、R、Julia、Nim、OCaml、Haskell、Erlang、Solidity、Clojure、HCL、Groovy、PowerShell、Fortran、Perl、Pascal、Nix、Visual Basic .NET、C、C++ 的函数/类/方法/接口/类型/导入；本地依赖边分别按 Python 绝对/相对导入（项目根 + pyproject 自定义根 + `src`/`lib` 布局根）、C/C++ `#include`（引号形式先查文件目录；两种形式都经 `include`/`src`/`inc` 根）、`go.mod`、Rust crate/模块约定（嵌套 `Cargo.toml` 的 workspace crate 名，`-`→`_` 归一与 path 依赖）、Java 包后缀、C#/Kotlin/Scala 点分路径、PHP 大小写不敏感 `use` 解析（根与嵌套清单的 composer `psr-4` 映射优先，命名空间后缀兜底）、Ruby `require_relative` 与 `lib/` 加载路径 `require`、Elixir `defmodule` 模块索引（`alias`/`import`/`use`）、Lua `require`（`lua/` 根与 `init.lua`）、Zig `@import`（相对引用文件，含 `build.zig.zon` 项目名/版本/依赖元数据）、Gleam `import`（`src/`/`test/` 源根与 `gleam.toml` 元数据）、Shell `source`/`.`（脚本目录与项目根）、R `source`（文件目录与项目根，含 `DESCRIPTION` 元数据）、Julia `include`（相对引用文件，含 `Project.toml` 元数据）、Nim `import`/`include`（文件目录与每个 `src/` 根，含 `.nimble` 元数据）、OCaml `open`/`include`（文件名→模块名映射，`.ml` 优先于 `.mli`，`Foo.Bar` → `foo.ml`，含 `dune-project`/`*.opam` 元数据）、Haskell `import`（GHC 模块路径，`src`/`app`/`lib`/`test` 源根、cabal `hs-source-dirs` 与项目根，含 `*.cabal` 元数据）、Erlang `-include`/`-include_lib`（文件目录与 `src`/`include` 根，含 `rebar.config` 元数据）、Solidity `import`（相对文件目录，补 `.sol`，含 `foundry.toml` 元数据）、Clojure `(:require …)` 命名空间（`src`/`test` 根，含 `deps.edn`/`project.clj` 元数据）、Terraform `module` source（相对文件目录，含 `.terraform.lock.hcl` provider 元数据）、Groovy `import`/`import static`（与 Java 共享点分模块路径）、PowerShell `using module`/`Import-Module`/dot-source（相对引用脚本，补 `.ps1`/`.psm1`/`.psd1` 与 `Foo/Foo.psm1` 模块目录形式）、Fortran `use`（大小写不敏感的模块名映射，模块名与文件名无需一致）、Perl `use`/`require`（`::`→路径换算，遍历每个 `lib/` 根与项目根/脚本相对路径）、Object Pascal `uses`（大小写不敏感单元名映射，单元名与文件名一致；`in 'path.pas'` 显式路径优先）、Nix `import`/`callPackage`/`builtins.readFile` 相对路径（补 `.nix` 与 `default.nix`）、VB.NET `Imports`/`Inherits`/`Implements`（点分路径 + 命名空间后缀匹配）、SwiftPM `Package.swift` 目标路径（`Sources/<Target>/` 兜底），以及 JS/TS 的 `tsconfig`/`jsconfig` `paths` + `baseUrl` 别名与工作区包 `exports` 解析（外部模块忽略）。目录条目按名称字节序排序后遍历，兄弟目录最多 8 个并发预取，清单读取与文件读取/解析均采用有界并发（8 路），结果按路径装配——远程后端重叠往返等待，同时保持逐字节可复现的索引。
- **Git 溯源不启子进程**：`index.json` 的 `git.branch`/`git.commit` 来自 `.git/HEAD`、松散引用、`packed-refs` 与 worktree `commondir`；非 Git 仓库省略该字段。
- **并发写安全**（ADR-0005）：六个写工具按解析出的资产根排队（进程内 promise 链锁）；extract/generate 的模型调用在锁外，临界区内做写前二次判定；抽取可按 `concurrency` 并行最多 4 路模型调用，并按 `attempts` 做有界重试，写盘仍逐张串行；不同仓库互不阻塞，只读检索不加锁。
- **零依赖排序检索**：卡片/Wiki/已采信记忆的 BM25（拉丁词 + 中文单字/二元组），无 embedding、无向量库。
- **按需反向引用**：`src/references.js` 在查询期反演 `index.edges`（目标文件 → 符号 → 引用位置）；schema v6 的边携带 import 行号，结果精确到 `path:Lx`，有界且明确为 import 级语义。
- **按需 Wiki 引用**：`src/wiki-references.js` 反演 Wiki 清单（源文件 → 页面/章节）；清单 v2 记录章节级来源，"这个文件被哪些文档引用"无需重读 Wiki 正文。

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

# 覆盖率门禁：行 ≥95、分支 ≥85、函数 ≥85
npm run coverage:check

# 静态检查（仅开发期工具；运行时保持零依赖）
npm run typecheck
npm run lint

# 密钥扫描（git 跟踪文件）
npm run scan:secrets

# 本地索引基准（合成仓库）
npm run bench -- 2000

# 宿主漂移自检：解析本机 app.asar，核对 client.js 引用的每个
# --dsw-alias-* 令牌在 dsh 自带 CSS 中仍有定义且有深色变体；
# 找不到 app.asar（如 CI）时以 exit=3 跳过（v0.22.0）
npm run verify:host

# Wiki 新鲜度门禁：断链/行号越界/内容漂移/卡片或已采信记忆变化后的
# 陈旧 Wiki/清单页缺失/清单路径或条目重复/页面相对链接（页面或项目
# 文件）死链或越界/上次生成失败页/严格模式下的空清单失败；未覆盖/未验证
# 默认警告，--strict 时失败（缺陈旧指纹、探测截断、旧索引与无法验证的
# 行号范围也失败）；--require 在无资产或空清单时失败；支持
# --root/--locale/--json（v0.156.0）
npm run verify:wiki -- --root . --strict --require
```

### CI 用法

`npm run verify:wiki -- --json` 输出机器可读报告；Wiki 有问题、卡片/已采信
记忆变更后未重新生成（陈旧）、清单页在磁盘缺失、清单路径非法或页面内部
链接失效时退出码非 0，可接在 `repowiki-generate` 之后作为流水线质量闸门。退出码：`0` 通过、
`1` 校验失败、`2` 参数/读取错误。`--strict` 还会把未覆盖引用、未验证指纹
或行号范围、探测截断、早于 v6 的索引、缺失陈旧指纹的清单与记录的生成失败
页视为失败；默认仅警告。加 `--require` 可让“没有 Wiki 资产或清单为空”
（root 写错或漏跑生成）直接失败。JSON 报告还包含稳定的
`problems[].code`（如 `citation/missing`、`wiki/stale-cards`），便于 CI
按码聚合或抑制。仓库工作流会用生成的 fixture 实际执行该配方，并断言干净
资产通过、卡片变化后退出码为 1。

### 问题码

`--json` 会把每个发现写入 `problems[]`，带稳定 `code` 与 `severity`
（`error`/`warning`）。CI 可按码聚合或抑制：

| 问题码 | 默认级别 | 含义 |
|---|---|---|
| `index/read-error` | error | `index.json` 无法读取 |
| `index/outdated` | warning（`--strict`：error） | 索引早于 schema v6（没有行数） |
| `assets/missing` | warning（`--require`：error） | 没有 Wiki 清单 |
| `manifest/missing`、`manifest/invalid` | error | 指定清单缺失或非法 |
| `manifest/empty` | warning（`--strict`/`--require`：error） | 清单没有任何页面 |
| `manifest/duplicate-pages` | error | 清单重复登记同一 slug 或路径 |
| `manifest/missing-digests` | warning（`--strict`：error） | 缺卡片/记忆陈旧指纹 |
| `citation/missing` | error | 引用路径不存在 |
| `citation/range` | error | 引用行号越界 |
| `citation/range-unchecked` | warning（`--strict`：error） | 行数未知，行号范围无法验证 |
| `citation/drift` | error | 引用内容在生成后变化 |
| `citation/untracked` | warning（`--strict`：error） | 引用没有内容指纹 |
| `citation/unchecked` | warning（`--strict`：error） | 指纹无法验证 |
| `citation/probe-capped` | warning（`--strict`：error） | 存在性探测触及 200 路径上限 |
| `wiki/stale-cards`、`wiki/stale-memory` | error | 卡片/已采信记忆在生成后变化 |
| `wiki/missing-pages` | error | 清单页文件缺失 |
| `wiki/orphaned-pages` | warning | 页面文件未列入清单 |
| `wiki/duplicate-page-slug` | error | 两个页面文件声明同一 slug |
| `wiki/generation-failed` | warning（`--strict`：error） | 上次生成记录了失败页 |
| `wiki/invalid-page-path`、`wiki/page-path-mismatch` | error | 清单路径非法或与实际文件不符 |
| `wiki/unsafe-link`、`wiki/broken-link` | error | 相对链接越出项目根或目标缺失（页面与项目文件链接） |
| `wiki/link-probe-capped` | warning（`--strict`：error） | 链接探测触及 200 链接上限 |

## 升级运维约定（dsh 处于 rc 阶段，公开 seam 高频变动）

- 本 bundle **不声明** `@deepseek-ai/dsh-*` 依赖（shipped packages 从 dsh 安装目录解析）——代价是**每次 dsh 升级都必须回归**：跑一遍 `npm test`，再跑 `npm run verify:host`（对照升级后 app 自带 CSS 抓主题令牌改名/删除），并在会话里执行 `repowiki-index` 与 `repowiki-cards` 的最小冒烟。
- `engines.dsh` 只作版本下界，不是兼容性证明。
- `index.json` 带 `schemaVersion`；版本不兼容时读取侧降级提示重建而非崩溃。

## 目录结构

```
index.js               插件入口（apply + inject: fs/tools/subagents）
scripts/verify-host-tokens.mjs  本地宿主漂移自检（令牌存活性，v0.22.0）
scripts/verify-wiki.mjs         Wiki 新鲜度门禁（断链/越界/漂移/陈旧/页面完整性/链接与路径/覆盖率，v0.151.0）
scripts/check-coverage.mjs      覆盖率门禁（行/分支/函数）
scripts/scan-secrets.mjs        git 跟踪文件密钥扫描
scripts/bench.mjs               合成仓库索引基准
scripts/release.mjs             本地发布（测试 + 版本 + commit/tag）
docs/detail/           插件管理页详情页（一图式文档，v0.25.0）
docs/adr/              架构决策记录（中文）
docs/checkpoints/      阶段检查点（中文）
docs/runbook.md        诊断与恢复运行手册
docs/compatibility.md  DSH / Node / OS 兼容矩阵
docs/benchmarks.md     基准方法与最近数据
cordis.patch.yml       Loader patch（插入插件行）
src/schema.js          常量与领域约定（单一来源）
src/symbols.js         零依赖符号提取（36 语言 + Vue/Svelte SFC）
src/deps.js            import/require 依赖边提取
src/stack.js           技术栈识别（npm/pip/go/cargo/maven/gradle/composer/bundler/swiftpm/sbt/pub/cmake）
src/assets.js          资产定位与读写（ctx.fs 注入）
src/indexer.js         索引编排（遍历+提取+边解析+组装）
src/ignore.js          `.gitignore` 子集解析与匹配
src/modules.js         模块树（目录归组、父子关系、直属计数）
src/lock.js            资产根并发写锁（进程内 FIFO，O5）
src/search.js          零依赖 BM25 排序（卡片/Wiki/记忆）
src/locale.js          资产语言探测与"有内容优先"回退
src/health.js          文档覆盖率与加权健康分（纯函数）
src/impact.js          文件/符号级影响面（路径与符号解析/反向 BFS/循环/风险，纯函数）
src/graph-rank.js      静态 import 图上的文件级 PageRank（纯函数）
src/usages.js          词法级符号使用点（标识符边界、导入块排除、有界，纯函数）
src/citation-digest.js 引用行切片与内容指纹（纯函数）
src/citation-drift.js  清单引用指纹比对、覆盖率与页级明细（异步、有界并发；status/generate 共用）
src/test-files.js      测试文件启发式与受影响测试收集（纯函数）
src/unused-exports.js  无具名 import 证据的保守导出审计（纯函数）
src/coupling.js        模块 Ca/Ce 耦合与不稳定性（纯函数）
src/context.js         任务词提取、文件排序、源码证据与字符预算打包（纯函数）
src/module-doc.js      确定性模块 Wiki 页（无模型调用）
src/card-schema.js     卡片/Wiki 的 outputSchema（子代理契约）
src/prompts.js         子代理 prompt 构造
src/render.js          卡片/Wiki Markdown 渲染
src/knowledge.js       knowledge/wiki 目录读写、frontmatter 解析
src/config.js          repowiki-plan.json 读取与候选筛选
src/spawn.js           spawn 子代理调用封装
src/transfer.js        导入导出的快照拷贝（ctx.fs 注入）
src/util.js            路径/摘要/frontmatter/写入校验等公共助手
src/tool-index.js      repowiki-index 工具
src/tool-cards.js      repowiki-cards 工具
src/tool-extract.js    repowiki-extract 工具
src/tool-generate.js   repowiki-generate 工具
src/tool-status.js     repowiki-status 工具
src/tool-impact.js     repowiki-impact 工具
src/tool-context.js    repowiki-context 工具
src/tool-export.js     repowiki-export 工具
src/tool-import.js     repowiki-import 工具
src/memory.js          会话记忆条目（写读/状态流转）
src/tool-memory.js     repowiki-memory 工具
src/tool-edit.js       repowiki-edit 工具
src/types.d.ts         ctx.fs / 工具定义的共享类型声明
test/                  单元与集成测试（535 用例）
```

## 许可

MIT（见 [LICENSE](LICENSE)）。
