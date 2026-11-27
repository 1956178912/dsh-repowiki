# 检查点：重复代码检测（phase-202）

- 日期：2026-11-28
- 合入版本：v0.226.0
- 目标：知识库已能回答依赖、影响面与分层违规，但无法提示"同一段逻辑
  在多处复制"。补上有界重复检测后，`repowiki-status` 可直接给出跨文件
  重复块线索，作为重构/抽取的复核入口。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/duplicates.js`：
  - `normalizeDuplicateLine`：去首尾空白、压缩连续空白；
  - FNV-1a 32 位行窗口指纹；
  - `findDuplicates`：跨文件共享窗口合并为块（相邻窗口延长），
    总数精确、组数/位置/文件数/行数均有上限；
  - 全空窗口与单文件重复不计。
- `src/tool-status.js`：
  - `readDuplicateSources`：8 路有界并发读取，最多 150 个文件；
  - 索引至少两个文件时计算并输出 `duplicates` 区块（schema 完整定义）；
  - 重复总数 > 0 进入告警，文本报告新增 `Duplicates:` 行；
  - 工具描述补充该能力。
- 测试：
  - `test/duplicates.test.js`：空白归一、跨文件合并、单文件/短块排除、
    空窗口、组数上限、行数上限；
  - `test/status.test.js`：重复块集成（报告/告警/渲染）与单文件项目
    不输出区块。

## 语义边界

- 行级指纹，不是语义克隆：变量重命名/语句重排不会被识别。
- 只比较跨文件窗口；单文件内部重复不报告。
- 超过 400 行或第 150 个之后的文件跳过并计数，结果中如实给出
  `filesScanned`/`filesSkipped`。
- 相邻窗口合并可能把"两个连续但不同的块"合并为一个长块（视为连续
  重复，属于可接受近似）。

## 验证

- `LANG=en npm test`：672/672
- `LANG=zh_CN.UTF-8 npm test`：672/672
- `npm run coverage:check`：行 98.01%、分支约 87.8%、函数 95.88%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
