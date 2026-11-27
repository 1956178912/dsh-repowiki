# 检查点：Go 多模块解析 v0.91.0（phase-66）

- 日期：2026-11-27
- 目标：Go 仓库常按子目录拆分多个 module（每个子目录一个 `go.mod`）。
  此前只读根 `go.mod`，子模块内部 import 被当作外部包，依赖边缺失。
  补齐多模块前缀解析，并复测性能基准。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/indexer.js`：
  - `isConfigManifest` 纳入任意层级 `go.mod`，读取上限 `MAX_GO_MODS = 20`
    （根清单不受限）；
  - `goModulePath` 升级为 `goModules(manifests)`：返回
    `[{dir, module}]`，按目录深度、module 长度降序排序；
  - `resolveGoSpecifier(specifier, modules, goDirs)`：逐个 module 前缀匹配，
    计算包目录（根模块为 remainder，子模块为 `dir/remainder`），命中
    `goDirs` 代表文件即返回；
  - `resolveCtx` 字段改为 `goModules`。
- 测试 `test/indexer.test.js`：根 module + 子目录 module 各自解析到本模块
  包文件，行号正确。
- 文档：两份 CHANGELOG、README 双语（stage/索引能力行/路线图）、
  `docs/compatibility.md`、`docs/coverage.md`、`docs/benchmarks.md`
  （v0.91.0 复测：1000 文件 31ms、5000 文件 119ms，串行 33/128ms）。

## 验证（本地全量）

- `npm test`：371/371 通过。
- `npm run coverage:check`：行 97.90%、分支 87.24%、函数 94.70%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。
- `npm run bench -- 1000/5000` 与 `-- 1000 1 / 5000 1`：见基准文档。

## 关键决策与取舍

- **按"目录更深、module 更长"排序**：嵌套 module 的路径前缀可能互相
  覆盖；先试更具体者避免父模块吞掉子模块路径，且不依赖遍历顺序。
- **不校验 `internal` 可见性**：这需要导入者路径与包路径的树关系判断，
  属于诊断级规则而非依赖边解析；误杀会丢真实边。已写入已知限制。
- **上限 20 个嵌套 go.mod**：与 CMake/JS 配置的有界读取一致，避免超大
  monorepo 的清单读取挤压预算。
- **`detectStack` 仍只看根 go.mod**：技术栈是项目级信号，子模块的
  `require` 不应重复计入项目技术栈（避免同一依赖多次计数）。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- 面板环徽章不限视图的键盘可达性审查（当前 aria-label 已具备）。
- 提交/推送与版本 tag 由用户确认后执行。
