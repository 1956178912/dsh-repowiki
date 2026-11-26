/**
 * 知识目录读写单元测试（fake fs + 真实文件系统介质）。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import {
  cardSlug, cardPath, wikiPath, wikiSlug, writeCard, writeWikiPage, parseCard, readExistingCards,
} from '../src/knowledge.js'

test('cardSlug：路径 slug 化', () => {
  assert.equal(cardSlug('src/indexer.js'), 'src-indexer')
  assert.equal(cardSlug('pkg/mod.py'), 'pkg-mod')
  assert.equal(cardSlug('a/b/c.tsx'), 'a-b-c')
  // 纯非 ASCII 名归一为空（调用方应据此跳过，见 tool-extract 的空 slug 守卫）
  assert.equal(cardSlug('深色/模块.js'), '')
})

test('cardPath / wikiPath：资产目录相对路径', () => {
  assert.equal(cardPath('src/indexer.js', 'zh'), '.dsh-repowiki/knowledge/zh/src-indexer.md')
  assert.equal(wikiPath('overview', 'en'), '.dsh-repowiki/wiki/en/overview.md')
})

test('writeCard + parseCard + readExistingCards：往返一致', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-knowledge-'))
  const fs = makeFakeFs(dir)
  const md = [
    '---',
    JSON.stringify({
      schemaVersion: 1, path: 'src/indexer.js', lang: 'javascript', locale: 'zh',
      title: '索引编排器', tags: ['indexing'], manuallyEdited: false, generatedAt: 'now',
    }, null, 2),
    '---',
    '# 索引编排器',
    '',
    '> src/indexer.js',
    '',
    '## 概要 / Summary',
    '',
    '遍历文件并组装索引。',
    '',
    '## 职责 / Purpose',
    '',
    '编排提取。',
    '',
    '## 关键符号 / Key symbols',
    '',
    '- `buildIndex` (function): 编排入口',
    '',
    '## 陷阱 / Pitfalls',
    '',
    '- (none)',
    '',
    '## 相关模块 / Related modules',
    '',
    '- (none)',
    '',
  ].join('\n')
  const written = await writeCard(fs, dir, 'src/indexer.js', 'zh', md)
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki/knowledge/zh/src-indexer.md')))

  const parsed = parseCard(nodefs.readFileSync(path.join(dir, '.dsh-repowiki/knowledge/zh/src-indexer.md'), 'utf8'))
  assert.equal(parsed.meta.path, 'src/indexer.js')
  assert.equal(parsed.meta.title, '索引编排器')
  assert.match(parsed.body, /# 索引编排器/)

  const cards = await readExistingCards(fs, dir, 'zh')
  assert.equal(cards.size, 1)
  assert.ok(cards.has('src/indexer.js'))
  assert.equal(cards.get('src/indexer.js').meta.title, '索引编排器')
})

test('writeWikiPage：落盘路径正确', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-wiki-'))
  const fs = makeFakeFs(dir)
  await writeWikiPage(fs, dir, 'core-modules', 'zh', '# 核心模块\n')
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki/wiki/zh/core-modules.md')))
})

test('wikiSlug：LLM 的 slug 净化后必落在 wiki/<locale>/ 内（路径穿越防线）', async () => {
  // F1 回归：generate 的 page.slug 来自 LLM 输出，直接 posix.join 可越出资产目录
  assert.equal(wikiSlug('../../../../tmp/evil'), 'tmp-evil')
  assert.equal(wikiSlug('a/../../index'), 'a-index')
  assert.equal(wikiSlug('OverView 页面!'), 'overview')
  assert.equal(wikiSlug(''), 'page')
  assert.equal(wikiSlug('..'), 'page')
  const rel = wikiPath('../../../../tmp/evil', 'zh')
  assert.ok(rel.startsWith('.dsh-repowiki/wiki/zh/'), `路径须留在 wiki 目录内：${rel}`)
  assert.ok(!rel.includes('..'), `净化后不得含 ..：${rel}`)
  // 真实写盘验证：fake fs 的 resolve 拒绝逃逸
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-wiki-'))
  const fs = makeFakeFs(dir)
  await writeWikiPage(fs, dir, '../../../../tmp/evil', 'zh', '# evil\n')
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki/wiki/zh/tmp-evil.md')))
})

test('parseCard：坏 frontmatter 与版本不符返回 null', () => {
  assert.equal(parseCard('no frontmatter'), null)
  assert.equal(parseCard('---\nnot json\n---\nbody'), null)
  assert.equal(parseCard('---\n{"schemaVersion": 0}\n---\nbody'), null)
})

test('writeCard：归一碰撞时不静默覆盖（O7——源路径哈希后缀）', async () => {
  // 'src/a b.js' 与 'src/a-b.js' 的 cardSlug 均为 'src-a-b'：第二张卡若
  // 直接写同一路径会覆盖第一张。writeCard 读目标文件 frontmatter，发现
  // meta.path 不同则改用源路径 8 位哈希后缀。
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-collision-'))
  const fs = makeFakeFs(dir)
  const card = (rel) => [
    '---',
    JSON.stringify({ schemaVersion: 1, path: rel, lang: 'javascript', locale: 'zh', title: 'T', tags: [], manuallyEdited: false, sourceDigest: 'd', generatedAt: '2026-11-27T00:00:00.000Z' }),
    '---',
    `# ${rel}`,
    '',
  ].join('\n')
  await writeCard(fs, dir, 'src/a b.js', 'zh', card('src/a b.js'))
  await writeCard(fs, dir, 'src/a-b.js', 'zh', card('src/a-b.js'))
  const knowledge = path.join(dir, '.dsh-repowiki/knowledge/zh')
  const names = nodefs.readdirSync(knowledge).sort()
  assert.equal(names.length, 2, '两张卡应各自落盘，而非互相覆盖')
  assert.ok(names.some(n => n.startsWith('src-a-b-') && n.endsWith('.md')), '碰撞卡应带哈希后缀')
  const second = nodefs.readFileSync(path.join(knowledge, names.find(n => n.includes('-'))), 'utf8')
  assert.ok(second.includes('src/a-b.js'), '带后缀的卡应以自己的源路径为键')
  // 再次写入同一源路径（增量刷新）：后缀稳定，不漂移
  await writeCard(fs, dir, 'src/a-b.js', 'zh', card('src/a-b.js'))
  const after = nodefs.readdirSync(knowledge).sort()
  assert.deepStrictEqual(after, names, '同源重写应落在同一文件（后缀稳定）')
})

test('readExistingCards：目录不存在返回空映射，坏卡不阻断枚举', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-knowledge-'))
  const fs = makeFakeFs(dir)
  assert.equal((await readExistingCards(fs, dir, 'zh')).size, 0)

  const cardDir = path.join(dir, '.dsh-repowiki/knowledge/zh')
  nodefs.mkdirSync(cardDir, { recursive: true })
  nodefs.writeFileSync(path.join(cardDir, 'broken.md'), '---\nnot json\n---\n')
  nodefs.writeFileSync(path.join(cardDir, 'good.md'), '---\n{"schemaVersion":1,"path":"a.ts","title":"A"}\n---\n# A\n')
  const cards = await readExistingCards(fs, dir, 'zh')
  assert.equal(cards.size, 1)
  assert.ok(cards.has('a.ts'))
})
