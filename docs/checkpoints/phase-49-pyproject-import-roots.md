# 检查点：pyproject 自定义导入根 v0.74.0（phase-49）

- 日期：2026-11-27
- 目标：Python 绝对导入此前只识别项目根与 `src`/`lib` 布局；使用
  setuptools `package-dir`、PDM 或 poetry `from` 的项目（如 `backend/`、
  `python/`）仍然丢边。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/indexer.js`：
  - `pyprojectRoots(text)`：
    - `package-dir = {"" = "backend"}` 内联表：只取 `= "value"` 的值，
      避免空键 `""` 让朴素引号配对错位；
    - `package-dir = "src"`（PDM 字符串形式）；
    - `packages.find where = ["src", "libs"]`；
    - `[tool.poetry]` 段内的 `from = "python"`；
    - 绝对路径与含 `..` 的值直接丢弃；
  - `buildPythonRoots(paths, extras)`：pyproject 根与既有 `src`/`lib`
    自动根合并，仍按深度、字典序排序（结果可复现）；
  - `resolveCtx.pythonRoots` 接入 `manifestTexts['pyproject.toml']`。
- 测试 `test/indexer.test.js`：
  - setuptools `package-dir` 与 poetry `from` 分别解析到 `backend/`、
    `python/` 下的模块；
  - 非法根（绝对路径、`..`）被忽略，合法导入仍解析。
- 文档：两份 CHANGELOG、README 双语（stage/路线图/架构要点）、
  `docs/compatibility.md`（Python 行与已知限制）、`docs/coverage.md`。

## 验证（本地全量）

- `npm test`：337/337 通过。
- `npm run coverage:check`：行 97.84%、分支 87.12%、函数 94.59%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 行级正则而非 TOML 解析器：零依赖约束下，导入根只需要几种固定键；
  完整 TOML 解析会引入数百行且无其它消费者。
- 空键内联表专门处理：`package-dir = {"" = "src"}` 是 setuptools 的
  常见写法，按 `key = "value"` 取值可避免引号配对把 `" = "` 当值。
- 非法值丢弃而非报错：配置来自用户仓库，索引不应因一个绝对路径失败；
  同时保证解析不会指到仓库外。
- Hatch 的 `packages = ["src/pkg"]` 不解析：其元素是包目录而非导入根，
  强行取父目录会引入猜测；作为已知限制记录。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- 面板语言统计分布展示。
- 提交/推送与版本 tag 由用户确认后执行。
