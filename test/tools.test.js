/**
 * 工具执行层单元测试：repowiki-index / repowiki-cards 的 execute 与渲染。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { repowikiIndexTool } from '../src/tool-index.js'
import { repowikiCardsTool } from '../src/tool-cards.js'
import { repowikiExportTool } from '../src/tool-export.js'
import { repowikiImportTool } from '../src/tool-import.js'
import { repowikiEditTool } from '../src/tool-edit.js'
import { repowikiMemoryTool } from '../src/tool-memory.js'
import { writeMemory } from '../src/memory.js'
import { cardIsFresh, cardIsProtected, countOrphaned } from '../src/tool-extract.js'

/**
 * 构造一个最小插件 ctx（fake fs）。
 * @param {string} rootDir - 介质根。
 * @returns {{fs:object, tools:object, workingDirectory:object}} ctx。
 */
function makeCtx(rootDir) {
  return {
    fs: makeFakeFs(rootDir),
    tools: { register: () => () => {} },
    workingDirectory: { get: () => rootDir },
  }
}

/** 工具 execute 所需的最小 exec。 */
const fakeExec = { signal: new AbortController().signal, agent: undefined }

test('repowiki-index execute：产出索引文件与统计', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-tool-'))
  nodefs.writeFileSync(path.join(dir, 'app.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)
  const tool = repowikiIndexTool(ctx)
  const value = await tool.execute({}, fakeExec)

  assert.equal(value.root, dir)
  assert.ok(value.indexPath.endsWith('.dsh-repowiki/index.json'))
  assert.equal(value.files, 1)
  assert.equal(value.symbols, 1)
  assert.equal(value.capped, false)
  assert.equal(value.skipped, 0, '无读取失败/超大文件时 skipped 为 0')
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki', 'index.json')))

  const rendered = tool.output.render({}, value)
  assert.match(rendered[0].text, /Indexed 1 files/)

  const view = tool.presentResult?.({}, { value })
  assert.equal(view, undefined, 'index 工具无需 search 卡片，呈现交由 generic/render')
})

test('repowiki-cards execute：无索引时给出降级提示（不静默空）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-tool-'))
  const ctx = makeCtx(dir)
  const tool = repowikiCardsTool(ctx)
  const value = await tool.execute({}, fakeExec)

  assert.equal(value.indexed, false)
  assert.match(value.hint, /repowiki-index/)
  const rendered = tool.output.render({}, value)
  assert.equal(rendered[0].text, value.hint)
})

test('repowiki-cards execute：有索引时按 query 过滤并给出 search 视图', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-tool-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function parse() {}\nexport class Parser {}\n')
  nodefs.writeFileSync(path.join(dir, 'b.ts'), 'export function other() {}\n')
  const ctx = makeCtx(dir)

  // 先建索引（走真实的 index 工具，链路也就被一并验证）
  await repowikiIndexTool(ctx).execute({}, fakeExec)

  const cards = repowikiCardsTool(ctx)
  const value = await cards.execute({ query: 'parse' }, fakeExec)
  assert.equal(value.indexed, true)
  assert.equal(value.matches.length, 1, '只有 a.ts 命中')
  assert.equal(value.matches[0].symbols.length, 2, 'parse 与 Parser 都含子串')
  assert.equal(value.total, 1)
  assert.equal(value.truncated, false)
  assert.ok(value.technologies.length === 0, '无 package.json 时技术栈为空数组')

  const view = cards.presentResult({}, { value })
  assert.equal(view.card, 'search')
  assert.equal(view.total, 1)

  const kindFiltered = await cards.execute({ query: 'parse', kind: 'class' }, fakeExec)
  assert.equal(kindFiltered.matches[0].symbols.length, 1)
  assert.equal(kindFiltered.matches[0].symbols[0].name, 'Parser')
})

test('repowiki-cards execute：offset 分页与 total/truncated 语义', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-tool-page-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function parseA() {}\n')
  nodefs.writeFileSync(path.join(dir, 'b.ts'), 'export function parseB() {}\n')
  nodefs.writeFileSync(path.join(dir, 'c.ts'), 'export function parseC() {}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const cards = repowikiCardsTool(ctx)

  const first = await cards.execute({ query: 'parse', limit: 1 }, fakeExec)
  assert.equal(first.matches.length, 1)
  assert.equal(first.total, 3)
  assert.equal(first.truncated, true)
  assert.equal(first.offset, 0)

  const second = await cards.execute({ query: 'parse', limit: 1, offset: 1 }, fakeExec)
  assert.equal(second.matches.length, 1)
  assert.equal(second.total, 3, 'offset 不改变全集计数')
  assert.equal(second.truncated, true, '仍有下一页')
  assert.equal(second.offset, 1)
  assert.notEqual(second.matches[0].path, first.matches[0].path)

  const last = await cards.execute({ query: 'parse', limit: 1, offset: 2 }, fakeExec)
  assert.equal(last.matches.length, 1)
  assert.equal(last.truncated, false)
  assert.match(cards.output.render({}, last)[0].text, /showing 3–3/)
})

