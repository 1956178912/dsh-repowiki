# 检查点：状态报告告警有界 v0.107.0（phase-82）

- 日期：2026-11-27
- 目标：v0.106.0 把索引侧违规限制在 50 条，但 `repowiki-status` 的文本
  报告仍逐条打印全部 warnings，50 条违规会把报告其余部分挤出视野。给
  文本报告加渲染上限，结构化输出保持全量。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/tool-status.js`：
  - 新常量 `RENDERED_WARNINGS = 3`；
  - 渲染改为前 3 条 `Warning: …`，超出时追加
    `Warning: … +N more (see the structured warnings array)`；
  - 结构化 `warnings` 数组不变（消费者可读全量）。
- 测试（`test/status.test.js`）：新用例写入 5 条 warnings，断言结构化
  长度 5、文本含前 3 条、第 4 条不出现、折叠行格式正确。
- 文档：两份 CHANGELOG、README 双语（stage / 状态工具行 / 路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/status.test.js`：11/11 通过。
- `npm test`：389/389 通过。
- `npm run coverage:check`：行 98.00%、分支 87.52%、函数 95.26%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **只限渲染不影响契约**：工具输出 schema 的 `warnings` 仍为完整数组；
  截断只发生在面向人的文本报告，避免消费者丢失信息。
- **折叠行说明去处**：明确指向结构化数组，读者知道如何取全量。
- **3 条上限**：与循环组渲染（3 个文件）风格一致，报告保持可扫读。

## 遗留 / 下一步

- 循环检测增加"代表性环路径"（SCC 成员之外给出具体 a→b→a 断链参考）。
- mermaid 组内节点较多时的紧凑排布。
- 面板 Wiki 页顶部风险摘要（需求再评估）。
- 提交/推送与版本 tag 由用户确认后执行。
