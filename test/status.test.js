/**
 * repowiki-status 诊断工具测试：空资产降级与完整资产计数。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { repowikiStatusTool } from '../src/tool-status.js'
import { repowikiIndexTool } from '../src/tool-index.js'
import { repowikiGenerateTool } from '../src/tool-generate.js'
import { repowikiMemoryTool } from '../src/tool-memory.js'
import { writeCard } from '../src/knowledge.js'
import { encodeFrontmatter } from '../src/util.js'
import { citationDigest } from '../src/citation-digest.js'

/** 最小 ctx。 */
function makeCtx(dir) {
  return { fs: makeFakeFs(dir), workingDirectory: { get: () => dir } }
}

/** 最小 exec。 */
const fakeExec = { signal: new AbortController().signal, agent: { id: 'owner' } }

test('repowiki-status：空目录降级（不抛错、index missing）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-'))
  const out = await repowikiStatusTool(makeCtx(dir)).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.index.exists, false)
  assert.equal(out.index.compatible, false)
  assert.equal(out.cards.count, 0)
  assert.equal(out.wiki.count, 0)
  assert.equal(out.memory.total, 0)
  assert.equal(out.plan.source, 'default')
  assert.equal(out.lock.pending, 0)
  assert.equal(out.assetDir, path.join(dir, '.dsh-repowiki'))
  const rendered = repowikiStatusTool(makeCtx(dir)).output.render({}, out)
  assert.match(rendered[0].text, /Index: missing/)
  assert.match(rendered[0].text, /Module dependencies: \(none\)/)
  assert.deepEqual(out.topDependents, [])
  assert.match(rendered[0].text, /Fan-in hubs: \(none\)/)
})

test('repowiki-status：索引中的越界路径被忽略并进入告警', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-unsafe-'))
  nodefs.mkdirSync(path.join(dir, '.dsh-repowiki'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, '.dsh-repowiki', 'index.json'), JSON.stringify({
    schemaVersion: 6,
    files: [
      { path: '../../etc/passwd', lang: 'text', symbols: [] },
      { path: 'a.ts', lang: 'typescript', symbols: [], lines: 1 },
    ],
    edges: [{ from: 'a.ts', to: '../../etc/passwd', kind: 'import', line: 1, symbols: [] }],
    stats: { files: 2, symbols: 0, edges: 1 },
  }))
  const out = await repowikiStatusTool(makeCtx(dir)).execute({ locale: 'zh' }, fakeExec)
  assert.ok(out.warnings.some(w => /outside the project/.test(w)), '越界路径应产生告警')
  const rendered = repowikiStatusTool(makeCtx(dir)).output.render({}, out)
  assert.match(rendered[0].text, /outside the project/)
})

test('repowiki-status：完整资产统计（陈旧/孤儿/Wiki 清单/记忆/Git）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function main() {}\n')
  nodefs.mkdirSync(path.join(dir, '.git/refs/heads'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, '.git/HEAD'), 'ref: refs/heads/main\n')
  nodefs.writeFileSync(path.join(dir, '.git/refs/heads/main'), `${'c'.repeat(40)}\n`)
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const index = JSON.parse(nodefs.readFileSync(path.join(dir, '.dsh-repowiki/index.json'), 'utf8'))
  const digest = index.files.find(f => f.path === 'a.ts').digest

  const meta = (p, title, sourceDigest) => `${encodeFrontmatter({
    schemaVersion: 1, path: p, lang: 'typescript', locale: 'zh',
    sourceDigest, title, tags: [], manuallyEdited: false, generatedAt: 'now',
  })}\n# ${title}\n`
  await writeCard(ctx.fs, dir, 'a.ts', 'zh', meta('a.ts', '入口', digest))
  await writeCard(ctx.fs, dir, 'gone.ts', 'zh', meta('gone.ts', '孤儿', 'x'))

  await repowikiGenerateTool(ctx).execute({ locale: 'zh', granularity: 'module' }, fakeExec)
  await repowikiMemoryTool(ctx).execute({
    action: 'write', title: '约定', body: '正文', locale: 'zh',
  }, fakeExec)

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.index.exists, true)
  assert.equal(out.index.compatible, true)
  assert.equal(out.index.schemaVersion, 6)
  assert.equal(out.index.files, 1)
  assert.equal(out.index.modules, 1)
  assert.deepEqual(out.index.languages, { typescript: 1 })
  assert.equal(out.git.branch, 'main')
  assert.equal(out.git.shortCommit, 'ccccccc')
  assert.equal(out.cards.count, 2)
  assert.equal(out.cards.stale, 0, 'a.ts 与索引 digest 一致')
  assert.equal(out.cards.orphaned, 1, 'gone.ts 不在索引')
  assert.equal(out.wiki.count, 1)
  assert.equal(out.wiki.manifest, true)
  assert.equal(out.wiki.stale, 0)
  assert.equal(out.wiki.invalid, 0, '相对资产根的清单路径不应被误报为非法')
  assert.equal(out.wiki.orphaned, 0)
  assert.equal(out.memory.pending, 1)
  assert.equal(out.memory.total, 1)
  // 模块页会引用孤儿卡片 gone.ts（源文件不存在）→ 引用完整性必须报告
  assert.equal(out.brokenCitations.total, 1)
  assert.deepEqual(out.brokenCitations.pages[0].sources, ['gone.ts'])
  assert.equal(out.warnings.length, 1)
  assert.match(out.warnings[0], /do not exist/)

  const rendered = repowikiStatusTool(ctx).output.render({}, out)
  assert.match(rendered[0].text, /Index: v6 compatible/)
  assert.match(rendered[0].text, /Wiki: 1 page\(s\), manifest present/)
  assert.match(rendered[0].text, /Broken citations: 1 path\(s\) in 1 page\(s\)/)
  assert.match(rendered[0].text, /Git: main@ccccccc/)
})

