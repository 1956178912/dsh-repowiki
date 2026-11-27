/**
 * 变更影响面：路径匹配、反向 BFS、循环/枢纽、文档影响、风险分层与工具接线。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import {
  normalizeImpactPath, matchChangedPaths, computeImpact, computeSymbolImpact, resolveSymbolChanges,
  cyclesForChanged, hubsForChanged, affectedDocs, assessRisk,
} from '../src/impact.js'
import { repowikiImpactTool } from '../src/tool-impact.js'
import { repowikiIndexTool } from '../src/tool-index.js'
import { repowikiEditTool } from '../src/tool-edit.js'

// 固定环境语言，避免测试机 LANG 不同导致 fallback/preferred 分支漂移
process.env.LANG = 'en'

/** 最小 ctx。 */
function makeCtx(dir) {
  return { fs: makeFakeFs(dir), workingDirectory: { get: () => dir } }
}

/** 最小 exec。 */
const fakeExec = { signal: new AbortController().signal, agent: { id: 'owner' } }

/** 建一个带索引文件的最小索引文档。 */
function indexWith(paths) {
  return {
    files: paths.map(path => ({
      path,
      lang: 'typescript',
      symbols: [{ name: 'x', kind: 'function', line: 1, endLine: 1, exported: true }],
      digest: `digest:${path}`,
    })),
    edges: [],
  }
}

test('impact：路径归一与精确/后缀/basename/歧义/未命中', () => {
  assert.equal(normalizeImpactPath('./src\\a.ts'), 'src/a.ts')
  assert.equal(normalizeImpactPath('  //src//a.ts '), 'src/a.ts')
  const index = indexWith(['src/a.ts', 'other/a.ts', 'src/lib/b.ts', 'unique/c.ts'])
  const exact = matchChangedPaths(index, ['src/a.ts'])
  assert.deepEqual(exact, { matched: ['src/a.ts'], unmatched: [], ambiguous: [] })
  const absolute = matchChangedPaths(index, ['/repo/src/a.ts'], '/repo')
  assert.deepEqual(absolute.matched, ['src/a.ts'])
  const windows = matchChangedPaths(index, ['C:\\repo\\src\\a.ts'], 'C:/repo')
  assert.deepEqual(windows.matched, ['src/a.ts'])
  const suffix = matchChangedPaths(index, ['lib/b.ts'])
  assert.deepEqual(suffix.matched, ['src/lib/b.ts'])
  const ambiguous = matchChangedPaths(index, ['a.ts'])
  assert.equal(ambiguous.matched.length, 0)
  assert.deepEqual(ambiguous.ambiguous, [{ query: 'a.ts', candidates: ['other/a.ts', 'src/a.ts'] }])
  const missing = matchChangedPaths(index, ['nope.ts'])
  assert.deepEqual(missing.unmatched, ['nope.ts'])
  const caseInsensitive = matchChangedPaths(index, ['SRC/A.TS'])
  assert.deepEqual(caseInsensitive.matched, ['src/a.ts'])
})

test('impact：多源反向 BFS 最小跳数、符号只附直接依赖、截断统计精确', () => {
  const edges = [
    { from: 'b.ts', to: 'a.ts', symbols: ['a1'] },
    { from: 'c.ts', to: 'b.ts', symbols: ['b1'] },
    { from: 'd.ts', to: 'b.ts', symbols: ['b1'] },
    { from: 'e.ts', to: 'a.ts', symbols: ['a2'] },
  ]
  const full = computeImpact(edges, ['a.ts'], 2, 10)
  assert.equal(full.total, 4)
  assert.equal(full.direct, 2)
  assert.equal(full.truncated, false)
  assert.deepEqual(full.impacted, [
    { path: 'b.ts', depth: 1, symbols: ['a1'] },
    { path: 'e.ts', depth: 1, symbols: ['a2'] },
    { path: 'c.ts', depth: 2, symbols: [] },
    { path: 'd.ts', depth: 2, symbols: [] },
  ])
  const oneHop = computeImpact(edges, ['a.ts'], 1, 10)
  assert.equal(oneHop.total, 2)
  assert.equal(oneHop.impacted.every(item => item.depth === 1), true)
  const capped = computeImpact(edges, ['a.ts'], 2, 2)
  assert.equal(capped.impacted.length, 2)
  assert.equal(capped.total, 4, '截断后仍继续计数')
  assert.equal(capped.truncated, true)
})

