# 检查点：status 路径非法计数（phase-128）

- 日期：2026-11-27
- 合入版本：v0.152.0
- 目标：`verify:wiki` 已校验清单页面路径（越界/绝对路径/非 `.md`/
  与文件位置不符），`repowiki-status` 仍只报 stale/failed/missing/
  orphaned；跑 status 无法发现路径非法。
- 状态：代码、测试、双语全量门禁完成；已提交并推送。

## 交付

- `src/tool-status.js`：
  - 由 `manifest.pages[].path` 与磁盘页面路径计算非法页：
    - 以 `/` 开头、含 `..`、不以 `wiki/<locale>/` 开头或不是 `.md`；
    - 或磁盘上存在同 slug 页面但路径与清单记录不一致。
  - 输出 `wiki.invalid` 与 `wiki.invalidPages`（最多 10 个 slug）。
  - 文本 `Wiki:` 行追加 `invalid N`；输出 schema 同步新增字段。
  - 不读取页面正文、不探测内部链接：status 保持轻量，链接问题由
    `verify:wiki` 负责。
- `test/status.test.js`：新增把清单路径改成 `../secret.md` 的用例，
  断言计数、slug 列表与文本。
- 双语文档、覆盖率报告同步。

## 测试

- `node --test test/status.test.js`：19/19。
- 全量 516 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 路径检查与 `verify:wiki` 的 `invalidPagePaths`/`pagePathMismatches`
  使用同一规则；status 只汇总为计数与示例，verify 仍输出完整明细。
- 只检查清单页；磁盘上的孤儿页仍按 orphaned 统计，不参与 invalid。
- 页面缺失（missing）与路径非法（invalid）可能同时出现：前者是“文件
  没有”，后者是“清单记录本身不合法”。
- 不把 invalid 纳入健康分：先与缺页区分，避免未评估的评分变化。
- status 不读正文，因此不会发现页面内部死链；这是与 verify 的有意分工。

## 验证

- `npm test`：516/516（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.01%、分支 86.44%、函数 95.36%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不合并到 missing：两者修复动作不同（重建页面 vs 修清单/重新生成），
  分开计数更可行动。
- 只输出前 10 个 slug：与 status 其他明细上限一致，完整列表可读清单。
- 不在 status 做链接探测：最多 200 次文件系统探测会给状态工具增加延迟，
  且链接问题不是“状态快照”的核心指标。
