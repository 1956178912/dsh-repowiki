/**
 * 资产传输层单元测试：copyTree 递归复制与 dirHasContent 判定。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { copyTree, dirHasContent } from '../src/transfer.js'

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
