# 检查点 248：Rust/Go 通配导入可见性（v0.272.0）

## 目标

修正通配导入的"潜在引用"范围：Rust `use a::*`（含 `pub use`）与 Go 点
导入只把目标模块/包的**可导入**声明带入作用域，私有项与 impl/接收者
方法既不可导入，也不应出现在引用、使用点导入方与符号影响面里。

## 交付

- `src/reexports.js` 新增 `wildcardImportedNamesByFile(files)`
  - 仅登记 `lang` 为 `rust`/`go` 的文件。
  - 可见名 = `kind !== 'method'` 且 `exported !== false` 的符号。
  - 文件无可见符号时登记空集（通配导入不触达任何符号）。
- `src/references.js` `buildReferenceIndex`
  - 纯 `*` 边按目标可见名展开为具名潜在引用；`hidden` 边与 **barrel
    目标**除外（barrel 需向再导出链转发，保持 `*`）。
  - `buildReexportMaps`/`barrelFiles` 提前到首轮之前计算并复用。
  - 无 `files`（旧索引/未提供符号表）时保留 `*` 保守行为。
- `src/usages.js` `usageImporters`
  - 纯 `*` 边命中不可见符号时跳过（显式具名边不受影响）。
- `src/impact.js` `computeSymbolImpact`
  - 纯 `*` 边的直接受影响符号按目标可见名过滤（显式具名边保留）。
- 测试：
  - `test/references.test.js`：Rust/Go 展开、私有项/方法不归因、无
    符号表回退；Rust 星号再导出链不被展开截断。
  - `test/usages.test.js`：私有项/方法没有潜在导入方。
  - `test/impact.test.js`：通配直接影响只含公开模块级符号。
- 文档：README 中英、CHANGELOG 中英、`docs/compatibility.md` Rust/Go 行、
  `docs/coverage.md` 头部与明细行。

## 语义边界

- `pub(crate)` 仍记为导出（索引层无法区分跨 crate 可见性），保守保留。
- Dart/JS/Python 等语言的通配规则不在此表：JS 命名空间导入、Python
  `__all__`、Dart `show`/`hide` 各有既有处理。
- barrel 目标保留 `*`，因此其自身私有符号仍可能获得通配潜在引用
  （保守漏报优先于破坏再导出链）。

## 验证

- 定向：`node --test test/references.test.js test/usages.test.js
  test/impact.test.js` 75/75 通过。
- 全量：829 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；纯查询期行为变化，无索引/资产迁移。
