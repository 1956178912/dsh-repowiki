# 检查点：Clojure 支持（phase-190）

- 日期：2026-11-28
- 合入版本：v0.214.0
- 目标：Clojure/ClojureScript 在数据与后端领域有稳定使用。项目此前不索引
  `.clj/.cljs/.cljc`：命名空间、函数与记录不可检索，`(:require …)` 不形成
  依赖边，deps.edn/project.clj 依赖不进入技术栈。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；全量门禁通过。

## 交付

- `src/symbols.js`：
  - `clojureScan`（导出）：`;` 注释截断、字符串掩码（保留引号）；
  - `clojureFormEnd`：圆/方/花括号统一配平的形式范围；
  - `extractClojure`：`ns`（class）、`defn`/`defn-`/`defmacro`/
    `defmacro-`/`defmulti`/`defmethod`（function）、`def`/`defonce`
    （variable）、`defrecord`/`deftype`/`defprotocol`/`definterface`
    （class）；`^:private` 与 `defn-`/`defmacro-` 非导出；`(comment …)`
    整体跳过；只识别行首 `(` 的顶层形式。
- `src/deps.js`：`extractClojureImports` 在 `(:require …)`/`(:use …)`
  区域按括号深度提取 `[ns.name …]`。
- `src/indexer.js`：`buildClojureRoots`（每个 `src/`/`test/` 目录 +
  项目根）与 `resolveClojureSpecifier`（点分换算路径，按引用文件扩展
  优先尝试 `.clj`/`.cljc`/`.cljs`；外部命名空间不建边）。
- `src/schema.js`：`clj/cljs/cljc → clojure`；`MANIFEST_FILES` 加入
  `deps.edn`/`project.clj`；`src/prompts.js` 围栏 `clojure`；`client.js`
  展示名 `Clojure`。
- `src/stack.js`：`depsEdnDependencies`（剔除值映射后取顶层依赖坐标）、
  `projectCljInfo`（`defproject` 名称/版本 + `:dependencies`）与
  `CLOJURE_TECH`（Ring/Compojure/reitit/Reagent/re-frame/Datomic 等）。
- 测试：
  - `symbols.test.js`：形式种类、括号范围、`defn-`/`^:private` 可见性、
    `(comment …)` 跳过；
  - `deps.test.js`：跨行 require 与注释/字符串屏蔽；
  - `stack.test.js`：deps.edn/project.clj 计数、名称/版本与技术映射；
  - `indexer.test.js`：`src` 根解析、`.clj`/`.cljs` 同类优先、技术栈。

## 语义边界

- 只识别行首 `(` 的顶层形式；`#_(defn …)` 丢弃形式不登记。
- `defmulti`/`defmethod` 同名合并（后者覆盖范围）。
- `deps.edn` 只读顶层 `:deps`（嵌套别名/选项不解析）。
- 外部命名空间（无索引文件）不建边。

## 验证

- `LANG=en npm test`：627/627
- `LANG=zh_CN.UTF-8 npm test`：627/627
- `npm run coverage:check`：行 98.07%、分支 87.74%、函数 95.71%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
