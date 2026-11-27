# 检查点：页面完整性门禁（phase-117）

- 日期：2026-11-27
- 合入版本：v0.141.0
- 目标：`repowiki-generate` 的增量短路要求清单里的每个 slug 都仍在磁盘
  上；`verify:wiki` 此前只校验引用，不校验清单页文件，页面被删除后门禁
  仍会通过。本轮补上页面存在性，并区分缺失页与孤儿页。
- 状态：代码、测试、双语全量门禁完成；已提交并推送。

## 交付

- `scripts/verify-wiki.mjs`：
  - `readWikiPages(root, locale)`：递归枚举 `wiki/<locale>/**/*.md`
    （深度 ≤3），slug 优先取 frontmatter、否则用文件名，与
    `listWikiPages` 一致；单页不可读时仍以文件名参与判定。
  - 清单 slug 去重后与磁盘集合比较：
    - 缺失页 → issue：`N page(s) in the manifest have no file on disk: …`；
    - 孤儿页 → warning：`N page file(s) are not in the manifest: …`。
  - locale 结果新增 `pageFiles`、`missingPages`、`orphanedPages`，JSON
    报告可直接消费。
- `test/verify-wiki.test.js`：
  - `writeManifest` 现在为每个清单页落盘占位 Markdown，让既有用例更接近
    generate 的真实产物；
  - 新增用例：完整资产通过 → 删除清单页并加入孤儿页 → 缺失失败、孤儿
    告警，且两个数组精确匹配。
- 双语文档、覆盖率报告、Runbook 同步。

## 测试

- `node --test test/verify-wiki.test.js`：11/11。
- 全量 503 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- 只有“清单登记但文件不存在”失败；磁盘上多出的页面（手工页、残留页）
  只告警，与 status 的 orphaned 语义一致，不阻断 CI。
- slug 比较使用 frontmatter 的 `slug`（generate 渲染时写入）；坏
  frontmatter 回退文件名，与 `listWikiPages` 相同，避免门禁与状态工具
  得出不同结论。
- 深度上限 3 与 `listWikiPages` 相同；更深的目录不会被枚举，也不会被
  误报为缺失（若清单引用了它，按缺失处理，属于资产异常）。
- 该检查与陈旧检查互补：页面缺失抓“文件没了”，指纹抓“内容过期”。

## 验证

- `npm test`：503/503（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.06%、分支 86.08%、函数 95.2%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 缺失页默认失败而非警告：缺页是资产损坏，CI 应阻止其进入主干；
  孤儿页可能是人工补充内容，只提示。
- JSON 输出完整 `missingPages`/`orphanedPages` 数组而不是只给计数：
  清单页数有界，CI 需要可直接定位的文件名。
- 不读取页面正文做内容校验：正文由 generate 负责，门禁只做结构完整性。

## 遗留 / 下一步

- GitHub Actions 示例：改为仓库内 fixture 项目，实际运行
  `verify:wiki --strict --require`。
- 清单记录生成器版本，便于区分“输入变化”与“生成规则升级”。
