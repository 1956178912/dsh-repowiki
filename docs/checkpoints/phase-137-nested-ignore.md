# 检查点：嵌套忽略规则（phase-137）

- 日期：2026-11-27
- 合入版本：v0.161.0
- 目标：索引器此前只读取项目根的 `.gitignore`/`.repowikiignore`；monorepo
  常见的 `packages/*/.gitignore` 被完全忽略，生成目录或包内本地文件会进入
  索引、卡片候选与依赖图。`src/ignore.js` 头部也把“嵌套 .gitignore”列为
  有意不支持。
- 状态：代码、解析器/索引测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/ignore.js`：
  - `parseIgnore(text, base)` 为每条规则记录 `base`（规则所在目录，根为空）；
    模式的锚定/目录尾/无斜杠语义都相对该目录。
  - `ruleMatches` 先按 `base` 截取子树（目录自身不匹配），再做原有匹配；
    目录规则的祖先检查清除 `base` 后逐级匹配。
  - `loadIgnoreRules(fs, root, base)` 支持任意目录。
- `src/indexer.js` `walk`：
  - 仅在当前目录的 entries 里确实出现 `.gitignore`/`.repowikiignore` 时才
    读取（不增加额外 stat）；规则追加到父规则之后，获得更高优先级。
  - 嵌套规则文件不可读时写入 `budget.ignoreWarnings`（带目录前缀），
    合并进索引 `warnings`。
  - 根目录规则加载路径与行为不变。
- `test/ignore.test.js`：parseIgnore 期望补 `base`；新增目录作用域/否定
  优先级用例与真实嵌套 `buildIndex` 用例。

## 语义边界

- 规则不会作用于规则文件所在目录自身；`generated/` 只忽略该目录及其内容。
- 父规则仍覆盖子树；子规则后置可否定父规则（`!keep.skip.ts`），但被父规则
  裁剪的目录不会进入，因而其中的规则不会被读取（与 Git 一致）。
- 仍不支持全局 excludes、反斜杠转义、字符类 `[a-z]`；复杂需求继续用
  plan 的 `exclude`。
- 嵌套规则按遍历顺序读取并复制规则数组；目录多但规则文件少时开销很小。

## 测试

- `node --test test/ignore.test.js`：5/5。
- 全量 526 例（LANG=en 与 LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：526/526（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.02%、分支 86.36%、函数 95.27%。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不读取被裁剪目录内的 `.gitignore`：Git 也不会重新包含被忽略目录下的文件，
  保持剪枝性能。
- 不为嵌套规则单独建缓存：只在文件名出现时读一次，规则数组随深度复制；
  对比每目录两次 stat，这个选择在远程工作区更省 RTT。
- 不把嵌套规则文件本身计入 `ignored`：它们不是源码，也不消耗文件预算。
