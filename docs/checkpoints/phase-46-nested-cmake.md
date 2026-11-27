# 检查点：嵌套 CMake 子项目 v0.71.0（phase-46）

- 日期：2026-11-27
- 目标：v0.70.0 只读取根 `CMakeLists.txt`，monorepo/`plugins/` 布局下
  大量子项目的依赖完全不可见。本轮把嵌套清单纳入技术栈聚合。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/indexer.js`：
  - `isConfigManifest`：在 JS 配置之外识别任意层级 `CMakeLists.txt`；
  - 遍历收集嵌套清单，读取上限 `MAX_CMAKE_MANIFESTS = 50`（根清单不受
    限制），防止 fixture 型仓库用清单吃掉索引预算。
- `src/stack.js`：
  - CMake 分支匹配根清单与 `*/CMakeLists.txt`；
  - `dependencyCounts.cmake` 跨清单累加（文件内仍先去重）；
  - 技术条目带各自 `source`，末尾按 `ecosystem:name` 统一去重；
  - 项目名只从根清单读取，结果不随遍历顺序漂移。
- 测试：
  - `test/stack.test.js`：子项目清单先出现时根项目名仍胜出；计数累加
    为 3；`fmt` 跨清单去重；`Qt` 来源指向子项目清单；
  - `test/indexer.test.js`：C/C++ 夹具加入 `plugins/extra/CMakeLists.txt`，
    断言合并计数、来源可追溯。
- 文档：两份 CHANGELOG、README 双语（stage/路线图）、`docs/coverage.md`。

## 验证（本地全量）

- `npm test`：334/334 通过。
- `npm run coverage:check`：行 97.88%、分支 87.21%、函数 94.56%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 计数按"清单内去重 + 跨清单累加"：同一子项目重复 `find_package(fmt)`
  不应放大，但两个子项目各自依赖 fmt 是真实的两处依赖。
- 项目名只认根清单：子项目 `project()` 名字通常是插件/库名，用它覆盖
  仓库名会产生误导；只读根清单也消除了遍历顺序依赖。
- 嵌套上限 50：单仓数百个 CMake 清单极罕见；上限保证读取成本可预期，
  且不影响根清单与常见 monorepo。
- 不解析 `add_subdirectory`/`target_link_libraries`：前者只影响文件
  归属，后者多为 target 名；依赖信号以 `find_package` 为准，避免猜测。

## 遗留 / 下一步

- 多行 Scala 参数子句。
- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- 提交/推送与版本 tag 由用户确认后执行。
