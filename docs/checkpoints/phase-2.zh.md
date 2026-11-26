# Phase 2 检查点

- 日期：2026-11-26
- 状态：功能层完成（工具已注册并激活）；会话级冒烟待新会话

## 目标

方案 §6.4 Phase 2：`repowiki-extract`（子代理 + outputSchema 卡片提取）+
`repowiki-generate`（Wiki 凝练）+ 项目级规划文件 + 模型路由第一层。

## 已完成

- `repowiki-extract`：读索引 → 确定性筛选（符号数阈值、路径前缀、规划
  文件）→ 逐文件派发 spawn 子代理（outputSchema 卡片契约）→ 插件渲染统一
  Markdown → 写 `knowledge/{locale}/{slug}.md`。已有卡片默认跳过（force
  可强制）；`maxCards` 限制单次；空 slug 路径直接记失败而不互相覆盖。
- `repowiki-generate`：只读卡片集合 + 技术栈 → 一个 spawn 子代理（页面
  分组契约）→ 插件渲染 Markdown（含可选 mermaid）→ 写
  `wiki/{locale}/{slug}.md`。
- 项目级配置 `.dsh-repowiki/repowiki-plan.json`：exclude / includeOnly /
  maxCardsPerRun / cardComplexityThreshold / locales / maxResultLimit；
  文件缺失用默认值、文件损坏标记 broken 并回退默认（绝不抛异常）。
- 模型路由只做"继承会话默认"一层（ADR-0003）；本阶段不声明插件 Config
  （零 import 原则）。
- `inject` 扩展为 `['fs', 'tools', 'subagents']`；`apply` 注册四个工具。
- 测试：52/52 全绿（node:test）——Phase 2 新增 10 例，覆盖渲染、prompt
  构造、知识目录读写往返、规划文件与候选筛选层。
- 安装验证：v0.2.0 的 remove+install 返回 `application: "applied"`、零
  警告。

## 未验证（诚实披露）

- **会话级提取冒烟**：在会话中调用 `repowiki-extract`/`repowiki-generate`
  需要新会话（工具表在会话启动时快照——见 Phase 1 检查点根因分析）。
  LLM 链路（spawn 激活 + 结构化输出）目前只经过代码级契约测试，尚未跑
  真实模型调用。
- 模型覆盖层有意缺失（ADR-0003）。

## 决策

- ADR-0003：spawn 子代理通道、单层模型路由、插件自有 Markdown 渲染、
  JSON 规划文件。

## 下一步

1. 新会话冒烟：对本仓库自身跑 `repowiki-extract`，再跑
   `repowiki-generate`，检查生成的卡片/Wiki。
2. Phase B（UI）：侧栏入口 + 独立页面（项目选择器、生成按钮），即与用户
   确认的 UI 路线（sidebar.panellist + main keyed view——因为
   ui-schedule 的 TaskManagerPage 不提供第三方注入点）。
