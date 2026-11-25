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
  resolveAssetRoot, readIndex, writeIndex, searchIndex, listKnowledgeFiles,
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
})

test('searchIndex：大小写不敏感与无过滤条件返回全部', () => {
  const index = { files: [{ path: 'a.ts', lang: 'typescript', symbols: [
    { name: 'Foo', kind: 'class', line: 1, endLine: 1, exported: true }] }] }
  assert.equal(searchIndex(index, { query: 'foo' }).total, 1)
  assert.equal(searchIndex(index, {}).total, 1)
})

test('listKnowledgeFiles：目录不存在返回空数组，存在则列出 md', async () => {
  const dir = makeProject(d => {
    nodefs.mkdirSync(path.join(d, '.dsh-repowiki', 'knowledge', 'zh'), { recursive: true })
    nodefs.writeFileSync(path.join(d, '.dsh-repowiki', 'knowledge', 'zh', 'a.md'), '# A')
    nodefs.writeFileSync(path.join(d, '.dsh-repowiki', 'knowledge', 'zh', 'b.txt'), 'nope')
  })
  const fs = makeFakeFs(dir)
  const files = await listKnowledgeFiles(fs, dir, 'zh')
  assert.deepEqual(files, ['.dsh-repowiki/knowledge/zh/a.md'])

  const empty = makeProject(() => {})
  const fs2 = makeFakeFs(empty)
  assert.deepEqual(await listKnowledgeFiles(fs2, empty, 'zh'), [])
})
