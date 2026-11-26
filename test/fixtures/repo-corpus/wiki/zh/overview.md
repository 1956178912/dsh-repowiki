---
{
  "schemaVersion": 1,
  "title": "项目概览与架构",
  "slug": "overview",
  "locale": "zh",
  "generatedAt": "2026-11-26T08:35:13.522Z"
}
---
# 项目概览与架构

dsh-repowiki 是一个 DSH/Cordis 宿主插件，为代码仓库自动生成 Wiki：客户端 UI 触发会话，会话中的模型调用 repowiki-* 工具，经索引、卡片抽取与 Wiki 生成三个阶段产出知识库。本文介绍插件入口、客户端入口与资产目录布局。

## 插件入口与工具注册

`index.js` 是 dsh-repowiki 的插件入口，遵循 Cordis/DSH 宿主插件约定，导出 `name='repowiki'` 与 `inject=['fs','tools','subagents']`。`apply()` 通过 `ctx.tools.register` 注册四个工具：`repowiki-index`（索引重建）、`repowiki-cards`（卡片检索）、`repowiki-extract`（卡片抽取）与 `repowiki-generate`（Wiki 生成），并用 `ctx.effect` 登记 disposer，保证插件卸载时资源被正确回收。

## 客户端 UI 入口

`client.js` 是插件的客户端入口：通过 `window.__ModuleLoader__.load` 注册懒工厂，在 `sidebar.panellist` 注入自绘 SVG 的 Repo Wiki 图标，并在 main slot 渲染工作区下拉选择与四个动作按钮。动作由 `run(kind)` 触发，经 `startSession(workspaceId, {prompt, whenDraftExists:'append'})` 在所选工作区开启新会话，其中 prompt 由 `buildPrompt(kind, workspace)` 组装为分步执行提示。文案统一走 `ctx.locale` 的 `repowiki.ui` 命名空间，提供中英双语。

## 资产目录与常量单一来源

所有产物落在 `.dsh-repowiki/` 目录下：`index.json` 为符号级索引，`knowledge/{locale}/*.md` 为知识卡片，`wiki/{locale}/*.md` 为 Wiki 页面。资产目录名、schemaVersion、默认排除目录、语言映射、各工具的有界输出上限与依赖边种类等常量集中于 `src/schema.js`，作为整个插件的单一来源，其余模块一律引用而非重复定义。
