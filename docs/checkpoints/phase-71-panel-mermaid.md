# 检查点：面板内联 mermaid 图 v0.96.0（phase-71）

- 日期：2026-11-27
- 目标：生成 prompt 允许页面输出 mermaid 图，render.js 也写入
  ` ```mermaid ` 围栏，但面板的零依赖 Markdown 渲染器只显示源码。补一个
  极简 flowchart 子集渲染器，让 Wiki/卡片里的架构图在面板中真正可见。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - 新函数 `renderMermaidDiagram(source, key)`（纯函数，返回 SVG 元素）：
    - 支持 `flowchart` / `graph` + `TD|TB|LR`（`RL` 按 LR 处理）；
    - 节点 `id[label]`、`id(label)`、`id{label}`、`id((label))`、
      `id[[label]]`、`id{{label}}`、`id[(label)]`；
    - 边 `-->`、`---`、`==>`、`-.->`，支持 `|label|` 边标签；
    - `%%` 注释与 subgraph/classDef/class/style/linkStyle/click/direction
      指令行跳过；无法识别返回 null；
    - 布局：迭代松弛求最长路径分层（环上限 12 层），TD 层内按出现顺序
      排列，LR 交换轴并按列宽对齐；节点宽度按中英文估宽（58–240px）；
    - 渲染：`svg[role=img]` + `defs/marker` 箭头 + 节点形状
      （rect/round/circle/diamond）+ 文本；颜色全部走 `--dsw-alias-*`
      令牌并带字面量回退；
  - `renderMarkdown` 的代码围栏分支识别 `mermaid`：成功画图，失败或不支持
    的类型保持原代码块（内容零丢失）。
- 测试（`test/client-smoke.test.js`）：
  - 新用例覆盖 TD 图（矩形/菱形/圆柱节点、`|label|` 边标签、虚线边）、
    LR 图（圆形节点）、多个 SVG、已渲染图不再显示源码、`sequenceDiagram`
    降级为代码块。
- 文档：两份 CHANGELOG、README 双语（stage/面板行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `node --test test/client-smoke.test.js`：23/23 通过。
- `node --test test/client-dom.test.js`：12/12 通过（真实 React 无回归）。
- `npm test`：380/380 通过。
- `npm run coverage:check`：行 97.99%、分支 87.35%、函数 95.06%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过（修正了 5 处
  `no-useless-assignment`）。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **只做 flowchart 子集**：生成 prompt 约定的关系图就是 flowchart；其它
  图类型（sequence/class/state）在面板中降级显示源码，不猜测渲染。
- **确定性布局**：不引入 dagre 等依赖；最长路径分层 + 固定间距，节点
  顺序稳定（同一资产每次渲染一致，便于截图对比与测试断言）。
- **环上限 12 层**：环形 import 图会让松弛迭代无限加层；12 层是"可读
  上限"的硬约束，避免高度爆炸。
- **零依赖 SVG 而非 canvas**：可直接用主题令牌、可被屏幕阅读器读到节点
  文本、可复制，且实现只需 React createElement。
- **失败降级而非报错**：解析器返回 null 落回代码块，用户始终能看到原始
  mermaid 文本，不出现空白区域。

## 遗留 / 下一步

- 面板 hub 信息（复用状态工具的 fan-in 排名，考虑在统计行附近提示）。
- Go `internal` 包可见性诊断。
- mermaid 子集扩展（subgraph 分组渲染）按真实资产反馈决定。
- 提交/推送与版本 tag 由用户确认后执行。