test('impact：符号过滤只保留具名导入证据，传递层保持保守且总数有界', () => {
  const index = indexWith(['src/a.ts'])
  index.files[0].symbols = [
    { name: 'a1', kind: 'function', line: 1 },
    { name: 'a2', kind: 'function', line: 2 },
  ]
  const resolved = resolveSymbolChanges(index, ['src/a.ts'], ['a1', 'src/a.ts#a2', 'missing'])
  assert.deepEqual(resolved.resolved.map(item => `${item.path}#${item.name}`), ['src/a.ts#a1', 'src/a.ts#a2'])
  assert.deepEqual(resolved.unmatched, ['missing'])
  const edges = [
    { from: 'b.ts', to: 'src/a.ts', line: 3, symbols: ['a1'] },
    { from: 'other.ts', to: 'src/a.ts', line: 4, symbols: ['a2'] },
    { from: 'side-effect.ts', to: 'src/a.ts', line: 5, symbols: [] },
    { from: 'c.ts', to: 'b.ts', symbols: ['b1'] },
    { from: 'd.ts', to: 'c.ts', symbols: ['c1'] },
  ]
  const one = computeSymbolImpact(edges, resolved.resolved.filter(item => item.name === 'a1'), 3, 10)
  assert.equal(one.direct, 1)
  assert.equal(one.total, 3)
  assert.deepEqual(one.impacted, [
    { path: 'b.ts', depth: 1, symbols: ['a1'] },
    { path: 'c.ts', depth: 2, symbols: [] },
    { path: 'd.ts', depth: 3, symbols: [] },
  ])
  assert.deepEqual(one.references, [{ path: 'b.ts', line: 3, symbols: ['a1'] }])
  const all = computeSymbolImpact(edges, resolved.resolved, 1, 10)
  assert.equal(all.total, 2, '同文件其他符号的导入方可单独纳入，但副作用导入不算符号引用')
  assert.deepEqual(all.impacted.map(item => item.path), ['b.ts', 'other.ts'])
  const empty = computeSymbolImpact(edges, [], 2, 10)
  assert.equal(empty.total, 0, '未解析符号不能静默放大为文件级影响')
})

test('impact：命名空间导入按通配符纳入符号级影响', () => {
  const index = indexWith(['src/a.ts'])
  index.files[0].symbols = [
    { name: 'a1', kind: 'function', line: 1 },
    { name: 'a2', kind: 'function', line: 2 },
  ]
  const resolved = resolveSymbolChanges(index, ['src/a.ts'], ['a1'])
  const edges = [
    { from: 'ns.ts', to: 'src/a.ts', line: 1, symbols: ['*'] },
    { from: 'b.ts', to: 'src/a.ts', line: 2, symbols: ['a2'] },
  ]
  const result = computeSymbolImpact(edges, resolved.resolved, 1, 10)
  assert.equal(result.direct, 1, '通配符导入计入 a1 的直接影响')
  assert.deepEqual(result.impacted, [{ path: 'ns.ts', depth: 1, symbols: ['a1'] }])
  assert.deepEqual(result.references, [{ path: 'ns.ts', line: 1, symbols: ['a1'] }])
})

test('impact：Rust/Go 通配导入只计入公开模块级符号', () => {
  const files = [
    {
      path: 'src/lib.rs',
      lang: 'rust',
      symbols: [
        { name: 'PublicFn', kind: 'function', exported: true },
        { name: 'private_fn', kind: 'function', exported: false },
        { name: 'run', kind: 'method', exported: true, parent: 'Thing' },
      ],
    },
  ]
  const result = computeSymbolImpact(
    [{ from: 'src/app.rs', to: 'src/lib.rs', line: 1, symbols: ['*'] }],
    [
      { path: 'src/lib.rs', name: 'PublicFn' },
      { path: 'src/lib.rs', name: 'private_fn' },
      { path: 'src/lib.rs', name: 'run' },
    ],
    1, 10, files,
  )
  assert.equal(result.direct, 1)
  assert.deepEqual(result.impacted, [{ path: 'src/app.rs', depth: 1, symbols: ['PublicFn'] }])
  assert.deepEqual(result.references, [{ path: 'src/app.rs', line: 1, symbols: ['PublicFn'] }])
})

