/**
 * 反向引用纯函数测试：建索引、去自引用、无符号边跳过、排序与截断。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildReferenceIndex, referencesFor, importsFor, dependentsFor, topDependents,
  MAX_REFERENCE_ENTRIES, MAX_IMPORT_ENTRIES, MAX_HUB_ENTRIES,
} from '../src/references.js'

test('buildReferenceIndex：按目标文件与符号归并引用位置（含行号）并排序', () => {
  const index = buildReferenceIndex([
    { from: 'src/b.ts', to: 'src/a.ts', line: 2, symbols: ['parse'] },
    { from: 'src/c.ts', to: 'src/a.ts', line: 5, symbols: ['parse', 'format'] },
    { from: 'src/b.ts', to: 'src/a.ts', line: 8, symbols: ['parse'] },
    { from: 'src/d.ts', to: 'src/a.ts', symbols: ['parse'] }, // 旧索引无边号
    // 同一文件同一行只记一次
    { from: 'src/c.ts', to: 'src/a.ts', line: 5, symbols: ['parse'] },
    // 自引用不产生反向引用
    { from: 'src/a.ts', to: 'src/a.ts', line: 1, symbols: ['parse'] },
    // 副作用导入没有符号信息，跳过
    { from: 'src/e.ts', to: 'src/a.ts', line: 3, symbols: [] },
    // 坏边安静跳过
    null,
    { from: 'x', to: null, symbols: ['x'] },
  ])

  assert.deepEqual(index.get('src/a.ts')?.get('parse'), [
    { path: 'src/b.ts', line: 2 },
    { path: 'src/b.ts', line: 8 },
    { path: 'src/c.ts', line: 5 },
    { path: 'src/d.ts' },
  ])
  assert.deepEqual(index.get('src/a.ts')?.get('format'), [{ path: 'src/c.ts', line: 5 }])
  assert.equal(index.has('src/a.ts') && index.get('src/a.ts')?.size, 2)
  assert.equal(index.has('src/e.ts'), false)
})

test('referencesFor：只返回命中符号的引用，并按上限截断', () => {
  const refIndex = buildReferenceIndex([
    { from: 'src/b.ts', to: 'src/a.ts', line: 2, symbols: ['parse', 'format'] },
    { from: 'src/c.ts', to: 'src/a.ts', line: 3, symbols: ['parse'] },
  ])
  const matches = [{ path: 'src/a.ts', symbols: [{ name: 'parse' }, { name: 'unused' }] }]

  const result = referencesFor(refIndex, matches)
  assert.deepEqual(result.references, [
    {
      path: 'src/a.ts',
      symbol: 'parse',
      referencedBy: [{ path: 'src/b.ts', line: 2 }, { path: 'src/c.ts', line: 3 }],
    },
  ])
  assert.equal(result.truncated, false)

  const limited = referencesFor(refIndex, matches, 0)
  assert.deepEqual(limited.references, [])
  assert.equal(limited.truncated, true, '达到上限时如实标记截断')
})

test('referencesFor：命名空间/再导出通配符作为潜在引用合并', () => {
  const refIndex = buildReferenceIndex([
    { from: 'src/ns.ts', to: 'src/a.ts', line: 1, symbols: ['*'] },
    { from: 'src/b.ts', to: 'src/a.ts', line: 2, symbols: ['parse'] },
  ])
  const matches = [{ path: 'src/a.ts', symbols: [{ name: 'parse' }, { name: 'other' }] }]
  const result = referencesFor(refIndex, matches)
  assert.deepEqual(result.references, [
    {
      path: 'src/a.ts',
      symbol: 'parse',
      referencedBy: [{ path: 'src/b.ts', line: 2 }, { path: 'src/ns.ts', line: 1 }],
    },
    {
      path: 'src/a.ts',
      symbol: 'other',
      referencedBy: [{ path: 'src/ns.ts', line: 1 }],
    },
  ])
})

test('buildReferenceIndex：barrel 再导出链把具名导入归到真实定义文件', () => {
  const edges = [
    { from: 'src/index.ts', to: 'src/core.ts', kind: 'export-from', line: 1, symbols: ['*'] },
    { from: 'src/app.ts', to: 'src/index.ts', kind: 'import', line: 1, symbols: ['parse'] },
  ]
  const files = [
    { path: 'src/index.ts', symbols: [] },
    { path: 'src/core.ts', symbols: [{ name: 'parse', exported: true }] },
    { path: 'src/app.ts', symbols: [{ name: 'run', exported: true }] },
  ]
  const refs = buildReferenceIndex(edges, files)
  assert.deepEqual(refs.get('src/core.ts').get('parse'), [{ path: 'src/app.ts', line: 1 }])

  const withoutFiles = buildReferenceIndex(edges)
  assert.equal(withoutFiles.get('src/core.ts').get('parse'), undefined, '不提供文件条目时保持只按直接边记账')
})

test('buildReferenceIndex：多级 barrel 链与具名再导出', () => {
  const edges = [
    { from: 'src/index.ts', to: 'src/impl/index.ts', kind: 'export-from', line: 1, symbols: ['*'] },
    { from: 'src/impl/index.ts', to: 'src/impl/core.ts', kind: 'export-from', line: 2, symbols: ['parse'] },
    { from: 'src/app.ts', to: 'src/index.ts', kind: 'import', line: 3, symbols: ['parse'] },
  ]
  const files = [
    { path: 'src/index.ts', symbols: [] },
    { path: 'src/impl/index.ts', symbols: [] },
    { path: 'src/impl/core.ts', symbols: [{ name: 'parse', exported: true }] },
    { path: 'src/app.ts', symbols: [{ name: 'run', exported: true }] },
  ]
  const refs = buildReferenceIndex(edges, files)
  assert.deepEqual(refs.get('src/impl/core.ts').get('parse'), [
    { path: 'src/app.ts', line: 3 },
    { path: 'src/impl/index.ts', line: 2 },
  ], '最终使用方与直接具名再导出的中间 barrel 都是引用')
})

test('buildReferenceIndex：barrel 本地导出遮蔽星号、歧义来源不下传', () => {
  const edges = [
    { from: 'src/barrel.ts', to: 'src/a.ts', kind: 'export-from', line: 1, symbols: ['*'] },
    { from: 'src/barrel.ts', to: 'src/b.ts', kind: 'export-from', line: 2, symbols: ['*'] },
    { from: 'src/app.ts', to: 'src/barrel.ts', kind: 'import', line: 1, symbols: ['foo'] },
  ]
  const shadowFiles = [
    { path: 'src/barrel.ts', symbols: [{ name: 'foo', exported: true }] },
    { path: 'src/a.ts', symbols: [{ name: 'foo', exported: true }] },
    { path: 'src/app.ts', symbols: [] },
  ]
  const shadowed = buildReferenceIndex(edges, shadowFiles)
  assert.deepEqual(shadowed.get('src/barrel.ts').get('foo'), [{ path: 'src/app.ts', line: 1 }], '本地导出保留直接引用')
  assert.equal(shadowed.get('src/a.ts').get('foo'), undefined, '被遮蔽的星号来源不接收引用')

  const ambiguous = buildReferenceIndex(edges, [
    { path: 'src/barrel.ts', symbols: [] },
    { path: 'src/a.ts', symbols: [{ name: 'foo', exported: true }] },
    { path: 'src/b.ts', symbols: [{ name: 'foo', exported: true }] },
    { path: 'src/app.ts', symbols: [] },
  ])
  assert.equal(ambiguous.get('src/a.ts').get('foo'), undefined, '两个来源都导出 foo 时按歧义处理')
  assert.equal(ambiguous.get('src/b.ts').get('foo'), undefined)
})

test('buildReferenceIndex：通配导入沿 barrel 链记为下游潜在引用', () => {
  const edges = [
    { from: 'src/barrel.ts', to: 'src/core.ts', kind: 'export-from', line: 1, symbols: ['*'] },
    { from: 'src/app.ts', to: 'src/barrel.ts', kind: 'import', line: 5, symbols: ['*'] },
  ]
  const refs = buildReferenceIndex(edges, [
    { path: 'src/barrel.ts', symbols: [] },
    { path: 'src/core.ts', symbols: [{ name: 'parse', exported: true }] },
    { path: 'src/app.ts', symbols: [] },
  ])
  assert.deepEqual(refs.get('src/core.ts').get('*'), [
    { path: 'src/app.ts', line: 5 },
    { path: 'src/barrel.ts', line: 1 },
  ])
})

test('referencesFor：无命中/无引用/坏符号返回空且不抛错', () => {
  const refIndex = buildReferenceIndex([{ from: 'b.ts', to: 'a.ts', symbols: ['x'] }])
  assert.deepEqual(referencesFor(refIndex, []), { references: [], truncated: false })
  assert.deepEqual(referencesFor(refIndex, [{ path: 'missing.ts', symbols: [{ name: 'x' }] }]), { references: [], truncated: false })
  assert.deepEqual(referencesFor(refIndex, [{ path: 'a.ts', symbols: [{}] }]), { references: [], truncated: false })
  assert.deepEqual(referencesFor(new Map(), [{ path: 'a.ts', symbols: [{ name: 'x' }] }]), { references: [], truncated: false })
})

test('MAX_REFERENCE_ENTRIES 是有界输出常量', () => {
  assert.equal(typeof MAX_REFERENCE_ENTRIES, 'number')
  assert.ok(MAX_REFERENCE_ENTRIES > 0 && MAX_REFERENCE_ENTRIES <= 500)
})

test('importsFor：按命中文件顺序收集出边，保留副作用导入与行号', () => {
  const edges = [
    { from: 'src/a.ts', to: 'src/b.ts', line: 3, symbols: ['parse'] },
    { from: 'src/a.ts', to: 'src/c.ts', line: 7, symbols: [] }, // 副作用导入保留
    { from: 'src/a.ts', to: 'src/d.ts', symbols: ['main'] }, // 旧索引无边号
    // 自引用跳过（文件依赖自己不构成出边）
    { from: 'src/a.ts', to: 'src/a.ts', line: 1, symbols: ['self'] },
    // 坏边安静跳过
    null,
    { from: null, to: 'src/b.ts' },
  ]

  const result = importsFor(edges, [{ path: 'src/a.ts' }])
  assert.deepEqual(result.imports, [
    { path: 'src/b.ts', line: 3, symbols: ['parse'], depth: 1 },
    { path: 'src/c.ts', line: 7, symbols: [], depth: 1 },
    { path: 'src/d.ts', symbols: ['main'], depth: 1 },
  ])
  assert.equal(result.truncated, false)
})

test('importsFor：按命中文件顺序输出，未命中文件不产生出边', () => {
  const edges = [
    { from: 'src/a.ts', to: 'src/x.ts', line: 2, symbols: ['a'] },
    { from: 'src/b.ts', to: 'src/y.ts', line: 4, symbols: ['b'] },
  ]
  const result = importsFor(edges, [{ path: 'src/b.ts' }, { path: 'src/a.ts' }])
  assert.deepEqual(result.imports.map(entry => entry.path), ['src/y.ts', 'src/x.ts'])
  assert.deepEqual(importsFor(edges, [{ path: 'missing.ts' }]), { imports: [], truncated: false })
})

test('importsFor：达到上限时截断并如实标记', () => {
  const edges = [
    { from: 'src/a.ts', to: 'src/b.ts', line: 1, symbols: [] },
    { from: 'src/a.ts', to: 'src/c.ts', line: 2, symbols: [] },
  ]
  assert.deepEqual(importsFor(edges, [{ path: 'src/a.ts' }], 1), {
    imports: [{ path: 'src/b.ts', line: 1, symbols: [], depth: 1 }],
    truncated: true,
  })
  assert.deepEqual(importsFor(edges, [], 1), { imports: [], truncated: false })
  assert.deepEqual(importsFor(undefined, [{ path: 'src/a.ts' }]), { imports: [], truncated: false })
})

test('importsFor：depth 展开传递依赖，去重并保留最小跳数', () => {
  const edges = [
    { from: 'a.ts', to: 'b.ts', line: 1, symbols: ['b'] },
    { from: 'b.ts', to: 'c.ts', line: 2, symbols: ['c'] },
    { from: 'a.ts', to: 'c.ts', line: 3, symbols: ['c'] },
    { from: 'c.ts', to: 'd.ts', line: 4, symbols: [] },
    { from: 'd.ts', to: 'a.ts', line: 5, symbols: ['a'] }, // 环：不把起点当依赖
  ]
  const one = importsFor(edges, [{ path: 'a.ts' }], 100, 1)
  assert.deepEqual(one.imports.map(i => [i.path, i.depth]), [['b.ts', 1], ['c.ts', 1]])
  const two = importsFor(edges, [{ path: 'a.ts' }], 100, 2)
  assert.deepEqual(two.imports.map(i => [i.path, i.depth]), [['b.ts', 1], ['c.ts', 1], ['d.ts', 2]])
  const three = importsFor(edges, [{ path: 'a.ts' }], 100, 3)
  assert.deepEqual(three.imports.map(i => [i.path, i.depth]), [['b.ts', 1], ['c.ts', 1], ['d.ts', 2]], '回到起点不重复')
  // 越界钳制：0 → 1 跳；99 → 3 跳
  assert.deepEqual(importsFor(edges, [{ path: 'a.ts' }], 100, 0).imports.map(i => i.depth), [1, 1])
  assert.equal(importsFor(edges, [{ path: 'a.ts' }], 100, 99).imports.length, 3)
})

test('importsFor：多命中文件共享去重集合，命中文件本身不作为依赖', () => {
  const edges = [
    { from: 'a.ts', to: 'b.ts', line: 1, symbols: [] },
    { from: 'b.ts', to: 'c.ts', line: 2, symbols: [] },
  ]
  const result = importsFor(edges, [{ path: 'a.ts' }, { path: 'b.ts' }], 100, 2)
  assert.deepEqual(result.imports.map(i => [i.path, i.depth]), [['c.ts', 1]], 'b 是命中文件，不作为 a 的依赖；c 去重后只出现一次')
})

test('MAX_IMPORT_ENTRIES 是有界输出常量', () => {
  assert.equal(typeof MAX_IMPORT_ENTRIES, 'number')
  assert.ok(MAX_IMPORT_ENTRIES > 0 && MAX_IMPORT_ENTRIES <= 500)
})

test('dependentsFor：反向收集依赖方，depth 展开传递影响面', () => {
  const edges = [
    { from: 'a.ts', to: 'b.ts', line: 1, symbols: ['b'] },
    { from: 'b.ts', to: 'c.ts', line: 2, symbols: ['c'] },
    { from: 'a.ts', to: 'c.ts', line: 3, symbols: ['c'] },
    { from: 'c.ts', to: 'd.ts', line: 4, symbols: [] },
    { from: 'd.ts', to: 'a.ts', line: 5, symbols: ['a'] }, // 环：不把起点当依赖方
  ]
  // 命中 c：直接依赖方按边出现顺序为 b、a
  const one = dependentsFor(edges, [{ path: 'c.ts' }], 100, 1)
  assert.deepEqual(one.dependents.map(d => [d.path, d.depth]), [['b.ts', 1], ['a.ts', 1]])
  assert.deepEqual(one.dependents[0].symbols, ['c'])
  // 2 跳：d → a → c（d 经 a 间接依赖 c）
  const two = dependentsFor(edges, [{ path: 'c.ts' }], 100, 2)
  assert.deepEqual(two.dependents.map(d => [d.path, d.depth]), [['b.ts', 1], ['a.ts', 1], ['d.ts', 2]])
  // 3 跳：d 的依赖方回到 c（起点），环收敛不重复
  const three = dependentsFor(edges, [{ path: 'c.ts' }], 100, 3)
  assert.deepEqual(three.dependents.map(d => [d.path, d.depth]), [['b.ts', 1], ['a.ts', 1], ['d.ts', 2]])
  // 越界钳制：0 → 1 跳；99 → 3 跳
  assert.deepEqual(dependentsFor(edges, [{ path: 'c.ts' }], 100, 0).dependents.map(d => d.depth), [1, 1])
  assert.equal(dependentsFor(edges, [{ path: 'c.ts' }], 100, 99).dependents.length, 3)
})

test('dependentsFor：命中文件本身不作为依赖方，坏边安静跳过', () => {
  const edges = [
    { from: 'a.ts', to: 'b.ts', line: 1, symbols: [] },
    { from: 'b.ts', to: 'c.ts', line: 2, symbols: [] },
    null,
    { from: 'x.ts' },
    { from: 'c.ts', to: 'c.ts', line: 9, symbols: ['c'] }, // 自引用
  ]
  // 命中 a、b：从 b 出发的 a 是命中文件 → 排除，结果为空
  const shared = dependentsFor(edges, [{ path: 'a.ts' }, { path: 'b.ts' }], 100, 2)
  assert.deepEqual(shared.dependents, [])
  // 只命中 c：直接依赖方为 b
  const only = dependentsFor(edges, [{ path: 'c.ts' }], 100, 1)
  assert.deepEqual(only.dependents.map(d => d.path), ['b.ts'])
})

test('dependentsFor：达到上限时截断并如实标记', () => {
  const edges = [
    { from: 'x1.ts', to: 'target.ts', symbols: [] },
    { from: 'x2.ts', to: 'target.ts', symbols: [] },
    { from: 'x3.ts', to: 'target.ts', symbols: [] },
  ]
  const capped = dependentsFor(edges, [{ path: 'target.ts' }], 2, 1)
  assert.equal(capped.dependents.length, 2)
  assert.equal(capped.truncated, true)
  const all = dependentsFor(edges, [{ path: 'target.ts' }], 100, 1)
  assert.equal(all.truncated, false)
  assert.deepEqual(dependentsFor([], [{ path: 'none.ts' }], 100, 3), { dependents: [], truncated: false })
})

test('topDependents：按不同依赖方数量排名（去重、自引用忽略、并列按路径）', () => {
  const edges = [
    { from: 'a.ts', to: 'lib.ts', symbols: [] },
    { from: 'a.ts', to: 'lib.ts', line: 9, symbols: [] }, // 同一文件重复 import 只计一次
    { from: 'b.ts', to: 'lib.ts', symbols: [] },
    { from: 'lib.ts', to: 'lib.ts', symbols: [] }, // 自引用忽略
    { from: 'c.ts', to: 'util.ts', symbols: [] },
    { from: 'd.ts', to: 'util.ts', symbols: [] },
    { from: 'e.ts', to: 'only.ts', symbols: [] },
    null,
  ]
  assert.deepEqual(topDependents(edges, 10), [
    { path: 'lib.ts', dependents: 2 },
    { path: 'util.ts', dependents: 2 },
    { path: 'only.ts', dependents: 1 },
  ])
  assert.deepEqual(topDependents(edges, 1), [{ path: 'lib.ts', dependents: 2 }], '上限生效')
  assert.deepEqual(topDependents([], 10), [])
  assert.equal(MAX_HUB_ENTRIES, 10)
})
