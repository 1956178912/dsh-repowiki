# 检查点：JS/TS 别名与工作区依赖边 v0.64.0（phase-39）

- 日期：2026-11-27
- 目标：现代 JS/TS 仓库大量使用 `tsconfig` 路径别名与 monorepo 工作区
  包名；此前只有相对 import 能建立依赖边，导致反向引用、Wiki 引用与
  影响面分析在这类仓库上出现大片空洞。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/indexer.js`：
  - 遍历时额外收集 `package.json`（含嵌套）与 `tsconfig.json` /
    `jsconfig.json` / `tsconfig.*.json`（基名匹配，`node_modules` 等
    既有排除仍生效），读取上限 200 份，防御 fixture 型仓库；
  - `stripJsonc`：逐字符状态机去注释与尾逗号（字符串内的 `//`、`,}` 不
    受影响），解析失败静默降级；
  - `buildAliasConfig`：读取 `compilerOptions.baseUrl` 与 `paths`
    （精确键与单 `*` 通配），按固定前缀长度降序匹配；
  - `resolveJsAlias`：只应用引用方文件所在目录及其祖先的配置（就近
    优先），避免 monorepo 各包别名互相污染；`baseUrl` 作为非相对
    import 的权威回退（与 TypeScript 语义一致）；
  - `buildWorkspacePackages` / `resolveWorkspaceSpecifier`：包名 →
    目录 + `exports`（字符串 / 条件对象 / 数组回退 / `./*` 通配）+
    `main`/`module`/`types` 入口；入口指向未索引构建产物时回退
    `src/index` / `index`；同名包按目录深度、再按字典序决定，保证
    跨平台确定性；
  - `resolveImportEdge` 的非相对 import 分支：别名 → 工作区包 → null
    （外部包不建边）。
- 测试 `test/indexer.test.js`（+5 例，325 总计）：
  - JSONC 的 `paths`（通配 + 精确）与 `baseUrl` 绝对导入；
  - 就近 tsconfig 优先，跨包别名不串味；
  - 工作区 `exports` 精确/通配/条件导出与根入口回退，外部包不建边；
  - 坏配置、缺 `name`、非数组 `paths` 的静默降级与同名包根目录优先；
  - `stripJsonc` 直接单测（含字符串内 `//`、`,}` 与未闭合注释）。
- 文档：两份 CHANGELOG、README 双语（stage/路线图/架构要点）、
  `docs/compatibility.md`（JS/TS 行与已知限制）、`docs/coverage.md`。

## 验证（本地全量）

- `npm test`：325/325 通过。
- `npm run coverage:check`：行 97.81%、分支 86.94%、函数 94.36%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 就近配置而非"全局唯一配置"：monorepo 各包常各自声明 `@/*`，全局
  合并会把 `packages/ui` 的导入错误解析到根 `src/`；按文件所在目录
  过滤既接近 tsc 的项目语义，也避免跨包污染。
- 不跟随 `extends`：继承链需要解析相对/包路径并处理"声明处相对基准"，
  复杂度高且当前常见仓库的 `paths` 多在最终配置或可被就近匹配覆盖；
  作为已知限制写入兼容矩阵。
- `baseUrl` 回退会尝试所有非相对 import：这是 TypeScript 的既有语义，
  只有真实索引文件命中才建边，不猜测外部包。
- `exports` 优先于 `main`：现代库以 `exports` 为权威入口；构建产物
  （`dist/`）通常不在索引中，回退源码入口保证边落在可检索文件上。

## 遗留 / 下一步

- 目录级并行索引（大仓库吞吐）。
- Swift 自定义 `path:` 目标；多行 Scala 参数子句。
- 提交/推送与版本 tag 由用户确认后执行。
