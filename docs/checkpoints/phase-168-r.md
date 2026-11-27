# 检查点：R 支持（phase-168）

- 日期：2026-11-28
- 合入版本：v0.192.0
- 目标：R 在统计分析、生物信息与科研仓库中广泛使用。项目此前完全不索引
  `.R` 文件：函数与 S4/R6 类无法检索，`source()` 不形成依赖边，
  `DESCRIPTION` 的包元数据与依赖也不进入技术栈。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/symbols.js`：
  - `rCodeLines`：去 `#` 注释并把字符串内容替换为空格（R 字符串不跨行）；
  - `rBraceDelta` / `rBlockEnd`：花括号块配平；
  - `rFunctionEnd`：先定位参数列表闭合 `)`（上限 50 行），再看同行/下一
    非空行是否有 `{`；无块体的表达式体返回 `)` 所在行；
  - `rParenEnd`：`setClass`/`R6Class` 调用的圆括号范围；
  - `extractR`：`name <- function(...)`/`name = function(...)`（含 `<<-`）、
    `setClass("Name", …)`/`R6Class("Name", …)` 类；类调用内部跳过（R6
    方法不误判为顶层函数），函数体内嵌套函数不登记，`.` 前缀非导出。
- `src/deps.js`：`rScan`（code/masked 双视图）与 `extractRImports` 提取
  `source("path")`/`sys.source("path")`（支持 `file =`），动态参数跳过；
  `library()` 不提取。
- `src/indexer.js`：`resolveRSpecifier` 先按文件目录、再按项目根解析，
  尝试原路径与 `.R`/`.r`。
- `src/schema.js`：`R`/`r → r`、`bats → shell`、`DESCRIPTION` 清单；
  `src/prompts.js` 围栏 `r`；`client.js` 展示名 `R`。
- `src/stack.js`：`dcfFields`（DCF 续行）与 `rDescriptionInfo`
  （Package/Version/Depends/Imports/Suggests/LinkingTo，剔除 `R` 与版本
  约束、去重）与 `R_TECH`（ggplot2/dplyr/Shiny/Rcpp 等）。
- 测试：
  - `symbols.test.js`：四种函数范围形态、`.` 私有、S4/R6 类、R6 方法
    排除、注释/字符串屏蔽、普通赋值不登记；
  - `deps.test.js`：`source` 引号/`file =`、动态参数、注释与字符串内伪引用、
    `library()` 不提取；
  - `stack.test.js`：DCF 续行、依赖去重与 `R` 剔除、技术映射；
  - `indexer.test.js`：项目根与 `../` 解析、`DESCRIPTION` 元数据、函数符号。

## 语义边界

- R 没有导出关键字；`.` 前缀按社区约定视为私有，其余 `exported: true`。
  `NAMESPACE` 的 `export()` 不读取（不在源码内，避免额外清单解析）。
- 普通赋值不登记：R 脚本顶层常量多，登记会淹没符号表；函数与类是
  检索/影响面的主要锚点。
- R6/S4 只登记类名，类方法不登记（类调用体用圆括号范围跳过）。
- `source()` 的运行时基准是当前工作目录；采用“文件目录优先、项目根兜底”
  的确定性启发式。
- `DESCRIPTION` 只读根清单；R 包通常单包，嵌套包不聚合。
- `.bats` 文件按 Shell 语法索引，`isTestPath` 的 `*_test.bats`/`test/`
  规则可路由为受影响测试。

## 验证

- `LANG=en node --test --test-name-pattern="R：|DESCRIPTION" test/symbols.test.js test/deps.test.js test/stack.test.js test/indexer.test.js`：
  4 例通过。
- 全量门禁：`npm test`（双语言 584/584）、`coverage:check`（行 98.13 /
  分支 87.02 / 函数 95.48）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
