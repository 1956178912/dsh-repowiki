# 检查点：UI 切片 3（更新检测与 Wiki 浏览）

- 日期：2026-11-26
- 版本：v0.7.0
- 目标：docs/ui-plan.md 切片 3 中不依赖增量机制的两部分——卡片"有可用更新"提示与 Wiki 面板内浏览。

## 完成情况

- 更新检测：组件内派生 `staleSet`——卡片 frontmatter 的 `sourceDigest`
  与 index 条目 digest 不一致即为待更新；驱动两处呈现：
  - 统计行的"N 张卡片待更新（源文件已变化）"提示（danger 色）；
  - 筛选页签新增"待更新"，只列出 stale 卡片。
- Wiki 页签：Cards / Wiki 双页签。Wiki 页列 `wiki/<locale>/` 页面
  （frontmatter title 优先，退化用文件名），点击以原文（pre、自动换行、
  限高滚动）呈现，附返回按钮。
- `loadCards` 增加 `sourceDigest` 提取；`countWikiDocs` 重构为
  `loadWikiEntries`（返回 title/generatedAt/text 的完整页面清单，计数
  取 length）。
- 客户端冒烟测试扩展：stale 提示+筛选、Wiki 列表+单页浏览两条路径
  （70/70 全绿）。

## 设计决策

1. **stale 检测在客户端派生**：数据（卡片 sourceDigest 与索引 digest）
   都已在面板加载时获取，无需额外请求；与 Phase 3 服务端 `cardIsFresh`
   用同一个字段、同一套判定语义。
2. **Wiki 原文呈现**：面板暂无 Markdown 渲染器（且不能引入第三方前端
   库），先以 pre 原文呈现（可读、可复制）；渲染成富文本留待后续。
3. **未做 watch 流**：面板仍在挂载/切换/页面重新可见时整批刷新；
   `changes` 流监听留给后续按需引入。

## 风险与遗留

- GUI 渲染仍未实测（模型无浏览器控制）；客户端冒烟测试覆盖数据/结构
  层。Wiki pre 的可读性、stale badge 的视觉权重需用户确认。
- 筛选页签计数为额外渲染，数据量大时考虑虚拟滚动（未做）。

## 下一步

- 切片 2（多工作区总览）受跨工作区读取限制（per-session scope），
  需先在真实环境验证多工作区读取，再排入。
- Phase 4（会话记忆提炼、可选语义索引）另议。
