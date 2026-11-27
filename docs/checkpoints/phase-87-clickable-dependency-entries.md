# 检查点：依赖条目可点击 v0.112.0（phase-87）

- 日期：2026-11-27
- 目标：详情里已有依赖/依赖方列表，但看目标文件仍需关闭面板再找卡片。
  把列表中路径改为链接，与环路径使用同一打开文件回调。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - `DetailPane` 的 `onOpenCycleFile` 重命名为通用的 `onOpenFile`，
    环路径链接与依赖列表共用；
  - 新增本地 `fileLink(entry)`：按钮内含等宽 `code`（保留 `path:Lx`
    行号），透明背景、继承色、`aria-label` 为 `openFile` 插值路径；
  - imports 与 dependents 两个列表的路径由纯文本改为 `fileLink`；
  - 文案 key `openCycleFile` → `openFile`（中英文值不变）；
  - App 回调 `guard('open-file', …)` 经 `rowByPath` 打开对应详情。
- 测试（`test/client-smoke.test.js`）：
  - 新增用例：A 卡片详情中 `c.js:L3`（出边）与 `b.js:L7`（依赖方）
    渲染为链接，点击出边链接后详情切换为 `C 卡片`；
  - 既有环链接用例改用 `openFile` key。
- 文档：两份 CHANGELOG、README 双语（stage/面板行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/client-smoke.test.js`：27/27 通过。
- `npm test`：391/391 通过。
- `npm run coverage:check`：行 98.02%、分支 87.39%、函数 95.31%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **统一回调**：环路径与依赖列表都是"打开某个索引文件"，一个回调避免
  两套焦点/深度逻辑。
- **保留行号**：`path:Lx` 仍是链接文本，用户既能看到具体语句位置又能跳转。
- **只链接依赖/依赖方**：符号级反向引用（references）保持纯文本，避免
  一行内多个链接造成交互密度过高。
- **不改复制路径**：详情头部复制按钮仍复制当前文件路径。

## 遗留 / 下一步

- mermaid 组内节点较多时的紧凑排布。
- 面板 Wiki 页顶部风险摘要（需求再评估）。
- 符号级引用条目是否也可点击（评估交互密度）。
- 提交/推送与版本 tag 由用户确认后执行。
