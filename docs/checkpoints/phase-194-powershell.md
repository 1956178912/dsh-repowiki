# 检查点：PowerShell 支持（phase-194）

- 日期：2026-11-28
- 合入版本：v0.218.0
- 目标：DevOps/Windows 仓库大量逻辑位于 `.ps1`/`.psm1` 脚本与模块中，
  此前这些文件完全不进索引。补上后函数、类与模块引用可检索，dot-source
  与 `Import-Module` 形成文件级依赖边。
- 状态：代码、测试、双语文档、兼容矩阵、覆盖率报告与检查点更新；全量
  门禁通过。

## 交付

- `src/schema.js`：`ps1`/`psm1` → `powershell`。
- `src/prompts.js`：`fenceLang('powershell')` → `powershell`。
- `client.js`：`LANGUAGE_LABELS` 增加 `PowerShell`。
- `src/symbols.js`：
  - `powershellScan`：返回 `{code, masked}` 双视图——`masked` 屏蔽
    `#` 行注释、`<# … #>` 块注释、单/双引号字符串与 `@'…'@`/`@"…"@`
    here-string；`code` 保留字符串原文供依赖提取读路径；
  - `extractPowershell`：顶层 `function`/`filter`/`workflow`/
    `configuration`（`Verb-Noun` 名称、四种作用域前缀、`private:`
    非导出）与 `class`/`enum`；类内第一层方法（含构造器）带 `parent`，
    `hidden` 非导出，属性声明与关键字调用不登记。
- `src/deps.js`：`extractPowershellImports` 提取 `using module`、
  `Import-Module`（含 `-Name`）与 dot-source；纯模块名不建边。
- `src/indexer.js`：`resolvePowershellModule` 反斜杠归一后相对引用脚本
  解析，尝试原路径、`.ps1`/`.psm1`/`.psd1` 与 `Foo/Foo.psm1` 模块目录
  形式；越出项目返回 null。
- 测试：
  - `test/symbols.test.js`：函数/filter/类/方法/构造器、作用域可见性、
    `hidden`、注释/here-string 屏蔽与字符串内花括号；
  - `test/deps.test.js`：三种引用形式、纯模块名与注释/字符串过滤；
  - `test/indexer.test.js`：`using module`/`Import-Module`/dot-source/
    模块目录形式解析到 5 个索引文件的 4 条边。

## 语义边界

- 轻量行级解析：只登记顶层定义与类内第一层成员；方法体内嵌套函数、
  scriptblock 内定义不登记。
- 属性（`[string]$Name`）不产符号；`hidden` 是成员唯一可见性证据。
- 多行 `param(...)` 与方法头按首行登记范围起点。
- `.psd1` 仅作为路径候选，不参与符号提取；指向它的 imports 若没有
  显式索引的脚本可命中则不建边。

## 验证

- `LANG=en npm test`：638/638
- `LANG=zh_CN.UTF-8 npm test`：638/638
- `npm run coverage:check`：行 98.02–98.04%、分支约 87.6–87.8%、函数 95.76%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
