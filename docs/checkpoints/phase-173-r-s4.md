# 检查点：R S4 声明符号（phase-173）

- 日期：2026-11-28
- 合入版本：v0.197.0
- 目标：v0.192/v0.195 覆盖了 R6 类与类内方法，但 S4 的 `setGeneric` /
  `setMethod` / `setRefClass` 完全不产符号：Bioconductor 与统计包大量
  使用 S4，泛型与方法无法检索，类也漏登记。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/symbols.js`：
  - `classRe` 增加 `setRefClass`；
  - `genericRe`：`setGeneric("name", …)` → function（endLine 为调用括号范围）；
  - `s4MethodRe`：`setMethod("name", "Class", …)` /
    `setMethod("name", signature("Class"), …)` /
    `setMethod("name", c("Class", …), …)` → method + parent 签名类；
  - 方法 `exported: false`；泛型按 `.` 前缀约定，随后由 NAMESPACE 后处理
    校正。
- `src/indexer.js`：`applyRNamespaceExports` 对 `kind === 'method'` 保持
  `exported: false`，即使同名泛型在 `NAMESPACE` 中导出。
- `src/schema.js`：`INDEX_PARSER_VERSION` 3 → 4（R 提取规则变化，旧索引
  需重新解析）。
- 测试：
  - `symbols.test.js`：泛型/方法 kind 与 parent（字符串与 `signature()`）；
  - `indexer.test.js`：`setGeneric` 导出、`setMethod` 不导出、
    `setRefClass` 类与 `exportClasses`。

## 语义边界

- 只识别字符串形式的名称/签名；`signature()`/`c()` 取第一个字符串作为
  parent；动态构造（变量、`paste0`）不登记。
- `setMethod` 的 `where=` 命名参数不影响名称/签名提取；第三个参数的方法
  体不扫描。
- 方法不属于包导出，NAMESPACE 后处理强制 `exported: false`；泛型仍可由
  `export()` 导出。
- `setRefClass` 与其他类一样登记类名与括号范围，类内 `name = function`
  由既有 R6 方法逻辑归属（若类范围覆盖）。
- `INDEX_PARSER_VERSION` 提升后，升级首轮重建会把 R 文件标为 changed
  并重新解析。

## 验证

- `LANG=en node --test --test-name-pattern="S4" test/symbols.test.js test/indexer.test.js`：
  2 例通过。
- 全量门禁：`npm test`（双语言 592/592）、`coverage:check`（行 98.15 /
  分支 87.07 / 函数 95.53）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
