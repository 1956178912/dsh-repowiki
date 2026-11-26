/**
 * 插件入口集成测试：apply → 注册 → 执行全链路。
 *
 * 用真实文件系统介质 + fake ctx（仅 tools.register/effect 为记录桩），
 * 验证插件入口真实代码路径：工具被注册、schema 被组装、execute 产出
 * 索引并落盘、teardown 干净移除注册。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { apply, inject, name } from '../index.js'

/**
 * 构造记录型 ctx：注册/注销/teardown 全部被记录，介质为真实临时目录。
 * @param {string} dir - 介质根。
 * @returns {object} ctx。
 */
function makeRecordingCtx(dir) {
  const registered = []
  const effects = []
  return {
    fs: makeFakeFs(dir),
    tools: {
      register(def) {
        registered.push(def)
        return () => {
          const i = registered.indexOf(def)
          if (i >= 0) registered.splice(i, 1)
        }
      },
      registered,
    },
    effect(fn) { effects.push(fn) },
    effects,
    workingDirectory: { get: () => dir },
  }
}

test('apply：声明正确，注册全部工具，teardown 干净移除', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-plugin-'))
  const ctx = makeRecordingCtx(dir)
  await apply(ctx, {})

  assert.equal(name, 'repowiki')
  assert.deepEqual(inject, ['fs', 'tools', 'subagents'], '依赖声明与设计一致')
  assert.deepEqual(
    ctx.tools.registered.map(t => t.name).sort(),
    ['repowiki-cards', 'repowiki-extract', 'repowiki-generate', 'repowiki-index'],
  )
  for (const def of ctx.tools.registered) {
    assert.ok(def.output?.schema && typeof def.output.render === 'function', '输出契约完整')
    assert.equal(typeof def.execute, 'function')
  }

  // apply 登记的 teardown 执行后注册被全部移除（practices 规则 2 的自证）
  assert.equal(ctx.effects.length, 1)
  ctx.effects[0]()
  assert.equal(ctx.tools.registered.length, 0)
})

test('apply → execute 端到端：注册后工具可直接执行并产出索引', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-plugin-'))
  nodefs.writeFileSync(path.join(dir, 'app.ts'), 'export function main() {}\n')
  nodefs.writeFileSync(path.join(dir, 'util.js'), 'const help = (x) => x\n')
  const ctx = makeRecordingCtx(dir)
  await apply(ctx, {})

  const byName = Object.fromEntries(ctx.tools.registered.map(t => [t.name, t]))
  const indexValue = await byName['repowiki-index'].execute({}, { signal: new AbortController().signal })
  assert.equal(indexValue.files, 2)
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki', 'index.json')), '索引落盘')

  const cardsValue = await byName['repowiki-cards'].execute(
    { query: 'main' }, { signal: new AbortController().signal })
  assert.equal(cardsValue.indexed, true)
  assert.equal(cardsValue.matches.length, 1)
  assert.equal(cardsValue.matches[0].symbols[0].name, 'main')
})
