# 检查点：Host 侧独立代码评审与应修项落地（v0.32.0）

- 日期：2026-11-27
- 目标：UX 侧已过独立评审（phase-14），Host 侧（8 工具 + 索引/传输/记忆，
  约 3700 行）从未被独立代码评审——测试按设计抓不到的问题（并发/取消/
  安全/契约）需第二双眼睛。
- 状态：完成，已推送，CI 绿。

## 评审过程

- 评审人：subagent `agent-2`（独立上下文，无项目历史）。
- 输入：23 个 Host 侧文件清单 + 项目约束（零依赖、ctx.fs、spawn 契约）。
- 要求：重点找测试抓不到的问题（并发/竞态、取消语义、错误吞咽、边界、
  安全、数据一致性、API 契约），禁风格偏好。
- 结论：架构清晰；问题集中在三类——LLM 输出未净化的路径拼接、声明与
  实现不一致的 output schema（hint）、取消语义只传不用。

## 六项应修（逐个独立核实后修复，均带回归测试）

| # | 问题 | 修复 | 回归 |
|---|---|---|---|
| F1 | Wiki slug 来自 LLM 输出直接拼路径（可写资产目录外） | `wikiSlug()` 在 `wikiPath` 内强制净化 + schema pattern | `test/knowledge.test.js`：穿越尝试落盘仍在 wiki/zh/ 内 |
| F2 | 6 工具降级返回 `hint` 但 schema `additionalProperties:false` | 6 个 schema 各加可选 `hint` 字段 | 既有 hint 断言（tool-llm:207）仍过 |
| F3 | extract 取消/超时后继续派发子代理并逐个记 failed | 循环前查 `exec.signal.aborted`，返回 Cancelled hint | `test/tool-llm.test.js`：预 abort 的 exec |
| F4 | 预算对非源码文件计数但 capped 按源码数判定 → 谎报完整 | walk 显式 stopped 标志，capped 求真 | `test/indexer.test.js`：150 md + 10 源码，maxFiles 100 |
| F5 | import 的 overwrite 实为合并、描述写成 replace | 描述改为如实（无行为变更） | 描述文本核对 |
| F6 | memory accept/reject 的 slug 无白名单（目录外改写原语） | `/^[A-Za-z0-9._-]{1,96}$/` 校验，不符返回 invalid+hint | `test/tools.test.js`：穿越 slug 被拒 |

## 观察项处理

- O1 copyTree 深度上限 24（防超深树/环栈溢出）✓
- O2 复制失败原因丢失（skipped 计数）——延后：需 output schema 加 bounded
  failed 列表，独立小迭代
- O3 TOCTOU/半成品状态——观察：export 半途中断留部分快照，无回滚（与
  纯文件复制设计自洽，文档已说明）
- O4 sizeBytes 语义——注释更正为字符数（字段名保留，兼容既有语料）✓
- O5 并发无保护——观察：单会话顺序调用假设下可接受
- O6 maxFiles/limit 下界钳制 ✓
- O7 cardSlug 碰撞——延后：低频，需 8 位内容哈希后缀
- O8 提取 prompt 四反引号围栏 ✓
- O9 listKnowledgeFiles 死代码删除 ✓（writeIndex 未用变量同删）

## 验证

- `npm test` 138/138（135 基线 -1 死代码用例 +4 新回归）；覆盖率 96.07%；
- CI success；plugin_manager `include:repowiki` 重激活零警告。

## 遗留（下次迭代或观察）

- O2/O7（延后理由如上）；浏览器侧六项渲染验证（phase-15 清单）。
