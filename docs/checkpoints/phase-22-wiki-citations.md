# 检查点：Wiki 引用反查 v0.50.0（phase-22）

- 日期：2026-11-27
- 目标：闭合"代码 ↔ 文档"双向链路——不仅知道文件被哪些代码 import，
  也知道它被哪些 Wiki 页面/章节引用。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

### 1. Wiki 清单 v2

- `repowiki-generate` 写 `wiki/<locale>/_index.json` 时 `schemaVersion=2`，
  每页新增 `sections: [{heading, sources}]`；页面级 `sources` 保留为并集。
- 章节 sources 仍来自 `sanitizeSources` 白名单，不新增 LLM 数据面。

### 2. 引用反查模块

- 新增 `src/wiki-references.js`：
  - `normalizeWikiSource`：去空白、剥离 `#Lx-Ly` 片段；
  - `buildWikiReferenceIndex(manifest)`：源文件 → 页面/章节，页面按标题
    排序、章节去重排序；
  - `wikiReferencesFor(index, paths, limit)`：保持文件顺序、上限
    `MAX_WIKI_REFERENCE_ENTRIES=100` 并返回截断标记；
  - v1 清单无 `sections` 时只按页面级 `sources` 反查，不伪造章节。

### 3. 工具与面板

- `repowiki-cards` 新增 `wikiReferences` 参数；输出
  `wikiReferences: [{path, slug, title, sections}]` 与
  `wikiReferencesTruncated`；文本渲染 `Wiki citations:` 段。
- 面板详情新增"被 Wiki 引用"区：读取已加载清单的 `sources`/`sections`，
  展示页面标题与章节名，超过 6 条显示剩余数。

### 4. 测试

- `test/wiki-references.test.js`：章节级/页面级归并、`#Lx-Ly` 归一、
  去重排序、v1 降级、坏清单、上限截断。
- `test/tools.test.js`：端到端索引 + 清单 → `wikiReferences` 输出与
  无清单 hint。
- `test/client-smoke.test.js`：桩 React 详情断言"概览 · A 章节"。
- `test/tool-llm.test.js`：生成清单 schemaVersion 2 与 sections 数组。

## 验证（本地全量）

- `npm test`：275/275 通过。
- `npm run coverage:check`：行 97.68%、分支 85.8%、函数 93.28%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 章节级信息写入清单而不是查询时解析 Markdown：避免耦合渲染格式、
  避免每次反查重读全部页面；清单本身就是生成产物的派生视图。
- v1 清单只降级不迁移：缺 `sections` 时页面级引用仍然有效，用户重跑
  `repowiki-generate` 即自动升级到 v2。
- 反查只覆盖 Wiki 清单中的引用：LLM 未引用（但正文提到）的文件不会
  出现，保持"可证实才报告"。

## 遗留 / 下一步

- v0.51 候选：C#/Kotlin/PHP 扩展、目录级并行索引、Wiki 页面内引用跳转
  （从详情直接打开 Wiki 章节）。
- 浏览器侧视觉冒烟（Wiki 引用区、长列表）按 phase-15 清单人工确认。
- 提交/推送与版本 tag 由用户确认后执行。
