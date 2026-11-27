# 检查点：上下文感知卡片与 Scala 3 成员 v0.62.0（phase-37）

- 日期：2026-11-27
- 目标：提高卡片 `relatedModules` 的真实性（模型此前不知道项目模块名），
  并补齐 Scala 3 `extension` / `given` 的方法归属。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/prompts.js`：`extractPrompt` 新增可选 `project` 上下文：
  - `Project: <name> (<tech1>, <tech2>)` 或仅有技术栈时 `Project stack: …`；
  - `Modules: a, b, … — use these exact module paths in relatedModules;
    do not invent new ones.`；
  - 无上下文时不追加任何行（保持旧 prompt 形态）。
- `src/tool-extract.js`：从索引提取项目名、技术栈（≤8）与模块路径（≤20），
  传入每个文件的抽取 prompt。
- `src/symbols.js`：
  - `extension (s: String)` 作为方法归属范围（被扩展类型取首参数类型名），
    不重复产出类型符号；
  - `given [Name]: Type with` / 单行赋值登记为 variable，`with` 缩进体
    计算块范围；匿名 given 以类型名登记；given 内方法归属该实例。
- 测试：
  - `test/prompts.test.js`：项目/模块上下文注入、仅技术栈、无上下文三态。
  - `test/tool-llm.test.js`：抽取派发 prompt 含 `Project: demo (React)`。
  - `test/symbols.test.js`：Scala 3 extension 方法父级、given 实例与内部
    方法归属、given 块结束行。
- 兼容矩阵：Scala 行补充 given/extension；限制说明更新。

## 验证（本地全量）

- `npm test`：319/319 通过。
- `npm run coverage:check`：行 97.84%、分支 86.84%、函数 94.2%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 上下文只带名字与模块路径、不带源码：token 成本可控（十几行），且正好
  约束 `relatedModules` 这类容易臆造的字段。
- 技术栈取前 8、模块取前 20：超大仓库的模块列表很长，全量注入会稀释
  信号；顺序来自索引（稳定），截断可预期。
- extension 不产出符号：它本身不是可检索实体；归属范围已能让方法挂到
  被扩展类型上，避免与真实类型声明重名。

## 遗留 / 下一步

- 目录级并行索引（大仓库吞吐）。
- Swift 自定义 `path:` 目标；多行 Scala 参数子句。
- 提交/推送与版本 tag 由用户确认后执行。
