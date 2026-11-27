/**
 * 知识库健康度：文档覆盖率口径、分量评分与等级边界、状态工具接线。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { documentationCoverage, assessHealth, healthGrade } from '../src/health.js'
import { repowikiIndexTool } from '../src/tool-index.js'
import { repowikiStatusTool } from '../src/tool-status.js'
import { writeCard, writeWikiPage, writeWikiManifest } from '../src/knowledge.js'
import { encodeFrontmatter } from '../src/util.js'

/** 最小 ctx。 */
function makeCtx(dir) {
  return { fs: makeFakeFs(dir), workingDirectory: { get: () => dir } }
}

/** 最小 exec。 */
const fakeExec = { signal: new AbortController().signal, agent: { id: 'owner' } }

/** 构造卡片映射条目。 */
function card(sourceDigest) {
  return { meta: { sourceDigest }, path: 'x.md' }
}

test('health：文档覆盖率只统计有资格的文件并按模块给出缺口', () => {
  const files = [
    { path: 'src/a.ts', module: 'src', digest: 'd1' },
    { path: 'src/b.ts', module: 'src', digest: 'd2' },
    { path: 'lib/c.ts', module: 'lib', digest: 'd3' },
    { path: 'lib/d.ts', module: 'lib', digest: 'd4' },
  ]
  const cards = new Map([
    ['src/a.ts', card('d1')],
    ['src/b.ts', card('old')],
  ])
  const coverage = documentationCoverage(files, cards)
  assert.equal(coverage.eligible, 4)
  assert.equal(coverage.documented, 2)
  assert.equal(coverage.fresh, 1)
  assert.equal(coverage.stale, 1)
  assert.equal(coverage.percent, 50)
  assert.deepEqual(coverage.gaps, [{ module: 'lib', eligible: 2, documented: 0 }])
})

test('health：显式 eligible 子集改变分母', () => {
  const files = [
    { path: 'src/a.ts', module: 'src', digest: 'd1' },
    { path: 'lib/b.ts', module: 'lib', digest: 'd2' },
  ]
  const coverage = documentationCoverage(files, new Map([['src/a.ts', card('d1')]]), ['src/a.ts'])
  assert.equal(coverage.eligible, 1)
  assert.equal(coverage.percent, 100)
  assert.deepEqual(coverage.gaps, [])
})

test('health：全新鲜资产得 A，缺 Wiki 得 B', () => {
  const base = {
    coverage: { eligible: 4, documented: 4, fresh: 4, stale: 0, percent: 100 },
    wiki: { count: 5, stale: 0, orphaned: 0 },
    cycles: [],
    hubs: [{ path: 'src/a.ts', dependents: 2 }],
    warnings: [],
    skipped: 0,
    files: 10,
  }
  const healthy = assessHealth(base)
  assert.equal(healthy.score, 100)
  assert.equal(healthy.grade, 'A')
  assert.equal(healthy.components.length, 4)
  const noWiki = assessHealth({ ...base, wiki: { count: 0, stale: 0, orphaned: 0 } })
  assert.equal(noWiki.score, 75)
  assert.equal(noWiki.grade, 'B')
  assert.match(noWiki.issues[0], /no wiki pages/)
})

test('health：环、告警与跳过文件拉低分数并有待办', () => {
  const result = assessHealth({
    coverage: { eligible: 10, documented: 2, fresh: 1, stale: 1, percent: 20 },
    wiki: { count: 2, stale: 1, orphaned: 0 },
    cycles: [{ files: ['a', 'b'], size: 2 }, { files: ['c', 'd'], size: 2 }],
    hubs: [{ path: 'src/a.ts', dependents: 12 }],
    warnings: ['w1', 'w2', 'w3', 'w4'],
    skipped: 3,
    files: 20,
  })
  assert.ok(result.score < 55, `score ${result.score} should be D`)
  assert.equal(result.grade, 'D')
  assert.deepEqual(
    result.components.map(item => item.key),
    ['documentation', 'wiki', 'architecture', 'hygiene'],
  )
  assert.equal(result.issues.length, 4, 'issues 有界为 4 条')
  assert.match(result.issues[0], /8 eligible/)
})

test('health：引用缺失/越界/漂移扣 Wiki 分量并进入待办', () => {
  const base = {
    coverage: { eligible: 4, documented: 4, fresh: 4, stale: 0, percent: 100 },
    wiki: { count: 4, stale: 0, orphaned: 0 },
    cycles: [],
    hubs: [],
    warnings: [],
    skipped: 0,
  }
  const clean = assessHealth(base)
  assert.equal(clean.score, 100)
  assert.equal(clean.components[1].score, 100)

  const broken = assessHealth({ ...base, citations: { broken: 2 } })
  assert.equal(broken.components[1].score, 80, '缺失路径 10 分/条')
  assert.equal(broken.score, 95)
  assert.match(broken.issues[0], /2 wiki citation path\(s\) are missing/)
  assert.match(broken.components[1].detail, /2 citation issue\(s\)/)

  const all = assessHealth({ ...base, citations: { broken: 1, outOfRange: 1, drift: 1 } })
  assert.equal(all.components[1].score, 80, '缺失 10 + 越界 5 + 漂移 5')
  assert.match(all.issues.join(' '), /line range/)
  assert.match(all.issues.join(' '), /changed since generation/)

  const capped = assessHealth({
    ...base,
    citations: { broken: 99, outOfRange: 99, drift: 99 },
  })
  assert.equal(capped.components[1].score, 20, '引用扣分上限 80，Wiki 分量不归零')
  assert.equal(capped.score, 80)
  assert.ok(capped.grade === 'B')
})

