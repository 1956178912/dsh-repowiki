# 检查点：符号级影响面分析（phase-91）

- 日期：2026-11-27
- 合入版本：v0.117.0
- 目标：把 v0.115.0 的文件级爆炸半径进一步细化到符号，减少"只改一个函数，
  却把同文件所有导入方都列为直接影响"的噪声。
- 状态：代码、专项测试、真实仓库冒烟与全量验证完成；未提交/推送。

## 交付

- `src/impact.js`
  - `resolveSymbolChanges(index, changed, symbols)`：支持裸符号名和
    `path#name`。裸名只在本次变更文件内查找精确定义；限定路径要求唯一匹配
    索引文件。未命中进入 `unmatchedSymbols`，不放大为文件级分析。
  - `computeSymbolImpact(edges, resolved, depth, limit)`：直接层要求导入边含
    所选符号的具名证据；排除副作用导入与只导入同文件其他符号的模块。
    传递层从精确直接依赖方沿反向文件图展开，因此仍是保守上界。
  - 输出 `symbolReferences`（引用文件、import 起始行、命中符号）以及精确
    总数；展示截断不影响总数计算。
- `src/tool-impact.js`
  - `repowiki-impact` 新增 `symbols` 参数与 `scope: file|symbol`。
  - 输出 `symbolChanges`、`unmatchedSymbols`、`symbolReferences` 和
    `conservativeImpactedTotal`；后者保留未过滤文件级影响总数，避免把符号
    过滤结果误当作整个文件的运行时影响。
  - 文本显示 `[symbol scope]`、`import evidence` 与文件级上界；符号未解析
    时明确提示不会回退为文件模式。
- `test/impact.test.js`：11 例全部通过，覆盖未解析不放大、同文件其他符号、
  副作用导入、传递层保守展开、多行 import 的真实 a/b/c/d 链路和超过 100
  个无关循环组的过滤回归。

## 语义边界

- 证据来自静态 import/use/require 边，不是运行时调用图，也不推断动态
  require、反射或依赖注入。
- 直接层是"具备具名导入证据的静态依赖方"；传递层与文件级总数是上界，
  三种口径同时保留，不混为一个数字。
- 只读、确定性、无 LLM、不自动修改代码。

## 验证

- 专项：impact 11/11。
- 真实仓库：`src/impact.js#computeSymbolImpact` 的直接依赖准确识别为
  `src/tool-impact.js` 与 `test/impact.test.js`，传递层另计；未过滤文件级
  上界仍单独返回。
- 全量结果见 phase-93 检查点。
