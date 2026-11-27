/**
 * 覆盖率缺口补充：extract/generate 的冲突与清单失败、status 陈旧/孤儿、
 * index/cards 的边界参数。
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
import { repowikiStatusTool } from '../src/tool-status.js'
import { writeCard, writeWikiPage, writeWikiManifest } from '../src/knowledge.js'
import { encodeFrontmatter } from '../src/util.js'

/** 假卡片。 */
const fakeCard = () => ({
  title: '卡', summary: '摘要', purpose: '职责',
  keySymbols: [], pitfalls: [], relatedModules: [], tags: [], skip: false,
})

/**
 * 最小 ctx（含可按 label 返回的 subagents）。
 * @param {string} dir - 介质根。
 * @param {Record<string, object>} [byLabel] - label → 结果。
 * @returns {object} ctx。
 */
function makeCtx(dir, byLabel = {}) {
  return {
    fs: makeFakeFs(dir),
    workingDirectory: { get: () => dir },
    subagents: {
      async startActivation(spec) {
        return {
          result: Promise.resolve(byLabel[spec.label] ?? { structured: undefined, stopReason: 'none' }),
          dispose: async () => {},
        }
      },
    },
  }
}

/** exec。 */
const fakeExec = { signal: new AbortController().signal, agent: { id: 'owner' } }

/** 造项目。 */
function makeProject(files) {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-gap-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    nodefs.mkdirSync(path.dirname(abs), { recursive: true })
    nodefs.writeFileSync(abs, content)
  }
  return dir
}

test('repowiki-extract：纯非 ASCII 文件名记 failed（空 slug 保护）', async () => {
  const dir = makeProject({
    '测试.py': 'def a():\n  pass\ndef b():\n  pass\ndef c():\n  pass\n',
  })
  const ctx = makeCtx(dir, { 'repowiki-extract': { structured: fakeCard(), stopReason: 'complete' } })
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const out = await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.extracted, 0)
  assert.ok(out.failed.some(f => /slugified/.test(f.reason)))
})

test('repowiki-extract：LLM 期间出现人工卡 → 写前二次判定跳过（protected）', async () => {
  const dir = makeProject({
    'a.ts': 'export function a() {}\nexport function b() {}\nexport function c() {}\n',
  })
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const index = JSON.parse(nodefs.readFileSync(path.join(dir, '.dsh-repowiki/index.json'), 'utf8'))
  const digest = index.files.find(f => f.path === 'a.ts').digest
  let injected = false
  ctx.subagents.startActivation = async () => {
    if (!injected) {
      injected = true
      const md = `${encodeFrontmatter({
        schemaVersion: 1, path: 'a.ts', lang: 'typescript', locale: 'zh',
        sourceDigest: 'stale', title: '人工卡', tags: [], manuallyEdited: true, generatedAt: 'now',
      })}\n# 人工卡\n`
      await writeCard(ctx.fs, dir, 'a.ts', 'zh', md)
    }
    return { result: Promise.resolve({ structured: fakeCard(), stopReason: 'complete' }), dispose: async () => {} }
  }
  // 索引 digest 与手工卡的 stale 不同，确保进入 LLM；写前看到 manuallyEdited → 跳过
  assert.ok(digest)
  const out = await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.skippedManual, 1)
  assert.equal(out.extracted, 0)
})

test('repowiki-extract：知识库清单写失败记入 failed（不推翻已写卡片）', async () => {
  const dir = makeProject({ 'a.ts': 'export const a = 1\n' })
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const write = ctx.fs.writeText.bind(ctx.fs)
  ctx.fs.writeText = async (target, content) => {
    if (String(target.displayPath).includes('_index.json')) throw new Error('manifest denied')
    return write(target, content)
  }
  const out = await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.ok(out.failed.some(f => f.path === '_index.json' && /manifest denied/.test(f.reason)))
})

test('repowiki-generate：granularity=all 同时产出模块页与主题页', async () => {
  const dir = makeProject({
    'a.ts': 'export function a() {}\nexport function b() {}\nexport function c() {}\n',
  })
  const ctx = makeCtx(dir, {
    'repowiki-generate': {
      structured: { pages: [{ title: '主题', slug: 'theme', overview: 'o', sections: [{ heading: 'h', body: 'b' }], mermaid: '' }] },
      stopReason: 'complete',
    },
  })
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  await writeCard(ctx.fs, dir, 'a.ts', 'zh', `${encodeFrontmatter({
    schemaVersion: 1, path: 'a.ts', lang: 'typescript', locale: 'zh',
    sourceDigest: '', title: 'A', tags: [], manuallyEdited: true, generatedAt: 'now',
  })}\n# A\n`)
  const out = await repowikiGenerateTool(ctx).execute({ locale: 'zh', granularity: 'all' }, fakeExec)
  assert.ok(out.pages.includes('modules/root'))
  assert.ok(out.pages.includes('theme'))
})

test('repowiki-generate：all 模式主题页失败时仍保留模块页并给 hint', async () => {
  const dir = makeProject({ 'a.ts': 'export function a() {}\n' })
  const ctx = makeCtx(dir, { 'repowiki-generate': { structured: { pages: [] }, stopReason: 'complete' } })
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  await writeCard(ctx.fs, dir, 'a.ts', 'zh', `${encodeFrontmatter({
    schemaVersion: 1, path: 'a.ts', lang: 'typescript', locale: 'zh',
    sourceDigest: '', title: 'A', tags: [], manuallyEdited: true, generatedAt: 'now',
  })}\n# A\n`)
  const out = await repowikiGenerateTool(ctx).execute({ locale: 'zh', granularity: 'all' }, fakeExec)
  assert.deepEqual(out.pages, ['architecture', 'modules/root'])
  assert.match(out.hint, /without pages/)
})

