---
{
  "schemaVersion": 1,
  "title": "数据处理流程",
  "slug": "workflow",
  "locale": "zh",
  "generatedAt": "2026-11-26T08:35:13.523Z"
}
---
# 数据处理流程

本页追踪 dsh-repowiki 从源代码到 Wiki 的端到端数据流：repowiki-index 建立确定性索引，repowiki-extract 抽取知识卡片，repowiki-generate 汇总生成 Wiki 页面。

## 索引阶段（repowiki-index）

`repowiki-index` 由 `src/indexer.js` 编排：递归遍历项目目录收集源码文件与清单文件，用 `src/symbols.js` 提取符号、用 `src/deps.js` 提取依赖语句，并把相对 import 解析为项目内文件级依赖边；`src/stack.js` 的 `detectStack` 从 `package.json`、`requirements.txt`、`go.mod`、`Cargo.toml` 识别技术栈。最终组装成索引文档（schemaVersion/files/edges/stats/stack）写入 `.dsh-repowiki/index.json`。整个阶段完全确定性、零 LLM，索引可由 `src/assets.js` 的 `readIndex` 读取并校验 schemaVersion。

## 卡片抽取阶段（repowiki-extract）

`repowiki-extract` 先由 `src/config.js` 的 `selectCandidates` 按路径前缀、符号数阈值（默认 3）与卡片上限（默认 40）过滤候选文件清单，再借助 `src/knowledge.js` 的 `readExistingCards` 对已存在的卡片做缓存跳过。对每个候选文件，`src/prompts.js` 的 `extractPrompt` 构造单文件提取提示词，要求模型只依据可证事实并返回不带围栏的 JSON；抽取结果经 `src/render.js` 的 `renderCardMarkdown` 渲染为带 JSON frontmatter 的 Markdown，按 locale 写入 `.dsh-repowiki/knowledge/{locale}/*.md`。

## Wiki 生成阶段（repowiki-generate）

`repowiki-generate` 以 `src/knowledge.js` 的 `readExistingCards` 汇总已提取卡片，用 `cardSummaryFromBody` 从正文取摘要，再由 `src/prompts.js` 的 `generatePrompt` 合成 Wiki 页面生成提示词。模型返回的页面 JSON 经 `src/render.js` 的 `renderWikiMarkdown` 渲染为含 mermaid 图的 Markdown，按 locale 写入 `.dsh-repowiki/wiki/{locale}/*.md`。`repowiki-cards` 可在检索环节通过 `src/assets.js` 的 `searchIndex` 按名称、种类、路径前缀过滤索引中的符号。

## 阶段数据流

```mermaid
flowchart TD
  Scan[src/indexer.js 递归遍历] --> Symbols[src/symbols.js 符号提取]
  Scan --> Deps[src/deps.js 依赖语句提取]
  Manifests[清单文件] --> Stack[src/stack.js detectStack]
  Symbols --> Idx[.dsh-repowiki/index.json schemaVersion/files/edges/stats/stack]
  Deps --> Idx
  Stack --> Idx
  Idx --> Cfg[src/config.js selectCandidates]
  Cfg --> Skip[src/knowledge.js readExistingCards 缓存跳过]
  Skip --> ExP[src/prompts.js extractPrompt]
  ExP --> KMd[src/render.js renderCardMarkdown]
  KMd --> Cards[.dsh-repowiki/knowledge/{locale}/*.md]
  Cards --> Sum[src/knowledge.js cardSummaryFromBody]
  Sum --> GP[src/prompts.js generatePrompt]
  GP --> WMd[src/render.js renderWikiMarkdown]
  WMd --> Wiki[.dsh-repowiki/wiki/{locale}/*.md]
```

```mermaid
flowchart TD
  Scan[src/indexer.js 递归遍历] --> Symbols[src/symbols.js 符号提取]
  Scan --> Deps[src/deps.js 依赖语句提取]
  Manifests[清单文件] --> Stack[src/stack.js detectStack]
  Symbols --> Idx[.dsh-repowiki/index.json]
  Deps --> Idx
  Stack --> Idx
  Idx --> Cfg[src/config.js selectCandidates]
  Cfg --> Skip[src/knowledge.js readExistingCards]
  Skip --> ExP[src/prompts.js extractPrompt]
  ExP --> KMd[src/render.js renderCardMarkdown]
  KMd --> Cards[.dsh-repowiki/knowledge/{locale}/*.md]
  Cards --> Sum[src/knowledge.js cardSummaryFromBody]
  Sum --> GP[src/prompts.js generatePrompt]
  GP --> WMd[src/render.js renderWikiMarkdown]
  WMd --> Wiki[.dsh-repowiki/wiki/{locale}/*.md]
```
