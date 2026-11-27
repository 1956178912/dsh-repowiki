# 检查点：internal 告警有界化 v0.106.0（phase-81）

- 日期：2026-11-27
- 目标：v0.98.0 的 internal 违规告警逐条写入 `index.json`。极端仓库
  （数百个跨边界导入）会把 warnings 撑大，也会让状态工具一行过长。
  给违规列表加上限并折叠为汇总。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/indexer.js`：
  - 新常量 `MAX_INTERNAL_WARNINGS = 50`；
  - 边循环后把 `internalViolations` Set 转为数组：超过 50 条时保留前
    50 条 + 一条汇总 `… N more Go internal visibility violation(s) omitted
    (capped at 50).`；
  - warnings 触发条件改用折叠后的 `internalWarnings`。
- 测试（`test/indexer.test.js`）：
  - 新用例构造 61 个文件（1 个 internal 包 + 60 个越界导入文件），断言
    违规 50 条 + 汇总 1 条且余数为 10。
- 文档：两份 CHANGELOG、README 双语（stage / 索引工具行 / 路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/indexer.test.js`：38/38 通过。
- `npm test`：388/388 通过。
- `npm run coverage:check`：行 98.00%、分支 87.47%、函数 95.26%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **50 条上限**：足够覆盖常见违规规模，又能把 index.json 增长控制在
  可忽略量级；汇总行保留总量信息，不静默丢失。
- **违规仍建边**：上限只作用于告警文本，不影响依赖图（影响面分析不受
  影响）。
- **汇总行也含 "internal"**：测试按该关键词统计时包含汇总行，文档与断言
  口径一致（50 + 1）。

## 遗留 / 下一步

- 面板 Wiki 页顶部风险摘要（模块页正文已有 fan-in 节，需求再评估）。
- mermaid 组内节点较多时的紧凑排布。
- 提交/推送与版本 tag 由用户确认后执行。
