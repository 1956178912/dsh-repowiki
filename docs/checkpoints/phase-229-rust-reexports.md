# 检查点：Rust `pub use` 再导出链（phase-229）

- 日期：2026-11-28
- 合入版本：v0.253.0
- 目标：Rust 库常见的入口再导出（`pub use crate::core::Foo`）没有形态
  信息，`use crate::Foo` 也无法落到 crate 入口，导致引用/使用点/影响面
  在 `lib.rs` 处断链。本轮补齐 `pub use` 语义与精确入口回退。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/deps.js`：Rust `pub use`（含 `::*` 与分组星号）记为
  `kind: 'reexport'`；星号路径去掉 `::*` 参与模块解析，符号保留 `*`。
- `src/indexer.js`：
  - `buildRustRootExports` 汇总 `lib.rs`/`main.rs` 的公开符号与 `pub use`
    导出名（含星号标记）；
  - `resolveRustUse` 在 `crate::` 模块路径未命中时，仅当入口确实导出该
    叶子名才回退入口；笔误/外部路径不建边。
- `src/reexports.js`：`kind: 'reexport'` 与 JS `export-from` 同属显式
  再导出，具名与星号链对 references/usages/impact 生效。
- `src/schema.js`：`INDEX_PARSER_VERSION = 11`。
- 测试：
  - `test/deps.test.js`：`pub use` 标记、星号与分组星号；
  - `test/indexer.test.js`：入口回退只对已导出名生效、Missing 不建边；
  - `test/references.test.js` / `test/usages.test.js`：Rust 再导出链；
  - `test/tools.test.js`：真实 Cargo 项目的引用/使用点集成。
- 文档：README 双语（阶段行、Rust 条目）、CHANGELOG 双语、
  `docs/coverage.md`、`docs/compatibility.md`。

## 语义边界

- 入口回退只检查入口的公开符号与 `pub use` 名；实现经过多个私有模块
  的 re-export 仍可能漏报。
- `pub use crate::core::Foo as Bar` 在 deps 中记录 Bar，目标文件只定义
  Foo，别名链保守漏报。
- `use crate::foo::*` 非 `pub` 不构成再导出；模块路径解析规则不变。
- 旧索引需重建（parser v11 使导入缓存失效），`repowiki-status` 会提示。

## 验证

- `LANG=en npm test`：794/794
- `LANG=zh_CN.UTF-8 npm test`：794/794
- `npm run coverage:check`：行 98.11%、分支 87.86%、函数 95.64%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
