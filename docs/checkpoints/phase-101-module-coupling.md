# 检查点：模块耦合与不稳定性（phase-101）

- 日期：2026-11-27
- 合入版本：v0.125.0
- 目标：状态报告已有模块依赖热点（边计数），但缺少"谁稳定、谁不稳定"的
  结构视角。本轮补上模块级 Ca/Ce 与 Martin 不稳定性指标。
- 状态：代码、纯函数测试、状态集成与全量门禁完成；已提交并推送。

## 交付

- 新增纯函数模块 `src/coupling.js`：
  - 文件 → 模块映射取自索引 `files[].module`；缺 module 的文件不参与；
  - 仅统计跨模块边：同模块内部引用、自引用、端点未知的边忽略；
  - 模块对去重：Ca = 依赖本模块的不同模块数，Ce = 本模块依赖的不同模块数；
  - `instability = Ce/(Ca+Ce)`（保留 3 位小数），按不稳定性降序、同分按
    耦合总量、再按模块名排序，默认前 10；
  - `minCoupling` 可过滤完全孤立模块；`truncated` 只表示明细截断。
- `src/tool-status.js`：
  - 输出 `moduleCoupling`（modules + truncated）；
  - 文本在 `Module dependencies` 行后新增
    `Module instability: app (1.00, Ca 0/Ce 1); pkg (0.00, Ca 1/Ce 0)`；
  - 无模块耦合时显示 `(none)`；无索引时不输出该字段。
- 双语文档、locale 元数据同步。

## 测试

- `test/coupling.test.js`：3 例——跨模块三节点图的 Ca/Ce/排序、重复边与
  未知模块忽略、上限/门槛/空输入。
- `test/status.test.js`：`app/use.ts → pkg/base.ts` 的跨模块导入断言
  `moduleCoupling` 结构与渲染行。

## 语义边界

- 描述性统计，不是质量评价：高不稳定性可能意味着"容易替换"，低不稳定性
  可能意味着"改动风险高"，两者都不是好坏判断。
- 基于静态 import，不含运行时依赖注入、动态加载与包管理器解析。
- 模块划分依赖索引的 `module` 字段；旧索引由兼容读取补齐，缺失则不参与。

## 验证

- `npm test`：466/466（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.15%、分支 86.43%、函数 95.22%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 模块对而不是文件数：Martin 指标的语义是"模块间依赖数量"，用文件数会
  把同一模块的多文件引用重复计入，导致不稳定性的分母失真。
- 不纳入健康分：健康分已有架构分量（循环/fan-in），耦合指标作为可解释的
  补充信息，避免同一维度重复计权。
- 只展示不稳定性排序，不额外给出"稳定模块榜"：低不稳定性通常是被依赖的
  基础模块，用户已可从 fan-in/PageRank 获得同类信息。

## 遗留 / 下一步

- 若后续索引记录目录层级，可按更细粒度（子模块）计算；
- 面板可把耦合指标与模块依赖热点合并成架构视图。
