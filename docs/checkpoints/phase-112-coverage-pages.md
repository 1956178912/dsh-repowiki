# 检查点：页级覆盖率明细（phase-112）

- 日期：2026-11-27
- 合入版本：v0.136.0
- 目标：覆盖率和原因已能汇总，但 status 只给总数，代理/用户无法直接知道
  "该刷新哪一页"。本轮增加有界页级明细，并让健康分待办提及未覆盖数量。
- 状态：代码、纯函数/status/健康分测试、双语文档、全量门禁完成；已提交并推送。

## 交付

- `src/citation-drift.js`：
  - 抽出 `pageCoverage(page)`，统一页级 sources 去重、fingerprint 追踪与
    reasons 分桶；
  - `summarizeCitationCoverage` 改为聚合页级结果，返回值不变；
  - 新增 `citationCoveragePages(manifest, {limit})`：只列出 `untracked > 0`
    的页面，按未覆盖数降序、标题/slug 升序，返回
    `{pages:[{slug,title,total,tracked,untracked,reasons}], truncated}`；
    默认/最多 10 条。
- `src/tool-status.js`：
  - 输出 `citationCoveragePages`（仅存在未覆盖页面时）；
  - `Citation digests` 行追加首个示例：
    `— e.g. Overview: 1 untracked (1 unknown)`；
  - schema 增加页级明细与 `truncated`。
- `src/health.js`：
  - 引用输入增加 `untracked`；新增待办
    `N citation(s) have no content digest`，但**不扣分**（未知≠已证明有问题）。
- 双语文档、覆盖率报告同步。

## 语义边界

- 页级明细只列未覆盖页面，完整覆盖的页面不占明细；`truncated` 表示还有
  更多未覆盖页面未展示。
- 原因计数与页级覆盖率一致：同一页内重复引用去重，同一 source 跨页各计。
- status 仍只读清单，不读源码；原因来自生成时 `citationMisses`，缺失时
  归入 `unknown`。
- 未覆盖不改变健康分，只进入待办提示；健康分仍只惩罚缺失/越界/漂移。

## 测试

- `test/citation-drift.test.js`：页级排序（未覆盖多者优先）、完整页排除、
  reasons 分桶、`limit` 截断与 `truncated`。
- `test/health.test.js`：status 输出 `citationCoveragePages` 与示例渲染；
  `untracked` 进入健康待办但总分不变。
- 全量 490 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：490/490（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.22%、分支 86.54%、函数 95.24%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 只输出未覆盖页面，不输出全部页面覆盖率：避免 status 输出膨胀，完整页
  没有可执行信息。
- 文本只点名一个示例：结构化输出保留 10 条，文本保持简洁。
- 未覆盖不扣分：它是能力边界，不是质量问题；扣分会让"无法验证"与
  "已验证有问题"混为一谈。

## 遗留 / 下一步

- `verify:wiki` CI 门禁（broken/range/drift 失败，untracked 警告）。
- 面板"仅看未覆盖页面"筛选。
- 原因趋势统计（需要历史快照）。
