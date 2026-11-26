# ADR-0003: LLM 调用走 spawn 子代理，模型路由只做"继承会话默认"一层

- Date: 2026-11-26
- Status: Accepted (Phase 2)

## Context

Phase 2 的卡片提取与 Wiki 生成本质是 LLM 子任务。评审修订版 §P1 记录：
`GenerateOptions.provider/model` 必填、`agent/request` hook 已弃用——工具
直调 `ctx.llm.stream()` 只尝试一次、无 agent 层重试、无会话路由继承。官方
机制是派发本地子代理（`ctx.subagents.startActivation({provider:'spawn'})`），
它天然继承父会话的 provider/model/reasoning effort/output-token limit
（spawn README 原文），这正是"模型路由第一层（会话默认）"的正确实现。

修订版 §P1 同时设计"第二层"：`SubagentActivationSpec.agentOptions` 的
`{provider, model, reasoningEffort?}` 阶段级覆盖，取值来自插件 `Config`。
而本 bundle 按 ADR-0002 选择了零外部 import（不 import schemastery 声明
Config schema），且用户硬约束"不依赖第三方插件"。

## Decision

1. **LLM 子任务一律派发 spawn 子代理**：`provider: 'spawn'`，
   `delivery: 'caller'`（工具消费结果），取消走 `exec.signal`，结构化输出
   经 `outputSchema`（JsonSchemaNode 子集）约束，`parent` 取 `exec.agent`。
2. **模型路由只做一层：继承会话默认**，本阶段不传 `agentOptions`、不声明
   插件 `Config`。
3. **输出形态由插件渲染**：子代理只返回受约束 JSON，卡片/Wiki 的
   Markdown 格式由 src/render.js 统一渲染（避免 LLM 格式漂移，保证检索
   可解析）。
4. **项目级配置走 `.dsh-repowiki/repowiki-plan.json`**（JSON、零依赖、随
   Git），不引入 YAML 解析依赖。

## Rationale

1. 子代理路径顺带获得重试、取消、`outputSchema` 校验（评审 §P1 附带收益）。
2. 继承会话默认对绝大多数场景够用：用户在哪个会话触发就用哪个模型；
   ADR-0002 的零 import 原则不因配置便利性妥协。
3. 卡片 JSON frontmatter（而非 YAML）使解析零依赖、Git diff 清晰。

## Consequences（诚实披露）

- 用户**无法**在 Settings/patch 层为提取/生成指定其他模型（模型覆盖能力
  后置）。需要时两条路：①工具参数（暂时不暴露模型字段，因为 ② 更稳妥）；
  ②后续引入 schemastery Config 或自写极简 schema 声明——届时本 ADR 的
  第 2 条作废并新增 ADR。
- `agentOptions` 的 capability 由 spawn 后端声明（Phase 0 探针 + 包 README
  确认），未来升级到路由二层无需换后端。
- extract 每文件一次子代理激活：500 文件仓库首轮成本由 `maxCardsPerRun`
  默认 40 与 `paths`/`includeOnly` 参数约束（修订版 §11.4 成本模型）。

## Rollback

把 runSubagent 改为带 `agentOptions` 的调用（值来自新增的 Config 字段），
其余链路不变。
