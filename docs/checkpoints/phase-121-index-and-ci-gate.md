# 检查点：旧索引严格化与 CI 自证 job（phase-121）

- 日期：2026-11-27
- 合入版本：v0.145.0
- 目标：`verify:wiki` 依赖索引 v6 的 `files[].lines` 做行号越界校验；
  旧索引下这部分检查会静默降级，而门禁仍可能通过。同时 README 长期写的
  “生成后运行 `--strict --require`”从未在仓库 CI 中真正执行。
- 状态：代码、测试、工作流、双语全量门禁完成；已提交并推送。

## 交付

- `scripts/verify-wiki.mjs`：
  - 索引存在且 `schemaVersion < 6` 时产出 `index/outdated`：默认警告，
    `--strict` 下错误（行号校验不完整 = 不可验证）。
  - `ranges.unchecked > 0` 时产出 `citation/range-unchecked`：默认警告，
    `--strict` 下错误，与未覆盖/未验证指纹同语义。
  - 修复全局问题分流：warning 不再进入 `issues` 导致误判失败。
- `.github/workflows/tests.yml` 新增 `verify-wiki` job：
  - 用 Node heredoc 生成最小 fixture（索引 v6、卡片、清单、页面）；
  - 断言 `node scripts/verify-wiki.mjs --root .ci-fixture --strict --require`
    退出 0；
  - 修改卡片 `sourceDigest` 后再跑，断言退出码为 1。
- 测试：新增 v5 索引用例（默认告警、严格失败，且包含未验证范围的严格
  错误）；`writeIndex` 支持指定 schemaVersion。
- 双语文档、覆盖率报告、Runbook 同步。

## 测试

- `node --test test/verify-wiki.test.js`：14/14。
- 全量 508 例通过（LANG=en、LANG=zh_CN.UTF-8）。
- 本地以等价 heredoc 构造 fixture：干净资产 exit 0、改卡后 exit 1。

## 语义边界

- `index/outdated` 只针对“索引存在且版本是数字且 < 6”；索引缺失不报，
  因为 Wiki 可以引用非索引文件，存在性会走有界文件系统探测。
- 未来版本（> 6）不报：字段仍可能兼容，交由读取侧按需处理。
- `citation/range-unchecked` 是“无法验证”而非“越界”：不改变
  `ranges.total`，只在 strict 下阻止通过。
- CI job 只验证门禁行为，不跑 `repowiki-generate`（避免模型依赖）；
  fixture 直接构造 generate 的产物形态。

## 验证

- `npm test`：508/508（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.03%、分支 86.26%、函数 95.27%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。
- workflow 中 heredoc 命令已本地等价执行并验证两个退出码。

## 取舍

- 旧索引默认只告警：升级期不应因未重建索引直接阻断；需要强约束的
  流水线使用 `--strict`。
- CI job 使用 `.ci-fixture` 临时目录而不是提交 fixture 资产：避免把
  示例 Wiki 混入仓库自身知识库，也不受 `.gitignore` 影响。
- 不改 `--require` 语义：它仍只要求“存在非空清单”，索引版本是另一维度。

## 遗留 / 下一步

- 面板显示“Wiki 落后于卡片/记忆”（需要浏览器侧摘要实现）。
- 工作流可增加 `verify:wiki` 在真实仓库资产上的可选运行（当前仓库
  没有生成 Wiki，默认跳过）。
