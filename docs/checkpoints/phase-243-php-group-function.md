# 检查点 243：PHP 分组 function/const 导入（v0.267.0）

## 目标

修复 `use App\{function f, const C};` 这类分组混写条目被跳过的问题，
让函数/常量导入获得符号证据（含组内 `as` 别名）。

## 交付

- `src/deps.js` `extractPhpImports` 的 `push`
  - 叶子解析前剥离 `function`/`const` 修饰词（大小写不敏感）。
  - 剥离后沿用既有正则解析名字与 `as` 别名，别名进入 `aliases`。
  - 非分组 `use function A\f;` 的既有路径不变。
- `src/schema.js`：`INDEX_PARSER_VERSION = 23`。
- 测试：`test/deps.test.js` 新增分组 `{function fx, const KC, Plain,
  function fy as fz}`，断言函数/常量符号与别名。
- 文档：README 中英阶段行与要点、CHANGELOG 中英、`docs/compatibility.md`
  PHP 行、`docs/coverage.md` 对应行。

## 语义边界

- 分组前缀仍按命名空间反斜杠归一为点分路径；修饰词只影响叶子名字。
- `function`/`const` 仅作为前导修饰词剥离，不改变导入符号种类（索引边
  只记录名字，不区分函数/常量/类）。
- 组内 `as` 别名与普通 `use … as` 走同一条 `pushEntry` 路径。
- 大小写不敏感的 `Function`/`Const` 修饰词同样剥离（PHP 关键字不区分
  大小写）。

## 验证

- 定向：`node --test test/deps.test.js` 50/50 通过。
- 全量：817 例（`LANG=en` 与 `LANG=zh_CN.UTF-8`），覆盖率门禁
  行 ≥95 / 分支 ≥85 / 函数 ≥85 通过。

## 回滚

`git revert <commit>`；解析器版本回退后缓存导入重新提取，无数据迁移。
