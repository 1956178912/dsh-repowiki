# 检查点：快照清单结构校验（phase-148）

- 日期：2026-11-28
- 合入版本：v0.172.0
- 目标：v0.168.0 起导入只复制清单登记的文件，但清单本身仍被当作可信
  结构：`schemaVersion` 从不检查（未来版本字段语义变化会被按 v1 误读）、
  `count` 与 `files.length` 不一致也照样“逐文件校验通过”、非对象 JSON
  会被当成空清单（`files` 缺省）而放行零文件、超大清单会一次性读入内存。
- 状态：代码、测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/transfer.js`：
  - `MAX_SNAPSHOT_MANIFEST_BYTES = 8 MiB`；`readSnapshotManifest` 先
    `stat` 再读，超出上限直接返回错误（不解析）；`stat` 不可用时退回
    读取，保持跨后端兼容。
  - JSON 解析结果必须是对象（数组/标量/null 均报
    `manifest is not a JSON object`），不再静默降级为空清单。
  - `verifySnapshot`：`schemaVersion !== SNAPSHOT_SCHEMA_VERSION` 时
    `invalid++` 并立即返回（不按未知语义继续校验）；显式整数 `count`
    与 `files.length` 不一致时 `invalid++`，但继续逐文件校验以保留
    mismatched/missing 明细。
  - `readSnapshotManifest` 新增 `{maxBytes}` 选项，仅用于测试/特殊场景。
- 测试：
  - `test/transfer.test.js`：未知 schema 判无效且 checked=0；缺省 count
    仍可验证通过；count 不一致判无效但 checked=1；`maxBytes` 触发
    “exceeds”错误；数组清单报非对象。
  - `test/tools.test.js`：导出→把清单 schemaVersion 改成 2→清空资产→
    导入被拒（files=0、problems=1、hint 指向校验失败），磁盘上不产生
    `index.json`。

## 语义边界

- 缺省 `count` 的旧/手工清单不判无效：`count` 是 v0.163.0 引入的冗余
  字段，强制要求会破坏兼容；显式不一致才视为篡改/截断。
- 未知 schema 直接判无效而不是“尽力解析”：清单字段语义可能变化，
  按 v1 解释未来清单会产生错误的安全结论（例如把不同字段当作指纹）。
  用户仍可用 `allowCorrupt=true` 强制导入，此时按 v1 读取 `files`。
- 8 MiB 上限按每文件约 80 字节估算（2 万文件约 1.6 MiB），足够覆盖
  校验上限 2 万文件，同时挡住异常/恶意大文件。
- 上限检查依赖 `ctx.fs.stat` 的 `size`；后端不返回大小时仍会读取，
  此时由 `readText` 自身限制兜底。

## 验证

- `LANG=en node --test test/transfer.test.js test/tools.test.js`：38/38 通过。
- 全量门禁：`npm test`（双语言 548/548）、`coverage:check`（行 98.07 /
  分支 86.76 / 函数 95.40）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
