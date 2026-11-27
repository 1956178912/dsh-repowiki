# 检查点：Wiki 增量合成 v0.59.0（phase-34）

- 日期：2026-11-27
- 目标：重复运行 `repowiki-generate` 时，输入没变就不调用模型——降低
  成本、缩短等待，同时让"记忆变化"也能触发重新合成。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/tool-generate.js`：
  - 新增 `force` 参数（默认 false）。
  - 新增已采信记忆指纹 `memoryDigest`（`slug:body` 排序后哈希），写入
    Wiki 清单 v2 的可选字段。
  - 主题合成短路：`granularity === 'theme'` 且非 force、清单 `inputDigest`
    与 `memoryDigest` 均匹配、清单页面全部存在时，直接返回
    `skippedFresh: true` + 清单页面列表，不派发子代理；跳过时仍报告磁盘上
    不在清单里的孤儿页。
  - `byLocale` 与顶层输出增加 `skippedFresh`；渲染在跳过时给出
    "Wiki is up to date … pass force=true" 文案。
  - module/all 粒度保持确定性生成，不参与短路（模块页还依赖索引结构）。
- `src/tool-status.js`：清单含 `memoryDigest` 且 Wiki 非空时，比对当前
  已采信记忆指纹，不一致则告警（渲染为 `Warning: Accepted memory changed …`）。
- 测试：
  - `test/tool-llm.test.js`：首次生成 → 未变跳过（断言不再派发）→ 写入
    accepted 记忆后重新合成 → `force` 强制重跑。
  - `test/status.test.js`：记忆晚于 Wiki 时告警且渲染可见。
- 兼容矩阵：Wiki 清单 v2 增补可选 `memoryDigest`。

## 验证（本地全量）

- `npm test`：316/316 通过。
- `npm run coverage:check`：行 97.81%、分支 86.84%、函数 93.95%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 短路需要"卡片 + 记忆 + 页面存在"三条件：只比卡片会让记忆变化被忽略，
  只比清单会让被删页面永远不补。
- 短路限定 theme 粒度：模块页是确定性聚合且依赖索引结构（边/模块树），
  跳过它可能留下过时页面；theme 是唯一有模型成本的部分。
- 状态告警与短路共用同一指纹算法：用户看到的告警与 generate 的实际行为
  一致；状态仍以卡片指纹计 `stale`，两者互补。
- 旧清单（无 `memoryDigest`）会自然重新生成一次，无需迁移脚本。

## 遗留 / 下一步

- 目录级并行索引（大仓库吞吐）。
- Swift Package 目标级依赖图；`given`/`extension` 成员归属。
- 提交/推送与版本 tag 由用户确认后执行。
