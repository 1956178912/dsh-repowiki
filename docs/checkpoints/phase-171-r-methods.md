# 检查点：R6/S4 方法符号（phase-171）

- 日期：2026-11-28
- 合入版本：v0.195.0
- 目标：v0.192 为了避免 R6 方法被误判为顶层函数，直接把 `R6Class(...)`
  / `setClass(...)` 的调用体整体跳过：类名可见，但 `initialize`/`get` 等
  方法完全无法检索，符号粒度落后于其他面向对象语言。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/symbols.js`：
  - `extractR` 维护 `classRanges`（类调用起止）与 `methodEnds`（已登记
    方法的结束行）；
  - 类范围内、方法体外的 `name = function(...)` 登记为 `method`，
    `parent` 为类名、`exported: false`（方法经类访问，不是包导出）；
  - 方法结束行复用 `rFunctionEnd`（块体/单行表达式体/跨行签名）；
  - 方法体内不再扫描，局部赋值不会被误判。
- `test/symbols.test.js`：R6 夹具新增 `get = function() private$value`，
  断言 `initialize`/`get` 的 kind、parent、exported、endLine 与类结束行
  随新增方法更新。

## 语义边界

- 类范围内任何 `name = function(...)` 都视为方法（R6 的 public/private
  list 都是这种形态）；`public = list(` 等非函数调用不匹配。
- 方法 `exported: false`：R 的导出单位是包/类，方法本身不进 `NAMESPACE`；
  检索仍可按名称命中，卡片与影响面能看到归属类。
- `setClass` 的槽位函数（`representation(...)`）不产符号；S4 泛型/
  `setMethod` 仍不登记（与 v0.192 一致）。
- 方法体内部嵌套的 `function` 不登记（方法范围优先）。
- **解析规则变化**：`INDEX_PARSER_VERSION` 提升到 3，使旧索引里内容未变
  的 R 文件也重新解析并补上方法符号（否则复用旧缓存会看不到新方法）。

## 验证

- `LANG=en node --test --test-name-pattern="R：" test/symbols.test.js`：
  通过。
- 全量门禁：`npm test`（双语言 586/586）、`coverage:check`（行 98.11 /
  分支 86.82 / 函数 95.50）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
