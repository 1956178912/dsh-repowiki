# 检查点：陈旧 Wiki 门禁（phase-115）

- 日期：2026-11-27
- 合入版本：v0.139.0
- 目标：`verify:wiki` 已能发现断链、越界与引用内容漂移，但**卡片本身**
  在生成后发生变化时，只要引用路径仍存在，门禁仍会通过，Wiki 内容可能
  整体过期。本轮把"生成输入是否变化"纳入门禁。
- 状态：代码、测试、双语全量门禁完成；已提交并推送。

## 交付

- `scripts/verify-wiki.mjs`：
  - 新增 `readCards(root, locale)`：读取 `knowledge/<locale>/*.md`，
    `parseCard` 后按 `meta.path` 建映射；单张坏卡跳过，不阻断门禁。
  - 新增 `cardsDigest(cards)`：按 `path:sourceDigest` 排序后 `digestText(…,16)`，
    与 `repowiki-generate` 写清单时的 `inputDigest` 完全同口径。
  - `verifyLocale` 重算当前 `inputDigest`：与清单不一致时默认写入
    `issues`（"wiki is stale: cards changed since generation"）；
    清单无 `inputDigest`（旧版本资产）时只告警并跳过，避免阻塞升级。
  - locale 结果新增 `stale`（`true`/`false`/`null`）；文本报告在 locale
    行尾追加 ` (stale)`，`--json` 直接输出该字段。
- `test/verify-wiki.test.js`：新增“卡片变化导致 Wiki 陈旧”用例，覆盖
  通过 → 改卡片 `sourceDigest` → 失败的三段断言。
- 双语文档、覆盖率报告、Runbook 同步。

## 测试

- `node --test test/verify-wiki.test.js`：8/8。
- 全量 500 例通过（LANG=en、LANG=zh_CN.UTF-8）。
- CLI 退出码实测：正常 0、陈旧/断链 1、参数错误 2。

## 语义边界

- 只比较卡片 `path` 与 `sourceDigest` 集合，不读取源码、不调用模型；
  与 generate 的短路判定使用同一输入指纹，因此不会出现"generate 认为
  需要重跑、verify 认为新鲜"的口径分裂。
- 卡片 `sourceDigest` 缺失时按空串参与哈希：与 generate 的行为一致。
- 旧清单无 `inputDigest` 时 `stale=null`，只告警一次；重新生成后自动
  纳入检测。
- 该检查与引用漂移互补：`inputDigest` 抓"卡片集合变了"，`citationDigests`
  抓"卡片没变但被引用的源码行变了"。
- 本仓库 `.dsh-repowiki/wiki/zh` 仅有页面缺 `_index.json` 时仍失败，
  这是既有语义（资产不完整），需要先运行 `repowiki-generate`。

## 验证

- `LANG=en npm test` / `LANG=zh_CN.UTF-8 npm test`：500/500。
- `npm run coverage:check`：行 98.09%、分支 86.29%、函数 95.16%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不新增清单字段：直接复用 `inputDigest`，旧资产无需迁移。
- 陈旧时默认失败而非警告：CI 的核心价值是阻止过期文档进入主干；
  legacy 清单单独放行，兼顾兼容。
- 不做逐卡片陈旧明细：status 已提供 `cards.stale` 明细，门禁只需
  一个布尔与一句可行动的修复提示。

## 遗留 / 下一步

- GitHub Actions 示例（生成后运行 `verify:wiki`，陈旧即失败）。
- 清单记录生成器版本，便于区分"卡片变化"与"生成规则升级"导致的差异。
