/**
 * 工具呈现/渲染分支回归：presentCall、render 的降级/统计文案，以及
 * extract/edit/generate 的无资产/输入校验分支。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { repowikiIndexTool } from '../src/tool-index.js'
import { repowikiCardsTool } from '../src/tool-cards.js'
import { repowikiExtractTool } from '../src/tool-extract.js'
import { repowikiGenerateTool } from '../src/tool-generate.js'
import { repowikiEditTool } from '../src/tool-edit.js'
import { repowikiExportTool } from '../src/tool-export.js'
import { repowikiImportTool } from '../src/tool-import.js'
import { repowikiMemoryTool } from '../src/tool-memory.js'
import { repowikiStatusTool } from '../src/tool-status.js'

/** 最小 ctx。 */
function makeCtx(dir) {
  return { fs: makeFakeFs(dir), workingDirectory: { get: () => dir } }
}

/** 正常 exec。 */
const fakeExec = { signal: new AbortController().signal, agent: { id: 'owner' } }

test('presentCall：全部 9 个工具返回 generic 卡片', () => {
  const tools = [
    repowikiIndexTool({}), repowikiCardsTool({}), repowikiExtractTool({}),
    repowikiGenerateTool({}), repowikiEditTool({}), repowikiExportTool({}),
    repowikiImportTool({}), repowikiMemoryTool({}), repowikiStatusTool({}),
  ]
  for (const tool of tools) {
    const view = tool.presentCall({})
    assert.equal(view.card, 'generic')
    assert.equal(typeof view.title, 'string')
  }
})

test('render：index/cards/extract/generate 的统计与降级文案', () => {
  const index = repowikiIndexTool({})
  assert.match(index.output.render({}, {
    files: 2, reused: 1, symbols: 3, edges: 1, durationMs: 5, indexPath: 'x', capped: true, ignored: 2,
  })[0].text, /capped.*2 ignored/)
  assert.match(index.output.render({}, { aborted: true, files: 2, hint: 'h' })[0].text, /Cancelled/)

  const cards = repowikiCardsTool({})
  const cardText = cards.output.render({}, {
    indexed: true,
    matches: [{ path: 'a.ts', symbols: [{ name: 'a', kind: 'function', line: 1 }] }],
    total: 2, truncated: true,
    knowledge: [{ type: 'card', path: 'a.ts', title: 'A', score: 1, snippet: 's' }],
    knowledgeTotal: 3, knowledgeTruncated: true, hint: 'hint',
  })[0].text
  assert.match(cardText, /\[card\] A/)
  assert.match(cardText, /3 knowledge hit/)

  const extract = repowikiExtractTool({})
  assert.match(extract.output.render({}, {
    extracted: 1, cardsDir: 'd', locale: 'zh', durationMs: 1,
    skippedExisting: 2, skippedManual: 1, skippedSimple: 0,
    orphaned: 1, failed: [{ path: 'x', reason: 'r' }], capped: true,
  })[0].text, /Orphaned.*Failed.*Capped/s)

  const generate = repowikiGenerateTool({})
  assert.match(generate.output.render({}, {
    pages: ['a'], cardsRead: 1, memoriesRead: 1, durationMs: 1, wikiDir: 'd',
    failed: [{ slug: 'b', reason: 'r' }],
    renamed: [{ from: 'a', to: 'a-2' }],
    orphaned: ['old'], cardsTruncated: 1, aborted: true,
  })[0].text, /failed.*Renamed.*Orphaned.*omitted.*Cancelled/s)
})

test('render：export/import/edit/memory 的降级与结果文案', () => {
  const exportTool = repowikiExportTool({})
  assert.match(exportTool.output.render({}, {
    files: 1, dirs: 1, skipped: 0, assetDir: 'a', target: 't', durationMs: 1,
    failed: [{ path: 'x', reason: 'r' }], aborted: true,
  })[0].text, /Cancelled.*Failed/s)

  const importTool = repowikiImportTool({})
  assert.match(importTool.output.render({}, {
    files: 0, dirs: 0, skipped: 0, source: 's', durationMs: 1, indexOk: false, aborted: true,
  })[0].text, /Cancelled.*Warning/s)

  const edit = repowikiEditTool({})
  assert.match(edit.output.render({}, {
    action: 'update', slug: 's', card: 'c', locale: 'zh', durationMs: 1,
  })[0].text, /Updated manual card/)

  const memory = repowikiMemoryTool({})
  assert.match(memory.output.render({}, {
    action: 'write', slug: 's', status: 'pending', path: 'p', durationMs: 1,
  })[0].text, /Memory written/)
  assert.match(memory.output.render({}, {
    action: 'list', total: 1, status: 'pending', durationMs: 1,
    entries: [{ slug: 's', status: 'pending', title: 'T' }],
  })[0].text, /Memory entries/)
  assert.match(memory.output.render({}, {
    action: 'accept', slug: 's', status: 'accepted', path: 'p', durationMs: 1,
  })[0].text, /accepted/)
})

test('repowiki-extract：无索引时降级且 render 可读', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-branch-'))
  const tool = repowikiExtractTool(makeCtx(dir))
  const out = await tool.execute({ locale: 'zh' }, fakeExec)
  assert.match(out.hint, /repowiki-index/)
  assert.ok(tool.output.render({}, out)[0].text.length > 0)
})

test('repowiki-edit：create/update 的输入校验与未命中提示', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-branch-'))
  const tool = repowikiEditTool(makeCtx(dir))

  const noPath = await tool.execute({ action: 'create' }, fakeExec)
  assert.match(noPath.hint, /path is required/)
  const noBody = await tool.execute({ action: 'create', path: 'a.md' }, fakeExec)
  assert.match(noBody.hint, /title and body are required/)
  const missing = await tool.execute({ action: 'update', path: 'a.md' }, fakeExec)
  assert.match(missing.hint, /No existing card/)
})

test('repowiki-generate：无卡片时 hint 与 render 可读', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-branch-'))
  const tool = repowikiGenerateTool(makeCtx(dir))
  const out = await tool.execute({ locale: 'zh' }, fakeExec)
  assert.match(out.hint, /No knowledge cards/)
  assert.match(tool.output.render({}, out)[0].text, /No knowledge cards/)
})

test('repowiki-index/cards：缺 ctx.fs 时抛出明确错误', async () => {
  await assert.rejects(() => repowikiIndexTool({}).execute({}, fakeExec), /ctx\.fs capability/)
  await assert.rejects(() => repowikiCardsTool({}).execute({}, fakeExec), /ctx\.fs capability/)
})
