---
{
  "schemaVersion": 1,
  "path": "client.js",
  "lang": "javascript",
  "locale": "zh",
  "title": "dsh-repowiki 客户端 UI 插件模块",
  "tags": [
    "客户端",
    "UI 插件",
    "React",
    "工作区",
    "会话触发",
    "知识库生成",
    "国际化"
  ],
  "manuallyEdited": false,
  "generatedAt": "2026-11-26T08:21:03.451Z"
}
---
# dsh-repowiki 客户端 UI 插件模块

> client.js

## 概要 / Summary

这是 dsh-repowiki 的客户端入口：通过 window.__ModuleLoader__.load 注册懒工厂，在侧栏 panellist 注入 Repo Wiki 图标，并在 main slot 渲染一个独立页面。页面提供工作区下拉选择与四个生成动作，动作经 startSession 在所选工作区开新会话、由模型调用 repowiki-* 工具完成生成；文案走 ctx.locale 的 repowiki.ui 命名空间（中英双语）。

## 职责 / Purpose

为仓库知识库生成提供 UI 触发面：以工作区为单位选择目标、拼装执行 prompt、在新会话中发起索引/卡片/Wiki 生成，并把进度交还给会话跟踪。

## 关键符号 / Key symbols

- `RepoWikiIcon` (function): 侧栏入口图标，自绘 SVG（96x96 viewBox，蓝色书本+虚线笔触），size 缺省 18；aria-hidden 且 pointerEvents:none，纯装饰，点击导航由框架按 PANEL_KEY 关联。
- `RepoWikiPage` (function): 主页面组件，props 由 main slot 的 inject 提供（t/workspaces/startSession/notice）；useState 初始化自 workspaces.list.getSnapshot()，useEffect 订阅列表变更同步下拉，渲染工作区 select、四个动作按钮和 role=status 的状态消息。
- `run` (function): RepoWikiPage 内部闭包：kind 为 index/extract/generate/all；未选工作区时提示并返回，否则调 buildPrompt 拼 prompt 后 startSession(current, { prompt, whenDraftExists: 'append' })，成功提示去会话看进度，同步异常进 catch 显示失败原因。
- `buildPrompt` (function): 模块级函数：按 kind 组装分步执行 prompt（extract 含先建索引可跳过的说明、all 为三步全量），末尾要求模型报告文件数/符号数/卡片数/页面数；不显式传 root，依赖会话 cwd 即工作区目录的默认锚定。

## 陷阱 / Pitfalls

- 未选工作区时 run 直接 setMessage 提示并返回，不会发起会话；current 在工作区列表变更时会清掉失效选择，因此 selected 状态可能与 current 不一致。
- startSession 只捕获同步抛错；生成进度不在本页跟踪，页面仅提示“已在新会话中开始”，需去会话内查看结果。
- buildPrompt 不向工具显式传 root，强依赖“会话 cwd 即所选工作区目录”这一约定，若该锚定假设被破坏，工具会作用于错误目录。
- 每次动作都新开会话（whenDraftExists: 'append'），不复用当前会话；重复点击会重复发起。
- React 必须 require('react') 可用（浏览器模块表）；按 practices 规则禁止 require dsh-client-ui-primitives，故图标只能自绘 SVG。

## 相关模块 / Related modules

- repowiki-index / repowiki-extract / repowiki-generate 工具（prompt 中实际调用的服务端工具）
- bundle 的 locale/*.json（其 meta 与本文 NS='repowiki.ui' 客户端文案命名空间无关）
- docs/adr/0004（sidebar.panellist 与 main 两个 seat 的分配依据）
- dsh-doc ui-plugin.md 与 ui-schedule（本模块遵循的官方 UI 插件形态参考）
