---
{
  "schemaVersion": 1,
  "path": "src/knowledge.js",
  "lang": "javascript",
  "locale": "zh",
  "title": "知识卡片与 Wiki 页面的目录读写模块",
  "tags": [
    "知识卡片",
    "Wiki",
    "文件读写",
    "ctx.fs 注入",
    "slug 化",
    "frontmatter 解析",
    "缓存跳过"
  ],
  "manuallyEdited": false,
  "generatedAt": "2026-11-26T07:03:22.640Z"
}
---
# 知识卡片与 Wiki 页面的目录读写模块

> src/knowledge.js

## 概要 / Summary

该模块为 repowiki 工具提供知识卡片与 Wiki 页面的落盘、解析与枚举能力，所有文件操作均通过注入的 ctx.fs 服务完成。卡片以 slug 化的源文件路径命名并按 locale 分目录存放，配合 JSON frontmatter 的 schemaVersion 校验实现版本化读写。它服务于提取阶段的卡片写入与缓存跳过、生成阶段的卡片汇总等场景。

## 职责 / Purpose

统一封装 .dsh-repowiki 资产目录下 knowledge/{locale} 与 wiki/{locale} 两类 Markdown 文件的路径构造、写入、解析与枚举，使源文件路径与卡片文件名之间保持双向可定位，并保证单张坏卡或目录缺失不会阻断整体流程。

## 关键符号 / Key symbols

- `cardSlug` (function): 把源文件相对路径转换为卡片文件名：反斜杠先归一为斜杠，去掉末尾扩展名，斜杠转为连字符，非 ASCII/非法字符归并为单个连字符，裁掉首尾连字符并转小写。
- `cardPath` (function): 用 path.posix.join 拼接 ASSET_DIR/KNOWLEDGE_DIR/locale/cardSlug(relPath).md 形式的卡片相对资产根路径。
- `wikiPath` (function): 拼接 ASSET_DIR/WIKI_DIR/locale/slug.md 形式的 Wiki 页文件相对资产根路径，slug 不做转换。
- `writeCard` (function): 异步函数：经 fs.resolve(cardPath(...), { cwd: root }) 解析目标后用 fs.writeText 写入，返回 target.displayPath。
- `writeWikiPage` (function): 异步函数：与 writeCard 同构，按 wikiPath 解析并写入 Wiki 页 Markdown，返回 displayPath。
- `parseCard` (function): 解析卡片文本：正则匹配 frontmatter 分隔格式，JSON.parse 得到 meta，要求 meta 为对象且 schemaVersion 等于 CARD_SCHEMA_VERSION（当前为 1），任一条件不满足返回 null。
- `readExistingCards` (function): 枚举某 locale 卡片目录下全部 .md 文件，逐张解析并以 frontmatter 中的 meta.path 为键、{meta, path} 为值构建 Map；目录不存在、stat 失败或目标非目录时返回空 Map，单张坏卡被 try/catch 跳过不阻断枚举。
- `cardSummaryFromBody` (function): 从卡片正文中匹配 '## 概要 / Summary' 开头的段落，截取到下一个 '## ' 标题前，trim 后仅取第一行；缺该节则返回空串。

## 陷阱 / Pitfalls

- cardSlug 只去掉最后一个扩展名，且仅在路径末尾匹配；无扩展名或以点开头的路径（如 .dsh/config）不会被当作扩展名处理。
- cardSlug 将连续的非 ASCII 字符合并为单个连字符，中文路径会产生信息有损的 slug，但卡片可通过 frontmatter 中的 meta.path 反查原路径。
- parseCard 的 frontmatter 正则要求文本以 '---' 开头的精确格式且 frontmatter 非 JSON、meta 非对象、schemaVersion 不等于 1 均返回 null（静默失败，不抛错）。
- readExistingCards 依赖卡片 frontmatter 中的 meta.path 字段作为 Map 键，缺该字段的卡片会被静默跳过；键冲突时后读的卡片会覆盖先读的。
- cardSummaryFromBody 要求小节标题严格为 '## 概要 / Summary'（含空格与斜杠），且其后必须紧跟空行；若该节后没有下一个 '## ' 标题，正则前瞻失败会返回空串而非全文。
- cardSummaryFromBody 目前在 src 中没有任何调用方（仅 test 引用），其 docstring 声明的 generate prompt 用途尚未在代码中兑现。

## 相关模块 / Related modules

- src/schema.js（提供 ASSET_DIR、KNOWLEDGE_DIR、WIKI_DIR、CARD_SCHEMA_VERSION 等常量，作为本模块路径与版本约定的单一来源）
- src/tool-extract.js（导入 readExistingCards、writeCard、cardSlug，用于提取阶段写卡与缓存跳过）
- src/tool-generate.js（导入 readExistingCards、writeWikiPage，用于汇总卡片并生成 Wiki 页）
- test/knowledge.test.js（覆盖 cardSlug、cardPath、wikiPath、writeCard、writeWikiPage、parseCard、readExistingCards 的往返一致性与坏卡容错）
