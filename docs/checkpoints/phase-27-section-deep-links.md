# 检查点：Wiki 章节级深链 v0.53.2（phase-27）

- 日期：2026-11-27
- 目标：引用跳转不止打开页面，还定位到被引用的章节。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - 新增 `wikiTargetSection` 状态；`openWikiEntry(entry, section)` 统一
    处理页面 + 目标章节；
  - 详情引用跳转传入 `citation.sections[0]`；手动选页/返回清空目标；
  - `WikiPanel` 在页面渲染后按 `anchorOf(targetSection, new Map())`
    计算锚点并 `scrollIntoView({ behavior:'smooth', block:'start' })`；
    与 `renderMarkdown` 标题 id 使用同一函数，避免锚点漂移。
- 测试：`test/client-smoke.test.js` 在引用跳转用例中注入
  `document.getElementById` 桩，断言滚动到 `a-章节`。

## 验证（本地全量）

- `npm test`：290/290 通过。
- `npm run coverage:check`：行 97.62%、分支 85.9%、函数 93.64%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 复用现有标题锚点函数，不在 Markdown 里额外写 HTML id；渲染与跳转
  共用同一套 slug 规则。
- 只跳首个被引用章节：一个文件可能被同页多节引用，首个已能回答
  "文档在哪里提到它"；多节高亮留待后续。
- 无 DOM/页面缺失时安静跳过，不抛错。

## 遗留 / 下一步

- 多章节引用时列出可点击章节 chips。
- 失败率统计进入 `repowiki-status`、目录级并行索引。
- 提交/推送与版本 tag 由用户确认后执行。
