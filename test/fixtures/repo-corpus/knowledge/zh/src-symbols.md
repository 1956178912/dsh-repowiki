---
{
  "schemaVersion": 1,
  "path": "src/symbols.js",
  "lang": "javascript",
  "locale": "zh",
  "title": "零依赖符号提取器 src/symbols.js",
  "tags": [
    "符号提取",
    "代码解析",
    "零依赖",
    "纯函数",
    "JavaScript/TypeScript",
    "Python",
    "索引构建"
  ],
  "manuallyEdited": false,
  "generatedAt": "2026-11-26T07:03:22.644Z"
}
---
# 零依赖符号提取器 src/symbols.js

> src/symbols.js

## 概要 / Summary

该文件是 ADR-0001 定义的零依赖符号提取器，为 JS/TS/Python 源码提取符号级信息（名称、种类、起止行、是否导出），供 index.json 建立符号级检索与交叉引用。它不做完整 AST，而是采用行级关键字匹配 + 括号/缩进块匹配的轻量解析，无法解析的边缘语法会被安静跳过。所有导出与内部函数均为纯函数，输入代码字符串与语言标识、输出符号数组，无副作用。

## 职责 / Purpose

为仓库 wiki 的索引阶段提供符号表：识别 function/class/method/variable/interface/type 六类定义及其行范围与导出状态，作为检索优先级与摘要生成的依据；设计上宁可给出保守的 endLine（退化为文件尾或下一行），也不产出错误符号。

## 关键符号 / Key symbols

- `extractSymbols` (function): 纯函数入口：校验入参后统一为 LF 行数组，按 lang 分派到 extractPython 或 extractJsLike，不支持的语言返回空数组，是文件唯一导出函数。
- `extractJsLike` (function): 提取 JS/TS 符号：逐行用 matchDeclare 剥离修饰符，依次识别 function、class（含类块内三类方法形态）、interface、type、箭头函数/函数表达式变量，以及普通导出常量（记为 variable）。
- `extractPython` (function): 提取 Python 符号：匹配 class 与 (async )def，用缩进块确定结束行，通过 currentClass 缩进比较判定 def 属于方法还是函数；Python 无 export 语义，exported 恒为 false。
- `findBlockEnd` (function): 计算 JS/TS 花括号块结束行：从起始行计数 { } 至配平，粗略跳过行注释；配不齐时返回文件尾作为保守值。
- `blockEnd` (function): Python 块结束行：跳过空行与注释行，找下一行缩进小于等于声明缩进处，否则返回文件尾。
- `indentOf` (function): 计算行缩进宽度，前导空格逐个计数，Tab 按 4 计。
- `matchDeclare` (function): 用正则从行首提取缩进、声明修饰符（export/default/declare/abstract/async/static 等）与剩余部分，供导出判断与方法修饰符剥离使用。
- `toLines` (function): 将源码中的 \r\n 与 \r 统一替换为 \n 后按行切分，作为块匹配的基准。

## 陷阱 / Pitfalls

- endLine 全程是保守值：括号配不齐（字符串/模板字面量中的括号误差）时退化为文件尾，type 别名单行联合类型取下一行；调用方不能把 endLine 当作精确边界。
- findBlockEnd 只剥离 // 行注释，不处理字符串与模板字面量内部的括号，也不处理块注释，这些情况会污染配平计数。
- 仅支持 javascript/typescript/python 三种语言（由 schema.js 的 EXTENSION_LANGS 提供标识），其余语言一律返回空数组。
- JS 方法识别依赖 JS_METHOD_BLACKLIST 排除 if/for/return 等控制流关键字，且 matchDeclare 的修饰符正则只覆盖有限集合，非常规写法（如计算属性名、私有 #字段）不在覆盖范围内。
- 类方法的 endLine 取 findBlockEnd 与类块结束行的较小值，且表达式体（无 {）止于本行；箭头函数变量仅在右侧为箭头函数或 function 表达式时才被记录，普通变量即使非导出也不收录。
- Python 缩进匹配把 Tab 按 4 计，混用 Tab 与空格的源码可能造成块范围误判；装饰器不改变模块可见性，exported 恒为 false。

## 相关模块 / Related modules

- src/indexer.js（导入并调用 extractSymbols，按 EXTENSION_LANGS 映射后的语言标识提取每个文件的符号，用于构建 index.json）
- src/schema.js（EXTENSION_LANGS 定义扩展名到语言标识的映射，SYMBOL_LANGUAGES 由此推导，是 extractSymbols 分派的依据）
- docs/adr/0001-zero-dependency-symbol-parser.zh.md（本文件遵循的零依赖符号解析器架构决策记录）
