# 检查点：barrel 感知的符号影响面（phase-227）

- 日期：2026-11-28
- 合入版本：v0.251.0
- 目标：v0.250.0 打通了 references/usages 的再导出链，但
  `repowiki-impact` 的符号作用域仍只把直接边算作直接影响：经 barrel
  导入的文件要等到下一跳才出现，符号引用行号也缺失。本轮让影响面复用
  同一套链解析。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/reexports.js`：新增 `reexportImportSites(edges, files, targetPath,
  name, { includeReexports })`，返回经由 barrel 的导入方位置；默认跳过
  再导出边，影响面开启 `includeReexports` 把中间 barrel 也计入。
- `src/impact.js`：`computeSymbolImpact(edges, resolved, depth, limit,
  files?)` 在直接边扫描后追加再导出链导入方，写入
  `directSymbolsByPath` 与 `referenceSites`（保留 barrel 导入行号）。
- `src/usages.js`：改用共享 `reexportImportSites`，删除重复链解析。
- `src/tool-impact.js`：传入 `index.files`。
- 测试：
  - `test/impact.test.js`：多级 barrel 的影响面单测（直接计数、引用、
    顺序）与真实索引的 `repowiki-impact` 集成（直接=barrel+最终导入方、
    使用点行号）。
- 文档：README 双语（阶段行、barrel 影响面条目）、CHANGELOG 双语、
  `docs/coverage.md`。

## 语义边界

- 直接影响=文件级关系，不证明运行时调用；词法使用点仍需扫描确认。
- 中间再导出 barrel 在影响面中算直接受影响（其导出内容随定义变化），
  在使用点扫描中不算使用证据。
- 别名再导出仍保守漏报（deps 记录原名）；歧义星号来源跳过。
- 文件级影响面、风险评分与受影响测试路由不变。

## 验证

- `LANG=en npm test`：784/784
- `LANG=zh_CN.UTF-8 npm test`：784/784
- `npm run coverage:check`：行 98.1%、分支 87.61%、函数 95.63%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
