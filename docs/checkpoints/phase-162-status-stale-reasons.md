# 检查点：status 结构化 Wiki 陈旧原因（phase-162）

- 日期：2026-11-28
- 合入版本：v0.186.0
- 目标：`repowiki-status` 的 `wiki.stale` 只统计页面输入指纹不匹配的
  页面数。依赖图（`graphDigest`）或已采信记忆（`memoryDigest`）变化时，
  页面级计数可能仍为 0，消费方只能从自然语言告警里判断原因；而
  `verify:wiki` 已输出结构化的 `staleReasons`，两处口径不一致。
- 状态：代码、测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/tool-status.js`：
  - 把结构指纹判定提取为 `graphStale`，已采信记忆判定提取为
    `memoryStale`；
  - 组装 `wikiStaleReasons`（`cards` → `graph` → `memory`，与
    `verify:wiki` 同值域同顺序）；
  - 输出 schema 的 `wiki` 增加可选 `staleReasons`（枚举
    `cards`/`graph`/`memory`）；
  - `Wiki:` 文本行在 `stale N` 后追加 `(cards, graph, memory)`；
  - 原告警全部保留。
- `test/status.test.js`：图陈旧夹具断言 `['graph']` 与渲染 `stale 0
  (graph)`；记忆陈旧夹具断言 `['memory']` 与渲染标注。

## 语义边界

- `cards` 对应页面输入指纹（生成时的卡片摘要）不匹配；与
  `verify:wiki` 的卡片整体 `inputDigest` 检查同源，但不重复读取卡片
  之外的输入。
- `graph`/`memory` 只在清单记录了对应指纹时判定；旧清单缺字段不误报。
- 原因数组只在非空时输出，新鲜 Wiki 的 JSON 形状保持不变。
- 健康分口径不变：本节只增加可观测性，不引入新的扣分项。

## 验证

- `LANG=en node --test --test-name-pattern="结构指纹不一致|已采信记忆变化" test/status.test.js`：
  通过。
- 全量门禁：`npm test`（双语言 574/574）、`coverage:check`（行 98.16 /
  分支 87.01 / 函数 95.41）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
