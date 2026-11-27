# 检查点：跨语言测试路径约定（phase-187）

- 日期：2026-11-28
- 合入版本：v0.211.0
- 目标：受影响测试路由的路径启发式已覆盖 JS/TS、Python/Go/Ruby、
  JVM/C#/Swift 与 Elixir/Dart 等命名，但 Erlang common_test
  (`*_SUITE.erl`)、eunit (`*_tests.erl`)、R testthat (`test-*.R`) 与
  Julia `runtests.jl` 不在规则内，跨语言影响面会漏报测试。
- 状态：代码、测试、双语文档、覆盖率与检查点更新；全量门禁通过。

## 交付

- `src/test-files.js`：`isTestPath` 新增三条规则：
  - `_(SUITE|tests)\.erl$`（大小写不敏感）；
  - `^test-.+\.[Rr]$`（testthat 命名，两种大小写）；
  - `^runtests\.jl$`（Julia 根级测试入口）。
  文档注释同步列出新约定。
- 测试：`test/test-files.test.js` 的命中列表加入三种新约定，负例加入
  `suite.erl`、`api.R`、`core.jl` 防止过宽匹配。

## 语义边界

- 仍为纯路径启发式，不读文件内容、不做构建系统推断。
- `_SUITE.erl` 只认下划线后缀（`foo_SUITE.erl`），不会匹配 `suite.erl`。
- `runtests.jl` 只认文件名（任意目录，含根级）。

## 验证

- `LANG=en npm test`：619/619
- `LANG=zh_CN.UTF-8 npm test`：619/619
- `npm run coverage:check`：行 98.11%、分支 87.62%、函数 95.72%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
