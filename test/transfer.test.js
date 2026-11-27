/**
 * 资产传输层单元测试：copyTree 递归复制与 dirHasContent 判定。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { copyTree, dirHasContent, readSnapshotManifest, verifySnapshot, writeSnapshotManifest } from '../src/transfer.js'
import { digestText } from '../src/util.js'

/** 造一个临时目录并写入给定文件。 */
function makeDir(files) {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-xfer-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    nodefs.mkdirSync(path.dirname(abs), { recursive: true })
    nodefs.writeFileSync(abs, content)
  }
  return dir
}

test('copyTree：递归复制文本资产并保持内容', async () => {
  const dir = makeDir({
    'src/index.json': '{"ok":true}',
    'src/knowledge/zh/a.md': '# A\n',
    'src/wiki/zh/sub/deep.md': '# Deep\n',
  })
  const fs = makeFakeFs(dir)
  const counts = await copyTree(fs, path.join(dir, 'src'), path.join(dir, 'dst'))

  assert.equal(counts.files, 3, '三个文本文件')
  assert.equal(counts.dirs, 5, 'knowledge/、knowledge/zh/、wiki/、wiki/zh/、wiki/zh/sub/ 五级目录')
  assert.equal(counts.skipped, 0)
  for (const rel of ['dst/index.json', 'dst/knowledge/zh/a.md', 'dst/wiki/zh/sub/deep.md']) {
    assert.ok(nodefs.existsSync(path.join(dir, rel)), `应复制 ${rel}`)
  }
  assert.equal(
    nodefs.readFileSync(path.join(dir, 'dst/knowledge/zh/a.md'), 'utf8'),
    '# A\n',
    '内容保持一致',
  )
})

test('copyTree：非文本资产文件计入 skipped 而非复制', async () => {
  const dir = makeDir({
    'src/a.md': 'a',
    'src/logo.png': 'fake-binary',
    'src/tmp.bak': 'bak',
  })
  const fs = makeFakeFs(dir)
  const counts = await copyTree(fs, path.join(dir, 'src'), path.join(dir, 'out'))
  assert.equal(counts.files, 1, '仅 .md 被复制')
  assert.equal(counts.skipped, 2, '.png/.bak 被跳过')
  assert.ok(!nodefs.existsSync(path.join(dir, 'out', 'logo.png')))
})

test('copyTree：不可读源目录计 skipped 不抛错', async () => {
  const dir = makeDir({ 'src/a.md': 'a' })
  const fs = makeFakeFs(dir)
  const counts = await copyTree(fs, path.join(dir, 'missing'), path.join(dir, 'out'))
  assert.equal(counts.files, 0)
  assert.ok(counts.skipped >= 1)
})

test('copyTree：失败明细有界上报（O2——不再只有匿名 skipped 计数）', async () => {
  const dir = makeDir({ 'src/a.md': 'a', 'src/b.md': 'b' })
  const fs = makeFakeFs(dir)
  // b.md 不可读（权限）→ 应进 failed 明细（path + reason），a.md 正常复制
  nodefs.chmodSync(path.join(dir, 'src', 'b.md'), 0o000)
  const counts = await copyTree(fs, path.join(dir, 'src'), path.join(dir, 'out'))
  assert.equal(counts.files, 1)
  assert.equal(counts.skipped, 1)
  assert.equal(counts.failed.length, 1, '失败明细应有 1 条')
  assert.match(counts.failed[0].path, /b\.md$/)
  assert.ok(counts.failed[0].reason.length > 0, '失败原因非空')
  nodefs.chmodSync(path.join(dir, 'src', 'b.md'), 0o644)
})

test('copyTree：目标写入被截断时计失败而非静默成功', async () => {
  const dir = makeDir({ 'src/a.md': '# A\n', 'src/b.md': '# B\n' })
  const base = makeFakeFs(dir)
  let writes = 0
  const truncating = {
    ...base,
    async writeText(target, text) {
      writes++
      // 第一个文件截断，第二个正常写入
      const value = writes === 1 ? text.slice(0, Math.max(0, text.length - 1)) : text
      return base.writeText(target, value)
    },
  }
  const counts = await copyTree(truncating, path.join(dir, 'src'), path.join(dir, 'dst'))
  assert.equal(counts.files, 1, '只有未截断的文件计入成功')
  assert.equal(counts.skipped, 1)
  assert.equal(counts.failed.length, 1)
  assert.match(counts.failed[0].reason, /verification failed/)
  assert.equal(counts.entries.length, 1, '失败文件不进入快照清单')
})

