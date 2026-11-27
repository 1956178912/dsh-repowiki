# 检查点 250：Rust `#[path]` 模块与 Lua 长括号 require（v0.274.0）

## 目标

补齐两个依赖提取边界：

1. Rust `#[path = "…"] mod foo;` 指定了模块文件位置，此前仍按
   `foo.rs`/`foo/mod.rs` 猜测，显式路径不产生边。
2. Lua 的 `require([[pkg.mod]])` / `require([=[pkg.mod]=])` 长括号字符串
   此前不识别（仅引号形式）。

## 交付

- `src/deps.js` `extractRustImports`
  - 维护待定 `#[path = "…"]`：可单独成行（可与 `#[cfg]` 等属性混排），
    也可与 `mod` 同行；其他代码行出现即过期。
  - `mod` 声明有显式路径时记为 `kind: 'mod-path'`，specifier 为属性路径；
    否则沿用 `kind: 'mod'` 与模块名。
  - `ImportInfo.kind` 联合类型补充 `'mod-path'`。
- `src/indexer.js` 新增 `resolveRustModPath`
  - 相对引用方文件目录归一解析；越出项目根（`../` 或绝对路径）返回
    null，不建边。
  - `resolveImportEdge` 的 Rust 分支处理 `mod-path`。
- `src/deps.js` `extractLuaImports`
  - require 正则支持 `[[…]]` 与 `[=[…]=]` 单行长括号，内容去首尾空白，
    空 specifier 跳过。
- `src/schema.js`：`INDEX_PARSER_VERSION = 27`。
- 测试：
  - `test/deps.test.js`：属性同行/独立行、`#[cfg]` 混排、属性过期、
    Lua 长括号（方括号与等号形式、无括号形式）。
  - `test/indexer.test.js`：`mod-path` 边、行号取 `mod` 语句、不猜
    模块名、越界路径不建边。
- 文档：README 中英、CHANGELOG 中英、`docs/compatibility.md` Rust/Lua 行、
  `docs/coverage.md` 头部与明细行。

## 语义边界

- `#[path]` 只处理文件模块（`mod foo;`），内联 `mod foo { … }` 不产生边。
- 属性解析按单行方括号配平，属性值内含 `]` 的极端写法不保证识别。
- Lua 长括号仅支持单行形态；跨行长括号字符串不提取。
- Lua `require` 仍按代码区正则扫描，字符串内出现的 `require(...)` 文本
  不额外屏蔽（既有边界）。

## 验证

- 定向：`node --test test/deps.test.js test/indexer.test.js` 141/141 通过。
- 全量：833 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；解析器版本回退后缓存导入重新提取，无数据迁移。
