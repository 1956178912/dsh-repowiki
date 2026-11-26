---
{
  "schemaVersion": 1,
  "title": "核心模块详解",
  "slug": "core-modules",
  "locale": "zh",
  "generatedAt": "2026-11-26T08:35:13.523Z"
}
---
# 核心模块详解

本页详解 dsh-repowiki 的核心模块：资产层、配置、符号与依赖提取、索引编排与技术栈识别、卡片读写与渲染、子代理提示词构造。

## 领域约定与资产层：src/schema.js 与 src/assets.js

`src/schema.js` 集中声明插件的所有常量与领域约定：资产目录名 `.dsh-repowiki`、`index.json` 与卡片的 schemaVersion、默认排除目录、语言映射、有界输出上限以及依赖边种类，其余模块一律引用而非重复定义这些常量。

`src/assets.js` 是资产层，通过依赖注入的 `ctx.fs` 服务操作文件，未裸用 node fs。`resolveAssetRoot` 从当前目录向上查找已存在的 `.dsh-repowiki/` 资产目录；`readIndex` 读取索引并校验 schemaVersion；`writeIndex` 写回索引；`searchIndex` 按名称、种类、路径前缀过滤索引中的符号，支撑卡片检索。

## 配置读取与候选筛选：src/config.js

`src/config.js` 从 `.dsh-repowiki/repowiki-plan.json` 读取项目级配置：文件缺失或损坏时回退默认值，并以 `source` 字段区分配置来源，不阻断提取流程。`selectCandidates` 根据路径前缀、符号数阈值（默认 3）与卡片上限（默认 40）过滤候选文件清单；所有字段经校验，非法值静默降级为默认或空。

## 符号与依赖提取：src/symbols.js 与 src/deps.js

`src/symbols.js` 是 ADR-0001 定义的零依赖符号提取器：采用行级关键字匹配加括号/缩进块匹配的轻量解析，为 JavaScript/TypeScript 与 Python 源码提取符号级信息（名称、种类、起止行、是否导出），无法解析的边缘语法被安静跳过。

`src/deps.js` 提供从源码文本提取 import / export-from / require / Python from-import 语句的纯函数，产出 specifier + 行号 + 具名符号的引用记录；目前仅支持 JavaScript/TypeScript 与 Python 两种语言，其他语言返回空数组。

## 索引编排与技术栈识别：src/indexer.js 与 src/stack.js

`src/indexer.js` 是仓库符号级索引的编排器：递归遍历项目目录，对每个源码文件提取符号与 import，并把相对 import 解析为项目内文件级依赖边，最终组装成索引文档（schemaVersion/files/edges/stats/stack）。整个流程完全确定性、不调用任何模型，`fs` 服务作为参数注入以便单元测试。

`src/stack.js` 以纯函数 `detectStack` 为入口，从 indexer 已读取的清单文件文本（`package.json`、`requirements.txt`、`go.mod`、`Cargo.toml`）中提取项目名、版本与依赖列表，按内置映射表输出命中的技术条目，并按 `ecosystem:name` 去重。

## 知识卡片读写与渲染：src/knowledge.js 与 src/render.js

`src/knowledge.js` 提供知识卡片与 Wiki 页面的落盘、解析与枚举能力：`cardSlug` 把源文件路径 slug 化作为卡片文件名，卡片按 locale 分目录存放，以 JSON frontmatter 加 schemaVersion 校验实现版本化读写；`readExistingCards` 同时服务于 extract 阶段的缓存跳过与 generate 阶段的卡片汇总；`cardSummaryFromBody` 从卡片正文提取摘要。

`src/render.js` 提供三个纯函数：`renderCardMarkdown` 把卡片 JSON 渲染为带 frontmatter 的 Markdown，`renderWikiMarkdown` 把 Wiki 页 JSON 渲染为含 mermaid 图的 Markdown，`isUsableCard` 校验卡片是否满足最小可渲染形态。Markdown 格式由插件统一渲染，以避免子代理（LLM）输出格式漂移；frontmatter 采用 JSON 序列化。

## 子代理提示词构造：src/prompts.js

`src/prompts.js` 提供三个纯函数：`extractPrompt` 为单文件知识卡片提取生成提示词，`generatePrompt` 把已提取的卡片摘要合成为 Wiki 页面生成提示词，`fenceLang` 负责选取代码围栏高亮语言。所有 prompt 均要求模型只依据代码可证事实、不得臆造，并返回不带 markdown 围栏的 JSON。