test('repowiki-cards execute：lang 与 exportedOnly 过滤生效', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-tool-lang-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function parse() {}\nfunction hiddenParse() {}\n')
  nodefs.writeFileSync(path.join(dir, 'a.py'), 'def parse():\n    pass\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const cards = repowikiCardsTool(ctx)

  const crossLang = await cards.execute({ query: 'parse' }, fakeExec)
  assert.equal(crossLang.total, 2, '无 lang 时跨语言命中')

  const ts = await cards.execute({ query: 'parse', lang: 'typescript' }, fakeExec)
  assert.deepEqual(ts.matches.map(m => m.path), ['a.ts'])
  assert.equal(ts.matches[0].symbols.length, 2, 'TS 内两个含 parse 的符号')

  const exported = await cards.execute({ query: 'parse', lang: 'typescript', exportedOnly: true }, fakeExec)
  assert.deepEqual(exported.matches[0].symbols.map(s => s.name), ['parse'], '非导出符号被过滤')
})

test('repowiki-cards execute：方法符号带所属类型（parent）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-tool-parent-'))
  nodefs.writeFileSync(path.join(dir, 'service.ts'), 'export class Service {\n  run(): void {}\n}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const cards = repowikiCardsTool(ctx)

  const out = await cards.execute({ query: 'run' }, fakeExec)
  assert.equal(out.matches[0].symbols[0].name, 'run')
  assert.equal(out.matches[0].symbols[0].parent, 'Service', '方法保留所属类型')
  const rendered = cards.output.render({}, out)
  assert.match(rendered[0].text, /run \(method:2, in Service\)/, '渲染带方法归属')
})

test('repowiki-cards execute：references=true 返回符号级反向引用', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-refs-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function parse() {}\nexport function format() {}\n')
  nodefs.writeFileSync(path.join(dir, 'b.ts'), "import { parse } from './a'\n")
  nodefs.writeFileSync(path.join(dir, 'c.ts'), "import { parse, format } from './a'\n")
  nodefs.writeFileSync(path.join(dir, 'styles.css'), 'body {}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const cards = repowikiCardsTool(ctx)

  const plain = await cards.execute({ query: 'parse' }, fakeExec)
  assert.equal(plain.references, undefined, '默认不计算反向引用')

  const withRefs = await cards.execute({ query: 'parse', references: true }, fakeExec)
  assert.deepEqual(withRefs.references, [
    { path: 'a.ts', symbol: 'parse', referencedBy: [{ path: 'b.ts', line: 1 }, { path: 'c.ts', line: 1 }] },
  ])
  assert.equal(withRefs.referencesTruncated, false)
  const rendered = cards.output.render({}, withRefs)
  assert.match(rendered[0].text, /References:/)
  assert.match(rendered[0].text, /parse in a\.ts ← b\.ts:L1, c\.ts:L1/)

  // 只查 format：引用方只有 c.ts
  const formatRefs = await cards.execute({ query: 'format', references: true }, fakeExec)
  assert.deepEqual(formatRefs.references, [
    { path: 'a.ts', symbol: 'format', referencedBy: [{ path: 'c.ts', line: 1 }] },
  ])

  // target=docs 时没有符号命中，references 为空数组（而不是缺字段）
  const docs = await cards.execute({ query: 'parse', target: 'docs', references: true }, fakeExec)
  assert.deepEqual(docs.references, [])
})

