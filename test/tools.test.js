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
import { repowikiExportTool } from '../src/tool-export.js'
import { repowikiImportTool } from '../src/tool-import.js'
import { cardIsFresh, cardIsProtected, countOrphaned } from '../src/tool-extract.js'

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
  for (const tool of [
    repowikiIndexTool({}), repowikiCardsTool({}),
    repowikiExportTool({}), repowikiImportTool({}),
  ]) {
    assert.equal(typeof tool.name, 'string')
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 20, '描述说明用途')
    assert.ok(tool.output && typeof tool.output.schema === 'object' && typeof tool.output.render === 'function', '输出契约完整')
    assert.equal(typeof tool.execute, 'function')
  }
})

test('repowiki-index execute：增量二次调用复用未变文件', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-inc-'))
  nodefs.writeFileSync(path.join(dir, 'keep.ts'), 'export const a = 1\n')
  nodefs.writeFileSync(path.join(dir, 'move.ts'), 'export const b = 2\n')
  const ctx = makeCtx(dir)
  const tool = repowikiIndexTool(ctx)

  const first = await tool.execute({}, fakeExec)
  assert.equal(first.files, 2)
  assert.equal(first.reused, 0, '无旧索引时全部新算')

  // 内容未变：二次执行全部复用
  const second = await tool.execute({}, fakeExec)
  assert.equal(second.files, 2)
  assert.equal(second.reused, 2)

  // 修改一个文件：只有它重算
  nodefs.writeFileSync(path.join(dir, 'move.ts'), 'export const b = 22\n')
  const third = await tool.execute({}, fakeExec)
  assert.equal(third.reused, 1)
  const rendered = tool.output.render({}, third)
  assert.match(rendered[0].text, /1 unchanged, reused/)

  // incremental=false 强制全量
  const full = await tool.execute({ incremental: false }, fakeExec)
  assert.equal(full.reused, 0, 'incremental=false 时不复用')
})

test('cardIsFresh：digest 匹配判定卡片新鲜度', () => {
  assert.equal(cardIsFresh({ digest: 'abc' }, { meta: { sourceDigest: 'abc' } }), true)
  assert.equal(cardIsFresh({ digest: 'abc' }, { meta: { sourceDigest: 'abd' } }), false)
  assert.equal(cardIsFresh({ digest: 'abc' }, { meta: {} }), false, '老卡无 sourceDigest 需重提取')
  assert.equal(cardIsFresh(undefined, { meta: { sourceDigest: 'abc' } }), false)
  assert.equal(cardIsFresh({ digest: 'abc' }, undefined), false)
  assert.equal(cardIsFresh({ digest: '' }, { meta: { sourceDigest: '' } }), false, '空指纹一律不判鲜')
})

test('cardIsProtected：人工修订保护判定', () => {
  assert.equal(cardIsProtected({ meta: { manuallyEdited: true } }), true)
  assert.equal(cardIsProtected({ meta: { manuallyEdited: false } }), false)
  assert.equal(cardIsProtected({ meta: {} }), false, '字段缺失视为未保护')
  assert.equal(cardIsProtected(undefined), false)
})

test('countOrphaned：源文件已消失的卡片计数（不删除）', () => {
  const existing = new Map([
    ['a.ts', { meta: {}, path: 'knowledge/zh/a.md' }],
    ['b.ts', { meta: {}, path: 'knowledge/zh/b.md' }],
    ['c.ts', { meta: {}, path: 'knowledge/zh/c.md' }],
  ])
  assert.equal(countOrphaned(existing, [{ path: 'a.ts' }, { path: 'b.ts' }]), 1)
  assert.equal(countOrphaned(existing, [{ path: 'a.ts' }, { path: 'b.ts' }, { path: 'c.ts' }]), 0)
  assert.equal(countOrphaned(existing, []), 3)
  assert.equal(countOrphaned(new Map(), []), 0)
})

test('repowiki-export/import execute：快照导出与恢复端到端', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-xfer-tool-'))
  nodefs.writeFileSync(path.join(dir, 'app.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)

  // 先建索引，让 .dsh-repowiki/ 有真实资产
  const indexValue = await repowikiIndexTool(ctx).execute({}, fakeExec)
  assert.equal(indexValue.files, 1)

  // 导出到工作区内相对目录
  const exportTool = repowikiExportTool(ctx)
  const exported = await exportTool.execute({ target: 'snapshot' }, fakeExec)
  assert.equal(exported.files, 1, '快照含 index.json')
  assert.ok(nodefs.existsSync(path.join(dir, 'snapshot', 'index.json')))

  const rendered = exportTool.output.render({}, exported)
  assert.match(rendered[0].text, /Exported 1 file\(s\)/)

  // 目标已存在且非空：默认拒绝
  const refused = await exportTool.execute({ target: 'snapshot' }, fakeExec)
  assert.equal(refused.files, 0)
  assert.match(refused.hint, /overwrite=true/)

  // overwrite=true 合并覆盖
  const merged = await exportTool.execute({ target: 'snapshot', overwrite: true }, fakeExec)
  assert.ok(merged.files >= 1)

  // 缺 target 参数给出可读提示
  const noTarget = await exportTool.execute({}, fakeExec)
  assert.match(noTarget.hint, /target is required/)

  // 清空资产后从快照恢复
  nodefs.rmSync(path.join(dir, '.dsh-repowiki'), { recursive: true, force: true })
  const importTool = repowikiImportTool(ctx)
  const imported = await importTool.execute({ source: 'snapshot' }, fakeExec)
  assert.equal(imported.files, 1)
  assert.equal(imported.indexOk, true, '导入的索引版本可读')
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki', 'index.json')))
  const impRendered = importTool.output.render({}, imported)
  assert.match(impRendered[0].text, /index.json is present and compatible/)

  // 资产已存在且无 overwrite：导入被拒
  const impRefused = await importTool.execute({ source: 'snapshot' }, fakeExec)
  assert.equal(impRefused.files, 0)
  assert.match(impRefused.hint, /overwrite=true/)

  // 源不存在给出可读提示
  const noSource = await importTool.execute({ source: 'nope' }, fakeExec)
  assert.match(noSource.hint, /does not exist or is empty/)
})
