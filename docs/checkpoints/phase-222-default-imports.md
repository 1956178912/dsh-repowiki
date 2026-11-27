# 检查点：保守默认导入解析（phase-222）

- 日期：2026-11-28
- 合入版本：v0.246.0
- 目标：JS/TS 默认导入（`import Foo from './a'`）一直只有文件级边，
  `references=true`/`usages=true`/符号级影响面都看不到它。本轮用"提取期
  标记 + 索引期同名导出解析"补上符号证据，同时不猜测别名或匿名默认导出。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/deps.js`：
  - 导出 `JS_DEFAULT_PREFIX = 'default:'`；
  - `jsDefaultLocalName` 解析纯默认、`Foo, { … }`、`Foo, * as ns` 与
    `type Foo`；
  - import 分支把 `default:<Local>` 放到 `imported` 首位。
- `src/indexer.js`：
  - `resolveDefaultImportSymbols(edges, files)`：边排序后执行；
  - 目标文件存在同名导出符号（`exported !== false`）时替换为真实名字，
    否则丢弃标记（文件级边保留）；无标记时零开销返回。
- 测试：
  - `test/deps.test.js`：默认导入标记、默认+具名混合；
  - `test/indexer.test.js`：同名导出解析成功；别名保持 `symbols: []`。
- 文档：README 双语（阶段行、cards/impact 工具行、版本列表）、CHANGELOG
  双语、`docs/coverage.md`。

## 语义边界

- 只解析**本地名与目标导出同名**的情况；别名默认导入（`import x from`
  目标导出 `y`）不解析，保留文件级边。
- 匿名默认导出、运行时再导出、默认导入的 `export { default as … }`
  链不展开。
- 目标符号必须带 `exported !== false`；`const Foo` + 独立
  `export default Foo` 目前不解析（声明本身无 export 修饰）。
- 索引 JSON 无新字段：标记在写盘前已解析或移除；旧索引行为不变。
- 解析结果自动被 references/usages/impact/面板消费，不需要额外参数。

## 验证

- `LANG=en npm test`：771/771
- `LANG=zh_CN.UTF-8 npm test`：771/771
- `npm run coverage:check`：行 98.09%、分支 87.87%、函数 95.57%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
