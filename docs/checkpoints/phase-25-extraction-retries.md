# 检查点：抽取重试与指数退避 v0.53.0（phase-25）

- 日期：2026-11-27
- 目标：网络抖动、限流或模型偶发坏输出不应永久漏卡；在可控成本下
  增加有界重试，并保持取消语义与输出确定性。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

### 1. 配置与参数

- `src/schema.js`：`MAX_EXTRACT_ATTEMPTS=3`、`EXTRACT_ATTEMPTS_DEFAULT=2`。
- `src/config.js`：`repowiki-plan.json` 新增 `attempts`，
  `normalizeAttempts` 归一化并钳制到 1–3。
- `src/tool-extract.js`：新增 `attempts` 参数（工具参数优先），输出生效
  `attempts` 与 `retried` 次数。

### 2. 重试语义

- 每个文件最多 `attempts` 次模型调用：
  - 抛错（网络/限流/子代理异常）→ 退避后重试；
  - 返回不可用结构 → 退避后重试；
  - 模型明确 `skip=true` → 终态，不重试；
  - 取消信号中止 → 立即停止，不计入 `failed`。
- 退避 200ms → 400ms（上限 1s），使用 `delayWithSignal`；取消时立即
  结束等待，不额外空转。
- 子代理名称带 attempt 序号（`rw-extract-<locale>-<seq>-<attempt>`），
  并发下仍唯一。
- 失败清单仍按路径排序；`retried` 汇总各 locale。

### 3. 测试

- `test/config.test.js`：attempts 归一/钳制与非法值回退。
- `test/tool-llm.test.js`：
  - 首次抛错、第二次成功的重试路径（两个文件均成功，`retried=2`）；
  - 模型明确 skip 时每个文件只调用一次、`retried=0`；
  - 既有失败/取消测试改用 `attempts:1` 明确单次语义。

## 验证（本地全量）

- `npm test`：289/289 通过。
- `npm run coverage:check`：行 97.6%、分支 86.0%、函数 93.6%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 默认 2 次：只在失败时增加一次成本，换取网络抖动与偶发坏输出的
  自愈；可通过 plan/参数关到 1。
- 不重试明确 skip：模型已判定文件不值得建卡，重试只会浪费调用。
- 不加入自适应限流/退避：当前没有可靠的限流反馈，固定指数退避 +
  上限更可预测；后续可基于失败率再做。
- 取消不记 failed：取消是调用方意图，不是文件质量问题。

## 遗留 / 下一步

- v0.54 候选：失败率统计进入 `repowiki-status`、目录级并行索引、
  面板 Wiki 引用点击跳转。
- 浏览器侧视觉冒烟按 phase-15 清单人工确认。
- 提交/推送与版本 tag 由用户确认后执行。
