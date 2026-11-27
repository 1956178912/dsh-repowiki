# 检查点：面板未覆盖筛选（phase-114）

- 日期：2026-11-27
- 合入版本：v0.138.0
- 目标：Wiki 页签已能展示覆盖率与原因，但无法快速隔离"需要刷新"的页面；
  同时搜索无结果时误用"尚未生成"文案。本轮补齐筛选与空状态。
- 状态：代码、面板测试、双语全量门禁完成；已提交并推送。

## 交付

- `client.js`：
  - WikiPanel 增加本地 `onlyUntracked` 状态；
  - 存在未覆盖页面时展示筛选按钮，文案
    `仅看未覆盖（N）` / `Only untracked (N)`，N 为**页面数**；
  - 按钮使用 `aria-pressed` 表示开关状态，与搜索条件组合过滤；
  - 开启时隐藏引用全部有指纹的页面（含孤儿页），取消后恢复；
  - 搜索/筛选无结果时展示 `wikiNoMatches`（"没有符合条件的页面"），
    不再误用 `wikiEmpty`。
- 新增中英文文案：`wikiOnlyUntracked`、`wikiNoMatches`。
- 双语文档、覆盖率报告同步。

## 测试

- `test/client-smoke.test.js` 新增“仅看未覆盖筛选”：
  - 基础夹具中 `overview` 有 1 条未覆盖、`core` 完整覆盖；
  - 点击开关后只保留 `overview`，`aria-pressed=true`；
  - 再次点击恢复 `core`。
- 既有 Wiki 列表、旧清单降级、引用跳转等用例保持通过。
- 全量 499 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 筛选基于清单里的页级 `citationCoverage.untracked`，不读源码；
  未覆盖原因不参与筛选条件。
- 计数是"有未覆盖引用的页面数"，不是引用条数；汇总行仍展示条数。
- 筛选状态是组件本地状态：切换页签/重挂载会回到默认（显示全部），
  不写入资产，也不影响搜索状态。
- 旧清单没有指纹时所有页面都算未覆盖，筛选仍可用；徽章仍按
  `hasDigests` 规则不逐页展示。

## 验证

- `npm test`：499/499（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.11%、分支 86.31%、函数 95.14%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 用按钮而不是下拉/多选：只需一个布尔筛选，按钮更直接，也便于键盘与
  读屏（`aria-pressed`）。
- 不把"未覆盖原因"做成二级筛选：原因分类已由 tooltip/汇总提供，
  再加筛选会让当前列表交互过度复杂。
- 空状态文案只区分"没有页面"与"没有匹配"，不细分搜索/筛选原因，
  避免文案膨胀。

## 遗留 / 下一步

- GitHub Actions 示例（消费方在 `repowiki-generate` 后运行 `verify:wiki`）。
- 按原因筛选（unreadable/range/cap）属于可选增强。
- 原因趋势统计（需要历史快照）。
