# 检查点：面板索引告警 v0.99.0（phase-74）

- 日期：2026-11-27
- 目标：v0.98.0 让索引把 Go `internal` 越界等问写入 `warnings`，但只有
  状态工具可见。把告警计数与明细带到面板统计行，浏览时即可发现索引期
  问题。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - `indexWarnings` useMemo：过滤 `index.warnings` 中的非空字符串；
  - 单库统计行在跳过计数之后追加 `索引告警 N`（`statWarnings`），悬停
    `title` 列出前 3 条原文，超过 3 条追加 `… +N`；无告警不渲染；
  - 文案：`statWarnings`（索引告警 {n} / Index warnings {n}）、
    `statWarningsHint`（索引阶段发现的告警：Go internal 越界导入、跳过
    文件等）。
- 测试（`test/client-smoke.test.js`）：
  - 新用例：4 条告警 → 展示计数、悬停含原文、含 `… +1`、明细恰好 3 行；
    无告警 fixture 不渲染。
- 文档：两份 CHANGELOG、README 双语（stage/面板行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/client-smoke.test.js`：25/25 通过。
- `npm test`：383/383 通过。
- `npm run coverage:check`：行 97.97%、分支 87.33%、函数 95.12%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **悬停而非展开列表**：统计行保持单行紧凑；告警明细在 `title` 中可看，
  完整信息仍以 `repowiki-status` 为准。
- **前 3 条 + 余数**：避免超长 tooltip；数量仍如实可见。
- **与跳过计数并存**：跳过文件既是独立统计也在 warnings 中（索引器行为），
  两者语义不同（计数 vs 明细），同时展示不冲突。

## 遗留 / 下一步

- 面板 hub chip 点击跳转到对应卡片详情。
- mermaid 子集按真实资产反馈扩展 subgraph 分组。
- Wiki 生成 prompt 是否注入 fan-in hub（作为架构热点依据）评估。
- 提交/推送与版本 tag 由用户确认后执行。
