# 检查点：符号级反向引用 v0.48.0（phase-20）

- 日期：2026-11-27
- 目标：补齐"定义 → 引用"的检索闭环，让知识库能回答"这个符号被哪些
  文件 import/use/require"，并在面板中直接可见。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

### 1. 反向引用纯函数模块

- 新增 `src/references.js`：
  - `buildReferenceIndex(edges)`：把 `目标文件 → 符号 → 引用方` 反转成
    排序数组；跳过自引用、空符号边与坏边。
  - `referencesFor(index, matches, limit)`：只为检索命中的符号收集引用，
    默认上限 `MAX_REFERENCE_ENTRIES=100` 并返回 `truncated`。
- 语义边界：import/use/require 级引用，不是调用图/类型使用/反射；
  无法解析的外部导入本来就不在 `edges` 中。

### 2. 工具与面板

- `repowiki-cards` 新增 `references` 布尔参数；输出
  `references: [{path, symbol, referencedBy}]` 与 `referencesTruncated`；
  文本渲染追加 `References:` 段（最多 10 条 + 截断提示）。
- 面板详情（`client.js`）新增"被引用（import 级）"区：由已加载的
  `index.edges` 计算，无额外 Remote 读取；展示符号与引用方文件，超过
  8 条显示剩余数量。

### 3. 测试

- `test/references.test.js`：归并排序、自引用/空符号/坏边跳过、上限截断、
  空命中降级。
- `test/tools.test.js`：端到端索引 → `references=true`，验证 parse/format
  两个符号的引用方、默认关闭、`target=docs` 空数组。
- `test/client-dom.test.js`：真实 React + jsdom 点击 `src/schema.js` 卡，
  断言详情出现 `CARD_SCHEMA_VERSION` 与引用方 `src/card-schema.js`。

## 验证（本地全量）

- `npm test`：268/268 通过。
- `npm run coverage:check`：行 97.60%、分支 85.93%、函数 93.01%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。
- 真实仓库只读验证（不写资产）：85 文件 / 349 符号 / 180 边，索引 30ms；
  `writeTextVerified` 的反向引用为 `src/assets.js`、`src/knowledge.js`、
  `src/memory.js`、`test/write-verify.test.js`，与源码事实一致。

## 关键决策与取舍

- 查询期反演而非写入新索引字段：不改变 `index.json` schema（仍为 v4），
  避免索引体积与版本迁移成本；`edges` 已是权威数据。
- 只返回 import 级引用并明确标注：不把"文件引用"冒充"调用点"；需要
  调用图时应引入 LSP/编译器级分析，当前零依赖约束下不做。
- 输出有界（100 条）：与其它检索工具的有界输出原则一致。

## 遗留 / 下一步

- v0.49 候选：引用方按符号聚合的跨文件视图、Wiki 章节引用反查、
  C#/Kotlin/PHP 扩展、目录级并行索引（需先验证 `ctx.fs` 并发安全）。
- 浏览器侧视觉冒烟（反引用区、长列表）按 phase-15 清单人工确认。
- 提交/推送与版本 tag 由用户确认后执行。
