# 检查点：面板卡片陈旧提示（phase-124）

- 日期：2026-11-27
- 合入版本：v0.148.0
- 目标：CLI（verify:wiki）与 status 已能发现“卡片变化后 Wiki 未重新
  生成”，但面板只能看到引用/缺页问题；用户在 GUI 里无法判断 Wiki 是否
  落后于卡片。
- 状态：代码、面板测试、双语全量门禁完成；已提交并推送。

## 交付

- `client.js`：
  - `digestHex(text, 16)`：使用 `globalThis.crypto.subtle` 计算
    SHA-256 前缀；不可用或异常时返回空串。
  - `cardsInputDigest(cards)`：按 `path` 去重，`path:sourceDigest` 排序
    后哈希，与 `repowiki-generate` 的 `inputDigest` 同口径。
  - 装载成功时与清单 `inputDigest` 比较，结果写入 `wikiMeta.cardsStale`
    （`true`/`false`/`null`）。
  - Wiki 页签诊断块顶部新增 `wikiStaleCards` 提示（`role=status`，
    错误色），仅在 `cardsStale === true` 时显示。
- 新增中英文文案 `wikiStaleCards`。
- `test/client-smoke.test.js` 新增用例：覆盖清单 `inputDigest` 为固定
  错误值，断言 Wiki 页签显示落后提示。
- 双语文档、覆盖率报告、Runbook 同步。

## 测试

- `node --test test/client-smoke.test.js`：32/32。
- 全量 512 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 只比较卡片指纹，不含已采信记忆：记忆正文的浏览器侧口径解析更复杂，
  本轮先覆盖最常见的卡片变化；CLI 仍完整检查卡片与记忆。
- Web Crypto 不可用（非安全上下文、旧运行时）时 `cardsStale=null`，
  不显示提示，避免误报“落后”。
- 卡片按 `path` 去重：与 generate 的卡片 Map 一致；同一路径多卡时后者
  覆盖。
- 提示不参与筛选与自动生成：只呈现事实，动作仍由用户点击生成按钮。

## 验证

- `npm test`：512/512（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.03%、分支 86.43%、函数 95.31%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 使用 Web Crypto 而不是内置纯 JS SHA-256：避免 ~100 行安全敏感代码，
  且测试/现代运行时均可用；不可用时静默降级。
- 不在面板重算引用指纹/记忆指纹：需要读取更多资产与与生成侧一致的
  正文化，收益小于成本，留在 CLI 门禁。
- 提示文案直接可行动（run repowiki-generate），不新增按钮，避免面板
  动作过多。

## 遗留 / 下一步

- 面板补记忆指纹比较（复用同一 digest 工具）。
- 健康分是否纳入缺页/生成失败，留待评估。
