# 检查点：问题码参考文档（phase-130）

- 日期：2026-11-27
- 合入版本：v0.154.0
- 目标：`verify:wiki --json` 已稳定输出 `problems[].code`，但 README 只给
  了一个示例（`citation/missing`），使用者无法据此在 CI 里按码聚合或抑制；
  同时英文 README 的快速开始里 `verify:wiki` 命令重复出现两次（一次带
  `v0.146.0` 的旧注释），照抄会重复执行。
- 状态：文档改动完成；待全量门禁与提交推送。

## 交付

- `README.md`：
  - 新增 `### Problem codes` 表：列出全部 24 个码、默认级别与含义，并
    标注 `--strict` / `--require` 下的升级关系（如 `manifest/empty`、
    `wiki/generation-failed`、`citation/untracked`）。
  - 删除快速开始中重复的 `npm run verify:wiki -- --root . --strict
    --require` 行，命令注释版本推进到 v0.154.0。
  - 当前阶段版本与能力清单推进到 v0.154.0。
- `README.zh-CN.md`：同步新增 `### 问题码` 表、阶段版本与命令注释。
- `CHANGELOG.md` / `CHANGELOG.zh-CN.md`：新增 v0.154.0 Docs 条目。
- `docs/coverage.md`：核对对象推进到 v0.154.0，结构化问题码行改为引用
  问题码表。
- `package.json` / `package-lock.json`：版本 0.154.0。

## 语义边界

- 文档只描述代码已有的码，不新增或重命名任何问题码；码表与
  `scripts/verify-wiki.mjs` 的 `addIssue`/`addWarning` 调用逐项核对。
- “默认”列描述不带 `--strict`/`--require` 时的严重级别；`error` 使
  `ok=false`（退出码 1），`warning` 只出现在 `warnings[]` 与 `problems[]`
  中。
- 退出码语义不变：0 通过、1 校验失败、2 脚本异常。

## 验证

- 码表与脚本 grep 结果一致（`citation/*`、`wiki/*`、`manifest/*`、
  `index/*`、`assets/missing`）。
- `npm test`：517/517（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.04%、分支 86.57%、函数 95.36%。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`（306 个跟踪文件）、`npm run verify:host`、
  `git diff --check`：通过。

## 取舍

- 不在 README 罗列每种码的 JSON 片段：字段结构在 `--json` 示例里已给出，
  逐码示例会让快速开始过长。
- 不把码表生成脚本化：码数量稳定且与文案强相关，静态表更易读；若后续
  码继续增长，再考虑从脚本导出。
