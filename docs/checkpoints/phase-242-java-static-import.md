# 检查点 242：Java 静态导入成员级证据（v0.266.0）

## 目标

让 `import static a.b.C.member;` 的依赖边指向类文件、符号记为成员名，
使引用与影响面精确到方法/字段；静态通配导入按 `*` 潜在引用。

## 交付

- `src/deps.js` `extractJavaImports`
  - `static` 分支：`specifier` 收敛到类路径（去掉成员段），`imported`
    记成员名；`*` 末段记 `['*']`。
  - 普通导入保持"取最后一个大写段作为类型名"，普通通配导入保持空符号
    （文件级边）。
- `src/schema.js`：`INDEX_PARSER_VERSION = 22`。
- 测试：`test/deps.test.js` Java 用例改为按 specifier 分组断言
  `[['Helper'], ['run']]`、普通通配空符号、静态通配 `*`；
  `test/indexer.test.js` 真实索引断言 static 边 `symbols: ['run']`、
  普通通配边 `symbols: []`。
- 文档：README 中英阶段行与要点、CHANGELOG 中英、`docs/compatibility.md`
  Java 行、`docs/coverage.md` 对应行。

## 语义边界

- 静态成员导入的引用归到成员符号（方法/字段），不再是类符号；类文件
  仍通过边保持依赖关系。
- `import static a.b.C.*` 的 `*` 是"可能引用任意静态成员"的潜在证据，
  实际使用仍由词法扫描确认。
- 普通 `import a.b.C` 与 `import a.b.*` 的既有行为不变（后者保持文件级，
  避免把包目录代表文件的全部符号误当潜在引用）。
- 嵌套类静态导入（`Outer.Inner.member`）按同一规则收敛到 `Outer.Inner`。

## 验证

- 定向：`node --test test/deps.test.js test/indexer.test.js
  test/references.test.js` 163/163 通过。
- 全量：817 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；解析器版本回退后缓存导入重新提取，无数据迁移。
