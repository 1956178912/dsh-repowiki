# 检查点：不可信索引路径加固（phase-146）

- 日期：2026-11-28
- 合入版本：v0.170.0
- 目标：`index.json` 属于随 Git 传播的资产，也是 LLM 与人工都可能改写的
  文件。此前 `repowiki-context` / `repowiki-extract` / `repowiki-impact`
  直接按 `files[].path` 读取源码：一个恶意提交写入 `../../.ssh/id_rsa`
  或绝对路径，就能让工具读取项目外文件并把内容送进模型上下文。威胁模型
  已把“仓库文件路径”列为不可信输入，但索引读取链路缺少统一防线。
- 状态：代码、测试、双语文档、SECURITY 与检查点更新；待全量门禁与提交。

## 交付

- `src/util.js`：新增 `projectRelativePath(value)`——去空白、反斜杠转
  正斜杠、`posix.normalize`，拒绝空值、`.`、`..`/`../*`、绝对路径与
  盘符；合法值返回归一后的相对路径。快照导入的
  `normalizeManifestPath` 改为复用它（同一规则、单一实现）。
- `src/assets.js` `readIndex`：
  - `files` 统一规范为数组；逐条校验 `path`，非法/越界条目丢弃，
    合法条目就地归一（`./src//a.ts` → `src/a.ts`）。
  - `edges` 只保留两端都仍在文件集合中的边（悬空边与指向被弃文件的边
    一并清理）。
  - 仅在确有丢弃时写入 `doc.untrusted = {files, edges, paths}`（paths
    最多 5 条原始值），正常索引不新增字段。
  - 版本兼容层（v2/v3 补模块树、语言分布）改用净化后的文件列表。
- `src/tool-status.js`：索引带 `untrusted` 时追加一条告警
  （`N index file path(s) and M edge(s) were invalid or outside the
  project and were ignored.`），随既有 warnings 进入结构化输出与文本报告。
- 测试：
  - `test/util.test.js`：合法归一（空白、反斜杠、重复斜杠）与拒绝
    （`..`、绝对、盘符、空、非字符串）。
  - `test/assets.test.js`：写入含 `../outside.ts`、`/etc/passwd` 的索引，
    断言只保留安全文件、悬空边被清理、`untrusted` 计数与路径；正常索引
    无 `untrusted` 字段。
  - `test/status.test.js`：手写含越界路径的索引，断言告警文本出现在
    结构化 warnings 与渲染输出中（同时证明越界文件不再计入统计读取）。

## 语义边界

- 只净化“索引文件里的路径”，不改变索引写盘内容：`repowiki-index` 仍写入
  真实扫描结果；被篡改的索引在读取侧被降级，而不是自动修复磁盘文件。
- `stats.files/symbols/edges` 保留索引原值，不做重算：`untrusted` 明确
  给出差量，状态告警负责解释，避免静默改写用户资产。
- 边丢弃可能包含“合法但目标文件被丢弃”的情形（例如目标路径非法），
  计数统一归入 `untrusted.edges`，提示语覆盖 invalid/outside 两种原因。
- Wiki 引用路径此前已有独立防线（`tool-status` 文件系统探测、`citation-
  drift`、`verify:wiki` 均跳过绝对与 `..`），本次不重复改造；卡片/页面
  路径来自 `listDir` 构造，天然落在资产目录内。
- 面板读取原始索引仅用于展示，不读取源码文件；打开文件动作由宿主
  策略约束，不在插件内扩大权限。

## 验证

- `LANG=en node --test test/util.test.js test/assets.test.js test/status.test.js`：
  43/43 通过。
- 全量门禁：`npm test`（双语言 544/544）、`coverage:check`（行 98.03 /
  分支 86.51 / 函数 95.38）、`typecheck`、`lint`、`scan:secrets`、
  `verify:host`、`git diff --check`。
