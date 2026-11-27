# 检查点 245：C# 静态 using 与 Kotlin 类型通配（v0.269.0）

## 目标

统一"通配/静态导入"的符号级语义：C# `using static` 不再把类名当成员，
`global::` 限定符不再导致整条指令丢失；Kotlin `import a.b.C.*` 区分
类型（成员通配）与包（代表文件）两种前缀。

## 交付

- `src/deps.js` `extractCSharpImports`
  - `using static X;` / `global using static X;` 记 `imported: ['*']`，
    specifier 仍为 `X`（依赖边指向类文件），与 Java/Groovy 静态通配一致。
  - 提取前剥离 `global::`：`using global::A.B;` 与
    `using Json = global::A.B.Json;` 不再丢失（别名照常写 `aliases`）。
  - 资源语句 `using (…)` / `using var …` 的排除逻辑不变。
- `src/indexer.js`
  - 新增 `KOTLIN_TYPE_KINDS` 与按文件的类型名表 `kotlinTypeNames`。
  - Kotlin `import a.b.C.*`：前缀经 `resolveDottedSpecifier` 命中的文件
    若声明同名 class/object/interface/type，则边指向该类型文件并记
    `symbols: ['*']`；否则保持原有包通配语义（代表文件、空符号）。
- `src/schema.js`：`INDEX_PARSER_VERSION = 25`。
- 测试：`test/deps.test.js` 扩展 `using static`/`global using static`/
  `global::` 与资源语句负例；`test/indexer.test.js` 新增 C# 静态 using 边、
  Kotlin 类型/包通配对比用例。
- 文档：README 中英阶段行与要点、CHANGELOG 中英、`docs/compatibility.md`
  C#/Kotlin 行、`docs/coverage.md` 头部与两行明细。

## 语义边界

- `*` 是潜在引用：真实使用由词法扫描/使用点证据确认，不臆造具体成员名。
- C# `using static` 指向的类文件若未提取到类型符号，仍按文件级 `*`
  合并到该文件的全部符号（与 Java 静态通配同一约定）。
- Kotlin 嵌套类型通配（类型不在独立文件）仍按包代表文件处理，不猜测。
- 包通配保持代表文件 + 空符号，避免把代表文件的全部符号误当潜在引用。

## 验证

- 定向：`node --test test/deps.test.js test/indexer.test.js` 通过。
- 全量：820 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；解析器版本回退后缓存导入重新提取，无数据迁移。
