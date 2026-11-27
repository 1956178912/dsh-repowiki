# 检查点：Vue SFC 索引 v0.85.0（phase-60）

- 日期：2026-11-27
- 目标：Vue 是前端主流框架，`.vue` 文件的脚本块包含真实函数、状态与
  import；此前整个文件不被索引，跨文件依赖与符号检索都缺一块。补齐
  SFC 后，前端仓库的知识库覆盖与 JS/TS 等价。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/sfc.js`（新，纯函数）：`vueScriptText(code)` 逐行扫描
  `<script>` / `<script setup>`，块内保留原文、块外替换为空行，支持
  单行脚本与多个 script 块；行数与源文件严格一致。
- `src/symbols.js`：入口识别 `lang === 'vue'`，先取脚本文本再走
  `extractJsLike`；符号规则与 JS/TS 完全一致（函数、类、方法、导出常量）。
- `src/deps.js`：入口识别 `lang === 'vue'`，对脚本文本走
  `extractJsImports`；相对导入、tsconfig 别名、工作区包名解析不变。
- `src/schema.js`：`EXTENSION_LANGS` 增 `vue: 'vue'`（自动进入
  `SYMBOL_LANGUAGES`）。
- `src/prompts.js`：卡片源码围栏语言 `vue`。
- `client.js`：语言展示名 `Vue`。
- 测试：
  - `test/symbols.test.js`：script setup 符号与行号、template/style 零符号、
    多 script 块行号；
  - `test/deps.test.js`：脚本块 import 与行号、单行 script、块外文本零引用；
  - `test/indexer.test.js`：`.vue` 入索引、相对导入建边、行号指向源文件、
    语言分布计数。
- 文档：两份 CHANGELOG、README 双语（stage/索引能力行/路线图）、
  `docs/compatibility.md` 语言表、`docs/coverage.md`。

## 验证（本地全量）

- `npm test`：362/362 通过。
- `npm run coverage:check`：行 97.89%、分支 87.24%、函数 94.68%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **置空而非拼接**：把块外行替换为空行后，解析器看到的就是原始行号的
  脚本，卡片/引用/状态里的 `Lx` 无需任何映射逻辑，也不会因偏移错位。
- **复用 JS/TS 解析器**：新增独立 Vue 解析器会立刻分叉维护两套规则；
  脚本块本质就是 JS/TS，复用后行为一致、测试面更小。
- **template/style 零产出**：模板中的组件使用与插值不是 import，产出
  依赖边会制造假边；宁可少，不可错。
- **符号规则不特判 `<script setup>`**：`setup` 顶层绑定在模板里可见，
  但为非导出常量时与 JS 一致不产符号；避免为单一场景改变全局规则、
  引入模板局部变量噪声。
- **索引 schema 不变**：`lang: 'vue'` 只是新值，不需要升版本；旧索引
  重跑 index 即可获得 SFC 边。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- 其他 SFC（Svelte）是否值得同等支持，待真实需求。
- 提交/推送与版本 tag 由用户确认后执行。
