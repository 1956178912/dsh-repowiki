---
{
  "schemaVersion": 1,
  "path": "index.js",
  "lang": "javascript",
  "locale": "zh",
  "title": "dsh-repowiki 插件入口：工具注册与能力注入",
  "tags": [
    "插件入口",
    "dsh插件",
    "cordis",
    "工具注册",
    "repowiki",
    "生命周期管理"
  ],
  "manuallyEdited": false,
  "generatedAt": "2026-11-26T08:21:03.453Z"
}
---
# dsh-repowiki 插件入口：工具注册与能力注入

> index.js

## 概要 / Summary

本文件是 dsh-repowiki 插件的入口模块，遵循 Cordis/DSH 宿主插件约定，导出 `name`、`inject`、`apply` 三要素。`apply` 向 `ctx.tools` 注册四个工具（索引重建、卡片检索、卡片抽取、Wiki 生成），并通过 `ctx.effect` 登记卸载逻辑。卡片帮助读者快速理解该插件的激活条件、工具清单与 teardown 策略。

## 职责 / Purpose

声明插件标识与所依赖的能力服务（fs、tools、subagents），并在 `apply` 中一次性注册 Phase 1（索引与检索）和 Phase 2（抽取与生成）的全部工具，同时保证插件上下文回收时能干净移除注册项。

## 关键符号 / Key symbols

- `name` (variable): `export const name = 'repowiki'`（第 24 行），插件的宿主注册行标识，值固定为 'repowiki'。
- `inject` (variable): `export const inject = ['fs', 'tools', 'subagents']`（第 32 行），声明所依赖的能力服务键：fs 负责索引与卡片读写，tools 是工具注册表，subagents 是 extract/generate 的 spawn 子代理后端；注释说明 fs 与 subagents 为能力 seam，缺失时本插件在该 profile 不激活（practices 规则 21）。
- `apply` (function): `export async function apply(ctx, _config)`（第 41 行）：用各工具工厂（如 `repowikiIndexTool(ctx)`）构造工具实例并调用 `ctx.tools.register` 注册四个工具，随后通过 `ctx.effect(() => { for (const dispose of disposers) dispose() })` 登记 disposer，保证任一侧 teardown 都能干净移除（practices 规则 2）；函数签名的第二个参数 `_config` 被忽略，因为本插件不声明 Config schema。

## 陷阱 / Pitfalls

- 插件在 fs 或 subagents 能力缺失的 profile 不会激活，排查“工具未注册”问题时应先确认宿主提供了这些能力 seam。
- `apply` 声明为 `async` 但函数体内没有任何 `await`，调用方若依赖其返回值做同步注册完成的推断需注意注册实际是同步完成的。
- 本插件不声明 Config schema：行配置被忽略（参数名即为 `_config`），项目级配置需放在 `.dsh-repowiki/repowiki-plan.json`（ADR-0003），模型路由继承会话默认。
- disposer 同时由 apply 的 ctx 回收与自有 effect 登记两侧管理，若在 teardown 逻辑中重复调用需确认各 disposer 是否幂等。

## 相关模块 / Related modules

- src/tool-index.js
- src/tool-cards.js
- src/tool-extract.js
- src/tool-generate.js
