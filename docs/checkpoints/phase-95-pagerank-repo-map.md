# 检查点：PageRank 核心文件与 repo map 兜底（phase-95）

- 日期：2026-11-27
- 合入版本：v0.119.0
- 目标：在 fan-in（直接依赖方计数）之外补上"间接重要性"视角：被核心模块
  依赖的文件，即使直接导入方不多，也应是仓库中心。同时让任务上下文在
  "完全无命中"时不再空手而归，而是给出有明确语义标注的仓库起点。
- 状态：代码、单测、工具集成、真实仓库冒烟与全量门禁完成；未提交/推送。

## 交付

- 新增纯函数模块 `src/graph-rank.js`：
  - `computeFileRank(edges, options)`：静态 import 图上的 PageRank；
    节点为边端点（可选 `files` 并入无边文件），同一 `from→to` 去重、
    自引用忽略；dangling 节点权重按标准 PageRank 均分回全图；
    阻尼 0.85、收敛阈值 1e-6、迭代上限 50，均可钳制覆盖；
  - 输出 `{entries, nodes, iterations, converged}`；`entries` 含
    `path/score/inDegree/outDegree`，分数保留 6 位小数、按分数降序 +
    路径升序，保证确定性。
- `src/tool-status.js`：
  - 输出 `coreFiles`（前 10；仅当索引存在依赖边时计算，无边时为空数组，
    不把"全库文件"冒充核心）；
  - 渲染 `Core files (PageRank): path (0.xxxx); …`，无数据时为 `(none)`。
- `src/tool-context.js`：
  - 任务未命中任何索引文件且 import 图有边时，用 PageRank 前 5 个文件作为
    repo map 兜底；文件清单逐条标 `(repo map)`，`score` 置 0（不冒充任务
    相关性分数），源码证据退化为文件头片段；
  - 结构化输出新增 `fallback: 'repo-map'`；包内 Caveats 与 hint 均说明
    "起点而非任务相关性"；有任何词法/文档命中时行为完全不变。

## 测试

- `test/graph-rank.test.js`：7 例，覆盖链式上下游排序、对称环平分、
  自引用/重复边、`files` 纳入孤立文件、参数钳制与迭代上限、空/无效输入、
  确定性。
- `test/status.test.js`：核心文件指向被依赖最深的文件、条数与分数、
  渲染格式。
- `test/context.test.js`：无命中兜底返回 PageRank 文件、`fallback` 标注、
  `(repo map)` 文本、非相关性提示、源码证据仍存在。

## 真实仓库冒烟

本仓库（102 文件、262 边）重建索引后：

- `coreFiles` 前五：`src/schema.js (0.1134)`、`src/util.js (0.0524)`、
  `test/fake-fs.mjs (0.0355)`、`src/assets.js (0.0318)`、
  `src/modules.js (0.0304)`——与 fan-in（util/fake-fs/schema 各 20+）互补，
  把被几乎所有模块依赖的常量模块排到第一。
- 无关任务 `zzz completely unrelated`：`fallback=repo-map`，
  返回上述前 5 文件，3150/4000 字符，包内标注 `(repo map)` 与
  "not on task relevance"。

## 语义边界

- 静态 import 图不是运行时调用图；PageRank 衡量的是"结构中心度"，不是
  业务重要性或执行频率。
- status 只在有边时排名；context 兜底只在大图（有边）时发生，且 `score=0`
  与 `fallback` 字段共同防止被误读为任务相关。
- 兜底不改变查询命中时的既有排序与预算分配。

## 验证

- `npm test`：446/446（LANG=en）；`LANG=zh_CN.UTF-8 npm test`：446/446。
- `npm run coverage:check`：行 98.04%、分支 86.36%、函数 95.13%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`：120 个 Git 跟踪文件通过。
- `npm run verify:host`：全部令牌存在、alias 均有深色变体。
- `npm pack --dry-run`：56 文件、约 231.6 kB，包含 graph-rank/usages。
- `git diff --check`：通过。

## 取舍

- 不把 PageRank 混入正常检索分数：相关性（词法/文档命中）与结构中心度
  是两种证据，混算会让"热门文件"污染精确查询；只在零命中时作为显式
  兜底出现。
- 无边索引不排名：没有结构信号时列出文件没有信息价值，宁可 `(none)`。
- 不新增配置面：阻尼/阈值/迭代上限为常量，测试可覆盖但用户无需调参。

## 遗留 / 下一步

- 面板可展示 coreFiles（单库视图入口），需客户端迭代与真实 GUI 冒烟。
- 可考虑在 `repowiki-impact` 的风险分层中引入 PageRank 因子（当前四项
  已覆盖直接/传递/循环/fan-in，避免重复计权）。
- 提交/推送与版本 tag 由用户确认后执行。