test('repowiki-cards execute：imports=true 返回命中文件的出边', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-imports-'))
  nodefs.writeFileSync(
    path.join(dir, 'a.ts'),
    "import { helper } from './b'\nimport './c'\nexport function parse() { helper() }\n",
  )
  nodefs.writeFileSync(path.join(dir, 'b.ts'), 'export function helper() {}\n')
  nodefs.writeFileSync(path.join(dir, 'c.ts'), "import { deep } from './d'\nexport const seed = 1\n")
  nodefs.writeFileSync(path.join(dir, 'd.ts'), 'export const deep = 2\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const cards = repowikiCardsTool(ctx)

  const plain = await cards.execute({ query: 'parse' }, fakeExec)
  assert.equal(plain.imports, undefined, '默认不计算出边')

  const withImports = await cards.execute({ query: 'parse', imports: true }, fakeExec)
  assert.deepEqual(withImports.imports, [
    { path: 'b.ts', line: 1, symbols: ['helper'], depth: 1 },
    { path: 'c.ts', line: 2, symbols: [], depth: 1 },
  ])
  assert.equal(withImports.importsTruncated, false)
  const rendered = cards.output.render({}, withImports)
  assert.match(rendered[0].text, /Imports:/)
  assert.match(rendered[0].text, /→ b\.ts:L1 \(helper\)/)
  assert.match(rendered[0].text, /→ c\.ts:L2$/, '副作用导入渲染为纯目标路径')

  // depth=2：追加 c.ts → d.ts 的传递依赖，用 ⇢ 与 hops 标注
  const transitive = await cards.execute({ query: 'parse', imports: true, depth: 2 }, fakeExec)
  assert.deepEqual(transitive.imports.map(i => [i.path, i.depth]), [
    ['b.ts', 1],
    ['c.ts', 1],
    ['d.ts', 2],
  ])
  const transitiveText = cards.output.render({}, transitive)[0].text
  assert.match(transitiveText, /⇢ d\.ts:L1 \(deep, 2 hops\)/)
  assert.ok(!transitiveText.includes('⇢ b.ts'), '直接依赖仍用 →')

  // depth 越界与非法值按 1 跳处理
  const clamped = await cards.execute({ query: 'parse', imports: true, depth: 99 }, fakeExec)
  assert.equal(clamped.imports.length, 3, 'depth 上限 3')
  const invalid = await cards.execute({ query: 'parse', imports: true, depth: 'x' }, fakeExec)
  assert.deepEqual(invalid.imports.map(i => i.depth), [1, 1], '非法 depth 回退 1')

  // 命中文件没有出边时返回空数组，而不是缺字段
  const leaf = await cards.execute({ query: 'helper', imports: true }, fakeExec)
  assert.deepEqual(leaf.imports, [])

  // dependents=true：反向影响面；depth=2 展开传递依赖方
  assert.equal(plain.dependents, undefined, '默认不计算依赖方')
  const directDependents = await cards.execute({ query: 'deep', dependents: true }, fakeExec)
  assert.deepEqual(directDependents.dependents, [
    { path: 'c.ts', line: 1, symbols: ['deep'], depth: 1 },
  ])
  assert.equal(directDependents.dependentsTruncated, false)
  const transitiveDependents = await cards.execute({ query: 'deep', dependents: true, depth: 2 }, fakeExec)
  assert.deepEqual(transitiveDependents.dependents.map(d => [d.path, d.depth]), [
    ['c.ts', 1],
    ['a.ts', 2],
  ])
  const dependentText = cards.output.render({}, transitiveDependents)[0].text
  assert.match(dependentText, /Dependents:/)
  assert.match(dependentText, /← c\.ts:L1 \(deep\)/)
  assert.match(dependentText, /⇠ a\.ts:L2 \(2 hops\)/, '更深跳数用 ⇠ 并标注 hops')
  // 命中文件没有依赖方时返回空数组
  const rootDependents = await cards.execute({ query: 'parse', dependents: true }, fakeExec)
  assert.deepEqual(rootDependents.dependents, [])

  // target=docs 没有符号命中，imports 同样为空数组
  const docs = await cards.execute({ query: 'parse', target: 'docs', imports: true }, fakeExec)
  assert.deepEqual(docs.imports, [])
})

