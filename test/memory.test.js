/**
 * 记忆条目存储层单元测试：slug 化、写读、状态流转。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import {
  slugifyMemory, memoryPath, writeMemory, listMemory, setMemoryStatus,
} from '../src/memory.js'

/** 造一个临时项目目录。 */
function makeDir() {
  return nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-mem-'))
}

test('slugifyMemory：英文标题 slug 化，纯非 ASCII 归一为空', () => {
  assert.equal(slugifyMemory('Prefer Fail-Fast'), 'prefer-fail-fast')
  assert.equal(slugifyMemory('  tags,   &   dots! '), 'tags-dots')
  assert.equal(slugifyMemory('a'.repeat(60)).length, 48, '超长标题截断')
  assert.equal(slugifyMemory('纯中文标题'), '', '纯非 ASCII 归一为空')
})

test('writeMemory/listMemory：写入与按状态枚举', async () => {
  const dir = makeDir()
  const fs = makeFakeFs(dir)
  await writeMemory(fs, dir, { slug: 'prefer-fail-fast', locale: 'zh', title: 'Prefer Fail-Fast', body: '早返回。', tags: ['convention'], status: 'pending' })
  await writeMemory(fs, dir, { slug: 'use-digest', locale: 'zh', title: 'Use Digest', body: '内容指纹判变化。', status: 'accepted' })

  // 空状态前缀目录（不存在）降级为空数组
  const dirEmpty = makeDir()
  const fsEmpty = makeFakeFs(dirEmpty)
  assert.deepEqual(await listMemory(fsEmpty, dirEmpty, 'zh'), [])

  const all = await listMemory(fs, dir, 'zh')
  assert.equal(all.length, 2, '列出全部')
  const titles = all.map(e => e.slug).sort()
  assert.deepEqual(titles, ['prefer-fail-fast', 'use-digest'])

  const pending = await listMemory(fs, dir, 'zh', 'pending')
  assert.equal(pending.length, 1)
  assert.equal(pending[0].slug, 'prefer-fail-fast')
  assert.deepEqual(pending[0].tags, ['convention'])

  const accepted = await listMemory(fs, dir, 'zh', 'accepted')
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].slug, 'use-digest')

  // 文件内容形态：JSON frontmatter（schemaVersion + kind + status）
  const text = nodefs.readFileSync(path.join(dir, '.dsh-repowiki', 'memory', 'zh', 'prefer-fail-fast.md'), 'utf8')
  assert.match(text, /^---\n/)
  assert.match(text, /"kind": "memory"/)
  assert.match(text, /"status": "pending"/)
  assert.match(text, /\n# Prefer Fail-Fast\n\n早返回。/)
})

test('setMemoryStatus：审核闭环与不存在条目', async () => {
  const dir = makeDir()
  const fs = makeFakeFs(dir)
  await writeMemory(fs, dir, { slug: 's1', locale: 'zh', title: 'S1', body: 'b', status: 'pending' })

  const rel = await setMemoryStatus(fs, dir, 'zh', 's1', 'accepted')
  assert.equal(rel, '.dsh-repowiki/memory/zh/s1.md')
  const accepted = await listMemory(fs, dir, 'zh', 'accepted')
  assert.equal(accepted.length, 1)
  assert.equal((await listMemory(fs, dir, 'zh', 'pending')).length, 0)
  // 状态写回后正文保留
  const text = nodefs.readFileSync(path.join(dir, '.dsh-repowiki', 'memory', 'zh', 's1.md'), 'utf8')
  assert.match(text, /"status": "accepted"/)
  assert.match(text, /\n# S1\n\nb/)

  const missing = await setMemoryStatus(fs, dir, 'zh', 'nope', 'rejected')
  assert.equal(missing, null, '不存在条目返回 null')
})

test('memoryPath：路径形态', () => {
  assert.equal(memoryPath('foo-bar', 'zh'), '.dsh-repowiki/memory/zh/foo-bar.md')
  assert.equal(memoryPath('foo-bar', 'en'), '.dsh-repowiki/memory/en/foo-bar.md')
})
