# 检查点：Gleam monorepo 与跨行导入（phase-163）

- 日期：2026-11-28
- 合入版本：v0.187.0
- 目标：v0.185 的 Gleam 支持只读取根 `gleam.toml`，monorepo 子包依赖
  不进入技术栈；未限定导入被格式化到多行时，`imported` 符号名单缺失，
  削弱符号级影响证据。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/deps.js`：`extractGleamImports` 在首行含 `.{` 且未闭合时，拼接
  后续行到闭合 `}`（上限 50 行）后再解析；起始行号保持不变，后续行不以
  `import` 开头不会被重复匹配。
- `src/indexer.js`：`isConfigManifest` 纳入 `gleam.toml`；新增
  `MAX_GLEAM_MANIFESTS = 20`，嵌套清单在选定阶段按遍历顺序受上限约束
  （根清单不受限），读取仍走既有 8 路有界并发。
- `src/stack.js`：`gleam.toml` 分支支持 `apps/*/gleam.toml`：依赖计数
  累加、技术栈逐条记录来源；项目名/版本只取根清单。
- 测试：
  - `deps.test.js`：跨行 `.{ ... }` 导入拼接、起始行号与符号去重；
  - `stack.test.js`：monorepo 子包依赖累加、根项目名优先、子包技术来源；
  - `indexer.test.js`：`apps/web/gleam.toml` 端到端（语言分布、依赖计数、
    根清单技术来源、子包技术来源）。

## 语义边界

- 嵌套清单只聚合依赖计数与技术栈，不改变模块解析：Gleam 模块仍按
  `src/`/`test/` 源根映射，子包源根由 `buildGleamRoots` 自动发现。
- 跨行导入拼接上限 50 行；超出后只解析已拼接部分（语法正常时不会触发）。
- 根 `gleam.toml` 的项目名/版本优先于任何子包，避免 monorepo 子包名覆盖
  仓库名。
- 技术栈去重仍按 `ecosystem:name`；同名依赖在不同子包出现时保留首个
  来源（根清单在前，遍历顺序确定）。

## 验证

- `LANG=en node --test --test-name-pattern="Gleam" test/symbols.test.js test/deps.test.js test/stack.test.js test/indexer.test.js`：
  5 例通过。
- 全量门禁：`npm test`（双语言 576/576）、`coverage:check`（行 98.16 /
  分支 87.09 / 函数 95.41）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
