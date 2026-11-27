# 检查点：导入按快照清单限定复制范围（phase-144）

- 日期：2026-11-28
- 合入版本：v0.168.0
- 目标：v0.163.0 起 `repowiki-import` 会校验 `_snapshot.json` 里每个登记
  文件的指纹，但校验只证明“登记过的没坏”，并不约束“没登记的会不会被复制”。
  手工塞进快照目录、或导出后被第三方注入的 Markdown/JSON 仍会随导入进入
  `.dsh-repowiki/`，把未被校验的内容混进知识库资产。
- 状态：代码、测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/transfer.js`：
  - `copyTree` 新增 `opts.only`（相对路径集合）。命中集合的文件照常复制，
    未命中的文本文件计入 `unlisted`（并收集前 5 条 `unlistedPaths`），
    不写盘、不进入 `entries`。
  - 非文本文件仍走原有 `skipped` 计数，与 `unlisted` 分开，避免把
    “格式不支持”和“未登记”混成一个数字。
- `src/tool-import.js`：
  - 清单存在且 `files` 为数组时，把归一后的路径集合传给 `copyTree`；
    空清单得到空集合，即不复制任何文件（清单声明“零资产”就导入零资产）。
  - `normalizeManifestPath`：统一反斜杠、`posix.normalize`、去掉前导
    `./`，拒绝绝对路径、盘符与向上越界条目，作为清单被篡改时的第二道
    防线（第一道是 `verifySnapshot` 把这类条目计为 invalid）。
  - 输出新增 `snapshotUnlisted` / `snapshotUnlistedPaths`，render 增一行
    “Skipped N unlisted file(s)…”，正常与早退返回都补齐必填字段。
- 测试：
  - `test/transfer.test.js` 新增 2 例：`only` 只复制列出的文件、未列文件
    计数且不落盘；空 `only` 复制零文件。
  - `test/tools.test.js` 新增端到端：导出→向快照注入 `wiki/zh/injected.md`
    →导入，断言只复制 `index.json`、`snapshotUnlisted=1`、路径列表与
    渲染行，且资产目录没有注入文件。

## 语义边界

- 无 `_snapshot.json` 的旧快照保持原有整目录复制：没有清单就没有可信
  白名单，硬性拒绝会破坏向后兼容；此时按老行为导入并提示未校验。
- `allowCorrupt=true` 也不放松范围：清单可解析时仍只复制清单内的文件，
  “强制导入”只针对指纹/完整性失败，不针对范围。
- 清单 JSON 无法解析且 `allowCorrupt=true` 时退回整目录复制（无从得知
  清单内容），并在 hint 中说明清单无效。
- 目录本身不因未列文件而跳过：只在文件层过滤，空目录仍可能被创建；
  资产目录允许空目录存在，不影响读取。
- `unlisted` 只统计清单扩展名内的文本文件；二进制/临时文件仍归
  `skipped`，两个口径不重叠。

## 验证

- `LANG=en node --test test/transfer.test.js test/tools.test.js`：35/35 通过。
- 全量门禁：`npm test`（双语言）、`coverage:check`、`typecheck`、`lint`、
  `scan:secrets`、`verify:host`、`git diff --check`。
