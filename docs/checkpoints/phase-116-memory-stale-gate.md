# 检查点：记忆陈旧门禁与资产必需（phase-116）

- 日期：2026-11-27
- 合入版本：v0.140.0
- 目标：v0.139.0 的陈旧检查只比较卡片 `inputDigest`，而
  `repowiki-generate` 的增量短路同时比较已采信记忆 `memoryDigest`，
  存在“生成认为要重跑、verify 认为新鲜”的口径分裂；此外门禁在没有任何
  Wiki 资产时默认通过，CI 中 root 写错或漏跑生成会被静默放过。
- 状态：代码、测试、双语全量门禁完成；已提交并推送。

## 交付

- `scripts/verify-wiki.mjs`：
  - `readMemories(root, locale)`：读取 `memory/<locale>/*.md`，只保留
    `status=accepted`，正文按 generate 相同规则去掉一级标题并 trim；
    slug 取文件名（与 `listMemory` 一致）。
  - `memoriesDigest(memories)`：`slug:body` 排序后 `digestText(…,16)`，
    与 generate 的 `memoryDigest` 同口径。
  - 陈旧判定拆为 `cardStale`/`memoryStale`，分别产出可行动的 issue；
    `staleReasons` 为 `cards`/`memory` 数组，文本报告输出
    `(stale: cards, memory)`。
  - 清单缺少 `inputDigest`/`memoryDigest` 时默认告警合并为一条
    （`manifest has no inputDigest/memoryDigest; stale check skipped`），
    `--strict` 时失败：陈旧性不可验证与“未验证指纹”同语义。
  - 新增 `--require`：没有任何 Wiki 清单时判失败（不再只告警）。
- `src/memory.js`：导出 `parseMemoryText`，门禁复用同一解析与 schema
  版本校验，避免复制 frontmatter 解析。
- `test/verify-wiki.test.js`：
  - 新增已采信记忆漂移用例：通过 → 改正文 → `staleReasons=['memory']`
    → 报告 `(stale: memory)`；另加 pending 条目不改变判定的断言。
  - 新增 `--require` 用例：空 root 默认通过、`requireAssets` 失败，
    CLI `--require` 退出码 1。
  - 卡片陈旧用例补充 `staleReasons` 与 `(stale: cards)` 断言；
    干净资产严格模式夹具补齐两个指纹。
- 双语文档、覆盖率报告、Runbook 同步。

## 测试

- `node --test test/verify-wiki.test.js`：10/10。
- 全量 502 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 记忆指纹只覆盖 `accepted` 条目：pending/rejected 不进入 generate 的
  输入，也不应让门禁判陈旧；条目从 accepted 变为其他状态会使指纹变化，
  这是预期（生成输入确实变了）。
- 单条坏记忆跳过而非中断：与 generate 的读取行为一致；如果坏条目原本
  参与过指纹，会导致不匹配并报陈旧，交由使用者修复。
- `--require` 只影响“完全没有清单”的情况；显式 `--locale en` 缺失清单
  原本就失败，两者不冲突。
- 旧清单缺指纹默认仍可通过（仅告警），保证升级期不被历史资产阻塞；
  需要强约束的流水线可同时使用 `--strict --require`。

## 验证

- `npm test`：502/502（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.11%、分支 86.36%、函数 95.17%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不新增清单字段：继续复用 generate 已写入的 `memoryDigest`。
- `staleReasons` 使用稳定短字符串（`cards`/`memory`），便于 CI 消费与
  文档化，不做本地化（CLI 输出保持英文）。
- 不复用 `ctx.fs` 版 `listMemory`：门禁是独立 Node CLI，直接读文件更
  轻量；解析逻辑通过导出 `parseMemoryText` 保持单一来源。

## 遗留 / 下一步

- GitHub Actions 示例：在 `repowiki-generate` 后运行
  `verify:wiki --strict --require`。
- 清单记录生成器版本，便于区分“输入变化”与“生成规则升级”。
