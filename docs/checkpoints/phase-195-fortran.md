# 检查点：Fortran 支持（phase-195）

- 日期：2026-11-28
- 合入版本：v0.219.0
- 目标：科学计算/HPC/气象/CFD 仓库大量逻辑在 Fortran 中，此前完全不在
  索引覆盖内。补上后模块、过程、派生类型可检索，`use` 形成模块级依赖边。
- 状态：代码、测试、双语文档、兼容矩阵、覆盖率报告与检查点更新；全量
  门禁通过。

## 交付

- `src/schema.js`：`f`/`for`/`f77`/`f90`/`f95`/`f03`/`f08` 及其大写
  预处理变体 → `fortran`。
- `src/prompts.js`：`fenceLang('fortran')` → `fortran`。
- `client.js`：`LANGUAGE_LABELS` 增加 `Fortran`。
- `src/symbols.js`：
  - `fortranScan`：`!` 行注释截断、单/双引号字符串（双写转义）屏蔽；
  - `extractFortran`：模块/程序/子程序/函数（类型前缀与修饰）、派生
    类型、具名 interface；`end`/`end <unit>` 配平，`end do`/`end if` 等
    构造不关闭单元；模块内过程带 `parent`。
- `src/deps.js`：`extractFortranImports` 提取 `use`（含 `::`、`only:`、
  `non_intrinsic`），`use, intrinsic ::` 跳过。
- `src/indexer.js`：`buildFortranModules` 用 `module` 符号建小写模块名
  映射（模块名与文件名无关，同名取字典序最小）；`resolveFortranUse`
  大小写不敏感匹配，外部模块返回 null。
- 测试：
  - `test/symbols.test.js`：单元/过程/派生类型/interface、`end` 配平、
    注释、`module procedure` 与 `type(...)` 变量排除；
  - `test/deps.test.js`：`use` 四种形态与 intrinsic 过滤；
  - `test/indexer.test.js`：模块名与文件名不一致、大小写不敏感解析；
  - `test/prompts.test.js`：未知语言围栏改用真正未注册扩展名，Fortran
    围栏加入正向断言。

## 语义边界

- 固定格式列首 `C`/`*` 注释不识别（避免把 `C = 1` 赋值误判）。
- `include`/`#include` 不建边；`private`/`public` 语句不改变 `exported`。
- `submodule`/`block data` 不登记；单行程序单元按首行登记范围起点。

## 验证

- `LANG=en npm test`：641/641
- `LANG=zh_CN.UTF-8 npm test`：641/641
- `npm run coverage:check`：行 98.04%、分支约 87.8%、函数 95.78%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
