# 检查点：Verilog/SystemVerilog 支持（phase-213）

- 日期：2026-11-28
- 合入版本：v0.237.0
- 目标：把硬件描述语言纳入符号索引。Verilog/SystemVerilog 仓库的模块、
  接口、包、类与函数/任务无法被检索，`` `include `` 的头文件关系也不在
  依赖图中；同时 `.v` 与 Coq 共用扩展名，直接按扩展名归类会把证明脚本
  误标成 Verilog。本轮在不引入解析框架的前提下解决这三件事。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/schema.js`：`EXTENSION_LANGS` 增加 `.v`/`.vh` → `verilog`、
  `.sv`/`.svh` → `systemverilog`（第 40/41 种语言）。
- `src/symbols.js`：
  - `verilogScan`（导出）：`//`、`/* */` 与字符串双视图屏蔽，保留行数；
  - `extractVerilog`：
    - `module`/`macromodule`、`interface`、`interface class`/`virtual class`、
      `package`、`program`、`class` 为容器，按对应 `end*` 关键字收尾；
    - `function`/`task`：修饰符（`automatic`/`static`/`virtual`/`local`/
      `protected`）、类外 `C::f` 限定名（method + `parent`）、
      `extern`/`pure virtual` 原型只占声明头；class/interface 内为 method，
      module/package 内为 function；
    - `typedef`：enum/struct/union 体跨行，别名取最后一个标识符；
    - 容器内 `parameter`/`localparam` 按 `name =` 提取（`parameter type`
      为 type，`localparam` 非导出），`` `define `` 宏记为 variable；
    - 声明头跨行与 `#(...)` 参数列表用括号/花括号配平定位终结行，声明头
      内部不再被当作语句解析；`module m; endmodule` 这类单行块可识别；
    - `define 续行（反斜杠结尾）整段跳过；
    - 未闭合块保守延伸到文件尾。
- `src/deps.js`：`extractVerilogImports` 提取 `` `include "…" ``（kind
  `require`，引号形式 relative）与 `import pkg::*;`/`import pkg::sym;`
  （kind `import`，带具名符号）；注释/字符串里的伪引用被屏蔽。
- `src/indexer.js`：
  - `buildVerilogRoots`：任意层级 `include`/`inc`/`src`/`rtl`/`hdl` 根 +
    项目根（深度、字典序排序）；
  - `resolveVerilogInclude`：引号形式先查引用方目录，尖括号形式跳过；
  - `buildVerilogUnits`：容器名 → 声明文件（同名取字典序最小），
    `resolveVerilogUnit` 解析 `import`；
  - `isCoqSource`：含 Coq 声明且无 HDL 结构标记的 `.v` 归类为 `coq`
    （不提取符号）；增量复用要求 `cached.lang` 与新语言一致。
- `src/prompts.js` / `client.js`：新增围栏语言与面板标签
  （Verilog/SystemVerilog，另加 Coq 展示名）。
- 测试：
  - `test/symbols.test.js` 追加 3 例：package/typedef/parameter/function/
    task 范围；class/interface 原型与类外定义；注释/字符串/宏续行屏蔽与
    未闭合块；
  - `test/deps.test.js` 追加 1 例：include（引号/尖括号）与 import
    （通配/具名）提取；
  - `test/indexer.test.js` 追加 1 例：include 根、包名映射与 `.v` 的 Coq
    内容识别。
- 文档：README 双语（阶段行、索引工具行、语言清单、架构说明、版本列表）、
  CHANGELOG 双语、`docs/compatibility.md`（语言矩阵 + 已知限制）、
  `docs/coverage.md`。

## 语义边界

- 模块头部的 `#(...)` parameter 不登记（只登记容器体内的语句级声明）；
- `generate`/`begin : label` 等控制块不产生符号，也不影响 `end*` 配对；
- 条件编译（`` `ifdef ``）不求值，两个分支的声明都会进入索引；
- `import pkg::*` 经 package/module/interface/class 容器名共用映射解析，
  同名冲突取字典序最小文件（模块名不会被 import 语法引用）；
- Coq 识别是内容启发式：无法判断时保持 Verilog（扩展名主语义），
  `coq` 文件只参与语言分布与文件检索，不提取符号。

## 验证

- `LANG=en npm test`：753/753
- `LANG=zh_CN.UTF-8 npm test`：753/753
- `npm run coverage:check`：行 98.07%、分支 87.93%、函数 95.8%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`npm run verify:arch`、`git diff --check`：通过
