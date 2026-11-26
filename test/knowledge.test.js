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
  cardSlug, cardPath, wikiPath, writeCard, writeWikiPage, parseCard, readExistingCards,
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

test('parseCard：坏 frontmatter 与版本不符返回 null', () => {
  assert.equal(parseCard('no frontmatter'), null)
  assert.equal(parseCard('---\nnot json\n---\nbody'), null)
  assert.equal(parseCard('---\n{"schemaVersion": 0}\n---\nbody'), null)
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
