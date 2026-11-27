# 检查点：漂移感知增量生成（phase-105）

- 日期：2026-11-27
- 合入版本：v0.129.0
- 目标：上一轮让 status 能报告"引用代码已变"，但 generate 的 fresh 短路
  仍只看卡片与记忆指纹。本轮把引用内容漂移纳入短路判定，避免 Wiki 在
  被引用代码变化后继续被当作最新。
- 状态：代码、纯函数/工具集成测试、双语文档、全量门禁完成；已提交并推送。

## 交付

- 新增 `src/citation-drift.js`：
  - `checkCitationDrift(manifest, readText, options)`：收集清单
    `pages[].citationDigests`，拒绝绝对路径与 `..`，同一文件只读一次，
    重算指纹并返回 `{total, checked, unchecked, pages, truncated}`；
    没有任何指纹的旧清单返回 `null`；
  - 默认上限 500 条比较 / 100 文件读取；超过比较上限的条目计入
    `unchecked` 而不是静默忽略，截断的检查不会被调用方误判为最新。
- `src/tool-status.js`：
  - 删除本地重复的引用解析/指纹比较逻辑，改用共享函数；
  - 输出与 `Citation drift` 渲染保持不变。
- `src/tool-generate.js`：
  - fresh 短路在卡片/记忆指纹一致后追加引用校验：
    `total > 0`（内容变化）或 `unchecked > 0`（不可读/非法/超限）时不跳过；
  - 读取上限与生成侧记录上限对齐（200 文件）；
  - 验证通过返回 `citationDrift: 0` 与解释性 hint；重新合成时 hint 说明
    "N 条引用变化"或"引用新鲜度无法验证（N 条）"；
  - 顶层与 per-locale 输出 schema 增加 `citationDrift`，文本渲染同步；
  - 无指纹的 v1/v2 清单保持原行为（不判定、仍可短路）。

## 测试

- `test/citation-drift.test.js`：一致/变化/不可读/不安全路径、无指纹返回
  `null`、读取上限、比较条目上限计入 unchecked。
- `test/tool-llm.test.js`：引用未变时仍短路且 `citationDrift: 0`；只改被
  引用源码时重新派发模型并给出原因；引用文件不可读时保守重合成。
- `test/status.test.js`：既有漂移用例在共享模块上继续通过。

## 语义边界

- 指纹只证明"被引用文本变化"，格式化也会触发；不判断语义相关性。
- `unchecked` 触发一次保守重合成；重合成后无法读取的引用不会写入指纹，
  后续运行只验证已记录的引用。
- `granularity=module/all` 本来就不走 fresh 短路，因此不产生 `citationDrift`。
- 旧清单没有指纹，仍按原逻辑短路，不声称"已验证"。

## 验证

- `npm test`：481/481（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.20%、分支 86.47%、函数 95.14%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 共享检查器让 status 与 generate 语义一致，代价是读取函数由调用方注入，
  模块本身不碰 `ctx.fs`。
- `unchecked` 也阻止短路：宁可多一次模型调用，也不把未验证的 Wiki 冒充
  为最新；读取失败通常意味着用户需要先修复引用或重新抽取。
- 比较条目上限之外不再读取，避免恶意/异常清单放大 IO；这些条目按
  unchecked 上报，保持诚实。

## 遗留 / 下一步

- 面板可展示漂移徽章（需要清单 v3 与源码读取能力）。
- 可在生成输出中报告本轮写入的指纹数量与覆盖率，便于确认检查范围。
- 可考虑为超限清单提供分页/分批校验，而不是直接触发重合成。