test('repowiki-status：已采信记忆变化时提示刷新 Wiki', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-mem-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const index = JSON.parse(nodefs.readFileSync(path.join(dir, '.dsh-repowiki/index.json'), 'utf8'))
  const digest = index.files.find(f => f.path === 'a.ts').digest
  await writeCard(ctx.fs, dir, 'a.ts', 'zh', `${encodeFrontmatter({
    schemaVersion: 1, path: 'a.ts', lang: 'typescript', locale: 'zh',
    sourceDigest: digest, title: '入口', tags: [], manuallyEdited: false, generatedAt: 'now',
  })}\n# 入口\n`)
  // 生成时还没有 accepted 记忆（memoryDigest 记录空集）
  await repowikiGenerateTool(ctx).execute({ locale: 'zh', granularity: 'module' }, fakeExec)
  const memDir = path.join(dir, '.dsh-repowiki/memory/zh')
  nodefs.mkdirSync(memDir, { recursive: true })
  nodefs.writeFileSync(path.join(memDir, 'convention.md'), [
    '---',
    JSON.stringify({
      schemaVersion: 1, kind: 'memory', title: '约定', tags: [],
      status: 'accepted', createdAt: '2026-11-27T00:00:00.000Z',
    }),
    '---',
    '# 约定',
    '',
    '统一使用中文注释。',
    '',
  ].join('\n'))

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.ok(out.warnings.some(w => /Accepted memory changed/.test(w)), '记忆指纹不一致应告警')
  const rendered = repowikiStatusTool(ctx).output.render({}, out)
  assert.match(rendered[0].text, /Warning: Accepted memory changed/)
})

test('repowiki-status：展示最近一次抽取快照（lastRun）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-run-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const knowledgeDir = path.join(dir, '.dsh-repowiki/knowledge/zh')
  nodefs.mkdirSync(knowledgeDir, { recursive: true })
  nodefs.writeFileSync(path.join(knowledgeDir, '_index.json'), JSON.stringify({
    schemaVersion: 2,
    locale: 'zh',
    modules: [],
    lastRun: {
      generatedAt: '2026-11-27T10:00:00.000Z',
      extracted: 3,
      skippedExisting: 2,
      skippedManual: 1,
      skippedSimple: 4,
      orphaned: 0,
      failed: 1,
      retried: 2,
      capped: false,
      concurrency: 2,
      attempts: 3,
      durationMs: 1234,
    },
  }))

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.lastExtract.extracted, 3)
  assert.equal(out.lastExtract.failed, 1)
  assert.equal(out.lastExtract.retried, 2)
  assert.equal(out.lastExtract.concurrency, 2)
  const rendered = repowikiStatusTool(ctx).output.render({}, out)
  assert.match(rendered[0].text, /Last extract: 3 new/)
  assert.match(rendered[0].text, /1 failed, 2 retried/)
})