test('verifySnapshot：有界并发读取且可限制上限', async () => {
  const files = {}
  for (let i = 0; i < 12; i++) files[`src/f${i}.md`] = `# ${i}\n`
  const dir = makeDir(files)
  const base = makeFakeFs(dir)
  const copied = await copyTree(base, path.join(dir, 'src'), path.join(dir, 'snap'))
  await writeSnapshotManifest(base, path.join(dir, 'snap'), copied.entries)
  const manifest = (await readSnapshotManifest(base, path.join(dir, 'snap'))).value

  let active = 0
  let peak = 0
  const slow = {
    ...base,
    async readText(target) {
      active++
      peak = Math.max(peak, active)
      try {
        await new Promise(resolve => setTimeout(resolve, 5))
        return await base.readText(target)
      } finally {
        active--
      }
    },
  }
  const verified = await verifySnapshot(slow, path.join(dir, 'snap'), manifest)
  assert.equal(verified.verified, true)
  assert.equal(verified.checked, 12)
  assert.ok(peak > 1, '应并发读取')
  assert.ok(peak <= 8, '并发不超过 8')

  const capped = await verifySnapshot(base, path.join(dir, 'snap'), manifest, { limit: 2 })
  assert.equal(capped.capped, true)
  assert.equal(capped.checked, 2)
  assert.equal(capped.verified, false, '截断校验不能声称完整通过')
})

test('dirHasContent：存在且非空判定', async () => {
  const dir = makeDir({ 'full/a.md': 'a' })
  nodefs.mkdirSync(path.join(dir, 'empty'))
  const fs = makeFakeFs(dir)
  assert.equal(await dirHasContent(fs, path.join(dir, 'full')), true)
  assert.equal(await dirHasContent(fs, path.join(dir, 'empty')), false)
  assert.equal(await dirHasContent(fs, path.join(dir, 'nope')), false)
})

test('copyTree：预取消不复制任何文件并返回 aborted', async () => {
  const dir = makeDir({ 'src/a.md': '# A\n' })
  const ac = new AbortController()
  ac.abort()
  const counts = await copyTree(makeFakeFs(dir), path.join(dir, 'src'), path.join(dir, 'dst'), {
    signal: ac.signal,
  })
  assert.equal(counts.aborted, true)
  assert.equal(counts.files, 0)
  assert.equal(nodefs.existsSync(path.join(dir, 'dst')), false)
})

test('copyTree：返回复制文件的内容指纹并可排除清单文件', async () => {
  const dir = makeDir({
    'src/index.json': '{"ok":true}',
    'src/knowledge/zh/a.md': '# A\n',
    'src/_snapshot.json': '{"ignored":true}',
  })
  const counts = await copyTree(makeFakeFs(dir), path.join(dir, 'src'), path.join(dir, 'dst'), {
    exclude: new Set(['_snapshot.json']),
  })
  assert.equal(counts.files, 2)
  assert.deepEqual(counts.entries.map(e => e.path).sort(), ['index.json', 'knowledge/zh/a.md'])
  assert.ok(counts.entries.every(e => /^[0-9a-f]{16}$/.test(e.digest)))
  assert.ok(!nodefs.existsSync(path.join(dir, 'dst', '_snapshot.json')))
})

test('copyTree：only 集合只复制清单列出的文件，未列文件计数但不落盘', async () => {
  const dir = makeDir({
    'src/index.json': '{"ok":true}',
    'src/wiki/zh/a.md': '# A\n',
    'src/wiki/zh/injected.md': '# injected\n',
  })
  const counts = await copyTree(makeFakeFs(dir), path.join(dir, 'src'), path.join(dir, 'dst'), {
    only: new Set(['index.json', 'wiki/zh/a.md']),
  })
  assert.equal(counts.files, 2)
  assert.equal(counts.unlisted, 1)
  assert.deepEqual(counts.unlistedPaths, ['wiki/zh/injected.md'])
  assert.ok(nodefs.existsSync(path.join(dir, 'dst', 'wiki/zh/a.md')))
  assert.ok(!nodefs.existsSync(path.join(dir, 'dst', 'wiki/zh/injected.md')), '未列文件不得进入资产')
  assert.deepEqual(counts.entries.map(e => e.path).sort(), ['index.json', 'wiki/zh/a.md'])
})

