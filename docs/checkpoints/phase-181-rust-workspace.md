# 检查点：Rust workspace crate 解析（phase-181）

- 日期：2026-11-28
- 合入版本：v0.205.0
- 目标：Rust workspace（`crates/*` 多成员）中 `use other_crate::…` 此前
  从不解析——解析器只认当前文件所属 crate 的源码根，跨 crate 引用全部
  丢失。该形态在真实工程中非常常见。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；全量门禁通过。

## 交付

- `src/indexer.js`：
  - 嵌套 `Cargo.toml` 纳入清单读取（`isConfigManifest`），上限
    `MAX_CARGO_MANIFESTS = 20`；
  - `cargoPackageName`：只读 `[package]` 段的 `name`；
  - `cargoPathDependencies`：提取 `dep = { path = "…" }`；
  - `buildRustCrates`：包名 → crate 根目录，`-` 归一为 `_`；路径依赖
    补全未声明 name 的成员；
  - `rustCrateEntry`：`src/lib.rs` → `src/main.rs` → 根 `lib.rs`/`main.rs`；
  - `resolveRustUse`：首段命中 workspace crate 时，从其 `src/` 解析
    子模块，未命中回退 crate 入口；外部 crate 仍返回 null。
- 测试：`test/indexer.test.js` 新增 workspace 夹具（根 workspace 清单、
  `core-lib` 包、`core_lib::helper` 引用、无子模块的 `use core_lib`），
  断言子模块与入口两条边。

## 语义边界

- 嵌套 `Cargo.toml` 上限 20；超出的成员不参与 crate 名映射。
- 只识别 `[package] name` 与 `{ path = … }` 形式的依赖声明。
- `use` 首段与 crate 名同名时优先按 workspace crate 解析；若该 crate
  没有可用入口，回退现有"从当前 crate 根尝试"的逻辑。
- `PATH` 依赖指向项目外目录时不产生边（目标文件未索引）。

## 验证

- `LANG=en npm test`：610/610
- `LANG=zh_CN.UTF-8 npm test`：610/610
- `npm run coverage:check`：行 98.09%、分支 87.22%、函数 95.67%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
