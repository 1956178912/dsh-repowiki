/**
 * 资产层单元测试：定位、读写、检索（fake fs + 临时目录）。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import {
  resolveAssetRoot, readIndex, writeIndex, searchIndex,
} from '../src/assets.js'
import { INDEX_SCHEMA_VERSION } from '../src/schema.js'

/**
 * 创建临时项目目录 fixture。
 * @param {(dir:string)=>void} seed - 向目录写入 fixture 的回调。
 * @returns {string} 临时目录绝对路径。
 */
function makeProject(seed) {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-'))
  seed(dir)
  return dir
}

test('resolveAssetRoot：未建资产时以当前目录为根并标记 created', async () => {
  const dir = makeProject(() => {})
  const fs = makeFakeFs(dir)
  const got = await resolveAssetRoot(fs, dir)
  assert.equal(got.root, dir)
  assert.equal(got.created, true)
  assert.equal(path.basename(got.assetDir), '.dsh-repowiki')
})

test('resolveAssetRoot：子目录向上找到既有 .dsh-repowiki', async () => {
  const dir = makeProject(d => {
    nodefs.mkdirSync(path.join(d, '.dsh-repowiki'))
    nodefs.mkdirSync(path.join(d, 'packages', 'sub'), { recursive: true })
  })
  const fs = makeFakeFs(dir)
  const got = await resolveAssetRoot(fs, path.join(dir, 'packages', 'sub'))
  assert.equal(got.root, dir)
  assert.equal(got.created, false)
})

test('writeIndex/readIndex：往返一致且版本校验生效', async () => {
  const dir = makeProject(() => {})
  const fs = makeFakeFs(dir)
  const doc = { schemaVersion: INDEX_SCHEMA_VERSION, files: [{ path: 'a.ts', symbols: [] }], edges: [] }
  const written = await writeIndex(fs, dir, doc)
  assert.ok(nodefs.existsSync(written), '文件落盘')

  const back = await readIndex(fs, dir)
  assert.equal(back.schemaVersion, INDEX_SCHEMA_VERSION)
  assert.equal(back.files[0].path, 'a.ts')

  // 版本不兼容：旧版索引被当作不可用
  nodefs.writeFileSync(written, JSON.stringify({ schemaVersion: 0 }))
  assert.equal(await readIndex(fs, dir), null)
  // 索引不存在
  const dir2 = makeProject(() => {})
  const fs2 = makeFakeFs(dir2)
  assert.equal(await readIndex(fs2, dir2), null)
})

test('readIndex：越界/绝对路径文件被丢弃，悬空边清理并计数', async () => {
  const dir = makeProject(() => {})
  const fs = makeFakeFs(dir)
  await writeIndex(fs, dir, {
    schemaVersion: INDEX_SCHEMA_VERSION,
    files: [
      { path: 'src/safe.ts', lang: 'typescript', symbols: [] },
      { path: '../outside.ts', lang: 'typescript', symbols: [] },
      { path: '/etc/passwd', lang: 'text', symbols: [] },
      { path: './src//nested.ts', lang: 'typescript', symbols: [] },
    ],
    edges: [
      { from: 'src/safe.ts', to: 'src/nested.ts', kind: 'import', line: 1, symbols: [] },
      { from: 'src/safe.ts', to: '/etc/passwd', kind: 'import', line: 2, symbols: [] },
    ],
    stats: { files: 4, symbols: 0, edges: 2 },
  })
  const doc = await readIndex(fs, dir)
  assert.deepEqual(doc.files.map(f => f.path), ['src/safe.ts', 'src/nested.ts'], '只保留仓库内相对路径并归一')
  assert.deepEqual(doc.edges.map(e => [e.from, e.to]), [['src/safe.ts', 'src/nested.ts']], '指向被丢弃文件的边一并清理')
  assert.equal(doc.untrusted.files, 2)
  assert.equal(doc.untrusted.edges, 1)
  assert.deepEqual(doc.untrusted.paths, ['../outside.ts', '/etc/passwd'])
})

test('readIndex：正常索引不产生 untrusted 字段', async () => {
  const dir = makeProject(() => {})
  const fs = makeFakeFs(dir)
  await writeIndex(fs, dir, {
    schemaVersion: INDEX_SCHEMA_VERSION,
    files: [{ path: 'src/a.ts', lang: 'typescript', symbols: [] }],
    edges: [],
  })
  const doc = await readIndex(fs, dir)
  assert.equal(doc.untrusted, undefined)
})

