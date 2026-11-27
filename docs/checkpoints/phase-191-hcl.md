# 检查点：Terraform/HCL 支持（phase-191）

- 日期：2026-11-28
- 合入版本：v0.215.0
- 目标：Terraform/HCL 是现代仓库的基础设施层。项目此前不索引 `.tf`：
  resource/module/variable 不可检索，`module { source = … }` 不形成依赖
  边，provider 也不进入技术栈。
- 状态：代码、测试、双语文档、兼容矩阵与检查点更新；全量门禁通过。

## 交付

- `src/symbols.js`：
  - `hclScan`（导出）：`#`/`//` 截断、`/* … */` 与字符串掩码，
    返回 code/masked 双视图（标签在字符串内，需 code 视图）；
  - `extractHcl`：`resource`/`data`（`type.name`）、`module`、`provider`、
    `terraform` → class；`variable`/`output`/`locals` → variable；
    嵌套块（`lifecycle`/`dynamic`/`required_providers`）不登记；范围
    用掩码视图配平，字符串内 `{}` 不干扰。
- `src/deps.js`：`extractHclImports` 提取 `source = "…"`（相对标记）。
- `src/indexer.js`：`resolveHclModule` 按引用文件目录解析本地模块，
  优先 `<dir>/main.tf`，否则该目录字典序最小 `.tf`；registry/git 与
  `${}` 插值不建边。
- `src/schema.js`：`tf → hcl`；`MANIFEST_FILES` 加入
  `.terraform.lock.hcl`；`src/prompts.js` 围栏 `hcl`；`client.js` 展示名
  `HCL`。
- `src/stack.js`：`terraformLockProviders`（地址末段）与
  `TERRAFORM_TECH`（AWS/Google Cloud/Azure/Kubernetes/Helm 等）。
- 测试：
  - `symbols.test.js`：块种类/范围、嵌套块与注释排除；
  - `deps.test.js`：相对/registry source 与注释屏蔽；
  - `stack.test.js`：lock provider 计数与技术映射；
  - `indexer.test.js`：模块目录 `main.tf` 代表文件解析与技术栈。

## 语义边界

- 块头必须与 `{` 同行（跨行块头不识别）。
- 字符串插值 `${…}` 内引号可能提前结束字符串（仅影响该行后续识别）。
- `source` 属性一律按模块源解析；资源内同名属性在恰好存在同名目录时
  可能误连（文档注明）。
- provider 信息只来自 `.terraform.lock.hcl`（`required_providers` 块
  不读取）。

## 验证

- `LANG=en npm test`：631/631
- `LANG=zh_CN.UTF-8 npm test`：631/631
- `npm run coverage:check`：行 98.04%、分支 87.71%、函数 95.73%
- `npm run typecheck`、`npm run lint`、`npm run scan:secrets`、
  `npm run verify:host`、`git diff --check`：通过
