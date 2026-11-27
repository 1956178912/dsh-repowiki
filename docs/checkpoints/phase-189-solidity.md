# 检查点：Solidity 支持（phase-189）

- 日期：2026-11-28
- 合入版本：v0.213.0
- 目标：Solidity 是 EVM 智能合约的主流语言。项目此前不索引 `.sol`：
  合约、函数与事件不可检索，`import` 不形成依赖边，Foundry 项目也不被
  识别。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；全量门禁通过。

## 交付

- `src/symbols.js`：
  - `solidityScan`（导出）：`//` 截断、`/* … */` 注释与字符串掩码，
    返回 code/masked 双视图（code 供 import 路径提取）；
  - `braceDeltaOf`：花括号净增量；
  - `solidityMemberEnd`：函数体按配平，`;` 声明单行；
  - `extractSolidity`：`contract`/`library`/`interface`（含
    `abstract contract`）→ class；成员 `function`/`constructor`/
    `receive`/`fallback`/`modifier` → method（带 `parent`）、
    `event`/`error`/`type X is` → type、`struct`/`enum` → class；
    文件级函数与类型同样登记；`private`/`internal` 非导出。
- `src/deps.js`：`extractSolidityImports` 提取 `import "…"`、
  `import {A} from "…"`、`import * as X from "…"`。
- `src/indexer.js`：`resolveSolidityImport` 按引用文件目录解析相对路径
  并补 `.sol`；外部（npm/`hardhat/…`）不建边。
- `src/schema.js`：`sol → solidity`；`MANIFEST_FILES` 加入
  `foundry.toml`；`src/prompts.js` 围栏 `solidity`；`client.js` 展示名
  `Solidity`。
- `src/stack.js`：`foundry.toml` 标记 Foundry 工具链。
- 测试：
  - `symbols.test.js`：合约/接口、成员种类与 `parent`、范围、`internal`
    可见性、注释屏蔽；
  - `deps.test.js`：三种 import 形态与注释屏蔽；
  - `indexer.test.js`：相对解析、外部排除、foundry 技术栈。

## 语义边界

- 只识别文件级与合约第一层声明；嵌套合约/库不登记。
- 状态变量不产符号。
- `private`/`internal` 是唯一可见性证据。
- 多行接口声明（换行后 `external;`）的 `endLine` 可能延伸到下一个块。
- Foundry 依赖在 `lib/` 子模块，不从 `foundry.toml` 解析依赖计数。

## 验证

- `LANG=en npm test`：623/623
- `LANG=zh_CN.UTF-8 npm test`：623/623
- `npm run coverage:check`：行 98.04%、分支 87.65%、函数 95.75%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
