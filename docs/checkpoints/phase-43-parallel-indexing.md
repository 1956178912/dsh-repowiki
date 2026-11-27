# 检查点：有界并行索引 v0.68.0（phase-43）

- 日期：2026-11-27
- 目标：消除索引阶段的串行文件读取。宿主 `ctx.fs` 可能是远程工作区，
  逐文件 `await` 会按文件累积 RTT；5000 文件在真实仓库里是可感知的等待。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/indexer.js`：
  - `indexOneFile`：单文件读取 + 增量判定 + 符号/依赖提取的最小工作单元，
    读取失败或超限返回 skipped；
  - `buildIndex` 的源码循环改为共享游标 + 固定 worker 池
    （`readConcurrency` 默认 8，硬顶 16），结果写入 `results[position]`，
    最后按遍历顺序装配 → 与串行产物逐字段一致；
  - 取消语义：worker 在派发前检查信号，取消后不再领取新文件；已发出的
    读取完成后仍上报 `aborted` 部分结果（不写盘由调用方决定）；
  - `BuildOptions.readConcurrency` 供测试与未来调优。
- `scripts/bench.mjs`：接受第二个参数 `readConcurrency` 并打印，便于
  对比串行/并发。
- 测试 `test/indexer.test.js`：24 文件 + 5ms 延迟的 fs 适配器，断言
  最大在飞读取 > 1 且 ≤ 4；并行结果与 `readConcurrency: 1` 的 `files`
  逐字段相等。
- 文档：两份 CHANGELOG、README 双语（stage/路线图/架构要点）、
  `docs/benchmarks.md`（并发对比与本地/远程差异）、`docs/coverage.md`。

## 验证（本地全量）

- `npm test`：329/329 通过。
- `npm run coverage:check`：行 97.81%、分支 86.94%、函数 94.47%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。
- 基准（本地同步 fs）：1000 文件 35→32ms；5000 文件 126→120ms；
  RSS 基本持平（69/100MiB）。

## 关键决策与取舍

- 并发只作用于"读取 + 解析"，遍历仍顺序：目录枚举结果需要用于预算与
  忽略统计，且并发遍历会让 capped/ignored 变得不可解释。
- 结果按位置装配而非完成顺序：index.json 的稳定性是 Git 共享资产的前提；
  并发不能以输出顺序漂移为代价。
- 默认 8 路而非更高：宿主 fs 可能是本地磁盘/远程 RPC 的混合，8 路足以
  隐藏 RTT 且不会在弱机器上制造明显 I/O 峰值；硬顶 16 防误配。
- 本地同步 fs 收益小是预期结果：读取不是本地瓶颈，测试与文档如实记录，
  不把"微基准提升"包装成主要收益。

## 遗留 / 下一步

- 目录级并行遍历（本轮明确不做，保持预算/忽略语义可解释）。
- 多行 Scala 参数子句。
- 提交/推送与版本 tag 由用户确认后执行。
