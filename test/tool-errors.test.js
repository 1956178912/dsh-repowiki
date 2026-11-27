/**
 * 工具降级/边界分支回归：export/import/cards/memory/status 的可读提示与取消。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { repowikiExportTool } from '../src/tool-export.js'
import { repowikiImportTool } from '../src/tool-import.js'
import { repowikiCardsTool } from '../src/tool-cards.js'
import { repowikiMemoryTool } from '../src/tool-memory.js'
import { repowikiStatusTool } from '../src/tool-status.js'
import { writeIndex } from '../src/assets.js'

/** 最小 ctx。 */
function makeCtx(dir) {
  return { fs: makeFakeFs(dir), workingDirectory: { get: () => dir } }
}

/** 正常 exec。 */
const fakeExec = { signal: new AbortController().signal, agent: undefined }

/** 预取消 exec。 */
function abortedExec() {
  const ac = new AbortController()
  ac.abort()
  return { signal: ac.signal, agent: undefined }
}

test('repowiki-export：缺 target / 无资产 / 目标非空 三种降级提示', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-err-'))
  const ctx = makeCtx(dir)
  const tool = repowikiExportTool(ctx)

  const noTarget = await tool.execute({}, fakeExec)
  assert.match(noTarget.hint, /target is required/)
  const noAsset = await tool.execute({ target: 'snap' }, fakeExec)
  assert.match(noAsset.hint, /No \.dsh-repowiki assets/)

  nodefs.mkdirSync(path.join(dir, '.dsh-repowiki'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, '.dsh-repowiki/index.json'), '{}\n')
  nodefs.mkdirSync(path.join(dir, 'snap'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'snap/existing.md'), '# x\n')
  const refused = await tool.execute({ target: 'snap' }, fakeExec)
  assert.match(refused.hint, /already exists and is not empty/)
})

test('repowiki-export：取消时返回 aborted 且快照可为部分', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-err-'))
  nodefs.mkdirSync(path.join(dir, '.dsh-repowiki'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, '.dsh-repowiki/index.json'), '{}\n')
  const out = await repowikiExportTool(makeCtx(dir)).execute({ target: 'snap', overwrite: true }, abortedExec())
  assert.equal(out.aborted, true)
  assert.match(out.hint, /Cancelled/)
})

test('repowiki-import：缺 source / 源为空 / 现有资产保护 / 取消', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-err-'))
  const ctx = makeCtx(dir)
  const tool = repowikiImportTool(ctx)

  const noSource = await tool.execute({}, fakeExec)
  assert.match(noSource.hint, /source is required/)
  const emptySource = await tool.execute({ source: 'missing' }, fakeExec)
  assert.match(emptySource.hint, /does not exist or is empty/)

  nodefs.mkdirSync(path.join(dir, 'snap'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'snap/index.json'), '{}\n')
  nodefs.mkdirSync(path.join(dir, '.dsh-repowiki'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, '.dsh-repowiki/index.json'), '{}\n')
  const refused = await tool.execute({ source: 'snap' }, fakeExec)
  assert.match(refused.hint, /already holds assets/)

  const cancelled = await tool.execute({ source: 'snap', overwrite: true }, abortedExec())
  assert.equal(cancelled.aborted, true)
})

test('repowiki-cards：includeMemory 过滤与 presentResult', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-err-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)
  await writeIndex(ctx.fs, dir, {
    schemaVersion: 3,
    stats: { files: 1, symbols: 1, edges: 0, modules: 1 },
    modules: [{ path: '.', parent: '', files: 1, symbols: 1 }],
    files: [{ path: 'a.ts', module: '.', lang: 'typescript', symbols: [{ name: 'main', kind: 'function', line: 1, endLine: 1, exported: true }] }],
    edges: [],
  })
  const memTool = repowikiMemoryTool(ctx)
  await memTool.execute({ action: 'write', title: 'Alpha convention', body: 'beta body', status: 'accepted', locale: 'zh' }, fakeExec)

  const cards = repowikiCardsTool(ctx)
  const out = await cards.execute({ query: 'alpha', includeMemory: true, target: 'all' }, fakeExec)
  assert.equal(out.memories.length, 1)
  assert.equal(out.memories[0].title, 'Alpha convention')
  const view = cards.presentResult({}, { value: out })
  assert.ok(view.total >= 1)
})

test('repowiki-memory：write/accept 的输入校验与未命中提示', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-err-'))
  const tool = repowikiMemoryTool(makeCtx(dir))

  const missingBody = await tool.execute({ action: 'write', title: 'x' }, fakeExec)
  assert.match(missingBody.hint, /title and body are required/)
  const missingSlug = await tool.execute({ action: 'accept' }, fakeExec)
  assert.match(missingSlug.hint, /slug is required/)
  const badSlug = await tool.execute({ action: 'accept', slug: '../escape' }, fakeExec)
  assert.match(badSlug.hint, /plain file name/)
  const notFound = await tool.execute({ action: 'accept', slug: 'nope' }, fakeExec)
  assert.match(notFound.hint, /not found/)
})

test('repowiki-status：不兼容索引与缺失清单告警', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-err-'))
  nodefs.mkdirSync(path.join(dir, '.dsh-repowiki'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, '.dsh-repowiki/index.json'), JSON.stringify({ schemaVersion: 1 }))
  nodefs.mkdirSync(path.join(dir, '.dsh-repowiki/wiki/zh'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, '.dsh-repowiki/wiki/zh/old.md'), '# old\n')
  const out = await repowikiStatusTool(makeCtx(dir)).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.index.exists, true)
  assert.equal(out.index.compatible, false)
  assert.ok(out.warnings.some(w => /not compatible/.test(w)))
  assert.ok(out.warnings.some(w => /_index\.json/.test(w)))
  assert.equal(out.wiki.manifest, false)
})
