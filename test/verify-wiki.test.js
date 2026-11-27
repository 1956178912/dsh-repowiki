/**
 * verify:wiki 门禁：干净资产、断链/越界/漂移失败、严格模式、CLI 契约。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { verifyWiki, parseArgs, formatReport, main } from '../scripts/verify-wiki.mjs'
import { citationDigest } from '../src/citation-digest.js'
import { MEMORY_SCHEMA_VERSION } from '../src/schema.js'
import { digestText, encodeFrontmatter } from '../src/util.js'
import { wikiGraphText } from '../src/wiki-graph.js'

/** 建临时项目根。 */
function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-verify-'))
}

/** 写 JSON 文件（自动建目录）。 */
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2))
}

/** 写文本文件（自动建目录）。 */
function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, value)
}

/** 写索引（默认 v6；可指定旧版本以测试行号校验降级）。 */
function writeIndex(root, files, schemaVersion = 6, edges = []) {
  writeJson(path.join(root, '.dsh-repowiki/index.json'), { schemaVersion, files, edges })
}

/** 写 Wiki 清单，并为清单页落盘占位 Markdown（与 generate 产物一致）。 */
function writeManifest(root, locale, manifest) {
  writeJson(path.join(root, '.dsh-repowiki/wiki', locale, '_index.json'), manifest)
  for (const page of Array.isArray(manifest.pages) ? manifest.pages : []) {
    if (typeof page?.slug !== 'string' || !page.slug) continue
    const title = typeof page.title === 'string' && page.title ? page.title : page.slug
    writeText(
      path.join(root, '.dsh-repowiki/wiki', locale, `${page.slug}.md`),
      `${encodeFrontmatter({ slug: page.slug, title })}\n# ${title}\n`,
    )
  }
}

/** 构造带指纹的单页清单。 */
function pageWithDigest(source, digest) {
  return {
    slug: 'overview',
    title: 'Overview',
    sources: [source],
    sections: [{ heading: 'S', sources: [source] }],
    citationDigests: { [source]: digest },
  }
}

test('verify-wiki：干净资产严格模式通过', async () => {
  const root = makeRoot()
  const text = 'one\ntwo\n'
  writeText(path.join(root, 'a.ts'), text)
  writeIndex(root, [{ path: 'a.ts', lines: 2 }])
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    inputDigest: digestText('', 16),
    memoryDigest: digestText('', 16),
    pages: [pageWithDigest('a.ts#L1', citationDigest(text, 1, 1))],
  })

  const result = await verifyWiki({ root, strict: true })
  assert.equal(result.ok, true)
  assert.deepEqual(result.issues, [])
  assert.deepEqual(result.problems, [])
  assert.equal(result.locales.length, 1)
  assert.deepEqual(result.totals, {
    pages: 1,
    citations: 1,
    tracked: 1,
    untracked: 0,
    broken: 0,
    outOfRange: 0,
    drift: 0,
  })
  assert.match(formatReport(result), /Result: PASS/)
})

test('verify-wiki：断链、越界与漂移均失败并给出示例', async () => {
  const root = makeRoot()
  const text = 'one\ntwo\n'
  writeText(path.join(root, 'a.ts'), text)
  writeIndex(root, [{ path: 'a.ts', lines: 2 }])
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    pages: [{
      slug: 'overview',
      title: 'Overview',
      sources: ['a.ts#L1', 'a.ts#L99', 'missing.ts#L1'],
      sections: [{ heading: 'S', sources: ['a.ts#L1', 'a.ts#L99', 'missing.ts#L1'] }],
      citationDigests: {
        'a.ts#L1': 'deadbeefdead',
        'a.ts#L99': 'cafebabecafe',
      },
    }],
  })

  const result = await verifyWiki({ root })
  assert.equal(result.ok, false)
  assert.equal(result.totals.broken, 1)
  assert.equal(result.totals.outOfRange, 1)
  assert.equal(result.totals.drift, 1)
  assert.equal(result.totals.untracked, 1)
  const messages = result.issues.join(' ')
  assert.match(messages, /missing citation path/)
  assert.match(messages, /out of bounds/)
  assert.match(messages, /changed since generation/)
  const codes = result.problems.map(problem => problem.code).sort()
  assert.deepEqual(codes, [
    'citation/drift',
    'citation/missing',
    'citation/range',
    'citation/unchecked',
    'citation/untracked',
    'manifest/missing-digests',
  ])

  const report = formatReport(result)
  assert.match(report, /Result: FAIL/)
  assert.match(report, /e\.g\. missing Overview: missing\.ts/)
  assert.match(report, /e\.g\. out-of-range Overview: a\.ts#L99-L99/)
  assert.match(report, /e\.g\. drift Overview: a\.ts#L1/)
  assert.match(report, /e\.g\. untracked Overview: 1/)
})

