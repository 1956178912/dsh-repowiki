/**
 * 架构基线：快照签名/上限推导、归一化容错、ratchet 比较语义。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  snapshotArchitecture, normalizeBaseline, compareArchitecture,
  architectureFactsSnapshot, MAX_BASELINE_CYCLES,
} from '../src/arch-baseline.js'
import { evaluateLayers } from '../src/layers.js'
import { findImportCycles } from '../src/cycles.js'
import { findUnresolvedImports } from '../src/unresolved.js'
import { findDuplicates } from '../src/duplicates.js'
import { computeComplexity } from '../src/complexity.js'
import { topDependents, MAX_HUB_ENTRIES } from '../src/references.js'
import { ARCH_BASELINE_SCHEMA_VERSION } from '../src/schema.js'

/** 造一个含循环、坏导入与跨层边的索引。 */
function sampleIndex() {
  return {
    files: [
      {
        path: 'src/a.js',
        lang: 'javascript',
        symbols: [{ name: 'a', kind: 'function', line: 1, endLine: 18 }],
        imports: [
          { specifier: './b', line: 1, relative: true },
          { specifier: './missing', line: 2, relative: true },
        ],
      },
      {
        path: 'src/b.js',
        lang: 'javascript',
        symbols: [{ name: 'b', kind: 'function', line: 1, endLine: 3 }],
        imports: [{ specifier: './a', line: 1, relative: true }],
      },
      { path: 'src/c.js', lang: 'javascript', symbols: [], imports: [] },
      { path: 'lib/d.js', lang: 'javascript', symbols: [], imports: [] },
    ],
    edges: [
      { from: 'src/a.js', to: 'src/b.js', line: 1 },
      { from: 'src/b.js', to: 'src/a.js', line: 1 },
      { from: 'src/a.js', to: 'lib/d.js', line: 4 },
    ],
  }
}

/** 造与索引符号对应的源码（含一个高复杂度函数）。 */
function sampleSources() {
  const branchy = [
    'function a() {',
    ...Array.from({ length: 16 }, (_, index) => `  if (x${index}) { y() }`),
    '}',
  ].join('\n')
  return [
    { path: 'src/a.js', text: branchy },
    { path: 'src/b.js', text: 'function b() {\n  if (x) { y() }\n}\n' },
    { path: 'src/c.js', text: 'const c = 1\n' },
    { path: 'lib/d.js', text: 'const d = 1\n' },
  ]
}

/** 分层配置：app 不得依赖 lib，lib 允许依赖 app。 */
const LAYERS = [
  { name: 'app', paths: ['src'], mayDependOn: [] },
  { name: 'lib', paths: ['lib'], mayDependOn: ['app'] },
]

test('arch-baseline：快照记录循环组、层对计数、坏导入与上限', () => {
  const snapshot = snapshotArchitecture({
    index: sampleIndex(),
    layers: LAYERS,
    sources: sampleSources(),
    opts: { duplicateMinLines: 8, complexityThreshold: 15 },
  })
  assert.equal(snapshot.schemaVersion, ARCH_BASELINE_SCHEMA_VERSION)
  assert.deepEqual(snapshot.cycles, [['src/a.js', 'src/b.js']])
  assert.deepEqual(snapshot.layerViolations, [{ from: 'app', to: 'lib', count: 1 }])
  assert.deepEqual(snapshot.unresolvedImports, [{ path: 'src/a.js', specifier: './missing' }])
  assert.deepEqual(snapshot.ceilings, { duplicateBlocks: 0, highComplexity: 1, maxComplexity: 17 })
  assert.equal(snapshot.totals.files, 4)
  assert.equal(snapshot.totals.edges, 3)
  assert.equal(snapshot.totals.symbols, 2)
  assert.deepEqual(snapshot.config, { duplicateMinLines: 8, complexityThreshold: 15 })
  assert.equal(snapshot.truncated.cycles, false)
  assert.equal(snapshot.truncated.unresolvedImports, false)
  // 一个环 -10 分、一条层违规 -5 分、一个高复杂度函数 -2 分
  assert.equal(snapshot.architectureScore, 83)
})

