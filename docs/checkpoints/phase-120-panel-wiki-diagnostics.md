# 检查点：面板 Wiki 诊断（phase-120）

- 日期：2026-11-27
- 合入版本：v0.144.0
- 目标：v0.143.0 已把生成失败页写入清单、v0.141.0 已能检测清单缺页，但
  这些信息只在 CLI（verify:wiki/status）可见；面板 Wiki 页签看不到，用户
  需要离开 GUI 才能发现“上次生成失败/页面被删”。
- 状态：代码、面板测试、双语全量门禁完成；已提交并推送。

## 交付

- `client.js`：
  - 新增 `wikiDiagnostics(entries, manifest)`：从清单派生
    `failedTotal`、失败页示例（≤5）与 `missingTotal`、缺失页示例（≤5）；
    缺失判定基于已加载目录列表的 `entry.file` 与清单 `page.path`，不读源码。
  - `RepoWikiPanel` 新增 `wikiMeta` 状态；装载成功时写入，空闲/无会话/
    无资产时清空。
  - `WikiPanel` 接收 `meta`，在搜索框下方、引用摘要上方显示两条
    `role=status` 提示：`wikiFailedSummary` 与 `wikiMissingSummary`；
    `title` 分别给出 `wikiFailedHint`/`wikiMissingHint` 的 slug 明细。
  - 页面列表为空时同样渲染诊断，再显示“尚未生成”，避免最需要诊断的
    状态反而看不到原因。
- 新增中英文文案 `wikiFailedSummary`/`wikiFailedHint`/
  `wikiMissingSummary`/`wikiMissingHint`。
- `test/client-smoke.test.js` 新增面板用例：注入带 `failedTotal` 与缺失
  页的清单，断言两条提示与可访问 title。
- 双语文档、覆盖率报告、Runbook 同步。

## 测试

- `node --test test/client-smoke.test.js`：31/31。
- 全量 507 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 提示是“清单级”摘要，不是逐页状态：失败页可能没有磁盘文件，无法在
  列表项上标记；缺失页也只存在于清单里。
- `failedPages`/`missingPages` 只展示前 5 个 slug，数量用完整计数；
  完整明细仍在清单文件与 `verify:wiki --json`。
- 数据只来自已读取的清单与目录列表，不新增 Remote 调用、不读取源码，
  面板保持只读。
- 诊断不参与搜索/筛选：筛选只作用于页面列表，避免用户误以为提示可被
  过滤掉。

## 验证

- `npm test`：507/507（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.06%、分支 86.38%、函数 95.16%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 用 `role=status` 而不是弹窗/阻塞提示：诊断是信息性的，旧页面仍可读，
  不应打断浏览。
- 错误色仅用于文字而非整块背景：与现有引用问题徽章的视觉层级一致，
  避免面板过度告警。
- 不把失败页计入健康分或自动触发重新生成：面板只呈现事实，动作仍由
  用户通过生成按钮发起。

## 遗留 / 下一步

- 面板显示“Wiki 落后于卡片/记忆”（需要浏览器侧同步 sha256 或异步摘要）。
- GitHub Actions 示例：仓库内 fixture 上运行
  `verify:wiki --strict --require`。
