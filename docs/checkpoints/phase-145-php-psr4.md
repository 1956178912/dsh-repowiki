# 检查点：PHP PSR-4 解析与依赖目录排除（phase-145）

- 日期：2026-11-28
- 合入版本：v0.169.0
- 目标：PHP 的 `use` 一直靠“点分路径后缀”匹配，只对
  `App\` → `app/` 这类目录名与命名空间一致的布局有效。现代 Symfony /
  Laravel skeleton 常把 `App\` 映射到 `src/`，此时文件路径没有 `App`
  段落，依赖边全部丢失，影响面、循环与 Wiki 架构章节随之缺数据。
  同时 `vendor/`（Composer 依赖）与 `.dart_tool/`（Dart 生成缓存）不在
  默认排除列表里，真实项目里会挤占 5,000 文件预算。
- 状态：代码、测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/indexer.js`：
  - `isConfigManifest` 纳入 `composer.json`，嵌套包清单也会被读取
    （单次上限 `MAX_COMPOSER_MANIFESTS = 50`，根清单不受限）。
  - `buildPhpPsr4(manifestTexts)`：解析根与嵌套 `composer.json` 的
    `autoload` / `autoload-dev` 的 `psr-4`，前缀统一小写点分、目录相对
    清单所在目录解析；支持字符串与数组目录；按“前缀长度降序 → 目录浅 →
    字典序”排序，最长前缀优先。
  - `normalizeComposerDir`：拒绝绝对路径、盘符与 `..` 越界目录；空目录
    值表示清单所在目录——清单被篡改也不会把解析范围带出仓库。
  - `buildPhpPaths`：PHP 文件的小写路径索引（与既有 PHP 大小写不敏感
    语义一致）。
  - `resolvePhpSpecifier`：命名空间边界匹配（`App` 不吞 `Application`），
    余段转 `/` 并补 `.php`；未命中返回 null。
  - `resolveImportEdge` 的 PHP 分支：`require/include` 不变；`use` 先走
    PSR-4，再回退原有 `resolveDottedSpecifier`，无 composer 配置的仓库
    行为不变。
- `src/schema.js`：`EXCLUDE_DIRS` 增加 `vendor`（Composer 依赖；Go 的
  vendored 第三方代码同理）与 `.dart_tool`（Dart/Flutter 生成缓存）。
- 测试：
  - PHP 夹具覆盖最长前缀（`App\Models\` 胜过 `App\`）、数组目录、
    `autoload-dev`、空前缀兜底、嵌套包以自身目录为基准、外部
    `Monolog\Logger` 不建边、`dependencyCounts.composer` 仍只统计根清单。
  - 新增夹具证明 `vendor/` 与 `.dart_tool/` 下的源文件不进入索引。

## 语义边界

- 只读取 `psr-4`；`classmap` / `files` 需要解析每个文件的声明，不在
  本次范围（未命中仍回退点分后缀，不会比以前更差）。
- `autoload-dev` 参与解析：测试文件经常导入 `Tests\` 夹具，排除它会让
  测试目录的依赖边断裂；代价是开发期类也会被解析，属预期。
- 空前缀映射（`"": "src/"`）按 Composer 语义兜底所有类，但排在所有
  非空前缀之后；只在余段对应文件存在时才建边。
- 嵌套 composer.json 只影响解析映射，不影响技术栈：`detectStack` 仍只
  读根清单，`dependencyCounts.composer` 不会被 workspace 包重复计数。
- 排除 `vendor` 后无法通过 `extraExclude` 反向包含；项目自身代码放在
  `vendor/` 属极少数场景，文档已注明该默认行为。

## 验证

- `LANG=en node --test test/indexer.test.js`：42/42 通过。
- 全量门禁：`npm test`（双语言 540/540）、`coverage:check`（行 98.07 /
  分支 86.63 / 函数 95.37）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
