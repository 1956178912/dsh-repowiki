# 检查点：图标对齐官方 artwork 约定（v0.26.0）

- 日期：2026-11-26
- 目标：`icon.svg` 与 client.js 侧栏图标此前凭直觉绘制，与官方产品图标
  集处理不一致；按 dsh-doc artwork.md 与官方图标样本对齐。
- 状态：完成，已推送，CI 绿。

## 证据（一级样本）

- 官方 bundle 图标样本（`@deepseek-ai/dsh-experimental-forge-bundle/icon.svg`）：
  `width="36" height="36" viewBox="0 0 36 36"`，主体为 22×22 圆角渐变卡片
  （非全出血 tile），白色描边字形，本地唯一命名渐变。
- 官方产品图标集样本（`dsh-client-ui-schedule/src/client/CalendarIcon.tsx`）：
  14px、1px 描边、`stroke="currentColor"`、`fill="none"`、无背景——颜色随
  主题文字色自适应（注释明言 color rides currentColor）。
- artwork.md 明令：**不要在 SVG 里画 tile 或背景**（Plugin Manager 自己画
  外框）；lettering 用路径而非 `<text>`；无脚本/样式/动画/`<image>`/
  foreignObject；渐变遮罩引用本地唯一命名。

## 改动

1. `icon.svg`：由 96×96 全出血蓝色 tile 改为 36×36 画布 + 22×22 渐变卡片
   （沿用官方调色 #69B9FF→#324DE2）+ 白色打开书本字形 + 淡蓝符号行。
2. `client.js` RepoWikiIcon：96×96 固定色块改为 24×24 currentColor 描边
   字形（打开的书 + 两侧符号行），无背景 tile，随侧栏文字色适配明暗主题。
3. `test/icon.test.js`：结构守卫（36×36、24×24、无禁止元素、id 唯一、
   currentColor、无残留旧配色、aria-hidden）。
4. 语料 fixture `test/fixtures/repo-corpus/knowledge/zh/client.md` 同步新
   图标描述（该卡片参与客户端渲染回归，描述过期会误导）。

## 验证

- `npm test` 132/132；CI success；
- plugin_manager `include:repowiki` 重激活零警告。

## 风险披露

- 图标 SVG 已按官方样本与 artwork.md 结构校验，但**渲染效果未在浏览器中
  验证**（无浏览器控制）；需用户在插件管理页与侧栏目视确认（新增 GUI 检验项）。
