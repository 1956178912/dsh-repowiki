# 检查点：任务上下文符号锚点（phase-96）

- 日期：2026-11-27
- 合入版本：v0.120.0
- 目标：`repowiki-context` 此前只能靠自然语言词法命中或路径锚定；当代理
  已经知道精确符号（或同名符号存在歧义）时，需要一种"直接锚定定义"的
  入口，并且在没有 query 时也能工作。
- 状态：代码、单测、工具集成、真实仓库冒烟与全量门禁完成；已提交并推送。

## 交付

- `src/context.js` 新增纯函数 `resolveSymbolAnchors(index, inputs, root)`：
  - `path#name`：复用影响面的路径匹配（绝对路径剥离、大小写不敏感精确、
    `/<输入>` 后缀、唯一 basename）；路径歧义进入 `ambiguous`，不猜；
    匹配到的文件内精确查找符号。
  - 裸名：在全部索引文件中精确查找；恰好一个文件命中才解析，多文件命中
    列入 `ambiguous`（候选按路径排序、最多 10 个），零命中列入 `unmatched`。
  - 同一文件重载按 `path#name` 去重并保留最小行号；输出稳定排序。
- `src/tool-context.js`：
  - 新增 `symbols` 参数（裸名或 `path#name`）；`query` 在提供 paths/symbols
    时可省略，全部缺失时给出可操作提示。
  - 解析出的锚点文件并入显式路径（排序分 10000），锚点符号名并入片段
    选择的 terms，因此源码片段优先落在定义处。
  - 输出 `symbolAnchors`、`unmatchedSymbols`、`ambiguousSymbols`；包内
    Caveats 与 hint 如实报告未命中/歧义，绝不扩大为文件级或词法搜索。
  - 无 query 时包标题使用合成任务标签（`symbols: …` 或 `paths: …`），
    便于阅读；结构化 `query` 仍保留调用方原文（空串）。
  - 兜底语义收紧：只有"未提供任何锚点"且零命中时才触发 PageRank
    repo map；显式锚点全部失败时不兜底，避免掩盖锚点错误。
- 双语文档与 locale 元数据同步。

## 测试

- `test/context.test.js`：
  - 纯函数：限定路径（相对/绝对）、裸名唯一解析、裸名多文件歧义、
    路径 basename 歧义、未命中、重载取最小行号、空输入。
  - 工具：无 query 的限定锚点返回定义文件与覆盖定义行的片段、包标题；
    裸名歧义列出候选、不触发 repo map、hint 说明无锚点命中；未命中符号
    进入 `unmatchedSymbols` 并出现在 Caveats。

## 真实仓库冒烟

`symbols: ['src/impact.js#computeSymbolImpact']`，无 query，预算 3000：

- `symbolAnchors`：`src/impact.js#computeSymbolImpact`（function，line 299）；
- `files`：`src/impact.js`（rank 10000）；
- 片段：`src/impact.js:296-351`（覆盖定义行）与一处文件上下文；
- 包标题：`Task: symbols: src/impact.js#computeSymbolImpact`。

## 语义边界

- 锚点解析是"索引内精确名"解析，不做模糊/正则/语义匹配；裸名歧义宁可
  报告候选，也不选第一个。
- 锚点只影响文件排序与片段选择，不声称运行时调用关系。
- 未命中的锚点不回退为词法搜索，也不被 repo map 兜底掩盖。

## 验证

- `npm test`：448/448（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.06%、分支 86.4%、函数 95.05%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。
- `npm pack --dry-run`：包含 context/impact/usages/graph-rank 运行时模块。

## 取舍

- 不复用 impact 的 `resolveSymbolChanges`：后者语义是"在本次变更文件内
  解析"，裸名不会跨全库查找；context 需要全库唯一定位与歧义报告，单独
  实现更诚实，也避免改变影响面语义。
- 允许无 query：锚点本身就是任务输入；合成标题只用于可读性，不写入
  `query` 字段，避免把系统生成文本冒充用户任务。
- 锚点失败不兜底：这是对 v0.119 行为的有意收紧，防止"写错符号名"被
  一份无关的 repo map 掩盖。

## 遗留 / 下一步

- 面板可增加"定位符号"入口（需客户端与服务端数据面配合）。
- 可评估将 `usages` 证据复用到 context（预算允许时），当前仍只保留在
  impact 中。
