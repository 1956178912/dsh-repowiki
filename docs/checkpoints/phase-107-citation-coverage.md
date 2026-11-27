# 检查点：引用指纹覆盖率透明化（phase-107）

- 日期：2026-11-27
- 合入版本：v0.131.0
- 目标：生成时读取失败或超过读取上限的引用不会写入 `citationDigests`。
  此前只能从"漂移检查没报错"推断安全，容易把未覆盖误读为已验证。本轮
  显式输出引用指纹覆盖率，让覆盖与未覆盖都可见。
- 状态：代码、纯函数测试、generate/status 集成、双语文档、全量门禁完成；
  已提交并推送。

## 交付

- `src/citation-drift.js`：
  - 新增 `summarizeCitationCoverage(manifest)`：按页面对 `sources` 与
    `sections[].sources` 去重，统计 `{total, tracked, untracked, hasDigests}`；
  - `tracked` 只认非空字符串指纹；`hasDigests` 只要存在任一非空指纹即为
    true；清单结构不可用返回 null，0 条引用返回全 0 对象。
- `src/tool-generate.js`：
  - fresh 短路与正常写入后都输出 `citationCoverage`；
  - 短路 `hint` 区分"全部引用已验证 / 部分未覆盖 / 旧清单无指纹"；
  - 正常生成渲染未覆盖提示（`N/M cited source(s) have content digests; K untracked ...`），
    不再暗示所有引用都经过漂移检查。
- `src/tool-status.js`：
  - 输出 `citationCoverage`；
  - 仅在覆盖率不完整或清单早于 v3 时渲染 `Citation digests` 行；
  - 不新增覆盖类告警：缺失路径已有独立告警，避免同一引用产生多条噪声。
- 双语文档、locale 元数据、覆盖率报告同步。

## 口径

- `total`：每页去重后的引用条数之和（同一引用出现在多个页面时各计一次，
  因为每个页面都需要自己的指纹）。
- `tracked`：该页 `citationDigests` 中对应 source 有非空字符串。
- `untracked = total - tracked`：读取失败、行范围非法或生成读取上限导致的
  未覆盖。
- `hasDigests=false`：清单完全没有指纹（旧清单或本轮全部不可读），与
  "部分未覆盖"区分。

## 测试

- `test/citation-drift.test.js`：按页去重、空页面、旧清单、空字符串指纹。
- `test/tool-llm.test.js`：
  - 正常生成与 fresh 短路均报告完整覆盖；
  - 删除被引用源文件后重新合成，覆盖率变为 `0/1` 且渲染未覆盖提示；
  - v2 清单仍可短路，`hint` 明确 `0/1` 未覆盖而不是"已验证"。
- `test/health.test.js`：status 对缺失引用 + 部分指纹输出
  `1/2 tracked, 1 untracked` 并渲染。

## 语义边界

- 覆盖率是"能否检查"的事实，不是缺陷；因此不扣健康分，也不触发重新合成。
- 未覆盖引用不会阻止 fresh 短路，但 `hint`/渲染不会声称已验证。
- 数量只统计清单里的引用；清单外内容不在口径内。

## 验证

- `npm test`：485/485（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.14%、分支 86.39%、函数 95.18%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不在 `checkCitationDrift` 内隐式扩展 `total`：覆盖率与"已记录指纹是否
  漂移"是两个问题，分开输出更便于调用方决策。
- 不为覆盖率新增告警：文本行与结构化字段已足够，避免告警疲劳。
- 未覆盖仍允许短路：无法读取的引用重合成也不会产生指纹，阻止短路会
  造成每次生成都调用模型。

## 遗留 / 下一步

- 面板展示覆盖率徽章（数据已在清单中，无需读源码）。
- 生成输出可追加本轮写入的指纹文件数与未覆盖原因分类。
- 可为读取上限提供分批校验，减少大仓库的未覆盖比例。
