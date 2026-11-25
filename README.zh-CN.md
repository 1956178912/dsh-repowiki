# dsh-repowiki

**仓库符号级知识索引 + 跨会话检索** —— 一个 DeepSeek Harness (DSH) 本地插件 bundle。

把当前仓库索引为符号级知识库 `.dsh-repowiki/`（随 Git 共享），任意会话打开同一目录即可查询符号、文件与依赖关系，无需重读源码。

[中文](README.zh-CN.md) | English（见 [README.md](README.md)）

> 设计依据：仓库 Wiki / 知识卡片功能移植方案的内部评审记录（评审文档本身不包含在本仓库中）。硬约束：零第三方 dsh 插件依赖，全部能力来自 dsh 官方机制。

## 当前阶段：Phase 1

| 能力 | 说明 |
|---|---|
| `repowiki-index` 工具 | 确定性（零 LLM）重建索引：符号表、import 依赖边、技术栈识别，写入 `.dsh-repowiki/index.json` |
| `repowiki-cards` 工具 | 跨会话只读检索：按符号名 / 种类 / 路径过滤，返回文件+符号与项目技术栈 |

后续阶段（见路线图）：
- Phase 2：`repowiki-extract`（spawn 子代理提取卡片）+ `repowiki-generate`（Wiki 凝练）
- Phase 3：commit/diff 增量更新、导入导出、人工修订
- Phase 4：会话记忆提炼、可选语义索引、可选 UI 触发

## 架构要点

- **单 bundle、单插件条目、零 npm 运行时依赖、零构建工具**：纯 ES Module，手写 `ToolDefinition`（不 import `@deepseek-ai/dsh-tools`），安装目录即可运行。
- **资产即文件**：索引写入 `<项目根>/.dsh-repowiki/index.json`，随 Git 共享；定位策略为"当前目录向上查找，退回当前目录"。
- **全部文件 IO 走 `ctx.fs`**（方案 §9.1），不经裸 node fs，保持策略一致性。
- **`inject: ['fs', 'tools']`**：`ctx.fs` 为可选能力 seam，缺失时插件在该 profile 不激活而非抛错。
- **符号提取为零依赖轻量解析**（ADR-0001），不引入外部解析框架：JS/TS/Python 的函数/类/方法/接口/类型/导入。

## 安装

```
DSH Plugins > Add plugin > 选择本目录
```

或用 `plugin_manager` 的 `install_bundle`，target 为本目录绝对路径。安装影响该 profile 的所有会话。

## 开发与测试

```sh
# 单元测试（node 内置 test runner，零依赖）
node --test test/*.test.js
```

## 升级运维约定（dsh 处于 rc 阶段，公开 seam 高频变动）

- 本 bundle **不声明** `@deepseek-ai/dsh-*` 依赖（shipped packages 从 dsh 安装目录解析）——代价是**每次 dsh 升级都必须回归**：跑一遍 `node --test test/*.test.js`，并在会话里执行 `repowiki-index` 与 `repowiki-cards` 的最小冒烟。
- `engines.dsh` 只作版本下界，不是兼容性证明。
- `index.json` 带 `schemaVersion`；版本不兼容时读取侧降级提示重建而非崩溃。

## 目录结构

```
index.js               插件入口（apply + inject）
cordis.patch.yml       Loader patch（插入插件行）
src/schema.js          常量与领域约定（单一来源）
src/symbols.js         零依赖符号提取（JS/TS/Python）
src/deps.js            import/require 依赖边提取
src/stack.js           技术栈识别（npm/pip/go/cargo）
src/assets.js          资产定位与读写（ctx.fs 注入）
src/indexer.js         索引编排（遍历+提取+边解析+组装）
src/tool-index.js      repowiki-index 工具
src/tool-cards.js      repowiki-cards 工具
test/                  单元与集成测试（32 用例）
docs/adr/              架构决策记录（英文默认 + .zh 中文）
docs/checkpoints/      阶段检查点（英文默认 + .zh 中文）
```

## 许可

MIT（见 [LICENSE](LICENSE)）。
