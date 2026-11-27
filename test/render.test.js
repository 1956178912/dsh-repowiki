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
  assert.match(md, /> 源文件 \/ Source: `src\/indexer.js`/)
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

test('renderCardMarkdown：关键符号按索引补行号（同名匹配）', () => {
  const md = renderCardMarkdown(usableCard, {
    path: 'src/indexer.js', lang: 'javascript', locale: 'zh', generatedAt: 'now',
    symbols: [{ name: 'buildIndex', kind: 'function', line: 12, endLine: 40 }],
  })
  assert.match(md, /`buildIndex` \(function, L12-L40\): 编排入口/)
})

test('renderWikiMarkdown：引用块、自动目录与章节来源（相对路径 + 行号）', () => {
  const md = renderWikiMarkdown({
    title: '架构', slug: 'architecture', overview: '项目架构。',
    sections: [
      { heading: '核心模块', body: '核心模块正文。', sources: ['src/indexer.js#L12-L40', 'src/symbols.js'] },
      { heading: '数据流', body: '数据流正文。', sources: ['src/indexer.js#L12-L40'] },
    ],
    mermaid: '',
  }, { locale: 'zh', generatedAt: 'now' })

  assert.match(md, /\*\*本文引用的文件\*\*/)
  assert.match(md, /- `src\/indexer\.js#L12-L40`/)
  assert.match(md, /- `src\/symbols\.js`/)
  assert.match(md, /## 目录/)
  assert.match(md, /1\. \[核心模块\]\(#核心模块\)/)
  assert.match(md, /2\. \[数据流\]\(#数据流\)/)
  assert.match(md, /\*\*章节来源：\*\* `src\/indexer\.js#L12-L40` · `src\/symbols\.js`/)
  assert.match(md, /## 数据流[\s\S]*\*\*章节来源：\*\* `src\/indexer\.js#L12-L40`/)
})

test('renderWikiMarkdown：英文标签与重复标题锚点去重', () => {
  const md = renderWikiMarkdown({
    title: 'Arch', slug: 'arch', overview: 'o',
    sections: [
      { heading: 'Core', body: 'a', sources: ['src/a.ts'] },
      { heading: 'Core', body: 'b' },
    ],
    mermaid: '',
  }, { locale: 'en', generatedAt: 'now' })
  assert.match(md, /\*\*Referenced files\*\*/)
  assert.match(md, /## Contents/)
  assert.match(md, /1\. \[Core\]\(#core\)/)
  assert.match(md, /2\. \[Core\]\(#core-1\)/)
  assert.match(md, /\*\*Section sources:\*\* `src\/a\.ts`/)
})

test('renderWikiMarkdown：无来源与少于两节时省略引用块/目录', () => {
  const md = renderWikiMarkdown({
    title: 'P', slug: 'p', overview: 'o',
    sections: [{ heading: 'h', body: 'b' }], mermaid: '',
  }, { locale: 'zh', generatedAt: 'now' })
  assert.doesNotMatch(md, /本文引用的文件/)
  assert.doesNotMatch(md, /## 目录/)
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

test('renderWikiMarkdown：与页面标题同名的章节锚点追加序号', () => {
  const md = renderWikiMarkdown({
    title: '架构', slug: 'arch', overview: 'o',
    sections: [
      { heading: '架构', body: 'a' },
      { heading: '数据', body: 'b' },
    ],
    mermaid: '',
  }, { locale: 'zh', generatedAt: 'now' })
  assert.match(md, /1\. \[架构\]\(#架构-1\)/, '标题占用的锚点不重复给章节')
  assert.match(md, /2\. \[数据\]\(#数据\)/)
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
