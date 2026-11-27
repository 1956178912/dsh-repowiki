# 检查点：Object Pascal 支持（phase-197）

- 日期：2026-11-28
- 合入版本：v0.221.0
- 目标：Delphi/Lazarus 在工业软件、桌面工具与教育仓库中仍有大量存量
  代码，此前 `.pas`/`.dpr` 完全不进索引。补上后单元、类、方法与属性可
  检索，`uses` 形成单元级依赖边。
- 状态：代码、测试、双语文档、兼容矩阵、覆盖率报告与检查点更新；全量
  门禁通过。

## 交付

- `src/schema.js`：`pas`/`pp`/`dpr`/`dpk`/`lpr` → `pascal`。
- `src/prompts.js`：`fenceLang('pascal')` → `pascal`。
- `client.js`：`LANGUAGE_LABELS` 增加 `Pascal`。
- `src/symbols.js`：
  - `pascalScan`：双视图——`masked` 屏蔽 `//`、`{ … }`（含 `{$…}`）与
    `(* … *)` 注释及单引号字符串；`code` 保留字符串原文供 `in 'path'`；
  - `pascalTypeEnd`：`class`/`record`/`object`/`interface` ↔ `end` 配平，
    排除 `class function`/`class procedure`/`class var`/`class of`；
  - `pascalRoutineEnd`：声明后无 body 时止于声明行，实现体按
    `begin`/`case`/`try`/`asm` ↔ `end` 配平；
  - `extractPascal`：unit/program/library、类型声明、例程与 property。
- `src/deps.js`：`extractPascalImports` 解析跨行 `uses` 列表与
  `Unit in 'path.pas'`。
- `src/indexer.js`：`buildPascalUnits`（按文件名主干、小写键）与
  `resolvePascalUnit`（路径形式先项目根再脚本目录，补 `.pas`/`.pp`/
  `.lpr`；纯单元名查映射）。
- `src/test-files.js`：`*Test.pas`/`*Tests.pas`/`*Spec.pas` 等识别为测试。
- 测试：
  - `test/symbols.test.js`：unit/class/interface/record/property、
    声明与实现范围；
  - `test/deps.test.js`：跨行 uses 与 in 路径；
  - `test/indexer.test.js`：单元名映射与显式路径解析；
  - `test/test-files.test.js`：Pascal 测试路径。

## 语义边界

- `type` 段只识别 `Name = class/interface/record/object` 形式。
- `{$IFDEF}` 两个分支都会解析；`{$I file.inc}` 不建边。
- 方法体按 begin/case/try/asm 配平，匿名方法与变体记录可能使范围偏长。
- `class of` 元类按单行 class 登记。

## 验证

- `LANG=en npm test`：647/647
- `LANG=zh_CN.UTF-8 npm test`：647/647
- `npm run coverage:check`：行 97.99%、分支约 87.5%、函数 95.75%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
