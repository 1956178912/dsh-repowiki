# 检查点：Groovy 支持（phase-193）

- 日期：2026-11-28
- 合入版本：v0.217.0
- 目标：JVM 生态里 Groovy 仍广泛用于 Gradle 构建脚本与 Jenkins 流水线，
  但此前索引只覆盖 `.java`。补上 Groovy 后，构建脚本与 Spock/Spock 测试
  中的类、方法、脚本函数可被检索，`import` 也能与 Java 源码互通。
- 状态：代码、测试、双语文档、兼容矩阵、覆盖率报告与检查点更新；全量
  门禁通过。

## 交付

- `src/schema.js`：`groovy: 'groovy'` 扩展名映射。
- `src/prompts.js`：`fenceLang('groovy')` → `groovy`。
- `client.js`：`LANGUAGE_LABELS` 增加 `Groovy`。
- `src/symbols.js`：
  - `groovyScan`：`//` 行注释截断、`/* … */` 块注释、单/双引号与
    `'''`/`"""` 三引号字符串（含跨行与插值文本）替换为空格；
  - `extractGroovy`：顶层 `class`/`interface`/`trait`/`enum`（容忍注解
    与修饰符）登记为 class，类内第一层方法（含构造器）登记为 method
    并带 `parent`，顶层 `def name(...)`（Gradle/Jenkinsfile 风格）登记
    为 function；`private`/`protected` 标记非导出；`GROOVY_KEYWORDS`
    阻止 `if`/`for`/`println` 等被误识别为方法。
- `src/deps.js`：`extractGroovyImports` 提取 `import a.b.C` 与
  `import static a.b.C.member`（去掉末段成员，边落到定义文件）；掩码
  视图屏蔽注释/字符串中的伪 import。
- `src/indexer.js`：`dottedPaths.groovy` 与 Java 共享点分路径索引
  （`['.groovy', '.java']`），resolver 分支复用 `resolveDottedSpecifier`。
- 测试：
  - `test/symbols.test.js`：类/trait/方法/脚本函数、可见性、字符串与
    注释屏蔽；
  - `test/deps.test.js`：普通 import 与 static import；
  - `test/indexer.test.js`：Groovy→Java 点分 import 解析。

## 语义边界

- 轻量行级解析：只登记顶层类型与类内第一层方法；嵌套类、闭包体内方法
  不登记；多行方法头按首行确定范围起点。
- GString `${…}` 随字符串一起屏蔽，不参与花括号配平。
- `import a.b.*` 通配与外部包不建边；`import static` 只去掉最后一段，
  其余点分路径照常后缀匹配。

## 验证

- `LANG=en npm test`：635/635
- `LANG=zh_CN.UTF-8 npm test`：635/635
- `npm run coverage:check`：行 98.01%、分支约 87.6%、函数 95.74%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
