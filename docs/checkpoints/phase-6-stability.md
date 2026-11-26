# 检查点：稳定性加固（真实语料回归 + 事件兜底 + CI）

- 日期：2026-11-26
- 版本：v0.16.0
- 目标：消化用户 GUI 反馈"卡片点击后无反应"的根因排查，把不可观测的
  失败模式变为可观测，并补齐测试与 CI 门禁。

## 排查过程与结论

用户确认"卡片点击后无反应"后，v0.14.0 加了渲染期 ErrorBoundary 等
现场报错。本轮从代码层独立排查，不依赖用户 console：

1. **diff 定位**：v0.13.0 在点击路径上唯一的改动是 DetailPane 改用
   `renderMarkdown(card.body)`——若渲染器对真实 LLM 正文抛错，React
   会卸载整个 slot（v0.14.0 前表现即"点击后页面消失/无反应"）。
2. **静态审查**：renderMarkdown/inlineText 无零宽匹配（不会死循环）、
   无未受保护的可空访问（`generatedAt` 在 loadCards 已有默认值）。
3. **经验验证（关键）**：写探针把本仓库 `.dsh-repowiki/` 的真实语料
   （12 张 LLM 卡片 + 8 页 Wiki）灌入页面渲染路径：**30 条目全部可点击、
   12 张已生成卡片全部渲染富文本详情、零抛错零挂死**——"渲染器对真实
   正文抛错"假设被证伪。
4. 结论：当前代码在真实语料下点击路径健康；残余风险是 stub 无法复现
   的浏览器层差异（事件代理/覆盖层）与未来的静默回归。

## 完成情况

- `test/lib/stub-react.mjs`：把冒烟测试的最小 React stub（hooks、
  createElement 含错误边界模拟、collectTexts/findNode/flush）提取为
  共享模块；冒烟测试去掉约 160 行重复定义。
- `test/client-real-corpus.test.js`（新，3 测）：以本仓库自身资产为
  fixture 的回归测试——装载后渲染统计与卡片清单；逐条目点击断言每张
  已生成卡片渲染富文本详情、未生成条目走兜底、全程无 actionFailed
  消息；Wiki 页签逐页打开/返回不抛错。
- `client.js` 事件处理器兜底（guard）：React 错误边界不捕获事件期异常，
  此前 onClick 抛错的用户端表现就是"点击无反应"。现在 reload/生成动作/
  页签/筛选/视图/卡片打开与关闭/Wiki 与记忆打开与关闭全部经 guard
  包装，同步抛错与异步拒绝都转为可读状态行（"操作失败 (open-card): …"）。
  新增文案 actionFailed（中英）。
- `test/client-smoke.test.js` 新增 1 测：startSession 抛错时页面给出
  失败提示而非静默。
- `.github/workflows/tests.yml`（新）：push/PR 在 Node 22/24 跑
  `node --test test/*.test.js`——补齐方案 §10.3-8 的自动化回归门禁。
- 测试套件 94/94（90 → 94）。
- docs/coverage.md §10.3-8 由 ❌ 转 ✅；CHANGELOG、双语 README 同步。

## 设计决策

1. **真实语料进测试而非只靠 fixture**：fixture 与 LLM 实际产出形态
   不同（标题层级/行内标记/围栏混排），真实语料回归才能守住"用户看到
   的内容能渲染"。语料随 Git 版本化，断言不依赖具体卡片数量。
2. **guard 而非删 ErrorBoundary**：两者正交——ErrorBoundary 兜渲染期，
   guard 兜事件期；合起来后两类失败模式都用户可见。guard 同时吃异步
   拒绝（检查返回值是否 thenable）。
3. **CI 只覆盖 node 侧**：dsh 宿主跑不了 CI；宿主侧回归维持安装验证
   流程（remove→install→GUI 冒烟），coverage.md 已如实标注边界。

## 遗留

- "卡片点击无反应"的浏览器层根因仍未定位（stub 无法复现）；但两类
  内部失败模式均已可见——等用户现场反馈：若点击仍无反应，面板现在会
  显示红字或"操作失败"消息，可直接定位。
- 用户需复验：深色模式（v0.13.1）、灰蓝点区分。

## 下一步

- 等用户 GUI 现场反馈（红字/操作失败消息 → 定位根因）。
- 评估 docs/ui-plan.md 切片 2（多工作区总览）是否随宿主能力可做。