test('repowiki-generate：清单写失败记入 failed', async () => {
  const dir = makeProject({ 'a.ts': 'export function a() {}\n' })
  const ctx = makeCtx(dir, {
    'repowiki-generate': {
      structured: { pages: [{ title: 'T', slug: 't', overview: 'o', sections: [{ heading: 'h', body: 'b' }], mermaid: '' }] },
      stopReason: 'complete',
    },
  })
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  await writeCard(ctx.fs, dir, 'a.ts', 'zh', `${encodeFrontmatter({
    schemaVersion: 1, path: 'a.ts', lang: 'typescript', locale: 'zh',
    sourceDigest: '', title: 'A', tags: [], manuallyEdited: true, generatedAt: 'now',
  })}\n# A\n`)
  const write = ctx.fs.writeText.bind(ctx.fs)
  ctx.fs.writeText = async (target, content) => {
    if (String(target.displayPath).includes('_index.json')) throw new Error('denied')
    return write(target, content)
  }
  const out = await repowikiGenerateTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.ok(out.failed.some(f => f.slug === '_index.json' && /denied/.test(f.reason)))
  assert.deepEqual(out.pages, ['architecture', 't'])
})

test('repowiki-status：Wiki 陈旧/孤儿与卡片陈旧计数', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-gap-'))
  const ctx = makeCtx(dir)
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function a() {}\n')
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const index = JSON.parse(nodefs.readFileSync(path.join(dir, '.dsh-repowiki/index.json'), 'utf8'))
  const digest = index.files.find(f => f.path === 'a.ts').digest
  await writeCard(ctx.fs, dir, 'a.ts', 'zh', `${encodeFrontmatter({
    schemaVersion: 1, path: 'a.ts', lang: 'typescript', locale: 'zh',
    sourceDigest: 'old', title: 'A', tags: [], manuallyEdited: false, generatedAt: 'now',
  })}\n# A\n`)
  await writeWikiPage(ctx.fs, dir, 'stale', 'zh', `${encodeFrontmatter({
    schemaVersion: 1, title: 'S', slug: 'stale', locale: 'zh', generatedAt: 'now', inputDigest: 'deadbeef',
  })}\n# S\n`)
  await writeWikiManifest(ctx.fs, dir, 'zh', {
    schemaVersion: 1,
    generatedAt: 'now',
    inputDigest: digest,
    pages: [{ slug: 'other', path: 'wiki/zh/other.md', title: 'O', module: '', order: 0, sources: [], generatedAt: 'now' }],
  })
  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.cards.stale, 1)
  assert.equal(out.wiki.stale, 1)
  assert.equal(out.wiki.orphaned, 1)
})

test('repowiki-index：maxFiles 下界钳制不抛错', async () => {
  // maxFiles=0 被钳制为 1：多文件项目会因预算提前终止并如实标记 capped
  const dir = makeProject({ 'a.ts': 'export const a = 1\n', 'b.ts': 'export const b = 2\n' })
  const out = await repowikiIndexTool(makeCtx(dir)).execute({ maxFiles: 0 }, fakeExec)
  assert.equal(out.files, 1)
  assert.equal(out.capped, true)
})

test('repowiki-cards：未知 target 回退 symbols', async () => {
  const dir = makeProject({ 'a.ts': 'export function main() {}\n' })
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const out = await repowikiCardsTool(ctx).execute({ target: 'unknown' }, fakeExec)
  assert.equal(out.target, 'symbols')
})

test('repowiki-generate：确定性架构页通过 verify:wiki 严格门禁', async () => {
  const dir = makeProject({
    'src/a.ts': [
      "import { b } from './b'",
      'export function a() {',
      '  if (b) { return 1 }',
      '  if (!b) { return 2 }',
      '  return b',
      '}',
    ].join('\n') + '\n',
    'src/b.ts': 'export function b() { return 1 }\n',
  })
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const index = JSON.parse(nodefs.readFileSync(path.join(dir, '.dsh-repowiki/index.json'), 'utf8'))
  const digestOf = p => index.files.find(file => file.path === p).digest
  for (const file of ['src/a.ts', 'src/b.ts']) {
    await writeCard(ctx.fs, dir, file, 'zh', `${encodeFrontmatter({
      schemaVersion: 1, path: file, lang: 'typescript', locale: 'zh',
      sourceDigest: digestOf(file), title: file, tags: [], manuallyEdited: false, generatedAt: 'now',
    })}\n# ${file}\n`)
  }
  const out = await repowikiGenerateTool(ctx).execute({ locale: 'zh', granularity: 'module' }, fakeExec)
  assert.ok(out.pages.includes('architecture'))

  const manifest = JSON.parse(
    nodefs.readFileSync(path.join(dir, '.dsh-repowiki/wiki/zh/_index.json'), 'utf8'),
  )
  const architecture = manifest.pages.find(page => page.slug === 'architecture')
  assert.ok(architecture, '清单应登记架构页')
  assert.ok(architecture.sources.length > 0, '架构页应引用索引文件')
  assert.equal(architecture.citationMisses, undefined, '确定性引用都应记录指纹')

  const { verifyWiki } = await import('../scripts/verify-wiki.mjs')
  const verified = await verifyWiki({ root: dir, strict: true, requireAssets: true })
  assert.equal(verified.ok, true, verified.issues.join('; '))
  assert.equal(verified.totals.broken, 0)
  assert.equal(verified.totals.outOfRange, 0)
  assert.equal(verified.totals.drift, 0)
  assert.equal(verified.totals.untracked, 0, '架构页引用全部带指纹')
})