test('impact：barrel 再导出链把最终导入方与中间 barrel 计入直接影响', () => {
  const edges = [
    { from: 'index.ts', to: 'core.ts', kind: 'export-from', line: 1, symbols: ['*'] },
    { from: 'outer.ts', to: 'index.ts', kind: 'export-from', line: 1, symbols: ['*'] },
    { from: 'app.ts', to: 'outer.ts', kind: 'import', line: 2, symbols: ['parse'] },
  ]
  const files = [
    { path: 'index.ts', symbols: [] },
    { path: 'outer.ts', symbols: [] },
    { path: 'core.ts', symbols: [{ name: 'parse', exported: true }] },
  ]
  const result = computeSymbolImpact(
    edges, [{ path: 'core.ts', name: 'parse' }], 1, 10, files,
  )
  assert.equal(result.direct, 3, 'barrel 与最终导入方都是直接影响')
  assert.deepEqual(result.impacted.map(item => [item.path, item.depth, item.symbols]), [
    ['app.ts', 1, ['parse']],
    ['index.ts', 1, ['parse']],
    ['outer.ts', 1, ['parse']],
  ])
  assert.deepEqual(result.references, [
    { path: 'app.ts', line: 2, symbols: ['parse'] },
    { path: 'index.ts', line: 1, symbols: ['parse'] },
    { path: 'outer.ts', line: 1, symbols: ['parse'] },
  ])
})

test('repowiki-impact：符号模式穿过 barrel 再导出链', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-impact-barrel-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'src/core.ts'), 'export function parse() { return 1 }\n')
  nodefs.writeFileSync(path.join(dir, 'src/index.ts'), "export * from './core'\n")
  nodefs.writeFileSync(path.join(dir, 'src/app.ts'),
    "import { parse } from './index';\nexport const value = parse();\n")
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const tool = repowikiImpactTool(ctx)

  const out = await tool.execute({ paths: ['src/core.ts'], symbols: ['parse'], depth: 1 }, fakeExec)
  assert.equal(out.scope, 'symbol')
  assert.equal(out.impactedDirect, 2, 'barrel 与最终导入方都是直接影响')
  assert.equal(out.impactedTotal, 2)
  assert.deepEqual(out.impacted.map(item => item.path), ['src/app.ts', 'src/index.ts'])
  assert.deepEqual(out.symbolReferences, [
    { path: 'src/app.ts', line: 1, symbols: ['parse'] },
    { path: 'src/index.ts', line: 1, symbols: ['parse'] },
  ])
  assert.deepEqual(out.usages, [{ path: 'src/app.ts', symbol: 'parse', line: 2, text: 'export const value = parse();' }])
})

test('impact：循环组按变更成员过滤并给出代表路径', () => {
  const edges = [
    { from: 'a.ts', to: 'b.ts' },
    { from: 'b.ts', to: 'a.ts' },
    { from: 'c.ts', to: 'a.ts' },
    { from: 'd.ts', to: 'c.ts' },
  ]
  const hit = cyclesForChanged(edges, ['a.ts'])
  assert.equal(hit.cycles.length, 1)
  assert.equal(hit.cycles[0].size, 2)
  assert.deepEqual(hit.cycles[0].contains, ['a.ts'])
  assert.deepEqual(hit.cycles[0].sample, ['a.ts', 'b.ts', 'a.ts'])
  const miss = cyclesForChanged(edges, ['d.ts'])
  assert.equal(miss.cycles.length, 0)
})

test('impact：循环过滤不受展示上限影响（>100 个无关环仍能命中）', () => {
  const edges = []
  for (let i = 0; i < 120; i++) {
    const dir = `u${String(i).padStart(3, '0')}`
    edges.push({ from: `${dir}/a.ts`, to: `${dir}/b.ts` })
    edges.push({ from: `${dir}/b.ts`, to: `${dir}/a.ts` })
  }
  edges.push({ from: 'z/a.ts', to: 'z/b.ts' }, { from: 'z/b.ts', to: 'z/a.ts' })
  const hit = cyclesForChanged(edges, ['z/a.ts'])
  assert.equal(hit.cycles.length, 1, '只返回含变更文件的组，而不是前 100 个无关组')
  assert.deepEqual(hit.cycles[0].contains, ['z/a.ts'])
  assert.equal(hit.truncated, false)
})

