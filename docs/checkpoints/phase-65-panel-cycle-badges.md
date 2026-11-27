# 检查点：面板循环徽章 v0.90.0（phase-65）

- 日期：2026-11-27
- 目标：循环依赖已在状态工具（SCC 报告）、Wiki 模块页（循环节）与面板
  详情（`↔` 双向边）可见，但浏览列表时看不出来；在卡片行加 `⟲` 徽章，
  让架构造味在浏览态即可发现。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - 新增 `cycleSizesFor(index)`：客户端迭代 Tarjan（与 `src/cycles.js`
    同口径），返回文件 → 所在 SCC 大小；跳过自引用与坏边；
  - `rows` 预算 `cycleSize`；
  - `CardTile` 与 `CardRow` 在 `cycleSize > 0` 时渲染 `⟲`，带
    `role="img"`、本地化 aria-label 与 title；
  - 双语 `cycleBadgeHint`。
- 测试 `test/client-smoke.test.js`：fixture 的 a.js ↔ c.js 双向边下，
  徽章恰好 2 个（b.js 非成员不标记），并断言可访问名走文案字典。
- 文档：两份 CHANGELOG、README 双语（stage/面板能力行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：370/370 通过。
- `npm run coverage:check`：行 97.92%、分支 87.28%、函数 94.69%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过（复用已验证的
  `state-error-primary` 令牌，无新增主题依赖）。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **客户端本地 SCC 而非 import src**：面板是独立浏览器 bundle，跨端
  import 会把 node 侧模块带进产物；与 `referencesForPath`/`importsForPath`
  同样在注释中标注"与 src 同语义"，并用同一 SCC 口径避免数字打架。
- **只用字符徽章 + aria-label**：`⟲` 视觉轻量；`role="img"` + 本地化
  aria-label 保证读屏可理解，title 提供鼠标悬停说明。
- **颜色用 state-error-primary**：环是架构风险，错误色最直观；该令牌已在
  verify:host 白名单内，不引入未验证令牌。
- **不提供按环筛选**：当前只有徽章；真正的环清单在 `repowiki-status`，
  面板筛选会增加状态与交互复杂度，暂不做。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- 基准数据刷新（`npm run bench` → `docs/benchmarks.md`）。
- 提交/推送与版本 tag 由用户确认后执行。
