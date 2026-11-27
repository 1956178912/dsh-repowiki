# 检查点：重复页诊断对齐（phase-133）

- 日期：2026-11-27
- 合入版本：v0.157.0
- 目标：v0.156.0 让 `verify:wiki` 能拦截重复页面 slug/清单条目，但
  `repowiki-status` 仍会在 `wiki.count` 中把同 slug 的两个文件算成两页，
  面板也完全不提示；门禁失败后用户无法在会话或 GUI 里定位。
- 状态：代码、status/面板测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/tool-status.js`：
  - 从清单原始条目统计重复 slug/路径（去重前），从 `wikiPages` 统计磁盘
    同 slug 文件（`diskSlugCounts`）；输出
    `wiki.duplicate`、`wiki.duplicateSlugs`、`wiki.duplicatePaths`
    （各上限 10）。
  - `duplicate` = 重复 slug 数 + 重复清单路径数（同一 slug 的清单与磁盘
    重复只计一次）。
  - 文本 `Wiki:` 行追加 `duplicate N`；输出 schema 增加三个必填字段。
- `client.js`：
  - `wikiDiagnostics` 从已加载页面与清单派生同口径重复计数，不新增远程
    读取；返回 `duplicateTotal`/`duplicateSlugs`/`duplicatePaths`。
  - Wiki 页签诊断区新增 `wikiDuplicateSummary`（`role=status`，错误色），
    tooltip 列出前 5 个重复 slug/路径；中英文案同步。
- `test/status.test.js`：新增清单重复 slug（不同路径）+ 磁盘同 slug 文件
  用例，断言 `duplicate 1`、slug 列表与文本行。
- `test/client-smoke.test.js`：新增重复清单页提示用例。

## 语义边界

- 状态与面板都是只读诊断：不修改、不重命名、不删除重复页。
- 面板只使用已加载目录与清单，不读源码、不探测链接；重复判定与门禁
  的 slug/path 字符串口径一致（路径统一 `/`）。
- `duplicate` 是“问题项”计数而非“多余文件数”：同一 slug 在清单与磁盘
  同时重复只报一次。
- 健康分暂不因重复页扣分：缺页已有独立权重，重复页先作为可见诊断，
  避免在未验证用户体感前叠加扣分。
- 孤儿/缺失统计保持原口径（Map 后者覆盖），重复错误负责显式暴露被覆盖
  文件。

## 测试

- `node --test test/status.test.js`：20/20。
- `node --test test/client-smoke.test.js`：35/35。
- 全量 521 例（LANG=en 与 LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：521/521（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.03%、分支 86.44%、函数 95.35%。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不在健康分里加重复页扣分：重复通常来自手工合并/复制，先修资产即可；
  评分模型保持可解释的四个既有分量。
- 不在面板做文件系统探测：重复只依赖已加载列表，保持轻量。
- 清单重复路径与重复 slug 合并为同一 `duplicate` 计数，避免文案过长；
  明细通过 tooltip 与实际列表展示。