test('repowiki-status：无知识清单时 Last extract 为 none', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-norun-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.lastExtract, undefined)
  const rendered = repowikiStatusTool(ctx).output.render({}, out)
  assert.match(rendered[0].text, /Last extract: none/)
})

test('repowiki-status：非法 locale 回退 / plan 错误 / Wiki 陈旧 / rejected 计数', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const index = JSON.parse(nodefs.readFileSync(path.join(dir, '.dsh-repowiki/index.json'), 'utf8'))
  const digest = index.files.find(f => f.path === 'a.ts').digest
  await writeCard(ctx.fs, dir, 'a.ts', 'zh', `${encodeFrontmatter({
    schemaVersion: 1, path: 'a.ts', lang: 'typescript', locale: 'zh',
    sourceDigest: digest, title: '入口', tags: [], manuallyEdited: false, generatedAt: 'now',
  })}\n# 入口\n`)
  // 生成模块页（写入带 inputDigest 的清单与页面），随后再补一张卡让页面变陈旧
  await repowikiGenerateTool(ctx).execute({ locale: 'zh', granularity: 'module' }, fakeExec)
  nodefs.writeFileSync(path.join(dir, 'b.ts'), 'export const b = 2\n')
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  await writeCard(ctx.fs, dir, 'b.ts', 'zh', `${encodeFrontmatter({
    schemaVersion: 1, path: 'b.ts', lang: 'typescript', locale: 'zh',
    sourceDigest: 'other', title: 'B', tags: [], manuallyEdited: false, generatedAt: 'now',
  })}\n# B\n`)
  // 记忆：一条 rejected，验证按状态计数
  const memTool = repowikiMemoryTool(ctx)
  await memTool.execute({ action: 'write', title: 'Reject me', body: 'x', locale: 'zh' }, fakeExec)
  await memTool.execute({ action: 'reject', slug: 'reject-me', locale: 'zh' }, fakeExec)
  // plan 文件损坏：状态工具应告警而不是失败
  nodefs.writeFileSync(path.join(dir, '.dsh-repowiki/repowiki-plan.json'), '{not json')

  const out = await repowikiStatusTool(ctx).execute({ locale: 'fr' }, fakeExec)
  assert.ok(out.locale === 'zh' || out.locale === 'en', '非法 locale 回退到环境语言')
  assert.ok(out.wiki.stale > 0, '新增卡片后旧 Wiki 页应判陈旧')
  assert.equal(out.memory.rejected, 1)
  assert.ok(out.warnings.some(w => /repowiki-plan\.json/.test(w)), 'plan 损坏应告警')
})

test('repowiki-status：上次生成失败页计数与文本', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-failed-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const index = JSON.parse(nodefs.readFileSync(path.join(dir, '.dsh-repowiki/index.json'), 'utf8'))
  const digest = index.files.find(f => f.path === 'a.ts').digest
  await writeCard(ctx.fs, dir, 'a.ts', 'zh', `${encodeFrontmatter({
    schemaVersion: 1, path: 'a.ts', lang: 'typescript', locale: 'zh',
    sourceDigest: digest, title: '入口', tags: [], manuallyEdited: false, generatedAt: 'now',
  })}\n# 入口\n`)
  await repowikiGenerateTool(ctx).execute({ locale: 'zh', granularity: 'module' }, fakeExec)

  const manifestPath = path.join(dir, '.dsh-repowiki/wiki/zh/_index.json')
  const manifest = JSON.parse(nodefs.readFileSync(manifestPath, 'utf8'))
  manifest.failed = [{ slug: 'modules/root', reason: 'write failed' }]
  manifest.failedTotal = 1
  nodefs.writeFileSync(manifestPath, JSON.stringify(manifest))

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.wiki.failed, 1)
  assert.deepEqual(out.wiki.failedPages, ['modules/root'])
  const wikiComponent = out.health.components.find(item => item.key === 'wiki')
  assert.equal(wikiComponent.score, 80, '失败页计入健康分 Wiki 分量')
  assert.match(out.health.issues.join(' '), /failed to write/)
  const rendered = repowikiStatusTool(ctx).output.render({}, out)
  assert.match(rendered[0].text, /failed 1/)
})

