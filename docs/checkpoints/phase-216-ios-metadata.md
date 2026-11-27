# 检查点：iOS 依赖元数据与测试路由（phase-216）

- 日期：2026-11-28
- 合入版本：v0.240.0
- 目标：Objective-C 支持（v0.239.0）之后补齐 iOS 生态的两块外围信息：
  一是 CocoaPods/Carthage 依赖没有进入 `dependencyCounts`/技术栈，二是
  XCTest 文件（`FooTests.m`）没有被测试路径启发式识别，影响面无法把
  iOS 测试列入 `affectedTests`。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/schema.js`：`MANIFEST_FILES` 增加 `Podfile`/`Cartfile`/
  `Cartfile.private`（cocoapods/carthage）。
- `src/indexer.js`：
  - `isConfigManifest` 纳入三种 iOS 清单，使嵌套 `ios/Podfile` 等也被收集；
  - `MAX_PODFILE_MANIFESTS` / `MAX_CARTFILE_MANIFESTS`（各 20）与对应选择
    计数，嵌套清单只用于依赖计数/技术栈聚合，不影响根清单。
- `src/stack.js`：
  - `podfileDeps`：逐行解析 `pod 'Name', '~> 1.0'`（去注释；`:path`/`:git`
    本地依赖也计数）；版本取后续字符串中符合约束形态的第一个；
  - `cartfileDeps`：解析 `github`/`git`/`binary`，仓库名取 URL 末段并去
    `.git`，版本支持 `~>`/`==`/`>=`；
  - `IOS_TECH`：小型、经过核对的主流库映射（AFNetworking、Alamofire、
    Firebase、SnapKit、ReactiveCocoa、Quick 等），子规格按首段归一；
  - `detectStack` 新增 cocoapods/carthage 分支：依赖计数累加、技术带
    `source` 与可选 `version`。
- `src/test-files.js`：`FooTest`/`FooTests`/`FooSpec`/`FooIT` 的扩展名集合
  增加 `.m`/`.mm`，影响面自动把 XCTest 文件列为 `affectedTests`。
- 测试：
  - `test/stack.test.js` 2 例：Podfile（版本/子规格/本地路径/注释）与
    Cartfile（github/git/binary、版本、仓库名）；
  - `test/test-files.test.js`：新增 XCTest 命中与 `Contest.m`/`Manifest.mm`
    反例；
  - `test/indexer.test.js` 1 例：根 + 嵌套 Podfile/Cartfile 聚合。
- 文档：README 双语（阶段行、索引工具行、版本列表）、CHANGELOG 双语、
  `docs/coverage.md`。

## 语义边界

- Podfile 只识别语句级 `pod` 行；`podspec`、`Podfile.lock`、Bazel/SPM 混合
  工程不额外解析。
- Cartfile 只读取 `Cartfile` 与 `Cartfile.private`；`Cartfile.resolved`
  （锁文件）不计数。
- `IOS_TECH` 只收录名称确定的主流库，未命中映射的依赖仍计入
  `dependencyCounts`，不产生臆造技术名。
- 测试路径识别仍是启发式：`Contest.m`/`Manifest.mm` 等大小写不符的文件
  不会误判；目录名（`Tests/`）沿用既有规则。

## 验证

- `LANG=en npm test`：763/763
- `LANG=zh_CN.UTF-8 npm test`：763/763
- `npm run coverage:check`：行 98.05%、分支 87.91%、函数 95.87%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
