---
{
  "schemaVersion": 1,
  "path": "src/indexer.js",
  "lang": "javascript",
  "locale": "zh",
  "title": "索引编排器 indexer.js",
  "tags": [
    "索引",
    "目录遍历",
    "符号提取",
    "依赖图",
    "确定性",
    "零LLM",
    "文件系统抽象"
  ],
  "manuallyEdited": false,
  "generatedAt": "2026-11-26T07:03:22.639Z"
}
---
# 索引编排器 indexer.js

> src/indexer.js

## 概要 / Summary

src/indexer.js 是仓库符号级索引的编排器：递归遍历项目目录收集源码文件与清单文件，对每个源码文件提取符号与 import，并把相对 import 解析为项目内文件级依赖边，最终组装成索引文档（schemaVersion/files/edges/stats/stack）。整个流程完全确定性、不调用任何模型，fs 服务作为参数注入以便单元测试。

## 职责 / Purpose

为 repowiki-index 工具提供确定性的索引构建能力：遍历目录、提取符号与依赖、识别技术栈，产出供后续会话及卡片工具查询的 index.json 数据；实际写盘由调用方（tool-index.js 经 assets.writeIndex）完成。

## 关键符号 / Key symbols

- `buildIndex` (function): 唯一导出函数，编排整个索引流程：walk 遍历 → 两遍处理（先登记全集路径，再读文件提符号/建边）→ 读清单 → detectStack → 组装并返回索引文档
- `walk` (function): 递归遍历目录树，按 EXCLUDE_DIRS 排除目录，按扩展名（EXTENSION_LANGS）收集源码文件、按相对路径（MANIFEST_FILES）收集清单文件；depth>24 或预算耗尽即停
- `toRelative` (function): 把 fs 解析出的展示路径换算为相对项目根的 POSIX 路径，越界（以..开头或绝对路径）返回 null，调用方跳过该文件
- `resolveJsSpecifier` (function): 按 JS_PATH_CANDIDATES 后缀与 index 入口候选，把 JS/TS 相对 specifier 解析为已索引文件路径，命中返回相对路径否则 null
- `resolvePySpecifier` (function): 按 Python 相对 import 的点数计算层级，结合 PY_PATH_CANDIDATES 与 __init__.py 候选解析为已索引文件路径

## 陷阱 / Pitfalls

- 文件头注释声称组装并写回 index.json，但 buildIndex 只返回文档对象，实际写盘由调用方（tool-index.js 中的 writeIndex）完成，文档与行为不一致。
- budget 计数在 toRelative/扩展名过滤之前就对每个 file 条目自增，即未纳入索引的文件也消耗文件预算；而 stats.capped 判定用的是已收录的 sourceFiles+manifests 数，两者口径不一致，遍历因预算提前停止时 capped 可能为 false。
- indexed 集合在第一遍按 sourceFiles 全量登记，但第二遍读取失败或超过 MAX_FILE_BYTES 的文件被静默 continue，不会从 indexed 移除，因此依赖边的 to 可能指向文档 files 列表中不存在的文件。
- 只有相对 import（JS 需 imp.relative 为真，Python 需以点开头）才会解析成边，裸模块名（如 react）不产生任何依赖边。
- 不可读目录、单文件读取失败、清单读取失败均被 catch 静默跳过，索引结果中没有任何错误标记，调用方无法感知部分数据缺失。
- 深度超过 MAX_DEPTH(24) 的子树被静默跳过，且符号提取依赖 symbols.js 的轻量行级解析，均无任何告警输出。

## 相关模块 / Related modules

- src/schema.js（提供 EXCLUDE_DIRS、EXTENSION_LANGS、MANIFEST_FILES、MAX_FILES_DEFAULT、MAX_FILE_BYTES、JS/PY_PATH_CANDIDATES、INDEX_SCHEMA_VERSION、EDGE_KIND_IMPORT 等全部常量，是 schema 单一来源）
- src/symbols.js（extractSymbols：零依赖符号表提取，供 files 条目使用）
- src/deps.js（extractImports：提取 import/require/from-import 记录，是依赖边的数据源）
- src/stack.js（detectStack：基于清单文本做技术栈识别，结果写入 doc.stack）
- src/tool-index.js（repowiki-index 工具：调用 buildIndex 并经 assets.writeIndex 把文档写入 .dsh-repowiki/index.json）
