# 检查点：文档覆盖率与知识库健康度 v0.114.0（phase-89）

- 日期：2026-11-27
- 目标：状态工具已有索引/卡片/Wiki/告警/循环/hub 的散点信息，但缺少
  "文档欠债多少、整体健康如何、先补哪里"的可比较结论。新增只读聚合，
  不引入模型调用。
- 状态：代码、测试、文档完成；全量验证通过；未提交/推送。

## 交付

- `src/health.js`（纯函数）：
  - `documentationCoverage(files, cards, eligiblePaths)`：分母是
    `selectCandidates` 判定"有资格生成卡片"的文件（受复杂度阈值与
    includeOnly 影响），避免把配置/测试/生成物算成欠债；输出 `eligible/
    documented/fresh/stale/percent/gaps`，`gaps` 按模块缺失数降序、路径
    升序取前 5；无索引返回 `null`。
  - `assessHealth({coverage, wiki, cycles, hubs, warnings, skipped})`：
    documentation 40%（覆盖与新鲜度各半）、wiki 25%（无页面=0，按 stale/
    orphan 比例扣分）、architecture 20%（每个环组 -10，最高 fan-in ≥10
    -15 / ≥5 -8）、hygiene 15%（每条告警 -5、每个跳过 -2）；总分取整
    0–100，A≥85 / B≥70 / C≥55 / D；`issues` 汇总最多 4 条。
- `src/tool-status.js`：
  - `readPlan` 后计算 `eligiblePaths`（用与抽取相同的 `selectCandidates`，
    不重复实现阈值）；
  - cycles/hubs 计算后接 coverage/health；输出 `coverage`（必填）与可选
    `health`；文本新增
    `Docs coverage: 2/3 eligible file(s) (67%), 1 stale; largest gap: ...`
    与 `Health: 72/100 (B) — ...`；`schema`/说明同步。
- 测试：新增 `test/health.test.js`（7 例：覆盖率分母与缺口、eligible 子集、
  全新鲜 A/缺 Wiki B、环+告警+跳过 D、等级边界、status 接线与渲染、
  无索引降级）。
- 文档：两份 CHANGELOG、README 双语、`docs/coverage.md`。

## 验证（本地全量）

- `npm test`：415/415 通过（`LANG=en`）。
- `LANG=zh_CN.UTF-8 npm test`：415/415 通过。
- `npm run coverage:check`：行 98.57%、分支 89.37%、函数 96.97%。
- `npm run typecheck` / `npm run lint` / `npm run scan:secrets` /
  `npm run verify:host`：通过。

## 关键决策与取舍

- **分母用"有资格"而非"全部文件"**：否则大量入口/配置/测试会永久拉低
  覆盖率，指标失去行动价值；复用 `selectCandidates` 保证与抽取口径一致。
- **健康分是加权和而非乘积**：乘积会让任一 0 分项直接归零，掩盖其余
  改进；加权和配合分量明细更可解释。
- **缺 Wiki 不算 0 分文档**：两者是独立信号，Wiki 25 分单独衡量；但
  "无 Wiki 页面"确实让该分量为 0，是当前仓库的常见起点。
- **不自动生成补卡任务**：状态工具保持只读；`gaps` 与 `issues` 提供
  排序依据，生成仍由用户显式触发（避免隐式 LLM 开销）。

## 遗留 / 下一步

- `gaps` 目前按模块计数，尚未按 fan-in/复杂度加权；若后续要"按风险补
  文档"，可把 hub/环成员作为加权因子。
- 健康分权重是经验值，尚无历史基线；可在 `benchmarks` 或真实仓库上
  校准后再调整阈值。
- 提交/推送与版本 tag 由用户确认后执行。
