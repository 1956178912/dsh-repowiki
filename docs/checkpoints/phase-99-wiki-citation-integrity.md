# 检查点：Wiki 引用完整性（phase-99）

- 日期：2026-11-27
- 合入版本：v0.123.0
- 目标：知识库的 Wiki 页面引用源文件；文件被删除/改名后，清单仍指向旧路径，
  但此前没有检查。本轮让 `repowiki-status` 直接回答"哪些引用断链"。
- 状态：代码、纯函数测试、状态集成、真实链路断言与全量门禁完成；已提交并推送。

## 交付

- `src/wiki-references.js` 新增纯函数 `findBrokenWikiCitations(manifest, existingPaths)`：
  - 读取页面级与章节级 `sources`，复用 `normalizeWikiSource` 剥离 `#Lx-Ly`；
  - `total` = 去重后的缺失路径数；`references` = 引用出现次数（页面级与
    章节级分别计数）；`pages` 按标题/slug 排序，最多 10 页 × 每页 10 条
    缺失路径；`truncated` 表示明细被截断，但不影响前两个总数；
  - 无效/空引用忽略；存在性由调用方提供，函数保持纯函数。
- `src/tool-status.js`：
  - 有清单时构建"已确认存在"集合：索引文件 + 对非索引引用做 `fs.stat`
    （如 README）；绝对路径与含 `..` 的引用不做探测，直接按缺失报告；
  - 文件系统探测上限 200：达到上限后把未探测引用视为"未验证"（按存在
    处理）并写 warning，**不冒充缺失**；
  - 输出 `brokenCitations`（可选，无清单时不输出），有缺失时追加
    `N wiki citation path(s) do not exist; …` 告警；
  - 文本在 Wiki 行后新增 `Broken citations: …`（无缺失显示 `(none)`，
    有缺失列出首个页面的示例路径）。
- 双语文档、locale 元数据同步。

## 测试

- `test/wiki-references.test.js`：2 例——页面/章节归并、去重、引用次数、
  空清单/null；12 个页面时明细截断到 10 而 `total` 仍为 12。
- `test/status.test.js`：
  - 新用例：索引内引用正常、README 引用经文件系统确认、缺失路径进入
    `brokenCitations`，渲染与告警断言；删除清单后字段与行都消失。
  - 既有完整资产用例更新：模块页会引用孤儿卡片 `gone.ts`（源文件不存在），
    现在正确报告 1 条断链并产生 1 条 warning——这是行为修正而非回归。

## 语义边界

- 只校验"路径是否存在"，不校验行号范围、符号是否仍存在、链接文本是否
  过期；这些需要读取源码/解析 Markdown，留待后续。
- 引用可能存在但语义已变化（文件被替换）——本检查不会发现，陈旧判定仍由
  digest 机制负责。
- 无清单时不做任何完整性断言（输出不出现该字段/行）。

## 验证

- `npm test`：457/457（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.12%、分支 86.3%、函数 95.14%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 非索引引用必须走 fs 探测：wiki 可以合法引用 README/配置等未索引文件，
  只看索引会制造假阳性。
- 探测上限内未验证的引用不判缺失：宁可少报，也不把"没检查"说成"断链"。
- 断链只进入 warnings 与独立字段，不改健康分权重：健康分已有卫生分量，
  引用完整性属于同一维度的细分信号，避免重复计权。

## 遗留 / 下一步

- 可校验 `#Lx-Ly` 行号是否越界（需要索引记录每个文件的行数，或按需读取）。
- 面板可在 Wiki 页面渲染断链徽章（当前只在状态工具中呈现）。
