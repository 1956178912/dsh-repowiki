# 检查点：F# 支持（phase-207）

- 日期：2026-11-28
- 合入版本：v0.231.0
- 目标：F# 在金融/数据/.NET 领域有稳定用户，此前 `.fs` 完全不进索引。
  补上后命名空间、模块、类型与成员可检索，`open` 形成命名空间级依赖边，
  .NET 生态（C#/VB/F#）语言覆盖闭环。
- 状态：代码、测试、双语文档、兼容矩阵、覆盖率报告与检查点更新；全量
  门禁通过。

## 交付

- `src/schema.js`：`fs`/`fsx`/`fsi` → `fsharp`。
- `src/prompts.js`：`fenceLang('fsharp')` → `fsharp`。
- `client.js`：`LANGUAGE_LABELS` 增加 `F#`。
- `src/symbols.js`：
  - `fsharpScan`：`//`、可嵌套 `(* … *)`、三引号与普通字符串屏蔽、
    预处理指令行忽略；
  - `fsharpTypeEnd`：`end` / 同行闭合 / 缩进块；
  - `extractFsharp`：namespace/module（class）、type（class/interface/
    type）、member/abstract member/override（method + parent）、let
    （function/variable）。
- `src/deps.js`：`extractFsharpImports` 提取 `open`/`open type`。
- `src/indexer.js`：`buildFsharpModules`（命名空间/模块名 + 父命名空间
  组合别名）、`resolveFsharpModule`（精确 → 逐段前缀回退）。
- 测试：
  - `test/symbols.test.js`：命名空间/模块/类/record/union/成员/override/
    let 与范围；
  - `test/deps.test.js`：open 与注释屏蔽；
  - `test/indexer.test.js`：命名空间与 `Demo.Core.Math` 组合名解析。

## 语义边界

- 只识别行首声明；计算表达式内部的嵌套 `let`/`type` 不登记。
- `abstract member` 定义的接口按 type 登记（无显式 `interface` 关键字）。
- `and` 互递归绑定与匿名 record 字段不逐个登记。
- `open` 外部程序集不建边；隐式类类型名也会进入模块映射（可接受近似）。

## 验证

- `LANG=en npm test`：688/688
- `LANG=zh_CN.UTF-8 npm test`：688/688
- `npm run coverage:check`：行 97.99%、分支约 87.8%、函数 95.92%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