test('repowiki-status：清单缺页计数与文本', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-missing-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const index = JSON.parse(nodefs.readFileSync(path.join(dir, '.dsh-repowiki/index.json'), 'utf8'))
  const digest = index.files.find(f => f.path === 'a.ts').digest
  await writeCard(ctx.fs, dir, 'a.ts', 'zh', `${encodeFrontmatter({
    schemaVersion: 1, path: 'a.ts', lang: 'typescript', locale: 'zh',
    sourceDigest: digest, title: '入口', tags: [], manuallyEdited: false, generatedAt: 'now',
  })}\n# 入口\n`)
  await repowikiGenerateTool(ctx).execute({ locale: 'zh', granularity: 'module' }, fakeExec)
  nodefs.rmSync(path.join(dir, '.dsh-repowiki/wiki/zh/modules/root.md'))

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.wiki.missing, 1)
  assert.deepEqual(out.wiki.missingPages, ['modules/root'])
  assert.equal(out.wiki.count, 0)
  const wikiComponent = out.health.components.find(item => item.key === 'wiki')
  assert.equal(wikiComponent.score, 60, '缺页计入 Wiki 分量')
  assert.match(out.health.issues.join(' '), /missing on disk/)
  const rendered = repowikiStatusTool(ctx).output.render({}, out)
  assert.match(rendered[0].text, /missing 1/)
})

test('repowiki-status：清单页面路径非法计数与文本', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-invalid-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const index = JSON.parse(nodefs.readFileSync(path.join(dir, '.dsh-repowiki/index.json'), 'utf8'))
  const digest = index.files.find(f => f.path === 'a.ts').digest
  await writeCard(ctx.fs, dir, 'a.ts', 'zh', `${encodeFrontmatter({
    schemaVersion: 1, path: 'a.ts', lang: 'typescript', locale: 'zh',
    sourceDigest: digest, title: '入口', tags: [], manuallyEdited: false, generatedAt: 'now',
  })}\n# 入口\n`)
  await repowikiGenerateTool(ctx).execute({ locale: 'zh', granularity: 'module' }, fakeExec)

  const manifestPath = path.join(dir, '.dsh-repowiki/wiki/zh/_index.json')
  const manifest = JSON.parse(nodefs.readFileSync(manifestPath, 'utf8'))
  const slug = manifest.pages[0].slug
  manifest.pages[0].path = '../secret.md'
  nodefs.writeFileSync(manifestPath, JSON.stringify(manifest))

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.wiki.invalid, 1)
  assert.deepEqual(out.wiki.invalidPages, [slug])
  const wikiComponent = out.health.components.find(item => item.key === 'wiki')
  assert.equal(wikiComponent.score, 95, '非法路径单独扣 Wiki 分量')
  assert.match(out.health.issues.join(' '), /path\(s\) are invalid/)
  const rendered = repowikiStatusTool(ctx).output.render({}, out)
  assert.match(rendered[0].text, /invalid 1/)
})

test('repowiki-status：重复页面 slug 与清单条目计数', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-duplicate-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const index = JSON.parse(nodefs.readFileSync(path.join(dir, '.dsh-repowiki/index.json'), 'utf8'))
  const digest = index.files.find(f => f.path === 'a.ts').digest
  await writeCard(ctx.fs, dir, 'a.ts', 'zh', `${encodeFrontmatter({
    schemaVersion: 1, path: 'a.ts', lang: 'typescript', locale: 'zh',
    sourceDigest: digest, title: '入口', tags: [], manuallyEdited: false, generatedAt: 'now',
  })}\n# 入口\n`)
  await repowikiGenerateTool(ctx).execute({ locale: 'zh', granularity: 'module' }, fakeExec)

  const manifestPath = path.join(dir, '.dsh-repowiki/wiki/zh/_index.json')
  const manifest = JSON.parse(nodefs.readFileSync(manifestPath, 'utf8'))
  const slug = manifest.pages[0].slug
  // 清单重复 slug（不同路径）与磁盘同 slug 文件各一。
  manifest.pages.push({ ...manifest.pages[0], path: 'wiki/zh/other.md' })
  nodefs.writeFileSync(manifestPath, JSON.stringify(manifest))
  nodefs.writeFileSync(
    path.join(dir, '.dsh-repowiki/wiki/zh/copy.md'),
    `${encodeFrontmatter({ slug, title: 'Copy' })}\n# Copy\n`,
  )

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.wiki.duplicate, 1, '同一 slug 的清单与磁盘重复只计一次')
  assert.deepEqual(out.wiki.duplicateSlugs, [slug])
  assert.deepEqual(out.wiki.duplicatePaths, [])
  const rendered = repowikiStatusTool(ctx).output.render({}, out)
  assert.match(rendered[0].text, /duplicate 1/)
})

