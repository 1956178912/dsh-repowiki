# 检查点：健康分纳入失败页/非法路径与状态路径修复（phase-134）

- 日期：2026-11-27
- 合入版本：v0.158.0
- 目标：`repowiki-status` 的 `wiki.invalid` 自 v0.152.0 起把所有正常页面
  误报为路径不符——`listWikiPages` 返回项目根相对路径（含
  `.dsh-repowiki/`），清单 path 相对资产根。与此同时，健康分只扣缺页，
  上次生成失败页与非法路径不影响评分，门禁失败但健康分仍可能接近满分。
- 状态：代码、健康分/状态测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/tool-status.js`：
  - 修正 `diskPathBySlug`：剥离 `ASSET_DIR/` 前缀后再与清单 path 比较，
    正常生成的（含嵌套 `modules/`）页面不再被误报。
  - 健康分调用传入 `failed: wikiFailed` 与
    `invalid: 未计入 missing 的非法 slug 数`（去重后计算）。
- `src/health.js`：
  - Wiki 分母 = 已生成页 + 缺页 + 失败页；缺页/失败页按 40 分权重扣减，
    保留 60 分底（全失败时同样 60）。
  - 非法路径 5 分/条、上限 20，与 missing 不双扣（由调用方排除）。
  - 待办新增“上次生成失败”和“路径非法/位置不符”；组件明细展示
    `failed`/`invalid` 计数。
- 测试：
  - `test/health.test.js` 新增失败页、非法路径、全失败三种评分断言。
  - `test/status.test.js` 在失败页、非法路径用例中断言 Wiki 分量，并在
    完整资产夹具中断言 `wiki.invalid = 0`（防止前缀回归）。
- README 双语、覆盖率报告、CHANGELOG、Runbook 同步。

## 语义边界

- 失败页不计入 `wiki.count`（没有写入成功），但计入健康分分母，等价于
  “应存在而未存在”；若清单也登记了该页，missing 与 failed 可能同时命中，
  分数会重复扣减——当前生成器失败页不写入 `pages`，故正常流程不重叠。
- 非法路径只在未缺页时额外扣分；清单重复条目导致的重复 invalid 先去重。
- 健康分仍不因重复页扣分：重复项已有独立诊断，评分模型保持四分量可解释。
- 面板路径比较使用 `wiki/<locale>/...`，不受本次修复影响。

## 测试

- `node --test test/health.test.js test/status.test.js`：31/31。
- 全量 522 例（LANG=en 与 LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：522/522（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.05%、分支 86.51%、函数 95.35%。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不在健康分里对缺页与失败页分别设权重：两者都是“页面不存在”，同权重
  更易解释；如需区分可在后续版本单独调整。
- 不在状态工具里自动修正清单路径：只读诊断，修复仍交给
  `repowiki-generate` 或人工。
- 不把失败页计入面板的“缺页”提示：面板已有独立的生成失败提示，避免
  同一页面两条错误。
