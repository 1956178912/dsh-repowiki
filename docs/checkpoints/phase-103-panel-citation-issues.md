# 检查点：面板引用问题徽章（phase-103）

- 日期：2026-11-27
- 合入版本：v0.127.0
- 目标：v0.126 已能在 `repowiki-status` 中报告引用行号越界，但面板里看不到。
  本轮把可判定的引用问题带到 Wiki 页签，让文档作者不必先跑状态工具。
- 状态：代码、客户端桩测试、全量门禁完成；已提交并推送。

## 交付

- `client.js`：
  - 新增 `parseCitation`：与 `src/wiki-references.js` 同形的引用解析
    （`#Lx` / `#Lx-Ly` / `#Lx-y`，无法识别时只保留路径）；
  - 新增 `citationIssuesFor(meta, lineCounts)`：统计页面级与章节级引用，
    索引有行数时判定越界，否则计入 unchecked；
  - `applyWikiManifest` 增加索引参数，为每个 Wiki 页面附加
    `outOfRange` / `unchecked`；调用点传入已加载的索引；
  - Wiki 列表头部展示汇总（`引用问题：N 处行号越界 · M 处未检查`，
    `role=status`）；页面行在越界时显示 `⚠ N` 徽章，带可访问 title。
- 客户端只做索引内可判定的事：文件系统存在性检查（缺失引用）仍由
  `repowiki-status` 负责，面板不冒充断链。
- 中英文案键：`wikiIssueSummary`、`wikiRangeBadge`、`wikiRangeHint`。

## 测试

- `test/client-smoke.test.js`：
  - 夹具索引补充 `lines`（a.js 10 行等）；
  - Wiki 页签用例断言汇总键与 `⚠ 1` 徽章（清单中 `a.js#L11` 超出 10 行）。
- 既有 471 例全部通过，无新增用例计数变化。

## 语义边界

- 越界判定只基于索引记录的 `lines`；旧索引（v5 及以下）没有行数时全部
  计入 unchecked，不显示越界徽章。
- 面板不读取被引用文件本身，因此"文件不存在"不在面板判定；需要该结论
  时运行 `repowiki-status`。
- 徽章是提示而非阻断：打开页面、搜索与深链行为不变。

## 验证

- `npm test`：471/471（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.18%、分支 86.36%、函数 95.29%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过（客户端 DOM 类型检查覆盖）。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不在面板做 fs 存在性检查：跨工作区远程读取每个引用会增加大量调用，
  且错误码语义（无权限/不存在）需要区分；状态工具已经覆盖，面板保持轻量。
- 汇总与徽章都走文案字典，不在 JSX 里拼中文/英文；数字通过 `tt` 插值。
- 只用 `⚠` 文本而非图标组件，保持零依赖 UI。

## 遗留 / 下一步

- 可在页面详情内展示具体越界条目（当前列表徽章 + 状态工具足够定位）。
- 项目若需要，可把面板引用问题纳入健康分展示。
