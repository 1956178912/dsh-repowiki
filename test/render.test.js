/**
 * 渲染层单元测试：卡片/Wiki Markdown 渲染与卡片可用性校验。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { renderCardMarkdown, renderWikiMarkdown, isUsableCard } from '../src/render.js'

const usableCard = {
  title: '索引编排器',
  summary: '遍历项目文件并组装符号索引。',
  purpose: '把符号提取与依赖边解析编排为 index.json。',
  keySymbols: [{ name: 'buildIndex', kind: 'function', note: '编排入口' }],
  pitfalls: ['符号提取失败时整文件跳过'],
  relatedModules: ['src/symbols.js'],
  tags: ['indexing'],
  skip: false,
}

test('renderCardMarkdown：frontmatter 元数据 + 正文结构完整', () => {
  const md = renderCardMarkdown(usableCard, {
    path: 'src/indexer.js', lang: 'javascript', locale: 'zh', generatedAt: '2026-11-26T00:00:00Z',
  })
  assert.match(md, /^---\n/)
  assert.match(md, /"path": "src\/indexer.js"/)
  assert.match(md, /"schemaVersion": 1/)
  assert.match(md, /# 索引编排器/)
  assert.match(md, /> src\/indexer.js/)
  assert.match(md, /## 概要 \/ Summary/)
  assert.match(md, /`buildIndex` \(function\): 编排入口/)
  assert.match(md, /## 陷阱 \/ Pitfalls/)
  assert.match(md, /符号提取失败时整文件跳过/)
  assert.match(md, /## 相关模块 \/ Related modules/)
  assert.match(md, /src\/symbols.js/)
  assert.match(md, /"sourceDigest": ""/)
})

test('renderCardMarkdown：sourceDigest 显式写入 frontmatter', () => {
  const md = renderCardMarkdown(usableCard, {
    path: 'a.ts', lang: 'typescript', locale: 'en', generatedAt: 'now',
    sourceDigest: 'abc123def456',
  })
  assert.match(md, /"sourceDigest": "abc123def456"/)
})

test('renderCardMarkdown：空陷阱与相关模块渲染为 (none)', () => {
  const md = renderCardMarkdown({ ...usableCard, pitfalls: [], relatedModules: [] }, {
    path: 'a.ts', lang: 'typescript', locale: 'en', generatedAt: 'now',
  })
  assert.match(md, /- \(none\)/)
})

test('renderWikiMarkdown：章节、mermaid 与 frontmatter', () => {
  const md = renderWikiMarkdown({
    title: '总览', slug: 'overview', overview: '项目概况。',
    sections: [{ heading: '核心模块', body: '见 `src/indexer.js`。' }],
    mermaid: 'graph A-->B',
  }, { locale: 'zh', generatedAt: 'now' })
  assert.match(md, /^---\n/)
  assert.match(md, /"slug": "overview"/)
  assert.match(md, /# 总览/)
  assert.match(md, /项目概况。/)
  assert.match(md, /## 核心模块/)
  assert.match(md, /见 `src\/indexer.js`。/)
  assert.match(md, /```mermaid\ngraph A-->B\n```/)
})

test('renderWikiMarkdown：无 mermaid 字段时不产围栏', () => {
  const md = renderWikiMarkdown({
    title: 'P', slug: 'p', overview: 'o',
    sections: [{ heading: 'h', body: 'b' }], mermaid: '',
  }, { locale: 'en', generatedAt: 'now' })
  assert.doesNotMatch(md, /```mermaid/)
})

test('isUsableCard：校验最小可用形态', () => {
  assert.ok(isUsableCard(usableCard))
  assert.ok(!isUsableCard(null))
  assert.ok(!isUsableCard({ ...usableCard, title: '' }))
  assert.ok(!isUsableCard({ ...usableCard, skip: true }))
  assert.ok(!isUsableCard({ title: 'x', summary: 'y', purpose: 'z', keySymbols: [], pitfalls: [], relatedModules: [], tags: [] })) // 缺 skip 字段（boolean undefined）按非 true 处理，仍可用
})
