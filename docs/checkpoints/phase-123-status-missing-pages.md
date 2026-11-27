# 检查点：status 缺页计数（phase-123）

- 日期：2026-11-27
- 合入版本：v0.147.0
- 目标：`verify:wiki` 与面板已报告“清单登记但磁盘缺失”的页面，
  `repowiki-status` 仍只报 stale/orphaned/failed；诊断工具与门禁口径
  不一致，用户跑 status 会漏掉缺页。
- 状态：代码、测试、双语全量门禁完成；已提交并推送。

## 交付

- `src/tool-status.js`：
  - 由清单 slug 与磁盘页面 slug 计算缺失页，输出 `wiki.missing` 与
    `wiki.missingPages`（最多 10 个 slug）；
  - 文本 `Wiki:` 行追加 `missing N`；
  - 输出 schema 同步新增字段并加入 required；
  - 健康分保持原有 stale/orphaned 因子，缺页暂只报告不扣分。
- `test/status.test.js`：新增删除已生成模块页的用例，断言缺页计数、
  slug 列表、页面计数与文本。
- 双语文档、覆盖率报告、Runbook 同步。

## 测试

- `node --test test/status.test.js`：18/18。
- 全量 511 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 缺页按 slug 比较（页面 frontmatter 优先），与 `verify:wiki` 的
  `missingPages` 完全一致；清单缺失时 missing=0（无法判定）。
- 缺页不计入 `wiki.count`（count 仍是磁盘页面数），因此面板/统计不会
  把不存在的页面算作资产。
- 健康分暂不因缺页扣分：与生成失败页一致，先暴露事实，评分口径留待
  更多使用数据后再调整。
- 缺页与孤儿页互补：缺页在清单里、文件没了；孤儿在磁盘上、清单没有。

## 验证

- `npm test`：511/511（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.02%、分支 86.24%、函数 95.29%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 只输出前 10 个 slug：与 status 其他明细的上限一致，完整列表可读清单。
- 不自动删除缺失页的清单项：清单由 generate 重写，status 只读。
- 不把缺页加入 warnings：结构化字段与文本行已能表达，避免告警列表膨胀。

## 遗留 / 下一步

- 面板显示“Wiki 落后于卡片/记忆”（需要浏览器侧摘要实现）。
- 健康分是否纳入缺页/生成失败，留待评估。
