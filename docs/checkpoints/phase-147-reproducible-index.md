# 检查点：可复现索引产物（phase-147）

- 日期：2026-11-28
- 合入版本：v0.171.0
- 目标：`index.json` 是随 Git 提交、供面板与工具读取的资产，但它的顺序
  取决于 `ctx.fs.listDir` 的返回顺序：不同后端（local / sandbox / SSH）
  或文件系统可能给出不同次序，导致同一份代码生成不同的 `files`/`edges`
  数组（无意义 diff），超预算仓库还会因为遍历截断而索引到不同文件子集。
- 状态：代码、测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/indexer.js`：
  - `walk` 在 `listDir` 之后按条目名称字节序排序（`compareEntryName`，
    直接用 `<` 比较，不依赖 ICU/`localeCompare` 的区域规则），再进入
    嵌套忽略判定与遍历；预算计数与 maxFiles 截断因此跨后端一致。
  - 文件装配完成后 `files.sort(comparePath)`（路径字节序），供
    `buildModules`、统计与写盘使用。
  - 依赖边生成后按 `from` → `line` → `to` 排序；同一文件内保持源码行
    顺序，跨文件顺序固定。
  - `compareEntryName` / `comparePath` 为模块内私有工具，注释说明
    “为什么不用 localeCompare”。
- 测试：`索引确定性：目录枚举顺序不影响 files/edges 输出`——用反向
  `listDir` 包装器构建同一项目，断言 `files`/`edges`/`modules` 与正常
  顺序完全一致，并校验文件按路径、边按 from/行号/to 排序。

## 语义边界

- 排序只影响输出顺序与超预算截断，不改变任何解析结果：符号、行号、
  依赖目标与统计值不变。
- 名称按字节序（UTF-16 code unit）比较：ASCII 路径下等价于字典序；
  非 ASCII 文件名顺序与 `localeCompare` 可能不同，但跨机器稳定，且
  Git diff 可复现优先。
- `manifests` 读取顺序仍由排序后的遍历决定；嵌套清单上限（JS 配置 200、
  CMake 50、go.mod 20、composer 50）在超限仓库中截断到同一批文件。
- `edges` 排序不合并重复边：同一文件同一行两次导入仍保留两条记录
  （与既有语义一致），仅顺序固定。

## 验证

- `LANG=en node --test test/indexer.test.js`：43/43 通过。
- 全量门禁：`npm test`（双语言 545/545）、`coverage:check`（行 98.08 /
  分支 86.76 / 函数 95.40）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
