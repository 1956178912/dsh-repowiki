/**
 * 零依赖 BM25 检索测试：切词、排序、片段与截断。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { tokenize, tokenizeQuery, rankDocuments } from '../src/search.js'

test('tokenize：拉丁词、CJK 单字与二元组', () => {
  const tokens = tokenize('IndexBuilder 索引构建')
  assert.ok(tokens.includes('indexbuilder'))
  assert.ok(tokens.includes('索'))
  assert.ok(tokens.includes('索引'))
  assert.ok(tokens.includes('引构'))
  assert.ok(tokens.includes('构建'))
  assert.deepEqual(tokenize(''), [])
})

test('tokenizeQuery：多字 CJK 只保留双字组，单字查询仍可用', () => {
  assert.deepEqual(tokenizeQuery('无匹配'), ['无匹', '匹配'])
  assert.deepEqual(tokenizeQuery('索引'), ['索引'])
  assert.deepEqual(tokenizeQuery('图'), ['图'])
  assert.deepEqual(tokenizeQuery('IndexBuilder 索引'), ['indexbuilder', '索引'])
  assert.deepEqual(tokenizeQuery(''), [])
})

test('rankDocuments：多字 CJK 查询不再被单字误召回', () => {
  const docs = [
    { id: 'noise', type: 'card', path: 'n.ts', title: '噪声', body: '这里只有一个无序的词' },
    { id: 'hit', type: 'card', path: 'h.ts', title: '命中', body: '这里讨论匹配规则' },
  ]
  const { results } = rankDocuments(docs, '无匹配')
  assert.deepEqual(results.map(r => r.id), ['hit'], '仅含“无”的文档不应命中')
})

test('rankDocuments：标题命中优先于正文命中', () => {
  const docs = [
    { id: 'a', type: 'card', path: 'a.ts', title: 'Index builder', body: 'unrelated text' },
    { id: 'b', type: 'card', path: 'b.ts', title: 'Worker', body: 'the index builder walks files' },
  ]
  const { results, total, truncated } = rankDocuments(docs, 'index builder')
  assert.equal(total, 2)
  assert.equal(truncated, false)
  assert.equal(results[0].id, 'a', '标题权重更高')
  assert.ok(results[0].score > results[1].score)
})

test('rankDocuments：CJK 查询命中中文正文', () => {
  const docs = [
    { id: 'zh', type: 'wiki', path: 'wiki/zh/arch.md', title: '系统架构', body: '索引器遍历仓库并提取符号。' },
    { id: 'en', type: 'wiki', path: 'wiki/zh/ui.md', title: '面板', body: '渲染卡片与详情。' },
  ]
  const { results } = rankDocuments(docs, '索引')
  assert.equal(results.length, 1)
  assert.equal(results[0].id, 'zh')
  assert.ok(results[0].snippet.includes('索引'))
})

test('rankDocuments：空查询与 limit 截断', () => {
  const docs = Array.from({ length: 5 }, (_, i) => ({
    id: `d${i}`, type: 'card', path: `f${i}.ts`, title: 'Alpha', body: 'alpha body',
  }))
  assert.deepEqual(rankDocuments(docs, ''), { results: [], total: 0, truncated: false })
  const limited = rankDocuments(docs, 'alpha', { limit: 2 })
  assert.equal(limited.results.length, 2)
  assert.equal(limited.total, 5)
  assert.equal(limited.truncated, true)
})

test('rankDocuments：片段长度有界且带省略号', () => {
  const long = '前缀'.repeat(100) + '目标关键字' + '后缀'.repeat(100)
  const docs = [{ id: 'x', type: 'card', path: 'x.ts', title: 'X', body: long }]
  const { results } = rankDocuments(docs, '目标关键字')
  assert.equal(results.length, 1)
  assert.ok(results[0].snippet.length <= 162, '片段有界')
  assert.ok(results[0].snippet.includes('目标关键字'))
})

test('rankDocuments：标题命中但正文无命中 → 片段取正文开头', () => {
  const docs = [{ id: 't', type: 'card', title: 'Alpha', body: 'body without the word' }]
  const { results } = rankDocuments(docs, 'alpha')
  assert.equal(results.length, 1)
  assert.equal(results[0].snippet, 'body without the word')
})

test('rankDocuments：无正文回退摘要、仅有标题给空片段与空路径', () => {
  const withSummary = rankDocuments(
    [{ id: 's', type: 'wiki', path: 'w.md', title: 'Beta', summary: 'beta summary' }],
    'beta',
  )
  assert.equal(withSummary.results[0].snippet, 'beta summary')

  const titleOnly = rankDocuments([{ id: 'o', type: 'wiki', title: 'Gamma' }], 'gamma')
  assert.equal(titleOnly.results[0].snippet, '')
  assert.equal(titleOnly.results[0].path, '', '缺 path 归一为空串')
})

test('rankDocuments：无命中词返回空、同分按路径与标题稳定排序', () => {
  assert.deepEqual(
    rankDocuments([{ id: 'x', type: 'card', title: 'X', body: 'x' }], 'zzz').results,
    [],
  )
  const docs = [
    { id: '1', type: 'card', path: 'b.ts', title: 'Same', body: 'alpha' },
    { id: '2', type: 'card', path: 'a.ts', title: 'Same', body: 'alpha' },
    { id: '3', type: 'card', path: 'a.ts', title: 'Alpha', body: 'alpha' },
  ]
  const ids = rankDocuments(docs, 'alpha').results.map(r => r.id)
  assert.deepEqual(ids, ['3', '2', '1'], '标题权重优先，其后按路径升序')

  const firstPage = rankDocuments(docs, 'alpha', { limit: 1 })
  assert.deepEqual(firstPage.results.map(r => r.id), ['3'])
  assert.equal(firstPage.truncated, true)
  const secondPage = rankDocuments(docs, 'alpha', { limit: 1, offset: 1 })
  assert.deepEqual(secondPage.results.map(r => r.id), ['2'])
  assert.equal(secondPage.total, 3, 'offset 不改变全集计数')
  assert.equal(secondPage.truncated, true)
  const lastPage = rankDocuments(docs, 'alpha', { limit: 1, offset: 2 })
  assert.deepEqual(lastPage.results.map(r => r.id), ['1'])
  assert.equal(lastPage.truncated, false, '最后一页不再标记截断')
})
