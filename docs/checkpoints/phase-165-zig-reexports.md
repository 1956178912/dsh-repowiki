# 检查点：Zig 公开再导出符号（phase-165）

- 日期：2026-11-28
- 合入版本：v0.189.0
- 目标：v0.183 把 `const std = @import("std")` 这类模块别名整体排除在符号
  表外，避免每个文件都出现 `std`。但 `pub const http = @import("http.zig")`
  是模块门面的公开再导出，被一并跳过：符号检索找不到门面别名，符号级
  影响分析也看不到再导出归属。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/symbols.js`：`extractZig` 的绑定判定区分私有别名与公开再导出：
  `isBinding && exported && /=\s*@import\b/` 时仍登记为 `variable` 符号
  （exported=true，单行范围）；`@cImport` / `@This` 与私有 `@import`
  保持跳过。
- `test/symbols.test.js`：Zig 夹具新增
  `pub const net = @import("net.zig");`，断言 kind `variable`、
  exported、行号，并保留 `std`/`builtin`/`Self` 不存在断言。

## 语义边界

- 只有 `pub` 的 `@import` 绑定登记；`const std = @import("std")` 等私有
  别名仍不进入符号表，逐文件导入噪声保持为零。
- 再导出符号不带 `parent`，kind 为 `variable`（它是模块别名而非函数/类型），
  不影响 `unused-exports`（该审计只看具名入边，再导出文件的入边语义不变）。
- 依赖边仍由 `@import` 提取单独建立；本节只补符号可见性，不改变边数。
- `pub const x = @cImport(...)` 仍然跳过（C 头文件桥接没有本地文件目标）。

## 验证

- `LANG=en node --test --test-name-pattern="Zig" test/symbols.test.js`：通过。
- 全量门禁：`npm test`（双语言 577/577）、`coverage:check`（行 98.14 /
  分支 87.06 / 函数 95.41）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