test('repowiki-cards execute：wikiReferences=true 反查 Wiki 页面/章节引用', async () => {
  const savedLang = process.env.LANG
  process.env.LANG = 'en'
  try {
    const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-wikiref-'))
    nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function parse() {}\n')
    const ctx = makeCtx(dir)
    await repowikiIndexTool(ctx).execute({}, fakeExec)
    const manifestPath = path.join(dir, '.dsh-repowiki', 'wiki', 'en', '_index.json')
    nodefs.mkdirSync(path.dirname(manifestPath), { recursive: true })
    nodefs.writeFileSync(manifestPath, JSON.stringify({
      schemaVersion: 2,
      pages: [{
        slug: 'overview',
        path: 'wiki/en/overview.md',
        title: 'Overview',
        sources: ['a.ts'],
        sections: [{ heading: 'Core', sources: ['a.ts#L1-L5'] }],
      }],
    }))
    const cards = repowikiCardsTool(ctx)

    const out = await cards.execute({ query: 'parse', wikiReferences: true }, fakeExec)
    assert.deepEqual(out.wikiReferences, [
      { path: 'a.ts', slug: 'overview', title: 'Overview', sections: ['Core'] },
    ])
    assert.equal(out.wikiReferencesTruncated, false)
    const rendered = cards.output.render({}, out)
    assert.match(rendered[0].text, /Wiki citations:/)
    assert.match(rendered[0].text, /a\.ts ← Overview \(Core\)/)

    // 无清单：显式空数组 + 可读 hint
    nodefs.rmSync(manifestPath)
    const missing = await cards.execute({ query: 'parse', wikiReferences: true }, fakeExec)
    assert.deepEqual(missing.wikiReferences, [])
    assert.match(missing.hint, /No wiki manifest/)
  } finally {
    if (savedLang === undefined) delete process.env.LANG
    else process.env.LANG = savedLang
  }
})

test('repowiki-cards execute：按 module 过滤并返回模块清单', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-tool-'))
  nodefs.mkdirSync(path.join(dir, 'src', 'deep'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'top.ts'), 'export const top = 1\n')
  nodefs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export function a() {}\n')
  nodefs.writeFileSync(path.join(dir, 'src', 'deep', 'b.ts'), 'export function b() {}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  const cards = repowikiCardsTool(ctx)

  const all = await cards.execute({}, fakeExec)
  assert.ok(Array.isArray(all.modules), '结果应带模块清单')
  assert.ok(all.modules.some(m => m.path === 'src' && m.files === 1), 'src 直属文件计数')
  assert.ok(all.modules.some(m => m.path === 'src/deep' && m.parent === 'src'))

  const scoped = await cards.execute({ module: 'src' }, fakeExec)
  assert.deepEqual(scoped.matches.map(m => m.path).sort(), ['src/a.ts', 'src/deep/b.ts'],
    '旧索引也可按路径实时推导模块')

  const deep = await cards.execute({ module: 'src/deep' }, fakeExec)
  assert.deepEqual(deep.matches.map(m => m.path), ['src/deep/b.ts'])
})

test('工具契约：name/description/output 契约完整（注册表最低要求）', () => {
  for (const tool of [
    repowikiIndexTool({}), repowikiCardsTool({}),
    repowikiExportTool({}), repowikiImportTool({}),
    repowikiEditTool({}), repowikiMemoryTool({}),
  ]) {
    assert.equal(typeof tool.name, 'string')
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 20, '描述说明用途')
    assert.ok(tool.output && typeof tool.output.schema === 'object' && typeof tool.output.render === 'function', '输出契约完整')
    assert.equal(typeof tool.execute, 'function')
  }
})

test('repowiki-index execute：增量二次调用复用未变文件', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-inc-'))
  nodefs.writeFileSync(path.join(dir, 'keep.ts'), 'export const a = 1\n')
  nodefs.writeFileSync(path.join(dir, 'move.ts'), 'export const b = 2\n')
  const ctx = makeCtx(dir)
  const tool = repowikiIndexTool(ctx)

  const first = await tool.execute({}, fakeExec)
  assert.equal(first.files, 2)
  assert.equal(first.reused, 0, '无旧索引时全部新算')
  assert.equal(first.added, 2)
  assert.equal(first.changed, 0)

  // 内容未变：二次执行全部复用
  const second = await tool.execute({}, fakeExec)
  assert.equal(second.files, 2)
  assert.equal(second.reused, 2)
  assert.equal(second.added, 0)
  assert.equal(second.changed, 0)

  // 修改一个文件：只有它重算
  nodefs.writeFileSync(path.join(dir, 'move.ts'), 'export const b = 22\n')
  const third = await tool.execute({}, fakeExec)
  assert.equal(third.reused, 1)
  assert.equal(third.changed, 1, '修改文件计入 changed')
  assert.equal(third.added, 0)
  assert.equal(third.removed, 0)
  const rendered = tool.output.render({}, third)
  assert.match(rendered[0].text, /1 reused, 0 added, 1 changed, 0 removed/)

  // incremental=false 强制全量
  const full = await tool.execute({ incremental: false }, fakeExec)
  assert.equal(full.reused, 0, 'incremental=false 时不复用')
})

