# 检查点：SwiftPM 本地 target 依赖边 v0.60.0（phase-35）

- 日期：2026-11-27
- 目标：让 Swift 多 target 仓库的 `import` 产出文件级依赖边，使反向
  引用、面板引用与卡片生成对 Swift 同样可用（此前 Swift 只有符号，没有边）。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/indexer.js`：
  - 新增 `buildSwiftTargets`：按 SwiftPM 约定（`Sources/<Target>/`，兼容
    旧版 `Source/<Target>/`）建立目标名 → 代表文件（字典序最小，稳定）。
  - 新增 `resolveSwiftSpecifier`：`import Core` 与 `import Core.Models`
    都按首段解析到 `Core` 的代表文件；外部模块（Foundation/XCTest…）
    不在目标索引中，返回 null。
  - `resolveCtx` 增加 `swiftTargets`；Swift 分支改为真实解析。
  - 边收集跳过 `resolved === file.path` 的自引用（如代表文件 import
    自身模块）。
- `src/deps.js`：Swift import 的 `relative` 改为 true（本地目标候选），
  注释与文件头语义说明同步。
- 测试：
  - `test/indexer.test.js` 新增 Swift 多 target 用例：`Sources/App` →
    `Sources/Core` 代表文件、测试 target 导入被测模块、子模块导入、
    外部模块不建边、自引用丢弃。
  - `test/deps.test.js`：Swift 断言改为"本地候选"。
  - 既有 Ruby/Swift/Scala 用例的断言文案改为"外部 Swift 模块不建边"。
- 兼容矩阵 Swift 行更新解析规则与限制（自定义 `path:` 布局不解析）。

## 验证（本地全量）

- `npm test`：317/317 通过。
- `npm run coverage:check`：行 97.8%、分支 86.7%、函数 94.14%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 用文件系统约定而不是解析 Package.swift 的 targets：SwiftPM 源码布局
  是稳定契约，解析构建清单里的嵌套 `dependencies:`/`path:` 需要更完整
  的语法处理且易误判（YAGNI）；自定义路径按已知限制处理。
- 代表文件选择字典序最小：与 Go 包目录、模块页的"代表文件"策略一致，
  输出可复现。
- 自引用边统一丢弃：它对引用关系没有信息量，还会污染边计数与状态统计。

## 遗留 / 下一步

- 目录级并行索引（大仓库吞吐）。
- Scala `given`/`extension` 成员归属；Swift 自定义 `path:` 目标。
- 提交/推送与版本 tag 由用户确认后执行。
