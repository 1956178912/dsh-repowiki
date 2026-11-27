# 检查点：JSON podspec（phase-223）

- 日期：2026-11-28
- 合入版本：v0.247.0
- 目标：v0.244.0 只解析 Ruby DSL 的 `*.podspec`；CocoaPods 还支持 JSON
  规格 `*.podspec.json`。本轮让两种格式共享同一套元数据/依赖/技术栈与
  嵌套上限。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/stack.js`：
  - 新增 `podspecJsonInfo`：解析 `name`/`version`、顶层 `dependencies`
    与 `subspecs[].dependencies`，按依赖名去重，坏 JSON 返回空依赖；
  - `detectStack` 的 podspec 分支按扩展名分派 Ruby/JSON 解析。
- `src/indexer.js`：`isConfigManifest` 与嵌套清单选择同时接受
  `.podspec` / `.podspec.json`，共用 `MAX_PODSPEC_MANIFESTS = 20`。
- 测试：
  - `test/stack.test.js`：JSON 规格名称/版本/依赖/子规格、版本约束、
    坏 JSON 计零；
  - `test/indexer.test.js`：Ruby 与 JSON podspec 同时聚合，依赖计数与技术
    栈均包含 Alamofire。
- 文档：README 双语（阶段行、索引工具行、版本列表）、CHANGELOG 双语、
  `docs/coverage.md`。

## 语义边界

- JSON 规格只读取 `name`/`version`/`dependencies`/`subspecs`；其他字段
  （platforms、source、source_files 等）不解析。
- 依赖约束原样保留在技术条目，不做求值；同名依赖以首次出现为准。
- 坏 JSON 不抛错、不计数；文件仍作为清单被读取但不产生结论。
- 两种格式共享 20 个嵌套上限；根清单优先，超出部分不读取。

## 验证

- `LANG=en npm test`：772/772
- `LANG=zh_CN.UTF-8 npm test`：772/772
- `npm run coverage:check`：行 98.09%、分支 87.88%、函数 95.58%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
