# 检查点：Haskell 类方法与多行签名（phase-180）

- 日期：2026-11-28
- 合入版本：v0.204.0
- 目标：v0.203.0 的 Haskell 支持不登记 `class … where` 的方法，也不识别
  名称与 `::` 分行的签名。类方法（如 `describe`）是类型类 API 的主要
  检索入口，Haddock 风格多行签名在真实代码中常见。本迭代补齐两项。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；全量门禁通过。

## 交付

- `src/symbols.js`：
  - `haskellIndentOf`/`nextNonEmptyLine`/`haskellBlockEnd`：缩进块与
    下一非空行辅助；
  - `extractHaskell`：
    - `class … where` 分支按第一层成员缩进登记方法签名（普通与操作符），
      `kind: 'method'`、`parent: 类名`；默认方法体与更深层 `where`
      绑定不登记；
    - 顶层与类方法都支持多行签名（名称单独一行，下一非空行以 `::`
      开头）；
    - 合并键改为 `类名:方法名`（顶层用名称），类方法与同名顶层函数
      不再合并；
    - 输出对象带 `parent`（仅方法）。
- `src/schema.js`：`INDEX_PARSER_VERSION` 7 → 8（Haskell 提取规则变化）。
- 测试：`test/symbols.test.js` 新增用例覆盖类方法归属、类内多行签名、
  顶层多行签名与定义范围；既有 Haskell 夹具改为断言 `describe` 为
  method（此前断言不登记）。

## 语义边界

- 类方法只登记签名；默认方法体（`describe x = …`）不单独登记。
- 方法层缩进取类块内第一个非空行的缩进；更深的嵌套行忽略。
- 顶层单独一行的标识符只有在下一非空行以 `::` 开头时才登记为签名。
- 中缀操作符定义仍只识别简单形态。

## 验证

- `LANG=en npm test`：609/609
- `LANG=zh_CN.UTF-8 npm test`：609/609
- `npm run coverage:check`：行 98.08%、分支 87.21%、函数 95.57%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
