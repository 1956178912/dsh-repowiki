# 检查点：未覆盖引用原因分类（phase-109）

- 日期：2026-11-27
- 合入版本：v0.133.0
- 目标：覆盖率已能说明"多少引用没有指纹"，但无法区分文件不可读、行号
  非法/越界与生成读取上限。本轮记录并展示原因，帮助用户决定是修复引用、
  重新生成还是调整读取上限。
- 状态：代码、纯函数/工具/status 测试、双语文档、全量门禁完成；已提交并推送。

## 交付

- `src/tool-generate.js`：
  - 计算指纹时记录 `citationMissReasons`（`unreadable` / `range` / `cap` /
    `unknown`）；达到 200 文件读取上限后不再读取，后续引用标记为 `cap`；
  - 清单页面新增 `citationMisses`（source → reason），只记录真正未获得
    指纹的引用；
  - `citationCoverage` 携带 `reasons`，`hint` 与文本渲染展示原因分类；
  - 输出 schema 的 `citationCoverage.reasons` 为四个必填整数。
- `src/citation-drift.js`：
  - `summarizeCitationCoverage` 读取 `citationMisses`，返回与 `untracked`
    同口径的 `reasons`；缺失/非法原因归入 `unknown`，旧清单不猜测。
- `src/tool-status.js`：
  - `citationCoverage` 输出原因；`Citation digests` 行在未覆盖时附带
    `(1 unreadable, 1 invalid range)` 等明细；schema 同步。
- 双语文档、locale、覆盖率报告同步。

## 原因口径

| 原因 | 含义 |
|---|---|
| `unreadable` | 引用文件读取失败（不存在/不可读） |
| `range` | 行号非法、倒置、越界，切片返回空 |
| `cap` | 生成侧 200 文件读取上限已到，未尝试读取 |
| `unknown` | 旧清单或清单缺少/损坏 `citationMisses` |

- 计数按页面：同一 source 被多个页面引用时，每页各计一次，与
  `citationCoverage.total/untracked` 完全对齐；同一页内重复引用只计一次。
- 原因只用于诊断，不扣健康分、不影响 fresh 短路；未覆盖本身已不阻止短路。

## 测试

- `test/citation-drift.test.js`：reason 分桶（unreadable/range/unknown）、
  空清单/旧清单/空指纹的 `reasons` 结构。
- `test/tool-llm.test.js`：
  - 越界引用 `b.ts#L99-L100` → `range: 1`，清单写入
    `citationMisses['b.ts#L99-L100'] = 'range'`，渲染含 `1 invalid range`；
  - 删除被引用文件后重合成 → `unreadable: 1`，渲染含
    `1 untracked (1 unreadable)`；
  - v2 清单短路 → `unknown: 1`。
- `test/health.test.js`：status 输出 `reasons` 并在 `Citation digests` 行
  展示 `(1 unknown)`。
- 全量 487 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- `citationMisses` 是生成时事实；手工编辑清单可能使其过期，status 以
  清单为准，不重新读取源码推断原因。
- `cap` 是"未尝试读取"，不是"文件坏了"；两者在文本中分开展示。
- 旧清单没有 `citationMisses`，统一为 `unknown`，不把缺失原因当成
  `unreadable`。

## 验证

- `npm test`：487/487（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.19%、分支 86.59%、函数 95.20%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 把原因写进清单而不是只在生成输出返回：status 与后续会话无需重读源码
  即可解释覆盖率，代价是清单略增（仅未覆盖引用）。
- 不新增原因告警：覆盖率行已展示；缺失路径/越界/漂移已有各自告警，
  避免同一引用触发多条消息。
- 不自动提升读取上限：上限是成本保护，原因分类让用户显式决定是否调整。

## 遗留 / 下一步

- 面板 tooltip 展示逐页原因（清单已含 `citationMisses`）。
- 读取上限可分页/分批校验，减少 `cap` 比例。
- 可统计原因趋势（生成前后对比），但需额外的历史快照，暂不做。
