# 检查点：有界并发漂移读取（phase-111）

- 日期：2026-11-27
- 合入版本：v0.135.0
- 目标：引用漂移检查此前逐个串行读取引用文件（最多 100 个），大仓库
  status 延迟高。本轮改为有界并发预取，结果与口径完全不变。
- 状态：代码、并发测试、全量门禁完成；已提交并推送。

## 交付

- `src/citation-drift.js`：
  - 新增 `MAX_CITATION_DRIFT_CONCURRENCY = 8` 与硬上限 16；
  - `checkCitationDrift` 先按清单顺序收集安全（非绝对路径、无 `..`）且
    在 `maxReads` 内的唯一路径，再用 `runBounded` 并发预取；
  - 预取完成后按原清单顺序比较指纹，输出顺序、`checked` / `unchecked` /
    `truncated` 口径与串行版本一致；
  - `readText` 抛错仍按 null（未检查）处理，绝不判为漂移；
  - `options.concurrency` 可覆盖并发，非法值回退默认，超过硬上限被钳制。
- status 工具描述同步说明"bounded concurrent reads"。
- 双语文档、覆盖率报告同步。

## 并发语义

- 默认 8：平衡本地/网络文件系统吞吐与资源占用；硬上限 16 防止异常参数
  放大 IO。
- 只预取唯一路径：同一文件被多条引用使用时不重复读取。
- 读取上限仍按唯一路径计；超过 `maxReads` 的路径不读取，其引用计入
  `unchecked`，与旧行为一致。
- 并发只影响读取调度，不影响输出：比较仍按清单条目顺序，页面/问题排序
  不变。

## 测试

- `test/citation-drift.test.js`：
  - `concurrency: 3` 时 5 个文件全部验证、最大同时读取数为 3；
  - `concurrency: 1` 时退化为串行（最大并发 1）；
  - 既有上限、不可读、不安全路径与覆盖率用例全部保持通过。
- 全量 489 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：489/489（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.21%、分支 86.65%、函数 95.22%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 没有为生成侧的指纹计算同步改为并发：生成由模型调用主导，读取占比小，
  且现有循环与分页原因记录耦合；先优化高频的 status/短路检查。
- 没有把并发数暴露为工具参数：内部常量足够，避免用户误调放大 IO；
  `checkCitationDrift` 仍保留 `concurrency` 选项供测试/内部使用。
- 预取会在发现第一条漂移后仍读取其余文件：status 需要完整统计，
  generate 也需要 `total`，保持一次遍历的确定性。

## 遗留 / 下一步

- 读取上限分批校验，减少大仓库 unchecked。
- 面板漂移徽章（需源码读取或状态快照）。
- 原因趋势统计（需要历史快照）。
