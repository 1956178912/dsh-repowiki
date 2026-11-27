/**
 * 任务上下文打包：标识符提取、文件排序、源码证据、字符预算与工具接线。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import {
  contextTerms, rankContextFiles, buildContextSnippets, packContextPack, resolveSymbolAnchors,
} from '../src/context.js'
import { repowikiContextTool } from '../src/tool-context.js'
import { repowikiIndexTool } from '../src/tool-index.js'
import { repowikiEditTool } from '../src/tool-edit.js'

process.env.LANG = 'en'

function makeCtx(dir) {
  return { fs: makeFakeFs(dir), workingDirectory: { get: () => dir } }
}
const fakeExec = { signal: new AbortController().signal, agent: { id: 'owner' } }

function indexFixture() {
  return {
    files: [
      {
        path: 'src/config.ts', lang: 'typescript',
        symbols: [{ name: 'parseConfig', kind: 'function', line: 4, endLine: 8, exported: true }],
      },
      {
        path: 'src/config-helper.ts', lang: 'typescript',
        symbols: [{ name: 'parseConfigHelper', kind: 'function', line: 1, endLine: 2, exported: true }],
      },
      {
        path: 'src/other.ts', lang: 'typescript',
        symbols: [{ name: 'unrelated', kind: 'function', line: 1, endLine: 2, exported: true }],
      },
    ],
    edges: [],
  }
}

test('context：自然语言提取标识符并去重/过滤停用词', () => {
  assert.deepEqual(contextTerms('Please modify parseConfig and parseConfig in src/config.ts'), ['parseConfig', 'src', 'config'])
  assert.deepEqual(contextTerms('修复配置解析'), [])
})

test('context：精确定义优先于路径命中，显式路径与文档路由优先', () => {
  const index = indexFixture()
  const ranked = rankContextFiles(index, { query: 'update parseConfig', limit: 2 })
  assert.equal(ranked.files[0].path, 'src/config.ts')
  assert.equal(ranked.files[0].symbols[0].name, 'parseConfig')
  assert.ok(ranked.files[0].score > ranked.files[1].score)
  const explicit = rankContextFiles(index, {
    query: 'parseConfig', paths: ['src/other.ts'], documentPaths: ['src/config-helper.ts'], limit: 3,
  })
  assert.equal(explicit.files[0].path, 'src/other.ts', '显式 anchor 必须排第一')
  assert.ok(explicit.files.some(file => file.path === 'src/config-helper.ts'), '文档可路由回源文件')
  const chinese = rankContextFiles(index, { query: '修复配置解析', documentPaths: ['src/config.ts'] })
  assert.equal(chinese.files[0].path, 'src/config.ts')
})

test('context：源码片段带真实行号、限制长符号并合并重叠范围', () => {
  const source = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n')
  const file = {
    symbols: [
      { name: 'parseConfig', kind: 'function', line: 10, endLine: 90, exported: true },
      { name: 'parseConfigHelper', kind: 'function', line: 12, endLine: 15, exported: true },
    ],
  }
  const snippets = buildContextSnippets(source, file, ['parseConfig'], { maxLines: 20 })
  assert.equal(snippets.length, 1, '重叠定义合并为一个证据段')
  assert.equal(snippets[0].line, 7)
  assert.equal(snippets[0].endLine, 32)
  assert.equal(snippets[0].truncated, true)
  assert.match(snippets[0].text, /^7 \| line 7/)
  assert.match(snippets[0].text, /32 \| line 32/)
})

test('context：预算硬上限与省略计数，不用截断冒充完整', () => {
  const snippets = Array.from({ length: 8 }, (_, i) => ({
    path: `src/f${i}.ts`, line: 1, endLine: 30,
    text: Array.from({ length: 30 }, (__, line) => `${line + 1} | ${'x'.repeat(80)}`).join('\n'),
  }))
  const documents = Array.from({ length: 8 }, (_, i) => ({
    type: 'card', path: `src/f${i}.ts`, title: `Card ${i}`, snippet: 'y'.repeat(150),
  }))
  const pack = packContextPack({
    query: 'parseConfig', budget: 2000,
    files: snippets.map(snippet => `- ${snippet.path}`),
    snippets, documents,
    relations: Array.from({ length: 20 }, (_, i) => `relation ${i}`),
  })
  assert.ok(pack.usedChars <= 2000, `实际 ${pack.usedChars} 超出预算`)
  assert.equal(pack.text.length, pack.usedChars)
  assert.equal(pack.truncated, true)
  assert.ok(pack.omitted.snippets > 0)
  assert.ok(pack.omitted.documents > 0)
  assert.ok(pack.omitted.relations > 0)
  assert.match(pack.text, /# Repository context/)
})

test('repowiki-context：真实索引+卡片路由+源码证据+关系一次打包', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-context-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'src/a.ts'),
    'export function parseConfig() {\n  return { ok: true }\n}\nexport function otherHelper() {}\n')
  nodefs.writeFileSync(path.join(dir, 'src/b.ts'),
    "import { parseConfig } from './a'\nexport const config = parseConfig()\n")
  nodefs.writeFileSync(path.join(dir, 'src/c.ts'),
    "import { otherHelper } from './a'\nexport const other = otherHelper()\n")
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  await repowikiEditTool(ctx).execute({
    action: 'create', path: 'src/a.ts', title: '配置解析',
    body: 'parseConfig 负责读取配置并校验；修改时注意返回结构。', locale: 'zh',
  }, fakeExec)

  const tool = repowikiContextTool(ctx)
  const out = await tool.execute({ query: '修改 parseConfig 的配置解析逻辑', budget: 5000 }, fakeExec)
  assert.equal(out.indexed, true)
  assert.equal(out.files[0].path, 'src/a.ts')
  assert.equal(out.files[0].symbols[0].name, 'parseConfig')
  assert.equal(out.locale, 'zh')
  assert.equal(out.localeSource, 'fallback')
  assert.ok(out.snippets.some(snippet => snippet.path === 'src/a.ts' && snippet.text.includes('parseConfig')))
  assert.ok(out.documents.some(doc => doc.type === 'card' && doc.title === '配置解析'))
  const relation = out.relations.find(item => item.path === 'src/a.ts')
  assert.ok(relation.dependents.some(item => item.path === 'src/b.ts'))
  assert.ok(out.usedChars <= out.budget)
  assert.match(out.text, /## Source evidence/)
  assert.match(out.text, /## Knowledge documents/)
  assert.match(out.text, /src\/a.ts:1-/)
  assert.match(out.text, /fan-in src\/a.ts: 2/)
  assert.match(tool.output.render({}, out)[0].text, /Context pack: \d+\/5000 chars/)
})

test('repowiki-context：无命中时用 PageRank 仓库地图兜底并明确标注', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-context-repomap-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'src/base.ts'), 'export const base = 1\n')
  nodefs.writeFileSync(path.join(dir, 'src/core.ts'),
    "import { base } from './base';\nexport const core = base\n")
  nodefs.writeFileSync(path.join(dir, 'src/app.ts'),
    "import { core } from './core';\nexport const app = core\n")
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const tool = repowikiContextTool(ctx)
  const out = await tool.execute({ query: 'zzz completely unrelated', budget: 4000 }, fakeExec)
  assert.equal(out.indexed, true)
  assert.equal(out.fallback, 'repo-map')
  assert.ok(out.files.length > 0)
  assert.equal(out.files[0].path, 'src/base.ts', '链式依赖中下游文件 PageRank 最高')
  assert.equal(out.files[0].score, 0, '兜底文件不冒充任务相关性分数')
  assert.ok(out.snippets.length > 0, '兜底仍提供文件头源码证据')
  assert.match(out.text, /\(repo map\)/)
  assert.match(out.text, /not on task relevance/)
  assert.match(out.hint, /not as task relevance/)
  assert.doesNotMatch(out.hint, /No source file matched/)
  const rendered = tool.output.render({}, out)[0].text
  assert.match(rendered, /Context pack: \d+\/4000 chars/)
})

test('context：符号锚点解析（限定路径/裸名唯一/歧义/未命中/重载）', () => {
  const index = {
    files: [
      {
        path: 'src/a.ts',
        symbols: [
          { name: 'shared', kind: 'function', line: 2 },
          { name: 'onlyA', kind: 'class', line: 8 },
        ],
      },
      { path: 'src/b.ts', symbols: [{ name: 'shared', kind: 'function', line: 5 }] },
      { path: 'lib/a.ts', symbols: [{ name: 'shared', kind: 'function', line: 1 }] },
    ],
    edges: [],
  }
  assert.deepEqual(resolveSymbolAnchors(index, ['src/a.ts#shared']).resolved, [
    { path: 'src/a.ts', name: 'shared', kind: 'function', line: 2 },
  ])
  assert.deepEqual(resolveSymbolAnchors(index, ['/repo/src/a.ts#shared'], '/repo').resolved, [
    { path: 'src/a.ts', name: 'shared', kind: 'function', line: 2 },
  ])
  assert.deepEqual(resolveSymbolAnchors(index, ['onlyA']).resolved, [
    { path: 'src/a.ts', name: 'onlyA', kind: 'class', line: 8 },
  ])
  const bareAmbiguous = resolveSymbolAnchors(index, ['shared'])
  assert.deepEqual(bareAmbiguous.resolved, [])
  assert.deepEqual(bareAmbiguous.ambiguous, [
    { query: 'shared', candidates: ['lib/a.ts', 'src/a.ts', 'src/b.ts'] },
  ])
  const pathAmbiguous = resolveSymbolAnchors(index, ['a.ts#shared'])
  assert.deepEqual(pathAmbiguous.resolved, [])
  assert.deepEqual(pathAmbiguous.ambiguous, [
    { query: 'a.ts#shared', candidates: ['lib/a.ts', 'src/a.ts'] },
  ])
  assert.deepEqual(resolveSymbolAnchors(index, ['missing', 'nope.ts#shared']).unmatched, [
    'missing', 'nope.ts#shared',
  ])
  const overloads = {
    files: [{
      path: 'x.ts',
      symbols: [
        { name: 'over', kind: 'function', line: 9 },
        { name: 'over', kind: 'function', line: 5 },
      ],
    }],
    edges: [],
  }
  assert.deepEqual(resolveSymbolAnchors(overloads, ['over']).resolved, [
    { path: 'x.ts', name: 'over', kind: 'function', line: 5 },
  ])
  assert.deepEqual(resolveSymbolAnchors(index, []), { resolved: [], unmatched: [], ambiguous: [] })
})

test('repowiki-context：符号锚点可在无 query 时定位定义并生成片段', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-context-symbols-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'src/config.ts'),
    'export function parseConfig() { return 1 }\nexport function shared() { return 2 }\n')
  nodefs.writeFileSync(path.join(dir, 'src/other.ts'),
    'export function shared() { return 3 }\n')
  nodefs.writeFileSync(path.join(dir, 'src/use.ts'),
    "import { parseConfig } from './config'\nexport const value = parseConfig()\n")
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const tool = repowikiContextTool(ctx)

  const anchored = await tool.execute({
    symbols: ['src/config.ts#parseConfig'], budget: 3000, includeDocs: false,
  }, fakeExec)
  assert.equal(anchored.indexed, true)
  assert.equal(anchored.query, '')
  assert.deepEqual(anchored.symbolAnchors, [
    { path: 'src/config.ts', name: 'parseConfig', kind: 'function', line: 1 },
  ])
  assert.equal(anchored.files[0].path, 'src/config.ts')
  assert.ok(anchored.snippets.some(snippet => snippet.path === 'src/config.ts'
    && snippet.line <= 1 && snippet.endLine >= 1))
  assert.match(anchored.text, /Task: symbols: src\/config\.ts#parseConfig/)
  assert.match(anchored.text, /parseConfig/)
  assert.equal(anchored.usages, undefined, '默认不扫使用点')

  const withUsages = await tool.execute({
    symbols: ['src/config.ts#parseConfig'], usages: true, budget: 3000, includeDocs: false,
  }, fakeExec)
  assert.equal(withUsages.usages.length, 1)
  assert.equal(withUsages.usages[0].symbol, 'parseConfig')
  assert.deepEqual(withUsages.usages[0].importers, [{ path: 'src/use.ts', line: 1 }])
  assert.deepEqual(withUsages.usages[0].usages, [
    { path: 'src/use.ts', line: 2, text: 'export const value = parseConfig()' },
  ])
  assert.match(withUsages.text, /usage parseConfig in src\/config\.ts/)
  assert.match(withUsages.text, /parseConfig used at src\/use\.ts:2/)

  const bare = await tool.execute({ symbols: ['shared'], budget: 3000, includeDocs: false }, fakeExec)
  assert.deepEqual(bare.symbolAnchors, [])
  assert.deepEqual(bare.ambiguousSymbols, [
    { query: 'shared', candidates: ['src/config.ts', 'src/other.ts'] },
  ])
  assert.equal(bare.files.length, 0, '给了锚点却歧义时不回退到 repo map')
  assert.match(bare.text, /Ambiguous symbol anchor shared/)
  assert.match(bare.hint, /None of the provided anchors matched/)

  const missing = await tool.execute({ symbols: ['notThere'], budget: 3000, includeDocs: false }, fakeExec)
  assert.deepEqual(missing.unmatchedSymbols, ['notThere'])
  assert.match(missing.text, /Unmatched symbol anchors: notThere/)
  assert.match(missing.hint, /None of the provided anchors matched/)
})

test('repowiki-context：无索引、空查询与无源码命中均如实降级', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-context-empty-'))
  const ctx = makeCtx(dir)
  const tool = repowikiContextTool(ctx)
  const noIndex = await tool.execute({ query: 'parseConfig' }, fakeExec)
  assert.equal(noIndex.indexed, false)
  assert.match(noIndex.hint, /repowiki-index/)
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export const value = 1\n')
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const emptyQuery = await tool.execute({ query: ' ' }, fakeExec)
  assert.match(emptyQuery.hint, /query is required/)
  const noMatch = await tool.execute({ query: '完全无关的任务', budget: 2000 }, fakeExec)
  assert.equal(noMatch.files.length, 0)
  assert.equal(noMatch.snippets.length, 0)
  assert.ok(noMatch.usedChars <= 2000)
  assert.match(noMatch.hint, /No source file matched/)
  assert.match(tool.output.render({}, noMatch)[0].text, /no indexed file matched/)

  const originalRead = ctx.fs.readText
  ctx.fs.readText = async (filePath, options) => {
    const displayPath = String(filePath.displayPath ?? filePath)
    if (/(?:^|\/)a\.ts$/.test(displayPath)) throw new Error('simulated source read failure')
    return originalRead(filePath, options)
  }
  const unreadable = await tool.execute({ query: 'value', includeDocs: false }, fakeExec)
  ctx.fs.readText = originalRead
  assert.equal(unreadable.files[0].path, 'a.ts')
  assert.equal(unreadable.snippets.length, 0)
  assert.match(unreadable.text, /Source unreadable: a\.ts/)

  const metadataOnly = await tool.execute({
    query: 'value', paths: ['missing.ts'], includeDocs: false, includeSource: false,
  }, fakeExec)
  assert.equal(metadataOnly.snippets.length, 0)
  assert.equal(metadataOnly.documents.length, 0)
  assert.deepEqual(metadataOnly.unmatched, ['missing.ts'])
  assert.match(metadataOnly.text, /Unmatched anchor paths: missing\.ts/)
  assert.equal(tool.presentCall({ query: 'value' }).rawInput.budget, 12000)
})
