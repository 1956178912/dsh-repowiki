# 检查点：Nix 支持（phase-198）

- 日期：2026-11-28
- 合入版本：v0.222.0
- 目标：Nix 是 flake/基础设施仓库的核心语言，此前 `.nix` 完全不进索引。
  补上后属性绑定（包、模块选项、flake outputs）可检索，`import`/
  `callPackage` 形成文件级依赖边。
- 状态：代码、测试、双语文档、兼容矩阵、覆盖率报告与检查点更新；全量
  门禁通过。

## 交付

- `src/schema.js`：`nix: 'nix'`。
- `src/prompts.js`：`fenceLang('nix')` → `nix`。
- `client.js`：`LANGUAGE_LABELS` 增加 `Nix`。
- `src/symbols.js`：
  - `nixScan`：`#` 行注释、`/* … */` 块注释、双引号字符串与 `''…''`
    缩进字符串（`'''`/`''${`/`''\` 转义）屏蔽；
  - `extractNix`：属性集/`let` 绑定，点分路径键，`{`/`rec {` → class
    （配平范围）、lambda → function、其余 variable；嵌套属性集成员带
    `parent`。
- `src/deps.js`：`extractNixImports` 提取 `import`/`callPackage`/
  `builtins.readFile|readDir|path` 的相对路径。
- `src/indexer.js`：`resolveNixPath` 相对引用文件解析，补 `.nix` 与
  目录 `default.nix`；越出项目/绝对路径跳过。
- 测试：
  - `test/symbols.test.js`：绑定、嵌套属性集、点分键、lambda、
    缩进字符串屏蔽；
  - `test/deps.test.js`：三种引用与注释/heredoc 屏蔽；
  - `test/indexer.test.js`：文件路径、目录 `default.nix`、外部
    `<nixpkgs>` 跳过。

## 语义边界

- 只识别行首绑定；`inherit` 与同行 `let … in` 写法可能漏登记。
- 跨行 lambda 参数模式按 class 处理（同行 `}:` 才判定 function）。
- `src = ./src;` 等裸路径不建边（只处理三类已知函数上下文）。
- `flake.nix` 不作为技术栈清单，Nix 项目暂无 stack 识别。

## 验证

- `LANG=en npm test`：650/650
- `LANG=zh_CN.UTF-8 npm test`：650/650
- `npm run coverage:check`：行 98.01%、分支约 87.6%、函数 95.76%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
