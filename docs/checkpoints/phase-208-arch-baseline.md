# 检查点：架构基线棘轮门禁（phase-208）

- 日期：2026-11-28
- 合入版本：v0.232.0
- 目标：v0.225–v0.231 已能把循环、分层违规、坏相对导入、重复块与高复杂度
  函数算出来，但它们只出现在 `repowiki-status` 里——CI 无法据此阻塞，而
  要求"一次清零"存量问题又会逼团队关掉检查。本轮把这些事实冻结成可复现
  基线，只拦截**新增**退化（ESLint baseline / detekt baseline /
  ArchUnit freeze 的同一模式），让架构门禁从"报告"变成"可执行契约"。
- 状态：代码、测试、双语文档、兼容矩阵、覆盖率报告、CI job 与检查点
  更新；全量门禁通过。

## 交付

- `src/schema.js`：新增 `ARCH_BASELINE_FILE`（`arch-baseline.json`）与
  `ARCH_BASELINE_SCHEMA_VERSION = 1`，与其他资产版本常量同处。
- `src/arch-baseline.js`（新模块，纯函数）：
  - `snapshotArchitecture({index, layers, sources, opts})`：调用既有
    `evaluateLayers`（明细上限放开以得到精确层对计数）、`findImportCycles`、
    `findUnresolvedImports`、`findDuplicates`、`computeComplexity`（上限放开
    以得到精确高复杂度数）与 `assessHealth`（只取架构分量，避免文档/Wiki
    资产状态让基线漂移）。
  - `normalizeBaseline(raw)`：把磁盘基线当不可信输入，丢弃畸形条目并计数、
    去重排序、钳制计数；版本不符或非对象返回 `baseline: null` + 问题描述；
    缺 `ceilings`/`architectureScore` 时只关闭对应检查。
  - `compareArchitecture(baseline, current)`：身份型（循环组成员集合、层对
    新增/计数上升、`path → specifier`）与上限型/分值型（重复块、高复杂度、
    最大复杂度、架构分）分开比较，输出 `regressions`/`improvements`。
- `scripts/verify-arch.mjs`（新 CLI）：
  - 读取索引（路径经 `projectRelativePath` 净化，丢弃越界条目并计数）、
    plan 分层（复用 `readPlan` + 最小 node:fs 适配器）与有界源码（8 路并发，
    上限 `plan.maxStatusSourceFiles`）。
  - `--update` 写基线；默认 `--check`；`--require` 无基线即失败；`--json`
    输出结构化结果、稳定问题码（`index/*`、`plan/*`、`baseline/*`）与
    `regressions`/`improvements`；退出码 0/1/2。
  - 基线无时间戳、列表排序去重——同一输入重复 `--update` 逐字节一致。
- `package.json`：`verify:arch` 脚本。
- `.github/workflows/tests.yml`：新增 `verify-arch` job，自证"无基线
  `--require` 失败 → `--update` 后通过（JSON 断言 1 个环）→ 注入第二个环
  后退出码 1 且输出点名新循环"。
- 测试：
  - `test/arch-baseline.test.js`（17 例）：快照签名/层对计数/上限/分值、
    确定性、截断标记、归一化容错与版本拒绝、逐项棘轮分支。
  - `test/verify-arch.test.js`（15 例）：基线写入→通过、新循环/分层计数/
    重复块退化、缺基线（默认/`--require`）、缺索引/坏索引/坏基线、不可写
    基线、截断告警与修复项折叠、`--help`/`--json`/未知参数 CLI 契约。
  - `test/docs-consistency.test.js`：兼容矩阵的基线版本与代码常量绑定。
- 文档：README 双语（开发命令、CI 用法、架构要点、脚本表、阶段行）、
  CHANGELOG 双语、`docs/compatibility.md` 资产表、`docs/coverage.md`。

## 语义边界

- 循环组按成员集合识别：组内增删文件即视为新签名（环"变大"应当被拦住）；
  超过 200 组时基线标记 `truncated`，门禁告警而非静默。
- 分层违规按层对计数：允许存量，新增层对或计数上升即失败；文件移动导致
  层对不变时不会误报。
- 基线不记录时间戳，收益是 diff 干净；代价是"何时刷新"需靠 Git 记录。
- 门禁只读取索引与源码，不调用模型、不启子进程；缺少索引时退出码 2，
  不写基线。

## 验证

- `LANG=en npm test`：720/720
- `LANG=zh_CN.UTF-8 npm test`：720/720
- `npm run coverage:check`：行 98.07%、分支约 87.9%、函数 95.82%（新增两模块行覆盖 100% / 99.78%）
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
