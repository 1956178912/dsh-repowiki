# 检查点：模块页依赖方向 v0.76.0（phase-51）

- 日期：2026-11-27
- 目标：模块级 Wiki 页此前把所有跨模块边合并成“相关模块”计数，读者
  无法判断当前模块依赖别人还是被别人依赖；架构页的价值被削弱。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/module-doc.js`：
  - `relatedModules` 改为 `moduleRelations`，返回出边（依赖）与入边
    （被依赖）两组计数；
  - 模块页章节拆为 `依赖模块` / `Depends on` 与 `被依赖模块` /
    `Depended on by`，各自按边数、路径排序并截断 `MAX_RELATED = 8`；
  - 文件头注释同步说明方向语义。
- 测试 `test/module-doc.test.js`：
  - zh：`src` 页章节为模块组成/关键符号/注意事项/依赖模块，`src/deep`
    页含被依赖模块且正文指向 `src`；
  - en：章节标题分别为 `Depends on` 与 `Depended on by`。
- 文档：两份 CHANGELOG、README 双语（stage/路线图/生成能力行）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：337/337 通过。
- `npm run coverage:check`：行 97.81%、分支 87.05%、函数 94.49%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 不保留合并的“相关模块”：同一页同时出现“相关 + 方向拆分”会让读者
  重复阅读同一组数据；方向即语义，拆开更清晰。
- 每个方向独立取前 8：出边与入边各有一条长尾，合并截断会让方向信息
  被热门方向挤掉。
- 标题用“依赖模块/被依赖模块”而非“上游/下游”：前者对代码读者零歧义，
  后者在不同团队里方向定义相反。
- 章节仍不产生 `sources`：它们描述模块关系而非引用某个文件，保持引用
  白名单语义不变。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- 提交/推送与版本 tag 由用户确认后执行。
