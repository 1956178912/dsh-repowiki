---
{
  "schemaVersion": 1,
  "path": "src/assets.js",
  "lang": "javascript",
  "locale": "zh",
  "title": "src/assets.js｜资产层：定位资产根并读写 index.json 与知识卡片",
  "tags": [
    "资产层",
    "依赖注入",
    "索引读写",
    "知识卡片",
    "文件系统"
  ],
  "manuallyEdited": false,
  "generatedAt": "2026-11-26T07:03:22.630Z"
}
---
# src/assets.js｜资产层：定位资产根并读写 index.json 与知识卡片

> src/assets.js

## 概要 / Summary

该模块通过依赖注入的 ctx.fs 服务定位 .dsh-repowiki/ 资产目录、读写索引文件并检索索引内容，所有文件操作均未裸用 node fs。resolveAssetRoot 从起点目录向上查找已存在的资产目录，找不到则以当前目录为根返回新建语义。readIndex 读取索引并校验 schemaVersion，searchIndex 按名称、种类、路径前缀过滤索引中的符号。

## 职责 / Purpose

为 repowiki 工具提供统一的资产访问层：定位资产根目录、读写 index.json 索引、列出当前 locale 的知识卡片文件，并支持对索引做条件检索。

## 关键符号 / Key symbols

- `isDirectory(fs, dirPath)` (function): 内部函数：通过 fs.resolve + fs.stat 判断路径存在且为目录，任何异常均返回 false。
- `resolveAssetRoot(fs, startDir)` (function): 从 startDir 向上逐级查找 .dsh-repowiki/ 目录，找到则返回 {root, assetDir, created:false}；走到文件系统根仍未找到则返回以 startDir 为根的定位结果且 created:true，但并不实际创建目录。
- `readIndex(fs, root)` (function): 读取 root 下的索引文件并 JSON.parse，若文件不存在、解析失败或 schemaVersion 缺失/不等于 INDEX_SCHEMA_VERSION，统一返回 null。
- `writeIndex(fs, root, doc)` (function): 将索引文档以 2 空格缩进 JSON 加换行符写入资产目录下的索引文件，返回写入文件的 displayPath。
- `listKnowledgeFiles(fs, root, locale)` (function): 列出 .dsh-repowiki/knowledge/<locale> 目录下的 .md 文件并返回相对路径数组；目录不存在或非目录、发生任何异常时返回空数组。
- `searchIndex(index, opts)` (function): 纯函数：遍历 index.files，按 query（符号名子串、大小写不敏感）、kind、pathPrefix 过滤，返回 {matches, total, truncated}，limit 默认取 DEFAULT_RESULT_LIMIT。

## 陷阱 / Pitfalls

- readIndex 对'文件不存在'与'schemaVersion 版本不兼容'都返回 null，调用方无法区分这两种情况。
- resolveAssetRoot 返回的 created:true 仅表示调用前资产目录不存在，函数本身并不创建目录；目录实际写盘由 writeIndex 隐式完成。
- isDirectory、readIndex、listKnowledgeFiles 均用 try/catch 吞掉全部异常并返回假值，文件系统错误被静默处理。
- searchIndex 的 total 与 truncated 按匹配到的文件数计算而非符号数，且截断时 symbols 数组未被截断，只截断文件级 matches。
- listKnowledgeFiles 只列出目录下的直接 .md 文件，不递归子目录。
- searchIndex 中 query 做了小写化处理（大小写不敏感），而 pathPrefix 使用 path.includes 原样匹配（大小写敏感），两者过滤行为不一致。

## 相关模块 / Related modules

- schema.js：提供 ASSET_DIR、INDEX_REL_PATH、INDEX_SCHEMA_VERSION、DEFAULT_RESULT_LIMIT 等常量。
- node:path：用于路径 resolve、dirname、join 与 posix.join。
- ctx.fs（依赖注入）：本模块所有函数接收的文件系统服务，提供 resolve、stat、readText、writeText、listDir 能力。
