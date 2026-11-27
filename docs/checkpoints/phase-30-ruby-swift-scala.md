# 检查点：Ruby / Swift / Scala 三语言覆盖 v0.55.0（phase-30）

- 日期：2026-11-27
- 目标：把索引语言从 8 种扩到 11 种，覆盖服务端（Ruby）、客户端
  （Swift）与 JVM 数据/并发生态（Scala），保持零依赖轻量解析路线。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/schema.js`：`EXTENSION_LANGS` 增 `rb/rake → ruby`、`swift`、
  `scala`；`MANIFEST_FILES` 增 `Gemfile`（bundler）、`Package.swift`
  （swiftpm）、`build.sbt`（sbt）。索引 schema 仍为 v5（纯增量字段，
  不改变既有字段语义）。
- `src/symbols.js`：
  - Ruby：`class` / `module`（记为 type 命名空间）/ `def`（`self.`、
    `?!=` 后缀、表达式体）/ `attr_*` / 常量；块范围按 `end` 关键字配平，
    `obj.end` 方法调用与 `while ... do` 双重计数已排除。
  - Swift：`class`/`struct`/`actor`/`enum`/`protocol`/`extension` 与
    `func`/`init`/`typealias`；extension 只作为方法归属范围，不重复产出
    类型符号；`class func` 不被误判为类型。
  - Scala：`class`/`case class`/`trait`/`object`/`enum` 与 `def`
    （含 `private[acme]` 作用域与非 public 标记）。
- `src/deps.js`：
  - Ruby：`require`/`require_relative`/`load`，`require_relative` 与
    `./` 前缀标记为本地候选。
  - Swift：模块级 `import`（`@testable`、子模块、`import struct X.Y`），
    `relative=false`（不建文件边）。
  - Scala：分组 `{A, B => C, _}`、`as` 别名、`._`/`.*` 通配展开为叶子
    路径。
- `src/indexer.js`：Ruby `require_relative` 按引用方目录解析
  `.rb`/`index.rb`；Scala 复用点分路径索引（`.scala`）；Swift 明确返回
  null（不猜测本地目标）。
- `src/stack.js`：Gemfile（gem + 版本约束）、Package.swift（仓库名归一 +
  项目名）、build.sbt（`"group" %% "artifact" % "version"`，artifact 精确 +
  groupId 前缀兜底）三套识别表与生态标签（bundler/swiftpm/sbt）。
- `src/prompts.js`：三种语言的源码围栏标识。
- 兼容矩阵与 README 同步语言表；新增已知限制（Ruby heredoc 块边界、
  Scala 3 缩进语法）。

## 验证（本地全量）

- `npm test`：305/305 通过（新增 Ruby/Swift/Scala 的符号、依赖、技术栈、
  端到端索引用例，并替换两处把 ruby 当作“未知语言”的旧断言）。
- `npm run coverage:check`：行 97.77%、分支 86.53%、函数 93.88%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- Swift 只登记 import、不建文件边：Swift 的 import 是模块/目标语义，
  从文件路径反推目标会制造假边；宁缺勿假（与“无法解析不建边”一致）。
- `Package.swift` 归入清单而非源码：它的价值是依赖与包名；作为源码
  只会产出无意义的 `let package` 变量符号。
- Ruby module 映射为 `type`：与 class 区分命名空间容器语义，检索时仍可
  按名字命中。
- Scala 复用点分路径解析而不是新建索引结构：与 Java/C#/Kotlin 同一套
  后缀匹配，减少分支与维护面。

## 遗留 / 下一步

- 面板 Wiki 多章节 chips（当前只跳首个被引章节）。
- 目录级并行索引（大仓库吞吐）；Ruby heredoc 块边界精度。
- 提交/推送与版本 tag 由用户确认后执行。
