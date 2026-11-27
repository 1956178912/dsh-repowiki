# 检查点：生成失败页持久化（phase-119）

- 日期：2026-11-27
- 合入版本：v0.143.0
- 目标：`repowiki-generate` 的页面写失败只在当次工具输出里出现；清单仍会
  按新输入指纹更新，下一次 `verify:wiki` 可能把一次不完整的生成当成新鲜
  Wiki。本轮把失败页写入清单，让门禁与 status 都能跨会话发现。
- 状态：代码、测试、双语全量门禁完成；已提交并推送。

## 交付

- `src/tool-generate.js`：
  - 清单 payload 新增 `failed`（最多 10 条 `{slug, reason}`）与
    `failedTotal`（完整失败数），写入位置在页面写循环之后、清单落盘之前；
  - 清单自身写失败仍只进入本次 `out.failed`（无法持久化自身失败）。
- `scripts/verify-wiki.mjs`：
  - 读取 `manifest.failedTotal`（缺失时回退 `failed.length`）；
  - 有失败页时产出 `wiki/generation-failed`：默认警告，
    `--strict` 下错误；
  - locale 结果新增 `failedPages` 计数，JSON 可直接消费。
- `src/tool-status.js`：
  - 输出 `wiki.failed` 与 `wiki.failedPages`（最多 10 个 slug）；
  - 文本 `Wiki:` 行追加 `failed N`；
  - 输出 schema 同步新增字段。
- 测试：
  - `tool-llm` 断言干净生成的 `failed: []`、`failedTotal: 0`；
  - `verify-wiki` 新增失败页的宽松/严格用例，断言问题码与 `failedPages`；
  - `status` 新增清单失败页的结构与文本用例。
- 双语文档、覆盖率报告、Runbook 同步。

## 测试

- 相关单文件：verify-wiki 13/13、status 相关全通过、tool-llm 37/37。
- 全量 506 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 只持久化“页面写失败”；主题合成的重试失败不写清单：如果输入未变，旧
  Wiki 仍然新鲜，generate 不写清单也不应让门禁失败。
- `failed` 明细有界（10 条），`failedTotal` 保留完整数量；门禁与 status
  都优先使用 `failedTotal`，旧清单没有该字段时回退数组长度。
- 默认只告警：失败页可能是可重试的偶发 IO 问题，旧页面仍可用；CI 用
  `--strict` 可将其升级为失败。
- 清单自身写失败不会写入清单（写入目标已失败），只能由当次工具输出或
  `repowiki-status` 的 manifest 缺失诊断发现。

## 验证

- `npm test`：506/506（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.04%、分支 86.27%、函数 95.14%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 失败页信息放清单而不是独立文件：清单已是 Wiki 资产的单一索引，读取方
  （verify/status/面板）无需新增文件通道。
- 不记录失败时间/尝试次数：本次工具输出已有重试计数，清单只保留跨会话
  仍需要的“哪些页没写成”。
- status 不把失败页计入健康分：与未验证引用一致，先报告、不改变既有
  评分口径；是否扣分留待有更多使用数据后决定。

## 遗留 / 下一步

- 面板 Wiki 页签读取清单的 `failed` 并显示失败页提示。
- GitHub Actions 示例：仓库内 fixture 上运行
  `verify:wiki --strict --require`。
