# 检查点：面板可读语言名 v0.73.0（phase-48）

- 日期：2026-11-27
- 目标：C/C++ 接入后语言筛选出现 `c`/`cpp`/`csharp` 等原始索引 id，
  对使用者不友好；详情页同样直接显示 id。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - 新增模块级 `LANGUAGE_LABELS`（14 个 id → 展示名，覆盖 13 种语言）与
    `languageLabel(lang)`（未知语言回退原 id，不隐藏新语言）；
  - 语言筛选选项改为 `${languageLabel(lang)} (${count})`，`value` 仍是
    原始 id，筛选逻辑与既有状态不变；
  - 卡片详情的语言行同样使用展示名。
- 测试 `test/client-smoke.test.js`：语言筛选夹具加入 `e.cpp`，断言选项
  文本含 `JavaScript (1)`、`Python (1)`、`C++ (1)`（而非原始 id）。
- 文档：两份 CHANGELOG、README 双语（stage/路线图/面板能力行）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：335/335 通过。
- `npm run coverage:check`：行 97.85%、分支 87.1%、函数 94.58%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 只改展示、不改值：语言筛选的状态、URL/记忆与测试都依赖原始 id，
  展示名映射在渲染层完成，避免迁移成本。
- 未知语言回退 id：插件可能先于面板支持新语言（或索引来自新版本），
  回退显示保证功能不丢失。
- 映射保持静态而非从 locale 文件读取：语言名是专有名词（JavaScript、
  C++），不需要翻译，静态表更简单且避免双语维护。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Python `pyproject.toml` 自定义 `package-dir` 导入根。
- 提交/推送与版本 tag 由用户确认后执行。
