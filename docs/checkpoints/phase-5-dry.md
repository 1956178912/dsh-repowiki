# 检查点：DRY 重构（公共工具收敛）

- 日期：2026-11-26
- 版本：v0.15.0
- 目标："更深的优化迭代"——消除工具与渲染层重复的路径解析与
  frontmatter 编解码逻辑，收敛到单一公共模块。

## 完成情况

- 新增 `src/util.js`，四个公共函数：
  - `cwdOf(ctx)`：会话 cwd（`ctx.workingDirectory.get()` 可选服务，
    缺失/抛错降级 `process.cwd`）。原在 8 个工具文件各写一份。
  - `toAbsPath(target, cwd)`：相对/绝对路径解析 + POSIX 分隔符归一。
    原为 tool-export/tool-import 各自的 `resolveTarget`。
  - `encodeFrontmatter(meta)`：`---\n{JSON}\n---\n` 序列化。原在
    render.js（私有）、knowledge.js（cardFrontmatter）、memory.js
    （renderMemoryMarkdown 内联）三处同构。
  - `parseFrontmatter(text, schemaVersion?)`：frontmatter 解析（正则 +
    JSON + schemaVersion 校验，失败 null）。原为 knowledge.js parseCard
    与 memory.js parseMemoryText 两处同构（仅常量不同）。
- 收敛点：
  - 工具文件（index/cards/extract/generate/edit/export/import/memory）
    统一 `import { cwdOf } from './util.js'`，删除各文件内联定义。
  - export/import 同时用 `toAbsPath` 替换本地 `resolveTarget`，顺带
    移除仅为此保留的 `import * as path`。
  - render.js 两处调用改 `encodeFrontmatter`；memory.js 渲染与解析
    改公共函数；knowledge.js `parseCard` 变为单行委托。
  - 删除 `knowledge.cardFrontmatter`（合并后仅是薄包装）：tool-edit
    直接用 `encodeFrontmatter`（update 分支注释同步更名）。
- 行为等价性：正则、JSON.stringify 参数（null, 2）、分隔符归一与
  降级分支全部逐字保留；`toAbsPath` 参数额外 `String(target)` 包裹，
  对现有字符串调用方无行为差异。
- 净变更：11 个源文件 +24/−163 行（净 −139），重复逻辑归一。
- 测试：新增 `test/util.test.js` 9 条（cwd 三分支、toAbsPath 相对/
  绝对/空白裁剪、frontmatter 互逆、schemaVersion 不符、坏输入 null）
  → 套件 90/90 全绿。原 81 条无修改即通过（等价性佐证）。

## 设计决策

1. **合并而非保持三套**：frontmatter 编解码是格式契约（JSON + ---
   分隔 + schemaVersion），三处副本漂移的风险是真实的（v0.8.x 曾出现
   过客户端/服务端解析不一致的契约 bug）。单一实现 + 契约测试比
   "各自内联"更可靠。
2. **parseFrontmatter 参数化 schemaVersion 而非各自校验**：卡片与
   记忆的解析逻辑完全同构，差异仅在版本常量；参数化后调用方仍保留
   版本校验语义（parseCard 传 CARD_SCHEMA_VERSION）。
3. **客户端 client.js 的 parseCardText 保持内联**：浏览器端 bundle
   不能 import src/（加载机制是 `__ModuleLoader__` 工厂注入），且其
   解析不做版本校验（面板要展示任意版本卡片）。注释已标明同构关系。
4. **cardFrontmatter 删除而非保留薄包装**：DRY 的反面是无意义间接
   层；调用方直接用公共函数更清晰。

## 风险与遗留

- 本次为纯重构，无行为变更；等价性靠"原测试零修改通过" +
   新增契约测试双重保障。
- 方案覆盖率报告（docs/coverage.md）仍未做，计划下一小版本补。

## 下一步

- docs/coverage.md：逐条核对方案 §6.4 明列项与实现/文档对应关系。
- 重构小版本（v0.15.0）发布：CHANGELOG 已写，待推送 tag。
