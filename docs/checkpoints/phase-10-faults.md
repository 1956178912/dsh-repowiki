# 检查点：故障注入降级链验证（ErrorBoundary 正向闭合）

- 日期：2026-11-26
- 版本：v0.20.0
- 目标：覆盖 GUI 错误分支——重点是 ErrorBoundary 自 v0.14.0 引入后
  **从未在真实 React 下被触发验证过**（若类组件签名错误，它在为其
  构建的失败模式下（"点击无反应"）形同虚设）。

## 完成情况

- `test/lib/dom-harness.mjs`（新）：DOM 测试挂载机制提取共享
  （jsdom 初始化、真实 React 挂载 main 组件、change/click 真实事件
  驱动；支持 notice/t/wrapRead/wf/select 注入点）。client-dom.test.js
  改用 harness（去重）。
- `test/client-faults.test.js`（新，8 测，全部通过）：
  1. **ErrorBoundary 正向验证**：notice 槽位注入渲染期抛错元素 →
     内联 "Repo wiki panel error: render boom" 文案（非空白 slot） +
     console.error 带 `repowiki:` 前缀（现场诊断位置真实存在）；
  2. 装载失败 → error 状态 + 错误码插值进文案 + 重试按钮可点击；
  3. 无会话工作区 → no-session 分支；
  4. 索引缺失 → no-asset（不当失败）；
  5. 远程结果结构异常（返回 null）→ 坏卡跳过、整批枚举不阻断
     （覆盖 unwrapRemote 回退分支 + loadCards catch）；
  6. 总览行的工作区级失败 → 行内渲染错误码；
  7. 列表视图（CardRow 渲染路径）；
  8. 多页读取 eof:false 时翻页拼接。
- 覆盖率：整体 94.71% → **96.11%** 行；client.js 91.14% → 95.38%
  （函数 81.43% → 85.82%）。
- 文档：CHANGELOG、双语 README、coverage.md 同步。

## 设计决策

1. **故障注入点是公开槽位而非 monkeypatch**：notice 是 main slot
   注入的 props、wrapRead/wf 是 remote 桩——不改动产品代码即可
   制造故障，测试与产品解耦。
2. **passthrough t 的局限**：错误码插值依赖文案的 {code} 占位符，
   passthrough key 无占位 → 故障测试用 tWithCode 映射 loadFailed
   为带占位文案，顺带验证了 tt 插值逻辑（真实 GUI 中插值由
   locale 字典提供）。
3. **收口标准**：剩余未覆盖 client 行为侧栏图标（只在 sidebar slot
   渲染）与防御性 abort 分支（无法确定性触发）——收益递减，本轮
   到此收口。

## 验证

- 121/121 全绿；CI 与安装验证见发布流程（v0.20.0）。

## 用户 bug 调查闭环状态（"卡片点击无反应"）

| 层 | 验证手段 | 状态 |
|---|---|---|
| 渲染期抛错 | ErrorBoundary 正向触发（本轮）+ 真实语料回归（v0.16.0） | ✅ 可见且被验证 |
| 事件期抛错 | guard（v0.16.0） + 真实点击回归（v0.17.0） | ✅ 可见且被验证 |
| 事件接线 | 真实 React + jsdom 真实事件（v0.17.0） | ✅ 健康，不可复现 |
| 远程数据层故障 | 故障注入降级链（本轮） | ✅ 降级路径全部验证 |

残余：宿主 slot 容器层（CSS/层叠等 GUI 层）只能靠用户现场——但现在
每一种内部失败模式都已被验证为**用户可见**而非静默。

## 下一步

- 用户 GUI 现场反馈（总览/深色/点击三样）。
- 测试基建完成度已高；后续重心可转回产品形态（若有用户信号）。
