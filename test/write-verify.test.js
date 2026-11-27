/**
 * 写入回读校验（writeTextVerified）回归：截断/不可读写入不得静默成功。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { writeTextVerified } from '../src/util.js'
import { writeIndex } from '../src/assets.js'
import { writeMemory } from '../src/memory.js'

/**
 * 构造“写入会截断”的 fake fs（模拟后端异常/半截写）。
 * @param {string} dir - 介质根。
 * @returns {object} fs。
 */
function makeTruncatingFs(dir) {
  const fs = makeFakeFs(dir)
  const write = fs.writeText.bind(fs)
  fs.writeText = async (target, content) => write(target, content.slice(0, Math.max(0, content.length - 2)))
  return fs
}

test('writeTextVerified：正常写入通过并返回目标', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-wv-'))
  const fs = makeFakeFs(dir)
  const target = await fs.resolve('a.txt', { cwd: dir })
  const out = await writeTextVerified(fs, target, 'hello\n')
  assert.equal(out, target)
  assert.equal(nodefs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'hello\n')
})

test('writeTextVerified：内容截断时抛错并指名路径', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-wv-'))
  const fs = makeTruncatingFs(dir)
  const target = await fs.resolve('a.txt', { cwd: dir })
  await assert.rejects(() => writeTextVerified(fs, target, 'hello\n'), /write verification failed: .*a\.txt/)
})

test('writeIndex：后端截断时拒绝静默成功', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-wv-'))
  const fs = makeTruncatingFs(dir)
  await assert.rejects(
    () => writeIndex(fs, dir, { schemaVersion: 3, files: [] }),
    /write verification failed/,
  )
})

test('writeMemory：回读不可读时报错（不吞错）', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-wv-'))
  const fs = makeFakeFs(dir)
  await writeMemory(fs, dir, {
    slug: 'convention', locale: 'zh', title: 'Convention', body: 'Body', status: 'pending',
  })
  fs.readText = async () => { throw new Error('EIO') }
  await assert.rejects(
    () => writeMemory(fs, dir, {
      slug: 'convention', locale: 'zh', title: 'Convention', body: 'Body 2', status: 'pending',
    }),
    /write verification failed: .*convention\.md/,
  )
})
