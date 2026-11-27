# 检查点：OCaml `and` 续接与原始字符串（phase-178）

- 日期：2026-11-28
- 合入版本：v0.202.0
- 目标：v0.201.0 的 OCaml 支持把 `let rec … and …` / `type … and …`
  续接定义与 `{|…|}` 原始字符串列为已知限制。互递归函数与多类型定义在
  OCaml 中很常见，原始字符串常用于 SQL/HTML/正则，其中的 `(*` 会被误判
  为注释，遮蔽后续声明。本迭代补齐两项。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；全量门禁通过。

## 交付

- `src/symbols.js`：
  - `ocamlScan`：新增 `{|…|}` / `{id|…|id}` 原始字符串跨行屏蔽；起止
    定界符保留、内容替换空格，兼顾伪注释屏蔽与行范围测量；注释/普通
    字符串分支保持；
  - `extractOcaml`：
    - 维护 `lastDeclKind`（`let`/`type`/null），`and` 行按上一族登记：
      `and g …`（函数）与 `and 'a t = …`（类型，取 `=` 左侧末尾标识符）；
    - 缩进判定改为只看行首空白（`trimStart`），修复掩码体以空格结尾的
      顶层行被误跳过；
    - 非声明行重置 `lastDeclKind`，避免跨声明错误续接。
- `src/schema.js`：`INDEX_PARSER_VERSION` 6 → 7（OCaml 提取规则变化）。
- 测试：`test/symbols.test.js` 新增夹具，覆盖互递归 `even`/`odd`、
  `type a`/`and b`、单行 `{sql|…|sql}`、跨行 `{html|…|html}` 内的
  `(* … *)` 与后续声明行号；既有 OCaml 测试保持通过。

## 语义边界

- `and` 仅识别缩进 0 的续接行（与主声明对齐）；同行 `let x = 1 and y = 2`
  的第二个绑定不登记。
- 原始字符串屏蔽后，`open`/`module` 等文本不再产生依赖边（与字符串一致）。
- `module`/`class` 的 `endLine` 配平限制不变（字段名恰为 `struct` 等极端
  情况可能提前结束，仅影响范围）。
- `.mli` 精确可见性仍不跨文件合并。

## 验证

- `LANG=en npm test`：604/604
- `LANG=zh_CN.UTF-8 npm test`：604/604
- `npm run coverage:check`：行 98.12%、分支 87.16%、函数 95.52%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
