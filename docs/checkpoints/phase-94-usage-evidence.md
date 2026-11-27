# 检查点：词法使用点证据（phase-94）

- 日期：2026-11-27
- 合入版本：v0.118.0
- 目标：符号级影响面此前只能证明"谁导入了这个函数"，看不到"在依赖方的
  哪一行真正出现"。本轮在不引入 AST/调用图的前提下，为直接具名导入方
  补充有界、可核验的词法使用点证据。
- 状态：代码、单测、工具集成、真实仓库冒烟与全量门禁完成；未提交/推送。

## 交付

- 新增纯函数模块 `src/usages.js`：
  - `findSymbolUsages(source, name, options)`：标识符边界（`[A-Za-z0-9_$]`
    两侧不匹配）、大小写敏感、每行只记一次；跳过整行注释（`//`、`#`、
    `/*`、`*`、`--`、`<!--`）、空行与显式 `skipLines`；长行截断到 200 字符；
    每符号上限默认 10。
  - 导入块排除：多行 JS/TS `import { … }`、`export { … }`、Python
    `from x import (`、Go `import (`、Rust/PHP `use … {` 与
    `const { … }` / `const [ … ]` 解构绑定按括号平衡整体跳过，避免把续行
    的符号列表误报为使用点（`edge.line` 只记录语句起始行，无法单独排除
    续行）。
  - `usageImporters(edges, symbol)`：只接受 `edge.symbols` 明确包含该符号
    且非自引用的边，按引用方聚合 import 行号并排序。
  - `selectUsageFiles(importers, limit)`：路径去重、字典序稳定、前 20 个
    文件，返回 `skipped` 计数。
- `src/tool-impact.js`：
  - 新参数 `includeUsages`（默认 true，仅符号模式生效）。
  - 扫描按文件去重后读取一次源码，多个符号共享同一文件；每符号 10 条、
    总计 100 条；写入 `usages`（`path`/`symbol`/`line`/`text`）。
  - `usagesScanned`、`usagesSkippedFiles`、`usagesTruncated`、
    `usagesUnreadable` 如实区分"已扫描 / 因上限跳过 / 读取失败"。
  - 文本渲染在 import 证据之后列出前 8 条，并显式标注
    `lexical occurrences, not resolved call sites`；无出现时明确说明；
    读取失败单独一行，提示 usage unknown, not absent。
  - hint 补充读取失败、文件上限与截断三类说明。
- 输出 schema 新增四个 usages 字段（可选，文件级模式不返回）。

## 测试

- `test/usages.test.js`：9 例，覆盖词边界与大小写、注释/空行/skipLines、
  单行与多行导入块（JS/Python/Rust）、解构绑定与 require、上限与超长行、
  正则特殊字符、依赖方聚合、文件选择。
- `test/impact.test.js`：新增 5 例（使用点内容与 import 行排除、读取失败、
  无词法出现、21 个导入方的文件上限与跳过披露、11 符号 × 10 次触发的
  100 条总量截断），并补充空 paths 降级分支。

## 真实仓库冒烟

本仓库重建索引：102 文件、262 边、26 ms。对
`src/impact.js#computeSymbolImpact` 做符号级影响面：

- 直接导入方 2、传递 1，文件级上界 6；
- 使用点 4 条：`src/tool-impact.js:438` 与 `test/impact.test.js:106/115/118`；
- 多行 import（`test/impact.test.js:11`）未被误报为使用点。

## 语义边界

- 词法出现不是解析后的调用点：字符串、行尾注释与同名不同实体可能命中，
  输出与描述均明确标注，不使用 "call site" 措辞。
- 只扫描直接具名导入方；传递层不猜测符号使用位置。
- 读取失败与文件上限跳过都作为证据缺口披露，绝不合并为"零使用"。

## 验证

- `npm test`：438/438（LANG=en）。
- `npm run coverage:check`：行 98.07%、分支 86.36%、函数 94.98%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`：120 个 Git 跟踪文件通过。
- `npm run verify:host`：全部令牌存在、alias 均有深色变体。
- `git diff --check`：通过。

## 取舍

- 不做 AST/调用图：零依赖解析器无法可靠区分调用、引用与同名文本；
  词法证据 + 明确标注比假装精确更诚实，成本也更低。
- 导入块按括号平衡跳过而非解析器改造：规则局部、可测试，不改变索引格式。
- 文件数与条数上限固定为常量，不新增配置面：源读取是本工具唯一的额外 IO，
  上限保证大仓库下仍是一次廉价调用。

## 遗留 / 下一步

- `repowiki-context` 可考虑按同一词法证据补充"符号使用点"段（当前只在
  impact 中提供，避免预算被低价值重复内容占用）。
- 跨语言导入块形态（如多行 `use` 的变体）若要扩展，先补真实语料测试。
- 提交/推送与版本 tag 由用户确认后执行。
