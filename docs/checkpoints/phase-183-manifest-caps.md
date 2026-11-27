# 检查点：嵌套清单读取上限（phase-183）

- 日期：2026-11-28
- 合入版本：v0.207.0
- 目标：多数清单（mix/gleam/zig/composer/go.mod/opam/cabal/cargo）已有
  嵌套读取上限，但 `pubspec.yaml` 与 `dune-project` 此前无上限。异常或
  恶意目录树可能强迫索引读取大量清单，形成资源消耗面。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；全量门禁通过。

## 交付

- `src/indexer.js`：
  - `MAX_PUBSPEC_MANIFESTS = 30`（Dart/Flutter 多包仓库，`package:`
  名称映射需要子包清单）；
  - `MAX_DUNE_PROJECTS = 20`（OCaml monorepo 子包）；
  - `selectedManifests` 增加两类嵌套清单的计数与跳过逻辑；根清单
    （`MANIFEST_FILES` 命中）不受上限影响，选择顺序仍是遍历顺序，
    结果保持确定性。
- 测试：`test/indexer.test.js` 构造 35 个 Dart 包与 25 个 OCaml 子项目，
  通过计数 `readText` 的 fake fs 断言两类清单读取都不超过上限，同时
  35 个 Dart 源文件仍全部索引。

## 语义边界

- 上限只作用于嵌套清单；根 `pubspec.yaml`/`dune-project` 总是读取。
- 超限清单对应的包/项目元数据不参与映射（依赖计数与包名解析可能少计，
  属于有意的资源保护）。
- 上限值是常量，不做配置化（与既有清单上限一致）。

## 验证

- `LANG=en npm test`：612/612
- `LANG=zh_CN.UTF-8 npm test`：612/612
- `npm run coverage:check`：行 98.09%、分支 87.28%、函数 95.67%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
