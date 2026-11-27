# 检查点：status 结构化不可信索引计数（phase-160）

- 日期：2026-11-28
- 合入版本：v0.184.0
- 目标：v0.170 起 `readIndex` 会丢弃被篡改索引里的绝对/越界路径与
  悬空边，但 `repowiki-status` 只把数量写进自然语言告警。JSON/CI 消费方
  必须解析告警文案才能发现资产被净化，无法稳定做门禁判断。
- 状态：代码、测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/tool-status.js`：
  - 输出 schema 的 `index` 增加可选 `untrusted: { files, edges }`
    （`additionalProperties: false`，只投影这两个计数，不回显路径）；
  - 执行结果在 `index.untrusted` 存在时结构化返回；
  - `Index:` 文本行追加 ` / N untrusted path(s), M edge(s) dropped`，
    与既有 `skipped` 并列；原 warning 保留。
- `test/status.test.js`：越界路径夹具新增 `index.untrusted` 深比较与
  渲染行断言。

## 语义边界

- `untrusted.paths`（assets.js 内部用于告警的路径样例）不进入 status
  输出，避免把不可信内容回显给调用方；需要具体原因时仍由 warning 文本
  给出有界计数。
- 只有索引确实被净化时才输出该字段，干净索引的 JSON 形状保持不变。
- 计数来自 `readIndex` 的既有统计，不新增一次扫描。

## 验证

- `LANG=en node --test --test-name-pattern="越界路径" test/status.test.js`：
  通过。
- 全量门禁：`npm test`（双语言 570/570）、`coverage:check`、
  `typecheck`、`lint`、`scan:secrets`、`verify:host`、`git diff --check`。
