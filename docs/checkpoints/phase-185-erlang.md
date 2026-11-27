# 检查点：Erlang 支持（phase-185）

- 日期：2026-11-28
- 合入版本：v0.209.0
- 目标：Erlang 在电信、金融与消息系统中长期使用。项目此前不索引
  `.erl`/`.hrl`：模块、记录、类型与函数不可检索，`-include` 不形成
  依赖边，rebar3 依赖不进入技术栈。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；全量门禁通过。

## 交付

- `src/symbols.js`：
  - `erlangScan`（导出）：`%` 注释截断、字符串/引号原子内容掩码、
    `$x` 字符字面量跳过；返回 code/masked 双视图（code 供 include 路径
    提取）；
  - `erlangAtom`：去引号原子名；
  - `erlangClauseEnd`：首个以 `.` 结尾的语句行（注释/字符串已屏蔽）；
  - `extractErlang`：`-module`、`-record`、`-type`/`-opaque`、`-define`
    宏与顶层函数（多子句、`when`、跨行签名）；`-export([f/1])` 决定
    可见性（默认私有），同名不同 arity 合并，函数体与匿名函数不登记。
- `src/deps.js`：`extractErlangImports` 提取 `-include("…")`（相对）与
  `-include_lib("…")`（应用前缀）。
- `src/indexer.js`：`buildErlangRoots`（每个 `src/`/`include/` 目录 +
  项目根）与 `resolveErlangInclude`（文件目录 → 根；原路径与补 `.hrl`；
  `include_lib` 额外尝试剥离首段应用名）。
- `src/schema.js`：`erl`/`hrl → erlang`；`MANIFEST_FILES` 加入
  `rebar.config`；`src/prompts.js` 围栏 `erlang`；`client.js` 展示名
  `Erlang`。
- `src/stack.js`：`rebarDependencies`（`{deps, [ … ]}` 去重）与
  `ERLANG_TECH`（Cowboy/Ranch/Gun/jsx/Jiffy/Lager 等）。
- 测试：
  - `symbols.test.js`：模块/记录/类型/宏/函数、多子句范围、导出可见性、
    注释内声明不登记；
  - `deps.test.js`：include/include_lib 与注释/字符串屏蔽；
  - `stack.test.js`：rebar deps 计数与技术映射；
  - `indexer.test.js`：`src`/`include` 根解析、应用名前缀剥离、
    `stats.languages` 与 rebar 技术栈。

## 语义边界

- 只识别缩进 0 的声明与函数头；同名不同 arity 合并为一个符号。
- `-export` 只解析同文件内的列表；`-export_type`/`-import` 不参与
  可见性。
- `-include_lib` 剥离首段后可能与 OTP 同名头文件误配（少量场景）。
- `rebar.config` 只读 `{deps, …}`，profiles 内依赖不解析。

## 验证

- `LANG=en npm test`：618/618
- `LANG=zh_CN.UTF-8 npm test`：618/618
- `npm run coverage:check`：行 98.11%、分支 87.36%、函数 95.72%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
