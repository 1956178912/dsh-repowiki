# 检查点：面板架构基线漂移（phase-217）

- 日期：2026-11-28
- 合入版本：v0.241.0
- 目标：架构基线（`verify:arch`）与基线感知状态（`repowiki-status`）已存在，
  但日常浏览的面板看不到漂移：文件徽章只说明"在环里"，无法区分"基线里
  本来就有"与"这次新增"。本轮把基线信号搬进单库视图，并让徽章与基线
  对比共用一次循环分析。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `client.js`：
  - `cycleInfoFor` 重构为 `cycleAnalysisFor`（返回 `infos` 与排序后的
    `groups`），用模块级 `WeakMap` 按 index 对象缓存；`cycleInfoFor` /
    `cycleGroupsFor` 为薄包装，徽章与基线对比不再各算一次 Tarjan；
  - `load()` 读取 `.dsh-repowiki/arch-baseline.json`（`readJson`，缺失/
    损坏/超出读取预算一律忽略），仅当对象含 `cycles` 数组时进入状态；
  - `baselineDrift` memo：当前循环组与基线 `cycles` 签名对比，得出新增/
    已修复数量；新增组取前 2 组生成示例（成员最多 3 个 + 折叠计数）；
    读取基线 `architectureScore` 与 `ceilings`（三项都必须是有限数值）；
  - 单库视图新增架构基线行：新增循环（红色）或"无新增循环"、已修复数
    （绿色）、架构分、重复块/高复杂度/最大复杂度上限；tooltip 附基线来源
    与新增循环示例；
  - 中文/英文文案键各 7 个；
  - 无基线时整行隐藏；面板其余加载路径不受基线文件影响。
- 测试（`test/client-dom.test.js` 1 例，真实 React+jsdom）：
  - 索引含 a↔b 环、基线 `cycles: []` → 渲染 `baselineLabel`、
    `baselineNewCycles`、`baselineScore`、`baselineCeilings`；
  - 同一索引去掉基线文件 → 不渲染该行。
- 文档：README 双语（阶段行、面板行、版本列表）、CHANGELOG 双语、
  `docs/coverage.md`。

## 语义边界

- 面板只比较**循环组身份**（成员集合签名）；分层违规、坏导入需要
  `repowiki-plan.json` 与源码，重复块/复杂度需要读源码，面板不重算，
  只展示基线记录值。
- 基线缺失、JSON 损坏、超过读取预算都静默忽略：附加信号不能阻断主视图。
- 基线版本不做强制校验（`verify:arch` 才是权威门禁）；旧/新基线字段
  缺失时对应 chip 不渲染。
- 新增循环示例最多 2 组、每组最多 3 个文件 + 折叠计数，避免 tooltip 过长。

## 验证

- `LANG=en npm test`：764/764
- `LANG=zh_CN.UTF-8 npm test`：764/764
- `npm run coverage:check`：行 98.08%、分支 87.92%、函数 95.58%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
