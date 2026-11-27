# 检查点：面板路径非法提示（phase-129）

- 日期：2026-11-27
- 合入版本：v0.153.0
- 目标：`verify:wiki` 与 `repowiki-status` 已能发现清单路径非法/与文件
  位置不符，面板仍只显示失败页/缺页/陈旧；用户可能在面板看到“缺页”
  却不知道是路径本身写坏。
- 状态：代码、面板测试、双语全量门禁完成；已提交并推送。

## 交付

- `client.js`：
  - `wikiDiagnostics(entries, manifest, locale)` 新增 `invalidTotal` 与
    `invalidPages`（≤5）：路径以 `/` 开头、含 `..`、不以
    `wiki/<locale>/` 开头、非 `.md`，或与已加载文件的 `file` 不符。
  - 非法路径同时从 `missingTotal`/`missingPages` 中排除，避免同一页被
    报成“缺页 + 路径非法”。
  - 诊断块新增 `wikiInvalidSummary`（`role=status`，错误色），title 为
    `wikiInvalidHint` 的 slug 明细；空列表时同样显示。
  - 调用改为传 `wikiPages`（含 slug/file）与选定 locale。
- 新增中英文文案 `wikiInvalidSummary`/`wikiInvalidHint`。
- `test/client-smoke.test.js` 新增用例：清单路径 `../secret.md`，断言
  非法提示出现、缺页提示不出现。
- 双语文档、覆盖率报告、Runbook 同步。

## 测试

- `node --test test/client-smoke.test.js`：34/34。
- 全量 517 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 面板只做路径形状与“slug 对应文件位置”校验，不读源码、不探测链接；
  页面内部死链仍由 `verify:wiki` 负责。
- 非法路径优先于缺页：两者都来自清单，路径坏时“缺页”只是表象。
- 真正的缺失页（路径合法但文件不存在）仍单独提示；孤儿页只保留列表
  标记，不进入诊断计数。
- 清单缺失时不产生路径诊断（无法判断）。

## 验证

- `npm test`：517/517（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.01%、分支 86.51%、函数 95.36%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不在面板做内部链接探测：需要读取任意资产目标并请求目录列表，复杂度和
  远程调用成本都高；面板保持轻量。
- 不把路径非法计入健康分：先与缺页区分，评分的进一步调整留待评估。
- 复用 `wikiDiagnostics` 而不是新增状态：诊断数据同源，避免多处口径漂移。
