# 检查点：清单文件有界并发读取（phase-157）

- 日期：2026-11-28
- 合入版本：v0.181.0
- 目标：源码读取/解析已并发、目录列举已预取，但配置清单仍是串行读取：
  远程 `ctx.fs` 下一个含大量 tsconfig/CMake/composer/mix 清单的 monorepo
  要按清单数逐个支付 RTT，成为索引尾部的延迟来源。
- 状态：代码、测试、双语文档、兼容矩阵修正与检查点更新；待全量门禁与提交。

## 交付

- `src/indexer.js`：
  - 新增 `MANIFEST_READ_CONCURRENCY = 8`；
  - 清单读取改为两阶段：
    1. 按遍历顺序应用既有分类上限（JS 配置 200、CMake 50、go.mod 20、
       composer 50、mix 20），得到 `selectedManifests`；
    2. 以 8 路并发 resolve+readText，结果写入固定槽位，再按选择顺序写入
       `manifestTexts`（键顺序与串行版本一致）。
- 测试：`索引并发：清单文件有界并发读取，结果与串行一致`——12 个嵌套
  `tsconfig.json` + 延迟读取，断言峰值并发 > 1 且 ≤ 8，`files`/`edges`/
  `stack` 与串行构建完全一致。
- 文档修正：
  - 兼容矩阵中“Hatch 的 `packages` 列表未解析”为过期说明（v0.84.0 起
    已把父目录并入导入根），改为已支持；
  - 补充 Elixir 轻量解析边界（do/end 范围受 heredoc/字符串影响、
    动态模块名不解析、`defimpl`/`defprotocol` 不产出结构符号）。

## 语义边界

- 上限判定仍在读取前按遍历顺序完成：超限清单不会被并发读取，也不会
  因完成顺序不同而改变“读到哪 200 个 tsconfig”的结果。
- 读取失败（缺失/不可读）与串行一样静默跳过，只影响技术栈段落；不因
  并发把失败放大为整体失败。
- 并发只作用于清单；源码解析仍用 `readConcurrency`（1–16），两条链路
  分阶段执行，不会叠加成 16 路 IO。
- `manifestTexts` 的键顺序决定 `detectStack` 遍历顺序与技术栈条目顺序；
  按选择顺序装配保证输出可复现。

## 验证

- `LANG=en node --test --test-name-pattern="清单文件有界并发" test/indexer.test.js`：
  通过。
- 全量门禁：`npm test`（双语言 562/562）、`coverage:check`（行 98.09 /
  分支 86.60 / 函数 95.38）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
