# Security Policy

## 支持版本

| 版本 | 支持 |
|---|---|
| 0.46.x | ✅ |
| < 0.46 | 仅建议升级 |

## 威胁模型

本插件在本地 DSH 进程内运行，资产是项目目录里的普通文件（`.dsh-repowiki/`）：

- **不可信输入**：LLM 子代理返回的卡片/Wiki 结构、人工编辑的 Markdown、仓库文件路径。
- **主要风险**：
  - 路径穿越（slug/path 写出资产目录）；
  - Markdown 链接协议注入（`javascript:` / `data:`）；
  - LLM 输出把任意文本注入生成的 Markdown；
  - 读取/写入半截资产导致文档损坏；
  - 供应链（devDependencies、CI action）。
- **不在范围**：多用户服务、网络服务、远程代码执行沙箱。

## 已有防线

- `wikiSlug` / `wikiSlugPath` 逐段白名单净化，所有 Wiki 写入强制落在 `wiki/<locale>/`。
- `sanitizeSources` 仅允许卡片/索引白名单内的相对路径与 `#Lx-Ly` 行号。
- 索引路径按不可信输入处理：`readIndex` 丢弃绝对/越界 `files[].path` 及其关联边，并以 `untrusted` 计数在 `repowiki-status` 告警；快照导入共用`projectRelativePath` 规则。
- 面板渲染链接协议白名单：仅 `#`、`http(s)`、`mailto`；危险链接降级为文本。
- 写入回读校验（`writeTextVerified`）：截断/后端异常立即报错，不静默成功。
- 写工具按资产根串行化（进程内 FIFO），避免读-改-写交错。
- 密钥扫描脚本 + CI `npm audit` + CodeQL（GitHub Actions）。
- 运行时零依赖；devDependencies 锁定并每周由 Dependabot 更新。

## 报告问题

请通过仓库维护者的私有渠道报告，不要在公开 issue 中粘贴真实密钥或用户数据。
报告时请包含：版本、复现步骤、影响面（读/写/渲染）、是否涉及真实密钥。
确认后会在修复版本中记录（必要时通过 GitHub Security Advisory）。

## 密钥泄露处置

1. 立即轮换密钥；
2. 用 `git filter-repo` 或 BFG 清理历史；
3. 检查未授权访问痕迹；
4. 回归 `npm run scan:secrets`。
