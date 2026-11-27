# 检查点：页面结构与链接完整性（phase-122）

- 日期：2026-11-27
- 合入版本：v0.146.0
- 目标：`verify:wiki` 已能发现清单页缺失与引用源文件问题，但不校验清单
  `page.path` 的合法性/一致性，也不校验页面正文里的相对链接；手工改清单、
  删页或模型写入链接后会留下死链或路径穿越风险。
- 状态：代码、测试、双语全量门禁完成；已提交并推送。

## 交付

- `scripts/verify-wiki.mjs`：
  - `readWikiPages` 额外返回相对资产根的 `rel` 与正文 `text`，供路径与
    链接校验复用同一次读取。
  - 清单页面路径校验：必须位于 `wiki/<locale>/`、以 `.md` 结尾、不含
    `..` 或绝对路径；否则 `wiki/invalid-page-path`。清单 `path` 与页面
    实际位置不符 → `wiki/page-path-mismatch`。
  - 内部链接校验：`extractMarkdownLinks` 提取正文的相对 `.md` 链接，
    跳过代码围栏、行内代码、图片、外链、纯锚点与根路径；规范化后：
    - 越出项目根 → `wiki/unsafe-link`（默认失败）；
    - 目标不存在 → `wiki/broken-link`（默认失败）；
    - 存在性探测上限 200，截断时默认警告、`--strict` 失败
      （`wiki/link-probe-capped`）。
  - 结果新增 `invalidPagePaths`、`pagePathMismatches`、`brokenLinks`、
    `unsafeLinks`、`linkProbeCapped`；文本报告给出死链示例。
- `test/verify-wiki.test.js`：新增内部死链/越界链接用例与清单路径
  非法/位置不符用例；测试总数 510。
- 双语文档、覆盖率报告、Runbook 同步。

## 测试

- `node --test test/verify-wiki.test.js`：16/16。
- 全量 510 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 只校验相对 `.md` 链接：源码链接、图片、外链、纯锚点与站内绝对路径
  不在本轮范围（避免把合法 URL 或目录链接误报为死链）。
- 链接目标相对页面所在目录解析，允许跳出资产根但不得跳出项目根；
  URL 编码会尝试解码一次，解码失败按原值探测。
- 清单路径校验以 `wiki/<locale>/` 为前缀；嵌套模块页
  （`wiki/zh/modules/src.md`）合法。
- 孤儿页仍只告警；本轮的路径/链接问题都是“资产损坏”，默认失败。

## 验证

- `npm test`：510/510（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.04%、分支 86.4%、函数 95.28%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不做锚点存在性校验：需要复刻渲染器的 anchor 规则，误报风险高；
  当前只验证文件存在性。
- 不做链接去重跨页面：同一目标在不同页面各自报告，便于定位；
  单页内重复目标去重。
- 探测上限 200 与引用存在性一致，避免异常页面放大 IO；strict 下
  未验证即失败。

## 遗留 / 下一步

- 面板显示“Wiki 落后于卡片/记忆”（需要浏览器侧摘要实现）。
- 校验 Markdown 锚点与标题的对应关系（可选增强）。
