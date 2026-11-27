# 检查点：章节 chips 与 Ruby heredoc 精度 v0.56.0（phase-31）

- 日期：2026-11-27
- 目标：补齐 Wiki 引用的章节级操作（不再只能跳到首节），并关闭 v0.55.0
  在兼容矩阵里记录的 Ruby heredoc 已知限制。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`（详情"被 Wiki 引用"）：
  - 每个页面渲染为「标题按钮 + 章节 chips」；chip 点击时用
    `{ ...citation, sections: [section] }` 复用既有跳转通道，打开页面并
    滚动到该章节。
  - chip 上限 4 个，超出显示 `+N`；chip 的 `aria-label` 为
    `页面 · 章节`，同时 `title` 提供悬停全名。
  - 页面标题按钮保持原行为（跳到首个被引章节），旧测试与用户习惯不变。
- `src/symbols.js`：
  - 新增 `rubyInertLines`：标记 heredoc 内容与 `=begin/=end` 块注释行；
    heredoc 起始要求前置 `=`/`(`/`[`/`,` 或行首，避免 `list << ITEM`
    追加被误判。
  - `rubyBlockDelta` / `rubyBlockEnd` 接受 inert 标记；`extractRuby`
    跳过 inert 行，块范围与符号提取都不受内容中的 `end`/`def` 干扰。
- 兼容矩阵更新剩余限制：一行多个 heredoc 只识别首个、`%q{}` 跨行字面量
  不屏蔽。
- 测试 fixture 的 Wiki 清单为同一文件登记五个章节，覆盖 chip 上限与
  溢出提示；`test/client-smoke.test.js` 新增章节 chip 跳转用例；
  `test/symbols.test.js` 新增 heredoc/块注释用例。

## 验证（本地全量）

- `npm test`：307/307 通过。
- `npm run coverage:check`：行 97.77%、分支 86.63%、函数 93.91%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- chip 复用标题按钮的跳转函数而不是新增通道：目标章节已由
  `citation.sections[0]` 决定，构造单元素数组即可，无新状态。
- chip 有界（4）+ 溢出计数：章节数量理论上无上限，全部渲染会挤压详情
  面板；与反向引用的 8 条上限同一策略。
- heredoc 只屏蔽内容、不解析内容语义：目标是块范围准确，内容里的
  `end`/`def` 不应参与配平；多 heredoc 同行保持已知限制，避免引入
  完整词法分析器（YAGNI）。

## 遗留 / 下一步

- 目录级并行索引（大仓库吞吐）。
- Swift `Package.swift` 目标依赖图、Scala 3 缩进语法成员归属。
- 提交/推送与版本 tag 由用户确认后执行。
