# 检查点：具名默认导出的再导出解析（phase-231）

- 日期：2026-11-28
- 合入版本：v0.255.0
- 目标：`export { default as Button } from './Button'` 与
  `export { default } from './Button'` 的 `default` 不是符号名，别名再
  导出链在目标文件处解析失败，最终使用方只能停在 barrel。本轮把具名
  默认导出映射到真实符号。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/symbols.js`：JS/TS 具名 `export default function/class/interface`
  符号增加 `default: true`；匿名默认导出不登记（不编造 default 符号）。
- `src/reexports.js`：`buildReexportMaps` 汇总 `defaults`（文件 → 默认
  符号名）；`resolveReexportOrigins` 在遇到 `default` 时优先解析该文件
  的具名默认导出，再判断本地导出/再导出链；本地默认导出遮蔽下游。
- `src/schema.js`：`INDEX_PARSER_VERSION = 13`。
- 测试：
  - `test/symbols.test.js`：具名默认导出标记、普通导出不带标记；
  - `test/references.test.js`：`default as Button` 与同名 `default`
    再导出都归到 Button；
  - `test/tools.test.js`：真实索引的默认导出再导出引用/使用点。
- 文档：README 双语（阶段行、默认导出条目）、CHANGELOG 双语、
  `docs/coverage.md`、`docs/compatibility.md`。

## 语义边界

- 只支持具名默认导出；匿名 `export default () => {}` 无法具名，保持不
  登记（引用查询不会凭空出现 default 符号）。
- `export default someVar`（先声明再默认导出）未建立符号关联，保守漏报。
- 默认导出经多级 barrel 仍按 `default` 逐层解析；本地默认导出优先。
- 旧索引需重建（parser v13 使符号缓存失效）。

## 验证

- `LANG=en npm test`：802/802
- `LANG=zh_CN.UTF-8 npm test`：802/802
- `npm run coverage:check`：行 98.12%、分支 87.81%、函数 95.52%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
