# 检查点：语言与生态扩展 v0.47.0（phase-19）

- 日期：2026-11-27
- 目标：完成路线图 v0.47.0（语言与生态扩展），把索引从 JS/TS/Python
  扩展到 Go/Rust/Java，并补齐 Git 溯源、语言分布与多 locale 产物。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送（按约定需用户确认）。

## 交付

### 1. 多语言符号与依赖

- `src/schema.js`：`EXTENSION_LANGS` 增加 go/rs/java；`MANIFEST_FILES`
  增加 `pom.xml`、`build.gradle`、`build.gradle.kts`；`SUPPORTED_LOCALES`。
- `src/symbols.js`：Go（func/接收者方法/struct/interface/别名/导出常量变量）、
  Rust（fn/impl 与 trait 方法/struct/enum/trait/type/const）、Java
  （class/interface/enum/record/构造器/第一层方法）轻量提取；可见性映射到
  `exported`，方法归属映射到 `parent`。
- `src/deps.js`：Go 单条/分组 import；Rust `mod`、`use`（含嵌套分组与
  as 别名展开）；Java 普通/static/通配符 import。
- `src/indexer.js`：依赖边改为第二遍解析（需要完整文件集合与清单）：
  Go 按 `go.mod` module 前缀解析到包目录代表文件；Rust 按 crate 源根
  （`src/lib.rs`/`src/main.rs`）与 `mod`/`crate::`/`self::`/`super::`
  约定解析；Java 按简单类名索引 + 包后缀匹配（含 static 回退），避免
  每条 import 全表扫描。外部/无法解析的 import 不建边。

### 2. 技术栈与 Git 溯源

- `src/stack.js`：Maven `pom.xml` 依赖块解析、Gradle Groovy/Kotlin DSL
  坐标解析；共享 JVM 技术表（artifact 精确 + groupId 前缀兜底）。
- 新增 `src/git.js`：只读 `.git/HEAD`、松散引用、`packed-refs`、
  worktree `commondir`；支持 detached HEAD；不执行 git 命令。
- 索引 schema v4：新增 `git` 与 `stats.languages`；`readIndex` 兼容
  v2/v3 并在内存补齐派生字段；`repowiki-index`、`repowiki-status` 输出
  Git 与语言分布；面板显示分支徽标与语言数。

### 3. 多 locale 与正确性

- `repowiki-extract` / `repowiki-generate` 新增 `locales` 参数；逐 locale
  串行执行，顶层字段镜像首个 locale，`byLocale` 分语言汇报计数/页面/
  失败；取消后不再开始下一个 locale。
- 修复 `setMemoryStatus` 重写记忆时未剥离前导换行 + 标题导致的标题重复
  （accept/reject 后正文不再叠加旧标题）。

## 验证（本地全量）

- `npm test`：262/262 通过。
- `npm run coverage:check`：行 97.56%、分支 85.64%、函数 92.89%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过（本机无 asar 时按约定跳过）。
- `npm run bench -- 1000/5000`：31ms/119ms（93 MiB）。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 依赖边保持"可证实才建边"：Go 同包多文件解析到代表文件（文件级近似），
  Rust/Java 解析失败即忽略；不猜测跨语言或构建系统生成代码。
- Git 元数据只读文件、不启子进程：兼容 worktree/packed-refs，非 Git 仓库
  安静省略字段。
- 多 locale 为显式参数而非默认：避免无意翻倍模型成本；`byLocale` 让调用方
  能区分成功/跳过/失败。
- 轻量解析限制（多行签名、宏展开、完整泛型）写入 `docs/compatibility.md`。

## 遗留 / 下一步

- 浏览器侧视觉冒烟（分支徽标、语言统计）按 phase-15 清单人工确认。
- v0.48 候选：符号级反向引用（import 具名符号 → 引用方清单）、C#/Kotlin/
  PHP 扩展、增量索引的目录级并行（需先验证 `ctx.fs` 并发安全）。
- 提交/推送与版本 tag 由用户确认后执行。
