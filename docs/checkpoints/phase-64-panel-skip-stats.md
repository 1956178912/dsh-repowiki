# 检查点：面板跳过统计 v0.89.0（phase-64）

- 日期：2026-11-27
- 目标：v0.86.0 已把 skipped 写进索引、工具与状态行，但用户最常看的
  面板统计行仍看不到；补一行展示让"文件数比预期少"在 UI 上直接可解释。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - 单库统计行在 `index.stats.skipped > 0` 时渲染 `跳过文件 N` /
    `Skipped N`，悬停 title 使用文案字典 `statSkippedHint`（不硬编码
    英文）；为 0 时不渲染；
  - 新增双语文案 `statSkipped` / `statSkippedHint`。
- 测试 `test/client-smoke.test.js`：带 `stats.skipped = 2` 的索引断言
  统计文本与 title 走字典；默认索引断言不出现该统计。
- 文档：两份 CHANGELOG、README 双语（stage/面板能力行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：369/369 通过。
- `npm run coverage:check`：行 97.94%、分支 87.37%、函数 94.68%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **不引入新颜色令牌**：`verify:host` 会校验全部 `--dsw-*` 令牌；跳过是
  可解释的非致命情况，沿用统计行中性色 + tooltip 足够，避免为新状态
  引入未验证的主题令牌。
- **只在 > 0 时展示**：绝大多数仓库没有跳过文件，常驻 0 只会增加噪声。
- **文案进字典**：面板双语由 `t()` 驱动，硬编码英文会在中文环境露出。
- **不在总览行展示**：总览行是跨工作区摘要，保持轻量；下钻后可见。

## 遗留 / 下一步

- 面板文件行显示环成员徽章（详情内已有 `↔`）。
- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- 提交/推送与版本 tag 由用户确认后执行。
