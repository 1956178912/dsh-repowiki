# 检查点：抽取运行诊断 v0.54.0（phase-28）

- 日期：2026-11-27
- 目标：让"上次抽了多少、失败/重试多少、是否截断、并发与耗时"可查，
  而不是只存在于上一次工具返回值里。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/tool-extract.js`：知识清单升至 schema v2，新增 `lastRun`：
  `generatedAt / extracted / skippedExisting / skippedManual / skippedSimple /
  orphaned / failed / retried / capped / concurrency / attempts / durationMs`；
  孤儿计数在写清单的同一临界区内完成，避免快照与分子不一致。
- `src/knowledge.js`：新增 `readKnowledgeIndex`（缺失/损坏/形状不符返回 null）。
- `src/tool-status.js`：读取清单并输出 `lastExtract`；渲染
  `Last extract: …`，缺失时 `Last extract: none`。
- 兼容矩阵：知识清单 v2（v1 仍可读）。

## 验证（本地全量）

- `npm test`：292/292 通过。
- `npm run coverage:check`：行 97.62%、分支 85.7%、函数 93.65%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 复用知识清单而非新增状态文件：清单本就是抽取产物，随 Git 共享，
  不引入额外文件与迁移。
- 快照是"最近一次"而非历史：历史趋势需要额外存储/轮转，当前诊断
  场景不需要（YAGNI）。
- 状态工具只读、容错：清单缺失/损坏不影响其它诊断项。

## 遗留 / 下一步

- 面板展示 lastExtract（需要客户端读取知识清单）。
- 目录级并行索引、Ruby/Swift/Scala 扩展。
- 提交/推送与版本 tag 由用户确认后执行。
