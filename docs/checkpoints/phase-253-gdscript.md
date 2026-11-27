# 检查点 253：GDScript 支持（v0.277.0）

## 目标

新增第 45 种符号语言 GDScript：Godot 项目的 `.gd` 脚本参与符号、依赖与
技术栈索引，覆盖脚本成员、内部类与 `res://` 资源路径。

## 交付

- `src/symbols.js` `extractGdscript`
  - `class_name` 注册全局类；内部 `class` 带缩进范围与 `parent`。
  - `func` 在类内记 method + parent，顶层记 function；函数体内的局部
    `var`/`const` 不登记。
  - `signal`（variable）、`var`（含 `@export`/`@export_range(...)`/
    `@onready`/`static var`）、`const`、`enum`（type）。
  - `_` 前缀按 Godot 惯例非导出。
  - `#` 注释与单/双/三引号字符串屏蔽（字符串内容替换为空格）。
- `src/deps.js` `extractGdscriptImports`
  - `preload("res://…")`、`load("res://…")` 与 `extends "res://…"`。
  - 注释感知（字符串内容保留，供路径提取）。
- `src/indexer.js` `resolveGodotPath`
  - `res://` → 项目根相对；裸相对路径按声明文件目录；`user://`/绝对路径
    与未索引目标不建边；越出项目根拒绝。
- `src/schema.js`：`EXTENSION_LANGS` 增加 `gd: 'gdscript'`；
  `MANIFEST_FILES` 增加 `project.godot: 'godot'`。
- `src/stack.js`：`project.godot` 提供 `config/name` 项目名与 Godot 技术，
  引擎版本取 `config/features` 首项。
- `src/prompts.js` 围栏 `gdscript`；`client.js` 面板标签 `GDScript`。
- 测试：
  - `test/symbols.test.js`：成员/内部类/局部变量/字符串屏蔽。
  - `test/deps.test.js`：三种资源路径形态与注释屏蔽。
  - `test/indexer.test.js`：`res://` 解析、`user://` 拒绝、语言分布、
    Godot 项目名/版本。
- 文档：README 中英（45 语言）、CHANGELOG 中英、`docs/compatibility.md`
  GDScript 行、`docs/coverage.md` 头部与明细行。

## 语义边界

- GDScript 无真实可见性修饰符：`_` 前缀按社区惯例视为非导出，其余公开。
- 只解析缩进块；`match`/`if` 等语句块内的局部声明不登记。
- 三引号多行字符串内的伪 `preload(...)` 文本不做特殊屏蔽（与既有语言
  提取器的同一类已知限制）。
- `preload` 目标不是 `.gd`（场景/资源文件）时不建边。

## 验证

- 定向：`node --test test/symbols.test.js test/deps.test.js
  test/indexer.test.js` 214/214 通过。
- 全量：841 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过；语言接入守卫通过。

## 回滚

`git revert <commit>`；新增语言只影响新文件，旧索引无需迁移。
