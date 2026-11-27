# 检查点：门禁有界并发读取（phase-127）

- 日期：2026-11-27
- 合入版本：v0.151.0
- 目标：`verify:wiki` 逐文件串行读取卡片、已采信记忆与 Wiki 页面；
  大型仓库每次 CI 门禁都要为这些本地 IO 付出串行延迟。改为与项目其他
  模块一致的 8 路有界并发。
- 状态：代码、测试、双语全量门禁完成；已提交并推送。

## 交付

- `scripts/verify-wiki.mjs`：
  - 新增 `mapLimit(items, limit, fn)`：固定 worker 数、结果保持输入顺序。
  - `readCards`/`readMemories`：先过滤 `.md`，8 路并发读取与解析，再按
    原文件顺序写入 Map，保持重复 path/slug 的“后者覆盖”语义。
  - `readWikiPages`：递归只收集文件路径，随后并发读取 frontmatter 与正文，
    最后按收集顺序写入 Map；目录深度与坏页降级不变。
  - 链接/存在性探测保持串行与 200 上限，避免并发探测放大 IO。
- 测试：新增“并发读取多卡片并跳过坏卡”用例（两张有效卡 + 一张坏卡，
  指纹仍匹配、不报 stale）。
- 双语文档、覆盖率报告同步。

## 测试

- `node --test test/verify-wiki.test.js`：17/17。
- 全量 515 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 结果顺序由 `mapLimit` 固定，写入 Map 的顺序与串行版本一致；盖章/覆盖
  行为不变。
- 单张坏卡/坏记忆/坏页仍跳过而非中断；错误处理在 worker 内完成。
- 并发只用于“读取 + 解析”，不涉及写盘；门禁保持只读。
- 链接探测不并发：数量上限 200，串行 stat 已足够快，且便于保持严格的
  顺序与截断语义。

## 验证

- `npm test`：515/515（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.01%、分支 86.46%、函数 95.35%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 固定 8 路而非按 CPU 数：本地小文件读取受事件循环与文件系统调度限制，
  8 路已能覆盖延迟；固定值也避免在不同 CI 机器上产生不确定行为。
- 不重构为共享工具模块：`mapLimit` 只在门禁脚本内使用，避免为一个
  调用点增加公共 API 与测试面。
- 不做基准数字承诺：不同文件系统差异大，本轮只保证语义不变与并发路径
  有测试覆盖。