test('repowiki-status：模块依赖热点（跨模块 import 边，按边数）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-deps-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  nodefs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'src/main.ts'),
    "import { b } from '../lib/b';\nexport const a = b;\n")
  nodefs.writeFileSync(path.join(dir, 'lib/b.ts'), 'export const b = 1;\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.deepEqual(out.moduleDependencies, [{ from: 'src', to: 'lib', count: 1 }])
  const rendered = repowikiStatusTool(ctx).output.render({}, out)
  assert.match(rendered[0].text, /Module dependencies: src → lib \(1\)/)
})

test('repowiki-status：索引跳过文件数在 Index 行展示', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-skip-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const indexPath = path.join(dir, '.dsh-repowiki/index.json')
  const index = JSON.parse(nodefs.readFileSync(indexPath, 'utf8'))
  index.stats.skipped = 2
  nodefs.writeFileSync(indexPath, JSON.stringify(index))

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.index.skipped, 2)
  const rendered = repowikiStatusTool(ctx).output.render({}, out)
  assert.match(rendered[0].text, /1 files .* 2 skipped/)
})

test('repowiki-status：文件级循环依赖组（无环为 none，有环为组）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-cycles-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'),
    "import { b } from './b'\nexport const a = b\n")
  nodefs.writeFileSync(path.join(dir, 'b.ts'),
    "import { a } from './a'\nexport const b = a\n")
  nodefs.writeFileSync(path.join(dir, 'c.ts'), 'export const c = 1\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.deepEqual(out.cycles, [{
    files: ['a.ts', 'b.ts'], size: 2, truncated: false,
    sample: ['a.ts', 'b.ts', 'a.ts'],
  }])
  const rendered = repowikiStatusTool(ctx).output.render({}, out)
  assert.match(rendered[0].text, /Import cycles: a\.ts ↔ b\.ts/)
  assert.match(rendered[0].text, /e\.g\. a\.ts → b\.ts → a\.ts/, '短环附具体路径')

  // 空目录 / 无索引：空数组 + (none)
  const emptyDir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-nocycle-'))
  const emptyOut = await repowikiStatusTool(makeCtx(emptyDir)).execute({ locale: 'zh' }, fakeExec)
  assert.deepEqual(emptyOut.cycles, [])
  const emptyRendered = repowikiStatusTool(makeCtx(emptyDir)).output.render({}, emptyOut)
  assert.match(emptyRendered[0].text, /Import cycles: \(none\)/)
})

test('repowiki-status：warnings 渲染有界（前 3 条 + 折叠计数）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-warnings-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export const a = 1\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const indexPath = path.join(dir, '.dsh-repowiki/index.json')
  const index = JSON.parse(nodefs.readFileSync(indexPath, 'utf8'))
  index.warnings = ['w1', 'w2', 'w3', 'w4', 'w5']
  nodefs.writeFileSync(indexPath, JSON.stringify(index))

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.warnings.length, 5, '结构化输出保留全量 warnings')
  const rendered = repowikiStatusTool(ctx).output.render({}, out)[0].text
  assert.match(rendered, /Warning: w1/)
  assert.match(rendered, /Warning: w3/)
  assert.ok(!rendered.includes('Warning: w4'), '第 4 条不进入文本报告')
  assert.match(rendered, /Warning: … \+2 more \(see the structured warnings array\)/)
})

