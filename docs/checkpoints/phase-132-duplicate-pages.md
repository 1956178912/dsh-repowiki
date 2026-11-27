# 检查点：重复页面检测（phase-132）

- 日期：2026-11-27
- 合入版本：v0.156.0
- 目标：`readWikiPages` 以 slug 为键构建 Map，两个文件声明同一 slug 时后者
  静默覆盖前者；被覆盖的页面既不展示，也不进入孤儿/缺页统计。清单重复
  登记 slug 或路径同样被 Set 折叠，门禁无法发现合并/复制造成的损坏。
- 状态：代码、门禁测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `scripts/verify-wiki.mjs`：
  - `readWikiPages` 返回 `{ pages, duplicateSlugs }`；构建 Map 时记录被
    多个文件占用的 slug 及全部相对路径（排序去重）。
  - 新增 `wiki/duplicate-page-slug`（error）：列出前 3 个重复 slug 与
    冲突文件，避免静默覆盖。
  - 清单原始 slug/路径在去重前统计，新增 `manifest/duplicate-pages`
    （error）：分别列出重复 slug 与前 3 条重复路径。
- `test/verify-wiki.test.js`：新增用例覆盖同 slug 双文件与重复清单页。
- README 双语问题码表、快速开始、Runbook、覆盖率报告、CHANGELOG 同步。

## 语义边界

- 重复检测按**最终 slug**（frontmatter 优先、缺省文件名）判断，不按文件名。
- 重复页仍保留 `pages` 的“后者覆盖”语义，供缺页/孤儿/路径比对继续工作；
  新错误负责显式报告被覆盖文件，不改变既有统计口径。
- 清单重复条目只做 slug/path 字符串比较；路径比较前统一反斜杠，大小写
  仍按平台语义（与文件系统一致）。
- 不把重复检测放进面板：面板只展示已加载文件，静默覆盖行为需由门禁拦截。

## 测试

- `node --test test/verify-wiki.test.js`：19/19。
- 全量 519 例（LANG=en 与 LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：519/519（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.04%、分支 86.55%、函数 95.30%。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- `manifest/duplicate-pages` 定为 error 而非 warning：重复条目会让页面
  解析结果依赖顺序，属于确定性损坏，不应等 `--strict`。
- 不自动删除/重命名重复页：门禁只读，修复动作交给 `repowiki-generate`
  或人工处理，避免误删手工页。
- 状态工具与面板的重复计数留待下一轮，与既有“门禁先行、status/panel
  跟进”的节奏一致。
