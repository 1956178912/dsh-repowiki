# 检查点：面板符号搜索与方法归属 v0.58.0（phase-33）

- 日期：2026-11-27
- 目标：让"按符号名找文件"在面板与工具两侧都成立，并补齐 Scala 3
  缩进语法的成员归属（关闭兼容矩阵中的已知限制）。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - 卡片行新增 `symbolText`（索引符号名小写拼接），`scoreCard` 增加权重 2
    的符号名匹配；未生成卡片的文件也能被符号名命中。
  - 搜索框提示更新为"标题 / 路径 / 标签 / 符号"（中英）。
- `src/tool-cards.js`：
  - 输出 schema 的符号对象新增可选 `parent`；渲染为
    `name (kind:line, in Parent)`，方法归属不再丢失。
- `src/symbols.js`：
  - 新增 `scalaIndentOf` / `scalaIndentBlockEnd`：Scala 3 以 `:` 结尾的
    类型模板、以 `=` 结尾的 `def` 按缩进推导块范围（跳过空行/注释）。
  - 类型与 def 的 `endLine`、成员 `parent` 由此恢复正确；花括号语法
    行为不变。
- 测试：
  - `test/symbols.test.js`：Scala 3 缩进体的 object/trait/def 归属与范围。
  - `test/tools.test.js`：方法符号 `parent` 与渲染文本。
  - `test/client-smoke.test.js`：仅靠符号名（`z`）命中文件。
- 兼容矩阵更新 Scala 3 的剩余限制（`given`/`extension` 成员不展开）。

## 验证（本地全量）

- `npm test`：314/314 通过。
- `npm run coverage:check`：行 97.8%、分支 86.76%、函数 94.05%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 面板存 `symbolText` 而非每次搜索拼数组：键盘输入时避免逐行 join 分配；
  权重低于标题、高于摘要，符合"按名字找定义"的预期。
- `parent` 作为可选字段加入 schema：旧索引/旧返回值不受影响，渲染保持
  紧凑（仅方法带 `in X`）。
- Scala 3 只用缩进推导类型/def 范围，不尝试解析 `given`/`extension`：
  避免把 DSL 结构误判为成员（YAGNI 与不猜测原则）。

## 遗留 / 下一步

- 目录级并行索引（大仓库吞吐）。
- Swift Package 目标级依赖图。
- 提交/推送与版本 tag 由用户确认后执行。
