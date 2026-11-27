# 检查点：带指纹校验的快照（phase-139）

- 日期：2026-11-27
- 合入版本：v0.163.0
- 目标：`repowiki-export`/`repowiki-import` 只是目录拷贝，快照被截断、
  文件被改或导出中途取消时，导入仍会“成功”，坏索引/卡片静默进入资产。
  用户只能事后跑 `repowiki-status` 才发现缺页/不可读。
- 状态：代码、传输层/工具测试、双语文档与检查点更新；待全量门禁与提交。

## 交付

- `src/transfer.js`：
  - `copyTree` 返回 `entries[{path, digest}]`（相对快照根，sha256-16）；
    支持 `exclude:Set<name>`（导入时跳过清单）。
  - 新增 `SNAPSHOT_MANIFEST='_snapshot.json'`、
    `SNAPSHOT_SCHEMA_VERSION=1`、`writeSnapshotManifest`、
    `readSnapshotManifest`、`verifySnapshot`。
  - 清单含 `schemaVersion/generatedAt/count/partial/files[]`；`partial` 覆盖
    “取消或有复制失败”。
  - 校验拒绝绝对路径、`..`、重复项；比对上限 500 个文件，超限 `capped`
    且不判 verified；缺失/不可读/指纹不符计数精确、路径明细各 ≤5。
- `src/tool-export.js`：复制后写清单（partial 标记），输出
  `snapshot`/`snapshotFiles`/`snapshotError`；清单写失败不拖垮导出，
  但以 hint 明示。
- `src/tool-import.js`：
  - 锁内先读并校验清单；损坏/不完整默认拒绝并给出分类计数，
    `allowCorrupt=true` 才复制。
  - 复制时排除 `_snapshot.json`；输出
    `snapshotManifest/snapshotVerified/snapshotChecked/snapshotProblems/snapshotCapped`。
  - 无清单的旧快照照常导入，并提示未校验。
- 测试：
  - `test/transfer.test.js` 新增指纹条目、排除清单、清单往返、篡改/缺失、
    缺失清单与 partial 校验。
  - `test/tools.test.js` 扩展端到端：导出写清单、导入校验通过、篡改快照
    拒绝、`allowCorrupt` 强制导入。
- README 双语、Runbook、覆盖率报告、CHANGELOG 同步。

## 语义边界

- 指纹是完整性校验，不是签名/认证：能发现传输损坏与误改，不能证明来源。
- 校验只覆盖清单列出的文件；不扫描快照里的未列文件（手工添加的额外文件
  不会被判失败），避免误伤人工补充资产。
- 清单自身不进入 `.dsh-repowiki/`；导入通过文件名排除，任意层级同名文件
  都会被跳过（清单约定在快照根）。
- 旧快照（无清单）行为保持兼容：导入成功但明确提示“未校验”。
- 清单路径非法（绝对/`..`）计入 problems 并默认拒绝；强制导入时仍会按
  copyTree 的常规路径处理，不额外接受越界路径。

## 测试

- `node --test test/transfer.test.js`：9/9。
- `node --test test/tools.test.js`：21/21。
- 全量 530 例（LANG=en 与 LANG=zh_CN.UTF-8）。

## 验证

- `npm test`：530/530（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.00%、分支 86.58%、函数 95.30%。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。

## 取舍

- 不默认允许损坏快照：导入是写操作，坏数据进入资产后清理成本更高；
  `allowCorrupt` 给明确逃生口。
- 不做签名/加密：需要密钥管理，超出零依赖插件边界；digest 已覆盖传输
  完整性。
- 不校验未列文件：手工补充或旧工具产物不应被一刀切拒绝。
