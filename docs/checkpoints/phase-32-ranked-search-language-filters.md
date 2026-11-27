# 检查点：检索排序与语言过滤 v0.57.0（phase-32）

- 日期：2026-11-27
- 目标：让核心只读检索（`repowiki-cards`）从"子串过滤 + 索引顺序"升级为
  有等级的排序检索，并支持按语言/公开性收窄；面板同步提供语言筛选。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/assets.js` `searchIndex`：
  - 新增 `symbolMatchScore`：符号名精确 3 / 前缀 2 / 子串 1（大小写不敏感）。
  - 有 query 时符号按强度降序、同强度导出优先、再按定义行号排序；文件按
    最佳命中排序，同分按路径，输出稳定。
  - 无 query 时保持索引遍历顺序，避免无条件列举被重排（兼容旧行为）。
  - 新增 `lang` 与 `exportedOnly` 过滤；过滤后无命中符号的文件不返回；
    无 query 且无过滤时仍返回全部文件（含空符号文件），保持原语义。
- `src/tool-cards.js`：新增 `lang`、`exportedOnly` 参数并透传；描述补充
  排序语义；`presentCall` 的 rawInput 带新参数。
- `client.js`：面板工具栏新增语言下拉（索引含 >1 种语言时显示，选项带
  文件数），参与卡片列表过滤；语言列表随工作区变化重建，失效选择自动
  清空；`visibleCount` 在语言变化时回到第一页。
- 测试：
  - `test/assets.test.js`：排序（精确 > 前缀、导出优先、同分按行号）与
    `lang`/`exportedOnly` 过滤。
  - `test/tools.test.js`：工具层 `lang`/`exportedOnly` 透传与跨语言命中。
  - `test/client-smoke.test.js`：多语言索引渲染语言下拉并过滤列表；单语言
    索引不渲染下拉。

## 验证（本地全量）

- `npm test`：311/311 通过。
- `npm run coverage:check`：行 97.8%、分支 86.83%、函数 94.02%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 只在有 query 时排序：无 query 的列举是"浏览索引"语义，重排会让同一
  仓库在两次调用间顺序跳变；保持遍历顺序更可预期。
- `exportedOnly` 对没有 export 概念的语言（Python/Ruby/PHP 等）使用
  "可见性"近似（private/protected 标记为 false），在兼容矩阵与参数描述
  中如实说明。
- 面板语言选项带文件数、仅在多语言时出现：单语言仓库不需要多一个空控件。

## 遗留 / 下一步

- 目录级并行索引（大仓库吞吐）。
- Swift Package 目标级依赖、Scala 3 缩进语法成员归属。
- 提交/推送与版本 tag 由用户确认后执行。
