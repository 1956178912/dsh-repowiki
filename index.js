/**
 * dsh-repowiki 插件入口（Phase 1 + Phase 2）。
 *
 * 导出形态遵循官方 Host 插件约定（host-plugin.md）：
 * - `name`：插件行标识。
 * - `inject`：声明所依赖的能力服务键（Cordis 按 ctx.<key> 查找）。
 *   'fs' 与 'subagents' 为能力 seam；缺失本插件在该 profile 不激活
 *   （practices 规则 21）。
 * - `apply(ctx, config)`：注册工具；注册随本插件 ctx 回收，disposer
 *   同时存入自有 effect（practices 规则 2）。
 *
 * 工具清单：
 * - repowiki-index：确定性重建符号索引（Phase 1）
 * - repowiki-cards：只读检索（Phase 1）
 * - repowiki-extract：spawn 子代理生成知识卡片（Phase 2）
 * - repowiki-generate：卡片凝练为 Wiki 页面（Phase 2）
 */

import { repowikiIndexTool } from './src/tool-index.js'
import { repowikiCardsTool } from './src/tool-cards.js'
import { repowikiExtractTool } from './src/tool-extract.js'
import { repowikiGenerateTool } from './src/tool-generate.js'

export const name = 'repowiki'

/**
 * 依赖的能力服务：
 * - fs：索引与卡片读写（ctx.fs 能力 seam）
 * - tools：工具注册表
 * - subagents：extract/generate 的 spawn 子代理后端
 */
export const inject = ['fs', 'tools', 'subagents']

/**
 * 注册本 bundle 的工具。
 * @param {object} ctx - 插件上下文（inject 的服务已就绪）。
 * @param {object} [_config] - 行配置（本插件不声明 Config schema：
 *   项目级配置走 .dsh-repowiki/repowiki-plan.json，模型路由继承会话默认——ADR-0003）。
 * @returns {Promise<void>} 注册完成。
 */
export async function apply(ctx, _config) {
  const disposers = [
    ctx.tools.register(repowikiIndexTool(ctx)),
    ctx.tools.register(repowikiCardsTool(ctx)),
    ctx.tools.register(repowikiExtractTool(ctx)),
    ctx.tools.register(repowikiGenerateTool(ctx)),
  ]
  // 注册本归 apply ctx 回收；按 practices 规则 2，disposer 同时登记进自有
  // effect，保证任一侧 teardown 都能干净移除。
  ctx.effect(() => {
    for (const dispose of disposers) dispose()
  })
}
