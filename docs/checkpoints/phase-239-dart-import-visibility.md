# 检查点 239：Dart 导入可见性（v0.263.0）

## 目标

让 Dart 的导入/导出组合子进入符号级证据：无组合子按 `*` 潜在引用，
`show` 精确，`hide` 记录排除名单并在引用/使用点侧扣除。

## 交付

- `src/deps.js` `extractDartImports`
  - 解析 `show`/`hide` 名单（逗号分隔，`show … hide …` 时 hide 生效）。
  - 无组合子的 `import` → `imported: ['*']`；`export` → `imported: ['*']`
    且 `kind: 'export-from'`（进入 barrel 星号再导出）。
  - `hide` 的 `import` → `imported: ['*']` + `hidden: [...]`；`export` +
    `hide` 保守记空符号（再导出链不支持排除名）。
  - `part` 保持空符号（同一编译单元）；`as` 前缀不改变可见性。
- `src/indexer.js`：边透传 `hidden`。
- `src/references.js`：对带 `hidden` 的星号边惰性构建目标导出名表，
  展开为"目标符号 − 隐藏名"的具名潜在引用，不再写通配键。
- `src/usages.js`：`usageImporters` 跳过隐藏名，不把该导入方算作潜在使用。
- `src/schema.js`：`INDEX_PARSER_VERSION = 19`。
- 测试：`test/deps.test.js` Dart 组合子用例；`test/references.test.js`
  hide 展开与 `referencesFor` 合并；`test/usages.test.js` 隐藏名过滤；
  `test/indexer.test.js` show/无组合子/part 的边符号断言。
- 文档：README 中英阶段行与要点、CHANGELOG 中英、`docs/compatibility.md`
  Dart 行、`docs/coverage.md` 对应行。

## 语义边界

- `*` 是"可能引用任意导出符号"的潜在证据，实际使用仍由词法扫描确认。
- `hide` 展开需要目标文件符号表；缺失时按空处理（不猜测）。
- `export … hide …` 不进入星号再导出（避免把被隐藏名当成导出）。
- `part`/`part of` 不产生符号引用；`as` 前缀只影响书写，不改变可见性。
- Dart 私有 `_` 前缀符号由提取器标记 `exported: false`，不会进入展开集合。

## 验证

- 定向：`node --test test/deps.test.js test/indexer.test.js
  test/references.test.js test/usages.test.js` 182/182 通过。
- 全量：816 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；解析器版本回退后缓存导入重新提取，无数据迁移。
