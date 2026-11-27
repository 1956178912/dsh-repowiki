# 检查点：跨语言资产自动回退 v0.113.0（phase-88）

- 日期：2026-11-27
- 目标：资产可能只生成过 `zh`，而宿主 `LANG=en`；此时 `repowiki-cards`
  的正文检索/记忆消费与 `repowiki-status` 的 Wiki 陈旧判定会静默为空。
  读取侧应自动选择"实际有内容"的语言，而不是机械跟随环境变量。
- 状态：代码、测试、文档完成；全量验证通过；未提交/推送。

## 交付

- `src/locale.js`：
  - `probeLocaleAssets(fs, root, locale)`：探测 knowledge/wiki（含
    `modules/` 嵌套）/memory 是否存在 Markdown，返回三类标记与 `present`；
  - `resolveContentLocale(fs, root, preferred, explicit)`：显式指定严格；
    否则首选有内容即用，首选为空且另一语言有内容则回退，两者皆空保留
    首选并标记 `default`；输出 `requested`/`source`/`available`。
- `src/tool-cards.js`：
  - 新增 `locale` 参数（省略=自动，显式=严格）；
  - 正文检索、Wiki 引用、`includeMemory` 共用解析后的 locale；
  - 输出 `locale`/`localeRequested`/`localeSource`；回退时文本与 hint
    明示（不静默改写语言）；`presentCall` 记录 locale。
- `src/tool-status.js`：同样的解析规则；输出新增 `localeRequested`/
  `localeSource`/`availableLocales`，首行在回退时显示 `fallback from en`。
- 测试：
  - 新增 `test/asset-locale.test.js`（7 例：空资产、首选优先、回退、
    显式严格、Wiki 嵌套/记忆也算有资产、双语并存、非法语言归一）；
  - 修复既有 3 例"仅在 zh 环境通过"的隐式依赖（LANG=en 下也通过）；
  - 新增 `test/client-dom.test.js` 的面板回退用例（空 `knowledge/en`、
    空 `wiki/en`、空 `memory/en` + 有内容的 `zh`，断言三个页签都能渲染）。
- 文档：两份 CHANGELOG、README 双语（stage/工具行/路线图/目录树）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：415/415 通过（`LANG=en`）。
- `LANG=zh_CN.UTF-8 npm test`：415/415 通过（双环境一致）。
- `npm run coverage:check`：行 98.57%、分支 89.37%、函数 96.97%（门禁通过）。
- `npm run typecheck` / `npm run lint` / `npm run scan:secrets` /
  `npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **显式 locale 严格**：诊断/对照场景需要能只看 `en`，即使为空；自动
  模式才回退，避免"指定了却看到另一种语言"的意外。
- **"有资产"按目录内 Markdown 判定**：空 `knowledge/en/`（只有
  `_index.json`）不算有内容，避免面板/工具选中空目录。
- **只回退不合并**：同文件在两种语言都有卡片时不会重复出现在检索结果；
  语言是展示层选择，不是知识本体。
- **状态工具仍只详查一个 locale**：跨语言逐份统计会让报告膨胀；先
  解决"看不到"的问题，`availableLocales` 给出存在性。

## 遗留 / 下一步

- 面板已按同一"有 Markdown"口径选择 locale（`hasMarkdownAsset` +
  `chooseAssetLocale`，Wiki 探测 `modules/` 一层）；但客户端不能复用
  `src/locale.js`，两处规则需同步维护。
- 面板仍只显示一种语言（不合并双语结果）；输出顶层 `locale` 已说明
  选中的语言，条目级标注暂不需要。
- 提交/推送与版本 tag 由用户确认后执行。
