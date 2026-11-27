# 检查点：引用内容漂移（phase-104）

- 日期：2026-11-27
- 合入版本：v0.128.0
- 目标：路径存在、行号在范围内，并不代表被引用的代码没变。本轮让 Wiki
  清单记录每条引用的内容指纹，状态工具重算并报告"文件还在、内容已变"。
- 状态：代码、纯函数测试、生成/状态集成、全量门禁完成；已提交并推送。

## 交付

- 新增纯函数模块 `src/citation-digest.js`：
  - `citationLineSlice(text, start, end)`：1-based 闭区间切片；空文件、
    非法范围返回 null；行数语义与 `countSourceLines` 一致（结尾换行不
    额外产生一行）；
  - `citationDigest(text, start, end)`：带行号用切片，无行号用全文，
    sha256-12。
- `src/tool-generate.js`：
  - 清单 schema 升至 v3，每页新增 `citationDigests`（原始 source 字符串 →
    指纹）；
  - 生成前按与写入相同的白名单（`sanitizeSources`）净化引用，再在写锁外
    读取被引用文件（每轮上限 200 个文件，路径缓存），避免把 IO 拖进临界区；
  - 读取失败或范围非法不写指纹（后续按 unchecked 处理）。
- `src/tool-status.js`：
  - 读取清单 v3 的 `citationDigests`，按路径缓存重读源码（上限 100 个
    文件、最多比较 500 条），重算指纹并比较；
  - 输出 `citationDrift`（total/checked/unchecked/pages/truncated），
    页面明细 10 × 10 有界；变化时追加告警；
  - 文本新增 `Citation drift` 行：一致时 `(none; N verified)`，变化时给出
    示例页面与引用；无指纹的 v1/v2 清单不输出该字段/行。
- 双语文档、locale 元数据同步。

## 测试

- `test/citation-digest.test.js`：切片边界（结尾换行、空文件、倒置、
  越界）、范围/整文件指纹。
- `test/tool-llm.test.js`：模块页生成断言清单 v3、`a.ts`/`b.ts` 均有
  12 位十六进制指纹。
- `test/status.test.js`：一致指纹 + 错误指纹 + 缺失文件 → total 1 /
  checked 2 / unchecked 1，渲染与告警断言；旧 v2 清单不产生漂移字段。

## 语义边界

- 指纹只证明"被引用行的文本变化"，不判断变化是否语义相关；格式化也会
  触发漂移。
- 引用路径来自清单，读取前再次拒绝绝对路径与 `..`；生成侧只读取白名单内
  的卡片源文件。
- 读取失败、范围非法、超过读取/比较上限都计入 unchecked，绝不算作漂移。
- 旧清单（v1/v2）没有指纹，继续保持"不判定"。

## 验证

- `npm test`：474/474（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.19%、分支 86.37%、函数 95.12%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 生成时读取被引用文件：与"生成只读卡片"的旧声明有出入，但这是获得漂移
  检测能力的必要成本；读取有上限、在锁外，并已更新工具描述。
- 指纹粒度是行范围而非整文件（无行号时才整文件）：减少无关变化带来的
  噪声。
- 不把漂移自动写回页面或触发再生成：只报告，是否刷新由用户/代理决定。

## 遗留 / 下一步

- 面板可展示漂移徽章（需要清单 v3 与索引/源码读取能力）。
- 可在 `repowiki-generate` 的输出中报告本次写入的指纹数量，
  便于确认覆盖范围。
