---
{
  "schemaVersion": 1,
  "path": "src/stack.js",
  "lang": "javascript",
  "locale": "zh",
  "title": "技术栈识别（src/stack.js）",
  "tags": [
    "技术栈识别",
    "依赖分析",
    "纯函数",
    "npm",
    "pip",
    "go",
    "cargo"
  ],
  "manuallyEdited": false,
  "generatedAt": "2026-11-26T07:03:22.643Z"
}
---
# 技术栈识别（src/stack.js）

> src/stack.js

## 概要 / Summary

该文件以纯函数 detectStack 为入口，从 indexer 已读取的清单文件文本（package.json、requirements.txt、go.mod、Cargo.toml）中提取项目名、版本与依赖列表，并按内置映射表输出命中的技术条目。未命中映射表的依赖只计入按生态汇总的 dependencyCounts，不产生技术结论；technologies 最后按 ecosystem:name 去重。

## 职责 / Purpose

为仓库 wiki 生成确定性的技术栈元数据：项目名、项目版本、识别到的技术（含生态、来源文件与可选版本）以及各生态的依赖总数。

## 关键符号 / Key symbols

- `detectStack` (function): 纯函数入口，按清单文件路径分发解析，汇总 projectName、projectVersion、technologies 与 dependencyCounts，并按 ecosystem:name 去重后返回。
- `npmTechnologies` (function): 将合并后的 npm 依赖名查 NPM_TECH 表，scoped 包未精确命中时再按 org 前缀（如 @nestjs）回退查找一次。
- `pipTechnologies` (function): 逐行剥离注释、环境标记与版本约束并把分发名小写归一，命中 PIP_TECH 的行附带从原行提取的版本字符串。
- `goRequires` (function): 解析 go.mod 中的 require 括号块与单行 require，返回模块路径列表。
- `cargoDeps` (function): 解析 Cargo.toml [dependencies] 段，返回 crate 名与版本（仅支持带引号的版本号和内联表中的 version 字段）。

## 陷阱 / Pitfalls

- detectStack 的分支链不处理 pyproject.toml 与 composer.json，传入这些清单不会产生任何元数据或技术条目，尽管注释声称只计元数据。
- dependencyCounts 统计的是解析出的依赖行/条目总数，其中可能大部分未命中映射表，因此该计数不能等同于识别到的技术数量。
- npm 依赖由 dependencies、devDependencies、peerDependencies 顺序展开合并，同名依赖的版本会被后展开的字段覆盖。
- pip 版本提取正则捕获第一个约束符到行尾的全部内容，形如 django>=3.9,<5 的复合约束会得到脏版本串。
- go 模块按完整路径精确匹配 GO_TECH，未做前缀匹配，更换 org 或子路径的模块不会命中。
- cargoDeps 的段名正则不匹配含点号的段，[target.'cfg(unix)'.dependencies] 之类的目标限定依赖段无法被识别。
- scoped 包的 org 前缀回退分支在当前 NPM_TECH 中不存在对应的键，实际命中均来自精确匹配，该回退是无效路径。
- package.json 的 JSON.parse 失败或结果非对象时直接 continue 跳过且不抛错，调用方无法区分文件缺失与解析失败。

## 相关模块 / Related modules

- indexer（向 detectStack 提供 path → text 的清单文件输入）
