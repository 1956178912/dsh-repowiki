---
{
  "schemaVersion": 1,
  "path": "src/render.js",
  "lang": "javascript",
  "locale": "zh",
  "title": "卡片与 Wiki 页面的 Markdown 渲染器（render.js）",
  "tags": [
    "markdown-rendering",
    "knowledge-card",
    "wiki",
    "frontmatter",
    "pure-function",
    "repowiki"
  ],
  "manuallyEdited": false,
  "generatedAt": "2026-11-26T07:03:22.642Z"
}
---
# 卡片与 Wiki 页面的 Markdown 渲染器（render.js）

> src/render.js

## 概要 / Summary

该文件提供三个纯函数：把知识卡片 JSON 渲染为带 frontmatter 的 Markdown（renderCardMarkdown）、把 Wiki 页 JSON 渲染为含 mermaid 图的 Markdown（renderWikiMarkdown）、以及校验卡片数据是否满足最小可渲染形态（isUsableCard）。Markdown 格式由插件统一渲染，以避免子代理（LLM）输出格式漂移。frontmatter 采用 JSON 序列化（零依赖解析、Git diff 清晰），卡片写入 schemaVersion 取自 schema.js 的 CARD_SCHEMA_VERSION。

## 职责 / Purpose

作为 repowiki 的表示层出口：接收子代理返回的受约束结构化 JSON，统一转换为固定模板的卡片/Wiki Markdown 文本，并在渲染前用 isUsableCard 做最小形态校验，缺失必要字段（含 skip 字段缺失）的卡片会被调用方记为 failed 而不是写入坏卡。

## 关键符号 / Key symbols

- `frontmatter(meta)` (function): 内部函数，将元数据对象用 JSON.stringify(meta, null, 2) 序列化并包裹在 --- 分隔符行中返回，供两个渲染函数复用。
- `renderCardMarkdown(card, meta)` (function): 把卡片结构化数据渲染为 Markdown：frontmatter（含 schemaVersion/path/lang/locale/title/tags/manuallyEdited/generatedAt，manuallyEdited 缺省为 false）加上 概要/职责/关键符号/陷阱/相关模块 五个固定章节；keySymbols 逐项渲染为列表项，pitfalls 与 relatedModules 为空时输出占位行。
- `renderWikiMarkdown(page, meta)` (function): 把 Wiki 页结构化数据渲染为 Markdown：frontmatter（schemaVersion 固定写 1，含 title/slug/locale/generatedAt）、一级标题、overview 正文、各 section；当 page.mermaid trim 后非空时在末尾追加 mermaid 代码块。
- `isUsableCard(card)` (function): 纯校验函数：要求 card 为对象且 title/summary/purpose 为字符串（title 需非空白）、keySymbols/pitfalls/relatedModules/tags 为数组，并且 card.skip 必须严格等于 false（skip 缺失也判为不可用）；不抛异常，仅返回布尔值。

## 陷阱 / Pitfalls

- isUsableCard 要求 card.skip === false：即使其他字段齐全，skip 缺失也会判为不可用，调用方会把该文件记为 failed。
- renderCardMarkdown 直接对 card.keySymbols 调用 .map，函数自身不做防御性校验，未经 isUsableCard 过滤的数据会抛错。
- frontmatter 内容是 JSON 而不是 YAML（仅借用 --- 分隔符形式），解析方需按 JSON 解析。
- renderWikiMarkdown 的 frontmatter schemaVersion 硬编码为 1，而 renderCardMarkdown 使用 schema.js 的 CARD_SCHEMA_VERSION 常量，两者来源不一致。
- pitfalls 与 relatedModules 为空数组时输出 - (none) 占位行，不是空章节。

## 相关模块 / Related modules

- ./schema.js（提供 CARD_SCHEMA_VERSION，knowledge.js 读卡时也按该版本校验 frontmatter）
- ./tool-extract.js（导入 renderCardMarkdown 与 isUsableCard，先校验再渲染写入卡片文件）
- ./tool-generate.js（导入 renderWikiMarkdown，把 Wiki 页 JSON 渲染为 Markdown）
