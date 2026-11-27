# 检查点：SwiftPM 本地包（phase-224）

- 日期：2026-11-28
- 合入版本：v0.248.0
- 目标：此前 `Package.swift` 只识别 `.package(url:)` 远端依赖，本地
  `.package(path: "../LocalCore")` 被完全忽略，`dependencyCounts.swiftpm`
  偏低。本轮把本地路径包计入依赖计数，同时坚持不臆造技术名。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/stack.js`：
  - `swiftPackageDeps` 单条 `.package(...)` 同时匹配 `url:` 与 `path:`；
    远端取仓库名、本地取目录 basename（去尾部斜杠后小写归一）；
  - 本地包名只计数，不进入 `SWIFT_TECH` 映射，避免把目录名当成技术。
- 测试：`test/stack.test.js` 新增混合用例——Vapor 远端 + `../LocalCore`
  + `./Modules/Shared/` 共 3 个依赖，含 Vapor、不含 `localcore` 技术名。
- 文档：README 双语（阶段行、索引工具行、版本列表）、CHANGELOG 双语、
  `docs/coverage.md`。

## 语义边界

- 目录名不等于 SwiftPM target/module 名，因此不建本地依赖边，也不做
  技术映射；需要模块级关系时以源码 import 证据为准。
- 尾部斜杠会剥离；`path:` 与 `url:` 同时出现时按正则首个捕获组处理，
  一条 `.package` 只产出一个依赖。
- 绝对路径与相对路径一视同仁，仅取最后一段；不做路径存在性校验。

## 验证

- `LANG=en npm test`：773/773
- `LANG=zh_CN.UTF-8 npm test`：773/773
- `npm run coverage:check`：行 98.09%、分支 87.89%、函数 95.58%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
