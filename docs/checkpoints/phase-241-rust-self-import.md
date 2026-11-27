# 检查点 241：Rust `use a::b::{self}`（v0.265.0）

## 目标

修掉 Rust use 分组内 `self` 产生的伪路径 `a::b::self`，让模块导入按
`use a::b;` 的语义解析并带上模块名证据。

## 交付

- `src/deps.js` `expandRustUse`
  - `pathPart === 'self'` 时路径取当前前缀（去掉 `::self`），导入名取前缀
    末段；`{self as local}` 的本地别名进入 `name`/`local` 差异，由调用方
    生成 `aliases: [{from: 模块名, to: local}]`。
  - 无前缀的孤立 `self` 跳过（没有可导入的模块）。
  - 普通叶子与 `super` 行为保持不变。
- `src/schema.js`：`INDEX_PARSER_VERSION = 21`。
- 测试：`test/deps.test.js` 增加 `use crate::parser::{self, Token};` 与
  `use crate::lexer::{self as lex};`，断言无伪路径、模块名导入与别名。
- 文档：README 中英阶段行与要点、CHANGELOG 中英、`docs/compatibility.md`
  Rust 行、`docs/coverage.md` 对应行。

## 语义边界

- `self` 只按精确叶子识别；`self::inner::Thing` 仍按相对模块路径解析。
- 模块名导入与既有 `use crate::parser;` 一致（模块不是符号，但模块名
  可作为使用点证据扫描）。
- `{self as local}` 的引用仍归模块名，词法使用点按 `local` 扫描。
- 孤立 `{super}`/非法写法保持跳过，不猜测。

## 验证

- 定向：`node --test test/deps.test.js test/indexer.test.js` 136/136 通过。
- 全量：817 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；解析器版本回退后缓存导入重新提取，无数据迁移。
