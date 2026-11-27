# Runbook：Repo Wiki 故障排查

先跑只读诊断（任意会话）：

```
repowiki-status          # 索引/卡片/Wiki/记忆/plan/锁 一览
```

## 症状 → 检查 → 处理

| 症状 | 检查 | 处理 |
|---|---|---|
| 面板显示“尚未生成知识库” | `status.index.exists=false` | 先 `repowiki-index`，再 `repowiki-extract` |
| 面板一直“读取失败: workspace-file/not-found” | 该工作区没有会话，或 `.dsh-repowiki/` 不在工作区根 | 在该工作区打开一次会话；确认资产目录位置 |
| 索引存在但工具提示不兼容 | `status.index.compatible=false` | `repowiki-index` 重建（v2 会自动升级到 v3） |
| 卡片“待更新”很多 | `status.cards.stale` | 重新 `repowiki-extract`；人工卡受 `manuallyEdited` 保护 |
| 卡片“孤儿” | `status.cards.orphaned` | 源文件已删除/重命名；确认后可人工删除对应卡片 |
| Wiki 页顺序错乱/缺页 | `status.wiki.manifest=false` | `repowiki-generate` 重写 `wiki/<locale>/_index.json` |
| Wiki 页“待更新” | `status.wiki.stale > 0` | 重新 `repowiki-generate` |
| 生成动作长时间无响应 | `status.lock.pending > 0` | 同一资产根有写工具在跑；等待或取消该会话后重试 |
| 生成报 “without pages/without a usable card” | 子代理输出未过 schema | 重试；持续失败时缩小 `paths`/`maxCards` 并查看会话错误 |
| 子代理成本过高 | — | 设置 `repowiki-plan.json` 的 `exclude`/`maxCardsPerRun`/`cardComplexityThreshold` |
| 面板点击无反应 | DevTools Console 红错 | 面板有 `ErrorBoundary` 与 `role=status` 失败行；把错误文本反馈 |
| Wiki 页签提示失败页/缺页/路径非法/卡片或记忆陈旧 | 面板诊断行 | 上次生成有页面写失败、清单页被删除、清单路径非法，或生成后卡片/已采信记忆已变化；重新 `repowiki-generate`，再用 `verify:wiki --strict` 复核 |
| 升级 dsh 后样式/功能异常 | `npm run verify:host` | 令牌漂移按输出修正；跑 `npm test` 回归 |
| CI 提示 Wiki 引用失败 | `npm run verify:wiki -- --json` | 断链/越界/漂移按报告修引用或重新 `repowiki-generate`；未覆盖可 `--strict` 收紧 |
| CI 提示 Wiki 陈旧（`stale`） | `npm run verify:wiki -- --json` 的 `locales[].stale`/`staleReasons` | 卡片或已采信记忆在生成后变化；重新 `repowiki-generate`（必要时 `force=true`）。旧清单缺指纹默认只告警、`--strict` 失败，重建一次即可纳入检测 |
| CI 提示清单页缺失 | `verify:wiki` 的 `missingPages` 或 `status.wiki.missing` | 页面文件被删除或写入失败；重新 `repowiki-generate`。未入清单的孤儿页只告警，可保留手工页或清理 |
| CI 提示清单为空 | `verify:wiki` 的 `manifest/empty` | 生成没有产出页面（模型失败或卡片为空）；修复后重新 `repowiki-generate`。默认仅告警，`--strict`/`--require` 下失败 |
| CI 提示上次生成失败页 | `verify:wiki` 的 `wiki/generation-failed` 或 `status.wiki.failed` | 上次生成有页面写失败（清单 `failed`，最多 10 条明细）；检查磁盘权限/空间后重新 `repowiki-generate`。默认仅告警，`--strict` 下失败 |
| CI 提示索引过旧 | `verify:wiki` 的 `index/outdated` | `index.json` 早于 schema v6（没有行数），行号越界检查不完整；重新 `repowiki-index`。默认仅告警，`--strict` 下失败 |
| CI 提示内部死链/路径非法 | `verify:wiki` 的 `wiki/broken-link`、`wiki/unsafe-link`、`wiki/invalid-page-path`、`wiki/page-path-mismatch` | 页面正文的相对 `.md` 链接指向不存在的文件或越出项目根，或清单 `path` 不在 `wiki/<locale>/` 下/与文件位置不符；修正链接或重新 `repowiki-generate` |
| CI 漏跑生成却通过 | — | 在门禁命令加 `--require`：没有 Wiki 清单或清单为空直接失败，而不是带警告通过 |

## 常用命令

```sh
npm run verify:host      # 主题令牌漂移
npm run verify:wiki      # Wiki 断链/越界/漂移/陈旧/页面完整性/链接与路径/空清单/旧索引/覆盖率门禁（CI 加 --require）
npm test                 # 全量回归
npm run coverage:check   # 覆盖率门禁
npm run scan:secrets     # 密钥扫描
```

## 资产手工检查

```sh
cat .dsh-repowiki/index.json | head -40          # schemaVersion / stats / modules
cat .dsh-repowiki/wiki/zh/_index.json            # Wiki 清单（顺序/模块/inputDigest）
cat .dsh-repowiki/knowledge/zh/_index.json       # 模块 → 卡片清单
```

## 回滚

- 插件版本回滚：重新安装上一版本目录，刷新 GUI。
- 资产回滚：`repowiki-import` 从快照恢复；导入默认保护现有资产，需 `overwrite=true` 才合并。
