# 检查点：面板记忆陈旧提示（phase-125）

- 日期：2026-11-27
- 合入版本：v0.149.0
- 目标：v0.148.0 面板已能重算卡片 `inputDigest` 并提示落后，但
  `repowiki-generate` 的增量短路同时比较已采信记忆 `memoryDigest`；
  面板仍可能显示“新鲜”而生成侧会重新合成。
- 状态：代码、面板测试、双语全量门禁完成；已提交并推送。

## 交付

- `client.js`：
  - `loadMemoryEntries` 额外返回 `body`：按 generate 的口径去掉一级
    标题并 trim（`text` 仍保留原文供详情渲染）。
  - 新增 `memoriesInputDigest(memories)`：只取 `status=accepted`，
    按 `slug:body` 排序后 `digestHex`。
  - 装载成功后计算记忆指纹，写入 `wikiMeta.memoryStale`
    （`true`/`false`/`null`）；等待记忆读取后再次检查请求是否过期。
  - Wiki 页签诊断块新增 `wikiStaleMemory` 提示。
- 新增中英文文案 `wikiStaleMemory`。
- `test/client-smoke.test.js` 新增用例：清单写入错误 `memoryDigest`，
  断言 Wiki 页签显示记忆落后提示。
- 双语文档、覆盖率报告、Runbook 同步。

## 测试

- `node --test test/client-smoke.test.js`：33/33。
- 全量 513 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 只统计 `accepted` 记忆：与 generate 的 `listMemory(..., 'accepted')`
  一致；pending/rejected 不参与。
- 正文口径：`parsed.body` 去掉一级标题后 trim；slug 取文件名，与
  generate 的 `slug:body` 完全一致。
- Web Crypto 不可用时 `memoryStale=null`，不显示提示，避免误报。
- 卡片与记忆提示相互独立：任一指纹不一致都会显示对应文案。

## 验证

- `npm test`：513/513（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.04%、分支 86.32%、函数 95.32%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 仍不在面板做引用指纹/漂移检查：需要读取源码与与生成侧一致的净化规则，
  CLI 已完整覆盖，面板保持轻量。
- 提示文案独立而不合并成“输入已变化”：卡片与记忆的修复动作相同，但
  分开显示更利于定位是哪类输入变化。
- 不自动触发重新生成：面板只呈现事实，动作由用户发起。
- 两个指纹计算用 `Promise.all` 并行；DOM 下钻用例从固定 150ms 改为
  条件轮询（最多 1s），消除新增 await 带来的时序脆弱。

## 遗留 / 下一步

- 健康分是否纳入缺页/生成失败，留待评估。
- `verify:wiki` 的读取并发优化（大仓库卡片/页面较多时可评估）。
