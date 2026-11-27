# 检查点：Haskell `hs-source-dirs`（phase-182）

- 日期：2026-11-28
- 合入版本：v0.206.0
- 目标：v0.203.0 的 Haskell 支持只认 `src`/`app`/`lib`/`test` 常规源根。
  真实 cabal 项目常用 `source/`、`library/` 等自定义目录，此时所有
  `import` 都不建边。本迭代读取 cabal 的 `hs-source-dirs`。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；全量门禁通过。

## 交付

- `src/indexer.js`：
  - `cabalSourceDirs(manifestTexts)`：逐清单解析 `hs-source-dirs:`，
    支持逗号分隔与缩进续行（多 stanza 各自声明），按清单所在目录归一；
  - `buildHaskellRoots(paths, extraRoots)`：把声明目录并入搜索根，
    过滤空串后按深度、字典序排序，项目根保持末项兜底。
- 测试：`test/indexer.test.js` 新增夹具（`source/` 库目录与跨行声明的
  `app` 目录），断言 `app/Main.hs` → `source/Demo/Core.hs` 的导入边。

## 语义边界

- `hs-source-dirs` 按 stanza 出现顺序解析；续行以缩进且非 `field:` 开头
  判定。
- 声明目录与常规目录、项目根共同参与解析；同名模块先命中排序靠前的根。
- `stack.yaml` 仍不作为依赖清单（`packages` 不参与源根）。

## 验证

- `LANG=en npm test`：611/611
- `LANG=zh_CN.UTF-8 npm test`：611/611
- `npm run coverage:check`：行 98.08%、分支 87.27%、函数 95.67%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
