# 检查点：Elixir 支持（phase-153）

- 日期：2026-11-28
- 合入版本：v0.177.0
- 目标：项目已覆盖 15 种语言，但 Elixir/Phoenix 项目完全缺席：`.ex`
  文件不索引，模块之间没有依赖边，架构页与影响面分析缺少整个生态。
  Elixir 的模块名与文件路径不是简单同名映射（defmodule 可任意命名、
  一个文件可定义多个模块、umbrella 在 `apps/*/lib/`），需要基于模块
  声明建索引。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/symbols.js`：
  - `stripElixirComment`：行级 `#` 注释（`?#` 字符字面量与字符串内
    的 `#` 不算）。
  - `elixirBlockDelta` / `elixirBlockEnd`：按 `do`/`fn`/`end` 配平计算
    块范围；多行签名向后最多 20 行寻找 `do`；`do:` 单行直接一行；
    `defguard`/`defdelegate` 不扫描 do（否则会吞掉后续模块的块）。
  - `extractElixir`：`defmodule`（嵌套记录完整 `Outer.Inner`）、
    `def`/`defp`/`defmacro(p)`/`defguard(p)`/`defdelegate`；模块内函数
    记 method + parent，私有形式 exported=false。
- `src/deps.js`：`extractElixirImports` 提取 `alias`/`import`/`require`/
  `use`；`alias A.{B, C}` 展开、`as:` 别名不改目标、`__MODULE__`/
  原子等无法静态定位的形式跳过。
- `src/indexer.js`：`buildElixirModules(files)` 用 `defmodule` 符号建立
  “模块名 → 声明文件”映射（同名取字典序最小）；`resolveElixirSpecifier`
  精确匹配，外部模块返回 null。
- `src/stack.js`：`mix.exs` → `app: :name` 项目名、`{:dep, "~> x"}` 依赖
  计数与 Hex 技术映射（Phoenix/Ecto/Plug/Oban/…）；`ecosystem: 'mix'`。
- `src/schema.js`：`ex → elixir`；`mix.exs` 清单。`src/prompts.js` 围栏、
  `client.js` 语言展示名同步。
- 测试：
  - `test/symbols.test.js`：模块/嵌套完整名、多行头、`do:` 单行、
    defp 私有、宏/guard/delegate、注释行；
  - `test/deps.test.js`：分组 alias、`as:`、import/require/use、注释；
  - `test/indexer.test.js`：alias/import 边与行号、嵌套模块、umbrella
    `apps/web/lib/...`、外部 Ecto/Plug 不建边、`mix` 技术栈计数。

## 语义边界

- 只索引 `.ex`；`.exs`（脚本、测试、`mix.exs`）不作为源码，`mix.exs`
  仅作清单读取技术栈。
- 模块名来自 `defmodule` 声明而非路径约定：`lib/my_app/repo.ex` 若声明
  `defmodule MyApp.Persistence do`，alias 目标按声明解析（路径推导会错）。
- 一个文件内多个模块都进入同一映射；同名模块取字典序最小的文件（确定
  性优先，不猜测实际加载顺序）。
- `alias __MODULE__.X`、`unquote(...)`、动态模块名不解析（无静态证据）；
  外部模块（Logger/Ecto/Plug…）不建边。
- 宏与 guard 记为 function/method（它们确实定义可调用符号），
  `defdelegate` 同样登记，方便检索入口函数。

## 验证

- `LANG=en node --test test/symbols.test.js test/deps.test.js test/indexer.test.js`：
  全部通过（含新增 Elixir 用例）。
- 全量门禁：`npm test`（双语言 561/561）、`coverage:check`（行 98.06 /
  分支 86.54 / 函数 95.38）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
