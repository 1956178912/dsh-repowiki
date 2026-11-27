/**
 * spawn 子代理调用封装。
 *
 * 方案 §P1 修复方向（官方机制）：LLM 子任务一律派发本地子代理
 * （provider 'spawn'），它继承父会话的 provider/model/reasoning effort/
 * output-token limit（除非 agentOptions 覆盖，本首版不做——ADR-0003）。
 * 取消走 exec.signal（唯一取消通道）；structured 输出经 outputSchema
 * 约束；delivery:'caller' 让工具消费结果而不是注入父消息。
 */

/**
 * 派发一个 spawn 子代理并取回结构化结果。
 * @param {PluginContext} ctx - 插件上下文（提供 ctx.subagents）。
 * @param {{prompt:string, outputSchema:object, agent:object, signal:AbortSignal, label:string, name:string}} opts
 *   - prompt：自包含任务文本（fresh 子代理无父对话历史）。
 *   - outputSchema：ObjectJsonSchema（JsonSchemaNode 子集）。
 *   - agent：父 Agent（工具执行的 exec.agent）。
 *   - signal：取消信号（exec.signal）。
 *   - label/name：目录标识（name 需 1-32 小写字母数字连字符、字母开头、非 'lead'）。
 * @returns {Promise<{structured?:unknown, stopReason:string, diagnostic?:string, output:unknown[]}>}
 *   子代理终态结果。
 */
export async function runSubagent(ctx, { prompt, outputSchema, agent, signal, label, name }) {
  if (!ctx.subagents) {
    throw new Error('repowiki requires the ctx.subagents capability to be available in this profile')
  }
  if (!agent) {
    throw new Error('repowiki extract/generate require an owning agent session (tool call without agent context)')
  }
  const activation = await ctx.subagents.startActivation({
    provider: 'spawn',
    label,
    name,
    signal,
    delivery: 'caller',
    prompt: [{ type: 'text', text: prompt }],
    parent: agent,
    outputSchema,
  })
  try {
    return await activation.result
  } finally {
    await activation.dispose().catch(() => {
      // teardown 失败不覆盖已捕获的结果（subagent.zh.md 的语义）
    })
  }
}

/**
 * 推断输出语言（方案 §5.2：只生成当前 locale 一份）。
 * Host 工具没有客户端 locale 服务；用环境变量推断，工具参数可显式覆盖。
 * @param {PluginContext} _ctx - 插件上下文（预留）。
 * @returns {string} 'zh' 或 'en'。
 */
export function getLocale(_ctx) {
  const lang = (typeof process.env.LANG === 'string' ? process.env.LANG : '').toLowerCase()
  return lang.startsWith('zh') ? 'zh' : 'en'
}
