# 检查点：快照写入回读校验（phase-140）

- 日期：2026-11-27
- 合入版本：v0.164.0
- 目标：`copyTree` 用 `fs.writeText` 写快照文件后不核对目标内容；若后端
  截断或写坏，导出仍把文件计为成功并写进清单，问题要到导入校验或读取
  资产时才暴露。项目其他资产写入早已统一走 `writeTextVerified`，快照
  路径是漏网的一处。
- 状态：代码、传输测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/transfer.js` `copyTree`：改用 `writeTextVerified(fs, outTarget, text)`
  写入并回读比对；不一致或不可读时抛错，进入 `failed` 明细与 `skipped`
  计数，不写入 `entries`（因此不会进入 `_snapshot.json`）。
- `test/transfer.test.js`：新增截断文件系统包装器用例——第一个文件写入
  截断、第二个正常；断言成功 1、失败 1、清单只含成功文件。
- README 双语、覆盖率报告、CHANGELOG 同步。

## 语义边界

- 回读校验只保证“目标内容 === 源内容”，不保证持久化介质长期可靠；
  跨机器长期备份仍应由导入时的清单校验兜底。
- 每个文件多一次读，属于备份/迁移场景可接受的开销；导出是低频操作。
- 失败文件不进入清单，避免清单声称一个未成功写出的文件；导出输出会
  同时给出 `failed` 明细与 `skipped` 总数。
- 不改变 `copyTree` 的失败策略：单文件失败不阻断其余文件，整体仍返回
  计数与有界明细。

## 测试

- `node --test test/transfer.test.js`：10/10。
- 全量 531 例（LANG=en 与 LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：531/531（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.01%、分支 86.49%、函数 95.30%。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不做“写入后二次指纹比对清单”：回读已经逐字符比对，再加一层没有
  额外信息。
- 不把失败文件写成空占位：快照宁缺勿错，导入时会明确缺文件。
- 不新增导出参数开关：备份正确性不应由用户额外开启。