test('impact：变更文件的 fan-in 去重并排序', () => {
  const edges = [
    { from: 'b.ts', to: 'a.ts' },
    { from: 'c.ts', to: 'a.ts' },
    { from: 'c.ts', to: 'b.ts' },
    { from: 'a.ts', to: 'a.ts' },
  ]
  assert.deepEqual(hubsForChanged(edges, ['a.ts', 'b.ts']), [
    { path: 'a.ts', dependents: 2 },
    { path: 'b.ts', dependents: 1 },
  ])
})

test('impact：卡片陈旧判定与 Wiki 章节引用', () => {
  const manifest = {
    pages: [{
      slug: 'arch',
      title: 'Architecture',
      sources: ['a.ts'],
      sections: [
        { heading: 'Imports', sources: ['a.ts#L3-L4'] },
        { heading: 'Flow', sources: ['b.ts'] },
      ],
    }],
  }
  const cardsMap = new Map([['a.ts', { meta: { title: 'Card A', sourceDigest: 'old' }, path: 'knowledge/zh/a.md' }]])
  const docs = affectedDocs({
    changed: ['a.ts'],
    cardsMap,
    digests: new Map([['a.ts', 'new']]),
    manifest,
  })
  assert.deepEqual(docs.cards, [{ path: 'a.ts', title: 'Card A', stale: true }])
  assert.deepEqual(docs.wiki, [{ path: 'a.ts', slug: 'arch', title: 'Architecture', sections: ['Imports'] }])
  assert.equal(docs.wikiTruncated, false)
})

test('impact：风险分层显式列出计分因子', () => {
  const none = assessRisk({ direct: 0, total: 0, cycles: 0, hubs: [] })
  assert.deepEqual(none, { score: 0, level: 'low', factors: [] })
  const moderate = assessRisk({ direct: 3, total: 5, cycles: 1, hubs: [{ path: 'a.ts', dependents: 7 }] })
  assert.equal(moderate.score, 34)
  assert.equal(moderate.level, 'moderate')
  assert.equal(moderate.factors.length, 4)
  const critical = assessRisk({ direct: 10, total: 40, cycles: 2, hubs: [{ path: 'a.ts', dependents: 12 }] })
  assert.equal(critical.score, 100)
  assert.equal(critical.level, 'critical')
})

test('repowiki-impact：真实链路输出影响面/卡片/风险', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-impact-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'src/a.ts'),
    "export function a1() {}\nexport function a2() {}\n")
  nodefs.writeFileSync(path.join(dir, 'src/b.ts'),
    "import {\n  a1,\n} from './a';\nexport const b1 = a1;\n")
  nodefs.writeFileSync(path.join(dir, 'src/c.ts'),
    "import { b1 } from './b';\nexport const c1 = b1;\n")
  nodefs.writeFileSync(path.join(dir, 'src/d.ts'),
    "import { a2 } from './a';\nexport const d1 = a2;\n")
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  await repowikiEditTool(ctx).execute({
    action: 'create', path: 'src/a.ts', title: '入口 A', body: '核心入口。', locale: 'zh',
  }, fakeExec)

  const tool = repowikiImpactTool(ctx)
  const out = await tool.execute({ paths: ['src/a.ts'], depth: 2 }, fakeExec)
  assert.equal(out.indexed, true)
  assert.deepEqual(out.changed, [{ path: 'src/a.ts', lang: 'typescript', symbols: 2 }])
  assert.equal(out.impactedDirect, 2)
  assert.equal(out.impactedTotal, 3)
  assert.deepEqual(out.impacted.map(item => item.path), ['src/b.ts', 'src/d.ts', 'src/c.ts'])
  assert.equal(out.hubs[0].path, 'src/a.ts')
  assert.equal(out.cards.length, 1)
  assert.equal(out.cards[0].stale, true)
  assert.equal(out.locale, 'zh')
  assert.equal(out.localeSource, 'fallback')
  assert.equal(out.risk.level, 'low')
  const rendered = tool.output.render({}, out)
  assert.match(rendered[0].text, /Impact for 1 changed file/)
  assert.match(rendered[0].text, /2 direct \/ 1 transitive/)
  assert.match(rendered[0].text, /Risk: low \(9\/100\)/)
})

