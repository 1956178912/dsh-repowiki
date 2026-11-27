# 检查点：OCaml 同名模块近邻解析（phase-188）

- 日期：2026-11-28
- 合入版本：v0.212.0
- 目标：OCaml 多库仓库允许不同库定义同名模块（`lib/a/foo.ml` 与
  `lib/b/foo.ml`）。此前模块映射对每个名称只保留一个文件（`.ml` 优先、
  再字典序），同库内 `open Foo` 可能连到另一个库的文件，依赖边失真。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；全量门禁通过。

## 交付

- `src/indexer.js`：
  - `buildOcamlModules` 改为保留每个模块名的全部候选（`.ml` 先于
    `.mli`，再字典序）；
  - `commonDirDepth`：计算引用文件与候选文件的共享目录层数；
  - `resolveOcamlSpecifier` 增加 `fromRel` 参数，选共享目录最深的候选
    （并列保持排序后的第一个）；外部模块仍返回 null。
- 测试：`test/indexer.test.js` 新增夹具（`lib/a/foo.ml`、`lib/b/foo.ml`
  与两个引用文件），断言各自连到同目录实现，且每个目标只有一条边。

## 语义边界

- "同库"以共享目录深度近似（OCaml 无构建系统推断）；并列时 `.ml`
  优先与字典序保证确定性。
- `Foo.Bar` 仍归到首段模块 `foo.ml`（不解析子模块文件）。
- 外部库（无索引文件）不建边。

## 验证

- `LANG=en npm test`：620/620
- `LANG=zh_CN.UTF-8 npm test`：620/620
- `npm run coverage:check`：行 98.10%、分支 87.59%、函数 95.73%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
