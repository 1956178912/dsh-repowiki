---
{
  "schemaVersion": 1,
  "path": "src/deps.js",
  "lang": "javascript",
  "locale": "zh",
  "title": "src/deps.js：模块依赖边提取（纯函数）",
  "tags": [
    "依赖提取",
    "纯函数",
    "正则解析",
    "JS/TS",
    "Python",
    "交叉引用",
    "导入分析"
  ],
  "manuallyEdited": false,
  "generatedAt": "2026-11-26T07:03:22.638Z"
}
---
# src/deps.js：模块依赖边提取（纯函数）

> src/deps.js

## 概要 / Summary

该文件提供从源码文本提取 import / export-from / require / from-import 语句的纯函数，产出 specifier + 行号 + 引用形态 + 具名符号的引用记录。目前仅支持 JavaScript/TypeScript 与 Python 两种语言，其他语言返回空数组。

## 职责 / Purpose

为索引器（indexer）提供符号级交叉引用的原始数据：相对 specifier 由下游解析为实际文件路径，形成符号级引用边，服务于变更传导分析（方案 §5-3）。

## 关键符号 / Key symbols

- `isJsRelative` (function): 判断 specifier 是否以 ./ 或 ../ 开头，决定该引用能否解析为本地文件边。
- `jsImportedNames` (function): 从一行 JS/TS 提取具名导入符号：只取 from 前的花括号段，去除 type 修饰与 as 别名，* as x 记为 '*'，Set 去重。
- `extractJsImports` (function): 按行匹配 JS/TS 的 import-from、副作用 import、export-from、require 与动态 import，逐正则捕获并输出 ImportInfo 记录。
- `extractPythonImports` (function): 按行匹配 Python 的 from-import 与 import 语句，去除 as 别名与前置星号，以点开头的 specifier 标记为相对引用。
- `extractImports` (function): 导出的纯函数入口：统一换行后按 lang 分派，空字符串或非字符串入参直接返回空数组。

## 陷阱 / Pitfalls

- 匹配基于逐行正则而非 AST，跨行的 import/export 或 require 语句会漏掉；无括号多行 import 同样无法识别。
- export-from 分支中的 export * as ns from 'mod' 依赖正则中的可选 as 段，复杂 export 形态可能匹配失败。
- 动态 import 与 require 用全局正则逐行扫描，同一行多个引用可正确捕获，但字符串内包含 require( 字样的文本可能被误判。
- Python 分支将 import a.b.c 一律置 relative: false，相对性与具名符号的处理较简化（如 from __future__ 也会被当作普通 import）。
- jsImportedNames 对 import a, { b } 这类混合默认+具名子句，只取花括号段，默认导入符号不会被记录。

## 相关模块 / Related modules

- indexer（消费引用记录并将相对 specifier 解析为实际文件路径）
- 变更传导分析（方案 §5-3 的符号级引用边）
