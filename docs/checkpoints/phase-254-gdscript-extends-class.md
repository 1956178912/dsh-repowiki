# 检查点 254：GDScript `extends` 全局类名解析（v0.278.0）

## 目标

GDScript 的 `extends Base` 只写全局类名（由另一文件的 `class_name Base`
注册），此前只有字符串路径形态 `extends "res://base.gd"` 能建边，继承链
在全局类名形态下断开。

## 交付

- `src/symbols.js`
  - `class_name` 符号新增 `globalName: true`（内部类不带），使全局类名
    信息随索引缓存保留。
- `src/deps.js`
  - `extends "…"` 保持路径形态；标识符形态（含
    `class_name Hero extends Character` 同行写法）记
    `kind: 'extends-class'`，`imported` 携带基类名。
- `src/indexer.js`
  - 新增 `buildGdscriptClasses`：`globalName` 符号 → 文件（同名取字典序
    最小，保证确定性）。
  - `resolveCtx.gdscriptClasses` 注入；`resolveImportEdge` 的 GDScript
    分支按 kind 分流：`extends-class` 查表，其余走 `resolveGodotPath`。
- `src/schema.js`：`INDEX_PARSER_VERSION = 29`（符号新增字段）。
- 测试：
  - `test/symbols.test.js`：`class_name` 带 `globalName`、内部类不带。
  - `test/deps.test.js`：标识符 `extends` 两种写法。
  - `test/indexer.test.js`：跨文件 `extends-class` 边（目标/kind/符号/行号）
    与未知类名不建边。
- 文档：README 中英、CHANGELOG 中英、`docs/compatibility.md` GDScript 行、
  `docs/coverage.md` 头部与明细行。

## 语义边界

- 只映射 `class_name` 注册名；GDScript 内置类型（`Node2D` 等）与未注册
  名称不建边（不猜测）。
- 同名全局类名（多项目路径冲突）取字典序最小文件，确定性优先。
- 内部类不能作为 `extends` 目标，不参与映射。
- `extends "res://…".Inner` 之类的资源内嵌类写法不解析。

## 验证

- 定向：`node --test test/symbols.test.js test/deps.test.js
  test/indexer.test.js` 214/214 通过。
- 全量：841 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过；解析器版本守卫通过。

## 回滚

`git revert <commit>`；解析器版本回退后缓存符号重新提取，无数据迁移。