test('copyTree：空 only 集合复制零文件（空清单快照不放行任何文件）', async () => {
  const dir = makeDir({ 'src/index.json': '{"ok":true}', 'src/a.md': 'a' })
  const counts = await copyTree(makeFakeFs(dir), path.join(dir, 'src'), path.join(dir, 'dst'), {
    only: new Set(),
  })
  assert.equal(counts.files, 0)
  assert.equal(counts.unlisted, 2)
  assert.equal(nodefs.existsSync(path.join(dir, 'dst')), false)
})

test('快照清单：写入后可验证，篡改/缺失文件被识别', async () => {
  const dir = makeDir({
    'snapshot/index.json': '{"ok":true}',
    'snapshot/wiki/zh/a.md': '# A\n',
  })
  const fs = makeFakeFs(dir)
  const source = path.join(dir, 'snapshot')
  const manifest = await writeSnapshotManifest(fs, source, [
    { path: 'index.json', digest: '0'.repeat(16) },
    { path: 'wiki/zh/a.md', digest: '1'.repeat(16) },
  ])
  assert.equal(manifest.count, 2)
  assert.equal(manifest.partial, false)

  const read = await readSnapshotManifest(fs, source)
  assert.equal(read.exists, true)
  assert.equal(read.value.count, 2)

  // 指纹不符 → mismatched；删除文件 → missing
  const verified = await verifySnapshot(fs, source, read.value)
  assert.equal(verified.verified, false)
  assert.equal(verified.mismatched, 2)
  assert.equal(verified.checked, 2)
  nodefs.rmSync(path.join(source, 'wiki/zh/a.md'))
  const missing = await verifySnapshot(fs, source, read.value)
  assert.equal(missing.missing, 1)
  assert.equal(missing.mismatched, 1)

  // 正确指纹 → verified
  const correct = await verifySnapshot(fs, source, {
    schemaVersion: 1,
    files: [
      { path: 'index.json', digest: '0'.repeat(16) },
    ],
  })
  assert.equal(correct.checked, 1)
  assert.equal(correct.mismatched, 1, '伪造指纹仍会被识别')
})

test('快照清单：未知 schema 与 count 不一致判为无效', async () => {
  const dir = makeDir({ 'snapshot/a.md': 'a' })
  const fs = makeFakeFs(dir)
  const source = path.join(dir, 'snapshot')
  const future = await verifySnapshot(fs, source, { schemaVersion: 2, files: [] })
  assert.equal(future.verified, false)
  assert.equal(future.invalid, 1, '未知 schema 不能按当前语义校验')
  assert.equal(future.checked, 0)

  const digest = digestText('a', 16)
  const listed = { schemaVersion: 1, files: [{ path: 'a.md', digest }] }
  assert.equal((await verifySnapshot(fs, source, listed)).verified, true, '缺省 count 的清单仍可验证')
  const badCount = await verifySnapshot(fs, source, { ...listed, count: 3 })
  assert.equal(badCount.verified, false)
  assert.equal(badCount.invalid, 1, 'count 与 files 长度不符判无效')
  assert.equal(badCount.checked, 1, '仍逐文件校验，便于定位问题')
})

test('readSnapshotManifest：超大/非对象清单在读取阶段拒绝', async () => {
  const dir = makeDir({
    'big/_snapshot.json': '{"files":[]}',
    'array/_snapshot.json': '[]',
  })
  const fs = makeFakeFs(dir)
  const big = await readSnapshotManifest(fs, path.join(dir, 'big'), { maxBytes: 4 })
  assert.equal(big.exists, true)
  assert.equal(big.value, null)
  assert.match(big.error, /exceeds/)

  const arr = await readSnapshotManifest(fs, path.join(dir, 'array'))
  assert.equal(arr.exists, true)
  assert.equal(arr.value, null)
  assert.match(arr.error, /not a JSON object/)
})

test('快照清单：缺失返回 exists=false，partial 清单校验失败', async () => {
  const dir = makeDir({ 'snapshot/a.md': 'a' })
  const fs = makeFakeFs(dir)
  const missing = await readSnapshotManifest(fs, path.join(dir, 'snapshot'))
  assert.equal(missing.exists, false)
  assert.equal(missing.error, '')

  const partial = await verifySnapshot(fs, path.join(dir, 'snapshot'), {
    schemaVersion: 1,
    partial: true,
    files: [],
  })
  assert.equal(partial.verified, false)
  assert.equal(partial.partial, true)
})
