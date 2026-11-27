# 检查点：tsconfig/jsconfig `extends` 继承（phase-232）

- 日期：2026-11-28
- 合入版本：v0.256.0
- 目标：此前的别名解析只读取单个配置的 `baseUrl`/`paths`，monorepo
  常见的 `tsconfig.base.json` + `extends` 结构无法建立别名边。本轮补齐
  相对 extends 链、覆盖语义与基础配置不泄漏。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/indexer.js`：
  - `parseAliasConfig`：读取 `extends`（字符串/数组）、`baseUrl`、`paths`；
  - `resolveAliasConfig`：递归跟随同仓库相对 extends（最多 5 跳、循环
    检测、memo），子 `paths` 替换父条目并绑定有效 baseUrl，继承 patterns
    保留各自声明目录，数组后者覆盖前者；
  - `buildJsAliasConfigs`：只被 extends 的基础配置不单独生效（除
    `tsconfig.json`/`jsconfig.json`），结果按目录深度降序；
  - `resolveJsAlias`：每条 pattern 用自身 `baseDir` 解析目标。
- 测试：`test/indexer.test.js` 新增继承、子覆盖、extends 数组三例。
- 文档：README 双语（阶段行、extends 条目）、CHANGELOG 双语、
  `docs/coverage.md`、`docs/compatibility.md`。

## 语义边界

- 只跟随相对路径 extends（`./`/`../`），包名 extends 不读取
  `node_modules`；超出仓库或未被索引的配置静默忽略。
- 子配置只定义 `baseUrl` 时，继承的 patterns 仍按父配置目录解析（与
  TypeScript 的相对路径规则一致）。
- `paths` 为空/非数组条目按既有容错策略跳过；坏 JSON 不阻断索引。
- 解析结果每次索引重建时重新计算，不进入解析器缓存版本。

## 验证

- `LANG=en npm test`：805/805
- `LANG=zh_CN.UTF-8 npm test`：805/805
- `npm run coverage:check`：行 98.12%、分支 87.84%、函数 95.54%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
