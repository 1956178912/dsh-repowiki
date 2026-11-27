# 检查点：状态模块依赖热点 v0.79.0（phase-54）

- 日期：2026-11-27
- 目标：`repowiki-status` 关注健康度（陈旧/孤儿/锁），但看不到架构信息；
  用户在生成 Wiki 之前无法判断模块依赖是否异常。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/tool-status.js`：
  - 新增输出字段 `moduleDependencies`（最多 10 条，复用
    `summarizeModuleRelations`）；
  - 渲染行为 `src → lib (3); …`，无依赖时为 `(none)`；
  - 工具描述/输出 schema 同步。
- 测试 `test/status.test.js`：
  - 空目录断言 `(none)`；
  - 新建 `src/main.ts` import `../lib/b` 的项目，索引后断言
    `[{ from: 'src', to: 'lib', count: 1 }]` 与渲染文本。
- 文档：两份 CHANGELOG、README 双语（stage/路线图/状态能力行）、
  `docs/coverage.md`。

## 验证（本地全量）

- `npm test`：341/341 通过。
- `npm run coverage:check`：行 97.83%、分支 87.02%、函数 94.53%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 复用 `summarizeModuleRelations` 而非新增聚合：与 Wiki 主题 prompt、
  模块页保持同一套计数口径，避免两处数字不一致。
- 上限 10（Wiki prompt 是 15）：状态输出面向终端阅读，10 条足够暴露
  热点，也不挤压其它诊断行。
- 索引缺失时输出空数组并渲染 `(none)`：不臆造数据，调用方可安全解析。
- 不新增告警：依赖集中本身不是错误，只提供事实，避免制造噪声告警。

## 遗留 / 下一步

- C/C++ 重复 include（不同书写路径）边折叠策略评估。
- Go `internal` 包别名解析细化。
- 提交/推送与版本 tag 由用户确认后执行。