test('searchIndex：query/kind/path 过滤与 limit 截断', () => {
  const index = {
    files: [
      { path: 'src/a.ts', lang: 'typescript', symbols: [
        { name: 'parseInput', kind: 'function', line: 1, endLine: 3, exported: true },
        { name: 'Parser', kind: 'class', line: 5, endLine: 9, exported: false },
      ] },
      { path: 'src/b.ts', lang: 'typescript', symbols: [
        { name: 'parseOutput', kind: 'function', line: 1, endLine: 2, exported: false },
      ] },
      { path: 'docs/c.md', lang: 'markdown', symbols: [] },
    ],
  }
  const byQuery = searchIndex(index, { query: 'parse' })
  assert.equal(byQuery.total, 2, '两个文件含 parse 符号')

  const byKind = searchIndex(index, { kind: 'class' })
  assert.equal(byKind.total, 1)
  assert.equal(byKind.matches[0].symbols[0].name, 'Parser')

  const byPath = searchIndex(index, { pathPrefix: 'src/' })
  assert.equal(byPath.total, 2)

  const capped = searchIndex(index, { limit: 1 })
  assert.equal(capped.matches.length, 1)
  assert.equal(capped.total, 3, '全集计数不被 limit 影响')
  assert.equal(capped.truncated, true)

  const exact = searchIndex(index, { limit: 5 })
  assert.equal(exact.truncated, false)

  const secondPage = searchIndex(index, { limit: 1, offset: 1 })
  assert.equal(secondPage.matches.length, 1)
  assert.equal(secondPage.total, 3, 'offset 不改变全集计数')
  assert.equal(secondPage.truncated, true, '仍有下一页')
  const lastPage = searchIndex(index, { limit: 1, offset: 2 })
  assert.equal(lastPage.matches.length, 1)
  assert.equal(lastPage.truncated, false, '最后一页不再标记截断')
})

test('searchIndex：查询按精确>前缀>子串排序，导出符号优先', () => {
  const index = { files: [
    { path: 'b.ts', lang: 'typescript', symbols: [
      { name: 'parseInput', kind: 'function', line: 9, endLine: 9, exported: true },
      { name: 'Parser', kind: 'class', line: 1, endLine: 3, exported: false },
    ] },
    { path: 'a.ts', lang: 'typescript', symbols: [
      { name: 'parse', kind: 'function', line: 5, endLine: 5, exported: false },
      { name: 'PreParse', kind: 'function', line: 2, endLine: 2, exported: true },
    ] },
  ] }
  const res = searchIndex(index, { query: 'parse' })
  // a.ts 的最佳命中是精确 parse（3），b.ts 是前缀（2）
  assert.deepEqual(res.matches.map(m => m.path), ['a.ts', 'b.ts'])
  assert.deepEqual(res.matches[0].symbols.map(s => s.name), ['parse', 'PreParse'], '精确优先于前缀')
  assert.deepEqual(res.matches[1].symbols.map(s => s.name), ['parseInput', 'Parser'], '同强度内导出符号优先')
})

test('searchIndex：lang 与 exportedOnly 过滤', () => {
  const index = { files: [
    { path: 'a.py', lang: 'python', symbols: [
      { name: 'run', kind: 'function', line: 1, endLine: 1, exported: false },
      { name: 'Public', kind: 'class', line: 3, endLine: 3, exported: true },
    ] },
    { path: 'b.ts', lang: 'typescript', symbols: [
      { name: 'runAll', kind: 'function', line: 1, endLine: 1, exported: true },
    ] },
  ] }
  const py = searchIndex(index, { lang: 'python' })
  assert.deepEqual(py.matches.map(m => m.path), ['a.py'])
  assert.equal(py.matches[0].symbols.length, 2, '无 query 时列出该语言全部符号')

  const exported = searchIndex(index, { lang: 'python', exportedOnly: true })
  assert.deepEqual(exported.matches[0].symbols.map(s => s.name), ['Public'])
  const none = searchIndex(index, { lang: 'python', exportedOnly: true, kind: 'function' })
  assert.equal(none.total, 0, '过滤后无符号的文件不返回')
})

test('searchIndex：大小写不敏感与无过滤条件返回全部', () => {
  const index = { files: [{ path: 'a.ts', lang: 'typescript', symbols: [
    { name: 'Foo', kind: 'class', line: 1, endLine: 1, exported: true }] }] }
  assert.equal(searchIndex(index, { query: 'foo' }).total, 1)
  assert.equal(searchIndex(index, {}).total, 1)
})

test('readIndex：v2 索引在内存补齐模块树（兼容升级路径）', async () => {
  const dir = makeProject(d => {
    nodefs.mkdirSync(path.join(d, '.dsh-repowiki'), { recursive: true })
    nodefs.writeFileSync(path.join(d, '.dsh-repowiki', 'index.json'), JSON.stringify({
      schemaVersion: 2,
      stats: { files: 1, symbols: 0 },
      files: [{ path: 'src/a.ts', lang: 'typescript', symbols: [] }],
      edges: [],
    }))
  })
  const doc = await readIndex(makeFakeFs(dir), dir)
  assert.equal(doc.schemaVersion, 2, '保持原版本号，磁盘内容不变')
  assert.equal(doc.files[0].module, 'src', '文件补 module')
  assert.ok(doc.modules.some(m => m.path === 'src'), '补 modules')
  assert.equal(doc.stats.modules, doc.modules.length)
})

test('readIndex：v3 缺 modules 时按 files 派生；未知版本仍拒绝', async () => {
  const dir = makeProject(d => {
    nodefs.mkdirSync(path.join(d, '.dsh-repowiki'), { recursive: true })
    nodefs.writeFileSync(path.join(d, '.dsh-repowiki', 'index.json'), JSON.stringify({
      schemaVersion: 3,
      stats: { files: 1 },
      files: [{ path: 'README.md', module: '.', symbols: [] }],
    }))
  })
  const doc = await readIndex(makeFakeFs(dir), dir)
  assert.ok(Array.isArray(doc.modules))
  assert.equal(doc.modules[0].path, '.')
})
