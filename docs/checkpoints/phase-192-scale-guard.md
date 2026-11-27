# 检查点：索引规模/性能回归守卫（phase-192）

- 日期：2026-11-28
- 合入版本：v0.216.0
- 目标：语言/解析器持续演进时，缺少"大输入"回归守卫：提取器修复可能
  静默减少符号，边解析可能丢失，或引入意外二次方路径。现有测试多为
  小夹具，无法捕捉规模变化。
- 状态：代码、测试、双语文档与检查点更新；全量门禁通过。

## 交付

- `test/indexer.test.js`：新增「规模与性能回归：300 文件合成仓库」——
  - 生成 300 个 TypeScript 文件（10 个目录，互相 import）；
  - 断言 `stats.files === 300`、`stats.symbols >= 900`、
    `stats.edges === 300`；
  - 断言索引耗时 < 5000ms（本地实测约 35ms，阈值留足两个数量级）。
- 现有 `scripts/bench.mjs` 保留为手动基准；本测试把最小规模守卫带入
  每次 CI。

## 语义边界

- 符号下限而非精确值：不同提取器对方法的归属可能调整，只要不丢失
  主要符号即可。
- 边为精确 300（每个文件一条 import）。
- 时间阈值只用于捕捉数量级退化，不作为性能基准（bench 仍单独运行）。

## 验证

- `LANG=en npm test`：632/632
- `LANG=zh_CN.UTF-8 npm test`：632/632
- `npm run coverage:check`：行 98.00%、分支 87.56%、函数 95.73%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
