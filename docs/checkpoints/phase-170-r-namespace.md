# 检查点：R NAMESPACE 导出证据（phase-170）

- 日期：2026-11-28
- 合入版本：v0.194.0
- 目标：v0.192 的 R 支持按 `.` 前缀约定推断 `exported`，但 R 包的权威
  导出清单是根 `NAMESPACE`：未在清单中的非 `.` 函数其实不对外可见，
  `S3method` 注册的方法名（`generic.class`）也不在源码里显式声明。
  约定推断会让检索排序与未使用导出审计失真。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/schema.js`：`MANIFEST_FILES` 增加根 `NAMESPACE`。
- `src/indexer.js`：
  - `parseRNamespace`：解析 `export(...)`（多参数）、`exportClasses`、
    `exportMethods`、`S3method(generic, class[, method])`（导出
    `generic.class` 或第三参数名）与 `exportPattern`（标记 dynamic）；
  - `applyRNamespaceExports`：清单读取后，对所有 R 文件符号重新计算
    `exported = names.has(name) && !name.startsWith('.')`；存在
    `exportPattern` 或清单缺失时保持约定推断；符号对象复制后替换，
    不修改复用缓存的原对象。
- 测试：
  - `indexer.test.js` R 夹具新增 `NAMESPACE`、`internal`、`.hidden`、
    `print.person`、`Counter <- R6Class(...)`，断言导出/未导出、S3 方法、
    R6 类与跨文件收紧；
  - 新增 `exportPattern` 回退夹具，证明动态导出时保持 `.` 约定。

## 语义边界

- `NAMESPACE` 只解析单行调用（roxygen2 生成的清单通常如此）；多行
  `export(\n …\n)` 不展开，文档已注明。
- `exportPattern` 的正则语义无法静态展开，回退约定而不是把所有符号标成
  未导出（避免一次误伤整个包）。
- `exportMethods` 的 S4 方法名直接按参数登记；S4 泛型/方法本身仍不产
  独立符号（与 v0.192 的限制一致）。
- 该后处理只改 `exported` 标记，不改变符号数量、行号、依赖边或
  `parserVersion`（缓存复用的符号也会被重新标注）。

## 验证

- `LANG=en node --test --test-name-pattern="R：|DESCRIPTION" test/symbols.test.js test/deps.test.js test/stack.test.js test/indexer.test.js`：
  5 例通过。
- 全量门禁：`npm test`（双语言 586/586）、`coverage:check`（行 98.10 /
  分支 86.96 / 函数 95.50）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
