/**
 * Wiki 引用反查纯函数测试：页面级/章节级、`#Lx-Ly` 归一、去重、截断。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeWikiSource, buildWikiReferenceIndex, wikiReferencesFor,
  findBrokenWikiCitations, MAX_WIKI_REFERENCE_ENTRIES,
} from '../src/wiki-references.js'

test('normalizeWikiSource：去空白并剥离行号片段', () => {
  assert.equal(normalizeWikiSource('src/a.ts'), 'src/a.ts')
  assert.equal(normalizeWikiSource(' src/a.ts#L1-L10 '), 'src/a.ts')
  assert.equal(normalizeWikiSource(''), '')
  assert.equal(normalizeWikiSource(null), '')
  assert.equal(normalizeWikiSource(42), '')
})

test('buildWikiReferenceIndex：章节级与页面级引用归并、去重、排序', () => {
  const index = buildWikiReferenceIndex({
    pages: [
      {
        slug: 'overview',
        title: 'Overview',
        sources: ['src/a.ts', 'src/b.ts#L2-L5'],
        sections: [
          { heading: 'Core', sources: ['src/a.ts#L1-L10'] },
          { heading: 'Flow', sources: ['src/a.ts'] },
          { heading: 'Core', sources: ['src/a.ts'] },
        ],
      },
      {
        slug: 'modules/x',
        title: 'Module X',
        sources: ['src/b.ts'],
        sections: [],
      },
      null,
    ],
  })

  assert.deepEqual(index.get('src/a.ts'), [
    { slug: 'overview', title: 'Overview', sections: ['Core', 'Flow'] },
  ])
  assert.deepEqual(index.get('src/b.ts'), [
    { slug: 'modules/x', title: 'Module X', sections: [] },
    { slug: 'overview', title: 'Overview', sections: [] },
  ], '页面级引用无章节时 sections 为空，页面按标题排序')
})

test('buildWikiReferenceIndex：v1 清单（无 sections）按页面级来源降级', () => {
  const index = buildWikiReferenceIndex({
    pages: [{ slug: 'old', title: 'Old Page', sources: ['src/a.ts'] }],
  })
  assert.deepEqual(index.get('src/a.ts'), [{ slug: 'old', title: 'Old Page', sections: [] }])
  assert.equal(index.size, 1)
})

test('buildWikiReferenceIndex：缺失/坏清单返回空索引', () => {
  assert.equal(buildWikiReferenceIndex(null).size, 0)
  assert.equal(buildWikiReferenceIndex({}).size, 0)
  assert.equal(buildWikiReferenceIndex({ pages: 'nope' }).size, 0)
  assert.equal(buildWikiReferenceIndex({ pages: [{ sources: [null, '', 7] }] }).size, 0)
})

test('wikiReferencesFor：保持文件顺序并按上限截断', () => {
  const index = buildWikiReferenceIndex({
    pages: [
      { slug: 'p1', title: 'P1', sources: ['a.ts', 'b.ts'] },
      { slug: 'p2', title: 'P2', sources: ['a.ts'] },
    ],
  })

  const result = wikiReferencesFor(index, ['a.ts', 'missing.ts', 'b.ts'])
  assert.deepEqual(result.wikiReferences, [
    { path: 'a.ts', slug: 'p1', title: 'P1', sections: [] },
    { path: 'a.ts', slug: 'p2', title: 'P2', sections: [] },
    { path: 'b.ts', slug: 'p1', title: 'P1', sections: [] },
  ])
  assert.equal(result.truncated, false)

  const limited = wikiReferencesFor(index, ['a.ts', 'b.ts'], 1)
  assert.equal(limited.wikiReferences.length, 1)
  assert.equal(limited.truncated, true, '达到上限时如实标记截断')
})

test('MAX_WIKI_REFERENCE_ENTRIES 是有界输出常量', () => {
  assert.equal(typeof MAX_WIKI_REFERENCE_ENTRIES, 'number')
  assert.ok(MAX_WIKI_REFERENCE_ENTRIES > 0 && MAX_WIKI_REFERENCE_ENTRIES <= 500)
})

test('findBrokenWikiCitations：缺失路径按页面归并、去重并保留引用次数', () => {
  const broken = findBrokenWikiCitations({
    pages: [
      {
        slug: 'overview', title: 'Overview',
        sources: ['src/a.ts', 'src/missing.ts#L1-L5'],
        sections: [
          { heading: 'Core', sources: ['src/missing.ts', 'gone.md'] },
          { heading: 'Flow', sources: ['src/a.ts'] },
        ],
      },
      { slug: 'empty', title: 'Empty', sources: ['src/a.ts'] },
    ],
  }, new Set(['src/a.ts']))
  assert.equal(broken.total, 2)
  assert.equal(broken.references, 3)
  assert.deepEqual(broken.pages, [
    { slug: 'overview', title: 'Overview', sources: ['gone.md', 'src/missing.ts'] },
  ])
  assert.equal(broken.truncated, false)
  const none = findBrokenWikiCitations({ pages: [] }, [])
  assert.deepEqual(none, { total: 0, references: 0, pages: [], truncated: false })
  assert.deepEqual(findBrokenWikiCitations(null), { total: 0, references: 0, pages: [], truncated: false })
})

test('findBrokenWikiCitations：页面明细有界但总数不受展示截断影响', () => {
  const pages = Array.from({ length: 12 }, (_, index) => ({
    slug: `p${index}`,
    title: `P${index}`,
    sources: [`missing-${index}.ts`],
  }))
  const broken = findBrokenWikiCitations({ pages }, [])
  assert.equal(broken.total, 12)
  assert.equal(broken.references, 12)
  assert.equal(broken.pages.length, 10)
  assert.equal(broken.truncated, true)
})
