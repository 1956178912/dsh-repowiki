/**
 * 引用漂移检测：一致/变化/不可读/不安全路径、读取上限与旧清单。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { checkCitationDrift, summarizeCitationCoverage } from '../src/citation-drift.js'
import { citationDigest } from '../src/citation-digest.js'

test('citation-coverage：按页去重统计引用与已记录指纹', () => {
  const coverage = summarizeCitationCoverage({
    pages: [
      {
        sources: ['a.ts#L1', 'b.ts#L1'],
        sections: [{ sources: ['a.ts#L1', 'c.ts#L1'] }],
        citationDigests: { 'a.ts#L1': 'aaaaaaaaaaaa' },
        citationMisses: { 'b.ts#L1': 'range' },
      },
      {
        sources: ['d.ts#L1'],
        citationMisses: { 'd.ts#L1': 'unreadable' },
      },
    ],
  })
  assert.deepEqual(coverage, {
    total: 4,
    tracked: 1,
    untracked: 3,
    hasDigests: true,
    reasons: { unreadable: 1, range: 1, cap: 0, unknown: 1 },
  })
})

test('citation-coverage：空清单、旧清单与空指纹', () => {
  assert.equal(summarizeCitationCoverage(null), null)
  assert.equal(summarizeCitationCoverage({}), null)
  assert.deepEqual(summarizeCitationCoverage({ pages: [] }), {
    total: 0,
    tracked: 0,
    untracked: 0,
    hasDigests: false,
    reasons: { unreadable: 0, range: 0, cap: 0, unknown: 0 },
  })
  assert.deepEqual(
    summarizeCitationCoverage({ pages: [{ sources: ['a.ts#L1'], citationDigests: {} }] }),
    {
      total: 1,
      tracked: 0,
      untracked: 1,
      hasDigests: false,
      reasons: { unreadable: 0, range: 0, cap: 0, unknown: 1 },
    },
  )
  assert.deepEqual(
    summarizeCitationCoverage({ pages: [{ sources: ['a.ts#L1'], citationDigests: { 'a.ts#L1': '' } }] }),
    {
      total: 1,
      tracked: 0,
      untracked: 1,
      hasDigests: false,
      reasons: { unreadable: 0, range: 0, cap: 0, unknown: 1 },
    },
    '空字符串不算已记录指纹',
  )
})

test('citation-drift：一致、变化、不可读与不安全路径', async () => {
  const source = 'a\nb\n'
  const manifest = {
    pages: [{
      slug: 'p',
      title: 'P',
      citationDigests: {
        'a.ts#L1-L1': citationDigest(source, 1, 1),
        'a.ts#L2': 'deadbeefdead',
        '../secret#L1': 'cafebabecafe',
        'gone.ts#L1': '0123456789ab',
      },
    }],
  }
  const reads = []
  const result = await checkCitationDrift(manifest, async (rel) => {
    reads.push(rel)
    return rel === 'a.ts' ? source : null
  })
  assert.equal(result.total, 1)
  assert.equal(result.checked, 2)
  assert.equal(result.unchecked, 2, '不安全路径与不可读文件计入未检查')
  assert.deepEqual(result.pages, [{
    slug: 'p',
    title: 'P',
    issues: [{ source: 'a.ts#L2', path: 'a.ts', start: 2, end: 2 }],
  }])
  assert.deepEqual(reads, ['a.ts', 'gone.ts'],
    '同一文件只读取一次；缺失文件会尝试读取一次并计入未检查；不读取上跳路径')
  assert.equal(result.truncated, false)
})

test('citation-drift：没有指纹的清单返回 null', async () => {
  assert.equal(await checkCitationDrift(null, async () => null), null)
  assert.equal(await checkCitationDrift({ pages: [] }, async () => null), null)
  assert.equal(await checkCitationDrift({ pages: [{ slug: 'p', title: 'P' }] }, async () => null), null)
})

test('citation-drift：超出比较上限的条目计入未检查', async () => {
  const manifest = {
    pages: [{
      slug: 'p',
      title: 'P',
      citationDigests: {
        'a.ts#L1': citationDigest('a\n', 1, 1),
        'b.ts#L1': citationDigest('b\n', 1, 1),
      },
    }],
  }
  const result = await checkCitationDrift(
    manifest,
    async () => 'a\n',
    { maxEntries: 1 },
  )
  assert.equal(result.checked, 1)
  assert.equal(result.unchecked, 1, '未参与比较的条目不得静默忽略')
  assert.equal(result.total, 0)
  assert.equal(result.truncated, true)
})

test('citation-drift：有界并发读取且结果与顺序一致', async () => {
  const pages = Array.from({ length: 5 }, (_, i) => ({
    slug: `p${i}`,
    title: `P${i}`,
    citationDigests: { [`f${i}.ts#L1`]: citationDigest('x\n', 1, 1) },
  }))
  let active = 0
  let maxActive = 0
  let reads = 0
  const result = await checkCitationDrift({ pages }, async () => {
    reads++
    active++
    maxActive = Math.max(maxActive, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active--
    return 'x\n'
  }, { concurrency: 3 })
  assert.equal(result.checked, 5)
  assert.equal(result.total, 0)
  assert.equal(result.unchecked, 0)
  assert.equal(reads, 5)
  assert.equal(maxActive, 3, '并发上限被遵守')
})

test('citation-drift：concurrency=1 退化为串行', async () => {
  const pages = Array.from({ length: 3 }, (_, i) => ({
    slug: `p${i}`,
    title: `P${i}`,
    citationDigests: { [`f${i}.ts#L1`]: citationDigest('x\n', 1, 1) },
  }))
  let active = 0
  let maxActive = 0
  const result = await checkCitationDrift({ pages }, async () => {
    active++
    maxActive = Math.max(maxActive, active)
    await new Promise(resolve => setTimeout(resolve, 2))
    active--
    return 'x\n'
  }, { concurrency: 1 })
  assert.equal(result.checked, 3)
  assert.equal(maxActive, 1)
})

test('citation-drift：读取上限触发 unchecked', async () => {
  const manifest = {
    pages: [{
      slug: 'p',
      title: 'P',
      citationDigests: { 'a.ts#L1': 'aaaaaaaaaaaa', 'b.ts#L1': 'bbbbbbbbbbbb' },
    }],
  }
  const result = await checkCitationDrift(
    manifest,
    async (rel) => (rel === 'a.ts' ? 'a\n' : 'b\n'),
    { maxReads: 1 },
  )
  assert.equal(result.checked, 1)
  assert.equal(result.unchecked, 1)
  assert.equal(result.total, 1, '读到的 a.ts 指纹不匹配')
})