test('verify-wiki：卡片变化导致 Wiki 陈旧', async () => {
  const root = makeRoot()
  const text = 'one\ntwo\n'
  writeText(path.join(root, 'a.ts'), text)
  writeIndex(root, [{ path: 'a.ts', lines: 2 }])
  const cardMeta = sourceDigest => ({
    schemaVersion: 1,
    path: 'a.ts',
    lang: 'typescript',
    locale: 'zh',
    sourceDigest,
    title: 'A',
    tags: [],
    manuallyEdited: false,
    generatedAt: 'now',
  })
  const cardFile = path.join(root, '.dsh-repowiki/knowledge/zh/a.md')
  writeText(cardFile, `${encodeFrontmatter(cardMeta('d1'))}\n# A\n`)
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    inputDigest: digestText('a.ts:d1', 16),
    pages: [pageWithDigest('a.ts#L1', citationDigest(text, 1, 1))],
  })

  const fresh = await verifyWiki({ root })
  assert.equal(fresh.ok, true)
  assert.equal(fresh.locales[0].stale, false)

  writeText(cardFile, `${encodeFrontmatter(cardMeta('d2'))}\n# A\n`)
  const stale = await verifyWiki({ root })
  assert.equal(stale.ok, false)
  assert.equal(stale.locales[0].stale, true)
  assert.deepEqual(stale.locales[0].staleReasons, ['cards'])
  assert.match(stale.issues.join(' '), /wiki is stale: cards changed/)
  assert.ok(stale.problems.some(problem => problem.code === 'wiki/stale-cards'
    && problem.severity === 'error'))
  assert.match(formatReport(stale), /\(stale: cards\)/)
})

test('verify-wiki：索引结构变化导致 Wiki 陈旧', async () => {
  const root = makeRoot()
  const text = 'one\ntwo\n'
  writeText(path.join(root, 'a.ts'), text)
  writeIndex(root, [{ path: 'a.ts', lines: 2 }])
  writeText(path.join(root, '.dsh-repowiki/knowledge/zh/a.md'), `${encodeFrontmatter({
    schemaVersion: 1,
    path: 'a.ts',
    lang: 'typescript',
    locale: 'zh',
    sourceDigest: 'd1',
    title: 'A',
    tags: [],
    manuallyEdited: false,
    generatedAt: 'now',
  })}\n# A\n`)
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    inputDigest: digestText('a.ts:d1', 16),
    graphDigest: digestText(wikiGraphText({ files: [{ path: 'a.ts' }], edges: [] }), 16),
    pages: [pageWithDigest('a.ts#L1', citationDigest(text, 1, 1))],
  })

  const fresh = await verifyWiki({ root })
  assert.equal(fresh.ok, true, '结构指纹一致时通过')

  writeIndex(
    root,
    [{ path: 'a.ts', lines: 2 }, { path: 'b.ts', lines: 1 }],
    6,
    [{ from: 'a.ts', to: 'b.ts' }],
  )
  const stale = await verifyWiki({ root })
  assert.equal(stale.ok, false)
  assert.deepEqual(stale.locales[0].staleReasons, ['graph'])
  assert.ok(stale.problems.some(problem => problem.code === 'wiki/stale-graph'
    && problem.severity === 'error'))
  assert.match(stale.issues.join(' '), /dependency graph changed/)
})

