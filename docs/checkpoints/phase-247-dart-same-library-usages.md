# 检查点 247：Dart 同库使用点扫描（v0.271.0）

## 目标

补齐 v0.270.0 记录的边界：part 文件内使用主库符号（以及反向）此前没有
任何使用点证据，因为同库文件之间不存在 import 边。本轮让使用点扫描覆盖
主库 + part 的同库分组，同时保持 importer 语义纯净。

## 交付

- `src/reexports.js` 新增 `dartLibrarySiblings(edges)`
  - 只用 `kind: 'part'` 边构建无向并查集分组（路径压缩）。
  - 返回 文件 → 同库其他文件（排序、去重）；单成员不登记。
- `src/usages.js`
  - 新增 `MAX_LIBRARY_FILES = 10`。
  - `collectSymbolUsages` 在导入方计划之后，为每个目标把同库文件加入
    扫描计划；同库文件单独限额、按路径排序，不计入 20 个导入方名额；
    超出上限的符号写入 `truncated`。
  - 同库扫描不进入 `importers` 输出（`part` 不是 import）。
  - 更新函数注释说明额外扫描来源。
- `src/tool-impact.js`
  - 使用点扫描提取为 `scanUsageFile`，导入方与同库文件共用。
  - 同库文件同样按 `MAX_LIBRARY_FILES` 限额，不增加 `usagesScanned`
    （该计数只统计 importer 文件），超出上限置 `usagesTruncated`。
- 工具描述（cards / context / impact）补充"同库 Dart part 文件"边界。
- 测试：
  - `test/usages.test.js`：分组并查集、非 part 边不分组、part 边不产生
    importer、`MAX_LIBRARY_FILES` 值。
  - `test/tools.test.js`：Dart part 库端到端（part 符号的使用点出现在
    主库文件，`importers` 为空，`filesScanned = 2`）。
- 文档：README 中英、CHANGELOG 中英、`docs/compatibility.md` Dart 行、
  `docs/coverage.md` 头部与明细行。

## 语义边界

- 同库扫描仍是词法证据：同名实体、字符串与行尾注释无法区分。
- 同库文件的读取失败按既有规则披露为 unknown（不是未使用）。
- 未修改索引结构，解析器版本保持 v26（无需重解析缓存）。

## 验证

- 定向：`node --test test/usages.test.js test/tools.test.js` 58/58 通过。
- 全量：825 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；纯扫描期行为变化，无索引/资产迁移。
