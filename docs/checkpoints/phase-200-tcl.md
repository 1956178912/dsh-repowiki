# 检查点：Tcl 支持（phase-200）

- 日期：2026-11-28
- 合入版本：v0.224.0
- 目标：Tcl 在 EDA（Vivado/Quartus/Synopsys）、网络设备与自动化测试中
  大量使用，此前 `.tcl` 完全不进索引。补上后 proc、命名空间与 TclOO 类
  可检索，`source` 形成脚本级依赖边。
- 状态：代码、测试、双语文档、兼容矩阵、覆盖率报告与检查点更新；全量
  门禁通过。

## 交付

- `src/schema.js`：`tcl: 'tcl'`。
- `src/prompts.js`：`fenceLang('tcl')` → `tcl`。
- `client.js`：`LANGUAGE_LABELS` 增加 `Tcl`。
- `src/symbols.js`：
  - `tclScan`：行首 `#` 注释、`; #` 尾注释与双引号字符串屏蔽；
  - `tclBlockEnd`：整行花括号净值配平（proc 参数列表 + body）；
  - `extractTcl`：`namespace eval`/`oo::class create`（class）、
    `proc`（function/method，`::` 前缀命名空间归属）、类内
    `method`/`constructor`/`destructor`。
- `src/deps.js`：`extractTclImports` 提取 `source` 字面量路径。
- `src/indexer.js`：`resolveTclSource` 先项目根再脚本目录，补 `.tcl`。
- 测试：
  - `test/symbols.test.js`：命名空间、TclOO 类、proc 归属、字符串
    花括号屏蔽；
  - `test/deps.test.js`：source 路径与注释/字符串过滤；
  - `test/indexer.test.js`：项目根/脚本目录解析。

## 语义边界

- 只识别行首 `proc`/`namespace eval`/`oo::class create`/`method`；
  动态 proc 名、`{*}` 展开与 `interp alias` 不登记。
- proc body 内嵌套 proc 带外层命名空间作为 `parent`。
- `source` 只识别字面量路径；`$dir`/`[file join]` 拼接不建边。
- 行内 `#` 仅在 `;` 之后视为注释（Tcl 语义）。

## 验证

- `LANG=en npm test`：656/656
- `LANG=zh_CN.UTF-8 npm test`：656/656
- `npm run coverage:check`：行 98.03%、分支约 87.8%、函数 95.8%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
