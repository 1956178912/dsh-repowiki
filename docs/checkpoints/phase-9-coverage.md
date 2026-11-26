# 检查点：LLM 执行路径的契约级测试覆盖（覆盖率驱动）

- 日期：2026-11-26
- 版本：v0.19.0
- 目标：用覆盖率数据找出仍然裸奔的核心路径并补齐测试。

## 触发与发现

跑 `node --test --experimental-test-coverage`（Node 24 内置）摸底：
整体 89.93% 行 / 81.32% 分支——达标，但两个高风险盲区：

| 模块 | 修改前 | 风险 |
|---|---|---|
| `spawn.js` | 58.62%（runSubagent 函数体未测） | 方案 §P1 的**核心 seam**（startActivation 的 outputSchema/delivery/parent/signal 契约）——与 RemoteResult 契约坑同类风险 |
| `tool-extract.js` / `tool-generate.js` | 56.64% / 48.41%（execute 主路径未测） | LLM 派发的两个工具只测过导出的判定函数，execute 从未跑过 |

## 完成情况

- `test/spawn.test.js`（新，6 测）：startActivation 规格形态
  （provider/delivery/parent/prompt 块数组/outputSchema 透传）、
  dispose 在成功与失败路径均调用且抛错不吞结果、缺能力/缺 agent
  的可读错误、getLocale 环境映射。spawn.js → **100%**。
- `test/tool-llm.test.js`（新，8 测）：契约级假子代理（按 label
  分派、记录每次 activation 规格）驱动 extract/generate 的 execute：
  - 派发规格断言（parent === exec.agent、prompt 含源文件路径、
    outputSchema 带 required）；
  - 首次抽取写卡片（frontmatter title/sourceDigest + 正文渲染）；
  - 二次抽取 digest 跳过、不做新派发；
  - manuallyEdited 保护（源文件变化也不覆盖）；
  - 不可用卡片记 failed（含 stopReason 诊断）；
  - 源文件索引后被删除记 'source unreadable' 且不阻断其他文件；
  - generate 消费卡片写 Wiki 页面、无卡片/空页面输出给可读 hint。
- **修到一个真实 bug**：tool-extract 的 execute 返回值缺
  `skippedManual` 与 `orphaned`（均在 output schema 的 required
  列表里）——渲染层会把 "undefined manually edited" 打给用户、
  返回值不满足声明的输出契约。已修。人工保护测试同时成为修复的
  回归断言。
- 覆盖率：整体 89.93% → **94.71%** 行；spawn.js、card-schema.js、
  render.js、schema.js、util.js 等多个模块 100%。
- 文档：CHANGELOG、双语 README、coverage.md 同步。

## 设计决策

1. **契约级 stub 而非模拟子代理内部**：单测不该验证"子代理会不会
   干活"，只验证"本插件发出的请求形态与官方文档约束一致、以及拿到
   受约束输出后的处理"。与 RemoteResult 修复同一种思路：边界是
   契约。
2. **by-label 分派**：同一 ctx 的假子代理须对 extract/generate
   返回不同结构——第一版测试用单一返回值导致 generate 拿到了卡片
   结构（测试设计 bug，暴露后改为按 spec.label 分派）。
3. **覆盖率作为发现工具而非 KPI**：盲区是 LLM 主路径这类"人工
   冒烟难覆盖、契约变更静默失败"的地方；分支覆盖率略有下降
   （81.32→80.17）是新覆盖暴露出的未测分支，属正常。

## 验证

- 111/111 全绿（99 → 111：spawn 6 + tool-llm 8，替换/新增）。
- CI 与安装验证见发布流程（v0.19.0）。

## 下一步

- 用户 GUI 现场反馈（总览/深色/点击三样）。
- 若覆盖再提升：client.js 的错误分支（91.14%）多为 GUI 层降级
  路径，可用 jsdom 进一步注入故障测试。
