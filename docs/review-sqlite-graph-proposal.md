# 方案评审：SQLite + FTS5 索引与调用图查询

- 评审日期：2026-11-26
- 评审对象：P0-1（SQLite+FTS5 迁移）、P0-2（repowiki-query）、P1（engines.dsh）、
  P2（可选 SCIP 加载器）、P3（暂缓卡片正文 FTS）
- 评审方法：与 `方案评审与修订版-v1.md` 同一标准——**每条事实断言以本机实测
  或代码现状为准**，不看方案自述。
- 结论图例：✅ 成立 ｜ ⚠️ 部分成立/需补 ｜ ❌ 不成立或与项目现有架构冲突

## 0. 一句话结论

**P3 判断正确、P2 方向认可但工作量被严重低估、P1 前提事实错误、P0-1/P0-2
建立在"未验证的运行时假设 + 尚不存在的数据 + 无基线的性能优化"三重问题之
上，且与项目核心设计（资产即文件、随 Git 共享）直接冲突——当前不建议进入
实现。** 建议先跑宿主能力探针拿数据，再决定是否启动。

## 1. 事实断言核实表

| # | 方案断言 | 核实结果 |
|---|---|---|
| 1 | `node:sqlite` + FTS5 在官方 Node ≥24.13 内置可用，无需 npm 依赖 | ⚠️ **只对命令行 Node 成立**：本机 `node --version` = v24.21.0，实测 `require('node:sqlite')` + `CREATE VIRTUAL TABLE … USING fts5` 可用且无实验警告。但**插件代码跑在 Electron 宿主进程**（`Contents/Frameworks/Electron Framework.framework` Info.plist 实测 **44.7.0**），宿主内嵌的 Node 版本与 SQLite 构建是否含 FTS5 **均未确证**——这正是本项目 v0.13.1（主题令牌名）与 v0.8.1（RemoteResult 契约）两次踩过的"文档说有、实际没有"型假设 |
| 2 | P1："当前项目完全不声明 engines.dsh" | ❌ **事实错误**：`package.json` 已有 `"engines": {"dsh": ">=0.2.2-rc.5"}`（v0.1.0 起即有）。且建议的上界 `<0.3.0` 是目前不存在的版本；项目已论证"engines.dsh 只作下界、不是兼容性证明"（`docs/coverage.md` §10.3-2，依据 upgrading.md 原文），加上界反而可能错误拒绝未来兼容版本 |
| 3 | 迁移后 callers/callees 即可用 | ❌ **方案自相矛盾**：迁移路径写"导入关系写入 edges 表，`kind='imports'`"，而 `queryCallers` 的递归 CTE 过滤 `e.kind='calls'`。现状代码（`src/indexer.js`）**只产出一种边** `EDGE_KIND_IMPORT`（文件级），无 calls/extends/implements——迁移完成后 callers/callees **必然返回空集** |
| 4 | `symbols.qualified_name` 全局唯一（如 pkg.mod.ClassName.method） | ❌ 现有符号模型只有 `{name, kind, line, endLine, exported}`（.dsh-repowiki/index.json 实测），**没有 qualified name 概念**；跨文件同名符号如何构造唯一限定名，方案未定义 |
| 5 | 验收标准"延迟 <5ms（万级符号）" | ⚠️ **无基线**：本项目实测 97 符号、index.json 45KB，内存子串过滤 **0.41ms**（含 require 解析）。万级是假设规模；即便到万级，JSON 读+过滤仍是毫秒量级。**存储格式不是当前瓶颈**，迁移的收益方（递归 CTE）在 calls 边存在之前无所查询 |
| 6 | FTS5 外部内容表 `content='symbols'` | ❓ DDL 缺同步策略：external-content FTS 表需手工或触发器维护 FTS 行（插入/删除/更新 symbols 时同步），方案完全未提 |
| 7 | depth≤5"与 chunkshop 经验判断一致" | ❓ 无从核实的引用，不构成设计依据 |
| 8 | P2 "最小改动 mergeScipEdges" | ❌ **严重低估**：`index.scip` 是 **protobuf 编码**，零 npm 依赖约束下需 vendored protobuf 解析器 + SCIP schema；且 SCIP occurrence 的 opaque symbol id（`scip-symbol` 方案）到本地 `symbols.id` 的**跨格式符号对齐**完全未提——这是 SCIP 集成里最脏的活 |
| 9 | P3 暂缓卡片正文 FTS | ✅ 判断正确，与项目 YAGNI 传统一致（`docs/coverage.md` §3） |

## 2. 与项目既有架构的冲突（严重度排序）

### C1 —— 资产随 Git 共享 vs 二进制数据库

修订版方案 §P4 定调（本项目 ADR 层继承）："资产本体一律直接写项目目录普通
文件——天然 Git 共享、可被任意编辑器/CI 读取"。SQLite 迁移引入：

