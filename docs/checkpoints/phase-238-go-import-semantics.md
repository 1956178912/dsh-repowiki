# 检查点 238：Go 导入语义（v0.262.0）

## 目标

让 Go 的别名导入、点导入与空白导入在引用/使用点证据上有正确语义：
别名按本地名扫描，点导入按潜在通配引用，空白导入只保留依赖边。

## 交付

- `src/deps.js` `extractGoImports`
  - 用带命名捕获的正则取出导入别名（`alias`），保留包名末段作为原名。
  - `import f "x/y"` → `imported: ['y']` + `aliases: [{from:'y', to:'f'}]`。
  - `import . "x/y"` → `imported: ['*']`（references 合并到目标全部符号，
    usageImporters 视为潜在导入方）。
  - `import _ "x/y"` → `imported: []`（依赖边保留，符号引用为零）。
  - 无别名导入行为不变。
- `src/schema.js`：`INDEX_PARSER_VERSION = 18`。
- 测试：`test/deps.test.js` Go 用例断言别名、点导入、空白导入与无别名
  边界；`test/indexer.test.js` 真实索引断言 `greeter` 边别名与 `blank`
  边空符号。
- 文档：README 中英阶段行与要点、CHANGELOG 中英、`docs/compatibility.md`
  Go 行、`docs/coverage.md` 对应行。

## 语义边界

- Go 包名按导入路径末段近似（`yaml.v3` 这类包名与路径不一致的情况保持
  既有近似，不引入包名索引）。
- dot import 的 `*` 是"潜在引用"，不是精确符号使用；真实使用仍需词法
  扫描确认。
- 空白导入仍计入依赖边与影响面文件级扩散，只是不声称符号级引用。
- 点导入/空白导入在被引用文件不是本地模块时不建边（既有 module 前缀
  过滤不变）。

## 验证

- 定向：`node --test test/deps.test.js test/indexer.test.js
  test/references.test.js test/usages.test.js` 179/179 通过。
- 全量：813 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；解析器版本回退后缓存导入重新提取，无数据迁移。
