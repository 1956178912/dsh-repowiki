# 检查点：传递依赖展开 v0.92.0（phase-67）

- 日期：2026-11-27
- 目标：`imports=true` 只回答"直接依赖谁"。重构影响面评估需要"间接依赖
  谁"：改动底层工具文件时，哪些模块会受影响、深度多少。补 `depth`
  （1–3）把出边查询升级为传递依赖分析。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/references.js`：
  - 新常量 `MAX_IMPORT_DEPTH = 3`；
  - `ImportEntry` 增 `depth`（1 = 直接依赖）；
  - `importsFor(edges, matches, limit, depth)`：以命中文件为起点做 BFS；
    命中文件集合预先进入 seen（自身不作为依赖），同一目标只记录首次
    到达（最小跳数），环自然收敛；条目仍按到达顺序排列，输出有界。
- `src/tool-cards.js`：
  - 新参数 `depth`（integer，1–3，默认 1），仅在 `imports=true` 时生效，
    execute 内钳制（越界/非法回退 1）；
  - 输出 schema 的 `imports` 条目 required 增 `depth`；
  - 渲染：直接依赖 `→`，更深跳数 `⇢ target:Lx (symbols, N hops)`；
  - 工具描述与 `presentCall` 同步。
- 测试：
  - `test/references.test.js`：既有断言补 `depth: 1`；新用例覆盖 1/2/3 跳、
    直接边优先、环回到起点、越界钳制、多命中共享去重；
  - `test/tools.test.js`：fixture 增 c.ts → d.ts，断言 depth=2 的
    `[b1, c1, d2]`、`⇢ d.ts:L1 (deep, 2 hops)` 渲染、depth=99 钳制与
    非法 depth 回退。
- 文档：两份 CHANGELOG、README 双语（stage/能力行/路线图）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：373/373 通过。
- `npm run coverage:check`：行 97.93%、分支 87.36%、函数 94.71%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **命中文件预置 seen**：否则 A 命中且 A→B→A 时会把 A 列成自己的依赖；
  多命中时也避免"命中结果互相列为依赖"的噪声。
- **最小跳数优先**：同一文件既可直接到达又可两跳到达时，保留直接边
  更符合影响面直觉；BFS 层序天然保证。
- **不做反向传递引用**：反向图 BFS 需要把 `references` 与完整边结合，
  语义更绕；本轮先把正向影响面做扎实，反向传递留作后续评估。
- **depth 只钳制在 execute**：schema 不支持 min/max 约束，且模型可能传入
  字符串；集中钳制一处即可，纯函数也保持防御。
- **不新增工具**：复用 `repowiki-cards` 的参数面，避免工具数量膨胀与
  重复的注册/文案/契约维护。

## 遗留 / 下一步

- 反向传递引用（谁间接依赖我）评估。
- 面板详情按 depth 展开传递出边（当前只展示直接边）。
- C/C++ 重复 include 边折叠策略。
- 提交/推送与版本 tag 由用户确认后执行。
