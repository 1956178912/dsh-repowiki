# 检查点：兼容矩阵版本守卫（phase-135）

- 日期：2026-11-27
- 合入版本：v0.159.0
- 目标：`docs/compatibility.md` 是用户核对旧资产可读性的权威表，却长期
  声明索引 schema v5、Wiki 清单 v2；代码已分别升到 v6（行数）与 v3
  （输入/记忆指纹、引用指纹、失败页）。Runbook 还写着“v2 会自动升级到
  v3”。版本号纯手工维护，升级常量时容易再次漂移。
- 状态：文档、常量集中、守卫测试与检查点更新；待全量门禁与提交。

## 交付

- `docs/compatibility.md`：
  - 索引 v6：`files[].lines`、`edges[].line`、`stats.skipped`/
    `skippedTooLarge`；可读 v2–v5，旧索引行号越界检查降级。
  - Wiki 清单 v3：`inputDigest`/`memoryDigest`、`citationDigests`/
    `citationMisses`、`failed`/`failedTotal`；v1/v2 按可得字段降级。
  - 知识清单 v2、卡片/记忆 v1、`repowiki-plan.json` 字段与损坏降级。
- `docs/runbook.md`：索引不兼容时改为“可读 v2–v5，重建后写 v6”。
- `README.md` / `README.zh-CN.md`：当前能力描述中的边版本改为 v6；
  历史路线图条目保留 v5（记录引入版本）。
- `src/schema.js`：新增 `KNOWLEDGE_INDEX_SCHEMA_VERSION=2` 与
  `WIKI_MANIFEST_SCHEMA_VERSION=3`；`tool-extract`/`tool-generate`
  改用常量，不再写内联数字。
- `test/docs-consistency.test.js`：把兼容矩阵的索引/知识清单/Wiki 清单/
  卡片/记忆版本与常量绑定，任一漂移即失败。

## 语义边界

- 守卫只校验版本数字出现在对应行，不解析整张表；表结构大改时需要同步
  调整正则，这是刻意保持的低成本约束。
- 历史 ADR/检查点/路线图不批量改写：它们记录当时的格式，不是当前契约。
- 不修改资产读取逻辑：本轮只让文档与常量说真话。

## 测试

- `node --test test/docs-consistency.test.js`：1/1。
- `node --test test/verify-wiki.test.js`：19/19。
- 全量 523 例（LANG=en 与 LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：523/523（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.03%、分支 86.52%、函数 95.35%。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不为知识清单/Wiki 清单新建独立 schema 模块：常量放 `src/schema.js`
  与既有 `CARD_SCHEMA_VERSION`/`INDEX_SCHEMA_VERSION` 同处，单一来源。
- 不在 README 展开全部资产格式：兼容矩阵是单一权威表，README 只保留
  能力摘要，避免两处维护。
- 不自动重写历史文档：追溯价值大于“全仓库版本号一致”的表面整洁。