test('arch-baseline：同一输入得到逐字段相同的快照（可安全提交）', () => {
  const first = snapshotArchitecture({ index: sampleIndex(), layers: LAYERS, sources: sampleSources() })
  const second = snapshotArchitecture({ index: sampleIndex(), layers: LAYERS, sources: sampleSources() })
  assert.deepEqual(first, second)
})

test('arch-baseline：无分层/无源码时只剩纯图信号', () => {
  const snapshot = snapshotArchitecture({ index: { files: [], edges: [] } })
  assert.deepEqual(snapshot.cycles, [])
  assert.deepEqual(snapshot.layerViolations, [])
  assert.deepEqual(snapshot.unresolvedImports, [])
  assert.deepEqual(snapshot.ceilings, { duplicateBlocks: 0, highComplexity: 0, maxComplexity: 0 })
  assert.equal(snapshot.architectureScore, 100)
})

test('arch-baseline：同层违规不计数，未知层引用不产生层对', () => {
  const index = {
    files: [{ path: 'src/a.js' }, { path: 'src/b.js' }],
    edges: [{ from: 'src/a.js', to: 'src/b.js' }, { from: 'src/a.js', to: 'other/x.js' }],
  }
  const snapshot = snapshotArchitecture({ index, layers: LAYERS })
  assert.deepEqual(snapshot.layerViolations, [])
})

test('arch-baseline：多个层对按 from/to 稳定排序', () => {
  const index = {
    files: [
      { path: 'src/a.js' },
      { path: 'src/d.js' },
      { path: 'lib/b.js' },
      { path: 'lib/c.js' },
    ],
    edges: [
      { from: 'src/a.js', to: 'lib/b.js' },
      { from: 'lib/c.js', to: 'src/d.js' },
    ],
  }
  const snapshot = snapshotArchitecture({
    index,
    layers: [
      { name: 'app', paths: ['src'], mayDependOn: [] },
      { name: 'lib', paths: ['lib'], mayDependOn: [] },
    ],
  })
  assert.deepEqual(snapshot.layerViolations, [
    { from: 'app', to: 'lib', count: 1 },
    { from: 'lib', to: 'app', count: 1 },
  ])
})

test('arch-baseline：重复块与高复杂度函数计入上限', () => {
  const body = Array.from({ length: 10 }, (_, index) => `  step${index}()`).join('\n')
  const sources = [
    { path: 'src/a.js', text: `${body}\n` },
    { path: 'src/b.js', text: `${body}\n` },
  ]
  const snapshot = snapshotArchitecture({
    index: { files: [{ path: 'src/a.js' }, { path: 'src/b.js' }], edges: [] },
    sources,
  })
  assert.equal(snapshot.ceilings.duplicateBlocks, 1)
  assert.equal(snapshot.ceilings.highComplexity, 0)
})

test('arch-baseline：循环组超过保留上限时标记 truncated', () => {
  const files = []
  const edges = []
  const total = MAX_BASELINE_CYCLES + 1
  for (let index = 0; index < total; index++) {
    const left = `g${index}/a.js`
    const right = `g${index}/b.js`
    files.push({ path: left }, { path: right })
    edges.push({ from: left, to: right }, { from: right, to: left })
  }
  const snapshot = snapshotArchitecture({ index: { files, edges } })
  assert.equal(snapshot.cycles.length, MAX_BASELINE_CYCLES)
  assert.equal(snapshot.truncated.cycles, true)
})

