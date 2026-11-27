# 检查点：架构分层规则（phase-201）

- 日期：2026-11-28
- 合入版本：v0.225.0
- 目标：索引已能回答"谁依赖谁"，但无法表达"哪些依赖不允许"。补上
  plan 声明式架构分层后，`repowiki-status` 能直接报告违反分层约束的
  跨层 import，把架构守护纳入知识库诊断。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/layers.js`：
  - `normalizeLayers`：丢弃无名/重名/无路径条目，路径归一
    （`./`、尾斜杠、反斜杠），`mayDependOn` 只保留非空字符串；
  - `evaluateLayers`：最长前缀归属、同层允许、`mayDependOn` 白名单、
    违规总数精确 + 明细上限 50、`unknownRefs`、各层文件数。
- `src/config.js`：`RepoPlan.layers`、`DEFAULT_PLAN.layers = []`、
  `readPlan` 归一化。
- `src/tool-status.js`：
  - 读取 plan 后计算 `layerReport`（需兼容索引）；
  - 违规总数与未知层引用进入 `warnings`；
  - 输出新增 `layers` 区块（schema 完整定义）；
  - 文本报告新增 `Layers:` 行。
- 测试：
  - `test/layers.test.js`：归一、归属、允许/违规、上限、非法边；
  - `test/config.test.js`：plan layers 解析与非法类型；
  - `test/status.test.js`：分层违规集成（报告/告警/渲染）与未声明
    层不输出区块。

## 语义边界

- 只检查已索引的 import 边；动态导入/运行时装配不在覆盖范围。
- 同层始终允许；未声明 `mayDependOn` 的层只能依赖同层。
- 不属于任何层的文件忽略（不猜测归属）。
- 未知层引用只告警，不视为违规；层文件数按全部索引文件统计。

## 验证

- `LANG=en npm test`：664/664
- `LANG=zh_CN.UTF-8 npm test`：664/664
- `npm run coverage:check`：行 98.03%、分支约 87.9%、函数 95.84%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
