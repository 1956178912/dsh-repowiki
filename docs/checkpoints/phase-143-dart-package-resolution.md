# 检查点：Dart 工作区包解析（phase-143）

- 日期：2026-11-27
- 合入版本：v0.167.0
- 目标：v0.166.0 的 Dart 支持只解析相对 `import`/`export`/`part`，所有
  `package:` 一律视为外部。Flutter monorepo 的本地包彼此导入时没有依赖边，
  影响面分析、循环检测与 Wiki 架构章节都缺失这部分结构。
- 状态：代码、索引测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/indexer.js`：
  - `buildDartPackages(manifestTexts)`：从仓库内任意 `pubspec.yaml` 读取
    `name`，映射包名 → 包根目录；同名包优先目录更浅者，同深度按字典序，
    与 JS 工作区规则一致。
  - `resolveDartPackage(specifier, packages, indexed)`：
    `package:<name>/<sub>.dart` → `<包根>/lib/<sub>.dart`，根包为
    `lib/<sub>.dart`；只接受仓库内已索引文件，外部包返回 null。
  - `resolveImportEdge` 的 Dart 分支先处理 `package:`，再走相对路径；
    `dart:` 仍不建边。
  - 解析上下文新增 `dartPackages`。
- `test/indexer.test.js` Dart 端到端夹具：
  - 新增 `lib/app.dart` 导入 `package:demo_app/src/screen.dart`（自包）。
  - 新增嵌套包 `packages/shared/pubspec.yaml`（`name: shared_ui`）与
    `packages/shared/lib/widgets/button.dart`，app 导入
    `package:shared_ui/widgets/button.dart`。
  - 断言两条 package 边、part/相对 import 行号、外部 Flutter 不建边、
    `dependencyCounts.pub` 合并为 4。
- README 双语、兼容矩阵、覆盖率报告、CHANGELOG 同步。

## 语义边界

- 只认仓库内 pubspec 声明的包；不读取 `.dart_tool/package_config.json`，
  也不推断 pub cache 或 SDK 包。
- 子路径必须落在 `lib/` 下；`package:name/name.dart` 等常规布局成立，
  `lib/src/...` 与生成文件同样按路径匹配。
- 同名包取最浅目录（根包优先），避免 monorepo 中示例/测试包覆盖主包。
- 解析不到即视为外部，不产生“猜出来的边”；不影响相对导入行为。
- `pubspec.yaml` 本身仍是清单，不进入源码统计。

## 测试

- `node --test test/indexer.test.js`：40/40。
- `node --test test/symbols.test.js`：22/22。
- `node --test test/deps.test.js`：18/18。
- 全量 535 例（LANG=en 与 LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：535/535（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.03%、分支 86.60%、函数 95.34%。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不读取 `.dart_tool/package_config.json`：它是生成物、通常被 gitignore，
  且在未 `pub get` 的仓库中不存在；pubspec 映射更稳定、可复现。
- 不解析 pub 的 `dependency_overrides`/path 依赖：当前 pubspec 名字映射已
  覆盖本地包导入，path 依赖的边界情况留待真实需求验证。
- 不做包名大小写归一：Dart 包名约定小写，按原样匹配。
