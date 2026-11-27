# 检查点 252：Astro 组件索引（v0.276.0）

## 目标

新增第 44 种符号语言 Astro：`.astro` 组件的脚本区（frontmatter 与
`<script>` 块）参与符号与依赖索引，行号与源文件一致；模板与样式不臆造
符号或边。

## 交付

- `src/sfc.js` 新增 `astroBlockText(code)`
  - 顶部首个非空行 `---` 到下一个独立 `---` 之间的 frontmatter 视为脚本区。
  - 复用 `<script>` 块规则；frontmatter 区域不参与二次脚本扫描（避免字符串
    内 `<script>` 干扰）。
  - 未闭合 frontmatter 保守延伸到文件尾。
- `src/schema.js`：`EXTENSION_LANGS` 增加 `astro: 'astro'`。
- `src/symbols.js` / `src/deps.js`
  - 分派到既有 JS/TS 提取器（`extractJsLike` / `extractJsImports`）。
- `src/prompts.js` 围栏 `astro`；`client.js` 面板标签 `Astro`；
  `src/stack.js` 的 npm 依赖映射增加 `astro: 'Astro'`。
- 测试：
  - `test/symbols.test.js`：frontmatter/script 符号与行号、未导出常量
    约定、未闭合 frontmatter 保守延伸。
  - `test/deps.test.js`：frontmatter/script 导入、模板注释伪引用忽略。
  - `test/indexer.test.js`：frontmatter 导入建边、语言分布、Astro 技术。
- 文档：README 中英（44 语言）、CHANGELOG 中英、`docs/compatibility.md`
  Astro 行、`docs/coverage.md` 头部与明细行。

## 语义边界

- 只索引脚本区：模板插值、组件使用、`<style>` 不产生符号或依赖边。
- 未导出 `const` 不登记（与 JS/TS 提取器既有约定一致）；`export const`
  与函数/类/接口/类型照常登记。
- `.astro` 导入按 JS/TS 相对路径规则解析；`.astro` 文件本身在索引集合中，
  带扩展名的相对导入可直接命中。
- 注释中的 `<script>` 不做特殊处理（与 Vue/Svelte 同一已知限制）。

## 验证

- 定向：`node --test test/symbols.test.js test/deps.test.js
  test/indexer.test.js` 211/211 通过。
- 全量：838 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过；语言接入守卫（提示词围栏 + 面板标签）
  通过。

## 回滚

`git revert <commit>`；新增语言只影响新文件，旧索引无需迁移。
