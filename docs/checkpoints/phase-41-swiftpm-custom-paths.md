# 检查点：SwiftPM 自定义 path 目标 v0.66.0（phase-41）

- 日期：2026-11-27
- 目标：Swift 包不再强制 `Sources/<Target>/` 布局；自定义 `path:` 的
  target 此前完全无法建立依赖边，影响多 target 仓库的反向引用与影响面。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/indexer.js`：
  - `removeComments`：从 `stripJsonc` 抽出字符串感知的注释剥离（JSONC
    与 Swift 共用语法），`stripJsonc` 行为不变；
  - `parseSwiftTargetPaths`：扫描 `.target` / `.executableTarget` /
    `.testTarget` 声明，按括号深度 + 字符串状态取完整声明体（支持跨行
    与依赖数组嵌套），登记带 `path:` 的 target；整段跳过已消费声明，
    避免把依赖数组里的 `.target(name:)` 引用误判为声明；
  - `swiftRepresentative`：目录下字典序最小的 `.swift` 文件；
  - `buildSwiftTargets(paths, declaredPaths)`：显式 path 优先（含目录
    无源码时不回退约定），其余 target 保留 `Sources/<Target>` /
    `Source/<Target>` 约定；
  - `resolveCtx.swiftTargets` 接入 `manifestTexts['Package.swift']`。
- 测试 `test/indexer.test.js`：多行 `.executableTarget`、嵌套依赖数组、
  `testTarget` 导入、注释中的声明被忽略、显式 path 优先于同名
  `Sources/CoreKit` 约定、`import Ghost`（未声明）不建边。
- 文档：两份 CHANGELOG、README 双语（stage/路线图/架构要点）、
  `docs/compatibility.md`（Swift 行与已知限制）、`docs/coverage.md`。

## 验证（本地全量）

- `npm test`：327/327 通过。
- `npm run coverage:check`：行 97.87%、分支 87.02%、函数 94.42%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 轻量扫描而非 Swift 语法树：只关心声明级 `name:`/`path:`，括号深度 +
  字符串状态足以覆盖真实 Package.swift，且保持零依赖形态（ADR-0001）。
- 声明优先于目录约定：同一 target 名可能同时存在旧目录，显式声明才是
  构建事实；声明目录无源码时不回退约定，避免把陈旧目录当成依赖。
- 依赖数组内的 `.target(name:)` 是引用而非声明：整段跳过外层声明即可
  避免误读，也避免产生 `path: ''` 的假 target。
- 不解析 `sources:`/`exclude:`：只影响代表文件精度，不影响"哪个 target
  存在"这一边语义；作为已知限制记录。

## 遗留 / 下一步

- 目录级并行索引（大仓库吞吐）。
- 多行 Scala 参数子句。
- 提交/推送与版本 tag 由用户确认后执行。