test('verify-wiki：已采信记忆变化导致 Wiki 陈旧', async () => {
  const root = makeRoot()
  writeText(path.join(root, 'a.ts'), 'one\ntwo\n')
  writeIndex(root, [{ path: 'a.ts', lines: 2 }])
  const memoryFile = path.join(root, '.dsh-repowiki/memory/zh/demo.md')
  const memoryText = (status, body) => `${encodeFrontmatter({
    schemaVersion: MEMORY_SCHEMA_VERSION,
    kind: 'memory',
    title: 'Demo',
    tags: [],
    status,
    createdAt: 'now',
  })}\n# Demo\n\n${body}\n`
  writeText(memoryFile, memoryText('accepted', 'body-1'))
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    inputDigest: digestText('', 16),
    memoryDigest: digestText('demo:body-1', 16),
    pages: [pageWithDigest('a.ts#L1', citationDigest('one\ntwo\n', 1, 1))],
  })

  const fresh = await verifyWiki({ root })
  assert.equal(fresh.ok, true)
  assert.equal(fresh.locales[0].stale, false)

  writeText(memoryFile, memoryText('accepted', 'body-2'))
  const stale = await verifyWiki({ root })
  assert.equal(stale.ok, false)
  assert.equal(stale.locales[0].stale, true)
  assert.deepEqual(stale.locales[0].staleReasons, ['memory'])
  assert.match(stale.issues.join(' '), /wiki is stale: accepted memory changed/)
  assert.ok(stale.problems.some(problem => problem.code === 'wiki/stale-memory'))
  assert.match(formatReport(stale), /\(stale: memory\)/)

  // 未采信（pending/rejected）记忆不参与 generate 的输入指纹：
  // 恢复已采信内容后再加一条 pending，不应判陈旧。
  writeText(memoryFile, memoryText('accepted', 'body-1'))
  writeText(path.join(root, '.dsh-repowiki/memory/zh/extra.md'), memoryText('pending', 'draft'))
  const pending = await verifyWiki({ root })
  assert.equal(pending.ok, true)
  assert.equal(pending.locales[0].stale, false)
})

test('verify-wiki：未覆盖默认警告，严格模式失败', async () => {
  const root = makeRoot()
  writeText(path.join(root, 'a.ts'), 'one\ntwo\n')
  writeIndex(root, [{ path: 'a.ts', lines: 2 }])
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    pages: [{
      slug: 'overview',
      title: 'Overview',
      sources: ['a.ts#L1'],
      sections: [{ heading: 'S', sources: ['a.ts#L1'] }],
    }],
  })

  const lenient = await verifyWiki({ root })
  assert.equal(lenient.ok, true)
  assert.match(lenient.warnings.join(' '), /1 citation\(s\) have no content digest/)
  assert.equal(lenient.totals.untracked, 1)
  assert.ok(lenient.problems.some(problem => problem.code === 'citation/untracked'
    && problem.severity === 'warning'))

  const strict = await verifyWiki({ root, strict: true })
  assert.equal(strict.ok, false)
  assert.match(strict.issues.join(' '), /1 citation\(s\) have no content digest/)
  assert.match(strict.issues.join(' '), /manifest has no inputDigest\/memoryDigest/)
  assert.ok(strict.problems.some(problem => problem.code === 'citation/untracked'
    && problem.severity === 'error'))
})

test('verify-wiki：空清单默认告警，严格与必需模式失败', async () => {
  const root = makeRoot()
  writeIndex(root, [])
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    inputDigest: digestText('', 16),
    memoryDigest: digestText('', 16),
    pages: [],
  })

  const lenient = await verifyWiki({ root })
  assert.equal(lenient.ok, true)
  assert.match(lenient.warnings.join(' '), /manifest lists no pages/)
  assert.ok(lenient.problems.some(problem => problem.code === 'manifest/empty'
    && problem.severity === 'warning'))

  const strict = await verifyWiki({ root, strict: true })
  assert.equal(strict.ok, false)
  assert.ok(strict.problems.some(problem => problem.code === 'manifest/empty'
    && problem.severity === 'error'))

  const required = await verifyWiki({ root, requireAssets: true })
  assert.equal(required.ok, false)
  assert.match(required.issues.join(' '), /manifest lists no pages/)
})

