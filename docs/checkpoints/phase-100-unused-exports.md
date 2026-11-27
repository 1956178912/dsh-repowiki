# 检查点：保守导出审计（phase-100）

- 日期：2026-11-27
- 合入版本：v0.124.0
- 目标：回答"哪些导出没有任何内部使用证据"，同时避免把无法判定的文件
  误报为死代码。这是仓库健康度的一部分，服务于清理与 API 收敛。
- 状态：代码、纯函数测试、状态集成与全量门禁完成；已提交并推送。

## 交付

- 新增纯函数模块 `src/unused-exports.js`：
  - 建立入边表：目标文件 → 具名符号集合 + 是否存在无名入边；
  - 只审计同时满足"至少一条入边"与"所有入边都具名"的文件；
  - 无入边（可能是入口/被外部消费）或含无名导入（默认/副作用/C/Go 风格）
    的文件计入 `skippedFiles`，不猜测；
  - 忽略 `default` 名称与非导出符号；候选按行号、名称排序；
  - 明细上限 10 文件 × 每文件 10 符号，`hidden` 记录每文件被省略数，
    `total` 与 `exportedTotal` 始终精确。
- `src/tool-status.js`：
  - 输出 `unusedExports`（total / exportedTotal / skippedFiles / files /
    truncated）；
  - 文本新增 `Unused export candidates: N symbol(s) in M file(s) — e.g.
    path#name; K file(s) not assessed`；无候选显示 `(none)`；
  - 不修改健康分权重（避免同一卫生维度重复计权）。
- 双语文档、locale 元数据同步。

## 测试

- `test/unused-exports.test.js`：4 例——具名证据统计、副作用/无入边跳过、
  default/非导出忽略与上限、空索引与无效边。
- `test/status.test.js`：新增"只报告可判定文件"用例：`lib.ts` 的 `unused`
  被报告，`standalone.ts`（无入边）与 `lib2.ts`（副作用导入）计入
  skippedFiles，渲染行包含示例与未审计数。

## 语义边界

- 只回答"没有具名 import 证据"，不是死代码判定：公共 API、入口文件、
  动态导入、字符串反射与外部消费者都可能合法使用。
- 默认导入（`import X from`）在索引边中没有符号名，因此该文件若还存在
  其他无名入边会被整体跳过；这是有意的保守策略。
- 不读取源码、不执行构建工具，零额外 IO。

## 验证

- `npm test`：462/462（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.13%、分支 86.21%、函数 95.19%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不把候选加入 warnings：它是清理建议而非知识库损坏，避免拉低健康分与
  告警噪声。
- 不把默认导出的真实函数名当作候选：默认导入没有符号级证据，强行判断会
  产生大量假阳性。
- 不做跨包/跨仓库使用分析：索引是单仓库静态 import 图。

## 遗留 / 下一步

- 可在 `repowiki-impact symbols` 中提示"该导出无内部使用"，辅助删除决策。
- 若未来索引记录默认导入名称，可放宽跳过规则并减少 skippedFiles。
