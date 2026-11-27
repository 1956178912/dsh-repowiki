# 检查点 249：Dart 通配导入可见性（v0.273.0）

## 目标

Dart 的裸 `import 'lib.dart';` 只把库的公开顶层声明带入作用域；此前
引用/使用点/影响面把库内全部符号（含 `_` 私有声明与类体成员）当作潜在
引用，产生假阳性。本轮沿用 v0.272.0 的可见性机制覆盖 Dart。

## 交付

- `src/reexports.js` `wildcardImportedNamesByFile`
  - 新增 Dart 文件：可导入名 = `exported !== false` 且无 `parent` 的符号
    （类体成员带 `parent`，`_` 前缀由提取器标记为非导出）。
  - Rust/Go 规则不变（非 method 且导出）。
- `src/references.js`
  - 裸星号边按目标可导入名展开（barrel 目标与无符号表保持 `*`）。
  - `hide` 边先在可导入集合上剔除隐藏名；无 `wildcardImports` 条目时
    回退 `exportedNamesByFile`。
- `src/usages.js` / `src/impact.js`
  - 由既有 `wildcardImports` 逻辑自动覆盖 Dart：私有声明/类体成员不再
    作为潜在导入方或直接受影响符号。
- 测试：
  - `test/references.test.js`：新增 Dart 通配展开用例；更新 `hide` 用例
    预期（`Shown` 含普通星号边站点、`Hidden` 仅普通星号边、`*` 键消失）。
  - `test/usages.test.js`：Dart 私有/类体成员没有潜在导入方。
  - `test/impact.test.js`：Dart 通配直接影响只含公开顶层声明。
- 文档：README 中英、CHANGELOG 中英、`docs/compatibility.md` Dart 行、
  `docs/coverage.md` 头部与明细行。

## 语义边界

- 显式 `show X` 仍按名字精确归因（即使 X 是私有或类成员，来源边已经
  写明，不做二次否定）。
- 扩展（extension）成员不进入顶层符号表，不会因本变更产生新归因。
- 无符号表的旧索引保持 `*` 保守行为。

## 验证

- 定向：`node --test test/references.test.js test/usages.test.js
  test/impact.test.js` 78/78 通过。
- 全量：832 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；纯查询期行为变化，无索引/资产迁移。
