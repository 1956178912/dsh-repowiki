/**
 * 模块级 Wiki 页构造测试（确定性聚合，无 LLM）。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildModulePages } from '../src/module-doc.js'

const modules = [
  { path: '.', parent: '', files: 0, symbols: 0 },
  { path: 'src', parent: '.', files: 1, symbols: 1 },
  { path: 'src/deep', parent: 'src', files: 1, symbols: 1 },
]

const cardDocs = [
  {
    path: 'src/a.ts',
    title: '入口',
    summary: '程序入口。',
    body: '## 概要 / Summary\n\n入口。\n\n## 陷阱 / Pitfalls\n\n- 注意初始化顺序\n',
  },
  {
    path: 'src/deep/b.ts',
    title: '深模块',
    summary: '内部实现。',
    body: '## 陷阱 / Pitfalls\n\n- (none)\n',
  },
]

const files = [
  {
    path: 'src/a.ts',
    symbols: [{ name: 'main', kind: 'function', line: 3, endLine: 9 }],
  },
  {
    path: 'src/deep/b.ts',
    symbols: [{ name: 'helper', kind: 'function', line: 1, endLine: 2 }],
  },
]

const edges = [{ from: 'src/a.ts', to: 'src/deep/b.ts' }]

test('buildModulePages：按模块聚合卡片、符号行号、陷阱与依赖方向', () => {
  const pages = buildModulePages({
    modules, cardDocs, files, edges, projectName: 'Demo', locale: 'zh',
  })
  assert.deepEqual(pages.map(p => p.slug), ['modules/src', 'modules/src/deep'])
  const src = pages[0]
  assert.equal(src.title, 'src')
  assert.equal(src.module, 'src')
  assert.match(src.overview, /1 个文件卡片/)
  assert.match(src.sections[0].body, /`src\/a\.ts` — 入口/)
  assert.match(src.sections[1].body, /`main` \(function, L3-L9\)/)
  assert.match(src.sections[2].body, /- 注意初始化顺序/)
  assert.deepEqual(src.sections.map(s => s.heading), ['模块组成', '关键符号', '注意事项', '依赖模块'])
  assert.match(src.sections[3].body, /`src\/deep` \(1 条依赖边\)/)
  assert.deepEqual(src.sections[0].sources, ['src/a.ts'])

  const deep = pages[1]
  assert.deepEqual(deep.sections.map(s => s.heading),
    ['模块组成', '关键符号', '被依赖模块', '高风险入口'])
  assert.match(deep.sections[2].body, /`src` \(1 条依赖边\)/, '入边单独成节')
  assert.match(deep.sections[3].body, /`src\/deep\/b\.ts` \(1 个依赖方文件\)/, '被依赖文件成为热点')
})

test('buildModulePages：根模块用项目名，无卡片模块不产页', () => {
  const pages = buildModulePages({
    modules: [...modules, { path: 'empty', parent: '.', files: 0, symbols: 0 }],
    cardDocs: [{ path: 'README.md', title: 'README', summary: 's', body: '' }],
    files: [],
    edges: [],
    projectName: 'Demo',
    locale: 'en',
  })
  assert.equal(pages.length, 1)
  assert.equal(pages[0].title, 'Demo')
  assert.equal(pages[0].slug, 'modules/root')
  assert.match(pages[0].overview, /deterministically without model calls/)
})

test('buildModulePages：英文 locale 的章节标题与摘要', () => {
  const pages = buildModulePages({
    modules, cardDocs, files, edges, projectName: 'Demo', locale: 'en',
  })
  const src = pages[0]
  assert.deepEqual(src.sections.map(s => s.heading), ['Composition', 'Key symbols', 'Pitfalls', 'Depends on'])
  assert.deepEqual(pages[1].sections.map(s => s.heading),
    ['Composition', 'Key symbols', 'Depended on by', 'High-fan-in files'])
})

test('buildModulePages：模块间双向 import 标注为循环依赖', () => {
  const cyclicEdges = [
    { from: 'src/a.ts', to: 'src/deep/b.ts' },
    { from: 'src/deep/b.ts', to: 'src/a.ts' },
  ]
  const zhPages = buildModulePages({
    modules, cardDocs, files, edges: cyclicEdges, projectName: 'Demo', locale: 'zh',
  })
  const src = zhPages[0]
  assert.deepEqual(src.sections.map(s => s.heading), [
    '模块组成', '关键符号', '注意事项', '依赖模块', '被依赖模块', '循环依赖', '高风险入口',
  ])
  assert.match(src.sections[5].body, /`src\/deep` \(双向 import 边\)/, '双向关系单独成节')
  assert.deepEqual(src.sections[5].sources, [])

  const enPages = buildModulePages({
    modules, cardDocs, files, edges: cyclicEdges, projectName: 'Demo', locale: 'en',
  })
  const circular = enPages[0].sections.find(s => s.heading === 'Circular dependencies')
  assert.ok(circular, '英文页循环节存在')
  assert.match(circular.body, /imports both ways/)

  // 单向依赖不产生循环节
  const acyclic = buildModulePages({
    modules, cardDocs, files, edges: edges, projectName: 'Demo', locale: 'zh',
  })
  assert.ok(!acyclic[0].sections.some(s => s.heading === '循环依赖'))
})

test('buildModulePages：模块内高风险入口按 fan-in 排名（跨模块依赖方计入）', () => {
  const hubModules = [
    { path: '.', parent: '', files: 0, symbols: 0 },
    { path: 'lib', parent: '.', files: 2, symbols: 0 },
    { path: 'app', parent: '.', files: 1, symbols: 0 },
  ]
  const hubCards = [
    { path: 'lib/util.ts', title: '工具', summary: 's', body: '' },
    { path: 'lib/types.ts', title: '类型', summary: 's', body: '' },
  ]
  const hubFiles = [{ path: 'lib/util.ts' }, { path: 'lib/types.ts' }, { path: 'app/main.ts' }]
  const hubEdges = [
    { from: 'app/main.ts', to: 'lib/util.ts' },
    { from: 'lib/types.ts', to: 'lib/util.ts' },
    { from: 'lib/util.ts', to: 'lib/util.ts' }, // 自引用忽略
    { from: 'lib/util.ts', to: 'lib/types.ts' },
  ]
  const pages = buildModulePages({
    modules: hubModules, cardDocs: hubCards, files: hubFiles, edges: hubEdges,
    projectName: 'Demo', locale: 'zh',
  })
  const lib = pages.find(p => p.module === 'lib')
  const section = lib.sections.find(s => s.heading === '高风险入口')
  assert.ok(section, '存在 fan-in 节')
  assert.match(section.body, /`lib\/util\.ts` \(2 个依赖方文件\)/, '跨模块依赖方计入')
  assert.match(section.body, /`lib\/types\.ts` \(1 个依赖方文件\)/)
  assert.deepEqual(section.sources, ['lib/util.ts', 'lib/types.ts'], '章节来源为热点文件')

  // 模块内无入边时不产生该节
  const noHub = buildModulePages({
    modules: hubModules, cardDocs: hubCards, files: hubFiles, edges: [], projectName: 'Demo', locale: 'zh',
  })
  assert.ok(!noHub[0].sections.some(s => s.heading === '高风险入口'))
})
