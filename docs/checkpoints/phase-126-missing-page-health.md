# 检查点：缺页健康分（phase-126）

- 日期：2026-11-27
- 合入版本：v0.150.0
- 目标：`repowiki-status` 已能报告清单缺页，但健康分完全忽略它——
  页面文件全部丢失时 Wiki 分量仍可能接近满分，分数与资产实际状态不符。
- 状态：代码、测试、双语全量门禁完成；已提交并推送。

## 交付

- `src/health.js`：
  - `assessHealth` 接受可选 `wiki.missing`（默认 0）。
  - 分母改为 `count + missing`；缺页按 `40 * missing / total` 扣减 Wiki
    分量（与引用缺失路径的 40 分上限一致）。
  - 待办优先报缺页（`N wiki page(s) are listed in the manifest but missing
    on disk`），再报陈旧页；分量明细加 `N missing`。
  - 页面全部缺失时分量保留 60 分底，而不是直接归零。
- `src/tool-status.js`：把 `missingWikiPages.length` 传给 `assessHealth`。
- 测试：
  - `health.test.js` 新增 1/5 与 0/5 缺页用例，断言分量分数、总分、
    明细与待办文本；
  - `status.test.js` 的缺页用例补充分量分数（60）与待办断言。
- 双语文档、覆盖率报告同步。

## 测试

- `node --test test/health.test.js test/status.test.js`：28/28。
- 全量 514 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 缺页与孤儿互补：缺页在清单里、文件没了；孤儿在磁盘上、清单没有。
  孤儿仍按 20 分权重扣减，缺页按 40 分权重扣减。
- 页面全部缺失（count=0, missing>0）不再显示“no wiki pages”，而是
  缺页待办；只有清单与磁盘都为空时才报“没有生成 Wiki”。
- 引用问题扣分照旧叠加，总扣分不设额外上限（公式 clamp 到 0–100）；
  缺页不会重复计入 citationPenalty。
- status 之外的健康分调用方（测试/其他工具）不传 missing 时行为不变。

## 验证

- `npm test`：514/514（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 97.99%、分支 86.36%、函数 95.32%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 40 分权重而不是让分量归零：缺页是严重损坏，但保留可解释的分数底，
  避免单一因子吞掉其他维度的信息。
- 分母包含 missing：缺页仍属于“应有页面”，否则 count 变小时陈旧比例
  会被放大，产生失真。
- 不单独增加健康分权重：继续使用既有 40/25/20/15，避免评分体系大改。
