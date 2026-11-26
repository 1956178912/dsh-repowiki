---
{
  "schemaVersion": 1,
  "path": "src/prompts.js",
  "lang": "javascript",
  "locale": "zh",
  "title": "子代理 Prompt 构造纯函数（extractPrompt/generatePrompt/fenceLang）",
  "tags": [
    "prompt-engineering",
    "纯函数",
    "LLM",
    "wiki 生成",
    "子代理",
    "国际化",
    "javascript"
  ],
  "manuallyEdited": false,
  "generatedAt": "2026-11-26T07:03:22.641Z"
}
---
# 子代理 Prompt 构造纯函数（extractPrompt/generatePrompt/fenceLang）

> src/prompts.js

## 概要 / Summary

该文件提供三个纯函数，为代码仓库 Wiki 流水线构造自包含的 LLM prompt：extractPrompt 为单文件知识卡片提取生成提示词，generatePrompt 把已提取的卡片摘要合成为 Wiki 页面生成提示词，fenceLang 负责选取代码围栏高亮语言。所有 prompt 均要求模型只依据代码可证事实、不得臆造，并返回不带 markdown 围栏的 JSON。token 预算与卡片裁剪由调用方控制，本模块不做截断。

## 职责 / Purpose

为 spawn 出的 fresh 子代理（无父对话历史）生成自包含的任务提示词：先逐文件提取知识卡片，再将卡片分组综合成少量 Wiki 页面（如总览、核心模块、数据流），并按 locale 输出中文或英文。

## 关键符号 / Key symbols

- `extractPrompt(file, locale)` (function): 根据文件路径、语言、符号清单与（可能已截断的）源码拼接卡片提取 prompt，内含 skip 判定、字段填写与 JSON-only 输出约束，截断时附加 NOTE 提示仅基于可见内容提取。
- `generatePrompt(cards, stack, locale)` (function): 把卡片摘要（路径/标题/summary/符号/tags）与技术栈、项目名拼接为 Wiki 综合 prompt，要求将卡片分组为少量页面、按需附 mermaid 图，且只用卡片中已有事实。
- `fenceLang(lang)` (function): 将语言标识映射为代码围栏语言：javascript/typescript/python 原样返回，其余返回空字符串以使用普通围栏。

## 陷阱 / Pitfalls

- locale 仅识别 'zh'，其他所有值（含 undefined）一律回退为 English 输出
- fenceLang 只映射三种语言，其余语言得到空围栏标识，无语法高亮
- 截断提示 NOTE 仅在 file.truncated 为真时拼接，调用方必须自行设置该标记
- MAX_SOURCE_CHARS 截断阈值来自 schema.js，本模块不负责执行截断，传入超长源码不会被拦截

## 相关模块 / Related modules

- ./schema.js（提供截断阈值常量 MAX_SOURCE_CHARS）
