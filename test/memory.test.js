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

  const result = await setMemoryStatus(fs, dir, 'zh', 's1', 'accepted')
  assert.equal(result.rel, '.dsh-repowiki/memory/zh/s1.md')
  assert.ok(result.reviewedAt, '应记录审核时间')
  const accepted = await listMemory(fs, dir, 'zh', 'accepted')
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].reviewedAt, result.reviewedAt, 'listMemory 透出 reviewedAt')
  assert.equal((await listMemory(fs, dir, 'zh', 'pending')).length, 0)
  // 状态写回后正文保留
  const text = nodefs.readFileSync(path.join(dir, '.dsh-repowiki', 'memory', 'zh', 's1.md'), 'utf8')
  assert.match(text, /"status": "accepted"/)
  assert.match(text, /"reviewedAt": /)
  assert.match(text, /\n# S1\n\nb/)

  const missing = await setMemoryStatus(fs, dir, 'zh', 'nope', 'rejected')
  assert.equal(missing, null, '不存在条目返回 null')
})

test('listMemory：withBody 返回正文（去标题行）', async () => {
  const dir = makeDir()
  const fs = makeFakeFs(dir)
  await writeMemory(fs, dir, { slug: 'm1', locale: 'zh', title: 'M1', body: '正文首行。\n\n第二段。', status: 'accepted' })

  const plain = await listMemory(fs, dir, 'zh', 'accepted')
  assert.equal(plain[0].body, undefined, '默认不返回正文')

  const withBody = await listMemory(fs, dir, 'zh', 'accepted', true)
  assert.equal(withBody[0].body, '正文首行。\n\n第二段。', '去标题行后的完整正文')
})

test('listMemory：目录形态非法与坏条目不阻断枚举', async () => {
  const dir = makeDir()
  const fs = makeFakeFs(dir)
  // 记忆语言目录被同名文件占用：stat 类型不是 directory，安静降级为空
  nodefs.mkdirSync(path.join(dir, '.dsh-repowiki/memory'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, '.dsh-repowiki/memory/zh'), 'not a directory')
  assert.deepEqual(await listMemory(fs, dir, 'zh'), [])

  nodefs.rmSync(path.join(dir, '.dsh-repowiki/memory/zh'))
  nodefs.mkdirSync(path.join(dir, '.dsh-repowiki/memory/zh'), { recursive: true })
  await writeMemory(fs, dir, { slug: 'good', locale: 'zh', title: 'Good', body: 'ok', status: 'pending' })
  try {
    nodefs.symlinkSync(path.join(dir, 'nowhere.md'), path.join(dir, '.dsh-repowiki/memory/zh/bad.md'))
  } catch {
    return // 平台不支持符号链接（如部分 Windows 环境）：跳过坏条目断言
  }
  const entries = await listMemory(fs, dir, 'zh')
  assert.deepEqual(entries.map(e => e.slug), ['good'], '不可读条目被跳过')
})

test('memoryPath：路径形态', () => {
  assert.equal(memoryPath('foo-bar', 'zh'), '.dsh-repowiki/memory/zh/foo-bar.md')
  assert.equal(memoryPath('foo-bar', 'en'), '.dsh-repowiki/memory/en/foo-bar.md')
})

test('writeMemory：同名 slug 不同标题使用哈希后缀共存', async () => {
  const dir = makeDir()
  const fs = makeFakeFs(dir)
  const first = await writeMemory(fs, dir, { slug: 'dup', locale: 'zh', title: 'One', body: 'a', status: 'pending' })
  const second = await writeMemory(fs, dir, { slug: 'dup', locale: 'zh', title: 'Two', body: 'b', status: 'pending' })
  assert.notEqual(first, second, '不同标题不得互相覆盖')
  assert.match(second, /^\.dsh-repowiki\/memory\/zh\/dup-[0-9a-f]{8}\.md$/)
  const all = await listMemory(fs, dir, 'zh')
  assert.deepEqual(all.map(e => e.title).sort(), ['One', 'Two'])
})

test('writeMemory：同标题视为同一条目更新（覆盖而非后缀）', async () => {
  const dir = makeDir()
  const fs = makeFakeFs(dir)
  const first = await writeMemory(fs, dir, { slug: 'same', locale: 'zh', title: 'Same', body: 'old', status: 'pending' })
  const second = await writeMemory(fs, dir, { slug: 'same', locale: 'zh', title: 'Same', body: 'new', status: 'accepted' })
  assert.equal(first, second)
  const all = await listMemory(fs, dir, 'zh')
  assert.equal(all.length, 1)
  assert.equal(all[0].status, 'accepted')
})
