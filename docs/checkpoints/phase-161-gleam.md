# 检查点：Gleam 支持（phase-161）

- 日期：2026-11-28
- 合入版本：v0.185.0
- 目标：Gleam 在 BEAM 生态的 Web/CLI 项目中增长迅速，项目此前完全没有
  Gleam 数据：`type`/`fn` 无法检索、`import package/module` 不形成边，
  `gleam.toml` 的项目名与依赖也不进入技术栈。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/symbols.js`：
  - `gleamCodeLines`：逐行去 `//`（含 `////`）注释，字符串内容替换为空
    并跨行延续状态（Gleam 字符串可跨行），避免 `{`/`}`/`//` 干扰；
  - `gleamBraceDelta` / `gleamBlockEnd`：函数体与类型体按花括号配平，
    单行闭合块返回声明行，类型别名/`external` 声明由调用方标记单行；
  - `extractGleam`：`type`/`opaque type` 容器（kind class）、
    `type Name = …` 别名（kind type）、`external type`、`fn`/`external fn`
    （跨行签名）、顶层 `const`；只在深度 0 识别，函数体/`case` 内的
    `let` 与匿名函数不登记。
- `src/deps.js`：`stripGleamComment` 与 `extractGleamImports` 提取
  `import package/module`，支持 `as` 别名与 `.{type Foo, Foo as F}`
  未限定导入（去重后进入 `imported`，供符号级影响证据）。
- `src/indexer.js`：`buildGleamRoots`（任意层级 `src/`/`test/` 目录 +
  项目根，按深度/字典序）、`resolveGleamSpecifier`（模块路径映射为
  `<root>/<module>.gleam`，拒绝绝对/越界/反斜杠路径）。
- `src/schema.js`：`gleam → gleam`，`MANIFEST_FILES` 增加 `gleam.toml`。
- `src/stack.js`：`gleamTomlInfo`（根级 name/version + 依赖段键，去重）
  与 `GLEAM_TECH`（Wisp/Lustre/Mist/gleam_http 等框架映射，stdlib 只计数）。
- `src/prompts.js` 围栏、`client.js` 展示名补 `gleam`。
- 测试：
  - `symbols.test.js`：容器/别名/opaque/external 形态、单行块体、
    跨行签名、注释与字符串屏蔽、`let` 排除；
  - `deps.test.js`：模块 import、`as` 别名、未限定导入去重、注释/字符串
    内伪 import 不提取；
  - `stack.test.js`：`gleam.toml` 项目名/版本、依赖段去重与跨段不误计、
    框架技术映射、stdlib 只计数；
  - `indexer.test.js`：`src/` 与 `test/` 源根解析、外部 `gleam/io`
    不建边、符号与未限定导入进入索引、技术栈元数据。

## 语义边界

- Gleam 模块路径与文件路径一一对应（`src/<module>.gleam`），因此解析
  只需源根 + 模块名，不做包名猜测；`gleam/io` 等标准库/外部包没有本地
  文件证据，不建边。
- 多行 `import x.{...}` 的未限定符号名单只取首行，模块边仍按首行的
  模块名建立；清单文档已注明。
- 类型别名与 `external` 声明视为单行；跨行别名只给首行范围（不影响
  符号名与边）。
- `gleam.toml` 只读根级元数据与两个依赖段的键，不解析版本约束、不展开
  嵌套包；嵌套清单暂不聚合（Gleam 单包布局为主）。

## 验证

- `LANG=en node --test --test-name-pattern="Gleam" test/symbols.test.js test/deps.test.js test/stack.test.js test/indexer.test.js`：
  4 例通过。
- 全量门禁：`npm test`（双语言 574/574）、`coverage:check`（行 98.14 /
  分支 86.89 / 函数 95.41）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