test('repowiki-impact：符号模式给出精确直接依赖与文件级上界', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-impact-symbol-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'src/a.ts'),
    "export function a1() {}\nexport function a2() {}\n")
  nodefs.writeFileSync(path.join(dir, 'src/b.ts'),
    "import {\n  a1,\n} from './a';\nexport const b1 = a1;\n")
  nodefs.writeFileSync(path.join(dir, 'src/c.ts'),
    "import { b1 } from './b';\nexport const c1 = b1;\n")
  nodefs.writeFileSync(path.join(dir, 'src/d.ts'),
    "import { a2 } from './a';\nexport const d1 = a2;\n")
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const tool = repowikiImpactTool(ctx)
  const out = await tool.execute({ paths: ['src/a.ts'], symbols: ['a1'], depth: 2 }, fakeExec)
  assert.equal(out.scope, 'symbol')
  assert.deepEqual(out.symbolChanges.map(item => `${item.path}#${item.name}`), ['src/a.ts#a1'])
  assert.equal(out.impactedDirect, 1)
  assert.equal(out.impactedTotal, 2)
  assert.equal(out.conservativeImpactedTotal, 3)
  assert.deepEqual(out.impacted.map(item => item.path), ['src/b.ts', 'src/c.ts'])
  assert.equal(out.symbolReferences[0].path, 'src/b.ts')
  assert.ok(out.symbolReferences[0].line > 0)
  assert.deepEqual(out.usages, [{ path: 'src/b.ts', symbol: 'a1', line: 4, text: 'export const b1 = a1;' }])
  assert.equal(out.usagesScanned, 1)
  assert.equal(out.usagesSkippedFiles, 0)
  assert.equal(out.usagesTruncated, false)
  assert.deepEqual(out.usagesUnreadable, [])
  const rendered = tool.output.render({}, out)[0].text
  assert.match(rendered, /\[symbol scope\]/)
  assert.match(rendered, /File-level upper bound: 3/)
  assert.match(rendered, /import evidence: src\/b.ts/)
  assert.match(rendered, /Usage evidence \(lexical occurrences, not resolved call sites\):/)
  assert.match(rendered, /src\/b\.ts:4 \(a1\)/)

  const noUsages = await tool.execute({ paths: ['src/a.ts'], symbols: ['a1'], includeUsages: false }, fakeExec)
  assert.deepEqual(noUsages.usages, [])
  assert.equal(noUsages.usagesScanned, 0)
  assert.equal(noUsages.usagesSkippedFiles, 0)
  assert.doesNotMatch(tool.output.render({}, noUsages)[0].text, /Usage evidence/)

  const missing = await tool.execute({ paths: ['src/a.ts'], symbols: ['notThere'] }, fakeExec)
  assert.equal(missing.impactedTotal, 0)
  assert.deepEqual(missing.unmatchedSymbols, ['notThere'])
  assert.match(missing.hint, /not broadened to file scope/)
})

test('repowiki-impact：使用点扫描读取失败如实披露而非当作零使用', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-impact-usage-fail-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'src/a.ts'), 'export function a1() {}\n')
  nodefs.writeFileSync(path.join(dir, 'src/b.ts'),
    "import { a1 } from './a';\nexport const b1 = a1;\n")
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  nodefs.rmSync(path.join(dir, 'src/b.ts'))
  const tool = repowikiImpactTool(ctx)
  const out = await tool.execute({ paths: ['src/a.ts'], symbols: ['a1'] }, fakeExec)
  assert.deepEqual(out.usagesUnreadable, ['src/b.ts'])
  assert.deepEqual(out.usages, [])
  assert.equal(out.usagesScanned, 0)
  assert.equal(out.usagesSkippedFiles, 1)
  assert.match(out.hint, /Usage scan could not read: src\/b\.ts/)
  assert.match(out.hint, /unknown, not absent/)
  const rendered = tool.output.render({}, out)[0].text
  assert.match(rendered, /Unreadable for usage scan: src\/b\.ts/)
})