test('arch-baseline：归一化去重排序并报告被丢弃的畸形条目', () => {
  const raw = {
    schemaVersion: ARCH_BASELINE_SCHEMA_VERSION,
    config: { duplicateMinLines: 8, complexityThreshold: 15 },
    totals: { files: 3, edges: 2, symbols: 5 },
    cycles: [['b.js', 'a.js'], ['a.js', 'b.js'], ['only-one'], 'bad'],
    layerViolations: [
      { from: 'ui', to: 'db', count: 2 },
      { from: 'ui', to: 'db', count: 1 },
      { from: '', to: 'db' },
    ],
    unresolvedImports: [{ path: 'src/a.js', specifier: './x' }, { path: 'src/a.js' }],
    ceilings: { duplicateBlocks: 3, highComplexity: 2, maxComplexity: 21 },
    architectureScore: 88,
  }
  const { baseline, problems } = normalizeBaseline(raw)
  assert.ok(baseline)
  assert.deepEqual(baseline.cycles, [['a.js', 'b.js']])
  assert.deepEqual(baseline.layerViolations, [{ from: 'ui', to: 'db', count: 2 }])
  assert.deepEqual(baseline.unresolvedImports, [{ path: 'src/a.js', specifier: './x' }])
  assert.deepEqual(baseline.ceilings, { duplicateBlocks: 3, highComplexity: 2, maxComplexity: 21 })
  assert.equal(baseline.architectureScore, 88)
  assert.ok(problems.some(message => /malformed cycle/.test(message)))
  assert.ok(problems.some(message => /malformed layer violation/.test(message)))
  assert.ok(problems.some(message => /malformed unresolved import/.test(message)))
})

test('arch-baseline：归一化拒绝非对象与不支持的版本', () => {
  assert.deepEqual(normalizeBaseline(null), {
    baseline: null,
    problems: ['architecture baseline is not a JSON object'],
  })
  assert.deepEqual(normalizeBaseline([]).baseline, null)
  const mismatch = normalizeBaseline({ schemaVersion: ARCH_BASELINE_SCHEMA_VERSION + 1 })
  assert.equal(mismatch.baseline, null)
  assert.match(mismatch.problems[0], /unsupported architecture baseline schemaVersion/)
  assert.match(normalizeBaseline({}).problems[0], /\(missing\)/)
})

test('arch-baseline：缺少上限或分值时分项关闭对应检查并告警', () => {
  const { baseline, problems } = normalizeBaseline({
    schemaVersion: ARCH_BASELINE_SCHEMA_VERSION,
    cycles: [],
    layerViolations: [],
    unresolvedImports: [],
  })
  assert.ok(baseline)
  assert.equal(baseline.ceilings, null)
  assert.equal(baseline.architectureScore, null)
  assert.ok(problems.some(message => /no ceilings/.test(message)))
  assert.ok(problems.some(message => /no architectureScore/.test(message)))
})

test('arch-baseline：比较无变化时通过', () => {
  const snapshot = snapshotArchitecture({ index: sampleIndex(), layers: LAYERS, sources: sampleSources() })
  const { baseline } = normalizeBaseline(JSON.parse(JSON.stringify(snapshot)))
  const result = compareArchitecture(baseline, snapshot)
  assert.equal(result.ok, true)
  assert.deepEqual(result.regressions, [])
  assert.deepEqual(result.improvements, [])
})

test('arch-baseline：新增循环组是退化，消失是收紧项', () => {
  const baseline = snapshotArchitecture({ index: { files: [], edges: [] } })
  const current = snapshotArchitecture({
    index: { files: [{ path: 'a.js' }, { path: 'b.js' }], edges: [{ from: 'a.js', to: 'b.js' }, { from: 'b.js', to: 'a.js' }] },
  })
  const added = compareArchitecture(baseline, current)
  assert.equal(added.ok, false)
  assert.equal(added.regressions[0].kind, 'cycle')
  assert.match(added.regressions[0].message, /new import cycle group: a\.js ↔ b\.js/)
  assert.ok(added.regressions.some(item => item.kind === 'score'))

  const removed = compareArchitecture(current, baseline)
  assert.equal(removed.ok, true)
  assert.ok(removed.improvements.some(item => item.kind === 'cycle'))
  assert.ok(removed.improvements.some(item => item.kind === 'score'))
})

