# 检查点：Qoder Repo Wiki 对齐 + O5 并发写串行化（v0.43.0）

- 日期：2026-11-27
- 目标：吸收 Qoder Repo Wiki 参考产物的两项高价值能力（可溯源引用、
  模块层级），同时把 phase-16 评审遗留的 O5（并发无保护）从约定升级为机制。
- 状态：完成，待提交/推送。

## 需求来源

用户提供 `/Users/wangchenyu/Workspace/AITester/.qoder/repowiki`（Qoder 生成）
作为参考，并要求"所有"方向：内容质量、模块层级、工程加固一并落地；引用
形式选择"相对路径 + 行号"（不采用会随迁移失效的 `file:///` 绝对链接）。

## 交付

### 1. O5 并发写串行化（ADR-0005）

- `src/lock.js`：per-root promise 链锁，同根 FIFO、不同根并行、错误隔离、
  队列排空清理。
- 接入全部写路径：index / extract / generate / import / edit / memory
  （write、accept、reject）；cards / export / memory list 保持只读不加锁。
- 回归：`test/lock.test.js`（原语 4 例 + 工具接线 5 例）、
  `test/tool-llm.test.js`（持锁时 extract/generate 不派发子代理）。

### 2. 内容可溯源（ADR-0006）

- 卡片：`> 源文件 / Source: `path``；关键符号按索引符号补 `Lx-Ly` 行号。
- Wiki：自动生成页级"本文引用的文件"、目录（≥2 节）、每节"章节来源"；
  中英标签随 locale；重复标题锚点去重。
- `wikiOutputSchema.sections[].sources`（可选数组）；`sanitizeSources` 以
  索引/卡片路径为白名单，只保留合法的相对路径 + `#Lx-Ly`，拒绝未知路径、
  穿越与注入文本。

### 3. 模块层级（ADR-0006）

- `src/modules.js`：`moduleOf`（深度 2）、`parentModule`、`buildModules`
  （祖先占位、直属计数、稳定排序）、`sortModules`。
- `index.json` 增量新增：`files[].module`、`modules[]`、`stats.modules`；
  `schemaVersion` 保持 2（旧索引兼容）。
- `repowiki-cards`：`module` 过滤（含子模块）+ 输出 `modules`。
- `repowiki-extract`：写 `knowledge/<locale>/_index.json`（模块 → 卡片 slug
  清单，派生视图；失败记入 failed 不推翻已写卡片）。

### 4. 面板

- 卡片页签新增"按模块分组"开关：按 `module`（旧索引按路径推导）分组，
  根目录标题本地化；与网格/列表视图组合工作。
- 回归：`test/client-dom.test.js` 真实 click 切换分组。

## 验证

- `npm test`：165/165 通过。
- 既有 141 用例全部保留并通过；新增 24 例覆盖锁、模块、引用净化、
  清单与面板锚点/分组。
- 覆盖率与宿主令牌自检见发布提交记录（`npm run test:coverage`、
  `npm run verify:host`）。

## 遗留

- 模块级五类卡（Qoder 形态）与导入/导出对 `_index.json` 的显式清单校验；
- 浏览器侧渲染验证（分组开关与引用块的视觉间距）按 phase-15 清单人工冒烟；
- 语义索引仍按方案后置（YAGNI）。
