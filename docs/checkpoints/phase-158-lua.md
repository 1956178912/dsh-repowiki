# 检查点：Lua 支持（phase-158）

- 日期：2026-11-28
- 合入版本：v0.182.0
- 目标：Lua 在 Neovim 配置、游戏脚本与嵌入式扩展中广泛使用，项目此前
  完全没有 Lua 符号与依赖数据：函数无法检索、模块 `require` 不形成边，
  `lua/` 布局的插件项目在影响面与 Wiki 架构章节中完全缺失。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/symbols.js`：
  - `luaCodeLines`：去 `--` 行注释、`--[[ ]]` 块注释并把 `[[ ]]` 长字符串
    置空（保留行数），短字符串内的 `--` 不截断；
  - `luaBlockDelta` / `luaBlockEnd`：`function/if/for/while/do/repeat` 开块，
    `end/until` 收块；`for/while` 自带的 `do` 不重复计数，`elseif` 不另开块；
  - `extractLua`：`function name` / `local function name`、`M.foo` /
    `M:foo`（归一为 `foo` + parent `M`，kind method）、`M.foo = function`、
    模块级变量（`local M = {}`）；函数体内局部变量不登记，`local` 形式
    exported=false。
- `src/deps.js`：`extractLuaImports` 提取 `require("mod")` / `require 'mod'`，
  整文件去注释（含块注释）后逐行匹配。
- `src/indexer.js`：`buildLuaRoots`（任意层级 `lua/` 目录 + 项目根，
  按深度/字典序）、`resolveLuaSpecifier`（点分名换算 `/`，尝试
  `<mod>.lua` 与 `<mod>/init.lua`，拒绝绝对/越界名）。
- `src/schema.js`：`lua → lua`。`src/prompts.js` 围栏、`client.js` 展示名。
- 测试：
  - `symbols.test.js`：嵌套 `if`/`for` 与长字符串屏蔽后的块范围、
    `M:run` 归一、注释/长字符串不产出符号、`local` 非导出；
  - `deps.test.js`：引号与括号形式 require、行/块注释不提取；
  - `indexer.test.js`：`lua/` 根、点分模块名、`init.lua` 包根解析，
    外部 `socket` 不建边，方法与 parent 符号进入索引。
  - “不支持语言”夹具由 Lua 改为 Fortran（Lua 已支持）。

## 语义边界

- 只识别引号形式的 `require`；`require([[mod]])` 长字符串、动态拼接
  模块名不解析（无静态证据），外部模块不建边。
- `M.foo = function` 与 `function M.foo` 等价处理；`M:foo` 归一为
  `M.foo`（parent `M`、name `foo`），与 Ruby/JS 的方法归属语义一致。
- `local` 变量/函数标记非导出；函数体内的局部变量不登记，避免临时变量
  淹没符号表。全局 `M = {}` 视为导出变量。
- 块范围是行级启发式：短字符串内的 `--`、嵌套长括号 `--[==[` 不识别；
  只影响 `endLine` 精度，不影响符号名与依赖边。
- Lua 没有清单驱动的技术栈识别（不新增生态计数），语言分布、影响面、
  Wiki 引用与测试路由按通用链路生效。

## 验证

- `LANG=en node --test --test-name-pattern="Lua" test/symbols.test.js test/deps.test.js test/indexer.test.js`：
  通过。
- 全量门禁：`npm test`（双语言 565/565）、`coverage:check`（行 98.09 /
  分支 86.80 / 函数 95.34）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
