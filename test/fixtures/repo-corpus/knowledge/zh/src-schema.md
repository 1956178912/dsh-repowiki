---
{
  "schemaVersion": 1,
  "path": "src/schema.js",
  "lang": "javascript",
  "locale": "zh",
  "title": "src/schema.js：仓库符号索引的常量与领域约定（schema 单一来源）",
  "tags": [
    "schema",
    "常量",
    "单一来源",
    "DRY",
    "领域约定",
    "版本化",
    "有界输出"
  ],
  "manuallyEdited": false,
  "generatedAt": "2026-11-26T07:03:22.643Z"
}
---
# src/schema.js：仓库符号索引的常量与领域约定（schema 单一来源）

> src/schema.js

## 概要 / Summary

本模块是 repowiki 整个 bundle 的常量与领域约定单一来源：集中声明资产目录名、index.json 与卡片的 schemaVersion、默认排除目录、受支持语言映射、各工具的有界输出上限以及依赖边种类。其余模块一律引用而非重复定义这些常量（DRY）。

## 职责 / Purpose

为索引、符号提取、知识卡片与 Wiki 生成各阶段提供统一且版本化的 schema 与阈值约定，使资产数据可随 Git 共享、可做兼容校验与降级，并保证工具输出有界。

## 关键符号 / Key symbols

- `ASSET_DIR` (variable): 资产目录名 '.dsh-repowiki'，索引、卡片、Wiki 全部落于其下，随 Git 共享。
- `INDEX_REL_PATH` (variable): 索引文件路径，直接由 ASSET_DIR 拼接为 '.dsh-repowiki/index.json'。
- `INDEX_SCHEMA_VERSION` (variable): index.json 的数据版本（当前为 1），字段或折叠语义变化必须 +1，读取侧据此做兼容校验与降级。
- `DEFAULT_RESULT_LIMIT` (variable): 索引工具结果条目的默认上限（50），超限截断并显式标记 truncated，保证输出有界。
- `MAX_FILES_DEFAULT` (variable): 单次索引扫描的文件数硬上限（5000），防止巨型仓库耗尽工具超时预算。
- `MAX_FILE_BYTES` (variable): 单个源码文件读取的字节上限（4 MiB），与 readText 的合理预算对齐。
- `EXCLUDE_DIRS` (variable): 无条件排除的目录名集合（node_modules、.git、dist、各类缓存、虚拟环境、.dsh-repowiki 自身等），避免遍历产出噪声符号与自引用。
- `MANIFEST_FILES` (variable): 清单文件相对路径到生态名的映射（package.json→npm、requirements.txt/pyproject.toml→pip、go.mod→go、Cargo.toml→cargo、composer.json→composer），用于生态识别。
- `EXTENSION_LANGS` (variable): 扩展名→语言标识映射，覆盖 js/jsx/mjs/cjs、ts/tsx/mts/cts、py/pyi；未列出的扩展名不被索引。
- `SYMBOL_LANGUAGES` (variable): 由 EXTENSION_LANGS 的值推导出的支持符号提取的语言集合，避免重复维护。
- `JS_PATH_CANDIDATES / PY_PATH_CANDIDATES` (variable): JS/TS 与 Python 相对 import 解析为文件路径时尝试的后缀与入口（Node ESM/CJS 解析约定的子集 / '.py' 与目录入口）。
- `CARD_SCHEMA_VERSION` (variable): 知识卡片 frontmatter 的数据版本（当前为 1），卡片结构变化必须 +1。
- `KNOWLEDGE_DIR / WIKI_DIR / PLAN_FILE` (variable): 资产目录下的子目录与配置文件名：knowledge/{locale}/、wiki/{locale}/ 与项目级 JSON 配置 repowiki-plan.json。
- `CARD_COMPLEXITY_THRESHOLD / MAX_CARDS_PER_RUN_DEFAULT / MAX_SOURCE_CHARS / MAX_CARDS_IN_PROMPT` (variable): 卡片提取的成本模型阈值：符号数低于 3 的文件只产签名、单次提取上限 40 张卡、prompt 内源码截断 20000 字符、generate 一次最多喂入 200 条卡片摘要。
- `EDGE_KIND_IMPORT` (variable): 依赖边种类常量 'import'，Phase 1 仅此一种，Phase 3 增量更新会复用该字段表达更强语义。

## 陷阱 / Pitfalls

- INDEX_SCHEMA_VERSION 与 CARD_SCHEMA_VERSION 是两个独立版本号，索引与卡片的兼容校验必须分别引用，不可混用。
- EXCLUDE_DIRS 把 '.dsh-repowiki' 自身排除，索引侧若绕过该集合会因自引用产生循环符号。
- MAX_FILES_DEFAULT、MAX_FILE_BYTES、MAX_SOURCE_CHARS 等上限是硬截断，超限时必须显式标记 truncated 或在 prompt 中告知，否则下游会误以为数据完整。
- EXTENSION_LANGS 决定哪些文件可被索引，新增语言需同步扩展本表与 symbols.js，单改一处会造成扩展名被识别但无法提取符号。

## 相关模块 / Related modules

- src/indexer.js
- src/symbols.js
- src/knowledge.js
- src/prompts.js
- src/render.js
- src/config.js
- src/card-schema.js
- src/tool-cards.js
- src/tool-extract.js
- src/tool-generate.js
