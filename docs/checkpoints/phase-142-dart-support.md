# 检查点：Dart 支持（phase-142）

- 日期：2026-11-27
- 合入版本：v0.166.0
- 目标：索引长期覆盖 14 种语言，Dart/Flutter 仓库只能按普通文本存在，
  没有符号、依赖边与技术栈，卡片/Wiki/影响面分析都拿不到结构信息。
- 状态：代码、符号/依赖/索引测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/schema.js`：
  - `EXTENSION_LANGS` 增加 `dart: 'dart'`；`MANIFEST_FILES` 增加
    `pubspec.yaml: 'pub'`。
- `src/symbols.js` `extractDart`：
  - 类型：class（含 abstract/base/final/sealed/interface/mixin 前缀）、
    mixin（含 `mixin class` 前缀经络）、enum、命名 extension、
    extension type、typedef。
  - 成员：构造器（默认/命名，名称 `Type`/`Type.name`）、方法、getter/setter；
    只扫描类型体直接一层，方法体内的控制流不产符号。
  - 顶层：函数（允许省略返回类型）、getter、`final/const/var` 与带类型变量。
  - `_` 前缀视为私有（exported=false）；字符串/行注释感知的花括号配平；
    方法/类结束行由 `findBlockEnd` 计算，表达式体结束行为当前行。
- `src/deps.js` `extractDartImports`：
  - `import`/`export`/`part`；`dart:`/`package:` 标记非相对；
    `show A, B` 进入 `imported`；`part of` 不匹配。
- `src/indexer.js`：`resolveDartSpecifier` 解析相对与同目录裸 `.dart`；
  `isConfigManifest` 识别嵌套 `pubspec.yaml`。
- `src/stack.js`：`pubspecDependencies`（dependencies + dev_dependencies
  顶层键）、`pubspecName`、`PUB_TECH` 映射（Flutter/Provider/Riverpod/
  Bloc/Dio/go_router/Drift/Isar/Firebase 等）；嵌套 pubspec 累加计数，
  项目名只取根清单。
- `src/prompts.js`：Dart 代码围栏；`client.js`：语言展示名 `Dart`。
- 测试：symbols/deps/indexer 各新增 Dart 用例（构造器/getter/私有、
  `show`/`part`/`package:`、端到端边与 pub 技术栈）。
- README 双语、兼容矩阵（Dart 行 + 轻量解析限制）、覆盖率、CHANGELOG 同步。

## 语义边界

- Dart 无 export 关键字，公开性按 `_` 前缀判定；getter/setter 归为 method。
- 类型体内只扫描直接成员（深度 1）；嵌套函数/局部变量不产符号。
- `part` 指令建库→part 边；`part of` 是反向声明，不建边。
- `package:` 依赖可能来自同仓库其他包，但当前没有 pub 工作区解析，
  一律视为外部；宁可少边也不猜。
- 多行声明头、泛型约束、条件导入（`if (dart.library...)`）不解析，
  已写入兼容矩阵已知限制。
- 花括号配平忽略字符串与行注释；跨行块注释中的括号可能影响 endLine，
  不影响符号名。

## 测试

- `node --test test/symbols.test.js`：22/22。
- `node --test test/deps.test.js`：18/18。
- `node --test test/indexer.test.js`：40/40。
- 全量 535 例（LANG=en 与 LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：535/535（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.01%、分支 86.29%、函数 95.33%。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不引入 Dart 解析器依赖：保持零依赖，沿用行级 + 括号配平的轻量策略。
- 不解析 `package:` 工作区：需要读取 pubspec 的 name/依赖图与 `.dart_tool/
  package_config.json`，先不猜；后续可做有界工作区解析。
- 不把枚举常量登记为符号：它们是值不是可检索声明，避免噪声。
