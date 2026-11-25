/**
 * dsh-repowiki 插件入口（Phase 1）。
 *
 * 导出形态遵循官方 Host 插件约定（host-plugin.md）：
 * - `name`：插件行标识。
 * - `inject`：声明所依赖的能力服务键（Cordis 按 ctx.<key> 查找）。
 *   'fs' 为可选能力 seam，缺失本插件在该 profile 不激活（practices 规则 21）。
 * - `apply(ctx, config)`：注册工具；注册随本插件 ctx 回收，disposer
 *   同时存入自有 effect（practices 规则 2）。
 *
 * Phase 1 精确注册两个工具（repowiki-index / repowiki-cards），
 * 全内容可用、无占位。卡片提取与 Wiki 生成是 Phase 2 的新增行，
 * 届时在本入口追加注册，而非留空壳。
 */

import { repowikiIndexTool } from './src/tool-index.js'
import { repowikiCardsTool } from './src/tool-cards.js'

export const name = 'repowiki'

/** 依赖的能力服务：文件系统（索引读写）+ 工具注册表（注册入口）。 */
export const inject = ['fs', 'tools']

/**
 * 注册本 bundle 的工具。
 * @param {object} ctx - 插件上下文（inject 的服务已就绪）。
 * @param {object} [_config] - 行配置（Phase 1 无配置项，全部行为由默认值与工具参数决定）。
 * @returns {Promise<void>} 注册完成。
 */
export async function apply(ctx, _config) {
  const disposers = [
    ctx.tools.register(repowikiIndexTool(ctx)),
    ctx.tools.register(repowikiCardsTool(ctx)),
  ]
  // 注册本归 apply ctx 回收；按 practices 规则 2，disposer 同时登记进自有
  // effect，保证任一侧 teardown 都能干净移除。
  ctx.effect(() => {
    for (const dispose of disposers) dispose()
  })
}
