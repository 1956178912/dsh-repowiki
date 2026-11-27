# 检查点：Hatch 导入根 v0.84.0（phase-59）

- 日期：2026-11-27
- 目标：Python 绝对导入根已覆盖 setuptools / PDM / poetry，但 Hatch 是
  现代项目的主流构建后端之一；其 `packages` 列表声明包目录，父目录才是
  导入根。缺这块会让 `src/foo` 布局的 Hatch 项目丢失导入边。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/indexer.js` `pyprojectRoots`：
  - 读取 `[tool.hatch.build]` 与
    `[tool.hatch.build.targets.wheel|sdist]` 段内的 `packages = [...]`；
  - 每个值去掉包目录末段，父目录加入候选导入根（`src/foo` → `src`）；
  - 支持多行数组；单段包名（等价项目根，已在候选中）与 `..`/绝对路径忽略；
  - JSDoc 同步为四类构建后端。
- 测试 `test/indexer.test.js`：
  - 多行 `packages` 用例：`src/foo` 与 `backend/bar` 的跨目录导入各建一条边；
  - 容错用例：`[tool.hatch.build]` 下单段 `app` 与 `../outside/pkg`
    不改变项目根导入。
- 文档：两份 CHANGELOG、README 双语（stage/路线图）、`docs/coverage.md`。

## 验证（本地全量）

- `npm test`：359/359 通过。
- `npm run coverage:check`：行 97.88%、分支 87.24%、函数 94.67%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **只取父目录、不猜包名映射**：Hatch 的 `sources` 表能把 `src` 重命名
  为任意导入名；那需要真正解析映射并改变解析语义，超出当前行级解析
  的边界。`packages` 父目录覆盖绝大多数默认布局，且不会误报。
- **段范围限定在 hatch.build 及其 wheel/sdist target**：避免误抓
  `[tool.pdm]`、`[tool.poetry]` 或其它工具的 `packages` 键。
- **单段值忽略而非加入根**：项目根本来就在候选列表里（`''`），重复添加
  无收益；显式忽略也让语义更清楚。
- **不做 `only-include`**：它约束打包范围而非导入根，语义不同。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- 面板是否在文件行上直接显示环成员（当前仅详情内的双向标记）。
- 提交/推送与版本 tag 由用户确认后执行。
