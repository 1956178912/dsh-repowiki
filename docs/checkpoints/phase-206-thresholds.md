# 检查点：可配置分析阈值（phase-206）

- 日期：2026-11-28
- 合入版本：v0.230.0
- 目标：重复窗口、复杂度阈值与源码读取上限此前写死。不同仓库的技术债
  标准不同（严格团队要更低的复杂度阈值、更短的重复窗口），补上 plan
  配置后无需改代码即可调整。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/config.js`：
  - `RepoPlan` 新增 `complexityThreshold`（1–100，默认 15）、
    `duplicateMinLines`（4–50，默认 8）、`maxStatusSourceFiles`
    （20–500，默认 150）；
  - `clampInt`：越界钳制、非整数回退；
  - 默认值从 `complexity.js`/`duplicates.js` 引用（单一来源）。
- `src/tool-status.js`：
  - `readStatusSources` 接收上限参数；
  - `findDuplicates`/`computeComplexity` 使用 plan 阈值；
  - 区块中的 `windowLines`/`threshold` 回显实际值。
- 测试：
  - `test/config.test.js`：自定义值、钳制、非法回退；
  - `test/status.test.js`：plan 阈值实际作用于重复窗口与复杂度。

## 语义边界

- 阈值只影响 status 的展示口径，不改变索引。
- 重复窗口钳制在 4–50 行、复杂度 1–100、源码文件 20–500，避免极端配置
  造成性能或噪声问题。
- `complexityThreshold` 与卡片候选阈值 `cardComplexityThreshold` 是不同
  概念（后者是"最少符号数"），互不影响。

## 验证

- `LANG=en npm test`：685/685
- `LANG=zh_CN.UTF-8 npm test`：685/685
- `npm run coverage:check`：行 98.06%、分支约 87.9%、函数 95.9%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
