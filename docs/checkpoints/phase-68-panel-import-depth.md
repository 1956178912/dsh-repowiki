# 检查点：面板依赖深度切换 v0.93.0（phase-68）

- 日期：2026-11-27
- 目标：v0.92.0 让工具侧支持传递依赖（`depth`），但面板详情仍只展示
  直接边。补面板 1/2/3 跳切换，使"浏览仓库"与"查询工具"获得同一语义，
  用户在 UI 里即可评估间接影响面。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - `importsForPath(index, path, depth = 1)` 改为 BFS：`seen` 预置起点
    文件（自身不作为依赖），同一目标只记录首次到达（最小跳数），环自然
    收敛，`maxDepth` 钳制在 1–3；条目新增 `depth` 字段（`mutual` 保留）；
  - 新 state `importDepth`；`openDetail` 变为包装函数，打开卡片时
    `setImportDepth(1)` 重置；
  - `detailImports` 的 useMemo 依赖加入 `importDepth`；
  - `DetailPane` 接收 `importDepth` / `onImportDepth`，imports 区块标题行
    渲染 1/2/3 按钮组（`role="group"`、`aria-pressed`、本地化
    `aria-label`、选中态用 `state-business-primary` 令牌）；
  - 条目箭头：更深跳数 `⇢`（后缀 ` (symbols, N hops)`），直接依赖保持
    `→`，双向边保持 `↔`；
  - 文案：`importDepthLabel`（依赖展开深度 / Import depth）、
    `importDepthOption`（`{n} 跳` / `{n} hop(s)`）。
- 测试（`test/client-smoke.test.js`）：
  - fixture 增 `d.js` 与 c.js → d.js 边（d 无出边，避免把 b 拉进三元环
    而干扰既有循环徽章用例）；
  - 新用例"卡片详情可切换依赖深度"：默认无 `d.js:L12` → 点击 2 跳按钮
    → 出现 `⇢`、`d.js:L12` 与 `hops)` → 关闭重开 → 重置为直接依赖。
- 文档：两份 CHANGELOG、README 双语（stage/能力行/面板行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/client-smoke.test.js`：22/22 通过。
- `npm test`：374/374 通过。
- `npm run coverage:check`：行 97.91%、分支 87.24%、函数 94.88%（门禁通过；
  多次运行波动约 0.2pp）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **客户端重复实现而非共享模块**：`client.js` 是独立浏览器 bundle，
  不能 import `src/`；沿用既有做法（循环检测、打分、Markdown 渲染）在
  客户端本地实现，语义对齐由测试锁定。
- **BFS 最小跳数**：与 `src/references.js` 一致，直接边优先；避免用户
  切到 2 跳后看到同一文件出现在两个深度。
- **重开卡片重置为 1 跳**：深度是"当前查看意图"而非持久偏好；重置避免
  用户在无感知状态下看到传递依赖被误认为直接依赖。
- **按钮而非下拉**：只有 3 个取值，按钮组可见性更好、键盘可操作，且
  `aria-pressed` 天然表达选中态。
- **更深边用 `⇢` + 跳数后缀**：视觉上与直接边区分，同时明确标注跳数，
  不依赖颜色（可访问性）。

## 遗留 / 下一步

- 反向传递引用（谁间接依赖我）评估。
- 面板反向影响面（以选中文件为中心的上游 BFS）。
- C/C++ 重复 include 边折叠策略。
- Go `internal` 包可见性诊断。
- 提交/推送与版本 tag 由用户确认后执行。
