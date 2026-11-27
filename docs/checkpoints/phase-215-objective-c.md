# 检查点：Objective-C 支持（phase-215）

- 日期：2026-11-28
- 合入版本：v0.239.0
- 目标：索引覆盖 iOS/macOS 主流的 Objective-C/Objective-C++ 代码。`.h` 与
  `.m` 分别与 C 头文件、MATLAB 脚本共用扩展名，直接按扩展名归类会产生
  错误语言标签；本轮用内容识别解决冲突，同时保证含 `@interface` 的头文件
  不会丢失原有 C 结构体/函数符号。
- 状态：代码、测试、双语文档、覆盖率报告与检查点更新；全量门禁通过。

## 交付

- `src/schema.js`：`.m`/`.mm` → `objc`（第 42 种语言）。
- `src/symbols.js`：
  - `objcScan`（导出）：`//`、`/* */`、`"` 字符串与 `'` 字符字面量双视图
    屏蔽；
  - `extractObjcDecls`：
    - `@interface`/`@implementation` 为 class，按 `@end` 收尾；类扩展
      `@interface Foo ()` 内成员非导出，category 归到所属类名；
    - `@protocol` 为 interface（`@protocol Foo;` 前向声明跳过）；
    - `-`/`+` 方法：选择器按冒号段拼接（`insert:at:`），原型止于 `;`，
      实现按花括号配平；方法归属当前容器；
    - `@property`：普通与 block（`(^name)`）属性记为 variable；
    - 未闭合容器保守延伸到文件尾；
  - `extractObjc`：与 `extractCpp` 结果合并、按行序去重，`.h`/`.m`/`.mm`
    共用入口，C/C++ 声明不丢失。
- `src/deps.js`：`extractObjcImports` 提取 `#import`/`#include`（引号形式
  relative）；`@import` 与注释/字符串中的伪引用不建边。
- `src/indexer.js`：
  - `isObjCSource`：含 `@interface`/`@implementation`/`@protocol`/`@class`/
    `@property` 的 `.h` 改判为 `objc`；
  - `isMatlabSource`：`function`/`classdef` 或行首 `%` 的 `.m` 归为
    `matlab`（不提取符号，避免误标）；
  - `resolveImportEdge` 对 `objc` 复用 `resolveCppInclude`（引用方目录 +
    `include`/`src`/`inc` 根；尖括号框架头不命中）；
  - `CPP_SOURCE_EXTS` 纳入 `.m`/`.mm`，include 根识别覆盖纯 ObjC 布局。
- `src/prompts.js` / `client.js`：围栏语言 `objectivec`，面板标签
  `Objective-C`（另加 `MATLAB` 展示名）。
- 测试：`test/symbols.test.js` 2 例、`test/deps.test.js` 1 例、
  `test/indexer.test.js` 1 例（`.h` 改判、MATLAB `.m`、ObjC/ObjC++ 边）。
- 文档：README 双语（阶段行、索引工具行、架构说明、版本列表）、CHANGELOG
  双语、`docs/compatibility.md`（语言矩阵 + 已知限制）、`docs/coverage.md`。

## 语义边界

- `.m` 没有 Objective-C 标记也没有 MATLAB 标记时保持扩展名主语义
  （objc）；Mathematica 等其他 `.m` 方言不会被正确分类（已知限制）。
- `@class Foo;` 前向声明、`NS_ENUM`/`NS_OPTIONS` 宏、`@synthesize` 不登记；
  ivar 不登记（ivar 不是 API）。
- 方法选择器按行内冒号段拼接；返回类型含嵌套括号（如返回 block 类型）
  时可能识别失败（轻量解析限制）。
- 类扩展成员标记非导出；category 成员保持导出（category 通常是公开 API）。
- `#import` 解析与 C/C++ 共用 include 根；CocoaPods/Carthage 目录不额外
  建根，外部框架头不建边。

## 验证

- `LANG=en npm test`：760/760
- `LANG=zh_CN.UTF-8 npm test`：760/760
- `npm run coverage:check`：行 98.06%、分支 87.86%、函数 95.86%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