test('repowiki-impact：导入但未使用时明确报告无词法出现', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-impact-usage-none-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'src/a.ts'), 'export function a1() {}\n')
  nodefs.writeFileSync(path.join(dir, 'src/b.ts'),
    "import { a1 } from './a';\nexport const b1 = 1;\n")
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const tool = repowikiImpactTool(ctx)
  const out = await tool.execute({ paths: ['src/a.ts'], symbols: ['a1'] }, fakeExec)
  assert.deepEqual(out.usages, [])
  assert.equal(out.usagesScanned, 1)
  assert.equal(out.usagesTruncated, false)
  assert.match(tool.output.render({}, out)[0].text, /no lexical occurrence in the scanned importer files/)
})

test('repowiki-impact：使用点文件数有上限并披露跳过数', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-impact-usage-cap-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'src/a.ts'), 'export function a1() {}\n')
  for (let index = 0; index < 21; index++) {
    nodefs.writeFileSync(path.join(dir, `src/use${String(index).padStart(2, '0')}.ts`),
      `import { a1 } from './a';\nexport const v${index} = a1;\n`)
  }
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const tool = repowikiImpactTool(ctx)
  const out = await tool.execute({ paths: ['src/a.ts'], symbols: ['a1'] }, fakeExec)
  assert.equal(out.usages.length, 20)
  assert.equal(out.usagesScanned, 20)
  assert.equal(out.usagesSkippedFiles, 1)
  assert.equal(out.usagesTruncated, false)
  assert.match(out.hint, /Usage scan covered 20 importer file\(s\); the rest were skipped by the 20-file cap\./)
  const rendered = tool.output.render({}, out)[0].text
  assert.match(rendered, /12 more usage site\(s\) omitted/)
})

test('repowiki-impact：使用点总量上限 100 并如实标记截断', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-impact-usage-total-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  const names = Array.from({ length: 11 }, (_, index) => `s${index}`)
  nodefs.writeFileSync(path.join(dir, 'src/a.ts'),
    names.map(name => `export function ${name}() {}`).join('\n'))
  const calls = names.flatMap(name => Array.from({ length: 10 }, () => `call(${name});`))
  nodefs.writeFileSync(path.join(dir, 'src/b.ts'),
    `import { ${names.join(', ')} } from './a';\n${calls.join('\n')}\n`)
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const tool = repowikiImpactTool(ctx)
  const out = await tool.execute({ paths: ['src/a.ts'], symbols: names }, fakeExec)
  assert.equal(out.usages.length, 100)
  assert.equal(out.usagesTruncated, true)
  assert.match(out.hint, /Usage evidence is capped at 10 sites per symbol and 100 in total\./)
})

test('impact：受影响测试按路径启发式单列并排除变更自身', () => {
  const edges = [
    { from: 'b.test.ts', to: 'a.ts', symbols: ['a1'] },
    { from: 'c.ts', to: 'a.ts', symbols: ['a1'] },
    { from: 'd.spec.ts', to: 'c.ts', symbols: ['c1'] },
  ]
  const result = computeImpact(edges, ['a.ts'], 2, 10)
  assert.deepEqual(result.tests, [
    { path: 'b.test.ts', depth: 1 },
    { path: 'd.spec.ts', depth: 2 },
  ])
  assert.equal(result.testsTruncated, false)
  const changedTest = computeImpact(edges, ['b.test.ts'], 2, 10)
  assert.ok(!changedTest.tests.some(item => item.path === 'b.test.ts'))
})

