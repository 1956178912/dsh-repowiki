# 检查点：大快照有界并发校验（phase-141）

- 日期：2026-11-27
- 合入版本：v0.165.0
- 目标：v0.163.0 引入快照指纹校验时把比对上限设为 500 个文件。真实仓库
  的卡片数可等于源文件数（索引上限 5000），再加上 Wiki 页面后很容易超过
  500；这种快照会被判 `capped`、`verified=false`，默认导入直接拒绝。
  同时校验逐文件串行读取，在远程工作区按 RTT 累积，数千文件会非常慢。
- 状态：代码、并发/上限测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/transfer.js`：
  - `MAX_SNAPSHOT_VERIFY` 从 500 提升到 20,000，覆盖 5000 文件仓库的
    卡片 + Wiki 页面，同时仍是有界上限。
  - `verifySnapshot` 增加 `opts.limit`（测试/特殊场景覆盖上限）。
  - 读取改为 8 路有界并发（`SNAPSHOT_VERIFY_CONCURRENCY`），结果写入固定
    槽位后按清单顺序聚合，`mismatchedPaths`/`missingPaths` 顺序稳定。
  - `capped` 语义不变：超过上限不声称 verified。
- `src/tool-import.js`：`snapshotCapped` 描述与拒绝 hint 更新到 2 万上限。
- `test/transfer.test.js`：带 5ms 延迟的读包装器断言并发峰值 >1 且 ≤8；
  显式 `limit:2` 断言 `capped=true`、`checked=2`、`verified=false`。
- README 双语、覆盖率报告、CHANGELOG 同步。

## 语义边界

- 仍有上限（2 万）：异常清单不能放大 IO；超限时 `capped` 并默认拒绝，
  `allowCorrupt=true` 可强制导入。
- 并发只影响读取顺序，不影响计数与路径明细顺序；失败/缺失按清单遍历
  顺序记录前 5 条。
- `limit` 参数只用于测试与特殊场景，工具层不暴露，避免用户误把校验
  截断当成完整校验。
- 校验仍是只读；导入的写操作与锁语义不变。

## 测试

- `node --test test/transfer.test.js`：11/11。
- 全量 532 例（LANG=en 与 LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：532/532（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 97.99%、分支 86.40%、函数 95.30%。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不把上限做成工具参数：完整性校验的默认值应足够覆盖正常仓库，暴露上限
  会诱导用户“调小求快”，失去校验意义。
- 不采用“校验前 500 个就算通过”：部分校验不能证明快照完整，宁可拒绝。
- 不做流式校验与复制合并：导入需要先判定完整性再写盘，读两遍换取
  fail-closed 语义是值得的。
