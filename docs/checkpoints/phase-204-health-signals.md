# 检查点：健康分计入新信号（phase-204）

- 日期：2026-11-28
- 合入版本：v0.228.0
- 目标：分层违规、重复块与高复杂度函数此前只作为独立区块输出，健康分
  看不到它们。把三类信号计入架构分量后，健康分与 `issues` 待办能反映
  真实的架构/技术债状况。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/health.js`：
  - 新增可选输入 `layers.total`、`duplicates.total`、`complexity.high`；
  - 架构分量扣分：分层违规 5 分/条（上限 30）、重复块 3 分/块（上限
    20）、高复杂度函数 2 分/个（上限 20），与环（上限 60）、hub
    （15/8）共用 100 分预算，结果钳制到 ≥0；
  - 分量 `detail` 追加计数；`issues` 追加三条待办；
  - 输入缺省时分数与旧版完全一致（向后兼容）。
- `src/tool-status.js`：`assessHealth` 调用传入三类计数的聚合。
- 测试：`test/health.test.js` 新增扣分算术、上限（架构分下限 30）、
  detail 与 issues 断言。

## 语义边界

- 只吃聚合计数，不重新读取源码/索引；status 仍是唯一数据来源。
- 扣分权重是固定的可解释常量，不随仓库规模变化。
- `complexity.high` 是"达到阈值的高复杂度函数数"，不是全部函数数。

## 验证

- `LANG=en npm test`：679/679
- `LANG=zh_CN.UTF-8 npm test`：679/679
- `npm run coverage:check`：行 98.05%、分支约 87.9%、函数 95.89%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