test('cardIsFresh：digest 匹配判定卡片新鲜度', () => {
  assert.equal(cardIsFresh({ digest: 'abc' }, { meta: { sourceDigest: 'abc' } }), true)
  assert.equal(cardIsFresh({ digest: 'abc' }, { meta: { sourceDigest: 'abd' } }), false)
  assert.equal(cardIsFresh({ digest: 'abc' }, { meta: {} }), false, '老卡无 sourceDigest 需重提取')
  assert.equal(cardIsFresh(undefined, { meta: { sourceDigest: 'abc' } }), false)
  assert.equal(cardIsFresh({ digest: 'abc' }, undefined), false)
  assert.equal(cardIsFresh({ digest: '' }, { meta: { sourceDigest: '' } }), false, '空指纹一律不判鲜')
})

test('cardIsProtected：人工修订保护判定', () => {
  assert.equal(cardIsProtected({ meta: { manuallyEdited: true } }), true)
  assert.equal(cardIsProtected({ meta: { manuallyEdited: false } }), false)
  assert.equal(cardIsProtected({ meta: {} }), false, '字段缺失视为未保护')
  assert.equal(cardIsProtected(undefined), false)
})

test('countOrphaned：源文件已消失的卡片计数（不删除）', () => {
  const existing = new Map([
    ['a.ts', { meta: {}, path: 'knowledge/zh/a.md' }],
    ['b.ts', { meta: {}, path: 'knowledge/zh/b.md' }],
    ['c.ts', { meta: {}, path: 'knowledge/zh/c.md' }],
  ])
  assert.equal(countOrphaned(existing, [{ path: 'a.ts' }, { path: 'b.ts' }]), 1)
  assert.equal(countOrphaned(existing, [{ path: 'a.ts' }, { path: 'b.ts' }, { path: 'c.ts' }]), 0)
  assert.equal(countOrphaned(existing, []), 3)
  assert.equal(countOrphaned(new Map(), []), 0)
})

