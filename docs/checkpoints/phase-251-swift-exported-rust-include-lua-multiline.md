# 检查点 251：Swift `@_exported`、Rust `include!` 与 Lua 跨行 require（v0.275.0）

## 目标

补齐三种"依赖存在但索引缺失"的形态：

1. Swift `@_exported import` 会把被导入模块的 API 转发给聚合模块的使用者，
   此前整行不识别（只支持 `@testable`），影响面链路在聚合层断开。
2. Rust `include!("path")` 文本包含本地文件，此前不产生依赖边。
3. Lua 长括号 require 仅支持单行；格式化换行的 `require([[ … ]])` 遗漏，
   且 `--[=[ … ]=]` 块注释未屏蔽。

## 交付

- `src/deps.js` `extractSwiftImports`
  - 属性前缀支持 `@testable` 与 `@_exported`（可组合、可带子模块形式）。
  - `@_exported` 记为 `kind: 'reexport'`（Swift import 无具名符号，符号为空）。
- `src/deps.js` `extractRustImports`
  - 行首 `include!("字面量")` 记为 `kind: 'require'`；`concat!`/`env!` 等
    动态路径不建边。
- `src/indexer.js`
  - `resolveRustModPath` 统一解析 `#[path]` 与 `include!` 的显式相对路径
    （反斜杠归一、绝对路径拒绝、越出项目根拒绝）。
  - `resolveImportEdge` 的 Rust 分支处理 `require`。
- `src/deps.js` `extractLuaImports` / `stripLuaComments`
  - 整文件扫描 + 行偏移表，长括号内容可跨行；内容 trim 后含内部换行则跳过。
  - 块注释支持 `--[=*[ … ]=*]` 任意等号数配平。
- `src/schema.js`：`INDEX_PARSER_VERSION = 28`。
- 测试：
  - `test/deps.test.js`：Swift 属性组合与子模块、Rust include 字面量/动态、
    Lua 跨行长括号与等号块注释。
  - `test/indexer.test.js`：Swift `@_exported` 再导出边；Rust include 文件边
    与越界拒绝。
- 文档：README 中英、CHANGELOG 中英、`docs/compatibility.md`
  Swift/Rust/Lua 行、`docs/coverage.md` 头部与明细行。

## 语义边界

- Swift `@_exported` 只影响文件级依赖/影响面，不产生符号级引用
  （Swift import 本就不携带具名符号）。
- Rust `include!` 只识别行首字面量形态；宏嵌套或动态路径不建边。
- Lua 长括号内容内部的换行不是合法模块名，直接跳过。
- `include_str!`/`include_bytes!` 是数据文件，不建源码边。

## 验证

- 定向：`node --test test/deps.test.js test/indexer.test.js` 143/143 通过。
- 全量：835 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；解析器版本回退后缓存导入重新提取，无数据迁移。
