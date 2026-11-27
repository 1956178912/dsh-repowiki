# 检查点：面板引用指纹覆盖率（phase-108）

- 日期：2026-11-27
- 合入版本：v0.132.0
- 目标：工具侧已能报告引用指纹覆盖率，但面板仍只展示行号越界。本轮让
  Wiki 页签直接从清单展示覆盖与未覆盖，不读取源码；同时修复页级/章节
  引用重复计数。
- 状态：代码、面板夹具、双语全量门禁完成；已提交并推送。

## 交付

- `client.js`：
  - 新增 `citationCoverageFor(meta)`：对页级 `sources` 与章节 `sources`
    去重，统计 `total/tracked/untracked/hasDigests`，非空字符串才算指纹；
  - `applyWikiManifest` 为每个页面附加 `citationCoverage`，孤儿页为全 0；
  - Wiki 页签汇总所有页面：覆盖率不完整时显示
    `引用指纹：tracked/total 已记录 · untracked 未覆盖`；旧清单（无任何
    指纹）只显示一次"清单无指纹记录"，不逐页打扰；
  - 有指纹且该页存在未覆盖引用时，标题后显示弱化的 `◌ N` 徽章，
    `title` 为"未覆盖 N"，`aria-label` 说明"无法做漂移检查"；
  - 修复 `citationIssuesFor`：页级 `sources` 是章节 `sources` 的并集，
    此前两者都计入导致越界/未检查翻倍；现按页去重，与 status/generate
    的覆盖率口径一致。
- 新增中英文文案：`wikiCoverageBadge`、`wikiCoverageHint`、
  `wikiCoverageSummary`、`wikiCoverageLegacy`。

## 测试

- `test/client-smoke.test.js`：
  - 基础清单夹具升级为 v3；概览页 5 条引用中 4 条有指纹、`#L11` 越界且
    无指纹，断言同时出现 `⚠ 1`、`◌ 1` 与覆盖率摘要；
  - 新增旧 v2 清单用例：只出现 `wikiCoverageLegacy`，不出现逐页 `◌`
    徽章。
- 全量 486 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 面板只读清单，不读源码：展示的是"是否有指纹可做漂移检查"，不是
  "内容是否已变化"；真正的漂移比较仍由 `repowiki-status` 完成。
- `hasDigests` 为 false 时不逐页显示徽章：旧清单全部未覆盖，逐页标记
  只会制造噪声；用一行降级说明代替。
- 未覆盖不扣健康分、不影响面板筛选；它是能力边界，不是缺陷。
- 引用问题与覆盖率使用同一套去重后的引用集合，避免两个数字口径不一。

## 验证

- `npm test`：486/486（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.20%、分支 86.65%、函数 95.19%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 徽章用弱化色而非错误色：未覆盖不是错误，只是无法验证。
- 摘要仅在覆盖率不完整或旧清单时出现，完整覆盖保持界面安静。
- 不把覆盖率放进页面筛选：面板已有"待更新"筛选，混入未覆盖会让
  "待更新"语义变模糊。

## 遗留 / 下一步

- 面板展示漂移徽章需要源码读取或状态快照，暂不做。
- 生成输出未覆盖原因分类（不可读 / 越界 / 读取上限）。
- 为超大清单设计分批校验，降低未覆盖比例。
