# 检查点：有界并发抽取 v0.52.0（phase-24）

- 日期：2026-11-27
- 目标：降低大仓库首轮抽取的等待时间——在保证写盘串行、取消安全、
  输出可复现的前提下，允许并行派发多个文件的子代理。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

### 1. 配置与工具参数

- `src/schema.js`：`MAX_EXTRACT_CONCURRENCY=4`、`EXTRACT_CONCURRENCY_DEFAULT=1`。
- `src/config.js`：`repowiki-plan.json` 新增 `concurrency`，
  `normalizeConcurrency` 归一化并钳制到 1–4；非法值回退默认。
- `src/tool-extract.js`：新增 `concurrency` 参数（工具参数优先于 plan），
  输出生效并发数；描述说明成本/限流风险。

### 2. 执行模型

- 单 locale 内改为共享游标 + N 个 worker 的有界并发：
  - worker 领到候选后先做 fresh/manuallyEdited/slug 预检；
  - 源码读取与子代理派发在资产锁外并行；
  - 写卡仍逐张 `withLock(root, ...)`，写前二次判定不变；
  - 取消后 worker 不再领取新候选，在飞调用走 `exec.signal`；
  - 失败清单按路径排序，保证并发输出可复现。
- `candidates` 的索引查找改为一次构建 `fileByPath`，避免每个候选线性扫描。
- 多 locale 仍逐 locale 串行；并发只作用于单个 locale 内部。

### 3. 测试

- `test/config.test.js`：readPlan 的 concurrency 归一/钳制、非法值回退、
  `normalizeConcurrency` 边界。
- `test/tool-llm.test.js`：并发 2 时两路同时在飞（maxActive=2）；
  默认并发 1 时严格串行（maxActive=1），且两轮都成功写卡。
- 既有取消、二次判定、manuallyEdited、失败隔离测试全部保持通过。

## 验证（本地全量）

- `npm test`：286/286 通过。
- `npm run coverage:check`：行 97.6%、分支 86.0%、函数 93.53%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 默认并发 1：保持既有成本曲线与宿主限流行为；需要提速时显式设置。
- 并发只并行模型调用，不并行写盘：复用 ADR-0005 的资产根锁，
  避免两个 worker 同时写同一张卡/清单。
- 不做动态自适应并发：当前没有可靠的限流反馈通道，静态上限 4 更稳；
  后续可基于失败率再做退避（YAGNI）。

## 遗留 / 下一步

- v0.53 候选：目录级并行索引、抽取失败退避/重试策略、面板 Wiki 跳转。
- 浏览器侧视觉冒烟按 phase-15 清单人工确认。
- 提交/推送与版本 tag 由用户确认后执行。
