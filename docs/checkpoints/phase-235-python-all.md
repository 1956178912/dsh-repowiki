# 检查点 235：Python `__all__` 星号可见性（v0.259.0）

## 目标

`from x import *` 的可见符号从"全部模块级符号（词法扫描确认）"收窄为
"`__all__` 声明名，缺省时非下划线名"，让星号再导出链、潜在引用与使用点
统计不再把被排除符号算进去。

## 交付

- `src/symbols.js`：新增 `pythonAllNames(lines)`，支持 `__all__ = [...]`/
  `(...)`、`+=`、`append(...)`、`extend([...])`，跨行括号内容最多 20 行；
  `extractPython` 为每个非 method 符号写 `starExported`（仅 false 时落字段，
  保持索引体积）。
- `src/reexports.js`：新增 `starExportedNamesByFile(files)`（仅 Python、
  排除 method 与 `starExported === false` 与下划线名）；`buildReexportMaps`
  返回 `starDefinitions`；`resolveReexportOrigins` 队列项带 `star`，星号
  来源按可见名判断是否存在，具名/别名路径不受影响，`default` 不沿星号下传。
- `src/references.js`：Python 源文件的 `*` 边按目标可见名展开为具名潜在
  引用；不再写无差别 `*` 键。
- `src/usages.js`：`IMPORT_BLOCK_STARTS` 新增 `__all__` 声明行，避免
  `__all__ = ['parse']` 里的 `parse` 被算成使用点；直接 `*` 边按目标星号
  可见性过滤。
- `src/schema.js`：`INDEX_PARSER_VERSION = 15`，旧缓存重解析。
- 测试：`test/symbols.test.js`（`__all__`/`+=`/`append`/无声明下划线）、
  `test/references.test.js`（可见名潜在引用、隐藏名无记录）、
  `test/usages.test.js`（导入方过滤）、`test/tools.test.js`（真实索引
  cards 对隐藏符号的 references/usages 均为空）。
- 文档：README 中英阶段行与要点、CHANGELOG 中英、`docs/compatibility.md`
  Python 行、`docs/coverage.md` 对应行。

## 语义边界

- 只识别模块级（行首）`__all__`；函数/类体内声明不影响模块导出。
- `__all__` 非字面量（变量拼接、循环填充、`import` 别名）不推断，回退
  下划线规则。
- 星号可见性只作用于星号路径：具名导入、别名导入、`__init__.py` 具名
  再导出仍按符号是否存在判断（与 CPython 行为一致）。
- `default` 导出不沿星号传播（ES 语义），Python 侧无 default 概念。

## 验证

- 定向：`node --test test/symbols.test.js test/references.test.js
  test/usages.test.js test/tools.test.js` 143/143 通过。
- 全量：812 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>` 即可；解析器版本回退会让旧缓存重新解析，无数据迁移。
