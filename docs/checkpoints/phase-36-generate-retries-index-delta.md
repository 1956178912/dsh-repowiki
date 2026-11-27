# 检查点：生成重试与索引变更计数 v0.61.0（phase-36）

- 日期：2026-11-27
- 目标：让主题合成在模型偶发失败时自愈（与抽取对齐），并让增量索引
  如实报告"新增/变更/删除"，而不是只有一个 reused 数。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/tool-generate.js`：
  - 新增 `attempts`（1–3，默认 2，复用 `normalizeAttempts` 钳制）。
  - 主题合成循环：抛错或空页面列表按 200ms/400ms（上限 1s）退避重试；
    退避可被 `exec.signal` 打断；取消后不再派发下一次。
  - 结果与 `byLocale` 增加 `attempts`/`retried`；渲染行标注重试次数；
    `presentCall` rawInput 带 attempts；描述补充重试语义。
- `src/util.js`：新增 `delayWithSignal`；`src/tool-extract.js` 改为共用
  （删除本地副本），抽取与生成的重试退避语义一致。
- `src/indexer.js`：统计新增 `added` / `changed` / `removed`；
  `removed` 仅在完整遍历（未截断、未取消）时计算，避免把未扫到的旧文件
  误报为删除。
- `src/tool-index.js`：输出 schema 与结果增加三个计数；渲染为
  `N reused, A added, C changed, R removed`。
- 测试：
  - `test/tool-llm.test.js`：空输出 + attempts=1 不重试；首次空输出、
    第二次成功（断言两次派发、`retried=1`、成功后无失败 hint）。
  - `test/indexer.test.js` / `test/tools.test.js`：首版新增、未变复用、
    修改计 changed、删除计 removed 与渲染文案。

## 验证（本地全量）

- `npm test`：318/318 通过。
- `npm run coverage:check`：行 97.83%、分支 86.92%、函数 94.15%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 生成重试复用抽取的钳制函数与退避策略：两处行为一致，用户不需要记忆
  两套语义；常量为局部声明，避免为两个数字增加公共配置面。
- 重试只在"抛错/空页面"时发生：模型返回部分页面属于可用结果，重跑会
  放大成本且可能覆盖已成功内容。
- `removed` 在截断/取消时归零：删除判定要求"完整看到当前文件集"，
  否则会把预算外的文件误报为删除（诚实优先）。

## 遗留 / 下一步

- 目录级并行索引（大仓库吞吐）。
- Scala `given`/`extension` 成员归属；Swift 自定义 `path:` 目标。
- 提交/推送与版本 tag 由用户确认后执行。
