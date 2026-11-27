# 检查点：status 解析器版本可见性（phase-169）

- 日期：2026-11-28
- 合入版本：v0.193.0
- 目标：v0.190 把 `INDEX_PARSER_VERSION` 提升到 2 后，旧索引在下次重建
  时会全量重解析。但 `repowiki-status` 不展示索引的 parserVersion，用户
  无法在执行重建前知道这一状态，也容易误以为新语言支持没有生效。
- 状态：代码、测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/tool-status.js`：
  - 导入 `INDEX_PARSER_VERSION`；
  - 输出 `index.parserVersion`（仅当索引中为数字），schema 增加可选字段；
  - 当缓存版本与运行版本不一致时追加告警：下次重建会重解析全部文件；
  - `Index:` 文本行追加 ` / parser vN`。
- `test/status.test.js`：新增 `parserVersion: 1` 索引夹具，断言结构化字段、
  `/parser v1/` 告警与渲染文本。

## 语义边界

- 只比较版本号，不推断差异内容；告警文案说明“下次重建将重新解析全部
  文件”，与 v0.190 的缓存失效行为一致。
- 索引缺失 `parserVersion`（很旧的索引）时不告警（无从比较），也不输出
  该字段；`schemaVersion` 兼容性检查保持独立。
- 该字段只读展示，不触发任何重解析或写盘。

## 验证

- `LANG=en node --test --test-name-pattern="旧解析器" test/status.test.js`：
  通过。
- 全量门禁：`npm test`（双语言 585/585）、`coverage:check`（行 98.08 /
  分支 86.79 / 函数 95.48）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
