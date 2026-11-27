# 检查点：模块页高风险入口 v0.102.0（phase-77）

- 日期：2026-11-27
- 目标：v0.101.0 让主题页 prompt 带上 fan-in 热点，但确定性模块页仍只有
  依赖方向与循环节。补模块内 fan-in 节，使主题页与模块页共享同一风险轴。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/module-doc.js`：
  - 新常量 `MAX_HUBS = 3`；
  - 新函数 `moduleHubs(modulePath, files, edges)`：只统计目标在模块内的
    边（依赖方可来自任意模块），Set 去重、自引用忽略、按依赖方数量降序
    且并列按路径升序，取前三；
  - 章节顺序追加在循环依赖之后：`高风险入口` / `High-fan-in files`，
    条目 `- \`path\` (N 个依赖方文件 / importer file(s))`，`sources` 为
    热点文件路径；无入边时不产节。
- 测试（`test/module-doc.test.js`）：
  - 既有用例更新章节列表（deep 页含新节，并断言被依赖文件成为热点）；
  - 循环用例更新章节列表并把 `at(-1)` 断言改为按标题查找；
  - 新用例：跨模块依赖方计入、自引用忽略、排名与 sources、无入边不产节。
- 文档：两份 CHANGELOG、README 双语（stage / generate 工具行 / 路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/module-doc.test.js`：5/5 通过。
- `npm test`：385/385 通过。
- `npm run coverage:check`：行 98.00%、分支 87.41%、函数 95.19%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **跨模块依赖方计入**：模块内文件的真实影响面包含外部导入者；只统计
  模块内依赖会低估风险。
- **前三名**：模块页是导航页面，3 条足够；完整排名在状态工具/面板。
- **复用同一排序规则**：与 `topDependents` 一致（数量降序、路径升序），
  避免不同页面给出矛盾排名。
- **sources 指向热点文件**：让页级引用反查（wikiReferences）能定位到
  这些高风险文件，与主题页的可追溯性一致。

## 遗留 / 下一步

- mermaid 子集按真实资产反馈扩展 subgraph 分组。
- 索引告警明细点击跳转状态工具。
- 模块页是否也注入"跨模块循环 + fan-in"到模块级 prompt（当前模块页无
  LLM，无需）。
- 提交/推送与版本 tag 由用户确认后执行。
