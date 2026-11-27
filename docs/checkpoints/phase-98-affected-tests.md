# 检查点：受影响测试路由（phase-98）

- 日期：2026-11-27
- 合入版本：v0.122.0
- 目标：影响面此前只告诉代理"哪些文件受影响"，验证建议是笼统的"跑覆盖
  这些依赖方的测试"。本轮把测试文件单列出来，并按最近跳数排序，让代理
  先跑正确的测试。
- 状态：代码、单测、工具集成、真实仓库冒烟与全量门禁完成；已提交并推送。

## 交付

- 新增纯函数模块 `src/test-files.js`：
  - `isTestPath(path)`：路径启发式——`test/tests/__tests__/spec/specs/
    __spec__/e2e/cypress` 目录；`*.test.*`、`*.spec.*`；`test_*`、
    `*_test.*`、`*_spec.rb`；`FooTest`/`FooTests`/`FooSpec`/`FooIT` 的
    JVM/C#/Scala/Swift 命名；Windows 反斜杠归一。`testdata`、`latest.ts`、
    `contest.js`、`testing.ts` 等不误判。
  - `collectAffectedTests(entries, limit)`：按路径去重取最小跳数，最近优先、
    同跳按路径，默认上限 50，返回 `truncated`。
- `src/impact.js`：
  - `computeImpact` 与 `computeSymbolImpact` 在完整图遍历中收集所有受影响
    文件（含超出明细上限的部分），再交给 `collectAffectedTests` 过滤；
    返回 `tests` 与 `testsTruncated`，因此明细截断不影响测试列表的准确性。
  - `recommendationsFor` 新增 `tests` 输入：有测试时第一条建议直接点名
    （最多列 5 个 + 省略号）。
- `src/tool-impact.js`：
  - 输出 `affectedTests`（`path`/`depth`，最多 50）与
    `affectedTestsTruncated`；文件级与符号级都返回。
  - 文本在受影响文件列表后新增 `Affected tests:` 行（最多 8 个 + 折叠，
    标注跳数与截断）；`Next:` 首条为测试建议。
  - 截断时 hint 说明列表上限 50、影响总数仍精确。
- 双语文档、locale 元数据同步。

## 测试

- `test/test-files.test.js`：3 例，覆盖 18 个命中路径、11 个不误判路径、
  去重/最小跳数/排序/上限/空输入。
- `test/impact.test.js`：
  - 纯函数：受影响测试按跳数单列、变更文件本身是测试时不列自己；
  - 工具：文件级与符号级都返回 `affectedTests`，文本含
    `Affected tests:` 与首条 `Run the N affected test file(s) first`。

## 真实仓库冒烟

对 `src/impact.js` 做文件级影响面：

- `affectedTests`：`test/impact.test.js`（1 跳）、`test/context.test.js`
  （2 跳，经 `src/context.js`）；
- 文本：`Affected tests: test/impact.test.js; test/context.test.js (2 hops)`；
- 建议首条：`Run the 2 affected test file(s) first: …`。

## 语义边界

- 识别完全基于路径启发式，不读取构建系统/测试框架配置；误判可能发生，
  输出与描述均标注为路径推断。
- 测试来自静态 import 反向图；动态加载、运行时注册的测试不会被发现。
- 只做路由建议，不执行测试，也不声称覆盖关系。

## 验证

- `npm test`：454/454（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.11%、分支 86.32%、函数 95.1%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 在完整遍历中收集测试而不是只看截断后的明细：否则默认 limit 50 之外
  的测试会静默消失，而"测试列表"恰恰需要完整。
- 不把测试数量加入风险分：风险分已有直接/传递/循环/fan-in 四因子，
  再加会让等级解释变复杂，且测试多不等于风险高。
- 不猜测测试与源码的覆盖关系：只回答"静态依赖上受影响"，不冒充覆盖率。

## 遗留 / 下一步

- 可考虑在 `repowiki-context` 的关系段附带受影响测试（预算允许时）。
- 面板可展示受影响测试入口（需与编辑前流程结合）。
