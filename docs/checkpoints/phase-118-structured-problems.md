# 检查点：结构化问题码与空清单（phase-118）

- 日期：2026-11-27
- 合入版本：v0.142.0
- 目标：门禁的 issues/warnings 是英文自由文本，CI 无法稳定分类；同时
  “清单存在但没有任何页面”此前会通过，而 generate 对空清单不会短路，
  等于掩盖了一次失败的生成。本轮补结构化问题码并收紧空清单语义。
- 状态：代码、测试、双语全量门禁完成；已提交并推送。

## 交付

- `scripts/verify-wiki.mjs`：
  - 每个 locale 维护 `problems[]`，同时保留原有 issues/warnings 字符串；
    每项为 `{code, severity, message}`，顶层汇总时附加 `locale`。
  - 稳定问题码：
    - `index/read-error`、`assets/missing`、`manifest/missing`、
      `manifest/invalid`、`manifest/empty`、`manifest/missing-digests`；
    - `citation/missing`、`citation/range`、`citation/drift`、
      `citation/untracked`、`citation/unchecked`、`citation/probe-capped`；
    - `wiki/stale-cards`、`wiki/stale-memory`、`wiki/missing-pages`、
      `wiki/orphaned-pages`。
  - 空清单：默认 warning；`--strict` 或 `--require` 下为 error。
  - 引用存在性探测触及 200 路径上限时，`--strict` 下由警告升级为错误。
  - `--json` 顶层新增 `problems`，CI 可按 `code` 聚合/抑制。
- `test/verify-wiki.test.js`：
  - 新增空清单矩阵用例（默认告警、`--strict` 失败、`--require` 失败）；
  - 断链、卡片/记忆陈旧、页面缺失、未覆盖与 `--require` 用例补充
    `problems[].code`/`severity` 断言；
  - 干净资产断言 `problems` 为空。
- 双语文档、覆盖率报告、Runbook 同步。

## 测试

- `node --test test/verify-wiki.test.js`：12/12。
- 全量 504 例通过（LANG=en、LANG=zh_CN.UTF-8）。

## 语义边界

- `issues`/`warnings` 与退出码语义不变，`problems` 是增量字段；旧消费方
  不受影响。
- 空清单失败只在 `--strict`/`--require` 下生效；默认保留“可生成但暂无
  页面”的过渡状态，但仍以警告显式提示。
- `citation/probe-capped` 的含义是“存在性未全量验证”，与未覆盖/未验证
  同属 strict 语义；默认不会因大仓库探测上限而失败。
- 问题码按“一个类别一条汇总”产出，不逐引用展开；逐页明细仍由
  `broken`/`ranges`/`drift`/`coveragePages` 提供。

## 验证

- `npm test`：504/504（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.06%、分支 86.33%、函数 95.14%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不改变 `Result: PASS/FAIL` 文本格式，避免破坏已有日志解析。
- 问题码使用 `domain/name` 形式且全小写连字符，保持稳定、可文档化，
  不随英文文案调整而变化。
- 空清单不默认失败：新建仓库可能先生成索引再生成页面；用
  `--strict --require` 即可在 CI 中收紧。

## 遗留 / 下一步

- 在 README 或文档中列出完整问题码表（当前已在脚本头注释与本检查点）。
- GitHub Actions 示例：仓库内 fixture 上运行
  `verify:wiki --strict --require`。
