# 检查点：Haskell 支持（phase-179）

- 日期：2026-11-28
- 合入版本：v0.203.0
- 目标：Haskell 在编译工具、金融与区块链（Cardano）领域稳定使用。项目
  此前不索引 `.hs`/`.lhs`：模块、类型与顶层函数不可检索，`import` 不形成
  依赖边，cabal 的包元数据也不进入技术栈。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；全量门禁通过。

## 交付

- `src/symbols.js`：
  - `haskellScan`（导出）：`--` 行注释、可嵌套 `{- … -}` 块注释（含
    `{-# … #-}` pragma）、字符串与字符字面量屏蔽；类型变量 `'a` 不进入
    字符状态；
  - `extractHaskell`：`module`（范围至文件尾）、`data`/`newtype`（含
    `data family`，排除 `instance`）、`type`/`type family`（排除
    `type role`/`type instance`）、`class`、`pattern` 同义词、顶层值
    签名与定义、操作符签名/中缀定义；同名签名与定义合并为一个符号
    （行号取签名，范围取并集）；缩进 `where`/`let` 体与实例方法不登记。
- `src/deps.js`：`extractHaskellImports` 提取
  `import [qualified] [safe] ["pkg"] Module`，注释/pragma/字符串内的
  伪 import 由 `haskellScan` 屏蔽。
- `src/indexer.js`：`buildHaskellRoots`（每个 `src/`/`app/`/`lib/`/
  `test/` 目录 + 项目根）与 `resolveHaskellSpecifier`（GHC 模块路径换算，
  尝试 `.hs` 再 `.lhs`）；`isConfigManifest` 纳入 `*.cabal`，嵌套清单受
  `MAX_CABAL_MANIFESTS = 20` 限制。
- `src/schema.js`：`hs`/`lhs → haskell`；`src/prompts.js` 围栏 `haskell`；
  `client.js` 展示名 `Haskell`。
- `src/stack.js`：`cabalInfo`（顶层 `name:`/`version:`、跨行
  `build-depends` 去重）与 `HASKELL_TECH`（Aeson/WAI/Warp/Yesod/Servant/
  Persistent/Hspec/Tasty/QuickCheck/Criterion 等）。
- 测试：
  - `symbols.test.js`：module 范围、data/newtype/type/class/pattern、
    签名+定义合并、中缀操作符（不登记首操作数）、注释/字符串屏蔽、
    类方法不登记；
  - `deps.test.js`：qualified/package/hiding/safe 变体与屏蔽；
  - `stack.test.js`：cabal 元数据、跨行 `build-depends`、技术映射；
  - `indexer.test.js`：GHC 模块路径解析、`src`/`app` 源根、外部包不
    建边、cabal 技术栈。

## 语义边界

- 只识别缩进 0 的声明；`where` 绑定与 `instance` 方法不登记。
- 多行签名（`foo` 换行后 `::`）不识别（已知限制）。
- 模块导出列表不参与可见性，统一视为可访问。
- 源根只认 `src`/`app`/`lib`/`test`；cabal `hs-source-dirs` 自定义目录
  不读取；`stack.yaml` 不作为依赖清单。
- 中缀操作符定义只识别 `操作数 <op> 操作数 = …` 的简单形态。

## 验证

- `LANG=en npm test`：608/608
- `LANG=zh_CN.UTF-8 npm test`：608/608
- `npm run coverage:check`：行 98.08%、分支 87.29%、函数 95.56%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
