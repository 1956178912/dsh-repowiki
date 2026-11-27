# 检查点：目录列举有界预取（phase-149）

- 日期：2026-11-28
- 合入版本：v0.173.0
- 目标：索引的文件读取/解析已并发（8 路），但目录遍历仍是串行 DFS：
  远程 `ctx.fs` 后端每个目录一次往返，宽目录树（monorepo、大量子包）会
  按目录数线性放大耗时，成为索引的主要瓶颈。
- 状态：代码、测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/indexer.js`：
  - `createDirPrefetcher(fs, limit)`：`start(dirPath)` 在在途请求未达上限
    时提前 `fs.resolve` + `fs.listDir`；`list(dirPath)` 命中预取则复用
    Promise，否则现查。预取 Promise 挂空 catch（预算截断/取消后未消费也
    不产生未处理拒绝），错误仍通过 `list` 的 await 交给调用方。
  - `walk` 新增 `prefetcher` 参数：列目录改走 `prefetcher.list`；在进入
    某子目录前，按排序后的子目录位置发起 `position..position + 8` 的
    预取窗口，滚动推进。
  - `WALK_PREFETCH_LIMIT = 8`；预算计数、忽略规则、深度上限、排序与
    递归顺序均保持不变。
- 测试：`索引遍历：目录列举有界预取，结果与串行一致`——12 个同级目录 +
  3ms 延迟 `listDir`，断言峰值并发 > 1 且 ≤ 8，`files`/`edges` 与串行
  构建完全相同（含顺序）。

## 语义边界

- 只预取“目录列举”，不预取文件内容；文件读取仍由既有 8 路
  `readConcurrency` 控制，两者互不影响。
- 窗口可能预热随后被 `.gitignore` 规则跳过的目录：最多浪费
  `WALK_PREFETCH_LIMIT` 次列举，换来实现简单与顺序稳定；不读取文件内容。
- 预算截断/取消时，已发出的预取可能无人消费：Promise 空 catch 防止
  未处理拒绝，结果数组由 GC 回收；不会写入任何状态。
- 输出顺序与预算截断点与 v0.171.0 完全一致（仍是排序 DFS 顺序），
  因此既有索引不会因升级出现内容漂移。

## 验证

- `LANG=en node --test test/indexer.test.js`：44/44 通过。
- `LANG=en npm test`：549/549；`lint`、`typecheck` 通过。
- 全量门禁：双语言 `npm test`、`coverage:check`（行 98.05 / 分支 86.77 /
  函数 95.26）、`scan:secrets`、`verify:host`、`git diff --check`。
