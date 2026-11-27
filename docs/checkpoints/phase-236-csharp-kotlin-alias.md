# 检查点 236：C#/Kotlin 导入别名证据（v0.260.0）

## 目标

把 v0.258 在 JS/TS/Rust 上建立的"原名归因 + 本地别名扫描"约定扩展到
C# 的 `using` 别名与 Kotlin 的 `as` 别名，补全这两门语言在引用、影响面
与词法使用点上的证据链。

## 交付

- `src/deps.js`：`extractCSharpImports` 捕获 `using Alias = A.B.C;` 的
  别名，`imported` 保持原名叶子；`extractKotlinImports` 捕获
  `import a.b.C as D` 的别名；两者按 `aliases: [{from: 原名, to: 本地名}]`
  写入导入记录（与 JS/Rust/Python 同一方向）。修正 `ImportInfo.aliases`
  的 JSDoc 范围与字段方向说明。
- `src/schema.js`：`INDEX_PARSER_VERSION = 16`，旧导入缓存重解析。
- 测试：`test/deps.test.js` 断言 C#/Kotlin 别名元数据、`using static`
  无别名、C# 泛型/元组别名不登记；`test/indexer.test.js` 断言别名随边
  透传（C# `U`、Kotlin `H`）。
- 文档：README 中英阶段行与要点、CHANGELOG 中英、`docs/compatibility.md`
  C#/Kotlin 行、`docs/coverage.md` 对应行。

## 语义边界

- 引用、影响面与 cards 的符号归因仍用原名：别名只是导入方本地绑定，
  不制造新符号。
- 词法使用点对导入方文件按本地名扫描（`usageImporters` 的 `names`），
  再导出边上的别名不会被误当本地绑定（沿用 v0.258 规则）。
- `using static X;` 是成员导入而非重命名，不产生别名。
- C# 泛型别名（`using L = System.Collections.Generic.List<int>;`）与
  元组别名（`using P = (int a, int b);`）无法用简单正则安全解析，整行
  不登记，不猜测。
- Kotlin 反引号标识符别名（`` import a.b.`when` ``）不在本版范围。

## 验证

- 定向：`node --test test/deps.test.js test/indexer.test.js
  test/usages.test.js` 153/153 通过。
- 全量：813 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；解析器版本回退会让缓存导入重新提取，无数据迁移。
