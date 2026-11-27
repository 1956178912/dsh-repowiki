# 检查点：变更影响面分析工具 v0.115.0（phase-90）

- 日期：2026-11-27
- 目标：编辑前回答"改这个文件会波及谁、有没有环、哪些文档要跟着改、
  风险多高、先验证什么"。只读、确定性、无模型调用；不做代码修改。
- 状态：代码、测试、文档完成；全量验证通过；未提交/推送。

## 交付

- `src/impact.js`（纯函数）：
  - `normalizeImpactPath` / `relativeToRoot`：先判绝对（POSIX `/`、
    Windows `X:/`）再剥 root，避免归一阶段把绝对路径误当相对路径。
  - `matchChangedPaths(index, inputs, root)`：精确 → 大小写不敏感精确 →
    `/<输入>` 后缀 → 唯一 basename；多个候选取 `ambiguous`（不猜），无
    候选取 `unmatched`；支持绝对路径与 Windows 路径。
  - `computeImpact(edges, changed, depth=2, limit=50)`：多源反向 BFS，
    忽略自引用，记录最小跳数；`changed` 自身不列出；明细按 `limit`
    截断后仍继续计数，保证 `total` 精确；直接依赖方符号按
    `(from → changed)` 并集聚合，传递层符号为空。
  - `cyclesForChanged`：用 `findImportCycles` 在全分量上判定"是否含
    变更文件"，再按 10 组/30 文件截断展示，条目附 `contains` 标记。
  - `hubsForChanged`：变更文件直接 fan-in，去重降序。
  - `affectedDocs`：变更文件已有卡片（按 digest 判 stale）+ Wiki 清单
    反查页面/章节（复用 `buildWikiReferenceIndex`/`wikiReferencesFor`）。
  - `assessRisk`：直接依赖 +4/个（≤40）、传递 +1/个（≤20）、环组 +15/组
    （≤30）、最高 fan-in ≥10 +10 / ≥5 +5；0–100 →
    ≥70 critical、≥40 high、≥15 moderate、否则 low；`factors` 明示计分。
  - `recommendationsFor`：断环、跑直接依赖方测试、审查 hub 调用方、
    改后刷新卡片/Wiki，最多 4 条。
- `src/tool-impact.js`（`repowiki-impact`）：
  - 参数 `paths`（数组；字符串按换行/逗号容忍拆分）、`depth` 1–3（默认 2）、
    `limit` 1–100（默认 50）、`root`、`locale`、`includeDocs`（默认 true）。
  - 无索引/无匹配/空 paths 均降级返回 hint，不报错。
  - 输出 changed/unmatched/ambiguous/impacted/impactedTotal/
    impactedDirect/impactedTruncated/cycles/cyclesTruncated/hubs/cards/wiki/
    wikiTruncated/risk/recommendations/locale；文本渲染 `Impact for ...`、
    `Changed:`、`Impacted: N direct / M transitive`、`←`/`⇠` 列表、
    Cycles / Fan-in / Docs / Risk / Next。
- `index.js`：注册工具（工具数 9 → 10）并补文档注释。
- 测试：新增 `test/impact.test.js`（8 例：绝对/Windows/歧义/大小写路径、
  多源 BFS/最小跳数/截断、循环过滤与 sample、fan-in、卡片陈旧/Wiki
  章节、风险分层、真实链路执行、无索引/无匹配降级）；同步
  `test/plugin.test.js` 工具清单、`test/locale.test.js` 工具数。
- 文档：两份 CHANGELOG、README 双语（工具表/路线图/目录树/用例数）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：415/415 通过（`LANG=en`）。
- `LANG=zh_CN.UTF-8 npm test`：415/415 通过。
- `npm run coverage:check`：行 98.57%、分支 89.37%、函数 96.97%。
- `npm run typecheck` / `npm run lint` / `npm run scan:secrets` /
  `npm run verify:host`：通过。

## 关键决策与取舍

- **歧义不猜**：同名文件分布在多个模块时，猜一个会给出错误的影响面；
  返回候选让调用方消歧（可再传绝对路径）。
- **明细有界、总数精确**：大仓库反向依赖可能上千，文本与 JSON 都会膨胀；
  截断放在展示层，`total` 始终来自完整 BFS。
- **风险分可解释**：四个因子直接列出贡献，避免"黑箱评分"；阈值是经验
  值，先保证相对排序可用。
- **不做动态调用图**：只基于静态 import 边，动态 `require`/反射不在
  范围内；这是与索引器其他能力一致的口径。
- **不做自动修改**：工具只回答"会怎样"，不生成 patch，避免越权。

## 遗留 / 下一步

- 反向图目前只来自 `index.imports`；若后续索引器记录 `references`
  级符号引用，可把"符号级影响面"作为 depth 之外的第二种模式。
- Wiki 反查依赖清单中的 `references` 字段；无清单时只返回卡片，已在
  输出中区分。
- 风险权重与阈值尚无真实仓库校准；可在 benchmarks 中记录不同规模仓库
  的分布后再调。
- 提交/推送与版本 tag 由用户确认后执行。
