# 检查点：同文件使用点（phase-218）

- 日期：2026-11-28
- 合入版本：v0.242.0
- 目标：`repowiki-cards usages=true`（v0.238.0）只看直接具名导入方，导致
  "私有函数/同文件调用"回答为空；用户对"这个符号在哪被用到"的直觉包含
  定义文件内部。本轮补充定义文件扫描，同时避免把定义签名/递归本身算作
  使用证据。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/usages.js`：
  - `findSymbolUsages` 新增 `skipRanges`（闭区间数组）；逐行判定与
    `skipLines` 并列，非法区间（非二元组、非整数、起点 <1、反向）忽略；
- `src/tool-cards.js`：
  - `collectSymbolUsages` 的目标扩展到符号的 `line`/`endLine`；
  - 扫描计划改为"文件 → 符号 → 跳过行/区间"：定义文件登记定义范围，
    导入方登记 import 行；同一文件可同时服务多个符号；
  - 定义文件优先读取，且不占用 20 个导入方文件上限（最多 5 个）；
  - `filesScanned` 计入定义文件；`importers` 仍只列具名导入位置；
  - 工具描述与 `usages` 参数说明同步；
- 测试：
  - `test/usages.test.js` 1 例：`skipRanges` 排除定义体、非法区间忽略；
  - `test/tools.test.js`：同文件局部调用进入 `usages`、`filesScanned` 变为
    2；文件上限用例调整为"20 导入方 + 1 定义文件 = 21"。
- 文档：README 双语（阶段行、cards 工具行、版本列表）、CHANGELOG 双语、
  `docs/coverage.md`。

## 语义边界

- 仍然是**词法出现**：定义范围排除只解决"定义自身/递归"噪声，同名不同
  实体、字符串与行尾注释无法区分；调用方需人工确认。
- 定义范围来自索引符号的 `line`/`endLine`；旧索引缺少 `endLine` 时只跳过
  定义起始行。
- 定义文件读取失败计入 `unreadable`，不会伪报零使用。
- 20 个文件上限只约束导入方；定义文件额外读取（≤5），因此总读取数上限
  为 25。
- 预算（每符号 10 条、总计 100 条）对定义文件同样生效，超出时 `truncated`。

## 验证

- `LANG=en npm test`：765/765
- `LANG=zh_CN.UTF-8 npm test`：765/765
- `npm run coverage:check`：行 98.08%、分支 87.89%、函数 95.53%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