test('arch-baseline：分层违规按层对计数比较（新增/增加/减少/消失）', () => {
  const base = snapshotArchitecture({
    index: { files: [{ path: 'src/a.js' }, { path: 'lib/b.js' }], edges: [] },
    layers: LAYERS,
  })
  const one = snapshotArchitecture({
    index: { files: [{ path: 'src/a.js' }, { path: 'lib/b.js' }], edges: [{ from: 'src/a.js', to: 'lib/b.js' }] },
    layers: LAYERS,
  })
  const two = snapshotArchitecture({
    index: {
      files: [{ path: 'src/a.js' }, { path: 'lib/b.js' }],
      edges: [
        { from: 'src/a.js', to: 'lib/b.js' },
        { from: 'src/a.js', to: 'lib/b.js' },
      ],
    },
    layers: LAYERS,
  })
  const added = compareArchitecture(base, one)
  assert.equal(added.ok, false)
  assert.match(added.regressions[0].message, /new cross-layer import: app → lib \(1 edge\)/)

  const increased = compareArchitecture(one, two)
  assert.equal(increased.ok, false)
  assert.match(increased.regressions[0].message, /increased from 1 to 2/)

  const decreased = compareArchitecture(two, one)
  assert.equal(decreased.ok, true)
  assert.match(decreased.improvements[0].message, /decreased from 2 to 1/)

  const resolved = compareArchitecture(one, base)
  assert.equal(resolved.ok, true)
  assert.match(resolved.improvements[0].message, /resolved \(was 1\)/)
})

test('arch-baseline：新增坏相对导入是退化', () => {
  const base = snapshotArchitecture({
    index: { files: [{ path: 'src/a.js', imports: [] }], edges: [] },
  })
  const current = snapshotArchitecture({
    index: {
      files: [{ path: 'src/a.js', imports: [{ specifier: './gone', line: 3, relative: true }] }],
      edges: [],
    },
  })
  const result = compareArchitecture(base, current)
  assert.equal(result.ok, false)
  assert.equal(result.regressions[0].kind, 'unresolved')
  assert.match(result.regressions[0].message, /new unresolved import: src\/a\.js → \.\/gone/)
})

test('arch-baseline：四个文件以上的循环组在消息中折叠成员', () => {
  const empty = snapshotArchitecture({ index: { files: [], edges: [] } })
  const current = snapshotArchitecture({
    index: {
      files: [{ path: 'a.js' }, { path: 'b.js' }, { path: 'c.js' }, { path: 'd.js' }],
      edges: [
        { from: 'a.js', to: 'b.js' },
        { from: 'b.js', to: 'c.js' },
        { from: 'c.js', to: 'd.js' },
        { from: 'd.js', to: 'a.js' },
      ],
    },
  })
  const result = compareArchitecture(empty, current)
  assert.equal(result.ok, false)
  assert.equal(result.regressions[0].kind, 'cycle')
  assert.match(result.regressions[0].message, /a\.js ↔ b\.js ↔ c\.js \(\+1\)/)
})

test('arch-baseline：上限与分值逐项比较', () => {
  const baseline = {
    schemaVersion: ARCH_BASELINE_SCHEMA_VERSION,
    cycles: [],
    layerViolations: [],
    unresolvedImports: [],
    ceilings: { duplicateBlocks: 1, highComplexity: 2, maxComplexity: 20 },
    architectureScore: 90,
  }
  const current = {
    cycles: [],
    layerViolations: [],
    unresolvedImports: [],
    ceilings: { duplicateBlocks: 2, highComplexity: 3, maxComplexity: 25 },
    architectureScore: 84,
  }
  const result = compareArchitecture(baseline, current)
  assert.equal(result.ok, false)
  assert.deepEqual(result.regressions.map(item => item.kind), ['ceiling', 'ceiling', 'ceiling', 'score'])
  assert.match(result.regressions[0].message, /duplicate code blocks increased from 1 to 2/)
  assert.match(result.regressions[1].message, /high-complexity functions increased from 2 to 3/)
  assert.match(result.regressions[2].message, /max function complexity increased from 20 to 25/)
  assert.match(result.regressions[3].message, /architecture score dropped from 90 to 84/)

  const improved = compareArchitecture(current, {
    ...current,
    ceilings: { duplicateBlocks: 0, highComplexity: 1, maxComplexity: 12 },
    architectureScore: 95,
  })
  assert.equal(improved.ok, true)
  assert.equal(improved.improvements.length, 4)
})

