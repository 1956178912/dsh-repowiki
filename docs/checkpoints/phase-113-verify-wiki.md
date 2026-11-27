# 检查点：verify:wiki 门禁（phase-113）

- 日期：2026-11-27
- 合入版本：v0.137.0
- 目标：status 能诊断引用问题，但 CI 需要一个可失败的退出码。本轮新增
  `verify:wiki` 门禁，并在门禁用例中发现/修复了服务端越界计数重复。
- 状态：代码、测试、双语文档、Runbook、全量门禁完成；已提交并推送。

## 交付

- 新增 `scripts/verify-wiki.mjs`（开发/CI 工具，非运行时依赖）：
  - 主检查：缺失引用路径（索引 + 最多 200 个文件系统探测）、行号越界
    （索引 v6 `files[].lines`）、内容漂移（清单 v3 `citationDigests`）、
    指纹覆盖率；
  - 默认失败：断链 / 行号越界 / 内容漂移；
  - 默认警告、`--strict` 失败：未覆盖引用、已记录但无法验证的指纹；
  - 支持 `--root`、可重复 `--locale`、`--json`、`--help`；
  - 退出码：0 通过、1 校验失败、2 参数/读取错误；
  - 没有 Wiki 资产时通过（`warnings` 提示）；显式请求缺失 locale 时失败。
- `package.json` 新增 `verify:wiki` npm 脚本。
- `src/wiki-references.js` 修复：`findCitationRangeIssues` 按页去重
  页级与章节级 `sources`，避免 `total` / `unchecked` 与健康分扣分翻倍。
- README（中英）、`docs/runbook.md`、覆盖率报告同步。

## 门禁语义

- `known` 集合先取索引路径，再对非索引引用做有界探测；探测截断时把剩余
  引用视为"未验证"而不是缺失，并给出警告（与 status 一致）。
- 索引缺失/不兼容：仍可探测文件与验证漂移，但行数越界全部计入 unchecked；
  `index.json` 损坏会让门禁失败。
- `--strict` 是收紧开关：未覆盖/未验证从警告变失败，便于要求 100% 可验证
  的仓库使用；默认配置避免因读取上限造成假失败。
- 输出有界：断链/越界/漂移明细沿用各自模块上限，不打印整份清单。

## 测试

- 新增 `test/verify-wiki.test.js`：
  - 干净资产严格模式通过、统计与 PASS 输出；
  - 断链 + 越界 + 漂移同时失败，报告含三类示例与 untracked 示例；
  - 未覆盖默认警告、严格模式失败；
  - 显式缺失 locale 失败、无 Wiki 通过；
  - 参数解析非法输入；
  - `main` JSON/帮助输出与 CLI 进程退出码 0/1。
- `test/wiki-references.test.js` 新增页级/章节重叠引用只计一次的回归。
- 全量 498 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：498/498（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.12%、分支 86.33%、函数 95.03%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 没有把 status 的探测逻辑抽成共享模块：脚本与 status 的失败语义不同
  （status 只报告，gate 要退出码），先保持各自实现并共享纯函数
  `wiki-references`/`citation-drift`，避免为单一调用方过度抽象。
- 脚本未加入 npm `files`：它是开发/CI 工具，不进入插件安装包。
- 默认不因未覆盖失败：读取上限与不可读文件在大型仓库常见，强制失败会
  让门禁失去可用性；需要严格保证时用 `--strict`。

## 遗留 / 下一步

- 可提供 GitHub Actions 示例（消费方仓库在 `repowiki-generate` 后运行）。
- 面板"仅看未覆盖页面"筛选。
- 原因趋势统计（需要历史快照）。