test('verify-wiki：清单页面缺失失败，孤儿页仅警告', async () => {
  const root = makeRoot()
  writeText(path.join(root, 'a.ts'), 'one\ntwo\n')
  writeIndex(root, [{ path: 'a.ts', lines: 2 }])
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    inputDigest: digestText('', 16),
    memoryDigest: digestText('', 16),
    pages: [pageWithDigest('a.ts#L1', citationDigest('one\ntwo\n', 1, 1))],
  })

  const complete = await verifyWiki({ root })
  assert.equal(complete.ok, true)
  assert.equal(complete.locales[0].pageFiles, 1)

  fs.rmSync(path.join(root, '.dsh-repowiki/wiki/zh/overview.md'))
  writeText(
    path.join(root, '.dsh-repowiki/wiki/zh/extra.md'),
    `${encodeFrontmatter({ slug: 'extra', title: 'Extra' })}\n# Extra\n`,
  )
  const broken = await verifyWiki({ root })
  assert.equal(broken.ok, false)
  assert.match(broken.issues.join(' '), /page\(s\) in the manifest have no file on disk/)
  assert.match(broken.warnings.join(' '), /page file\(s\) are not in the manifest/)
  assert.deepEqual(broken.locales[0].missingPages, ['overview'])
  assert.deepEqual(broken.locales[0].orphanedPages, ['extra'])
  const codes = broken.problems.map(problem => problem.code)
  assert.ok(codes.includes('wiki/missing-pages'))
  assert.ok(codes.includes('wiki/orphaned-pages'))
})

test('verify-wiki：上次生成失败页默认告警，严格模式失败', async () => {
  const root = makeRoot()
  writeText(path.join(root, 'a.ts'), 'one\ntwo\n')
  writeIndex(root, [{ path: 'a.ts', lines: 2 }])
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    inputDigest: digestText('', 16),
    memoryDigest: digestText('', 16),
    failed: [{ slug: 'overview', reason: 'write failed' }],
    failedTotal: 1,
    pages: [pageWithDigest('a.ts#L1', citationDigest('one\ntwo\n', 1, 1))],
  })

  const lenient = await verifyWiki({ root })
  assert.equal(lenient.ok, true)
  assert.equal(lenient.locales[0].failedPages, 1)
  assert.match(lenient.warnings.join(' '), /1 failed page/)
  assert.ok(lenient.problems.some(problem => problem.code === 'wiki/generation-failed'
    && problem.severity === 'warning'))

  const strict = await verifyWiki({ root, strict: true })
  assert.equal(strict.ok, false)
  assert.match(strict.issues.join(' '), /1 failed page/)
  assert.ok(strict.problems.some(problem => problem.code === 'wiki/generation-failed'
    && problem.severity === 'error'))
})

test('verify-wiki：旧索引缺少行数时默认告警，严格模式失败', async () => {
  const root = makeRoot()
  writeText(path.join(root, 'a.ts'), 'one\ntwo\n')
  writeIndex(root, [{ path: 'a.ts' }], 5)
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    inputDigest: digestText('', 16),
    memoryDigest: digestText('', 16),
    pages: [pageWithDigest('a.ts#L1', citationDigest('one\ntwo\n', 1, 1))],
  })

  const lenient = await verifyWiki({ root })
  assert.equal(lenient.ok, true)
  assert.match(lenient.warnings.join(' '), /index schema v5 has no line counts/)
  assert.ok(lenient.problems.some(problem => problem.code === 'index/outdated'
    && problem.severity === 'warning'))

  const strict = await verifyWiki({ root, strict: true })
  assert.equal(strict.ok, false)
  assert.ok(strict.problems.some(problem => problem.code === 'index/outdated'
    && problem.severity === 'error'))
  assert.ok(strict.problems.some(problem => problem.code === 'citation/range-unchecked'
    && problem.severity === 'error'))
})

