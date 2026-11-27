# 检查点：坏相对导入报告（phase-205）

- 日期：2026-11-28
- 合入版本：v0.229.0
- 目标：索引里的相对 import 若解析失败，通常是路径写错、目标被排除或
  扩展名不受支持——这些是最容易修复、也最容易被忽视的坏引用。补上
  对照报告后，`repowiki-status` 能直接列出它们。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/unresolved.js`：
  - `findUnresolvedImports`：把文件 import 记录与已解析边按
    `path + line` 对照；只统计 `relative === true` 且以 `.` 开头的
    specifier；总数精确、明细上限 50。
- `src/tool-status.js`：
  - 新增 `unresolved` 区块（schema 完整定义）；
  - 总数 > 0 进入告警，文本报告新增 `Unresolved imports:` 行；
  - 工具描述补充该能力。
- 测试：
  - `test/unresolved.test.js`：已解析/缺失、非相对与裸说明符、
    缺行号、明细上限；
  - `test/status.test.js`：坏引用集成（报告/告警/渲染）。

## 语义边界

- 裸包导入（`react`、`serde`）不统计——外部依赖不是坏引用。
- 同一行多条 import 且只有部分解析时，按行匹配可能漏报剩余项。
- 目标被 `.gitignore` 排除、或扩展名不在支持列表时也会报告，属于
  预期信号（提示配置/支持范围）。
- 只读取索引，不再读源码。

## 验证

- `LANG=en npm test`：683/683
- `LANG=zh_CN.UTF-8 npm test`：683/683
- `npm run coverage:check`：行 98.06%、分支约 87.9%、函数 95.89%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
