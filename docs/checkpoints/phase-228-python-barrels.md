# 检查点：Python 包 barrel（phase-228）

- 日期：2026-11-28
- 合入版本：v0.252.0
- 目标：v0.250–v0.251 的再导出链只识别 JS/TS `export-from`；Python
  项目常见的 `pkg/__init__.py` 再导出（`from .core import parse`、
  `from .core import *`）仍让 `from pkg import parse` 只指向
  `__init__.py`。同时 Python 提取器把模块级符号统一标为
  `exported: false`，`from x import *` 被丢弃，barrel 解析无从下手。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/deps.js`：Python `from x import *` 保留 `*`；行尾注释从符号
  列表剔除，`as` 别名仍归一为原名。
- `src/schema.js`：`INDEX_PARSER_VERSION = 10`，旧导入缓存（Python 星号
  被丢弃）整体失效。
- `src/reexports.js`：
  - `buildReexportMaps(edges, files)` 识别 `lang: 'python'` 文件的具名
    from-import（作为同名再导出）与星号再导出；
  - `exportedNamesByFile` 对 Python 按"非 method"纳入模块级符号，
    其他语言仍要求 `exported !== false`。
- `src/references.js` / `src/usages.js` / `src/impact.js`：调用方已在
  v0.250/v0.251 传入 `index.files`，本轮自动获得 Python barrel 能力。
- 测试：
  - `test/deps.test.js`：`from .core import *` 与行尾注释；
  - `test/references.test.js`：Python 具名与星号 barrel；
  - `test/usages.test.js`：Python 包 `__init__` 导入方；
  - `test/tools.test.js`：真实索引的 Python 包引用/使用点。
- 文档：README 双语（阶段行、Python barrel 条目）、CHANGELOG 双语、
  `docs/coverage.md`、`docs/compatibility.md`。

## 语义边界

- Python `__all__` 未解析：星号导出的潜在引用可能包含非公开名，具体
  使用由词法扫描确认。
- 仅处理具名与星号 from-import；`import pkg.mod`（无符号）不构成再
  导出，相对/绝对路径解析仍由 indexer 负责。
- `as` 别名仍保守漏报（deps 记录原名）；方法（kind method）不作为
  模块级可导入符号。
- 旧索引需重建后才能获得 Python 星号与 barrel 信息（parser v10 会让
  status 提示重解析）。

## 验证

- `LANG=en npm test`：789/789
- `LANG=zh_CN.UTF-8 npm test`：789/789
- `npm run coverage:check`：行 98.11%、分支 87.87%、函数 95.63%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
