# 检查点 244：Groovy 导入语义（v0.268.0）

## 目标

修复 Groovy 通配导入被截断成伪路径的问题，并补齐静态通配与 `as`
别名的证据。

## 交付

- `src/deps.js` `extractGroovyImports`
  - 新增 `import static X.*` 分支：specifier 收敛到类路径、`imported: ['*']`。
  - 新增 `import a.b.*` 分支：specifier 为包路径、`imported: []`（此前
    被截断成 `a.b` 且把 `b` 当类型名）。
  - 普通导入解析 `as` 别名并写入 `aliases`（此前丢弃）。
  - 静态成员导入（`import static X.member`）保持"类路径 + 成员名"。
- `src/schema.js`：`INDEX_PARSER_VERSION = 24`。
- 测试：`test/deps.test.js` Groovy 用例扩展静态通配、包通配与 `as` 别名。
- 文档：README 中英阶段行与要点、CHANGELOG 中英、`docs/compatibility.md`
  Groovy 行、`docs/coverage.md` 对应行。

## 语义边界

- `import static X.*` 的 `*` 是潜在引用，真实使用由词法扫描确认。
- 包级通配 `import a.b.*` 不声称具体类型（保持文件级/包级依赖），避免
  把包目录代表文件的全部符号误当潜在引用。
- `as` 别名只影响导入方本地扫描名，引用归到原名。
- Groovy 的 `relative: false` 语义不变（点分后缀匹配，外部包不建边）。

## 验证

- 定向：`node --test test/deps.test.js test/indexer.test.js` 136/136 通过。
- 全量：817 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；解析器版本回退后缓存导入重新提取，无数据迁移。
