# 检查点：导入别名证据（phase-234）

- 日期：2026-11-28
- 合入版本：v0.258.0
- 目标：`import { parse as parseValue }` 与 Rust `use … as Bar` 的本地
  绑定名在 deps 中被丢弃/当成符号名，引用与使用点无法同时正确归因。
  本轮统一记录原名与本地别名。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/deps.js`：
  - `jsBraceAliases` 同时服务 import 与 export-from；
    `import { x as y }` 记录 `imported: ['x']` 与
    `aliases: [{from:'x', to:'y'}]`；
  - Rust 普通 `use … as` 与 `pub use … as` 统一记录目标原名 + 本地/导出
    别名（此前普通 use 记录本地名、引用无法归到原名）。
- `src/schema.js`：`INDEX_PARSER_VERSION = 14`。
- `src/usages.js`：直接导入方读取非再导出边上的 aliases 作为本地扫描
  名；再导出边上的别名仍由 barrel 链处理，不误当本地绑定。
- `src/reexports.js`：`reexportImportSites` 优先使用导入边别名。
- 测试：
  - `test/deps.test.js`：JS 单行/多行 import 别名、Rust 普通 use 别名；
  - `test/usages.test.js`：具名导入别名作为扫描名；
  - `test/tools.test.js`：真实索引的 JS 具名导入别名引用/使用点。
- 文档：README 双语（阶段行、导入别名条目）、CHANGELOG 双语、
  `docs/coverage.md`、`docs/compatibility.md`。

## 语义边界

- 引用/影响面仍归到目标原名，别名只用于本地词法扫描。
- 不解析运行时的重新赋值或属性访问别名；只读取 import/use 声明。
- JS 默认导入别名继续走 `default:` 标记与 v0.257 的解析路径。
- 旧索引需重建（parser v14 使导入缓存失效）。

## 验证

- `LANG=en npm test`：809/809
- `LANG=zh_CN.UTF-8 npm test`：809/809
- `npm run coverage:check`：行 98.12%、分支 87.89%、函数 95.43%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
