---
{
  "schemaVersion": 1,
  "slug": "ui-panel-state-machine",
  "title": "面板状态分支以 idle/no-session/no-asset/loading/error/ready 驱动渲染",
  "tags": ["client", "ui"],
  "status": "accepted",
  "createdAt": "2026-11-26T09:00:00.000Z"
}
---

# 面板状态分支以 idle/no-session/no-asset/loading/error/ready 驱动渲染

RepoWikiPage 的渲染由单一 status 字段驱动，各分支互斥；数据加载为可取消
的 AbortController 序列，最新请求以 requestId 序号压制过期响应。

## 内容

- 未选工作区（idle）给 pickHint 引导；无会话（no-session）提示先开会话；
  无资产（no-asset）提示用上方按钮生成。
- 加载失败（error）分行展示错误码与重试按钮，role=alert。
- 空结果文案按 query/filter 上下文区分，不误用 pendingHint。
