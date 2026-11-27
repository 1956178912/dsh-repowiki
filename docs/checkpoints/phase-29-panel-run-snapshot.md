# 检查点：面板运行快照 v0.54.1（phase-29）

- 日期：2026-11-27
- 目标：把 v0.54.0 写入知识清单的最近一次抽取快照带到面板，让用户不进
  会话、不跑 `repowiki-status` 也能看到"上次抽了多少、失败/重试多少"。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `client.js`：
  - 新增 `readKnowledgeManifest`，读取
    `.dsh-repowiki/knowledge/<locale>/_index.json`（缺失/损坏返回 null，
    不当作读取失败）。
  - 新增 `lastExtract` 状态；`load` 在读到索引后按 `wikiResult.locale`
    读取知识清单并写入快照（`lastRun` 形状不符时置 null）。
  - 三个重置分支（无会话 / 无资产 / 未选工作区）都清零快照，避免切换到
    空工作区时残留上一个库的运行结果。
  - 单库统计行新增快照文本：`lastExtract {n} {failed} {retried}`；
    失败数 > 0 时使用 `--dsw-alias-state-error-primary` 并加
    `role="status"`，`title` 挂本次运行时间。
  - DICTS 增中英文键（zh：`上次抽取 {n} 张 · 失败 {failed} · 重试 {retried}`）。
- `client.js` 回归修复：`loadCards` 枚举 `knowledge/` 失败（只跑过索引、
  目录尚未创建）时返回空卡片集，不再让整页落入"读取失败"；知识清单改用
  卡片实际落地的 locale 读取。
- `test/client-smoke.test.js`：
  - fixture 增 `knowledge/zh/_index.json`（schema v2 + `lastRun`）。
  - 统计行断言快照存在、无失败时不带错误色、`title` 为运行时间。
  - 新增用例：失败数 > 0 时错误色 + `role=status`；清单缺失时不渲染；
    仅有索引无 `knowledge/` 时渲染就绪空集。

## 验证（本地全量）

- `npm test`：294/294 通过。
- `npm run coverage:check`：行 97.65%、分支 86.03%、函数 93.66%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 复用 wiki 页已解析出的 `locale` 读取知识清单：面板实际展示的卡片/文档
  语言与清单目录一致，避免面板 locale 与产物 locale 不一致时读空。
- 快照只做"最近一次"，不查历史；失败用颜色而非弹窗，保持统计行紧凑。
- 清单缺失静默降级：没有记录 ≠ 抽取失败。

## 遗留 / 下一步

- 面板展示 Wiki 多章节 chips（当前跳转取首个被引用章节）。
- 目录级并行索引；Ruby/Swift/Scala 扩展。
- 提交/推送与版本 tag 由用户确认后执行。
