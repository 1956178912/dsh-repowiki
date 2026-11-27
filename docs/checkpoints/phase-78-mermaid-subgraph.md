# 检查点：mermaid subgraph 分组 v0.103.0（phase-78）

- 日期：2026-11-27
- 目标：真实架构图常用 `subgraph` 表达模块边界，但面板渲染器此前跳过
  该指令，组信息丢失。补 subgraph 分组框，让生成/手写的流程图完整可见。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js` 的 `renderMermaidDiagram`：
  - 解析 `subgraph 名称`（支持 `id[组名]` 与裸组名）… `end`，维护
    `groups`（组名 → 成员节点）与 `currentGroup`；
  - 新节点（纯节点行或边行首次出现）登记到当前组；已在其它组的节点保持
    原归属；
  - 渲染 `groupElements`：按成员节点包围盒外扩 12px/24px 画虚线圆角框
    （`strokeDasharray: '4 3'`、`bg-layer-2` 填充）+ 组名文本，绘制在
    边/节点之前（底层，不遮挡）；
  - 布局起始内边距调整（TD y=32、LR x=32），保证组框不被画布裁剪；
  - 空/异常组名回退为 `group`；JSDoc 同步。
- 测试（`test/client-smoke.test.js`）：
  - 新用例：两个 subgraph（含 `id[组名]` 形态）、跨组边，断言两个组名、
    组内/组外节点标签、恰好两个虚线框与圆角。
- 文档：两份 CHANGELOG、README 双语（stage/面板行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/client-smoke.test.js`：26/26 通过。
- `npm test`：386/386 通过。
- `npm run coverage:check`：行 97.99%、分支 87.48%、函数 95.24%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。
- 基准复测（`npm run bench`）：1000 文件约 31ms / 69MiB、5000 文件约
  120ms / 97MiB（串行 32 / 124ms），较 v0.91.0 无回退；
  `docs/benchmarks.md` 已更新为 v0.103.0 快照。

## 关键决策与取舍

- **包围盒而非网格重排**：不引入 dagre 式分层组布局；组框按成员节点
  实际位置包围，跨层组的框自然变高，视觉可接受且实现确定。
- **底层绘制**：组框先于边与节点渲染，避免半透明填充压低文字对比度；
  节点自身背景不透明，标签始终可读。
- **节点归属先到先得**：同一节点重复出现在多个组时不迁移，避免歧义；
  与 mermaid 的常规用法一致。
- **内边距统一加大**：所有图从 32px 起排（TD 顶部 / LR 左侧），无组图
  只多少量留白，换取组框永不被裁剪。

## 遗留 / 下一步

- 索引告警明细点击跳转状态工具。
- 组框内成员跨层过多时的紧凑布局（按真实资产反馈再评估）。
- mermaid 其他图类型（state/class）是否支持，按需求评估。
- 提交/推送与版本 tag 由用户确认后执行。
