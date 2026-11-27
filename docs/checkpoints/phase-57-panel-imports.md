# 检查点：面板依赖列表 v0.82.0（phase-57）

- 日期：2026-11-27
- 目标：`repowiki-cards imports=true` 已能回答"这个文件依赖谁"，但面板
  详情只有反向引用；用户最常用的界面与工具能力出现落差。补齐面板出边，
  并顺带标记双向依赖，让两文件成环一眼可见。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - 新增 `importsForPath(index, path)`：按索引边顺序收集出边，跳过自引用，
    副作用导入保留（符号为空），`mutual` 标记目标文件也反向引用本文件
    （与 `src/references.js` 的 `importsFor` 同语义，另加双向标记）；
  - `detailImports` 派生值 + `DetailPane` 新 prop `imports`；
  - 详情新增"依赖文件（import 级）"区块：`→ path:Lx (symbols)` /
    `↔ path`，最多 8 行 + `另有 N 个`；
  - 双语 UI 文案 `detailImports` / `detailImportsMore`。
- 测试：
  - `test/client-smoke.test.js` 语料索引补 `a.js → c.js` 与 `c.js → a.js`
    双向边，详情断言标题、`↔`、`c.js:L3`、符号 `(z)`；
  - `test/client-dom.test.js` 新增真实 React + jsdom 用例：打开
    `src/indexer.js` 详情，断言 `detailImports`、`src/symbols.js`、
    `extractSymbols`（真实语料出边）。
- 文档：两份 CHANGELOG、README 双语（stage/面板能力行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：356/356 通过。
- `npm run coverage:check`：行 97.92%、分支 87.29%、函数 94.65%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过（含 `tsconfig.client.json`）。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **面板内联实现而非 import src 模块**：`client.js` 是独立的浏览器端
  bundle，跨端 import 会把 node 侧模块打进 UI；沿用既有
  `referencesForPath` 的写法，前端保持自包含（语义与 src 对齐并在注释
  中说明）。
- **`↔` 而不是另起"循环"区块**：双向边是循环的最短形态，符号标记成本
  最低；更大的环由 `repowiki-status` 的 SCC 报告负责，避免面板重复计算
  全图。
- **保留副作用导入**：与工具侧 `imports=true` 语义一致——出边关注文件
  关系；无符号时只显示目标路径。
- **上限 8 + more**：与反向引用区块一致，详情列不被大 barrel 文件撑爆。
- **测试双保险**：桩测试验证标记与格式，DOM 测试验证真实语料与事件链，
  避免只测到桩的渲染约定。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- 面板是否在文件行上直接显示环成员（当前仅详情内的双向标记）。
- 提交/推送与版本 tag 由用户确认后执行。
