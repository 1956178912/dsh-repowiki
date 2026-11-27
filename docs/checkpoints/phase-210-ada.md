# 检查点：Ada 支持（phase-210）

- 日期：2026-11-28
- 合入版本：v0.234.0
- 目标：Ada 在航空航天、国防、铁路与嵌入式（DO-178C / EN 50128）中仍是
  主力语言，此前 `.ads`/`.adb` 完全不进索引。补上后包规范/实现、子程序、
  类型与包级对象可检索，`with` 形成单元级依赖边，GNAT 的两种子单元
  文件命名约定都被识别。
- 状态：代码、测试、双语文档、兼容矩阵、覆盖率报告与检查点更新；全量
  门禁通过。

## 交付

- `src/schema.js`：`adb`/`ads` → `ada`。
- `src/prompts.js`：`fenceLang('ada')` → `ada`。
- `client.js`：`LANGUAGE_LABELS` 增加 `Ada`。
- `src/symbols.js`：
  - `adaScan`：`--` 行注释与双引号字符串（`""` 转义）屏蔽；字符字面量
    不屏蔽，避免破坏 `X'Length` 属性；
  - `adaHeaderEnd`：多行参数/返回类型，声明头止于 `is` 或 `;`；
  - `adaRecordEnd`：`type X is record … end record;` 的范围；
  - `extractAda`：package/package body（嵌套与点分子单元带 `parent`）、
    procedure/function（声明 vs 实现）、type/subtype/task type/protected
    type、包级对象；`private` 段非导出；`end if/loop/case/record/select/
    block` 不关闭单元，匿名 `declare … begin … end;` 单独记账；generic
    形式参数不登记。
- `src/deps.js`：`extractAdaImports` 提取 `with`/`limited with`/
  `private with`（逗号分隔多单元），`use` 与 generic 形式子程序不建边。
- `src/indexer.js`：`buildAdaUnits`（GNAT 连字符文件名 + 任意源根目录
  形式，spec/body 分槽）、`resolveAdaUnit`（小写精确 → 后缀兜底，
  spec 优先、body 回退）。
- 测试：
  - `test/symbols.test.js`：包/record/子程序声明与实现/private 段/
    declare 块；generic 形式参数与嵌套包 `parent`；注释与字符串中的
    `end`/`private` 不干扰范围；
  - `test/deps.test.js`：三种 `with` 形态、`use` 与 generic 形式参数排除；
  - `test/indexer.test.js`：大小写不敏感解析、spec 优先、仅有 body 回退、
    连字符与目录两种子单元文件名。
- 文档：README 双语（39 语言、语言清单、版本列表、阶段行）、
  CHANGELOG 双语、`docs/compatibility.md`（Ada 行 + 限制说明）、
  `docs/coverage.md`。

## 语义边界

- 单元名以文件名（GNAT 约定）为准，不从 `package` 声明反推；因此非 GNAT
  布局或文件名与单元名不一致的仓库可能漏边。
- `entry`、`task body`/`protected body` 内的 accept/entry 不产符号。
- 记录变体部（`case … end case;`）与 `declare` 块按关键字保守配平，
  极端嵌套可能使范围偏大（不会产生错误符号名）。
- generic 形式参数不登记、不建边；`with` 外部标准库/第三方 crate 不建边。
- 未添加 `alire.toml` / `*.gpr` 技术栈识别（留待后续迭代）。

## 验证

- `LANG=en npm test`：734/734
- `LANG=zh_CN.UTF-8 npm test`：734/734
- `npm run coverage:check`：行 98.04%、分支约 87.9%、函数 95.88%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
