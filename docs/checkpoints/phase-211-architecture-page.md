# 检查点：确定性架构 Wiki 页（phase-211）

- 日期：2026-11-28
- 合入版本：v0.235.0
- 目标：`repowiki-generate` 已有模块页与 LLM 主题页，但"仓库架构长什么样"
  仍要用户自己去读 status 输出；Qoder/DeepWiki 类产品的架构文档页是本项目
  最明显的能力缺口。本轮补上**确定性**架构页：不调用模型，只把
  status/`verify:arch` 已在用的架构事实写成带引用的 Markdown，随增量生成
  刷新，并接受 `verify:wiki` 的完整校验。
- 状态：代码、测试、双语文档、兼容矩阵、覆盖率报告与检查点更新；全量
  门禁通过。

## 交付

- `src/architecture-page.js`（新模块，纯函数）：
  - 总览：文件/符号/依赖边/模块数、语言分布、架构分量分；
  - 架构分层：声明层表（路径/文件数/允许依赖）+ 精确层对计数 + 示例违规边；
  - 循环依赖：前 10 组（组内最多 3 个文件 + 折叠数 + 代表性最短环）；
  - 关键入口：fan-in 前 5 与 PageRank 前 5；
  - 重复代码候选：前 10 组（`path:start-end` 对）；
  - 复杂度热点：前 10 个函数（`name` + `path#Lx-Ly` + 复杂度）；
  - 未解析相对导入：前 10 条（`path#Lx` → specifier）；
  - 架构基线：缺失/不可用/无退化（含可收紧项数）/新增退化列表；
  - `deterministic: true` 标记与固定 slug `architecture`；条目/引用均有界。
- `src/tool-generate.js`：
  - 每次生成先写入架构页（`readPlan` 阈值/分层 + 有界源码 + 基线 JSON）；
  - 引用白名单：`deterministic` 页面可用全部索引文件，主题页仍只允许
    prompt 内卡片；
  - 固定 slug 优先占用：同名主题页在写入时去重改名并计入 `renamed`；
  - 增量短路新增"清单必须含 `architecture`"条件，升级后自动补写。
- `scripts/verify-wiki.mjs`：`loadIndex` 透传 `edges`（原先只返回 `files`，
  使 `graphDigest` 的边部分恒为空，任何有 import 边的仓库都会被误判为
  `wiki/stale-graph`）。
- 测试：
  - `test/architecture-page.test.js`（6 例）：分节内容与引用白名单、
    可复现性、中英文、基线四态与收紧提示、空事实降级；
  - `test/coverage-gaps.test.js`：生成 → `verify:wiki --strict --require`
    端到端全绿（含指纹覆盖为 0 未覆盖）；
  - `test/verify-wiki.test.js`：含依赖边的索引不应误报结构陈旧；
  - 既有 generate 用例更新为"架构页 + 模块/主题页"的页面顺序与计数。
- 文档：README 双语（generate 工具行、版本列表、阶段行）、CHANGELOG 双语、
  `docs/compatibility.md`（Wiki 清单固定架构页）、`docs/coverage.md`。

## 语义边界

- 架构页数字与 `repowiki-status`/`verify:arch` 共用模块与阈值；源码读取
  上限同样是 `plan.maxStatusSourceFiles`，超出部分不计入重复/复杂度。
- 页面是摘要：各节条目有上限（10/5/8 条引用），全量数据仍在 status 输出。
- 页面内容由索引决定；索引未变时重复生成得到逐字节相同页面（无时间戳）。
- 行号引用来自索引符号范围；索引过期时页面行号同样过期，`verify:wiki`
  的越界检查会在重索引前拦住它。
- 架构页不替代人工架构决策：分层规则仍由 `repowiki-plan.json` 声明。

## 验证

- `LANG=en npm test`：742/742
- `LANG=zh_CN.UTF-8 npm test`：742/742
- `npm run coverage:check`：行 98.01%、分支约 87.9%、函数 95.91%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
