# 检查点：Wiki 引用跳转 v0.53.1（phase-26）

- 日期：2026-11-27
- 目标：把"被 Wiki 引用"从只读信息变成可导航入口——点击引用标题
  直接打开对应 Wiki 页面。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - 新增 `openWikiCitation(citation)`：按 slug 或标题匹配当前工作区的
    Wiki 页面，切换 `tab='wiki'` 并调用既有 `openWiki`（复用焦点管理）；
  - `DetailPane` 的引用标题改为按钮，保留"页面标题 · 章节"全文，
    带 `aria-label` 与下划线样式；匹配不到页面时安全无操作。
- 测试：`test/client-smoke.test.js` 新增端到端用例——打开 A 卡片 →
  点击"概览 · A 章节"→ 断言 Wiki 页面正文与返回控件出现。

## 验证（本地全量）

- `npm test`：290/290 通过。
- `npm run coverage:check`：行 97.61%、分支 85.9%、函数 93.62%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 复用既有 `openWiki` 与 Wiki 页签，不新增路由或数据面。
- 只按 slug/标题匹配已加载页面；页面被删除/改名时按钮点击无副作用，
  不伪造目标。
- 章节名保留在按钮文本中但不做页内滚动：当前 Markdown 渲染器没有稳定
  章节锚点 DOM，强行滚动会耦合排版实现；先完成页面级跳转。

## 遗留 / 下一步

- 章节级深链（需要渲染器输出稳定锚点）。
- 失败率统计进入 `repowiki-status`、目录级并行索引。
- 提交/推送与版本 tag 由用户确认后执行。
