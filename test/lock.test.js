/**
 * 资产根锁（O5，ADR-0005）：原语语义与工具接线回归。
 *
 * 覆盖两类断言：
 * - 原语：同 key 按到达顺序串行、不同 key 互不阻塞、抛错不污染后续
 *   等待者、队列排空后清理条目；
 * - 接线：写工具（index/import/edit/memory）在锁被占用时不得产生任何
 *   写盘或复制，释放后才继续——防止未来重构把锁悄悄摘掉。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { withLock, withAssetRootLock, pendingLocks } from '../src/lock.js'
import { repowikiIndexTool } from '../src/tool-index.js'
import { repowikiImportTool } from '../src/tool-import.js'
import { repowikiEditTool } from '../src/tool-edit.js'
import { repowikiMemoryTool } from '../src/tool-memory.js'

/**
 * 等待若干毫秒，让排队的锁回调与文件 IO 完成一轮。
 * @param {number} [ms=0] - 毫秒。
 * @returns {Promise<void>} 定时器 Promise。
 */
function tick(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 工具 execute 所需的最小 exec。 */
const fakeExec = { signal: new AbortController().signal, agent: undefined }

/**
 * 建临时目录。
 * @param {string} [prefix] - 目录前缀。
 * @returns {string} 绝对路径。
 */
function makeDir(prefix = 'repowiki-lock-') {
  return nodefs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

/**
 * 最小插件 ctx。
 * @param {string} dir - 工作区根。
 * @returns {object} ctx。
 */
function makeCtx(dir) {
  return { fs: makeFakeFs(dir), workingDirectory: { get: () => dir } }
}

test('withLock：同 key 按到达顺序串行执行', async () => {
  const events = []
  let openGate
  const gate = new Promise((resolve) => { openGate = resolve })
  const first = withLock('fifo', async () => {
    events.push('first:start')
    await gate
    events.push('first:end')
  })
  const second = withLock('fifo', async () => {
    events.push('second:start')
  })
  await tick(10)
  assert.deepEqual(events, ['first:start'], '第二位必须等待第一位释放')
  openGate()
  await Promise.all([first, second])
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start'])
})

test('withLock：不同 key 互不阻塞', async () => {
  let openGate
  const gate = new Promise((resolve) => { openGate = resolve })
  const events = []
  const blocked = withLock('root-a', async () => {
    events.push('a:start')
    await gate
    events.push('a:end')
  })
  await tick(10)
  const independent = withLock('root-b', async () => {
    events.push('b:start')
    events.push('b:end')
  })
  await independent
  assert.deepEqual(events, ['a:start', 'b:start', 'b:end'], 'b 不必等待 a 释放')
  openGate()
  await blocked
})

test('withLock：抛错原样透传且不阻塞后续等待者，队列排空后清理条目', async () => {
  const boom = new Error('boom')
  const failing = withLock('fault', async () => { throw boom })
  const next = withLock('fault', async () => 'ok')
  await assert.rejects(failing, /boom/)
  assert.equal(await next, 'ok')
  await tick(10)
  assert.equal(pendingLocks(), 0, '队列排空后不应残留链尾')
})

test('withAssetRootLock：向上定位已存在资产根并传回定位结果', async () => {
  const dir = makeDir()
  const nested = path.join(dir, 'packages', 'app')
  nodefs.mkdirSync(path.join(dir, '.dsh-repowiki'), { recursive: true })
  nodefs.mkdirSync(nested, { recursive: true })
  const seen = await withAssetRootLock(makeFakeFs(dir), nested, (loc) => loc)
  assert.equal(seen.root, dir)
  assert.equal(seen.created, false)
  await tick(10)
  assert.equal(pendingLocks(), 0)
})

test('repowiki-index：资产根锁被占用时排队，释放后才写索引', async () => {
  const dir = makeDir()
  nodefs.writeFileSync(path.join(dir, 'app.ts'), 'export function main() {}\n')
  let openGate
  const gate = new Promise((resolve) => { openGate = resolve })
  const holder = withLock(dir, () => gate)
  const pending = repowikiIndexTool(makeCtx(dir)).execute({}, fakeExec)
  await tick(20)
  assert.equal(nodefs.existsSync(path.join(dir, '.dsh-repowiki', 'index.json')), false,
    '锁释放前不得写索引')
  openGate()
  await holder
  const value = await pending
  assert.equal(value.files, 1)
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki', 'index.json')))
})

test('repowiki-import：覆盖判定与复制在锁内执行', async () => {
  const dir = makeDir()
  const snapshot = makeDir('repowiki-lock-snapshot-')
  nodefs.writeFileSync(path.join(snapshot, 'index.json'), '{}\n')
  let openGate
  const gate = new Promise((resolve) => { openGate = resolve })
  const holder = withLock(dir, () => gate)
  const pending = repowikiImportTool(makeCtx(dir)).execute({ source: snapshot, overwrite: true }, fakeExec)
  await tick(20)
  assert.equal(nodefs.existsSync(path.join(dir, '.dsh-repowiki')), false,
    '锁释放前不得复制快照')
  openGate()
  await holder
  const value = await pending
  assert.equal(value.files, 1)
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki', 'index.json')))
})

test('repowiki-edit：create 在锁内写卡片', async () => {
  const dir = makeDir()
  let openGate
  const gate = new Promise((resolve) => { openGate = resolve })
  const holder = withLock(dir, () => gate)
  const pending = repowikiEditTool(makeCtx(dir)).execute({
    action: 'create', path: 'manual.md', title: 'Manual card', body: '# Manual card\n',
    locale: 'zh',
  }, fakeExec)
  await tick(20)
  assert.equal(nodefs.existsSync(path.join(dir, '.dsh-repowiki')), false,
    '锁释放前不得写卡片')
  openGate()
  await holder
  const value = await pending
  assert.ok(nodefs.existsSync(value.card), '卡片应写入返回的 displayPath')
})

test('repowiki-memory：write 与 accept 的读-改-写均在锁内执行', async () => {
  const dir = makeDir()
  const tool = repowikiMemoryTool(makeCtx(dir))

  let openWrite
  const writeGate = new Promise((resolve) => { openWrite = resolve })
  const writeHolder = withLock(dir, () => writeGate)
  const writing = tool.execute({
    action: 'write', title: 'Concurrency convention', body: 'One writer at a time.',
    locale: 'zh',
  }, fakeExec)
  await tick(20)
  assert.equal(nodefs.existsSync(path.join(dir, '.dsh-repowiki', 'memory', 'zh')), false,
    '锁释放前不得写记忆条目')
  openWrite()
  await writeHolder
  const written = await writing
  const entryPath = path.join(dir, written.path)
  assert.match(nodefs.readFileSync(entryPath, 'utf8'), /"status": "pending"/)

  let openAccept
  const acceptGate = new Promise((resolve) => { openAccept = resolve })
  const acceptHolder = withLock(dir, () => acceptGate)
  const accepting = tool.execute({ action: 'accept', slug: written.slug, locale: 'zh' }, fakeExec)
  await tick(20)
  assert.match(nodefs.readFileSync(entryPath, 'utf8'), /"status": "pending"/,
    '锁释放前不得改写条目状态')
  openAccept()
  await acceptHolder
  const accepted = await accepting
  assert.equal(accepted.status, 'accepted')
  assert.match(nodefs.readFileSync(entryPath, 'utf8'), /"status": "accepted"/)
})
