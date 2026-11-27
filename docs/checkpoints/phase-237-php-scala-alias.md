# 检查点 237：PHP/Scala 导入别名归因（v0.261.0）

## 目标

修掉 Scala 重命名导入的归因错误（别名被当成导入符号），并把 v0.258
建立的"原名归因 + 本地别名扫描"约定补齐到 PHP 的 `use … as`。

## 交付

- `src/deps.js`
  - `extractPhpImports`：新增 `pushEntry`，单个 `use A\B\C as D;` 与分组
    `{C as D}` 均保留 `imported: ['C']` 并写 `aliases: [{from:'C', to:'D'}]`；
    分组解析改用带命名捕获的叶子正则，剔除外层路径前缀后再登记。
  - `expandScalaImport`：返回 `{path, name, alias?}`；顶层
    `import a.b.C as D`、分组 `C => D` 与 Scala 3 `C as D` 保留原名，
    本地名放 `alias`；`=> _`/`as _` 表示隐藏，直接不登记。
  - `extractScalaImports`：`imported` 用原名，`alias !== name` 时写
    `aliases`，与 JS/Rust/Python 的方向一致。
- `src/schema.js`：`INDEX_PARSER_VERSION = 17`。
- 测试：`test/deps.test.js` PHP 单个/分组别名、Scala 2/3 重命名、隐藏名
  `=> _`；`test/indexer.test.js` PHP `U` 与 Scala `H` 的边透传。
- 文档：README 中英阶段行与要点、CHANGELOG 中英、`docs/compatibility.md`
  PHP/Scala 行、`docs/coverage.md` 对应行。

## 语义边界

- 引用、影响面与 cards 归因仍用原名；别名只影响导入方本地词法扫描。
- PHP 的 `use function`/`use const` 同样走 `pushEntry`，别名规则一致。
- Scala 3 的 `as` 与 Scala 2 的 `=>` 等价处理；`import a.b as c` 的
  `specifier` 仍是 `a.b`，与重命名前一致。
- Scala 分组里 `_`/`*` 通配仍归到包前缀，不产生符号引用。
- Kotlin/Scala 反引号标识符与 PHP 的 group-use 嵌套（不允许）不在本版
  范围。

## 验证

- 定向：`node --test test/deps.test.js test/indexer.test.js
  test/usages.test.js` 154/154 通过。
- 全量：813 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；解析器版本回退后缓存导入重新提取，无数据迁移。
