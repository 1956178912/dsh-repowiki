# 检查点：模块依赖 prompt v0.78.0（phase-53）

- 日期：2026-11-27
- 目标：Wiki 主题合成只看卡片摘要，模型无法知道模块之间真实依赖；
  架构/数据流章节容易臆造关系。索引已经有模块级边，可以用它约束生成。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/modules.js`：新增 `summarizeModuleRelations(files, edges, limit)`：
  - 以文件模块归属把 import 边聚合成模块 → 模块计数；
  - 同模块边与缺端点忽略；
  - 按计数降序、再按 from/to 排序，截断 `MAX_MODULE_RELATIONS = 15`。
- `src/prompts.js`：`generatePrompt` 增加可选 `moduleRelations`，prompt
  增加 `Module dependencies computed from the index (N)` 段与第 7 条任务
  约束（只使用列出的方向，不新增依赖）。
- `src/tool-generate.js`：索引派生的 `moduleRelations` 一次计算、按 locale
  复用，传入主题合成 prompt。
- 测试：
  - `test/modules.test.js`：跨模块聚合、同模块忽略、重复边计数、排序
    与截断；
  - `test/prompts.test.js`：摘要行与约束指令、空列表 `(none)`；
  - `test/tool-llm.test.js`：改造索引（b.ts → lib 模块 + 一条边）后断言
    prompt 含 `. → lib (1 edge(s))`。
- 文档：两份 CHANGELOG、README 双语（stage/路线图/生成能力行）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：340/340 通过。
- `npm run coverage:check`：行 97.83%、分支 87.04%、函数 94.53%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 只给摘要不给全量边：主题合成是单次模型调用，15 条足以表达主干依赖，
  全量边会挤占卡片上下文并抬高成本。
- 同模块边忽略：模块内部关系由卡片负责，主题页关心模块边界。
- 摘要与 locale 无关，一次计算复用：避免多语言运行时重复聚合，也保证
  不同语言页面看到相同的依赖事实。
- 明确“只使用列出方向”的指令：模型在缺少约束时倾向补全合理但不存在
  的依赖；指令 + 摘要一起才形成可核对的依据。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- 提交/推送与版本 tag 由用户确认后执行。
