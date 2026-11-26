# 检查点：UI/UX 专家评审与应修项落地（v0.27.0）

- 日期：2026-11-26
- 目标：按 dsh-doc verification.md 要求，UX 变更交付前跑一次 UI/UX 专家
  评审（经 subagent），并修复评审认定的应修/可改项。
- 状态：完成，已推送，CI 绿。

## 评审过程

- 评审人：subagent `agent-1`（独立上下文，未见之前的会话历史）。
- 输入：项目位置、client.js/icon.svg/preview.svg/locale、用户四处历史
  反馈、产品愿景与硬约束。
- 结论摘要（六维度）：可发现性/主流程/反馈/无障碍/文案 通过（各含
  观察项），视觉一致性 有风险。用户四处历史反馈在源码与测试层面全部
  闭合。渲染层面未经浏览器验证（评审人已声明）。

## 落地的修复

1. **【应修】空结果文案误用 pendingHint**（真 bug）：筛选或搜索为空时
   固定渲染“该文件尚未生成知识卡片”，在“已生成/待更新”筛选或搜索无
   匹配时误导用户。现按上下文区分：emptySearch（带查询）、emptyCards /
   emptyGenerated / emptyDone / emptyStale（按筛选），回归测试
   `test/client-smoke.test.js`。
2. **【可改】总览模式 visibilitychange 不刷新**：生成完成后回到页面看到
   旧统计。新增 overviewTick 节拍，页面重新可见时总览与单库都重取。
3. **【可改】单库未选工作区时主体空白**：补 idle 状态引导文案。
4. **【可改】primaryStyle 白字硬编码**：换官方
   `--dsw-alias-label-on-color` 令牌（深色按钮底变浅时有对应重定义，
   保证对比度）；verify:host 自动收集到 9 个令牌、全部通过。
5. **icon tile 争议的裁决**：评审认为 icon.svg 的 22x22 渐变卡片违反
   artwork.md “不画 tile”。核查官方一级样本：@dsh-experimental-forge
   -bundle/icon.svg 本身就是 36x36 画布 + 22x22 居中渐变卡片——
   artwork.md 禁的是**全出血** tile，居中主题形状是官方实践本身。
   保留设计，但补上评审指出的**测试盲区**：test/icon.test.js 增加全出血
   rect 断言（不得有 ≥34x34 且贴近原点的背景矩形）。

## 观察项（保留，需浏览器验证或非阻塞）

- （已处理，v0.30.0）~~详情打开无焦点管理~~：打开详情聚焦关闭按钮、
  关闭归还瓦片，并有真实 React+jsdom 焦点回归测试。
- 失败消息无清除机制、技术错误码直面用户、staleHint 用 error 红偏重；
- 详情打开无焦点管理、message 行未声明 aria-live、页签用 aria-pressed
  而非 role=tab；
- 深色下灰色未生成点透明度、preview.svg 在深色详情页为亮斑；
- 无虚拟滚动/搜索防抖（大仓库性能，YAGNI 后置）；
- 侧栏 order:20“与任务页同级”依赖 Host seat 布局，源码无法自证。

## 验证

- `npm test` 133/133；`npm run verify:host` 9 令牌全过；CI success；
- plugin_manager `include:repowiki` 重激活零警告。
