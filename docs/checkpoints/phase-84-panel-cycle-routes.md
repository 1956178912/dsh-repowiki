# 检查点：面板循环徽章附路径 v0.109.0（phase-84）

- 日期：2026-11-27
- 目标：v0.108.0 让状态工具与合成 prompt 有代表性环路径，但面板 `⟲`
  徽章仍只显示组大小。把同一路径带到 tooltip，浏览时即可定位断链点。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - `cycleSizesFor` 升级为 `cycleInfoFor`：返回
    `Map<path, {size, sample}>`，SCC 后按组内字典序最小起点计算最短闭合
    环（本地 BFS + 回边枚举，并列按路径字典序，12 节点上限）；
  - rows 增 `cycleSample`（`cycleSize` 保留）；
  - `cycleBadgeHint(size, sample, tt)`：2–3 文件环追加
    `cycleBadgeRoute`（`（如 a → b → a）` / ` (e.g. a → b → a)`）；
  - 网格瓦片与列表行的徽章 `aria-label` / `title` 同步传入 sample。
- 测试（`test/client-smoke.test.js`）：
  - 徽章用例改为前缀匹配可访问名，并断言 title 含 `cycleBadgeRoute`。
- 文档：两份 CHANGELOG、README 双语（stage/面板行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/client-smoke.test.js test/client-dom.test.js`：38/38 通过。
- `npm test`：390/390 通过。
- `npm run coverage:check`：行 98.05%、分支 87.47%、函数 95.28%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **客户端重复实现最短环**：`client.js` 不能 import `src/`，与服务端
  同语义实现（BFS + 回边枚举 + 12 节点上限），由测试锁定行为。
- **仅 2–3 文件环显示路径**：徽章 tooltip 需要短；更长环的路径在状态
  工具/结构化输出中可查。
- **保留 `cycleSize` 字段**：渲染条件与既有测试不变，只新增 `cycleSample`，
  降低回归面。
- **可访问名包含路径**：读屏用户同样获得断链参考；代价是 aria-label
  变长（仍可接受）。

## 遗留 / 下一步

- mermaid 组内节点较多时的紧凑排布。
- 面板 Wiki 页顶部风险摘要（需求再评估）。
- 循环路径是否在详情面板中展示（当前详情有双向边，可再加一行环摘要）。
- 提交/推送与版本 tag 由用户确认后执行。
