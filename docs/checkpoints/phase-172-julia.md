# 检查点：Julia 支持（phase-172）

- 日期：2026-11-28
- 合入版本：v0.196.0
- 目标：Julia 在数值计算、科学机器学习与科研工程中使用广泛。项目此前
  完全不索引 `.jl` 文件：模块/结构体/函数无法检索，`include` 不形成
  依赖边，`Project.toml` 的包元数据也不进入技术栈。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/symbols.js`：
  - `juliaScan`（导出）：`#` 行注释、可嵌套 `#= … =#` 块注释、跨行
    `"` 与三引号 `"""` 字符串屏蔽；返回 code/masked 双视图（依赖提取
    读路径用 code）；
  - `juliaBlockDelta`：行首 `struct`/`mutable struct`/`module`/`baremodule`/
    `macro`/`if`/`for`/`while` 与行内 `function`/`begin`/`let`/`try`/`quote`/
    `do` 开块；`abstract`/`primitive type` 整行不计；`end` 只在行首/空白/
    分号后计数（`a[end]`/`x.end` 不计）；
  - `juliaBlockEnd`：块声明结束行；
  - `juliaExports`：收集 `export` 名称（逗号分隔、支持续行）与是否含
    `module`；
  - `extractJulia`：module、struct、abstract/primitive type、function
    （`Type.method` → method + parent）、短函数、macro、顶层 const；
    function/struct/macro 体整体跳过（嵌套定义不浮出），module 内部继续
    扫描；含 module 的文件按 export 标记可见性，无 module 的脚本全部可见。
- `src/deps.js`：`extractJuliaImports` 提取 `include("path")`，动态参数
  （`$` 插值/`joinpath`）跳过。
- `src/indexer.js`：`resolveJuliaInclude` 相对引用文件解析（缺省补 `.jl`），
  拒绝绝对/越界/反斜杠路径。
- `src/schema.js`：`jl → julia`、`Project.toml` 清单；`src/prompts.js`
  围栏 `julia`；`client.js` 展示名 `Julia`。
- `src/stack.js`：`juliaProjectInfo`（name/version + `[deps]`/`[extras]`
  去重）与 `JULIA_TECH`（DataFrames/Plots/Flux/JuMP 等）。
- 测试：
  - `symbols.test.js`：全部声明形态、块范围、`Type.method` 归属、export
    过滤、注释/块注释/三引号屏蔽、`a[end]`、嵌套定义排除；
  - `deps.test.js`：include 引号路径、动态参数、字符串/块注释内伪引用；
  - `stack.test.js`：Project.toml 包名/版本、deps+extras 去重、技术映射；
  - `indexer.test.js`：同目录与 `../` include 解析、Project.toml 元数据、
    module/function 符号。

## 语义边界

- Julia 的块结构是上下文相关语法，这里用行级启发式：`x = if` 等行内
  控制块不计开块（只影响 `endLine`，不影响符号名）；推导式的 `for` 不
  计块；`a[end]`/`x.end` 不计结束。
- 函数/结构体/宏体整体跳过，嵌套定义不登记；module 内部继续扫描，
  因此模块内函数可见。
- 含 `module` 的文件以 `export` 为权威可见性；无 module 的脚本全部可见。
  多 module 文件不区分作用域（export 名称全局应用），文档已注明。
- `include` 的运行时语义相对当前文件，静态解析即按此实现；动态参数不建边。
- `Project.toml` 只读根清单；Julia 包通常单包，嵌套包不聚合。

## 验证

- `LANG=en node --test --test-name-pattern="Julia|Project.toml" test/symbols.test.js test/deps.test.js test/stack.test.js test/indexer.test.js`：
  4 例通过。
- 全量门禁：`npm test`（双语言 590/590）、`coverage:check`（行 98.14 /
  分支 87.04 / 函数 95.53）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
