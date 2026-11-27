## 2026-11-27 决策：选择性吸收 Qoder Repo Wiki 的可溯源与模块层级

- 背景：用户提供了 Qoder 为另一项目生成的 Repo Wiki（`.qoder/repowiki`）
  作为参考。其形态为两层：
  - `knowledge/<locale>/<模块树>/`：每模块一个 `_module.yaml`（module_path、
    scope、depends_on、related_to、五类卡片索引）+ 五类卡片
    （overview / architecture_design / coding_conventions / tech_stack /
    unique_setup_and_commands），另有 `_index.yaml` 汇总模块树；
  - `content/<locale>/`：按主题分层的 Wiki 正文，带 `<cite>` 引用文件块、
    目录、mermaid 图与每节"章节来源"（文件 + 行号）；
  - `meta/repowiki-metadata.json`：目录/条目/关系的数据库式元数据。
  当前实现是"按文件扁平卡片 + 扁平 Wiki 页"，缺模块层级与可溯源引用。

- 选项 A：保持现状。改动最小，但生成的文档不可溯源，模块关系只能靠正文猜。
- 选项 B：完整照搬 Qoder（YAML 清单、模块级五类卡、UUID/关系元数据、
  分层 content 目录）。形态最接近，但需要引入 YAML 解析（违背零运行时依赖）、
  重建卡片粒度（文件 → 模块）、迁移既有资产，且 UUID/数据库元数据不适合
  随 Git 共享的本地文件模型。
- 选项 C（选择）：选择性吸收。保留"按文件卡片 + JSON 资产"的数据模型，
  吸收三项高价值、低风险的部分：
  1. **模块树**：索引文件条目增加 `module`（目录层级，深度上限 2），索引增加
     `modules[]`（path/parent/files/symbols，直属计数）；`repowiki-cards`
     增加 `module` 过滤与 `modules` 输出；`repowiki-extract` 额外写
     `knowledge/<locale>/_index.json`（模块 → 卡片清单，派生视图，JSON）。
  2. **可溯源引用**：卡片正文用双语源文件行 + 索引符号行号；Wiki 页面自动
     生成页级引用块、目录与每节"章节来源"，引用值统一为"相对路径 + 可选
     `#Lx-Ly`"（本机绝对 `file:///` 链接会随迁移失效，不采用）。
  3. **面板分组**：卡片页签增加"按模块分组"开关，按目录标题分组渲染；
     新索引读 `module`，旧索引按路径实时推导，兼容既有语料。

- 理由：在不破坏既有资产契约（`schemaVersion` 不变、旧索引可读）与零运行时
  依赖的前提下，拿到 Qoder 形态中真正影响可用性的能力：模块可导航、结论
  可溯源。YAML/UUID/五类模块卡属于其产品实现细节，不是本插件当前需要。

- 引用净化：Wiki 的 `sources` 来自 LLM 输出，写入前按"卡片/索引路径白名单 +
  合法 `#Lx-Ly` 形态"过滤（`sanitizeSources`），未知路径、穿越路径与任意
  Markdown 注入均被丢弃；行号不解析源码，只来自索引已提取的符号位置。

- 影响范围：`index.json` 为**增量新增字段**（`files[].module`、`modules[]`、
  `stats.modules`），`schemaVersion` 保持 2，旧读取方忽略即兼容；新增
  `knowledge/<locale>/_index.json`（读取方按 `.md` 枚举，不受影响）；卡片与
  Wiki 正文新增引用段落；面板新增一个开关。无数据迁移。

- 已知限制：模块深度上限 2；卡片仍是文件级（Qoder 为模块级五类卡）；
  引用行号来自符号提取而非任意代码行；中文/空格路径可被引用（Unicode
  白名单），但 LLM 未引用的文件不会出现在来源中。

- 回滚方案：删除新增字段与 `_index.json` 写入即可；旧资产无需转换。

### 增补（v0.50.0）：Wiki 清单 v2 与引用反查

- `wiki/<locale>/_index.json` 升到 schemaVersion 2：每页在页面级 `sources`
  之外增加 `sections: [{heading, sources}]`。`sources` 仍来自经
  `sanitizeSources` 白名单净化的章节引用，不引入新的 LLM 数据面。
- v1 清单仍可读：`src/wiki-references.js` 在缺少 `sections` 时只按页面级
  `sources` 反查，结果 `sections: []`，不伪造章节。
- 消费侧：`repowiki-cards wikiReferences=true` 返回
  `wikiReferences: [{path, slug, title, sections}]`（上限 100 条）；面板详情
  显示"被 Wiki 引用"。两者只读清单，不重读 Wiki 正文。
- 测试：`test/wiki-references.test.js`（章节级/页面级/v1 降级/截断）、
  `test/tools.test.js`（工具端到端）、`test/client-smoke.test.js`（面板）。
