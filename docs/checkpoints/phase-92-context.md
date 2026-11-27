# 检查点：任务上下文打包工具（phase-92）

- 日期：2026-11-27
- 合入版本：v0.117.0
- 目标：把一次编码任务所需的符号、源码、知识与静态关系一次取齐，减少代理
  反复调用检索工具和重读源码，同时用硬预算控制上下文成本。
- 状态：代码、集成测试、真实仓库冒烟与全量验证完成；未提交/推送。

## 交付

- 新增第 11 个工具 `repowiki-context`（`src/tool-context.js`）。
- 新增纯函数模块 `src/context.js`：
  - `contextTerms`：从自然语言任务中提取标识符/路径词，去重并过滤常见
    停用词与过短拉丁 token；中文任务可只走文档 BM25 路由。
  - `rankContextFiles`：显式 anchor 优先，其后是文档命中路径、精确符号
    定义、前缀/子串和路径匹配；歧义与未命中 anchor 分开报告。
  - `buildContextSnippets`：优先任务相关符号，附真实行号、前后文与每行
    前缀；重叠范围合并，长符号有行数上限；无可用符号时给出有界文件头。
  - `packContextPack`：默认 12,000、允许 2,000–40,000 字符；主文件默认
    8、最多 12。文件清单、源码、文档、关系分配预算，全文再作硬上限保护。
- 工具接线：索引读取、locale 内容优先回退、卡片/Wiki/已采信记忆 BM25、
  选中源码读取、直接 imports/dependents、相关循环与 fan-in。
- 输出：结构化 `files/snippets/documents/relations/cycles/hubs`、Markdown
  `text`、`budget/usedChars/truncated` 和
  `omitted.snippets/documents/relations`。
- 降级与诚实性：
  - 无索引、空查询、无源码命中均给出可操作 hint。
  - 文档标为生成知识，关系标为静态 import 证据，不宣称运行时真实性。
  - 单文件读取失败不拖垮整包，但会在 Caveats 列出 `Source unreadable`。
  - 最终硬截断若切掉某个段，会把对应省略类别计为非零，避免 omitted=0
    造成"内容完整"的错觉。
- `index.js`、插件测试、双 locale 元数据与工具清单同步至 11 个工具。

## 测试

`test/context.test.js` 6 个用例覆盖：任务词提取、排序与中文文档路由、
长符号截断与重叠合并、2000 字小预算硬上限及三类省略、真实索引+中文卡片
路由+源码+关系、无索引/空查询/无命中/不可读源码/关闭源码与文档等降级。

真实仓库冒烟：`optimize computeSymbolImpact` 加 `src/impact.js` anchor，
在 4000 字预算内返回目标文件与 2 个带行号源码片段，未截断。

## 取舍

- 预算是字符而非 token：无需引入模型相关 tokenizer，契约可复现。
- 预算是上限而非填充目标；没有信息价值的空间不补废话。
- 不做隐式全库读取：只读最终选中的有界文件集合。
