# 检查点：检索分页（phase-136）

- 日期：2026-11-27
- 合入版本：v0.160.0
- 目标：`repowiki-cards` 只有 `limit`，超出即截断，无法继续取后续结果；
  大仓库里模型只能换 query 或缩小范围，无法稳定翻页。文档检索（BM25）
  同样只能看第一页。
- 状态：代码、原语/工具测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/assets.js` `searchIndex`：新增 `offset`（≥0，默认 0），返回
  `total` 仍为全集，`truncated = total > offset + limit`，结果切片
  `[offset, offset+limit)`；其余过滤/排序口径不变。
- `src/search.js` `rankDocuments`：同样的 `offset` 语义，BM25 排序后切片。
- `src/tool-cards.js`：
  - 参数 `offset`；对符号结果与文档结果同时生效。
  - 输出新增 `offset`（输出 schema 必填），无索引降级也返回 0。
  - 文本尾部从“showing the first N”改为“showing start–end”，offset 非 0
    时也显示区间；最后一页 `truncated=false`。
- 测试：
  - `test/assets.test.js`：符号检索中间页/末页、total 不变。
  - `test/search.test.js`：BM25 中间页/末页、同分排序稳定。
  - `test/tools.test.js`：cards 工具返回 `offset`、不同页路径不同、
    渲染 `showing 3–3`。
- README 双语能力表、覆盖率报告、CHANGELOG 同步。

## 语义边界

- `truncated` 语义收紧为“本页之后仍有结果”，不再表示“总数超过 limit”：
  offset 末页即使 total 很大也不会误报还有下一页。
- `offset` 超过 total 时返回空数组、total 不变、truncated=false；调用方
  可据此判断越界，不抛错。
- 分页只作用于结果列表；`references`/`imports`/`dependents` 等附件的
  100 条上限不受影响（它们按命中文件计算）。
- `presentResult` 的 `total` 仍为全集；未新增 page 字段，避免破坏官方
  `card:'search'` 视图契约。

## 测试

- `node --test test/assets.test.js test/search.test.js test/tools.test.js`：38/38。
- 全量 524 例（LANG=en 与 LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：524/524（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.06%、分支 86.61%、函数 95.35%。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不引入 cursor/游标：索引是本快照，offset 足够且更易解释；资产重建后
  offset 仍按新集合计算，调用方应重跑查询。
- 不把 offset 应用到 references/imports 附件：它们是命中文件的派生关系，
  分页会让“这些关系属于哪个文件”失真。
- 不新增独立分页工具：参数与输出都与既有 `limit` 同处，学习成本最低。