- **二进制 diff 不可读**：index.json 现在的增量重建在 `git diff` 里一目了然
  （哪些文件 digest 变了），换成 .db 后 review 失效。
- **WAL 侧车**：`journal_mode=WAL` 产生 `.db-wal`/`.db-shm`，Git 追踪 db
  时工作区会无故变脏（`;ls .dsh-repowiki/` 现在只有三个产物）。
- **跨机器一致性**：不同 dsh 版本内嵌的 SQLite 版本可能不同；`.db` 成为
  新的升级风险面（§10.3 刚论证升级韧性靠"资产版本化 + 回归"，二进制 blob
  两头都不沾）。

方案的处理是"index.json 保留为导出产物"——这把**同一信息存两份**，
canonical 是 db、Git 里是快照：新机器 clone 后 index.json 与首次重建的 db
之间的漂移没有任何校验机制。

### C2 —— 同步 API 在 Electron 宿主的阻塞风险

`DatabaseSync` 是同步阻塞 API。索引重建在万级符号仓库上是"批量同步写"，
跑在宿主（渲染/主进程共享的 agent loop）里会阻塞 UI。现有 indexer 是
`async` + 分块的（工具层有 `timeoutMs` 协作预算）；方案没有评估这个
交互模式差异。

### C3 —— 测试与工程量未评估

现有 90/90 测试大量构建在 index.json / 内存对象模型上（`test/indexer.test.js`、
`test/tools.test.js`、`test/assets.test.js`…）。存储层替换意味着这几个模块
的测试整体重写，方案无此预算。

## 3. 逐条评级

| 项 | 评级 | 理由 |
|---|---|---|
| **P0-1** SQLite 迁移 | ❌ 当前形态拒绝 | 断言 1 未验证 + 冲突 C1/C2/C3 + 无基线收益（断言 5）。**认可的部分**：启动能力探测的思路本身正确——但正确的用法是"先探测、再决定要不要迁移"，而不是"假定可用、失败则抛错让用户换 Node"（插件跑在宿主里，用户换不了宿主的 Node） |
| **P0-2** repowiki-query | ❌ 不成立 | 数据不存在（断言 3/4）；且**无任何用户信号**表明需要 callers/callees：本项目迄今的 GUI 反馈历史集中在面板渲染、深色模式、卡片点击，从未出现调用图查询诉求。这是能力驱动（"索引能建图所以建个图查询"）而非需求驱动。方向本身（影响面分析）对 Agent 有价值，但正确顺序是先在**现有 JSON 模型**上加函数级 calls 边提取（与存储完全无关的独立增量），验证查询价值后再谈存储 |
| **P1** engines.dsh | ❌ 驳回 | 断言 2 事实错误；维持现状下界 |
| **P2** SCIP 加载器 | ⚠️ 方向认可、定位错误 | "可选通道、只升级不替换、默认路径零变化"的渐进增强设计是对的（与方案 §11.3"库可 vendored、按需加载"一致）。但真实工作量 = protobuf 解析 + 跨格式符号对齐（断言 8），且逻辑上依赖 P0-1 的图存储——P0-1 不成立时是空中楼阁。应改定位为**实验性 spike**，不进路线图 |
| **P3** 暂缓卡片正文 FTS | ✅ 采纳 | 与项目 YAGNI 判断一致，无需行动 |

## 4. 建议的替代路径

1. **先跑宿主能力探针（半天）**：在 `apply()` 里用 try/catch 包一次
   `node:sqlite` + FTS5 探测，结果写 `.dsh-repowiki/capability.json`
   （失败不影响插件任何功能）。这是唯一能确证宿主能力的办法——用事实
   替代断言 1 的假设。探针通过且**未来确有图查询需求**时，P0-1 才具备
   讨论基础。
2. **维持 index.json 为唯一 canonical**：性能问题若真出现（真实大仓库 +
   用户可感知延迟），先做内存层优化（符号名索引 map），这是纯函数改动、
   可测、零架构冲击。
3. **调用图价值验证与存储解耦**：若要 callers/callees，先给
   `src/symbols.js`/`indexer.js` 加函数级调用提取，边写进 index.json 的
   edges（复用现有 EDGE_KIND 机制）。这一步独立可验收，且立刻能回答
   "模型到底用不用这个查询"。
4. **engines.dsh 维持现状**：`>=0.2.2-rc.5` 下界，不加上界。

## 5. 三点总结

- 事实层面：断言 2（engines.dsh）错误、断言 3/4（calls 边与
  qualified_name）在现有代码中**不存在对应数据**，P0-2 的查询建立在
  空库上。
- 架构层面：SQLite 迁移与"资产随 Git 共享"的核心设计直接冲突（C1），
  且在本项目实测规模下无性能收益（0.41ms/97 符号）。
- 方法层面：建议沿用 `方案评审与修订版-v1.md` §11.1 的探针门禁传统——
  **宿主能力先探测、需求先验证**，再决定要不要引入新的存储层。
