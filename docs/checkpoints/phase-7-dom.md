# 检查点：DOM 事件集成回归（真实 React + jsdom）

- 日期：2026-11-26
- 版本：v0.17.0
- 目标：闭合"浏览器事件链无法复现"的测试盲区——这是上一轮稳定
  性加固后唯一仍无法自主验证的层（用户报告"卡片点击无反应"，
  stub 测试直接调 props.onClick，绕过了事件代理）。

## 完成情况

- `test/client-dom.test.js`（新，3 测）：用**真实 React 18.3.1 +
  jsdom** 渲染 RepoWikiPage，派发**真实 DOM 事件**：
  1. 真实 `change` 事件选择工作区 → 真实语料 fixture 装载（统计与
     瓦片渲染于 DOM）；
  2. 对每张已生成卡片瓦片发真实 `click`（React 合成事件根委托 +
     真实 target 命中）→ 断言 `[role=region]` 详情出现、无
     frontmatter 残留；
  3. 真实 `keydown` Escape → 详情关闭；全程无 actionFailed 消息。
  结果：**全部通过**——事件级接线验证健康，历史"点击无反应"症状
  在该层不可复现。
- `test/lib/corpus-fixture.mjs`（新）：语料装载 + fake remote
  （RemoteResult 契约、分页语义）提取共享，stub 回归与 DOM 回归
  复用同一 fixture。
- 开发依赖：react/react-dom 18.3.1、jsdom 31.0.1（均 MIT，0 漏洞），
  devOnly。**发布的零 npm 运行时依赖不变**：client.js 运行期用宿主
  React，测试侧只是需要同一 API 面。已实测验证：
  - 本地 link 安装仍通过供应链策略（`link:` 协议不拉 devDeps）；
  - CI 加 `npm ci` 步骤。
- 测试套件 94 → 97；CHANGELOG、双语 README、docs/coverage.md 同步。

## 设计决策

1. **React 18 而非 19**：宿主 Electron 44 的 React 版本无法从 asar
   头确切读出（未暴露 package 目录）；我们的组件只用稳定 API
   （createElement/hooks/事件委托 18/19 行为一致），取 18 LTS。
2. **真实事件而非再次 stub 事件层**：要复现"点击无反应"这类现象，
   必须覆盖事件代理与 target 命中——stub 事件层等于自己实现一遍
   浏览器，没有证据力。
3. **devOnly 依赖不破坏零运行时约束**：AGENTS §8.1 要求引入依赖
   说明需求/替代/许可证——已记录于 CHANGELOG 与本检查点；`files`
   清单不含 node_modules。

## 排查结论（"卡片点击无反应"三层验证汇总）

| 层 | 手段 | 结论 |
|---|---|---|
| 渲染期抛错 | ErrorBoundary（v0.14.0）+ 真实语料回归（v0.16.0） | 健康零抛错 |
| 事件期抛错 | guard（v0.16.0） | 未误触发 |
| 事件接线 | 本轮真实 React + jsdom + 真实 click | 健康，症状不可复现 |

残余可能：宿主 slot 容器的 CSS/层叠等 GUI 层因素——只能靠用户现场
（现在任何失败都会自带可读文案）。

## 下一步

- 等用户 GUI 现场反馈（v0.17.0）。
- 若一切正常，评估 ui-plan 切片 2（多工作区总览）可行性。
