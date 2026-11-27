# 检查点：尖括号 include 根 v0.77.0（phase-52）

- 日期：2026-11-27
- 目标：C++ 项目常以 `#include <core/api.hpp>` 配合 `-I include` 引用
  项目内头文件；旧实现只解析引号形式，这类边全部丢失。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/deps.js`：`extractCppImports` 同时匹配 `<...>` 与 `"..."`，引号形式
  标记 `relative: true`，尖括号为 `false`；注释/宏行仍不匹配。
- `src/indexer.js`：`resolveCppInclude` 增加 `relative` 参数——引号形式先
  查引用方文件目录，两种形式都再依次尝试 `include`/`src`/`inc` 根与
  项目根；`resolveImportEdge` 传入 `imp.relative`。
- 测试：
  - `test/deps.test.js`：尖括号被提取、`relative` 标记正确、宏/注释忽略；
  - `test/indexer.test.js`：`<core/api.hpp>` 经 include 根建边，
    `<vector>` 不建边，引号相对路径回归通过。
- 文档：两份 CHANGELOG、README 双语（stage/路线图/架构要点）、
  `docs/compatibility.md`（C/C++ 行与已知限制）、`docs/coverage.md`。

## 验证（本地全量）

- `npm test`：337/337 通过。
- `npm run coverage:check`：行 97.86%、分支 87.15%、函数 94.49%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 尖括号不在文件目录起查：编译器对 `<>` 本来就不搜索引用方目录，保持
  语义一致可避免把同目录同名文件错误连边。
- 系统头零边来自"无索引文件命中"，不需要维护系统头名单；仓库里恰好
  存在同名文件时才会建边，这正是 `-I` 场景想要的结果。
- 不再维护"尖括号一律忽略"的旧结论：兼容矩阵与 CHANGELOG 同步更新，
  避免文档与实现矛盾。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- Wiki 主题页提示词注入模块依赖摘要。
- 提交/推送与版本 tag 由用户确认后执行。
