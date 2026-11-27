# 检查点：Nim 支持（phase-175）

- 日期：2026-11-28
- 合入版本：v0.199.0
- 目标：Nim 在系统工具、Web 服务与区块链客户端中有稳定使用。项目此前
  完全不索引 `.nim` 文件：例程与类型无法检索，`import` 不形成依赖边，
  `.nimble` 清单的包元数据也不进入技术栈。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/symbols.js`：
  - `nimScan`（导出）：`#` 行注释、可嵌套 `#[ … ]#` 块注释、字符串
    （`"`、跨行 `"""`）屏蔽，返回 code/masked 双视图；
  - `nimIndentOf`：缩进宽度（Tab=4）；
  - `nimBlockEnd`：缩进块（类型体）结束行；
  - `nimProcEnd`：先按括号定位多行签名结束，再按缩进找体结束；
  - `extractNim`：`proc`/`func`/`method`/`iterator`/`template`/`macro`/
    `converter`、`type Name = …`、顶层 `const`/`let`/`var`；`*` 后缀为
    导出；只识别缩进 0 的声明，缩进体整体跳过。
- `src/deps.js`：`extractNimImports` 提取 `import`/`from … import`/
  `include`/`export`，支持逗号多模块、引号路径与 `except`/`as` 子句。
- `src/indexer.js`：`buildNimRoots`（每个 `src/` 目录 + 项目根）与
  `resolveNimSpecifier`（先引用文件目录，再源根/项目根；`std/` 不建边）；
  `.nimble` 清单纳入 `isConfigManifest`，嵌套/任意文件名受
  `MAX_NIMBLE_MANIFESTS = 10` 限制。
- `src/schema.js`：`nim`/`nims → nim`；`src/prompts.js` 围栏 `nim`；
  `client.js` 展示名 `Nim`。
- `src/stack.js`：`nimbleInfo`（文件名项目名、version、`requires` 去重并
  剔除 `nim`）与 `NIM_TECH`（Jester/Karax/Chronicles/Chronos 等）。
- 测试：
  - `symbols.test.js`：例程形态、`*` 导出、缩进范围、多行签名、注释/
    块注释/字符串屏蔽、嵌套例程排除；
  - `deps.test.js`：import/from/include/export、相对路径、字符串内伪引用；
  - `stack.test.js`：`.nimble` 版本/依赖过滤/技术映射；
  - `indexer.test.js`：`src/` 根、相对 `../` 解析、`std/os` 不建边、
    `.nimble` 元数据。

## 语义边界

- 只识别缩进 0 的声明（Nim 文件即模块）；`type` 块（单独 `type` 行 +
  缩进成员）的成员不登记，文档注明。
- 多行签名按括号定位，函数体按缩进结束；`when isMainModule` 等缩进块
  内的定义不登记。
- `*` 后缀是唯一导出证据；没有 `*` 的例程/变量视为模块内部。
- `import` 非相对路径先按引用文件目录、再 `src/` 根/项目根解析；`std/`
  前缀直接视为标准库，不建边。
- `.nimble` 的 `requires` 只识别单行；项目名取文件名（去 `.nimble`），
  版本取 `version = "…"`。

## 验证

- `LANG=en node --test --test-name-pattern="Nim|nimble" test/symbols.test.js test/deps.test.js test/stack.test.js test/indexer.test.js`：
  4 例通过。
- 全量门禁：`npm test`（双语言 597/597）、`coverage:check`（行 98.09 /
  分支 87.15 / 函数 95.49）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
