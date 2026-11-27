# 检查点：多行依赖解析、缓存演进与 v0.117.0 验证（phase-93）

- 日期：2026-11-27
- 版本：v0.117.0（由 v0.115.0 迭代；phase-91/92 功能合并交付）
- 状态：代码、双语文档、基准与发布前验证完成；未提交、未推送、未打 tag。

## 真实冒烟发现并修复的问题

### 1. 多行 JS/TS import 漏边

真实仓库中 `src/tool-impact.js` 以多行形式导入 `computeSymbolImpact`，旧
逐行解析器没有生成该边，导致符号级影响面错误返回 direct=0。

`src/deps.js` 现在拼接以 `{` 结束的静态 import/export-from 语句头（最多
100 行），保留起始行号，支持：

- 多行具名导入与 export-from；
- 默认导入 + 多行具名导入；
- `as` 别名归一、行内 `type` 标记；
- 花括号内的整行注释，不把注释当作符号。

修复后本仓库索引边由 228 增至 260，`computeSymbolImpact` 的直接依赖方
正确包含 `src/tool-impact.js` 与 `test/impact.test.js`。

### 2. 解析器升级后旧 imports 被增量缓存复用

仅修解析器还不够：旧索引按源码 digest 复用 `files[].symbols/imports`，
未改源码会继续保留旧的漏边结果。

- `src/schema.js` 新增 `INDEX_PARSER_VERSION`（当前 1），与
  `INDEX_SCHEMA_VERSION` 独立。
- `index.json` 写入 `parserVersion`。
- `src/indexer.js` 仅在上一版 parserVersion 相同时复用解析结果；版本变化
  时即使 digest 未变也重解析。
- 缓存失效仍使用旧文件集合计算 added/changed/removed，避免把全库已有文件
  误报为新增。

真实仓库首次升级：100 文件 changed、0 reused；紧接着第二次索引：100
文件 reused、0 added/changed/removed，证明失效只发生一次。

## 回归与文档

- 新增多行 import/export-from 单元测试（起始行、具名符号、后续行号）。
- 新增 parserVersion 缓存失效与恢复复用测试。
- impact 的真实工具链路改用多行 import，覆盖索引→符号影响全链路。
- README 双语、CHANGELOG 双语、coverage、benchmarks、locale 元数据、
  package/lock 均更新至 v0.117.0；测试总数 425。

## 最终验证

- `npm test`：425/425（LANG=en）。
- `LANG=zh_CN.UTF-8 npm test`：425/425。
- `npm run coverage:check`：行 98.60%、分支 88.84%、函数 96.86%，高于
  95/85/85 门禁。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run scan:secrets`：120 个 Git 跟踪文件通过。
- `npm run verify:host`：15 个宿主令牌均存在，11 个 alias 均有深色变体。
- `npm pack --dry-run`：54 文件，包约 223.5 kB，包含 context/impact 全部
  运行时模块。
- `git diff --check`：通过。
- 基准（Apple M5 / Node 22.23.2）：1000 文件 34 ms / RSS 64 MiB；
  5000 文件 122 ms / RSS 88 MiB。

## 发布边界与后续

- 未执行 release 脚本，未 commit/push/tag；保留给用户确认。
- 工作区还包含此前多个 phase 的未提交修改，本检查点不把它们冒充为本轮
  单独产生，也不擅自清理。
- 静态 import 证据仍不等于运行时调用图；符号直接层精确、传递层保守的
  口径已在工具和文档中固定。
