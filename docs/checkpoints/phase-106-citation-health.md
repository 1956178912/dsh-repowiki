# 检查点：引用感知健康分（phase-106）

- 日期：2026-11-27
- 合入版本：v0.130.0
- 目标：健康分此前只把 Wiki 的陈旧/孤儿比例计入 Wiki 分量，断链、行号
  越界与内容漂移虽被单独报告，却不影响总分。本轮让健康分反映引用完整性，
  避免"引用全坏但分数仍高"的误导。
- 状态：代码、纯函数测试、status 集成、双语文档、全量门禁完成；已提交并推送。

## 交付

- `src/health.js`：
  - `assessHealth` 新增可选 `citations` 输入：
    `{broken, outOfRange, drift, unchecked}`，缺省/非法值按 0；
  - 引用缺陷只扣 Wiki 分量：缺失路径 10 分/条（上限 40），行号越界与
    内容漂移各 5 分/条（各上限 20），总扣分上限 80，Wiki 分量不归零；
  - `unchecked` 只保留为事实，不扣分（未知不等于已知有问题）；
  - 引用缺陷进入前四条待办，Wiki 分量明细追加 `N citation issue(s)`。
- `src/tool-status.js`：
  - 把 `brokenCitations.total`、`citationRangeIssues.total`、
    `citationDrift.total` 与两者 unchecked 合计传入 `assessHealth`；
  - 引用类告警单独登记并从健康分的 `warnings` 中排除，避免同一问题
    同时扣 Wiki 分量与卫生分量；文本报告仍展示这些告警；
  - 工具描述与 `health` schema 说明引用缺陷会影响 Wiki 分量。
- 双语文档、locale 元数据、覆盖率报告同步。

## 计分口径

| 缺陷 | 单条扣分 | 上限 | 说明 |
|---|---|---|---|
| 缺失引用路径 | 10 | 40 | 按不同路径计数（`findBrokenWikiCitations.total`） |
| 行号越界 | 5 | 20 | 按引用次数计数（`findCitationRangeIssues.total`） |
| 内容漂移 | 5 | 20 | 按变化引用条数计数（`checkCitationDrift.total`） |
| 未验证 | 0 | 0 | 只报告，不把未知当缺陷 |

Wiki 分量权重 25%，因此单条缺失引用约使总分下降 2.5 分；总扣分上限 80
保证分量仍可解释（最低 20）。

## 测试

- `test/health.test.js`：
  - 干净基线 100 分；2 条缺失 → Wiki 80、总分 95，待办与明细同步；
  - 缺失 + 越界 + 漂移各 1 条 → Wiki 80；
  - 每类 99 条 → 扣分封顶，Wiki 20、总分 80（不出现负分）；
  - status 集成：缺失路径 + 漂移指纹 → Wiki 85，卫生分量 95（引用告警
    不重复计入），文本 warnings 仍包含引用问题。
- 既有健康分、覆盖率与 status 用例全部保持通过。

## 语义边界

- 计数沿用各模块已有的有界统计：页面明细可能截断，但 `total` 精确。
- 旧清单（无 `citationDigests`）仍统计缺失路径与行号越界，漂移为 0。
- 无清单/无 Wiki 页面时引用计数为 0，不凭空扣分。
- 引用告警只是不计入卫生分量，仍完整保留在 `warnings` 与文本报告中。

## 验证

- `npm test`：483/483（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.21%、分支 86.59%、函数 95.16%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 采用计分上限而不是线性放大：健康分保持 0–100 且各缺陷相对严重度稳定。
- 不把 `unchecked` 计为缺陷：无法验证与确认损坏是两种事实。
- 引用告警从卫生分量排除：避免同一问题双扣，同时保留文本可见性。

## 遗留 / 下一步

- 面板展示引用漂移/断链徽章，与健康分使用同一口径。
- 生成输出报告本轮写入的指纹数量与覆盖率。
- 可为健康分输出结构化的 `citationIssues` 分量明细，便于外部看板消费。
