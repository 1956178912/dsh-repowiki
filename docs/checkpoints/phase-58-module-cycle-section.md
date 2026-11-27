# 检查点：模块页循环节 v0.83.0（phase-58）

- 日期：2026-11-27
- 目标：文件级循环已能在状态工具/面板详情看到，但确定性模块页只给出
  出边与入边；读者在模块页里看不出"这两个模块互相依赖"。补一节即可让
  架构页自带风险提示，且不需要模型调用。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/module-doc.js`：
  - `moduleRelations` 额外返回 `mutual`：完整出边表与入边表的交集，
    升序；判断发生在 `ranked()` 截断之前，因此不会被前 8 条截断掩盖；
  - 模块页在"被依赖模块"之后按需追加"循环依赖 / Circular dependencies"
    节：`- \`lib\` (双向 import 边)`；无双向依赖时不产节。
- 测试 `test/module-doc.test.js`：
  - 双向边用例断言中文节序（末尾为"循环依赖"）、正文与英文
    `Circular dependencies` / `imports both ways`；
  - 单向边用例断言不出现循环节。
- 文档：两份 CHANGELOG、README 双语（stage/生成能力行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：357/357 通过。
- `npm run coverage:check`：行 97.92%、分支 87.32%、函数 94.67%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **在完整计数上求交集**：若先截断再比对，某模块可能因第 9 名以后而
  漏标；先求 mutual 再截断是零成本的正确做法。
- **单独成节而非在行尾加标记**：模块页是确定性的架构文档，独立章节更
  醒目，也便于面板/渲染器统一处理；行尾标记容易被长列表淹没。
- **不列出具体文件级环**：模块页面向模块边界，文件级环由
  `repowiki-status` 的 SCC 报告负责，避免同一页出现两种粒度。
- **不新增数据字段**：全部从既有 `index.edges` 推导，旧索引同样可用。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- Hatch `packages` 列表解析（pyproject 导入根最后一块）。
- 提交/推送与版本 tag 由用户确认后执行。
