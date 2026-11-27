# 检查点：面板未覆盖原因提示（phase-110）

- 日期：2026-11-27
- 合入版本：v0.134.0
- 目标：清单已经记录 `citationMisses`，但面板只显示"未覆盖 N"，用户无法
  区分不可读、行号非法还是读取上限。本轮把原因分类带入 Wiki 页签的
  tooltip 与汇总行，仍不读取源码。
- 状态：代码、面板夹具、双语全量门禁完成；已提交并推送。

## 交付

- `client.js`：
  - `citationCoverageFor(meta)` 读取 `citationMisses`，返回
    `reasons: {unreadable, range, cap, unknown}`；未知/缺失原因归入
    `unknown`，与工具侧口径一致；
  - 新增 `formatCoverageReasons(reasons, tt)`，按语言拼接
    `不可读 1, 行号非法 2` / `unreadable 1, invalid range 2`；
  - Wiki 页签汇总覆盖率时累加四类原因，汇总行展示
    `引用指纹：4/5 已记录 · 1 未覆盖（行号非法 1）`；
  - `◌ N` 徽章的 `title` 保持简短，`aria-label` 带上原因明细；
  - 旧清单（无任何指纹）仍只显示一次"清单无指纹记录"，不逐页展示。
- 新增中英文文案：`wikiReasonUnreadable`、`wikiReasonRange`、
  `wikiReasonCap`、`wikiReasonUnknown`；覆盖率汇总/提示模板加入原因占位。

## 测试

- `test/client-smoke.test.js`：
  - 清单夹具为越界引用补 `citationMisses: { 'a.js#L11': 'range' }`；
  - 保留 `◌ 1` 与覆盖率摘要断言；
  - 新增徽章 `title` 与 `aria-label` 断言，证明 tooltip/可访问提示已接线。
- 全量 487 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 面板只读清单，不读源码：原因是生成时记录的事实，不重新推断。
- 未覆盖原因只用于解释覆盖率，不扣健康分、不过滤页面。
- 旧清单没有 `citationMisses`，但也不逐页显示徽章；只看一行降级说明。
- 同一 source 在多个页面出现时，每页各计一次，与页级覆盖率一致。

## 验证

- `npm test`：487/487（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.22%、分支 86.56%、函数 95.21%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 原因放在 tooltip/aria 与汇总行，而不是新增筛选或详情弹层：不改变现有
  交互，也能在悬停/读屏时获得解释。
- 徽章文字仍为 `◌ N`，避免长文案挤压标题；详细原因通过 `aria-label`
  与汇总行提供。
- 不把原因计入健康分：原因解释的是"为什么无法验证"，不是缺陷本身。

## 遗留 / 下一步

- 读取上限分批校验，减少 `cap` 比例。
- 原因趋势统计（需要历史快照，暂后置）。
- 面板可提供"仅看未覆盖页面"筛选，但需先确认不与其他筛选语义冲突。
