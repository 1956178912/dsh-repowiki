/**
 * 工具执行层单元测试：repowiki-index / repowiki-cards 的 execute 与渲染。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { repowikiIndexTool } from '../src/tool-index.js'
import { repowikiCardsTool } from '../src/tool-cards.js'

/**
 * 构造一个最小插件 ctx（fake fs）。
 * @param {string} rootDir - 介质根。
 * @returns {{fs:object, tools:object, workingDirectory:object}} ctx。
 */
function makeCtx(rootDir) {
  return {
    fs: makeFakeFs(rootDir),
    tools: { register: () => () => {} },
    workingDirectory: { get: () => rootDir },
  }
}

/** 工具 execute 所需的最小 exec。 */
const fakeExec = { signal: new AbortController().signal, agent: undefined }

test('repowiki-index execute：产出索引文件与统计', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-tool-'))
  nodefs.writeFileSync(path.join(dir, 'app.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)
  const tool = repowikiIndexTool(ctx)
  const value = await tool.execute({}, fakeExec)

  assert.equal(value.root, dir)
  assert.ok(value.indexPath.endsWith('.dsh-repowiki/index.json'))
  assert.equal(value.files, 1)
  assert.equal(value.symbols, 1)
  assert.equal(value.capped, false)
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki', 'index.json')))

  const rendered = tool.output.render({}, value)
  assert.match(rendered[0].text, /Indexed 1 files/)

  const view = tool.presentResult?.({}, { value })
  assert.equal(view, undefined, 'index 工具无需 search 卡片，呈现交由 generic/render')
})

test('repowiki-cards execute：无索引时给出降级提示（不静默空）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-tool-'))
  const ctx = makeCtx(dir)
  const tool = repowikiCardsTool(ctx)
  const value = await tool.execute({}, fakeExec)

  assert.equal(value.indexed, false)
  assert.match(value.hint, /repowiki-index/)
  const rendered = tool.output.render({}, value)
  assert.equal(rendered[0].text, value.hint)
})

test('repowiki-cards execute：有索引时按 query 过滤并给出 search 视图', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-tool-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function parse() {}\nexport class Parser {}\n')
  nodefs.writeFileSync(path.join(dir, 'b.ts'), 'export function other() {}\n')
  const ctx = makeCtx(dir)

  // 先建索引（走真实的 index 工具，链路也就被一并验证）
  await repowikiIndexTool(ctx).execute({}, fakeExec)

  const cards = repowikiCardsTool(ctx)
  const value = await cards.execute({ query: 'parse' }, fakeExec)
  assert.equal(value.indexed, true)
  assert.equal(value.matches.length, 1, '只有 a.ts 命中')
  assert.equal(value.matches[0].symbols.length, 2, 'parse 与 Parser 都含子串')
  assert.equal(value.total, 1)
  assert.equal(value.truncated, false)
  assert.ok(value.technologies.length === 0, '无 package.json 时技术栈为空数组')

  const view = cards.presentResult({}, { value })
  assert.equal(view.card, 'search')
  assert.equal(view.total, 1)

  const kindFiltered = await cards.execute({ query: 'parse', kind: 'class' }, fakeExec)
  assert.equal(kindFiltered.matches[0].symbols.length, 1)
  assert.equal(kindFiltered.matches[0].symbols[0].name, 'Parser')
})

test('工具契约：name/description/output 契约完整（注册表最低要求）', () => {
  for (const tool of [repowikiIndexTool({}), repowikiCardsTool({})]) {
    assert.equal(typeof tool.name, 'string')
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 20, '描述说明用途')
    assert.ok(tool.output && typeof tool.output.schema === 'object' && typeof tool.output.render === 'function', '输出契约完整')
    assert.equal(typeof tool.execute, 'function')
  }
})