test('repowiki-status：文件级 fan-in hub（按不同依赖方数量排名）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-hubs-'))
  nodefs.writeFileSync(path.join(dir, 'lib.ts'), 'export const lib = 1\n')
  nodefs.writeFileSync(path.join(dir, 'a.ts'), "import { lib } from './lib'\nexport const a = lib\n")
  nodefs.writeFileSync(path.join(dir, 'b.ts'), "import { lib } from './lib'\nexport const b = lib\n")
  nodefs.writeFileSync(path.join(dir, 'c.ts'), "import { lib } from './lib'\nexport const c = lib\n")
  nodefs.writeFileSync(path.join(dir, 'd.ts'), "import { a } from './a'\nexport const d = a\n")
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.deepEqual(out.topDependents[0], { path: 'lib.ts', dependents: 3 }, '被最多文件导入的文件排第一')
  assert.deepEqual(out.topDependents[1], { path: 'a.ts', dependents: 1 }, '并列时按路径升序')
  assert.equal(out.coreFiles[0].path, 'lib.ts', 'PageRank 核心文件同样指向被依赖最深的文件')
  assert.equal(out.coreFiles.length, 5)
  assert.ok(out.coreFiles.every(entry => entry.score > 0))
  const rendered = repowikiStatusTool(ctx).output.render({}, out)
  assert.match(rendered[0].text, /Fan-in hubs: lib\.ts \(3\); a\.ts \(1\)/)
  assert.match(rendered[0].text, /Core files \(PageRank\): lib\.ts \(\d\.\d{4}\)/)
})

test('repowiki-status：Wiki 引用完整性（缺失路径与非索引但存在的文件）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-citations-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  nodefs.mkdirSync(path.join(dir, '.dsh-repowiki/wiki/zh'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'src/a.ts'), 'export const a = 1\n')
  nodefs.writeFileSync(path.join(dir, 'README.md'), '# readme\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  nodefs.writeFileSync(path.join(dir, '.dsh-repowiki/wiki/zh/_index.json'), JSON.stringify({
    schemaVersion: 2,
    pages: [{
      slug: 'overview',
      title: '总览',
      sources: ['src/a.ts#L1-L3', 'README.md'],
      sections: [{ heading: '核心', sources: ['src/missing.ts'] }],
    }],
  }))

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.wiki.manifest, true)
  assert.equal(out.brokenCitations.total, 1)
  assert.equal(out.brokenCitations.references, 1)
  assert.deepEqual(out.brokenCitations.pages, [
    { slug: 'overview', title: '总览', sources: ['src/missing.ts'] },
  ])
  assert.equal(out.brokenCitations.truncated, false)
  assert.ok(out.warnings.some(warning => warning.includes('do not exist')))
  const rendered = repowikiStatusTool(ctx).output.render({}, out)[0].text
  assert.match(rendered, /Broken citations: 1 path\(s\) in 1 page\(s\) — e\.g\. 总览: src\/missing\.ts/)

  nodefs.rmSync(path.join(dir, '.dsh-repowiki/wiki/zh/_index.json'))
  const noManifest = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(noManifest.brokenCitations, undefined)
  assert.ok(!repowikiStatusTool(ctx).output.render({}, noManifest)[0].text.includes('Broken citations'))
})

test('repowiki-status：导出审计只报告可判定的文件', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-unused-'))
  nodefs.writeFileSync(path.join(dir, 'lib.ts'),
    'export const used = 1\nexport const unused = 2\n')
  nodefs.writeFileSync(path.join(dir, 'use.ts'),
    "import { used } from './lib'\nconsole.log(used)\n")
  nodefs.writeFileSync(path.join(dir, 'standalone.ts'), 'export const solo = 1\n')
  nodefs.writeFileSync(path.join(dir, 'lib2.ts'), 'export const s = 1\n')
  nodefs.writeFileSync(path.join(dir, 'side.ts'), "import './lib2'\n")
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.unusedExports.total, 1)
  assert.equal(out.unusedExports.files[0].path, 'lib.ts')
  assert.deepEqual(out.unusedExports.files[0].symbols.map(symbol => symbol.name), ['unused'])
  assert.equal(out.unusedExports.skippedFiles, 2, 'standalone.ts 与 lib2.ts 不具备判定条件')
  assert.equal(out.unusedExports.truncated, false)
  const rendered = repowikiStatusTool(ctx).output.render({}, out)[0].text
  assert.match(rendered, /Unused export candidates: 1 symbol\(s\) in 1 file\(s\) — e\.g\. lib\.ts#unused; 2 file\(s\) not assessed/)
})

