# 检查点：MATLAB 符号提取（phase-225）

- 日期：2026-11-28
- 合入版本：v0.249.0
- 目标：`.m` 命中 MATLAB 标记后只被归类为 `matlab`，符号表为空——
  MATLAB 项目在检索、影响面与卡片里等于不可见。本轮补齐函数/类/属性
  提取，并让语言接入守卫覆盖按内容识别的 `matlab`。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/symbols.js`：
  - `matlabScan`：`%` 行注释、`%{`…`%}` 块注释、单/双引号字符串屏蔽；
    单引号按前置字符区分转置（`x'`）与字符串；
  - `matlabBlockDelta` / `matlabUnitEnd`：块关键字与 `end` 配平，支持
    紧凑 `if x, y; end`；无 `end` 风格函数在下一个同缩进 `function`
    前收尾；
  - `extractMatlab`：`classdef`（class）、`properties` 成员（variable，
    `(Access=private)` 非导出）、`methods` 内函数（method，私有块非
    导出）、顶层/嵌套函数（嵌套带 `parent` 且非导出）。
- `src/schema.js`：`SYMBOL_LANGUAGES` 追加按内容识别的 `matlab`。
- `src/prompts.js`：`fenceLang('matlab') = 'matlab'`（面板标签已有）。
- 测试：
  - `test/symbols.test.js`：函数/嵌套函数/紧凑 end/注释与块注释/字符串
    屏蔽、classdef 属性与方法归属、私有 properties/methods 块；
  - `test/indexer.test.js`：真实 `.m` 文件产出 `helper` 函数（不再为空）。
- 文档：README 双语（语言计数 43、索引工具行、Matlab 支持条目、
  `src/symbols.js` 注释）、CHANGELOG 双语、`docs/coverage.md`、
  `docs/compatibility.md`。

## 语义边界

- 不解析 MATLAB `import`/`run`/函数调用，因此不产生依赖边；需要时再以
  源码证据单独迭代。
- 属性/方法只识别 `Access=private` 属性块；`SetAccess`、`Abstract` 等
  不改变导出判断。
- 顶层函数一律视为可调用；嵌套函数非导出。首个函数与文件名的对应关系
  不读取（提取器只拿到源码，没有路径）。
- 匿名函数（`@(x) …`）与脚本变量不登记；`enumeration` 块成员暂不登记。

## 验证

- `LANG=en npm test`：775/775
- `LANG=zh_CN.UTF-8 npm test`：775/775
- `npm run coverage:check`：行 98.09%、分支 87.86%、函数 95.59%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
