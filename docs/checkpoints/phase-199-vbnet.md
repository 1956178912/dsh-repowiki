# 检查点：Visual Basic .NET 支持（phase-199）

- 日期：2026-11-28
- 合入版本：v0.223.0
- 目标：VB.NET 在遗留企业应用与 .NET Framework 迁移仓库中仍有大量
  存量代码，此前 `.vb` 完全不进索引。补上后命名空间、类与成员可检索，
  `Imports`/`Inherits` 形成类型级依赖边。
- 状态：代码、测试、双语文档、兼容矩阵、覆盖率报告与检查点更新；全量
  门禁通过。

## 交付

- `src/schema.js`：`vb` → `vbnet`。
- `src/prompts.js`：`fenceLang('vbnet')` → `vbnet`。
- `client.js`：`LANGUAGE_LABELS` 增加 `Visual Basic .NET`。
- `src/symbols.js`：
  - `vbnetScan`：`'` 行注释、`REM` 行与双引号字符串（双写转义）屏蔽；
  - `vbnetTypeEnd`：类型声明与 `End <type>` 配平；
  - `vbnetRoutineEnd`：`End <keyword>` 配对，接口/`MustOverride` 等
    无 body 声明靠"下一个声明"提前结束；
  - `extractVbnet`：Namespace/Class/Module/Structure/Interface/Enum 与
    Sub/Function/Property/Event（构造器 `Sub New`；Property 覆盖
    Get/Set 体）；`Private`/`Friend`/`Protected` 非导出。
- `src/deps.js`：`extractVbnetImports` 提取 `Imports`（含别名）与
  `Inherits`/`Implements`。
- `src/indexer.js`：`dottedPaths.vbnet` 与 dispatch；命名空间后缀匹配。
- 测试：
  - `test/symbols.test.js`：命名空间/类/接口/枚举、构造器、属性块、
    事件、字段与枚举值排除；
  - `test/deps.test.js`：Imports 别名、Inherits/Implements、注释屏蔽；
  - `test/indexer.test.js`：命名空间后缀解析与 Inherits 边。

## 语义边界

- 自动实现属性（无 Get/Set/End Property）按单行处理。
- `Operator` 重载名不是标识符，不登记。
- `Imports` 一行多模块（逗号分隔）只取首个。
- 类型/例程范围按 `End <keyword>` 配对，`End If`/`End While` 等不影响。

## 验证

- `LANG=en npm test`：653/653
- `LANG=zh_CN.UTF-8 npm test`：653/653
- `npm run coverage:check`：行 98.03%、分支约 87.8%、函数 95.78%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
