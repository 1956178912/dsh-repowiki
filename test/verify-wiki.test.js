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

/** 写索引。 */
function writeIndex(root, files) {
  writeJson(path.join(root, '.dsh-repowiki/index.json'), { schemaVersion: 6, files })
}

/** 写 Wiki 清单。 */
function writeManifest(root, locale, manifest) {
  writeJson(path.join(root, '.dsh-repowiki/wiki', locale, '_index.json'), manifest)
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
    pages: [pageWithDigest('a.ts#L1', citationDigest(text, 1, 1))],
  })

  const result = await verifyWiki({ root, strict: true })
  assert.equal(result.ok, true)
  assert.deepEqual(result.issues, [])
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

  const report = formatReport(result)
  assert.match(report, /Result: FAIL/)
  assert.match(report, /e\.g\. missing Overview: missing\.ts/)
  assert.match(report, /e\.g\. out-of-range Overview: a\.ts#L99-L99/)
  assert.match(report, /e\.g\. drift Overview: a\.ts#L1/)
  assert.match(report, /e\.g\. untracked Overview: 1/)
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

  const strict = await verifyWiki({ root, strict: true })
  assert.equal(strict.ok, false)
  assert.match(strict.issues.join(' '), /1 citation\(s\) have no content digest/)
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
    '--root', '/tmp/demo', '--locale', 'zh', '--locale', 'en', '--strict', '--json',
  ])
  assert.equal(parsed.root, path.resolve('/tmp/demo'))
  assert.deepEqual(parsed.locales, ['zh', 'en'])
  assert.equal(parsed.strict, true)
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