test('verify-wiki：页面内部死链与越界链接失败', async () => {
  const root = makeRoot()
  writeText(path.join(root, 'a.ts'), 'one\ntwo\n')
  writeIndex(root, [{ path: 'a.ts', lines: 2 }])
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    inputDigest: digestText('', 16),
    memoryDigest: digestText('', 16),
    pages: [pageWithDigest('a.ts#L1', citationDigest('one\ntwo\n', 1, 1))],
  })
  const pageFile = path.join(root, '.dsh-repowiki/wiki/zh/overview.md')
  const front = encodeFrontmatter({ slug: 'overview', title: 'Overview' })
  writeText(pageFile, `${front}\n# Overview\n\n[missing](missing.md) [web](https://example.com/x.md) [top](#overview) ![img](pic.md)\n`)

  const broken = await verifyWiki({ root })
  assert.equal(broken.ok, false)
  assert.ok(broken.problems.some(problem => problem.code === 'wiki/broken-link'
    && problem.severity === 'error'))
  assert.ok(!broken.problems.some(problem => problem.code === 'wiki/unsafe-link'))
  assert.match(formatReport(broken), /e\.g\. broken link overview → \.dsh-repowiki\/wiki\/zh\/missing\.md/)

  writeText(pageFile, `${front}\n# Overview\n\n[outside](../../../../etc/passwd.md)\n`)
  const unsafe = await verifyWiki({ root })
  assert.equal(unsafe.ok, false)
  assert.ok(unsafe.problems.some(problem => problem.code === 'wiki/unsafe-link'))
})

test('verify-wiki：页面链接到项目内源码/文档时相对项目根解析', async () => {
  const root = makeRoot()
  writeText(path.join(root, 'src/a.ts'), 'one\ntwo\n')
  writeText(path.join(root, 'docs/guide.md'), '# Guide\n')
  writeText(path.join(root, 'README.md'), '# Root\n')
  writeIndex(root, [{ path: 'src/a.ts', lines: 2 }])
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    inputDigest: digestText('', 16),
    memoryDigest: digestText('', 16),
    pages: [pageWithDigest('src/a.ts#L1', citationDigest('one\ntwo\n', 1, 1))],
  })
  const pageFile = path.join(root, '.dsh-repowiki/wiki/zh/overview.md')
  const front = encodeFrontmatter({ slug: 'overview', title: 'Overview' })
  writeText(pageFile, [
    `${front}`,
    '# Overview',
    '',
    '[source](../../../src/a.ts#L1-L2) [guide](../../../docs/guide.md)',
    '[root](../../../README.md)',
    '',
  ].join('\n'))

  const ok = await verifyWiki({ root })
  assert.equal(ok.ok, true, ok.issues.join(' | '))
  assert.ok(!ok.problems.some(problem => problem.code === 'wiki/broken-link'))
  assert.ok(!ok.problems.some(problem => problem.code === 'wiki/unsafe-link'))

  writeText(pageFile, `${front}\n# Overview\n\n[gone](../../../src/gone.ts)\n`)
  const broken = await verifyWiki({ root })
  assert.equal(broken.ok, false)
  assert.ok(broken.problems.some(problem => problem.code === 'wiki/broken-link'))
  assert.match(formatReport(broken), /e\.g\. broken link overview → src\/gone\.ts/)
})

