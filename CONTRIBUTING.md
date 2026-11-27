# Contributing

## 硬约束

- **运行时零 npm 依赖、零构建工具**：安装目录即可运行；新增运行时依赖的 PR 不接受。
- dev-only 工具（TypeScript/ESLint/jsdom/React 测试桩）允许，且不得进入 `npm pack` 产物。
- 所有资产文件 IO 走 `ctx.fs`；不裸用 `node:fs`（脚本与测试除外）。
- 提交信息用中文描述目的与影响；**禁止任何 AI 署名 trailer**。

## 本地开发

```sh
npm ci
npm test                 # node:test，全量
npm run lint             # ESLint（扁平配置）
npm run typecheck        # tsc checkJs（curated 文件，@ts-check 渐进）
npm run test:coverage    # 覆盖率
npm run coverage:check   # 覆盖率门禁：lines ≥95 / branches ≥85 / functions ≥85
npm run scan:secrets     # 密钥扫描（git 跟踪文件）
npm run verify:host      # 本机有 dsh app.asar 时核对主题令牌
npm run bench -- 2000    # 合成仓库索引基准
```

## 变更流程

1. 行为/契约变化先写 ADR（`docs/adr/`），长期任务写检查点（`docs/checkpoints/`）。
2. 小步提交：一个逻辑单元一个 commit；测试与实现同 commit。
3. 新能力默认增量式：旧参数/旧资产格式保持可读；schema 升级必须带兼容读取与测试。
4. 安全相关改动必须有回归：路径穿越、链接协议、LLM 输出净化、并发写。
5. 发布前：CHANGELOG 双语条目先行提交 → 工作区干净 → `npm run release -- patch|minor|major`（只创建本地 commit/tag，不 push）。

## 代码风格

- 纯 ES Module；公共逻辑收敛到 `src/util.js` / `src/schema.js`。
- 函数必须有中文 JSDoc（功能/参数/返回值/异常）；新增纯函数优先加 `// @ts-check` 并补类型。
- 测试用 `node:test` + `assert/strict`；不引入断言库。
- 不提交 `.dsh-repowiki/`、`.env`、密钥、构建产物。

## 平台

- CI 阻塞矩阵：Linux/macOS × Node 22/24；Windows 为兼容性 canary（非阻塞）。
- 路径断言一律用 POSIX 归一化后再比较，避免平台分隔符差异。
