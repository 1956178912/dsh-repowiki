# 检查点：通配引用证据（phase-219）

- 日期：2026-11-28
- 合入版本：v0.243.0
- 目标：JS/TS 的命名空间导入（`import * as ns`）与再导出（`export * from`）
  只产生文件级边，符号级反向引用、使用点与影响面都看不到它们；用户查询
  "谁引用了这个符号"时会漏掉真实使用方。本轮把这两类边显式记为 `*`
  通配符，并让三处消费端按"潜在引用"处理，同时保留"是否真的使用"的
  词法确认。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/deps.js`：
  - `import * as ns` 原本已记 `*`；`export * from './x'` 之前因
    `jsImportedNames` 无花括号/`* as` 而返回空数组，现显式记为 `*`；
- `src/references.js`：
  - 模块注释补充通配语义；
  - `referencesFor` 把 `*` 引用合并进目标文件的每个命中符号（与具名引用
    按 path/line 去重排序），不额外输出 `*` 符号条目；
- `src/usages.js`：
  - `usageImporters` 接受 `edge.symbols` 含 `*` 的边；是否真的使用仍由
    `findSymbolUsages` 的词法扫描决定（`ns.parse()` 会被 `parse` 命中）；
- `src/impact.js`：
  - `computeSymbolImpact` 遇到 `*` 边时，把该目标文件里被选中的符号全部
    计入直接影响与 `references`（不把 `*` 本身当符号名输出）；
- 测试：
  - `test/deps.test.js`：`import * as` 与 `export *` 均产出 `['*']`；
  - `test/references.test.js`：通配引用与具名引用合并、排序；
  - `test/usages.test.js`：通配导入方进入 `usageImporters`；
  - `test/impact.test.js`：命名空间导入计入符号级直接影响；
  - `test/tools.test.js`：cards 端到端（references + usages），未使用的
    命名空间导入不产生使用点。
- 文档：README 双语（阶段行、cards/impact 工具行、版本列表）、CHANGELOG
  双语、`docs/coverage.md`。

## 语义边界

- `*` 只表示"可能引用目标文件的任意符号"，不声称具体使用了哪一个；
  `references` 是 import 级证据，`usages` 才给出词法出现位置。
- `export *` 的引用方是再导出文件本身；最终消费者经 barrel 导入的链路
  没有跨文件展开（不猜测再导出图）。
- 默认导入（`import Foo from './x'`）仍不记录符号名：无法在不读取目标
  默认导出名的情况下可靠推断，保持文件级边。
- `*` 会出现在 `repowiki-cards imports/dependents` 的 `symbols` 列表与
  面板的 `*` 引用分组中，这是对"通配"的显式呈现。
- 影响面的文件级模式仍把 `*` 作为依赖方的导入符号展示，不做展开。

## 验证

- `LANG=en npm test`：768/768
- `LANG=zh_CN.UTF-8 npm test`：768/768
- `npm run coverage:check`：行 98.09%、分支 87.91%、函数 95.54%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
