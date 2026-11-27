# 检查点：Shell（Bash）支持（phase-167）

- 日期：2026-11-28
- 合入版本：v0.191.0
- 目标：仓库普遍包含 `scripts/*.sh`：CI 脚本、发布脚本、运维工具。此前
  这些文件完全不被索引，函数无法检索，`source` 依赖不形成边，影响面分析
  看不到脚本之间的复用关系。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；待全量门禁与提交。

## 交付

- `src/symbols.js`：
  - `shellScan`（导出）：逐行扫描，`#` 注释（仅行首/空白/`;|&(` 之后）、
    引号字符串（跨行延续）与 heredoc 内容屏蔽；同时返回保留字符串内容的
    `code` 行与字符串内容替换为空格的 `masked` 行（依赖提取读路径用前者，
    符号匹配/配平用后者）；
  - `shellBraceDelta`：`${…}` 参数扩展整体跳过，避免单个扩展让函数块
    提前结束；
  - `shellBlockEnd`：花括号配平，支持 `function foo` 与 `{` 分行；
  - `extractShell`：三种函数写法（`function foo`、`function foo()`、
    `foo() {`，含单行块体）与 `export`/`readonly`/`declare`/`typeset`
    带赋值的显式变量；普通赋值与 `local` 不登记；只在顶层识别。
- `src/deps.js`：`extractShellImports` 提取 `source path` / `. path`
  （含 `; then`/`do`/`&&` 前缀），参数支持单/双引号；含变量、命令替换、
  通配符或花括号展开的动态路径跳过。
- `src/indexer.js`：`resolveShellSpecifier` 先按脚本目录、再按项目根解析，
  依次尝试原路径与 `.sh`/`.bash`；拒绝绝对/反斜杠/越界路径。
- `src/schema.js`：`sh`/`bash`/`zsh → shell`；`src/prompts.js` 围栏
  `bash`；`client.js` 展示名 `Shell`。
- 测试：
  - `symbols.test.js`：三种函数写法、分行 `{`、单行函数体、显式变量、
    普通赋值/`local` 排除、注释与 heredoc 屏蔽；
  - `deps.test.js`：`source`/点命令、`then` 前缀、动态路径与 heredoc 跳过、
    `bash file.sh` 不误提取；
  - `indexer.test.js`：脚本目录、项目根与 `../` 解析，动态路径不建边，
    函数符号进入索引。

## 语义边界

- Shell 没有可见性关键字：函数与显式声明统一 `exported: true`；普通赋值
  数量大且多为临时状态，不登记。
- `source` 的运行时语义是相对**当前工作目录**；为保证确定性，这里采用
  “脚本目录优先、项目根兜底”的静态启发式，并在兼容矩阵中写明。
- 动态路径（`$DIR`、`$(...)`、glob、`{}` 展开）没有静态证据，不建边。
- `bin/` 属既有构建产物排除目录，放在 `bin/` 的脚本不会进入索引；这是
  跨语言一致的取舍，`scripts/`/`tools/` 等目录正常覆盖。
- heredoc 只识别 `<<`/`<<-` 与简单分隔符；`eval` 与运行时拼接的 source
  不解析。

## 验证

- `LANG=en node --test --test-name-pattern="Shell" test/symbols.test.js test/deps.test.js test/indexer.test.js`：
  3 例通过。
- 全量门禁：`npm test`（双语言 580/580）、`coverage:check`（行 98.08 /
  分支 87.01 / 函数 95.44）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
