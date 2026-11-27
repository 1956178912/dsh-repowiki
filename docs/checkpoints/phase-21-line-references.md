# 检查点：行号级反向引用 v0.49.0（phase-21）

- 日期：2026-11-27
- 目标：把 v0.48 的文件级反向引用提升到 `path:Lx`，让调用方直接跳到
  引用语句；同时保持旧索引可读。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

### 1. 索引 schema v5

- `src/schema.js`：`INDEX_SCHEMA_VERSION=5`，兼容集合 `{2,3,4,5}`。
- `src/indexer.js`：依赖边新增 `line`（`ImportInfo.line`，1-based）。
  同一语句导入多个符号仍是一条边；同一文件多次导入同一符号保留多个
  引用位置。
- `readIndex` 旧版本路径不变：v2–v4 在内存补齐派生字段；旧边无 `line`
  时反引用降级为仅路径。

### 2. 行号级反引用

- `src/references.js`：引用位置由 `string[]` 升级为
  `{path, line?}[]`，按路径 + 行号排序；同一文件同一行去重。
- `repowiki-cards references=true`：`referencedBy` 返回对象数组；文本渲染
  `symbol in path ← file:Lx`（最多 10 条 + 截断提示）。
- 面板详情：`referencesForPath` 同样按文件 + 行号归并，显示
  `path:Lx`；旧索引无行号时只显示路径。

### 3. 测试

- `test/references.test.js`：行号归并、排序、同文件同行去重、旧边无行号
  降级、上限截断。
- `test/indexer.test.js`：JS/Go/Rust/Java 边行号断言。
- `test/tools.test.js`：`referencedBy` 对象数组与 `path:Lx` 渲染。
- `test/client-smoke.test.js`：桩 React 详情断言 `← b.js:L7`。
- `test/client-dom.test.js`：真实 React 语料（旧索引无行号）降级不报错。
- `test/status.test.js`：schema v5 / `Index: v5 compatible`。

## 验证（本地全量）

- `npm test`：268/268 通过。
- `npm run coverage:check`：行 97.61%、分支 85.8%、函数 93.06%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。
- 真实仓库只读验证：schema v5、85 文件 / 180 边，全部边带行号；
  `writeTextVerified` 的引用位置为 `src/assets.js:L19`、`src/knowledge.js:L17`、
  `src/memory.js:L17`、`test/write-verify.test.js:L11`，与源码一致。

## 关键决策与取舍

- 行号放在边上而不是再建引用表：`edges` 已是权威依赖数据，加一个字段
  即可支撑行号级反引用，避免索引体积和版本迁移的双重成本。
- `referencedBy` 从字符串数组升级为对象数组：v0.48 尚未发布，直接采用
  更精确的契约；旧索引仍能读出（仅 path）。
- 不记录列号/多行 import 的结束行：当前轻量解析只有语句起始行，列号
  收益低、噪声高（YAGNI）。

## 遗留 / 下一步

- v0.50 候选：Wiki 章节引用反查（某文件被哪些页面/章节引用）、
  C#/Kotlin/PHP 扩展、目录级并行索引。
- 浏览器侧视觉冒烟（`path:Lx` 展示、长引用列表）按 phase-15 清单人工确认。
- 提交/推送与版本 tag 由用户确认后执行。