test('repowiki-impact：受影响测试单独列出并进入验证建议', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-impact-tests-'))
  nodefs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'src/a.ts'), 'export function a1() {}\n')
  nodefs.writeFileSync(path.join(dir, 'src/use.ts'),
    "import { a1 } from './a';\nexport const use = a1;\n")
  nodefs.writeFileSync(path.join(dir, 'src/a.test.ts'),
    "import { a1 } from './a';\ntest('a1', () => a1());\n")
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const tool = repowikiImpactTool(ctx)

  const fileScope = await tool.execute({ paths: ['src/a.ts'] }, fakeExec)
  assert.deepEqual(fileScope.affectedTests, [{ path: 'src/a.test.ts', depth: 1 }])
  assert.equal(fileScope.affectedTestsTruncated, false)
  const rendered = tool.output.render({}, fileScope)[0].text
  assert.match(rendered, /Affected tests: src\/a\.test\.ts/)
  assert.match(rendered, /Run the 1 affected test file\(s\) first: src\/a\.test\.ts/)

  const symbolScope = await tool.execute({ paths: ['src/a.ts'], symbols: ['a1'] }, fakeExec)
  assert.deepEqual(symbolScope.affectedTests, [{ path: 'src/a.test.ts', depth: 1 }])
  assert.match(tool.output.render({}, symbolScope)[0].text, /Affected tests: src\/a\.test\.ts/)
})

test('repowiki-impact：无索引与无匹配的降级', async () => {
  const empty = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-impact-empty-'))
  const noIndex = await repowikiImpactTool(makeCtx(empty)).execute({ paths: ['x.ts'] }, fakeExec)
  assert.equal(noIndex.indexed, false)
  assert.match(noIndex.hint, /repowiki-index/)
  assert.match(repowikiImpactTool(makeCtx(empty)).output.render({}, noIndex)[0].text, /repowiki-index/)

  nodefs.writeFileSync(path.join(empty, 'a.ts'), 'export const a = 1\n')
  const ctx = makeCtx(empty)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const noPaths = await repowikiImpactTool(ctx).execute({}, fakeExec)
  assert.equal(noPaths.changed.length, 0)
  assert.match(noPaths.hint, /paths is required/)
  assert.match(repowikiImpactTool(ctx).output.render({}, noPaths)[0].text, /paths is required/)
  const miss = await repowikiImpactTool(ctx).execute({ paths: ['nope.ts'] }, fakeExec)
  assert.equal(miss.indexed, true)
  assert.deepEqual(miss.unmatched, ['nope.ts'])
  assert.equal(miss.changed.length, 0)
  assert.match(repowikiImpactTool(ctx).output.render({}, miss)[0].text, /None of the paths match/)
})

test('repowiki-impact：架构上下文（层归属/跨层影响/热点）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-impact-arch-'))
  nodefs.mkdirSync(path.join(dir, 'src/ui'), { recursive: true })
  nodefs.mkdirSync(path.join(dir, 'src/core'), { recursive: true })
  const coreLines = ['export function b() {']
  for (let i = 0; i < 6; i++) coreLines.push('  if (x) { return 1 }')
  coreLines.push('}')
  nodefs.writeFileSync(path.join(dir, 'src/core/b.ts'), coreLines.join('\n') + '\n')
  nodefs.writeFileSync(path.join(dir, 'src/ui/a.ts'),
    "import { b } from '../core/b'\nexport const a = b()\n")
  nodefs.mkdirSync(path.join(dir, '.dsh-repowiki'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, '.dsh-repowiki/repowiki-plan.json'), JSON.stringify({
    complexityThreshold: 5,
    layers: [
      { name: 'ui', paths: ['src/ui'], mayDependOn: ['core'] },
      { name: 'core', paths: ['src/core'], mayDependOn: [] },
    ],
  }))
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const tool = repowikiImpactTool(ctx)
  const out = await tool.execute({ paths: ['src/core/b.ts'], depth: 2 }, fakeExec)

  assert.deepEqual(out.architecture.changedLayers, ['core'])
  assert.deepEqual(out.architecture.impactedLayers, [{ layer: 'ui', files: 1 }])
  assert.deepEqual(out.architecture.crossLayerPairs, [{ from: 'ui', to: 'core', count: 1 }])
  assert.equal(out.architecture.hotspotTotal, 1)
  assert.equal(out.architecture.hotspots[0].name, 'b')
  assert.match(out.hint ?? '', /crosses declared layers/)
  assert.match(out.hint ?? '', /high-complexity function/)
  const rendered = tool.output.render({}, out)[0].text
  assert.match(rendered, /Architecture: layers ui \(1\), core \(1\)/)
  assert.match(rendered, /cross-layer ui → core \(1\)/)
  assert.match(rendered, /hotspots 1/)
})
