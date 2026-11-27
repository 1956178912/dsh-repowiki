# 检查点：循环依赖检测 v0.81.0（phase-56）

- 日期：2026-11-27
- 目标：索引已有完整文件级 import 图，但用户只能看到"模块间依赖计数"，
  看不到循环依赖——这是架构评审里最常被追问的坏味道。补上文件级环检测，
  并让状态报告与 Wiki 生成共用同一口径。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/cycles.js`（纯函数）：
  - `findImportCycles(edges, {limit, filesPerCycle})`：以强连通分量（SCC）
    口径求循环组，迭代 Tarjan 实现（5000 节点长链/长环回归不爆栈）；
  - 自引用与坏边忽略，重复边去重；组内文件字典序、组间按大小降序再按
    首文件排序；默认上限 10 组 / 每组 30 文件，`truncated` 与
    `files[].truncated` 分别如实标记组级与组内截断。
- `src/tool-status.js`：
  - 输出 schema 增 `cycles`（`files`/`size`/`truncated`）；
  - 渲染 `Import cycles: a.ts ↔ b.ts (+N)`，无环 `(none)`，每组最多展示
    3 个文件，完整数据在结构化输出；
  - 工具描述补充"architecture signals"。
- `src/prompts.js` + `src/tool-generate.js`：
  - 主题 prompt 增 `Import cycles detected in the index (N):` 段与任务 8
    （存在循环必须在架构章节指出风险；`(none)` 时不得臆造）；
  - 生成侧计算前 5 组（每组 6 文件）传入 prompt；
  - 顺手合并了 `generatePrompt` 上方重复的 JSDoc 块。
- 测试：`test/cycles.test.js` 7 例（互引/长环/链式/菱形/坏边/排序/双重
  截断/5000 节点深图）；`test/status.test.js` 增 1 例（有环/无环渲染）；
  `test/prompts.test.js` 增 1 例（循环段与风险指令、`+N` 折叠）；
  `test/tool-llm.test.js` 的依赖 prompt 用例扩展为双向边并断言循环组。
- 文档：两份 CHANGELOG、README 双语（stage/能力行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：355/355 通过。
- `npm run coverage:check`：行 97.88%、分支 87.23%、函数 94.62%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **用 SCC 而不是"列出所有简单环"**：环的数量可指数级增长且同一 SCC 内
  环不唯一；SCC 正好等价于"每个文件都至少在一个环上"，是 madge /
  dependency-cruiser 等工具的常见聚合口径，输出稳定可复现。
- **迭代 Tarjan**：递归实现在万文件级仓库有爆栈风险；显式帧栈的复杂度
  与递归一致，测试用 5000 节点链/环兜底。
- **不在状态里加 warning**：有环是事实而非配置错误，渲染行已足够醒目；
  加告警会让"warnings"列表失去可操作性。
- **生成侧只看前 5 组**：prompt 预算有限，5 组足以让架构页写出风险段落；
  完整清单仍由 `repowiki-status` 提供。
- 组内展示 3 个文件（状态）/ 4 个（prompt）：大 SCC 常见于 barrel 文件，
  铺开只会淹没其它诊断信息。

## 遗留 / 下一步

- 面板详情展示出边与循环标注（工具侧已具备，UI 未接）。
- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- 提交/推送与版本 tag 由用户确认后执行。
