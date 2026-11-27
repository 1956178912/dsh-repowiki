# 检查点：语言接入完整性守卫（phase-186）

- 日期：2026-11-28
- 合入版本：v0.210.0
- 目标：语言接入需要同时改 `schema.js`、`symbols.js`、`deps.js`、
  `indexer.js`、`prompts.js`、`client.js` 与文档。历史上存在只改一半的
  风险（扩展名被识别但 Prompt 围栏或面板标签缺失）。本迭代加入自动守卫。
- 状态：代码、测试、双语文档与检查点更新；全量门禁通过。

## 交付

- `src/prompts.js`：`fenceLang` 改为导出（Prompt 输出不变）。
- `test/docs-consistency.test.js`：新增「每种符号语言都有提示词围栏与
  面板标签」用例——遍历 `SYMBOL_LANGUAGES`（28 项：26 种语言 + Vue/
  Svelte SFC），断言 `fenceLang(lang)` 非空，并以源码文本断言
  `client.js` 的 `LANGUAGE_LABELS` 含对应条目。
- 与既有资产版本守卫放在同一文件，形成"文档/接入一致性"测试组。

## 语义边界

- 面板标签用源码文本匹配（`\n  lang: '…'`），不做运行时 import，
  避免把浏览器端模块引入 node 测试。
- 守卫只覆盖"围栏 + 标签"，不校验技术栈映射或文档表格行名
  （这些没有稳定机器可读键）。

## 验证

- `LANG=en npm test`：619/619
- `LANG=zh_CN.UTF-8 npm test`：619/619
- `npm run coverage:check`：行 98.09%、分支 87.46%、函数 95.72%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
