# 检查点：依赖图感知的 Wiki 新鲜度（phase-152）

- 日期：2026-11-28
- 合入版本：v0.176.0
- 目标：Wiki 的“是否最新”只比较卡片指纹与已采信记忆指纹。v0.169.0
  的 PHP PSR-4、v0.64.0 的 TS 别名、v0.167.0 的 Dart 工作区包等解析
  都可由配置清单改变：只改 `composer.json`/`tsconfig.json`/`go.mod`
  时卡片与源码不变，依赖边却已变化，模块页（文件集合、出/入边、循环、
  高风险入口）和主题页 prompt 都会过期，而生成侧仍短路、门禁仍通过。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/wiki-graph.js`：新增 `wikiGraphText(index)`——索引文件路径排序 +
  依赖边 `from>to` 排序的规范化文本，供服务端与面板计算结构指纹。
- `src/tool-generate.js`：
  - 计算 `graphDigest = sha256-16(wikiGraphText(index))`；
  - 增量短路新增 `manifest.graphDigest === graphDigest`（旧清单缺字段
    不短路，重新生成一次并写入）；
  - 清单写入 `graphDigest`。
- `scripts/verify-wiki.mjs`：
  - `cardsDigest` 恢复卡片口径；新增 `graphStale`（清单有
    `graphDigest` 时比较，缺失则跳过以兼容旧清单）；
  - 不一致时 `staleReasons.push('graph')` 并报 `wiki/stale-graph`
    （error，`--strict` 下同样失败）；`stale` 汇总纳入 graph。
- `src/tool-status.js`：结构指纹不一致时追加告警
  （`Wiki is stale: the indexed file set or dependency graph changed ...`）。
- `client.js`：`wikiGraphTextClient` 与 `wikiInputsStale`；面板把结构
  不匹配并入既有 `cardsStale` 提示（文案更新为“卡片或依赖图”），旧清单
  无 `graphDigest` 时行为不变。
- 测试：
  - `test/wiki-graph.test.js`：顺序无关、非法条目忽略、空索引；
  - `test/tool-llm.test.js`：生成后只改 `index.json` 的边（卡片与引用
    源码不变）→ 不再短路、重新派发；
  - `test/verify-wiki.test.js`：结构变化 → `staleReasons: ['graph']`、
    `wiki/stale-graph`；
  - `test/status.test.js`：结构指纹不一致 → 告警；
  - `test/client-smoke.test.js`：卡片指纹一致、仅结构指纹不同 → 面板仍
    提示“Wiki 落后”。

## 语义边界

- 结构指纹覆盖“文件集合 + 边”，不覆盖文件内容（内容变化由卡片指纹与
  引用漂移覆盖），也不含行号/符号列表（架构描述不依赖它们）。
- 旧清单一律按兼容处理：`verify:wiki` 缺 `graphDigest` 不告警不失败，
  状态/面板不提示；生成侧下一次运行写入该字段（顺带刷新一次 Wiki）。
- `graphDigest` 不参与 `inputDigest` 的旧口径，避免一次升级让所有既有
  Wiki 的指纹语义悄悄变化；两个字段独立演进。
- 面板只读 `index.json`，因此能判断配置驱动的边变化，但无法判断“索引
  本身是否已过期”；索引过期仍由 `repowiki-index`/status 的既有提示负责。

## 验证

- 受影响套件（wiki-graph/verify-wiki/status/client-smoke/tool-llm）：
  117/117 通过。
- 全量门禁：`npm test`（双语言 558/558）、`coverage:check`（行 98.10 /
  分支 86.76 / 函数 95.33）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