test('verify-wiki：清单页面路径非法或与文件位置不符失败', async () => {
  const root = makeRoot()
  writeText(path.join(root, 'a.ts'), 'one\ntwo\n')
  writeIndex(root, [{ path: 'a.ts', lines: 2 }])
  const base = {
    schemaVersion: 3,
    inputDigest: digestText('', 16),
    memoryDigest: digestText('', 16),
  }
  writeManifest(root, 'zh', {
    ...base,
    pages: [{ ...pageWithDigest('a.ts#L1', citationDigest('one\ntwo\n', 1, 1)), path: '../secret.md' }],
  })
  const invalid = await verifyWiki({ root })
  assert.equal(invalid.ok, false)
  assert.ok(invalid.problems.some(problem => problem.code === 'wiki/invalid-page-path'))

  writeManifest(root, 'zh', {
    ...base,
    pages: [{ ...pageWithDigest('a.ts#L1', citationDigest('one\ntwo\n', 1, 1)), path: 'wiki/zh/other.md' }],
  })
  const mismatch = await verifyWiki({ root })
  assert.equal(mismatch.ok, false)
  assert.ok(mismatch.problems.some(problem => problem.code === 'wiki/page-path-mismatch'))
})

test('verify-wiki：重复页面 slug 与清单重复条目失败', async () => {
  const root = makeRoot()
  const text = 'one\ntwo\n'
  writeText(path.join(root, 'a.ts'), text)
  writeIndex(root, [{ path: 'a.ts', lines: 2 }])
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    inputDigest: digestText('', 16),
    memoryDigest: digestText('', 16),
    pages: [pageWithDigest('a.ts#L1', citationDigest(text, 1, 1))],
  })
  writeText(
    path.join(root, '.dsh-repowiki/wiki/zh/copy.md'),
    `${encodeFrontmatter({ slug: 'overview', title: 'Copy' })}\n# Copy\n`,
  )

  const duplicatePage = await verifyWiki({ root })
  assert.equal(duplicatePage.ok, false)
  assert.ok(duplicatePage.problems.some(problem => problem.code === 'wiki/duplicate-page-slug'
    && problem.severity === 'error'))
  assert.match(formatReport(duplicatePage), /Copy|copy\.md/)

  const root2 = makeRoot()
  writeText(path.join(root2, 'a.ts'), text)
  writeIndex(root2, [{ path: 'a.ts', lines: 2 }])
  const page = pageWithDigest('a.ts#L1', citationDigest(text, 1, 1))
  writeManifest(root2, 'zh', {
    schemaVersion: 3,
    inputDigest: digestText('', 16),
    memoryDigest: digestText('', 16),
    pages: [page, { ...page }],
  })

  const duplicateManifest = await verifyWiki({ root: root2 })
  assert.equal(duplicateManifest.ok, false)
  assert.ok(duplicateManifest.problems.some(problem => problem.code === 'manifest/duplicate-pages'
    && problem.severity === 'error'))
})


test('verify-wiki：并发读取多卡片并跳过坏卡', async () => {
  const root = makeRoot()
  writeText(path.join(root, 'a.ts'), 'one\n')
  writeText(path.join(root, 'b.ts'), 'two\n')
  writeIndex(root, [{ path: 'a.ts', lines: 1 }, { path: 'b.ts', lines: 1 }])
  const card = (sourcePath, digest) => `${encodeFrontmatter({
    schemaVersion: 1, path: sourcePath, lang: 'typescript', locale: 'zh',
    sourceDigest: digest, title: sourcePath, tags: [], manuallyEdited: false, generatedAt: 'now',
  })}\n# ${sourcePath}\n`
  writeText(path.join(root, '.dsh-repowiki/knowledge/zh/a.md'), card('a.ts', 'd1'))
  writeText(path.join(root, '.dsh-repowiki/knowledge/zh/b.md'), card('b.ts', 'd2'))
  writeText(path.join(root, '.dsh-repowiki/knowledge/zh/broken.md'), 'not a card')
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    inputDigest: digestText('a.ts:d1\nb.ts:d2', 16),
    memoryDigest: digestText('', 16),
    pages: [pageWithDigest('a.ts#L1', citationDigest('one\n', 1, 1))],
  })

  const result = await verifyWiki({ root })
  assert.equal(result.ok, true)
  assert.equal(result.locales[0].stale, false)
})

