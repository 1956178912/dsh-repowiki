/**
 * 确定性架构 Wiki 页：分节内容、引用白名单、基线状态与可复现性。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildArchitecturePage, ARCHITECTURE_SLUG } from '../src/architecture-page.js'
import { snapshotArchitecture } from '../src/arch-baseline.js'

/** 含循环、跨层违规、重复块、复杂度与坏导入的索引。 */
function sampleIndex() {
  return {
    files: [
      {
        path: 'src/a.ts',
        lang: 'typescript',
        module: 'src',
        symbols: [{ name: 'main', kind: 'function', line: 1, endLine: 9 }],
        imports: [{ specifier: './missing', line: 2, relative: true }],
      },
      { path: 'src/b.ts', lang: 'typescript', module: 'src', symbols: [] },
      { path: 'src/c.ts', lang: 'typescript', module: 'src', symbols: [] },
      { path: 'lib/d.ts', lang: 'typescript', module: 'lib', symbols: [] },
    ],
    edges: [
      { from: 'src/a.ts', to: 'src/b.ts', line: 1 },
      { from: 'src/b.ts', to: 'src/a.ts', line: 1 },
      { from: 'src/a.ts', to: 'lib/d.ts', line: 3 },
    ],
    modules: [{ path: 'src', parent: '.' }, { path: 'lib', parent: '.' }, { path: '.', parent: '' }],
    stats: { languages: { typescript: 4 } },
  }
}

/** 与索引符号范围对应的源码：a.ts 含高复杂度函数，b/c 共享重复块。 */
function sampleSources() {
  const branchy = [
    'export function main() {',
    '  if (a) { one() }',
    '  if (b) { two() }',
    '  if (c) { three() }',
    '  if (d) { four() }',
    '  if (e) { five() }',
    '  if (f) { six() }',
    '  return 1',
    '}',
  ].join('\n')
  const shared = Array.from({ length: 10 }, (_, index) => `  step${index}()`).join('\n')
  return [
    { path: 'src/a.ts', text: branchy },
    { path: 'src/b.ts', text: shared },
    { path: 'src/c.ts', text: shared },
    { path: 'lib/d.ts', text: 'export const d = 1\n' },
  ]
}

/** 分层：app 不得依赖 lib。 */
const PLAN = {
  duplicateMinLines: 8,
  complexityThreshold: 5,
  layers: [
    { name: 'app', paths: ['src'], mayDependOn: [] },
    { name: 'lib', paths: ['lib'], mayDependOn: ['app'] },
  ],
}

/** 取某页面中所有引用（含行号形式）。 */
function allSources(page) {
  return page.sections.flatMap(section => section.sources)
}

test('architecture-page：分节覆盖分层/循环/入口/重复/复杂度/坏导入', () => {
  const page = buildArchitecturePage({
    index: sampleIndex(),
    plan: PLAN,
    sources: sampleSources(),
    baselineRaw: null,
    locale: 'en',
  })
  assert.equal(page.slug, ARCHITECTURE_SLUG)
  assert.equal(page.deterministic, true)
  assert.equal(page.module, '')
  const headings = page.sections.map(section => section.heading)
  assert.deepEqual(headings, [
    'Overview', 'Architecture layers', 'Import cycles', 'Key entry points',
    'Duplicate code candidates', 'Complexity hotspots', 'Unresolved relative imports',
    'Architecture baseline',
  ])

  const layers = page.sections[1].body
  assert.match(layers, /`app`/)
  assert.match(layers, /`app` → `lib`/)
  const cycles = page.sections[2].body
  assert.match(cycles, /src\/a\.ts.*↔.*src\/b\.ts|src\/b\.ts.*↔.*src\/a\.ts/)
  assert.match(page.sections[5].body, /main/)
  assert.match(page.sections[6].body, /\.\/missing/)
  assert.match(page.sections[7].body, /No architecture baseline is recorded/)

  // 引用只包含索引内路径（可带行号），不含未知路径
  const known = new Set(sampleIndex().files.map(file => file.path))
  for (const source of allSources(page)) {
    const [path] = source.split('#')
    assert.ok(known.has(path), `引用应来自索引：${source}`)
  }
  assert.ok(allSources(page).some(source => /^src\/a\.ts#L1-L9$/.test(source)), '复杂度热点带行号引用')
})

test('architecture-page：同一输入生成逐字段相同页面', () => {
  const first = buildArchitecturePage({
    index: sampleIndex(), plan: PLAN, sources: sampleSources(), baselineRaw: null, locale: 'en',
  })
  const second = buildArchitecturePage({
    index: sampleIndex(), plan: PLAN, sources: sampleSources(), baselineRaw: null, locale: 'en',
  })
  assert.deepEqual(first, second)
})

test('architecture-page：中文标题与说明', () => {
  const page = buildArchitecturePage({
    index: sampleIndex(), plan: PLAN, sources: sampleSources(), locale: 'zh',
  })
  assert.equal(page.title, '架构总览')
  assert.match(page.overview, /确定性生成/)
  const headings = page.sections.map(section => section.heading)
  assert.ok(headings.includes('架构分层'))
  assert.ok(headings.includes('循环依赖'))
  assert.ok(headings.includes('架构基线'))
})

test('architecture-page：基线缺失/不可用/一致/退化四种状态', () => {
  const index = sampleIndex()
  const sources = sampleSources()
  const snapshot = snapshotArchitecture({ index, layers: PLAN.layers, sources, opts: PLAN })
  const build = baselineRaw => buildArchitecturePage({
    index, plan: PLAN, sources, baselineRaw, locale: 'en',
  })

  assert.match(build(null).sections.at(-1).body, /No architecture baseline is recorded/)
  assert.match(build({ schemaVersion: 99 }).sections.at(-1).body, /cannot be used/)
  assert.match(build(snapshot).sections.at(-1).body, /No new regressions were detected/)

  // 旧基线缺少当前循环 → 报新增退化
  const stale = { ...snapshot, cycles: [], architectureScore: 100 }
  const regressed = build(stale).sections.at(-1).body
  assert.match(regressed, /new regression\(s\) were detected/)
  assert.match(regressed, /new import cycle group/)
})

test('architecture-page：基线有修复项时提示收紧', () => {
  const index = sampleIndex()
  const sources = sampleSources()
  const snapshot = snapshotArchitecture({ index, layers: PLAN.layers, sources, opts: PLAN })
  const richer = {
    ...snapshot,
    cycles: [...snapshot.cycles, ['legacy/x.ts', 'legacy/y.ts']],
    architectureScore: 40,
  }
  const page = buildArchitecturePage({ index, plan: PLAN, sources, baselineRaw: richer, locale: 'en' })
  assert.match(page.sections.at(-1).body, /can be tightened/)
})

test('architecture-page：无索引事实时只输出总览与基线节', () => {
  const page = buildArchitecturePage({ index: { files: [], edges: [] }, plan: {}, locale: 'en' })
  assert.deepEqual(page.sections.map(section => section.heading), ['Overview', 'Architecture baseline'])
  assert.match(page.sections[0].body, /Files\*\*: 0/)
})
