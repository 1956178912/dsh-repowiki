# 检查点：Perl 支持（phase-196）

- 日期：2026-11-28
- 合入版本：v0.220.0
- 目标：Perl 在遗留系统、DevOps 与生物信息学仓库中仍大量存在，此前
  `.pl`/`.pm`/`.t` 完全不进索引。补上后包、子程序可检索，`use`/`require`
  形成模块级依赖边，`t/` 测试也能进入受影响测试路由。
- 状态：代码、测试、双语文档、兼容矩阵、覆盖率报告与检查点更新；全量
  门禁通过。

## 交付

- `src/schema.js`：`pl`/`pm`/`t` → `perl`。
- `src/prompts.js`：`fenceLang('perl')` → `perl`。
- `client.js`：`LANGUAGE_LABELS` 增加 `Perl`。
- `src/symbols.js`：
  - `perlScan`：双视图——`masked` 屏蔽 `#` 行注释（`$#array` 除外）、
    `=pod … =cut`、heredoc（`<<EOF`/`<<'EOF'`/`<<"EOF"`/`<<~EOF`）与
    单/双引号字符串；`code` 保留字符串原文供 `use parent 'Foo'` 读取；
  - `extractPerl`：语句式 `package`（后续声明归属，直到下一个 package）
    与块式 `package`（块后恢复外层包）登记 class；`sub` 登记 function，
    包内为 method + `parent`；`_` 前缀非导出。
- `src/deps.js`：`extractPerlImports` 提取 `use`/`require`、`parent`/
  `base` 引号与 `qw()` 参数、相对路径 `require`；pragma 与版本跳过。
- `src/indexer.js`：`buildPerlRoots` 收集每个 `lib/` 根 + 项目根；
  `resolvePerlSpecifier` 做 `::`→路径换算、`.pm`/`.pl` 尝试、相对路径
  先项目根再脚本目录。
- `src/test-files.js`：`t/` 目录与 `*.t` 脚本识别为测试。
- 测试：
  - `test/symbols.test.js`：package 作用域、块 package、sub 可见性、
    POD/heredoc 屏蔽；
  - `test/deps.test.js`：`use`/`require`、parent/base、pragma 过滤；
  - `test/indexer.test.js`：`lib/` 根解析、相对 require；
  - `test/test-files.test.js`：`t/` 与 `*.t` 测试路径。

## 语义边界

- 只识别行首 `package`/`sub`；匿名子程序 `my $f = sub { … }` 不登记。
- 语句式 `package` 的 `endLine` 到下一个 `package` 或文件尾。
- `use lib` 的额外路径不参与解析；`bin/` 沿用既有排除规则。
- heredoc 起始行支持一个标识符；嵌套/动态 heredoc 不解析。

## 验证

- `LANG=en npm test`：644/644
- `LANG=zh_CN.UTF-8 npm test`：644/644
- `npm run coverage:check`：行 98.03%、分支约 87.7%、函数 95.73%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
