# 检查点：别名再导出链（phase-230）

- 日期：2026-11-28
- 合入版本：v0.254.0
- 目标：再导出链已覆盖 JS/Python/Rust 的同名形态，但 `export { x as y }`、
  `from .x import a as b`、`pub use … as Renamed` 只记录原名/本地名，链上
  的最终使用方无法归到目标原名；词法使用点也只会按定义名扫描，导入方
  使用别名时被误判为“无使用”。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/deps.js`：
  - JS `export { x as y } from` 记录 `aliases: [{from:'x', to:'y'}]`；
  - Python `from .x import a as b` 记录原名 a 与本地名 b；
  - Rust `pub use … as Renamed` 记录原名与导出名；普通 `use … as` 保持
    本地名语义不变。
- `src/indexer.js`：边透传可选 `aliases`。
- `src/reexports.js`：
  - `buildReexportMaps` 增加别名映射（导出名 → 目标文件 + 原名）；
  - `resolveReexportOrigins` 返回 `{path, name}`，别名链归到原名；
  - `reexportImportSites` 枚举同名/别名导出名，返回导入方实际使用的
    名字（`names`）。
- `src/usages.js`：
  - `usageImporters(..., files)` 返回导入方别名（`names`）；
  - `findSymbolUsages` 支持 `aliasNames`，按定义名与导入方本地名联合
    匹配；
  - `collectSymbolUsages` 把别名传入扫描计划，结果仍归到目标符号。
- `src/schema.js`：`INDEX_PARSER_VERSION = 12`。
- 测试：
  - `test/deps.test.js`：JS/Python/Rust 别名元数据；
  - `test/references.test.js`：JS 与 Rust 别名链引用；
  - `test/usages.test.js`：别名导入方、`aliasNames` 词法扫描；
  - `test/tools.test.js`：真实索引的 JS 别名再导出引用/使用点。
- 文档：README 双语（阶段行、别名条目）、CHANGELOG 双语、
  `docs/coverage.md`、`docs/compatibility.md`。

## 语义边界

- 别名只解析目标文件确实定义原名的情况；不合成别名符号。
- JS `export { default as X } from` 的目标名是 `default`，当前符号表不
  以 `default` 记录匿名默认导出，因此保守漏报；命名默认导出需后续
  迭代。
- 同一导入方同时使用原名与别名时，词法扫描两者都算，结果按符号聚合。
- 旧索引需重建（parser v12 使导入缓存失效）。

## 验证

- `LANG=en npm test`：799/799
- `LANG=zh_CN.UTF-8 npm test`：799/799
- `npm run coverage:check`：行 98.12%、分支 87.89%、函数 95.53%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
