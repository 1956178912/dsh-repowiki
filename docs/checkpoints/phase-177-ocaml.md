# 检查点：OCaml 支持（phase-177）

- 日期：2026-11-28
- 合入版本：v0.201.0
- 目标：OCaml 在编译器、金融、区块链与系统工具中广泛使用。项目此前完全
  不索引 `.ml`/`.mli`：函数/类型/模块不可检索，`open`/`include` 不形成
  依赖边，dune/opam 的包元数据也不进入技术栈。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；全量门禁通过。

## 交付

- `src/symbols.js`：
  - `ocamlScan`（导出）：可嵌套 `(* … *)` 注释与 `"…"` 字符串（含转义）
    屏蔽，返回等长掩码行；
  - `ocamlEndLine`：`struct`/`sig`/`object`/`begin` 与 `end` 单词配平；
  - `extractOcaml`：顶层 `let`/`let rec`（含 `let%ppx` 与 `let[@…]`）、
    `type`（参数化名称取 `=` 左侧末尾标识符）、`module`/`module type`、
    `class`/`class type`、`exception`、`val`/`external`；只识别缩进 0 的
    声明，函数/模块/类体内部的嵌套定义不登记；`_` 前缀为私有。
- `src/deps.js`：`extractOcamlImports` 提取 `open`/`open!`/`include` 与
  `module M = Foo[.Bar]` 别名（取首段模块名）；`module M = struct` 不算
  引用；注释/字符串内伪引用由 `ocamlScan` 屏蔽。
- `src/indexer.js`：`buildOcamlModules`（文件名首字母大写 → 模块名，
  `.ml` 优先于 `.mli`）与 `resolveOcamlSpecifier`（点分名取首段）；
  `isConfigManifest` 纳入 `dune-project` 与 `*.opam`，嵌套 opam 清单受
  `MAX_OPAM_MANIFESTS = 20` 限制。
- `src/schema.js`：`ml`/`mli → ocaml`；`MANIFEST_FILES` 加入
  `dune-project`；`src/prompts.js` 围栏 `ocaml`；`client.js` 展示名
  `OCaml`。
- `src/stack.js`：`duneProjectInfo`（`(name …)`/`(version …)`）、
  `opamInfo`（文件名包名、`version:`、`depends:` 去重）与 `OCAML_TECH`
  （Dune/Lwt/Async/Core/Yojson/Cohttp/Dream/Cmdliner/Alcotest 等）。
- 测试：
  - `symbols.test.js`：符号种类/范围、`end` 配平、注释与字符串屏蔽、
    模块体内定义不登记、`let rec`/`let%ppx`/属性/`class`/`_` 私有；
  - `deps.test.js`：`open`/`open!`/`include`/模块别名、点分子模块、
    `module M = struct` 排除、注释/字符串屏蔽；
  - `stack.test.js`：dune-project 元数据、opam `depends` 与版本约束剔除、
    技术映射；
  - `indexer.test.js`：模块名映射、`.ml` 优先 `.mli`、`open` 与别名建边、
    外部模块不建边、dune/opam 技术栈。

## 语义边界

- 只识别缩进 0 的声明；`let … and …` / `type … and …` 续接定义不登记。
- `module`/`class` 的 `endLine` 按单词配平；字段名恰为 `struct` 等极端
  情况可能提前结束（仅影响范围，不影响符号存在）。
- `{|…|}` 原始字符串未屏蔽；其中若含 `*)` 可能被当作注释。
- `.mli` 的精确可见性不跨文件合并；`_` 前缀视为私有。
- `Foo.bar` 形式的模块调用不建边（只认 `open`/`include`/别名）。

## 验证

- `LANG=en npm test`：603/603
- `LANG=zh_CN.UTF-8 npm test`：603/603
- `npm run coverage:check`：行 98.12%、分支 87.19%、函数 95.52%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