test('repowiki-export/import execute：快照导出与恢复端到端', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-xfer-tool-'))
  nodefs.writeFileSync(path.join(dir, 'app.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)

  // 先建索引，让 .dsh-repowiki/ 有真实资产
  const indexValue = await repowikiIndexTool(ctx).execute({}, fakeExec)
  assert.equal(indexValue.files, 1)

  // 导出到工作区内相对目录
  const exportTool = repowikiExportTool(ctx)
  const exported = await exportTool.execute({ target: 'snapshot' }, fakeExec)
  assert.equal(exported.files, 1, '快照含 index.json')
  assert.ok(nodefs.existsSync(path.join(dir, 'snapshot', 'index.json')))

  const rendered = exportTool.output.render({}, exported)
  assert.match(rendered[0].text, /Exported 1 file\(s\)/)
  assert.match(rendered[0].text, /Snapshot manifest:/)
  assert.ok(nodefs.existsSync(path.join(dir, 'snapshot', '_snapshot.json')), '导出应写快照清单')

  // 目标已存在且非空：默认拒绝
  const refused = await exportTool.execute({ target: 'snapshot' }, fakeExec)
  assert.equal(refused.files, 0)
  assert.match(refused.hint, /overwrite=true/)

  // overwrite=true 合并覆盖
  const merged = await exportTool.execute({ target: 'snapshot', overwrite: true }, fakeExec)
  assert.ok(merged.files >= 1)

  // 缺 target 参数给出可读提示
  const noTarget = await exportTool.execute({}, fakeExec)
  assert.match(noTarget.hint, /target is required/)

  // 清空资产后从快照恢复
  nodefs.rmSync(path.join(dir, '.dsh-repowiki'), { recursive: true, force: true })
  const importTool = repowikiImportTool(ctx)
  const imported = await importTool.execute({ source: 'snapshot' }, fakeExec)
  assert.equal(imported.files, 1)
  assert.equal(imported.indexOk, true, '导入的索引版本可读')
  assert.equal(imported.snapshotManifest, true)
  assert.equal(imported.snapshotVerified, true, '快照清单应与文件指纹一致')
  assert.equal(imported.snapshotChecked, 1)
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki', 'index.json')))
  const impRendered = importTool.output.render({}, imported)
  assert.match(impRendered[0].text, /Snapshot: verified 1 file\(s\)/)
  assert.match(impRendered[0].text, /index.json is present and compatible/)

  // 篡改快照文件：默认拒绝，allowCorrupt=true 才导入
  nodefs.rmSync(path.join(dir, '.dsh-repowiki'), { recursive: true, force: true })
  nodefs.writeFileSync(path.join(dir, 'snapshot', 'index.json'), '{"tampered":true}')
  const corrupt = await importTool.execute({ source: 'snapshot' }, fakeExec)
  assert.equal(corrupt.files, 0)
  assert.equal(corrupt.snapshotVerified, false)
  assert.match(corrupt.hint, /Snapshot verification failed/)
  assert.ok(!nodefs.existsSync(path.join(dir, '.dsh-repowiki', 'index.json')), '校验失败不得导入')

  const forced = await importTool.execute({ source: 'snapshot', allowCorrupt: true }, fakeExec)
  assert.equal(forced.files, 1, 'allowCorrupt 允许导入')
  assert.equal(forced.snapshotVerified, false)
  assert.match(forced.hint, /allowCorrupt=true/)

  // 资产已存在且无 overwrite：导入被拒
  const impRefused = await importTool.execute({ source: 'snapshot' }, fakeExec)
  assert.equal(impRefused.files, 0)
  assert.match(impRefused.hint, /overwrite=true/)

  // 源不存在给出可读提示
  const noSource = await importTool.execute({ source: 'nope' }, fakeExec)
  assert.match(noSource.hint, /does not exist or is empty/)
})

test('repowiki-import execute：只导入快照清单登记的文件，未登记文件被跳过', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-unlisted-'))
  nodefs.writeFileSync(path.join(dir, 'app.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  await repowikiExportTool(ctx).execute({ target: 'snapshot' }, fakeExec)

  // 快照目录里混入未登记文件（模拟手工添加或被注入的内容）
  nodefs.mkdirSync(path.join(dir, 'snapshot', 'wiki', 'zh'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'snapshot', 'wiki', 'zh', 'injected.md'), '# injected\n')

  nodefs.rmSync(path.join(dir, '.dsh-repowiki'), { recursive: true, force: true })
  const importTool = repowikiImportTool(ctx)
  const imported = await importTool.execute({ source: 'snapshot' }, fakeExec)
  assert.equal(imported.files, 1, '只复制清单登记的 index.json')
  assert.equal(imported.snapshotVerified, true, '未登记文件不影响已登记文件的校验')
  assert.equal(imported.snapshotUnlisted, 1)
  assert.deepEqual(imported.snapshotUnlistedPaths, ['wiki/zh/injected.md'])
  assert.ok(
    !nodefs.existsSync(path.join(dir, '.dsh-repowiki', 'wiki', 'zh', 'injected.md')),
    '未登记文件不得进入资产目录',
  )
  const rendered = importTool.output.render({}, imported)
  assert.match(rendered[0].text, /Skipped 1 unlisted file\(s\).*wiki\/zh\/injected\.md/)
})

test('repowiki-memory execute：write/list/accept/reject 审核闭环', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-mem-tool-'))
  const ctx = makeCtx(dir)
  const tool = repowikiMemoryTool(ctx)

  // 空目录 list
  const empty = await tool.execute({ action: 'list', locale: 'zh' }, fakeExec)
  assert.equal(empty.total, 0)

  // write（显式 locale，避免依赖测试进程的 LANG）
  const written = await tool.execute({
    action: 'write', locale: 'zh',
    title: 'Prefer Fail-Fast', body: '缺输入早返回。',
    tags: ['convention'], path: 'src/assets.js',
  }, fakeExec)
  assert.equal(written.status, 'pending')
  assert.ok(written.slug, '应生成 slug')
  const rendered = tool.output.render({}, written)
  assert.match(rendered[0].text, /Memory written/)

  // write 缺 title/body 给出可读提示
  const bad = await tool.execute({ action: 'write', locale: 'zh', title: 'x' }, fakeExec)
  assert.equal(bad.status, 'invalid')
  assert.match(bad.hint, /title and body are required/)

  // list 默认 pending
  const pending = await tool.execute({ action: 'list', locale: 'zh' }, fakeExec)
  assert.equal(pending.total, 1)
  assert.equal(pending.entries[0].slug, written.slug)
  assert.equal(pending.entries[0].status, 'pending')

  // accept 后 pending 为空、accepted 出现
  const accepted = await tool.execute({ action: 'accept', locale: 'zh', slug: written.slug }, fakeExec)
  assert.equal(accepted.status, 'accepted')
  assert.equal(accepted.path, '.dsh-repowiki/memory/zh/prefer-fail-fast.md')
  const afterAccept = await tool.execute({ action: 'list', locale: 'zh' }, fakeExec)
  assert.equal(afterAccept.total, 0, 'pending 应为空')
  const acceptedList = await tool.execute({ action: 'list', locale: 'zh', status: 'accepted' }, fakeExec)
  assert.equal(acceptedList.total, 1)

  // reject 路径与不存在条目
  await tool.execute({ action: 'write', locale: 'zh', title: 'Drop Me', body: '否决候选。' }, fakeExec)
  const rejected = await tool.execute({ action: 'reject', locale: 'zh', slug: 'drop-me' }, fakeExec)
  assert.equal(rejected.status, 'rejected')
  const rejectedList = await tool.execute({ action: 'list', locale: 'zh', status: 'rejected' }, fakeExec)
  assert.equal(rejectedList.total, 1)

  const missing = await tool.execute({ action: 'reject', locale: 'zh', slug: 'nope' }, fakeExec)
  assert.match(missing.hint, /not found/)

  // F6 回归：accept 的 slug 走白名单， '../../../../../tmp/x' 不得拼进路径
  const traversal = await tool.execute({ action: 'accept', locale: 'zh', slug: '../../../../../tmp/x' }, fakeExec)
  assert.equal(traversal.status, 'invalid')
  assert.match(traversal.hint, /plain file name/)
})

test('repowiki-edit execute：人工卡 create/update 闭环', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-edit-tool-'))
  const ctx = makeCtx(dir)
  const tool = repowikiEditTool(ctx)

  // create：索引外路径（孤儿人工卡）
  const created = await tool.execute({
    action: 'create', locale: 'zh', path: 'docs/decisions.md',
    title: '为什么不用重量级解析框架',
    body: '# 为什么不用重量级解析框架\n\n## 概要 / Summary\n\nADR-0001 的决策。\n',
    tags: ['decision'],
  }, fakeExec)
  assert.equal(created.slug, 'docs-decisions')
  const cardPath = path.join(dir, '.dsh-repowiki', 'knowledge', 'zh', 'docs-decisions.md')
  assert.ok(nodefs.existsSync(cardPath), '人工卡写入知识目录')
  const cardText = nodefs.readFileSync(cardPath, 'utf8')
  assert.match(cardText, /"manuallyEdited": true/)
  assert.match(cardText, /"path": "docs\/decisions.md"/)
  assert.match(cardText, /"sourceDigest": ""/)
  assert.match(cardText, /# 为什么不用重量级解析框架/)

  // create 缺 title/body 给出可读提示
  const bad = await tool.execute({ action: 'create', locale: 'zh', path: 'x.md' }, fakeExec)
  assert.match(bad.hint, /title and body are required/)

  // update 不存在的卡片 → 提示走 create
  const notFound = await tool.execute({ action: 'update', locale: 'zh', path: 'nope.ts' }, fakeExec)
  assert.match(notFound.hint, /Use action=create/)

  // 造一张自动卡用于 update
  const auto = '---\n' + JSON.stringify({
    schemaVersion: 1, path: 'src/a.ts', lang: 'typescript', locale: 'zh',
    sourceDigest: 'dig-a', title: '旧标题', tags: ['旧'],
    manuallyEdited: false, generatedAt: '2026-01-01T00:00:00.000Z',
  }, null, 2) + '\n---\n# 旧标题\n\n旧正文\n'
  nodefs.mkdirSync(path.join(dir, '.dsh-repowiki', 'knowledge', 'zh'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, '.dsh-repowiki', 'knowledge', 'zh', 'src-a.md'), auto)

  // update 覆盖标题/正文/标签并置 manuallyEdited
  const updated = await tool.execute({
    action: 'update', locale: 'zh', path: 'src/a.ts',
    title: '新标题', tags: ['新'],
    body: '# 新标题\n\n新正文（人工修订）\n',
  }, fakeExec)
  assert.equal(updated.slug, "src-a")
  const updatedText = nodefs.readFileSync(path.join(dir, '.dsh-repowiki', 'knowledge', 'zh', 'src-a.md'), 'utf8')
  assert.match(updatedText, /"manuallyEdited": true/)
  assert.match(updatedText, /"title": "新标题"/)
  assert.match(updatedText, /"path": "src\/a.ts"/, 'frontmatter path 字段保留')
  assert.match(updatedText, /新正文（人工修订）/)

  // update 未给 body 时保留原正文
  await tool.execute({ action: 'update', locale: 'zh', path: 'src/a.ts', tags: ['保留'] }, fakeExec)
  const kept = nodefs.readFileSync(path.join(dir, '.dsh-repowiki', 'knowledge', 'zh', 'src-a.md'), 'utf8')
  assert.match(kept, /新正文（人工修订）/, '未提供 body 时保留原正文')
  assert.match(kept, /"保留"/)
})

test('repowiki-cards execute：includeMemory 附已采信记忆并按 query 过滤', async () => {
  const savedLang = process.env.LANG
  process.env.LANG = 'en'
  try {
    const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-cards-mem-'))
    nodefs.writeFileSync(path.join(dir, 'app.ts'), 'export function main() {}\n')
    const ctx = makeCtx(dir)
    await repowikiIndexTool(ctx).execute({}, fakeExec)
    // 两条 accepted（一条带关联路径）、一条 pending（不应返回）
    await writeMemory(ctx.fs, dir, { slug: 'use-digest', locale: 'en', title: 'Use digest not mtime', body: 'Digest drives incremental reindex.', tags: ['decision'], status: 'accepted', path: 'src/indexer.js' })
    await writeMemory(ctx.fs, dir, { slug: 'fail-fast', locale: 'en', title: 'Fail fast', body: 'Return early.', status: 'accepted' })
    await writeMemory(ctx.fs, dir, { slug: 'pending-one', locale: 'en', title: 'Pending draft', body: 'Not reviewed.', status: 'pending' })

    const cardsTool = repowikiCardsTool(ctx)
    // 默认不带 memories
    const plain = await cardsTool.execute({ query: 'main' }, fakeExec)
    assert.equal(plain.memories, undefined, '默认 includeMemory 关闭')

    // includeMemory + 空 query：两条 accepted
    const all = await cardsTool.execute({ includeMemory: true }, fakeExec)
    assert.equal(all.memories.length, 2)
    assert.ok(all.memories.some(m => m.slug === 'use-digest'))
    assert.ok(!all.memories.some(m => m.slug === 'pending-one'), 'pending 记忆不返回')

    // query 过滤：digest 命中 use-digest
    const filtered = await cardsTool.execute({ query: 'digest', includeMemory: true }, fakeExec)
    assert.equal(filtered.memories.length, 1)
    assert.equal(filtered.memories[0].slug, 'use-digest')
    assert.equal(filtered.memories[0].path, 'src/indexer.js')
    assert.match(filtered.memories[0].summary, /Digest drives/)

    const rendered = cardsTool.output.render({}, filtered)
    assert.match(rendered[0].text, /Memory: Use digest not mtime/)
  } finally {
    process.env.LANG = savedLang
  }
})

test('repowiki-index execute：取消时不覆盖旧索引', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-tool-'))
  nodefs.writeFileSync(path.join(dir, 'app.ts'), 'export function main() {}\n')
  const ctx = makeCtx(dir)
  const tool = repowikiIndexTool(ctx)
  await tool.execute({}, fakeExec)
  const indexPath = path.join(dir, '.dsh-repowiki', 'index.json')
  const before = nodefs.readFileSync(indexPath, 'utf8')

  const ac = new AbortController()
  ac.abort()
  const out = await tool.execute({}, { signal: ac.signal, agent: undefined })
  assert.equal(out.aborted, true)
  assert.equal(out.indexPath, '', '取消时不返回写盘路径')
  assert.match(out.hint, /untouched/)
  assert.equal(nodefs.readFileSync(indexPath, 'utf8'), before, '旧索引保持不变')
})

