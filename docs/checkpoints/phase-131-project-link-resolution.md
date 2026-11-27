# 检查点：项目内相对链接解析（phase-131）

- 日期：2026-11-27
- 合入版本：v0.155.0
- 目标：`verify:wiki` 此前只校验页面正文中以 `.md` 结尾的相对链接，并且
  把 `.dsh-repowiki/` 当作解析根。Wiki 页面真实位置是
  `.dsh-repowiki/wiki/<locale>/`，链接到项目文件必须写
  `../../../src/indexer.js`；该路径会被误判为“越出项目根”，而指向源码/
  文档的死链又完全不检查。
- 状态：代码、门禁测试、双语文档、覆盖率与检查点更新；待全量门禁与提交。

## 交付

- `scripts/verify-wiki.mjs`：
  - `extractMarkdownLinks` 改为 `extractRelativeLinks`：提取全部相对
    Markdown 链接（不再限定 `.md`），跳过图片、锚点、根路径、代码块与
    任意 URI scheme（`http:`/`mailto:`/`tel:`/`data:`/`javascript:` 等）。
  - 链接按页面真实位置相对**项目根**解析：页面绝对目录为
    `<root>/.dsh-repowiki/wiki/<locale>/`，因此 `../../../src/x.ts` 合法；
    只有解析结果越出项目根才报 `wiki/unsafe-link`。
  - 非索引目标做存在性探测（文件或目录，`pathExists`），缺失报
    `wiki/broken-link`；报告中的路径统一为项目根相对路径。
  - 全局按绝对目标去重，探测上限仍为 200；`--strict` 下截断仍失败
    （`wiki/link-probe-capped`），默认只告警。
  - 文案从 “internal .md link(s)” 改为 “relative link(s)”。
- `test/verify-wiki.test.js`：现有死链/越界用例更新为项目根相对路径；
  新增“页面链接项目内源码/文档/根 README 通过，删除源码目标后失败”用例。
- README 双语快速开始、问题码表、Runbook、覆盖率报告、CHANGELOG 同步。

## 语义边界

- 只做存在性校验，不读取目标内容，也不校验链接目标的类型（文件/目录均可）。
- 行号片段（`#Lx-Ly`）与查询串在探测前剥离；链接行号越界不在本轮范围。
- 仍按 Markdown 语义解析：相对页面目录、`..` 正常折叠；绝对路径与盘符
  路径不探测，越出项目根时按不安全链接报告。
- 上限与截断语义不变：超过 200 个不同目标后不再探测，未验证链接不冒充
  为死链。

## 测试

- `node --test test/verify-wiki.test.js`：18/18。
- 全量 518 例（LANG=en 与 LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：518/518（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.04%、分支 86.58%、函数 95.36%。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 允许页面链接项目内任意文件是刻意选择：Wiki 位于资产目录，指向源码、
  README 与 docs 是最常见的手写链接形态；只拦截真正的根外穿越。
- 不校验链接行号：`#Lx-Ly` 需要按目标文件重新读行数，且现有引用指纹
  机制已覆盖清单 `sources`；页面正文链接先保持低 IO。
- 不把链接检查搬到面板：面板只加载资产，不读源码；门禁仍是唯一做
  文件系统探测的入口。
