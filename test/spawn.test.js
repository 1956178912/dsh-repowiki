/**
 * src/spawn.js 测试：runSubagent 的 activation 契约与 getLocale。
 *
 * 这是方案 §P1 的核心 seam（LLM 子任务一律经 ctx.subagents
 * 派发、outputSchema 约束、delivery:'caller'、取 exec.signal 取消），
 * 真实子代理不可用于单测，故对 startActivation 做契约级 stub：
 * 验证本插件发出的请求形态与官方文档约束一致，而非子代理内部行为。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { runSubagent, getLocale } from '../src/spawn.js'

/** 记录调用规格的假 startActivation。 */
function makeFakeActivation({ result, disposeError } = {}) {
  const calls = []
  const activation = {
    result: result instanceof Promise ? result : Promise.resolve(result),
    async dispose() {
      activation.disposed = true
      if (disposeError) throw disposeError
    },
    disposed: false,
  }
  const startActivation = async (spec) => {
    calls.push(spec)
    return activation
  }
  return { startActivation, calls, activation }
}

test('runSubagent：向 startActivation 发出符合契约的 activation 规格', async () => {
  const outputSchema = { type: 'object', required: ['x'], properties: { x: { type: 'string' } } }
  const { startActivation, calls } = makeFakeActivation({ result: { structured: { x: '1' }, stopReason: 'complete' } })
  const agent = { id: 'agent-1' }
  const signal = new AbortController().signal
  const ctx = { subagents: { startActivation } }

  const out = await runSubagent(ctx, {
    prompt: 'do something', outputSchema, agent, signal,
    label: 'repowiki-extract', name: 'rw-extract-1',
  })

  assert.strictEqual(calls.length, 1, '应恰好一次 activation')
  const spec = calls[0]
  assert.strictEqual(spec.provider, 'spawn', 'provider 应为 spawn')
  assert.strictEqual(spec.label, 'repowiki-extract')
  assert.strictEqual(spec.name, 'rw-extract-1')
  assert.strictEqual(spec.signal, signal, ' cancellation 应走 exec.signal')
  assert.strictEqual(spec.delivery, 'caller', '结果给工具而非注入父消息')
  assert.strictEqual(spec.parent, agent, 'parent 应为 exec.agent')
  assert.deepStrictEqual(spec.outputSchema, outputSchema, 'outputSchema 应原样透传')
  assert.deepStrictEqual(spec.prompt, [{ type: 'text', text: 'do something' }], 'prompt 应为 text 块数组')
  assert.deepStrictEqual(out.structured, { x: '1' })
})

test('runSubagent：结果取回后调用 dispose', async () => {
  const { startActivation, activation } = makeFakeActivation({ result: { structured: 1 } })
  await runSubagent({ subagents: { startActivation } }, {
    prompt: 'p', outputSchema: {}, agent: {}, signal: undefined,
  })
  assert.ok(activation.disposed, 'dispose 应被调用')
})

test('runSubagent：dispose 抛错不覆盖已取回的结果', async () => {
  const { startActivation } = makeFakeActivation({
    result: { structured: 'ok' },
    disposeError: new Error('teardown boom'),
  })
  const out = await runSubagent({ subagents: { startActivation } }, {
    prompt: 'p', outputSchema: {}, agent: {}, signal: undefined,
  })
  assert.deepStrictEqual(out.structured, 'ok', '结果应在 dispose 失败后仍可用')
})

test('runSubagent：activation.result 拒绝时向上传播并仍 dispose', async () => {
  const { startActivation, activation } = makeFakeActivation({
    result: Promise.reject(new Error('subagent failed')),
  })
  await assert.rejects(() => runSubagent({ subagents: { startActivation } }, {
    prompt: 'p', outputSchema: {}, agent: {}, signal: undefined,
  }), /subagent failed/)
  assert.ok(activation.disposed, '失败路径也应 dispose')
})

test('runSubagent：缺 ctx.subagents 或 agent 给出可读错误', async () => {
  await assert.rejects(() => runSubagent({}, { prompt: 'p', outputSchema: {}, agent: {}, signal: undefined }),
    /ctx.subagents capability/)
  await assert.rejects(() => runSubagent({ subagents: { startActivation: async () => ({}) } }, {
    prompt: 'p', outputSchema: {}, agent: undefined, signal: undefined,
  }), /owning agent session/)
})

test('getLocale：按 LANG 环境变量推断（zh* → zh，其余 → en）', () => {
  const saved = process.env.LANG
  try {
    process.env.LANG = 'zh_CN.UTF-8'
    assert.strictEqual(getLocale({}), 'zh')
    process.env.LANG = 'en_US.UTF-8'
    assert.strictEqual(getLocale({}), 'en')
    delete process.env.LANG
    assert.strictEqual(getLocale({}), 'en', '缺失降级 en')
    process.env.LANG = saved
  } finally {
    if (saved !== undefined) process.env.LANG = saved
  }
})
