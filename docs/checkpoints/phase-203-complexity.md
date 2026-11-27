# 检查点：函数级复杂度估算（phase-203）

- 日期：2026-11-28
- 合入版本：v0.227.0
- 目标：重复检测给出了"哪里重复"，但缺少"哪里难维护"。补上函数级圈
  复杂度后，`repowiki-status` 能直接列出高分支函数，作为重构与测试补
  强的优先级依据。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/complexity.js`：
  - `computeComplexity`：对每个索引 `function`/`method` 符号范围统计
    行首分支关键字（`if`/`for`/`while`/`case`/`catch`/`when`/`elif`/
    `elseif`/`except`/`match`）与 `&&`/`||`，复杂度 = 1 + 分支数；
  - 输出函数数、平均（2 位小数）、最大与 ≤10 个 ≥15 的函数；
  - 单文件函数数（200）与总数（2000）上限保护。
- `src/tool-status.js`：
  - `readDuplicateSources` 重命名为 `readStatusSources`，重复检测与
    复杂度共用一次有界源码读取；
  - 新增 `complexity` 区块（schema 完整定义）；
  - 高复杂度列表非空进入告警，文本报告新增 `Complexity:` 行。
- 测试：
  - `test/complexity.test.js`：分支计数、非函数排除、缺失源码、
    阈值排序、结束行截断、空输入；
  - `test/status.test.js`：高复杂度函数集成（报告/告警/渲染）。

## 语义边界

- 注释与字符串未屏蔽（行首关键字匹配降低误计，但不为零）。
- 只统计索引中的 `function`/`method` 符号；类体、顶层脚本语句不计。
- 只覆盖有界源码读取范围内的文件（≤150 个）。
- 复杂度是路径数近似，不等同于精确 McCabe 或认知复杂度。

## 验证

- `LANG=en npm test`：678/678
- `LANG=zh_CN.UTF-8 npm test`：678/678
- `npm run coverage:check`：行 98.04%、分支约 87.7%、函数 95.89%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
