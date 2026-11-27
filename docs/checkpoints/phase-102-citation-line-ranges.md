# 检查点：引用行号越界校验与索引 v6（phase-102）

- 日期：2026-11-27
- 合入版本：v0.126.0
- 目标：上一轮已能发现"引用的文件不存在"，但 `#Lx-Ly` 指向文件末尾之外
  仍然静默通过。本轮让索引记录源码行数，并把行号越界纳入引用完整性。
- 状态：代码、纯函数测试、索引/状态集成、真实仓库冒烟与全量门禁完成；
  已提交并推送。

## 交付

- 索引 schema v6：
  - `files[].lines` 记录源码行数，由索引时**已读取的文本**直接计算，
    不增加 IO；
  - `INDEX_SCHEMA_VERSION = 6`，`INDEX_COMPATIBLE_VERSIONS` 扩到 v2–v6；
  - 读取侧对 v2–v5 保持兼容：旧条目没有 `lines` 时行号校验降级为
    unchecked，不要求重建索引；
  - 解析缓存无需失效：复用 symbols/imports 时仍会重新读取文本并计算行数。
- `src/util.js` 新增 `countSourceLines`：空文件 0 行；结尾换行不额外
  增加一行（`"a\n"` = 1 行，`"a\nb"` = 2 行）。
- `src/wiki-references.js`：
  - `parseWikiSource`：解析 `path`、`path#L10`、`path#L10-L20`、
    `path#L10-20`（大小写不敏感）；无法识别的片段只保留路径；
  - `normalizeWikiSource` 改为复用解析器，行为不变；
  - `findCitationRangeIssues(manifest, lineCounts, knownPaths)`：
    起始 <1、起止倒置、超出文件行数都计为越界；行数未知的引用计入
    `unchecked`（提供 knownPaths 时只统计"存在但行数未知"的引用，
    缺失文件由断链检查负责）；明细 10 页 × 每页 10 条有界，总数精确。
- `src/tool-status.js`：
  - 从索引构建 `lines` 映射；
  - 有清单时输出 `citationRangeIssues`（total/unchecked/pages/truncated）；
  - 文本新增 `Citation ranges` 行（示例 `path#L1-L99 (file has 1 lines)`
    与 unchecked 计数），越界时追加告警；
  - 无清单时不做行号断言（字段与行都不出现）。

## 测试

- `test/util.test.js`：行数语义 7 组输入。
- `test/indexer.test.js`：索引条目带 `lines`（1 行与 2 行夹具）。
- `test/wiki-references.test.js`：解析器 8 组、越界/倒置/零起始/
  unchecked、plain object 行数、12 页截断。
- `test/status.test.js`：完整资产用例改为 v6；新增行号越界用例
  （`src/a.ts#L1-L99` 越界、`README.md#L1-L5` 计入 unchecked）与渲染断言。

## 真实仓库冒烟

重建索引：110 文件、593 符号、5 模块，97 个文件复用；`repowiki-status`
显示 `Index: v6 compatible`。本仓库当前没有 Wiki 清单，因此
`citationRangeIssues` 不出现——与"无清单不做断言"的契约一致。

## 语义边界

- 行号来自索引时的源码快照；索引之后文件被修改时，行数以索引为准
  （陈旧检测仍由 digest 负责）。
- 只校验范围，不校验被引用行是否真的包含相关代码。
- 未索引文件（如 README）的行数未知：计入 unchecked，绝不猜测越界。

## 验证

- `npm test`：471/471（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.16%、分支 86.39%、函数 95.27%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 行数在索引期计算而不是查询期读取：避免 status 对每个引用做额外 IO，
  也让面板/后续工具可以直接复用一个确定值。
- 不因新增字段强制全量重解析：digest 未变时复用 symbols/imports，
  `lines` 从当前文本重算，升级成本接近一次普通增量索引。
- 不把 unchecked 计入越界或健康分：无法验证 ≠ 有问题，保持诚实。

## 遗留 / 下一步

- 面板可在 Wiki 页面展示断链/越界徽章；
- 若索引记录每行内容哈希，可进一步校验"引用行号附近的代码已变化"。