test('health：等级边界', () => {
  assert.equal(healthGrade(100), 'A')
  assert.equal(healthGrade(85), 'A')
  assert.equal(healthGrade(84), 'B')
  assert.equal(healthGrade(70), 'B')
  assert.equal(healthGrade(69), 'C')
  assert.equal(healthGrade(55), 'C')
  assert.equal(healthGrade(54), 'D')
})

test('status：输出覆盖率与健康分并渲染两行', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-health-'))
  for (const name of ['a', 'b', 'c']) {
    nodefs.writeFileSync(
      path.join(dir, `${name}.ts`),
      `export function ${name}1() {}\nexport function ${name}2() {}\nexport function ${name}3() {}\n`,
    )
  }
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const index = JSON.parse(nodefs.readFileSync(path.join(dir, '.dsh-repowiki/index.json'), 'utf8'))
  const digest = name => index.files.find(f => f.path === `${name}.ts`).digest
  const meta = (name, sourceDigest) => `${encodeFrontmatter({
    schemaVersion: 1, path: `${name}.ts`, lang: 'typescript', locale: 'zh',
    sourceDigest, title: name, tags: [], manuallyEdited: false, generatedAt: 'now',
  })}\n# ${name}\n`
  await writeCard(ctx.fs, dir, 'a.ts', 'zh', meta('a', digest('a')))
  await writeCard(ctx.fs, dir, 'b.ts', 'zh', meta('b', 'stale'))

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.coverage.eligible, 3)
  assert.equal(out.coverage.documented, 2)
  assert.equal(out.coverage.fresh, 1)
  assert.equal(out.coverage.stale, 1, 'b.ts 的卡片摘要与索引不一致')
  assert.equal(out.coverage.percent, 67)
  assert.ok(out.health.score >= 0 && out.health.score <= 100)
  assert.ok(['A', 'B', 'C', 'D'].includes(out.health.grade))
  const rendered = repowikiStatusTool(ctx).output.render({}, out)
  assert.match(rendered[0].text, /Docs coverage: 2\/3 eligible file\(s\) \(67%\)/)
  assert.match(rendered[0].text, /Health: \d+\/100 \([ABCD]\)/)
})

test('status：健康分把引用缺陷计入 Wiki 分量', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-health-citations-'))
  for (const name of ['a', 'b', 'c']) {
    nodefs.writeFileSync(
      path.join(dir, `${name}.ts`),
      `export function ${name}1() {}\nexport function ${name}2() {}\nexport function ${name}3() {}\n`,
    )
  }
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  await writeWikiPage(ctx.fs, dir, 'overview', 'zh', '# Overview\n')
  await writeWikiManifest(ctx.fs, dir, 'zh', {
    schemaVersion: 3,
    generatedAt: 'now',
    inputDigest: '',
    memoryDigest: '',
    pages: [{
      slug: 'overview',
      path: 'wiki/zh/overview.md',
      title: 'Overview',
      module: '',
      order: 0,
      sources: ['a.ts#L1', 'missing.ts#L1'],
      sections: [{ heading: 'S', sources: ['a.ts#L1', 'missing.ts#L1'] }],
      citationDigests: { 'a.ts#L1': 'deadbeefdead' },
      generatedAt: 'now',
    }],
  })

  const out = await repowikiStatusTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.equal(out.brokenCitations.total, 1, 'missing.ts 是缺失引用')
  assert.equal(out.citationDrift.total, 1, 'a.ts 内容指纹不匹配')
  assert.deepEqual(out.citationCoverage, {
    total: 2, tracked: 1, untracked: 1, hasDigests: true,
    reasons: { unreadable: 0, range: 0, cap: 0, unknown: 1 },
  }, 'missing.ts 没有指纹，覆盖率必须如实报告')
  const rendered = repowikiStatusTool(ctx).output.render({}, out)[0].text
  assert.match(rendered, /Citation digests: 1\/2 tracked, 1 untracked \(1 unknown\)/)
  const wiki = out.health.components.find(item => item.key === 'wiki')
  assert.equal(wiki.score, 85, '缺失 10 分 + 漂移 5 分')
  assert.match(wiki.detail, /2 citation issue\(s\)/)
  assert.match(out.health.issues.join(' '), /1 wiki citation path\(s\) are missing/)
  assert.match(out.health.issues.join(' '), /changed since generation/)
  const hygiene = out.health.components.find(item => item.key === 'hygiene')
  assert.equal(hygiene.score, 95, '引用告警不重复计入卫生分量')
  assert.equal(out.health.score, 56)
  assert.ok(out.warnings.some(item => /do not exist/.test(item)), '文本告警仍保留引用问题')
})

test('status：无索引时仍给出覆盖率对象但不给健康分', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-health-empty-'))
  const out = await repowikiStatusTool(makeCtx(dir)).execute({ locale: 'zh' }, fakeExec)
  assert.deepEqual(out.coverage, { eligible: 0, documented: 0, fresh: 0, stale: 0, percent: 100, gaps: [] })
  assert.equal(out.health, undefined)
  const rendered = repowikiStatusTool(makeCtx(dir)).output.render({}, out)
  assert.doesNotMatch(rendered[0].text, /Health:/)
})
