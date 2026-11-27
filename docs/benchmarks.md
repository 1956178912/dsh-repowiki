# 性能基准

## 方法

`scripts/bench.mjs` 生成合成 TypeScript 仓库（每文件 4 个符号 + 1 条 import），
在真实临时目录上用 `test/fake-fs.mjs`（node fs 适配器）运行 `buildIndex`，
记录耗时与进程 RSS。不含卡片提取/Wiki 生成（那部分由 LLM 主导，不应作为
确定性基准）。

```sh
npm run bench -- 1000
npm run bench -- 5000
```

## 基线（2026-11-27，Apple Silicon macOS，Node 24 / v0.103.0）

| files | symbols | edges | duration | RSS |
|---|---|---|---|---|
| 1000 | 3000 | 1000 | ~31 ms | ~69 MiB |
| 5000 | 15000 | 5000 | ~120 ms | ~97 MiB |

目标：本地 5000 文件索引 < 5s。当前余量充足；该数字不进入 CI 硬门禁
（CI 机器噪声大），仅作为发布前记录。

## 读取并发（v0.68.0 引入，v0.103.0 复测）

`buildIndex` 默认以 8 路有界并发读取/解析源码文件（`readConcurrency`
可覆盖，硬顶 16），结果按遍历位置装配，输出与串行完全一致。本地同步
fs 上并发只带来小幅收益（读取不是延迟瓶颈）：

| files | readConcurrency | duration |
|---|---|---|
| 1000 | 1 | 32 ms |
| 1000 | 6 | 31 ms |
| 5000 | 1 | 124 ms |
| 5000 | 6 | 120 ms |

宿主 `ctx.fs` 可能是远程工作区，串行 await 会按文件累积 RTT；并发的
结构收益在该场景远大于本地同步 fs。`test/indexer.test.js` 用带延迟的
fs 适配器断言实际并发数 > 1 且 ≤ 上限，并逐字段比对并行/串行结果。

## 面板

- 卡片列表默认渲染 120 张，加载更多 +120；搜索使用 `useDeferredValue` 与
  本地打分，避免每次按键全量重排。
- Wiki 页面按清单顺序/模块分组，递归枚举深度上限 3。

## 已知非目标

- 嵌入/向量检索（运行时零依赖约束）。
- 目录级并行遍历（目录枚举仍顺序；文件读取/解析已并发）。

## v0.117.0 复测（本机 Apple M5 / Node 22.23.2）

`npm run bench -- 1000|5000`（默认 `readConcurrency: 8`，合成语料）：

| files | symbols | edges | duration | RSS |
|---|---|---|---|---|
| 1000 | 3000 | 1000 | 34 ms | 64 MiB |
| 5000 | 15000 | 5000 | 122 ms | 88 MiB |

5000 文件仍远低于 5s 目标（约 41× 余量），RSS 约 88 MiB。符号级影响面只在
已建 `edges` 上按选中定义过滤导入证据，不新增源码解析；`repowiki-context`
也只读取最终排序选中的最多 12 个文件，源码片段、文档与关系分别受字符预算
约束，不会为构造任务包重读整个仓库。两者均为只读、确定性计算，无模型调用。

## v0.115.0 复测（本机 Apple M5 / Node 22.23.2）

`npm run bench -- 1000|5000`（默认 `readConcurrency: 8`，合成语料）：

| files | symbols | edges | duration | RSS |
|---|---|---|---|---|
| 1000 | 3000 | 1000 | 39 ms | 64 MiB |
| 5000 | 15000 | 5000 | 161 ms | 88 MiB |

5000 文件仍远低于 5s 目标（约 31× 余量），RSS 约 88 MiB。`repowiki-impact`
不新增索引工作：反向 BFS 只在已建 `edges` 上运行，明细有界（默认 50），
因此大仓库下的成本与依赖图规模线性相关，不随文件内容增长。
