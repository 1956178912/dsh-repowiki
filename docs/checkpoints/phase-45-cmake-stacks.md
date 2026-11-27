# 检查点：CMake 技术栈识别 v0.70.0（phase-45）

- 日期：2026-11-27
- 目标：C/C++ 仓库进入索引后，技术栈仍为空（只有语言分布）。CMake 是
  C/C++ 生态的事实标准构建系统，`project()` 与 `find_package()` 能提供
  可靠的项目名与依赖信号。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/schema.js`：`MANIFEST_FILES` 增 `CMakeLists.txt`（根级清单）。
- `src/stack.js`：
  - `CMAKE_TECH`：23 个包名 → 21 种技术（Qt6/Qt5→Qt、GTest/GoogleTest→
    GoogleTest、Boost、OpenCV、Eigen3、fmt、spdlog、protobuf、gRPC、
    Vulkan、SDL2、SFML、glfw3、Catch2、nlohmann_json、OpenSSL、ZLIB、
    SQLite3、CURL、LibXml2、CUDA）；
  - `cmakePackages`：大小写不敏感匹配 `find_package(<Name>)`，去重并保持
    出现顺序；
  - `cmakeProjectName`：`project(<Name>)`；
  - `detectStack`：写入 `dependencyCounts.cmake`、项目名与技术列表
    （ecosystem `cmake`）；未知包只计数。
- 测试：
  - `test/stack.test.js`：project 名、大小写混合、重复 find_package 去重、
    未知包不映射、来源字段；
  - `test/indexer.test.js`：C/C++ 夹具加入 `CMakeLists.txt`，断言项目名
    与 `fmt` 技术来自 cmake。
- 文档：两份 CHANGELOG、README 双语（stage/能力表/架构/文件树）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：333/333 通过。
- `npm run coverage:check`：行 97.8%、分支 86.98%、函数 94.55%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 只读根级 `CMakeLists.txt`：与既有清单（package.json/go.mod 等）一致；
  嵌套子项目的清单留给后续（需要多清单合并策略，当前会产生同名项目名
  竞争）。
- 只映射名称稳定的主流包：`find_package` 的包名空间没有统一命名规范，
  未知包强行映射会制造错误结论；计数仍然保留。
- 不解析 `target_link_libraries` 与 `FetchContent`：前者多为目标名而非
  依赖名，后者是源码内嵌，语义与版本差异大，先不做。

## 遗留 / 下一步

- 多行 Scala 参数子句。
- C/C++ 嵌套 CMake 子项目技术栈合并。
- 提交/推送与版本 tag 由用户确认后执行。
