# 检查点：fan-in hub 排名 v0.95.0（phase-70）

- 日期：2026-11-27
- 目标：状态工具已有模块级依赖热点与文件级循环组，但缺少"哪些文件被最多
  文件依赖"这一改动风险信号。补文件级 fan-in 排名，让重构前不必手工翻
  索引即可识别高风险入口。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/references.js`：
  - 新常量 `MAX_HUB_ENTRIES = 10`；
  - 新纯函数 `topDependents(edges, limit)`：按 `to` 聚合不同的 `from`
    （Set 去重，同一文件多处 import 只计一次），跳过自引用与坏边；
    按依赖方数量降序、并列按路径升序，`limit` 截断。
- `src/tool-status.js`：
  - 输出 schema 增 `topDependents`（items required `path`/`dependents`）；
  - execute 用索引边计算 `hubs` 并作为 `topDependents` 返回；
  - 渲染新增 `Fan-in hubs: lib.ts (3); …`（空时为 `(none)`）；
  - 工具描述补充 fan-in 信号。
- 测试：
  - `test/references.test.js`：新增排名用例（重复边去重、自引用忽略、
    并列按路径、上限生效、空输入、常量）；
  - `test/status.test.js`：空目录断言空数组与 `(none)`；新用例用
    lib/a/b/c/d 五个文件验证 `lib.ts (3)` 排第一、`a.ts (1)` 次之。
- 文档：两份 CHANGELOG、README 双语（stage/状态工具行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/references.test.js test/status.test.js`：24/24 通过。
- `npm test`：379/379 通过。
- `npm run coverage:check`：行 97.93%、分支 87.35%、函数 94.98%（门禁通过；
  多次运行波动约 0.2pp）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **不同依赖方计数而非边数**：同一文件多处 import 同一目标不增加"影响
  面"；用不同文件数才符合"改这里会波及多少个文件"的直觉。
- **并列按路径**：保证输出稳定（索引边顺序可能随遍历变化），与其它排序
  约定一致。
- **只放在状态工具**：hub 排名是诊断信号，不进入卡片/prompt，避免把
  长列表注入模型上下文；后续如需可按需扩展参数。
- **不合并进循环摘要**：循环与 fan-in 是两种独立风险（耦合环 vs 高扇入），
  分开呈现更可读。

## 遗留 / 下一步

- C/C++ 重复 include 边折叠策略评估。
- Go `internal` 包可见性诊断。
- 面板侧展示 fan-in hub（考虑与循环徽章并列的头部提示条）。
- 提交/推送与版本 tag 由用户确认后执行。
