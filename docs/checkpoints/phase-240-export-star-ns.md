# 检查点 240：`export * as ns` 命名空间再导出（v0.264.0）

## 目标

修正 `export * as ns from './a'` 的证据语义：它只创建命名空间对象，
不展开目标符号，不能作为星号再导出参与下游归因。

## 交付

- `src/deps.js` `extractJsImports`
  - 新增 `starNamespace` 判定（`export * as <name> from`）。
  - 该形态记 `imported: []`（文件级边保留），不再被 `jsImportedNames`
    的 `* as` 分支记为 `*`。
  - `export * from` 仍记 `*`（星号展开），`export {}` 行为不变。
- `src/schema.js`：`INDEX_PARSER_VERSION = 20`。
- 测试：`test/deps.test.js` 断言 `export * as ns` 的空符号与 `export-from`
  形态；`test/references.test.js` 断言下游具名导入留在 barrel、不归到
  目标文件。
- 文档：README 中英阶段行与要点、CHANGELOG 中英、`docs/compatibility.md`
  JS/TS 行、`docs/coverage.md` 对应行。

## 语义边界

- `export * as ns` 的 `ns` 是 barrel 自身的新绑定，索引不把它当作目标
  文件的符号；下游 `import { ns }` 只保留对 barrel 的直接引用。
- `export * as default from` 同样按命名空间对象处理（不展开）。
- 真正的星号展开 `export * from` 不变，`export *` 仍不转发 default。
- 动态 import/require 与副作用导入路径不受影响。

## 验证

- 定向：`node --test test/deps.test.js test/references.test.js` 77/77 通过。
- 全量：817 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；解析器版本回退后缓存导入重新解析，无数据迁移。
