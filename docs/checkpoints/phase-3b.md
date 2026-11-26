# 检查点：repowiki-edit 人工修订（补完方案 Phase 3 清单）

- 日期：2026-11-26
- 版本：v0.9.0
- 目标：方案 §6.4 Phase 3 明列的 `repowiki-edit`（人工修订）——v0.6.0 完成了
  导入导出与增量，但人工修订只有保护字段没有编辑入口。

## 完成情况

- `src/tool-edit.js`：第 8 个工具，两动作：
  - `create`：新建人工卡（title/body 必填、tags 可选）；`path` 可为索引外
    路径（孤儿人工卡）；frontmatter 带 `manuallyEdited: true` 与
    `sourceDigest: ""`（无源锚点）。
  - `update`：命中现有卡片（frontmatter `path` 定位）；title/tags 覆盖、
    body 提供则替换（未提供保留原正文）；保留 path/lang/locale/createdAt
    等原元数据，置 `manuallyEdited: true`。
- `src/knowledge.js`：导出 `cardFrontmatter`（与 render.js 同构的
  `---\n{json}\n---\n` 拼接），人工卡与自动卡 frontmatter 形态一致。
- 失败路径可读提示：缺 path/title/body、slug 化失败、update 未命中、
  旧卡不可读。
- 测试：create/update 端到端 round trip + 全部失败提示（76/76 全绿）。

## 设计决策（对方案的落实方式）

1. **state.json 标记折入 frontmatter**：方案原列"同名工具落盘为文件操作
   + state.json 标记"。实现把 `manuallyEdited` 直接写进卡片 frontmatter：
   状态与资产同体，天然随 Git 共享、导入导出原样携带，且无状态文件
   一致性问题（方案 state.json 的待审候选/孤儿标记等字段需求分别由
   memory 条目状态（Phase 4）与"索引外路径不进入 candidates"覆盖）。
2. **孤儿人工卡天然保留**：导入导出按整目录拷贝（v0.6.0），人工卡随
   资产目录原样迁移；extract 的候选只来自 index.files，索引外路径不会
   被自动刷新；索引内的人工卡由 `manuallyEdited` 保护跳过。无需额外
   的 `knowledge/{lang}/orphans/` 分区。
3. **update 只改提供字段**：最小惊讶原则——未传 body 时保留原正文，
   避免工具误清空。

## 风险与遗留

- 人工卡 update 是整文替换（无 patch 语义）；大卡片全文重写成本高时
  可再引入追加动作。
- 方案提到的"外部编辑器直接改 .dsh-repowiki/ 后的 mtime/hash 对比同步"
  未实现：资产以面板/工具刷新为准（digest 机制在 extract 侧覆盖了
  工具写盘路径的一致性）。

## 下一步

- 方案 §6.4 全部明列项已完成（Phase 1-3 + Phase 4 memory；可选语义
  索引按方案保持后置）。剩余为记忆消费侧与 UI 切片 2（受跨工作区
  读取限制）。
