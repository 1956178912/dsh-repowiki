# 检查点：Nim `type` 块成员（phase-176）

- 日期：2026-11-28
- 合入版本：v0.200.0
- 目标：v0.199.0 只识别 `type Name = …` 单行形态，而 Nim 模块常用
  `type` 单独成段、成员缩进书写的多类型风格。此时整个段落被
  `typeRe` 之外的路径跳过，领域类型对符号检索、影响面与 Wiki 完全不可见。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；全量门禁通过。

## 交付

- `src/symbols.js`（`extractNim`）：
  - `typeBlockRe = /^type\s*$/` 识别单独成段的 `type`；
  - `typeMemberRe = /^\s+([A-Za-z_]\w*)(\*?)\s*(?:\[[^\]]*\])?\s*=/`
    只匹配带 `=` 的成员定义，字段行与枚举值行天然不命中；
  - 每个成员登记为 `kind: 'class'`，`endLine` 由
    `nimBlockEnd(maskedLines, j, memberIndent)` 按成员自身缩进界定，
    `exported` 取 `*` 后缀；
  - 段落后 `skipUntil = end`，后续例程不受影响。
- `src/schema.js`：`INDEX_PARSER_VERSION` 5 → 6（Nim 提取规则变化，旧
  索引需重新解析 `.nim`/`.nims`）。
- 测试：`test/symbols.test.js` 新增「Nim：type 块成员」夹具，覆盖
  `Person* = object`（导出、范围 1–4）、`Color = enum`（私有、范围含空行
  至 7）、字段 `name*`/`age` 与枚举值 `red` 不登记、后续 `run` 行号 8。

## 语义边界

- 仅处理缩进 0 的 `type` 段；`when isMainModule` 等缩进块内的类型不登记。
- 成员必须带 `=`；对象字段（`name*: string`）与枚举值（`red, green`）
  不产生符号。
- 泛型参数（`[T]`）由 `typeMemberRe` 的可选组跳过，不影响名称提取。
- 已支持 `ref object`、`tuple`、别名等所有 `Name = …` 形态，kind 统一为
  `class`，不做类型细分类。

## 验证

- `LANG=en npm test`：598/598
- `LANG=zh_CN.UTF-8 npm test`：598/598
- `npm run coverage:check`：行 98.09%、分支 87.11%、函数 95.49%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
