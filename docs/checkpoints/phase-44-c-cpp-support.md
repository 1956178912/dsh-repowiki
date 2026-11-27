# 检查点：C/C++ 语言支持 v0.69.0（phase-44）

- 日期：2026-11-27
- 目标：把 C/C++ 纳入符号索引与本地依赖边（覆盖 13 种语言）。C/C++ 在
  系统软件、嵌入式与基础库仓库中占比极高，此前完全不可检索。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/schema.js`：`.c/.h` → `c`，`.cc/.cpp/.cxx/.hpp/.hh/.hxx/.ipp` →
  `cpp`。
- `src/symbols.js`：
  - `extractCpp`：两遍扫描——先收集类型块（class/struct/union/enum/
    typedef，含 `typedef struct { … } Name;` 匿名别名），再收集函数；
  - 函数识别要求"返回类型 + 名称"或类内同名构造/析构/类外 `Foo::bar`，
    避免把宏调用、普通调用、控制流误判；
  - `cppTerminator` 跟踪括号深度与字符串，支持多行参数列表并跳过默认
    参数里的花括号；原型以 `;` 结尾为单行符号；
  - 类内方法带 `parent`、类外限定定义按 `Foo::bar` 归属；`static` 标记
    非导出；析构函数名保留 `~`。
- `src/deps.js`：仅提取引号形式 `#include "..."`；尖括号头视为外部。
- `src/indexer.js`：
  - `buildCppRoots`：任意层级 `include`/`src`/`inc` 目录 + 项目根；
  - `resolveCppInclude`：先按引用方文件目录（编译器对引号头的第一搜索
    位），再按候选根命中已索引文件；系统头/仓库外路径不建边。
- `src/prompts.js`：代码围栏补 `c`/`cpp`。
- 测试：
  - `test/symbols.test.js`：类型/枚举/匿名 typedef、构造/析构、多行参数、
    类外定义、静态可见性、控制流不产符号；
  - `test/deps.test.js`：引号 include、尖括号与注释/宏行忽略；
  - `test/indexer.test.js`：同目录相对 include、`include` 根、`../src`
    规范化、系统头零边、语言分布与头文件原型符号。
- 文档：两份 CHANGELOG、README 双语（stage/能力表/架构要点/路线图）、
  `docs/compatibility.md`（C 与 C++ 行 + 已知限制）、`docs/coverage.md`。

## 验证（本地全量）

- `npm test`：332/332 通过。
- `npm run coverage:check`：行 97.82%、分支 86.87%、函数 94.54%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 只在有返回类型或构造/析构上下文时登记函数：C/C++ 行级解析无法区分
  宏调用与声明，宁缺毋滥；原型仍登记（对检索有价值）。
- 尖括号 include 不建边：`<foo.h>` 依赖编译器 `-I` 与系统路径，仓库
  内无法可靠判断；引号形式已覆盖项目内头文件的主流写法。
- 不展开宏与条件编译：`#ifdef` 分支里的符号会被一并收录，但不执行
  预处理器；这是已知限制并写入兼容矩阵。
- 类型块用括号配平推导范围：`findBlockEnd` 与既有语言共享，字符串/
  注释内的括号误差按既有约定处理。

## 遗留 / 下一步

- C/C++ 的 CMake/Makefile 技术栈识别（当前仅语言分布）。
- 多行 Scala 参数子句。
- 提交/推送与版本 tag 由用户确认后执行。
