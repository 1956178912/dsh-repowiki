# 检查点：Go internal 可见性诊断 v0.98.0（phase-73）

- 日期：2026-11-27
- 目标：Go 多模块解析（v0.91.0）明确把 `internal` 可见性列为已知限制，
  但跨边界导入在真实构建中会编译失败。补索引阶段诊断：边照常建立（索引
  反映代码事实），违规去重后写入 `warnings`，让问题在索引/状态阶段暴露。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/indexer.js`：
  - 新纯函数 `goInternalViolation(from, to)`：
    - 目标路径含 `/internal/` 时，导入方必须在 `internal` 的父目录树内；
    - 根 `internal/...`（无前置目录）不限制导入方；
    - 多个 internal 段取最内层（`lastIndexOf`）为边界；
    - 返回可读违规说明（含边界与原因），允许时 null；
  - 生成边时对 `lang === 'go'` 的边做检查，违规说明进入 Set（去重）；
  - `warnings` 触达条件增加违规非空，内容追加违规说明。
- 测试（`test/indexer.test.js`）：
  - 新用例：树内导入不告警、跨边界导入告警（边仍建立）、嵌套 internal
    取最内层边界、根 `internal/` 不限制。
- 文档：两份 CHANGELOG、README 双语（stage / 索引工具行 / 路线图）、
  `docs/coverage.md`、`docs/compatibility.md`（移除"internal 不校验"）。

## 验证（本地全量）

- `node --test test/indexer.test.js`：37/37 通过。
- `npm test`：382/382 通过。
- `npm run coverage:check`：行 98.00%、分支 87.41%、函数 95.10%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- **违规不删边**：索引的目标是如实反映依赖关系；隐藏违规边会破坏影响面
  分析。告警与边并存，用户既看到事实也看到问题。
- **路径级判定而非 module 路径级**：模块路径与文件路径在常见布局下一一
  对应；用仓库相对路径判定零额外解析成本，且跨多模块（子模块 internal）
  同样正确。极端 symlink/重命名布局可能漏报，不误报。
- **去重**：同一文件对同一 internal 包的多条 import 语句只产生一条告警，
  避免 warnings 被重复项淹没。
- **最内层边界**：`a/internal/b/internal/c` 的最严格限制在
  `a/internal/b/`，取最后一个 `/internal/` 覆盖双层约束（外层约束包含
  内层，无需重复检查）。

## 遗留 / 下一步

- mermaid 子集按真实资产反馈扩展 subgraph 分组。
- 面板 hub chip 点击跳转到对应卡片详情。
- 索引 warnings 在面板统计行的提示（当前面板只展示跳过文件数）。
- 提交/推送与版本 tag 由用户确认后执行。
