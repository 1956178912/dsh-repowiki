# 检查点：barrel 再导出链引用/使用点（phase-226）

- 日期：2026-11-28
- 合入版本：v0.250.0
- 目标：`repowiki-cards references/usages` 只沿直接边记账，经
  `index.ts` 等 barrel 的具名导入不会归到真实定义文件；同时索引器把
  所有边统一写成 `import`，无法区分 `export * from` 与命名空间导入。
  本轮打通再导出链并用共享模块承载解析逻辑。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/reexports.js`（新增）：`exportedNamesByFile`、
  `buildReexportMaps`、`resolveReexportOrigins`、`reexportTargets`、
  `barrelFiles`、`MAX_BARREL_DEPTH = 4`；references/usages 共用。
- `src/references.js`：`buildReferenceIndex(edges, files)` 在直接边之外
  沿 `export * from` 与同名 `export { x } from` 链把具名导入归到唯一定义
  文件；通配导入把 `*` 潜在引用写到下游目标；本地同名导出遮蔽星号，
  多来源按歧义跳过。
- `src/usages.js`：`usageImporters(edges, symbol, files)` 与
  `collectSymbolUsages(..., files)` 纳入 barrel 导入方；再导出边本身
  不进入词法扫描。cards/context/impact 三个调用点传入 `index.files`。
- `src/indexer.js`：边保留 `imp.kind`（`import`/`export-from`/`require`/
  `mod`），未知形态回退 `import`。
- 测试：
  - `test/references.test.js`：单级/多级 barrel、具名再导出、本地遮蔽、
    歧义来源、通配导入下游；
  - `test/usages.test.js`：barrel 导入方、多级链、未定义符号不误认；
  - `test/tools.test.js`：真实索引的 cards 集成（引用 + 使用点 + 行号）。
- 文档：README 双语（阶段行、索引工具行、barrel 条目）、CHANGELOG 双语、
  `docs/coverage.md`、`docs/compatibility.md`。

## 语义边界

- 只解析 `export * from` 与同名 `export { x } from`；别名再导出在 deps
  中记录原名，无法恢复导出名，保守漏报。
- 星号来源多于一个时按 ES 歧义语义跳过；barrel 自身同名导出优先。
- barrel 自身仍作为 `*` 潜在引用位置保留（与 v0.243 通配语义一致），
  使用点由词法扫描确认，因此再导出行不会凭空产生使用证据。
- 旧索引的边 kind 仍为 `import`，需重建索引后 barrel 解析才生效。

## 验证

- `LANG=en npm test`：782/782
- `LANG=zh_CN.UTF-8 npm test`：782/782
- `npm run coverage:check`：行 98.1%、分支 87.75%、函数 95.62%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
