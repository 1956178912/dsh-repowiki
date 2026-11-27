# 检查点：8 语言覆盖 v0.51.0（phase-23）

- 日期：2026-11-27
- 目标：在 JS/TS、Python、Go、Rust、Java 之外补齐 C#、Kotlin、PHP
  的符号与本地依赖边，并把 Composer 技术栈纳入识别。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

### 1. 符号提取

- `src/schema.js`：`EXTENSION_LANGS` 新增 cs/kt/php，受支持语言增至 8 种。
- `src/symbols.js`：
  - C#：class/interface/struct/record/enum、第一层方法与构造器；
  - Kotlin：class/data class/enum class/object/interface、fun、构造器，
    方法归属最近的嵌套类型范围；
  - PHP：class/interface/trait/enum、方法、顶层函数，可见性映射到
    `exported`。
- `src/prompts.js`：提取 prompt 为全部 8 种语言输出对应代码围栏标识。

### 2. 依赖边

- `src/deps.js`：C# `using`（global/static/别名）、Kotlin `import`
  （含 `.*` 与 `as`）、PHP `use`（分组/function/const/别名）与字面量
  `require`/`include`（含 `__DIR__ . '/x.php'`）。
- `src/indexer.js`：新增点分路径索引与解析器——
  - C#/Kotlin 大小写敏感，PHP 小写归一；
  - 精确匹配 → 简单名后缀 → 命名空间/包前缀 → 逐段回退；
  - PHP require 按引用方目录解析相对文件。
- 边继续携带 `line`（schema v5），行号级反引用对新语言同样可用。

### 3. 技术栈

- `src/stack.js`：`composer.json` 解析 require/require-dev，映射 Laravel、
  Symfony、PHPUnit、Doctrine、Guzzle 等，包名前缀兜底，计入
  `dependencyCounts.composer`。

## 验证（本地全量）

- `npm test`：283/283 通过。
- `npm run coverage:check`：行 97.59%、分支 86.0%、函数 93.48%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- 手工真实临时项目验证：PHP `use`/`__DIR__` require、C# `using`、
  Kotlin `import` 均产生正确边与行号；Composer 识别 Laravel。

## 关键决策与取舍

- 不解析完整命名空间/项目文件：C#/Kotlin/PHP 使用点分路径后缀/前缀
  启发式匹配；无法解析的外部 import 不建边，避免猜测。
- PHP 大小写不敏感匹配：适配 PSR-4 中 `app/` 目录与 `App\` 命名空间的
  常见差异；只在 PHP 索引上启用，不影响其它语言。
- 单行类体成员不提取：轻量行级解析的已知限制，写入兼容矩阵；多行类体
  覆盖主流代码形态。

## 遗留 / 下一步

- v0.52 候选：Ruby/Swift/Scala 扩展、目录级并行索引、面板 Wiki 引用
  点击跳转。
- 浏览器侧视觉冒烟按 phase-15 清单人工确认。
- 提交/推送与版本 tag 由用户确认后执行。
