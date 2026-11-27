# 检查点：行业领先优化路线图 v0.44–v0.46（phase-18）

- 日期：2026-11-27
- 目标：按 `.trae/documents/行业领先优化路线图.md`（已批准）完成
  "安全与正确性 → 产品与体验 → 工程与发布" 三阶段，把项目推到可对外
  宣称的行业领先基线。
- 状态：代码、测试、文档完成；全量验证通过；未提交/推送（按约定需用户确认）。

## 交付

### 1. v0.44.0 安全与正确性基线

- 面板链接协议白名单 `safeHref`：仅 `#` / `http(s)` / `mailto`；危险协议
  降级为纯文本；页内锚点不新开标签（`test/client-security.test.js`）。
- 端到端取消：`buildIndex` / `copyTree` 接受 `AbortSignal`；index/export/
  import 输出 `aborted` 与 hint；取消的索引不覆盖旧 `index.json`。
- 写入回读校验：`writeTextVerified` 覆盖索引、清单、卡片、Wiki、记忆；
  `test/write-verify.test.js` 用截断写入断言显式失败。
- 索引 schema v3：`module` / `modules[]` 正式入契约；v2 内存补齐后读取；
  `test/assets.test.js` 覆盖 v2 夹具与未知版本降级。
- 生成/记忆完整性：slug 去重 `-2/-3`（`renamed`）、逐页失败隔离
  （`failed`）、孤儿只报告（`orphaned`）、卡片/记忆截断诚实上报；
  记忆同名不同标题哈希后缀、同标题覆盖、审核写 `reviewedAt`。
- 锁范围收窄（ADR-0005 修订）：extract/generate 的模型调用在锁外，
  写前二次判定后在临界区落盘；`test/tool-llm.test.js` 与
  `test/lock.test.js` 同步改写。

### 2. v0.45.0 产品力与体验

- `.gitignore` 子集（`src/ignore.js`）：注释/否定/锚定/目录尾/通配；
  `ignored` 计数不消耗文件预算；解析失败只告警。
- 零依赖 BM25（`src/search.js`）：拉丁词 + 中文单字/二元组；卡片/Wiki/
  已采信记忆统一排序；`repowiki-cards` 新增 `target=symbols|docs|all`。
- 模块级 Wiki（`src/module-doc.js`）：`granularity=theme|module|all`，
  模块页确定性生成、嵌套路径、主题页引用白名单。
- Wiki 清单与陈旧检测：`wiki/<locale>/_index.json`（含 `inputDigest`），
  面板按清单分组、孤儿标记、待更新徽章。
- `repowiki-status`（第 9 个工具）：索引/卡片/Wiki/记忆/plan/锁的诊断快照。
- 面板：延迟搜索、分页（120 + 加载更多）、排序、标签 chips、Wiki 搜索、
  复制路径、页签语义与 `aria-live`、`/` 聚焦搜索。

### 3. v0.46.0 工程与发布

- 类型与 Lint：`tsconfig.json` / `tsconfig.client.json`（渐进 `checkJs` +
  新模块 `// @ts-check` + `src/types.d.ts`）、ESLint flat config；
  `npm run typecheck` / `npm run lint` 0 错误。
- CI：Linux/macOS 阻塞、Windows canary × Node 22/24；lint/typecheck/
  密钥扫描/测试/覆盖率门禁；CodeQL、Dependabot、`npm audit`、SBOM。
- 覆盖率门禁：行 ≥95 / 分支 ≥85 / 函数 ≥85（`scripts/check-coverage.mjs`）。
- 发布：`scripts/release.mjs`（干净工作区、CHANGELOG 版本、测试、本地
  commit/tag，不 push）与 tag 发布工作流。
- 文档：CONTRIBUTING、SECURITY、runbook、兼容矩阵、基准；ADR-0007
  （数据版本与写入校验）；README 双语更新到 0.46.0。
- 基准（`scripts/bench.mjs`）：1000 文件 32ms/66MiB；5000 文件
  123ms/86MiB（本地核，非 CI 硬门禁）。

## 验证（本地全量）

- `npm test`：235/235 通过。
- `npm run coverage:check`：行 97.17%、分支 85.35%、函数 92.56%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过（本机无 asar 时按约定跳过）。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 回读校验只承诺"成功返回即完整"，不声称原子写（`ctx.fs` 无 rename）。
- `.gitignore` 仅实现文档化子集，不处理嵌套/全局 excludes（YAGNI）。
- 锁只保护"判-写"临界区；并发写者可能重复一次 LLM 成本，换取不再阻塞
  同根其它写工具与子代理回调。
- 分支覆盖率通过补充真实边界用例（prompt 默认值、BM25 片段/排序、
  未解析 import、CLI 脚本端到端）达标，未放宽阈值。

## 遗留 / 下一步

- 浏览器侧视觉冒烟（深色模式、分页滚动、Wiki 清单分组）按 phase-15
  清单人工确认。
- v0.47（可选，P2）：Go/Rust/Java 符号提取、多 locale 生成、Git 元数据；
  需用户确认后启动。
- 提交/推送与版本 tag 由用户确认后执行（发布脚本只做本地 commit/tag）。