test('arch-baseline：缺少上限/分值时跳过对应比较', () => {
  const baseline = {
    schemaVersion: ARCH_BASELINE_SCHEMA_VERSION,
    cycles: [],
    layerViolations: [],
    unresolvedImports: [],
    ceilings: null,
    architectureScore: null,
  }
  const current = {
    cycles: [],
    layerViolations: [],
    unresolvedImports: [],
    ceilings: { duplicateBlocks: 9, highComplexity: 9, maxComplexity: 99 },
    architectureScore: 10,
  }
  const result = compareArchitecture(baseline, current)
  assert.equal(result.ok, true)
  assert.deepEqual(result.regressions, [])
})

test('arch-baseline：按事实生成的快照与按索引生成的快照逐字段一致', () => {
  const index = sampleIndex()
  const sources = sampleSources()
  const layers = LAYERS
  const fromIndex = snapshotArchitecture({
    index,
    layers,
    sources,
    opts: { duplicateMinLines: 8, complexityThreshold: 15 },
  })
  // 模拟 repowiki-status 的路径：先算好事实，再交给 architectureFactsSnapshot
  const layerReport = evaluateLayers(layers, index.edges, index.files)
  const cycleResult = findImportCycles(index.edges, { limit: MAX_BASELINE_CYCLES })
  const unresolved = findUnresolvedImports(index.files, index.edges, { limit: 200 })
  const duplicates = findDuplicates(sources, { windowLines: 8 })
  const complexity = computeComplexity(index.files, sources, { threshold: 15 })
  const fromFacts = architectureFactsSnapshot({
    files: index.files,
    edges: index.edges.length,
    layerReport,
    cycles: cycleResult.cycles,
    unresolved,
    duplicates,
    complexity,
    hubs: topDependents(index.edges, MAX_HUB_ENTRIES),
    config: { duplicateMinLines: 8, complexityThreshold: 15 },
    truncated: { cycles: cycleResult.truncated, unresolvedImports: unresolved.total > unresolved.details.length },
  })
  assert.deepEqual(fromFacts, fromIndex)
})

test('arch-baseline：事实快照使用精确 highTotal 而非有界明细长度', () => {
  const snapshot = architectureFactsSnapshot({
    files: [{ path: 'a.js', symbols: [] }],
    edges: 0,
    cycles: [],
    unresolved: { details: [] },
    duplicates: { total: 2 },
    complexity: {
      high: [{ path: 'a.js', name: 'f', line: 1, endLine: 9, complexity: 30 }],
      highTotal: 5,
      max: 30,
    },
    hubs: [],
    config: { duplicateMinLines: 8, complexityThreshold: 15 },
  })
  assert.equal(snapshot.ceilings.highComplexity, 5)
  assert.equal(snapshot.ceilings.duplicateBlocks, 2)
  assert.equal(snapshot.ceilings.maxComplexity, 30)
})

test('arch-baseline：事实快照容忍缺省输入', () => {
  const snapshot = architectureFactsSnapshot({ config: {} })
  assert.deepEqual(snapshot.cycles, [])
  assert.deepEqual(snapshot.layerViolations, [])
  assert.deepEqual(snapshot.unresolvedImports, [])
  assert.deepEqual(snapshot.ceilings, { duplicateBlocks: 0, highComplexity: 0, maxComplexity: 0 })
  assert.deepEqual(snapshot.totals, { files: 0, edges: 0, symbols: 0 })
  assert.deepEqual(snapshot.config, { duplicateMinLines: 0, complexityThreshold: 0 })
  assert.equal(snapshot.architectureScore, 100)
})