test('verify-wiki：--require 让缺失资产在 CI 中失败', async () => {
  const root = makeRoot()
  const optional = await verifyWiki({ root })
  assert.equal(optional.ok, true)
  assert.deepEqual(optional.warnings, ['no wiki manifests found'])

  const required = await verifyWiki({ root, requireAssets: true })
  assert.equal(required.ok, false)
  assert.match(required.issues.join(' '), /no wiki manifests found/)
  assert.deepEqual(required.problems, [
    { code: 'assets/missing', severity: 'error', message: 'no wiki manifests found' },
  ])

  const script = fileURLToPath(new URL('../scripts/verify-wiki.mjs', import.meta.url))
  const cli = spawnSync(process.execPath, [script, '--root', root, '--require'], { encoding: 'utf8' })
  assert.equal(cli.status, 1)
  assert.match(cli.stdout, /Result: FAIL/)
})

test('verify-wiki：显式 locale 缺失失败，无 Wiki 则通过', async () => {
  const root = makeRoot()
  const missing = await verifyWiki({ root, locales: ['en'] })
  assert.equal(missing.ok, false)
  assert.match(missing.issues.join(' '), /en: .*_index\.json is missing/)

  const empty = makeRoot()
  const none = await verifyWiki({ root: empty })
  assert.equal(none.ok, true)
  assert.deepEqual(none.warnings, ['no wiki manifests found'])
  assert.deepEqual(none.locales, [])
})

test('verify-wiki：参数解析与非法输入', () => {
  const parsed = parseArgs([
    '--root', '/tmp/demo', '--locale', 'zh', '--locale', 'en', '--strict', '--require', '--json',
  ])
  assert.equal(parsed.root, path.resolve('/tmp/demo'))
  assert.deepEqual(parsed.locales, ['zh', 'en'])
  assert.equal(parsed.strict, true)
  assert.equal(parsed.require, true)
  assert.equal(parsed.json, true)
  assert.throws(() => parseArgs(['--bogus']), /unknown argument/)
  assert.throws(() => parseArgs(['--locale', '../x']), /invalid locale/)
  assert.throws(() => parseArgs(['--root']), /requires a directory/)
})

test('verify-wiki：main 输出 JSON 并返回退出码', async () => {
  const root = makeRoot()
  writeText(path.join(root, 'a.ts'), 'one\ntwo\n')
  writeIndex(root, [{ path: 'a.ts', lines: 2 }])
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    pages: [pageWithDigest('a.ts#L1', citationDigest('one\ntwo\n', 1, 1))],
  })

  const logs = []
  const original = console.log
  console.log = (...args) => logs.push(args.join(' '))
  try {
    assert.equal(await main(['--root', root, '--json']), 0)
    const parsed = JSON.parse(logs[0])
    assert.equal(parsed.ok, true)
    assert.equal(parsed.totals.citations, 1)
    assert.ok(Array.isArray(parsed.problems))

    logs.length = 0
    assert.equal(await main(['--help']), 0)
    assert.match(logs[0], /Usage: node scripts\/verify-wiki\.mjs/)
  } finally {
    console.log = original
  }
})

test('verify-wiki：CLI 进程退出码契约', () => {
  const root = makeRoot()
  writeText(path.join(root, 'a.ts'), 'one\ntwo\n')
  writeIndex(root, [{ path: 'a.ts', lines: 2 }])
  writeManifest(root, 'zh', {
    schemaVersion: 3,
    pages: [pageWithDigest('a.ts#L1', citationDigest('one\ntwo\n', 1, 1))],
  })
  const script = fileURLToPath(new URL('../scripts/verify-wiki.mjs', import.meta.url))

  const pass = spawnSync(process.execPath, [script, '--root', root, '--json'], { encoding: 'utf8' })
  assert.equal(pass.status, 0)
  assert.equal(JSON.parse(pass.stdout).ok, true)

  fs.rmSync(path.join(root, 'a.ts'))
  writeIndex(root, [])
  const fail = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' })
  assert.equal(fail.status, 1)
  assert.match(fail.stdout, /Result: FAIL/)
})
