# Phase 1 检查点

- 时间：2026-11-25
- 状态：代码、测试、安装激活完成；会话内工具调用待新会话验证

## 目标

按方案 §6.4 Phase 1：bundle 骨架 + 索引服务 + 只读检索工具，跑通
"宿主索引 → 写 cwd 资产 → 新会话工具读取"。

## 已完成

- Phase 0 探针（唯一前置门禁）：V1 ctx.fs、V2 spawn、V3 inject 键全部通过；
  plugin_manager 可用。
- 单 bundle `dsh-repowiki`：package.json / cordis.patch.yml / locale(en,zh) /
  icon.svg / index.js（apply + inject:['fs','tools']）。
- 索引链路：src/{schema,symbols,deps,stack,assets,indexer}.js，
  零依赖、零 LLM、fs 注入式纯函数。
- 两个模型工具：repowiki-index（重建索引）、repowiki-cards（检索，含
  无索引降级提示与 presentResult search 卡片）。
- 单元 + 集成测试：32/32 全绿（node:test，零依赖）。
- 文档：README、LICENSE、.gitignore、ADR-0001/0002、本检查点。

## 安装验证记录（运行时事实）

1. 首次 `install_bundle` **失败**：`JsonSchemaError ... required is not
   supported on type "string"` —— 手写 ToolDefinition 的 output.schema
   误用 parameters 的 per-property `required: true` DSL；正确形式是
   JsonSchemaNode 的顶层 `required: string[]` 数组。已修复两个工具的
   output.schema 并把教训写入 ADR-0002。
2. 修复后重新安装：**`application: "applied"`、零警告**，子代理侧确认
   插件 fiber 状态为 `active`、profile node_modules 含 repowiki。
3. **会话内工具调用未验证**：工具清单在会话启动时快照，本会话与验证
   子会话启动时插件尚未激活。需**新会话**（刷新页面或新开对话）调用
   repowiki-index / repowiki-cards 完成最后一步。

## 决策

- ADR-0001：零依赖符号解析器（用户批准，不引入外部解析框架）。
- ADR-0002：手写 ToolDefinition（零外部 import）。
- Phase 1 不声明插件 Config、无配置文件：全部行为由默认值 + 工具参数
  决定；wiki-plan.yaml 配置体系随 Phase 2 落地。
- Phase 1 只 insert 一个插件行（repowiki）；方案 §6.1 的四个插件条目
  随 Phase 2 拆分（届时再评估跨插件 ctx 服务 vs 包内 ES import）。

## 下一步

1. 新会话内调用 repowiki-index（索引本仓库自身）+ repowiki-cards
   （query='extract'）完成会话级验证。
2. git 初始化与首次提交（本检查点之后立即执行）。
3. Phase 2 立项：repowiki-extract（spawn 子代理 + outputSchema 提取
   卡片）、repowiki-generate（Wiki 凝练）、Config/wiki-plan.yaml 配置
   体系。