test('repowiki-status：模块耦合与不稳定性（跨模块 import）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-coupling-'))
  nodefs.mkdirSync(path.join(dir, 'pkg'), { recursive: true })
  nodefs.mkdirSync(path.join(dir, 'app'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'pkg/base.ts'), 'export const base = 1\n')
  nodefs.writeFileSync(path.join(dir, 'app/use.ts'),
    "import { base } from '../pkg/base'\nexport const use = base\n")
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.deepEqual(out.moduleCoupling.modules, [
    { module: 'app', ca: 0, ce: 1, instability: 1 },
    { module: 'pkg', ca: 1, ce: 0, instability: 0 },
  ])
  assert.equal(out.moduleCoupling.truncated, false)
  const rendered = repowikiStatusTool(ctx).output.render({}, out)[0].text
  assert.match(rendered, /Module instability: app \(1\.00, Ca 0\/Ce 1\); pkg \(0\.00, Ca 1\/Ce 0\)/)
})

test('repowiki-status：Wiki 引用行号越界与未检查计数', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-range-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  nodefs.mkdirSync(path.join(dir, '.dsh-repowiki/wiki/zh'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'src/a.ts'), 'export const a = 1\n')
  nodefs.writeFileSync(path.join(dir, 'README.md'), '# readme\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  nodefs.writeFileSync(path.join(dir, '.dsh-repowiki/wiki/zh/_index.json'), JSON.stringify({
    schemaVersion: 2,
    pages: [{
      slug: 'overview',
      title: '总览',
      sources: ['src/a.ts#L1-L1', 'src/a.ts#L1-L99', 'README.md#L1-L5'],
    }],
  }))

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.citationRangeIssues.total, 1)
  assert.equal(out.citationRangeIssues.unchecked, 1, 'README 存在但未索引，行数未知')
  assert.deepEqual(out.citationRangeIssues.pages, [{
    slug: 'overview',
    title: '总览',
    issues: [{ path: 'src/a.ts', start: 1, end: 99, lines: 1 }],
  }])
  assert.equal(out.citationRangeIssues.truncated, false)
  assert.ok(out.warnings.some(warning => warning.includes('line range')))
  const rendered = repowikiStatusTool(ctx).output.render({}, out)[0].text
  assert.match(rendered, /Citation ranges: 1 out-of-range — e\.g\. 总览: src\/a\.ts#L1-L99 \(file has 1 lines\); 1 unchecked/)
})

test('repowiki-status：引用内容漂移（清单 v3 指纹）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-status-drift-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  nodefs.mkdirSync(path.join(dir, '.dsh-repowiki/wiki/zh'), { recursive: true })
  const source = 'export const a = 1\n'
  nodefs.writeFileSync(path.join(dir, 'src/a.ts'), source)
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const manifestPath = path.join(dir, '.dsh-repowiki/wiki/zh/_index.json')
  nodefs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 3,
    pages: [{
      slug: 'overview',
      title: '总览',
      sources: ['src/a.ts#L1-L1'],
      sections: [{ heading: '核心', sources: ['src/a.ts#L1-L1'] }],
      citationDigests: {
        'src/a.ts#L1-L1': citationDigest(source, 1, 1),
        'src/a.ts#L1': 'deadbeefdead',
        'src/missing.ts#L1-L1': 'cafebabecafe',
      },
    }],
  }))

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.citationDrift.total, 1)
  assert.equal(out.citationDrift.checked, 2)
  assert.equal(out.citationDrift.unchecked, 1, '缺失源文件计入未检查')
  assert.deepEqual(out.citationDrift.pages, [{
    slug: 'overview',
    title: '总览',
    issues: [{ source: 'src/a.ts#L1', path: 'src/a.ts', start: 1, end: 1 }],
  }])
  assert.equal(out.citationDrift.truncated, false)
  assert.ok(out.warnings.some(warning => warning.includes('changed since the wiki was generated')))
  const rendered = repowikiStatusTool(ctx).output.render({}, out)[0].text
  assert.match(rendered, /Citation drift: 1 changed — e\.g\. 总览: src\/a\.ts#L1; 1 unchecked/)

  // 旧清单（无 citationDigests）不做漂移断言
  nodefs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 2,
    pages: [{ slug: 'overview', title: '总览', sources: [], sections: [] }],
  }))
  const legacy = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(legacy.citationDrift, undefined)
  assert.ok(!repowikiStatusTool(ctx).output.render({}, legacy)[0].text.includes('Citation drift'))
})