test('repowiki-cards execute：target=docs/all 走 BM25 正文检索', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-search-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function buildIndex() {}\n')
  const ctx = makeCtx(dir)
  await repowikiIndexTool(ctx).execute({}, fakeExec)
  await repowikiEditTool(ctx).execute({
    action: 'create', path: 'a.ts', title: '索引编排', body: '索引器遍历仓库并提取符号。', locale: 'zh',
  }, fakeExec)
  await repowikiMemoryTool(ctx).execute({
    action: 'write', title: '检索约定', body: '知识库检索使用 BM25 排序。', status: 'accepted', locale: 'zh',
  }, fakeExec)

  const cards = repowikiCardsTool(ctx)
  const docs = await cards.execute({ query: '索引', target: 'docs' }, fakeExec)
  assert.equal(docs.target, 'docs')
  assert.deepEqual(docs.matches, [], 'docs 模式不返回符号匹配')
  assert.ok(docs.knowledge.some(k => k.type === 'card' && k.title === '索引编排'))
  assert.ok(docs.knowledgeTotal >= 1)

  const all = await cards.execute({ query: 'BM25', target: 'all' }, fakeExec)
  assert.ok(all.knowledge.some(k => k.type === 'memory' && k.title === '检索约定'))

  const noQuery = await cards.execute({ target: 'docs' }, fakeExec)
  assert.deepEqual(noQuery.knowledge, [])
  assert.match(noQuery.hint, /query is required/)
})
