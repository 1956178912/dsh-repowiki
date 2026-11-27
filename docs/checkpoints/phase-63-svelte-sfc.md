# 检查点：Svelte SFC 索引 v0.88.0（phase-63）

- 日期：2026-11-27
- 目标：Vue 已支持后，Svelte 是同一形态（`<script>` 块 + 标记）的主流
  前端框架；复用脚本块提取器即可低成本覆盖，避免用户在前端仓库里遇到
  "为什么 .svelte 没有卡片"。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/sfc.js`：`vueScriptText` 泛化为 `scriptBlockText`（Vue/Svelte 共用），
  文档注明支持 `<script setup>` 与 `<script context="module">`。
- `src/symbols.js` / `src/deps.js`：`lang === 'svelte'` 与 Vue 同路径。
- `src/schema.js`：`EXTENSION_LANGS` 增 `svelte: 'svelte'`。
- `src/prompts.js`：围栏语言 `svelte`。
- `client.js`：语言展示名 `Svelte`。
- 测试：
  - `test/symbols.test.js`：模块脚本 + 实例脚本符号与行号；
  - `test/deps.test.js`：两块内的 import 与行号；
  - `test/indexer.test.js`：`.svelte` 入索引、相对导入建边、语言分布。
- 文档：两份 CHANGELOG、README 双语（stage/索引能力行/路线图）、
  `docs/compatibility.md` 语言表、`docs/coverage.md`。

## 验证（本地全量）

- `npm test`：368/368 通过。
- `npm run coverage:check`：行 97.94%、分支 87.34%、函数 94.68%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **泛化函数名而非复制**：Vue/Svelte 的脚本块提取语义完全相同（顶层的
  `<script ...>` 标签），保留两个名字只会制造"哪个才是正统"的困惑。
- **不解析 Svelte 的 `{#each}`/组件使用**：标记不是 import；解析它需要
  真正的 Svelte 编译器，违背零依赖边界。
- **不区分 runes/legacy**：Svelte 5 runes 仍是 JS 语法，`$state()` 调用
  出现在赋值右侧，现有 JS 符号规则自然覆盖；无需特判。
- **扩展名白名单集中管理**：仍在 `EXTENSION_LANGS` 一处声明，符号类型
  集合自动跟随。

## 遗留 / 下一步

- 面板统计行是否展示 skipped（当前只有工具与状态行）。
- 面板文件行显示环成员徽章（详情内已有 `↔`）。
- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- 提交/推送与版本 tag 由用户确认后执行。
