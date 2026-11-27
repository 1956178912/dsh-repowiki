# 检查点：Haskell 导出列表可见性（phase-184）

- 日期：2026-11-28
- 合入版本：v0.208.0
- 目标：Haskell 的模块导出列表（`module M (a, B(..)) where`）是库代码
  的可见性来源。此前所有顶层符号一律 `exported: true`，导致检索排序把
  内部辅助函数当作公开 API，未使用导出审计也无法识别模块边界。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；全量门禁通过。

## 交付

- `src/symbols.js`：
  - `haskellExportNames`：解析模块声明的第一层导出列表（值、类型/构造
    器 `B(..)`、操作符 `(<+>)`；`module X` 重导出忽略）；
  - `haskellModuleHeader`：定位模块声明并按 `where` 前最多 50 行拼接，
    兼容多行导出列表；
  - `extractHaskell`：`exported` 由导出列表决定——未列出的顶层符号为
    false，类方法跟随类的可见性，`module` 符号自身保持 true；无列表时
    维持全部公开。
- `src/schema.js`：`INDEX_PARSER_VERSION` 8 → 9（Haskell 提取规则变化）。
- 测试：`test/symbols.test.js` 新增两个夹具（单行列表与多行列表 +
  操作符 + 模块重导出），断言列表内/外符号的 `exported`。

## 语义边界

- 导出列表只解析第一层逗号项；`B(C1, C2)` 只登记类型名 `B`。
- `module X` 重导出不做名称映射（避免猜测别名指向）。
- 类方法跟随父类可见性：`Describe(..)` 与 `Describe` 都视为导出类方法
  （不区分 `(..)` 是否列出方法）。
- 无导出列表（`module M where` 或无 module 声明）时全部公开。

## 验证

- `LANG=en npm test`：614/614
- `LANG=zh_CN.UTF-8 npm test`：614/614
- `npm run coverage:check`：行 98.11%、分支 87.35%、函数 95.68%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
