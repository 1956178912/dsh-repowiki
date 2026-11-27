# 检查点 246：Dart `part` 库合并（v0.270.0）

## 目标

让 Dart 库的主文件与 `part` 文件在符号级引用上合并：导入主库时，
声明在 part 文件里的符号能正确归到 part 文件，而不是只落在主库文件上。

## 交付

- `src/deps.js` `extractDartImports`
  - `part 'x.dart';` 记为独立形态 `kind: 'part'`，`imported: []`
    （part 不是导入，不声称符号引用）。
  - `part of 'x.dart';` 不产生引用记录（避免主库/part 互指形成伪循环）。
  - `ImportInfo.kind` 联合类型补充 `'part'`。
- `src/reexports.js` `buildReexportMaps`
  - 把 `part` 边登记为主库文件的星号再导出（`stars`），复用既有
    barrel 机制；part 边不看 `symbols`。
  - 模块头与函数注释补充 Dart part 形态。
- `src/schema.js`：`INDEX_PARSER_VERSION = 26`。
- 测试：
  - `test/deps.test.js`：part 的 kind/空符号、`part of` 不提取。
  - `test/indexer.test.js`：part 边形态、无反向边；具名导入经主库归到
    part 文件、通配导入把潜在引用传到 part 文件。
  - `test/usages.test.js`：part 边本身不算使用点，导入方经主库归因。
- 文档：README 中英阶段行与要点、CHANGELOG 中英、`docs/compatibility.md`
  Dart 行、`docs/coverage.md` 头部与明细行。

## 语义边界

- `part of` 不建反向边：否则同一库的两文件互指会被循环检测误报；
  因此 part 文件内使用主库符号暂不产生使用点证据。
- `part` 边本身不声称符号引用，避免把 part 指令行当成使用点。
- part 文件内的私有符号（`_` 前缀）仍非导出，不会被下游归因。
- 主库与 part 声明同名符号属于非法 Dart，按主库本地定义优先处理。

## 验证

- 定向：`node --test test/deps.test.js test/indexer.test.js
  test/references.test.js test/usages.test.js` 187/187 通过。
- 全量：822 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；解析器版本回退后缓存导入重新提取，无数据迁移。
