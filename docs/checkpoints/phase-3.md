# 检查点：Phase 3 增量更新内核（digest 机制）

- 日期：2026-11-26
- 版本：v0.5.0
- 目标：Phase 3 的第一步——以内容摘要（digest）驱动索引增量重建与知识卡片失效检测。

## 完成情况

- `src/schema.js`：新增 `DIGEST_CHARS = 12`（sha256 前 12 位 hex，48-bit）；
  `INDEX_SCHEMA_VERSION` 1 → 2（v1 索引读取侧按既有约定降级为"请重建"，
  首次升级自然全量重建并写入 digest）。
- `src/indexer.js`：导出 `digestText`（`node:crypto` 内置，零第三方依赖）；
  `buildIndex` 新增 `opts.previous`：旧条目按 path 建表，digest 相同的文件
  直接复用其 `symbols` / `imports`（CPU 大头在提取，读盘不可省）；`stats`
  新增 `reused` 计数；文件条目新增 `digest` 字段。
- `src/tool-index.js`：execute 先 `readIndex` 作为增量基准（旧版本或
  `incremental: false` 时全量）；工具描述、参数（`incremental`）、输出
  schema（`reused`）与 render 文案同步。
- `src/render.js`：卡片 frontmatter 新增 `sourceDigest`（缺省空串）。
- `src/tool-extract.js`：跳过逻辑由"有卡即跳"改为 `cardIsFresh(fileMeta,
  prior)`——源 digest 匹配才跳过，源变化或老卡（无 digest）自动重提取；
  `skippedExisting` 改为真实跳过计数（原为 existing.size）。
- 测试：indexer 增量复用/变化/删除三路径 + digestText 稳定性；工具层
  reused 与 incremental=false；cardIsFresh 六分支；frontmatter
  sourceDigest 渲染（61/61 全绿）。

## 设计决策

1. **digest 而非 mtime**：mtime 跨机器/克隆不可靠且 Git 不携带；内容摘要
   随 index.json 共享，跨会话与跨机器一致。取 12 位 hex：碰撞概率对"文件
   是否变化"判定可忽略，且控制随 Git 共享的 index.json 体积。
2. **复用粒度 = 文件条目**：读盘仍需逐文件进行（摘要必须重算），省的是
   符号提取与 import 解析（CPU）；对大仓库收益最明显。
3. **卡片失效以文件 digest 为锚**：frontmatter 的 sourceDigest 与 index
   条目 digest 直接可比，无需读取卡片正文即可判定（面板切片 3 的"有可用
   更新"提示可直接复用该字段）。
4. **schemaVersion bump 到 2**：新增 digest 是字段级变更；读取侧
   （readIndex）已有版本校验降级，老索引自然触发一次全量重建，避免
   半新半旧的混合状态。

## 风险与遗留

- 首次升级（v0.4.0 及之前）的卡片没有 sourceDigest，第一次 extract 会
  全部重提取一次——预期内的一次性成本。
- digest 不覆盖文件重命名（重命名后 digest 相同但 path 变化，按新文件
  处理，旧卡片成为孤儿）；孤儿卡片清理留给后续。
- 未实现：`.dsh-repowiki/` 导入导出、人工修订卡片标记（manuallyEdited
  字段已存在但流程未落地）、commit/diff 监听。

## 下一步

- 面板侧"有可用更新"提示（切片 3）可直接消费 digest 差异，等用户确认
  v0.4.0 GUI 渲染后排入。
- Phase 3 剩余：导入导出、人工修订流程；Phase 4 会话记忆提炼另议。
