# 检查点：Zig monorepo 清单（phase-164）

- 日期：2026-11-28
- 合入版本：v0.188.0
- 目标：v0.183 的 Zig 支持只读取根 `build.zig.zon`，monorepo 子包的
  `build.zig.zon` 不进入依赖统计；与 Gleam/Elixir 的 monorepo 口径不一致。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/indexer.js`：`isConfigManifest` 纳入 `build.zig.zon`；新增
  `MAX_ZIG_MANIFESTS = 20`，嵌套清单在选定阶段按遍历顺序受上限约束
  （根清单不受限），读取仍走既有 8 路有界并发。
- `src/stack.js`：`build.zig.zon` 分支支持 `apps/*/build.zig.zon`：
  依赖计数累加；项目名/版本只取根清单；zon 依赖键是用户自定义别名，
  刻意不做技术名映射（避免把别名当框架）。
- 测试：
  - `stack.test.js`：monorepo 子包依赖累加、根元数据优先、`technologies`
    为空（不臆造技术名）；
  - `indexer.test.js`：`apps/tool/build.zig.zon` 端到端（语言分布、
    依赖计数、根项目名/版本不受子包影响）。

## 语义边界

- 嵌套清单只贡献 `dependencyCounts.zig`，不改变模块解析：Zig 的
  `@import` 仍相对引用文件，子包源文件由遍历自然进入索引。
- zon 的 `.dependencies` 键由用户在 `build.zig.zon` 中自定义，可能取任意
  别名，因此只计数、不映射技术展示名；技术栈列表保持为空而不是猜测。
- 嵌套上限按遍历顺序截断（与 CMake/Go/mix/composer 一致），超出部分
  不读取，输出仍确定。
- 根 `build.zig.zon` 的项目名/版本优先于子包，避免子包名覆盖仓库名。

## 验证

- `LANG=en node --test --test-name-pattern="Zig" test/symbols.test.js test/deps.test.js test/stack.test.js test/indexer.test.js`：
  4 例通过。
- 全量门禁：`npm test`（双语言 577/577）、`coverage:check`（行 98.16 /
  分支 87.11 / 函数 95.41）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
