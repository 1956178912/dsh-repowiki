# 检查点：主题令牌实证与宿主漂移自检（v0.21.0 + v0.22.0）

- 日期：2026-11-26
- 目标：把"官方主题令牌"从二手推断升级为一级证据，并把验证能力沉淀为可复跑工具。
- 状态：完成，已推送，CI 绿。

## 做了什么

1. **静态实证（v0.21.0）**：解析 `app.asar`（8 字节 size 头 + headerSize +
   各文件 offset），提取官方 CSS：
   - `dsh-client-ui-theme/src/styles/design-platform.css` 定义全部 264 个
     `--dsw-alias-*` 令牌，每个含 `body[data-ds-dark-theme]` 深色重定义；
   - 主前端壳 `index-*.css` 消费 `var(--dsw-alias-*)` 348 处，233 个内置
     CSS 中 200 个引用该体系；
   - 本插件 7+1 个令牌全部命中。ADR-0004 §5 与"后果"已据实证改写。
2. **状态点重配（v0.21.0）**：用户反馈"灰蓝难区分"——已生成点从
   `state-business-primary`（蓝 rgb(65,118,230)）改为 `state-done-primary`
   （紫 rgb(124,58,237)），smoke 测试加回归断言。
3. **漂移自检工具（v0.22.0）**：`scripts/verify-host-tokens.mjs`
   （`npm run verify:host`）+ `test/host-tokens.test.js`（CI 无 asar 时
   exit=3 跳过）；令牌清单从 client.js 自动收集，不过期；补 npm scripts。

## 验证

- `npm test`：122/122；`npm run verify:host`：exit 0（8 令牌全过）；
- GitHub Actions：`8418593`（v0.21.0）与 `40107a98`（v0.22.0）均 success；
- 插件 `include:repowiki` 重激活，`warnings: []`。

## 决策与风险

- 深色适配的剩余运行时假设（"面板渲染时该 CSS 已加载"）无法本地证明，
  保留字面量回退链并在 ADR-0004 诚实披露；真正检验仍需用户 GUI 反馈。
- 漂移自检依赖本机 asar 路径候选表，非 macOS 默认路径用 `DSH_APP_ASAR`
  覆盖。

## 下一步

- 等待用户 GUI 验证：① 状态点紫/灰区分度；② 深色模式整体；③ 卡片点击
  详情；④ 总览模式下钻。任何失败请提供现象或 DevTools 报错文本。
