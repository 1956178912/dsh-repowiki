# 检查点：podspec 元数据（phase-220）

- 日期：2026-11-28
- 合入版本：v0.244.0
- 目标：v0.240.0 已支持 `Podfile`/`Cartfile`，但 CocoaPods 库仓库的主清单是
  `*.podspec`（应用项目不一定有 Podfile）。本轮补齐 podspec 的项目名/版本/
  依赖与 subspec 依赖，使 iOS 库仓库也能得到技术栈与依赖计数。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/stack.js`：
  - `podspecInfo`：解析 `s.name`/`s.version`、`s.dependency` 与
    subspec 的 `sp.dependency`（可选版本约束），逐行去注释；
  - `detectStack` 新增 `*.podspec` 分支：依赖计入
    `dependencyCounts.cocoapods`，名称/版本仅在缺失时补项目元数据，
    依赖经 `IOS_TECH` 映射技术。
- `src/indexer.js`：
  - `isConfigManifest` 纳入 `*.podspec`；
  - `MAX_PODSPEC_MANIFESTS = 20` 与选择计数，根/嵌套清单都参与聚合。
- 测试：
  - `test/stack.test.js`：名称/版本/两个依赖 + subspec 依赖、注释行忽略、
    版本约束保留；
  - `test/indexer.test.js`：根 podspec 提供项目名/版本，根 + 嵌套依赖计数
    为 2，技术栈含 SnapKit/Firebase。
- 文档：README 双语（阶段行、索引工具行、版本列表）、CHANGELOG 双语、
  `docs/coverage.md`。

## 语义边界

- 只支持 Ruby DSL 的 `*.podspec`；`*.podspec.json` 不解析（按普通 JSON
  文件存在，不进入技术栈）。
- 依赖版本取声明后的第一个字符串；复杂约束（多条件）原样保留，不做求值。
- podspec 只贡献元数据与依赖，不建立本地依赖边（CocoaPods 依赖是外部包）。
- 嵌套上限 20，超出部分不读取；根清单优先。

## 验证

- `LANG=en npm test`：770/770
- `LANG=zh_CN.UTF-8 npm test`：770/770
- `npm run coverage:check`：行 98.08%、分支 87.9%、函数 95.55%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
