# 检查点：反向影响面 v0.94.0（phase-69）

- 日期：2026-11-27
- 目标：v0.92/v0.93 解决了"这个文件依赖谁"（正向出边与传递依赖），
  但重构时更需要"改这个文件会影响谁"（反向影响面）。补工具
  `dependents=true`（含 `depth` 传递展开）与面板依赖方区块，使双向
  影响面在工具与 UI 上对称可用。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/references.js`：
  - 新增 `dependentsFor(edges, matches, limit, depth)`：按 `to → from`
    建反向邻接，以命中文件为起点 BFS；`seen` 预置命中文件（自身不作为
    依赖方），同一文件只记录首次到达（最小跳数），环自然收敛；条目
    `{path, line?, symbols, depth}` 与正向同形；上限 100 + 截断标记。
- `src/tool-cards.js`：
  - 新参数 `dependents`（boolean）；`depth` 描述改为同时作用于
    `imports` 与 `dependents`；
  - depth 钳制提前到 execute 顶部（两方向共用一次）；
  - 输出 schema 增 `dependents`（items required `path/symbols/depth`）
    与 `dependentsTruncated`；
  - 渲染抽 `formatEdgeEntries(entries, arrow, deepArrow)`，正向 `→`
    /`⇢`、反向 `←`/`⇠`，均带符号与 `N hops` 后缀；
  - 工具描述与 `presentCall.rawInput` 同步。
- `client.js`：
  - 新增 `dependentsForPath(index, path, depth)`：与 `dependentsFor`
    同语义的反向 BFS，另带 `mutual`（该依赖方也被本文件直接依赖）；
  - 深度控件从 imports 区块标题行上移为共享行（"依赖展开深度"），
    同一 `importDepth` 同时驱动 `importsForPath` 与 `dependentsForPath`；
  - 新增"依赖本文件（import 级）"区块：`←` 直接依赖方、`↔` 双向导入、
    `⇠` 间接依赖方，超过 8 条折叠计数；
  - 文案新增 `detailDependents`；打开卡片仍重置为 1 跳。
- 测试：
  - `test/references.test.js`：新增 3 例（反向收集与传递、命中文件互不
    列出与坏边跳过、上限截断与空输入）；
  - `test/tools.test.js`：dependents 默认不计算、直接依赖方、`depth=2`
    间接依赖方与 `⇠ … 2 hops` 渲染、无依赖方返回空数组；
  - `test/client-smoke.test.js`：fixture 增 `e.js → c.js`（不引入新环），
    深度用例扩展为双向断言（默认无 `e.js:L2`、2 跳出现 `⇠` 与
    `e.js:L2`、重开重置）。
- 文档：两份 CHANGELOG、README 双语（stage/能力行/面板行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/client-smoke.test.js test/client-dom.test.js`：34/34 通过。
- `npm test`：377/377 通过。
- `npm run coverage:check`：行 97.93%、分支 87.36%、函数 94.95%（门禁通过；
  多次运行波动约 0.2pp）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **文件级而非符号级反向**：`references` 已是符号级"被谁引用"；影响面
  关心文件依赖关系（含无符号副作用导入），独立成文件级列表，语义不混。
- **正反向共享 depth**：同一个"展开深度"控件符合用户心智（一次选择看
  两个方向），也避免 UI 出现两组重复按钮。
- **反向条目保留 symbols**：符号是"依赖方从我这里导入了什么"，对评估
  改动影响有直接价值；传递跳数时与正向语义一致（相对上游文件）。
- **面板反向也带 mutual**：`↔` 标明双向导入，用户能立即识别耦合热点；
  与 imports 的 `↔` 语义一致。
- **不做跨方向合并**：不把 imports 与 dependents 合并成一个"关系"列表，
  保持两个方向的独立含义与排序稳定性。

## 遗留 / 下一步

- C/C++ 重复 include 边折叠策略。
- Go `internal` 包可见性诊断。
- 影响面聚合（按模块汇总依赖方，用于大仓库降噪）。
- 提交/推送与版本 tag 由用户确认后执行。
