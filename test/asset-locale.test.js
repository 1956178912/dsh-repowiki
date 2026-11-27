/**
 * 资产语言探测与选择：显式严格、默认回退到有内容的 locale。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { probeLocaleAssets, resolveContentLocale } from '../src/locale.js'

/** 建临时项目目录。 */
function tmpDir() {
  return nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-locale-'))
}

/** 在资产目录写一个 Markdown 文件。 */
function writeAsset(root, rel) {
  const abs = path.join(root, rel)
  nodefs.mkdirSync(path.dirname(abs), { recursive: true })
  nodefs.writeFileSync(abs, '# x\n')
}

test('locale：空资产默认保留首选语言且无可用语言', async () => {
  const dir = tmpDir()
  const fs = makeFakeFs(dir)
  const zh = await probeLocaleAssets(fs, dir, 'zh')
  const en = await probeLocaleAssets(fs, dir, 'en')
  assert.equal(zh.present, false)
  assert.equal(en.present, false)
  const picked = await resolveContentLocale(fs, dir, 'en')
  assert.equal(picked.locale, 'en')
  assert.equal(picked.source, 'default')
  assert.deepEqual(picked.available, [])
})

test('locale：首选语言有卡片时直接使用', async () => {
  const dir = tmpDir()
  writeAsset(dir, '.dsh-repowiki/knowledge/en/a.md')
  const picked = await resolveContentLocale(makeFakeFs(dir), dir, 'en')
  assert.equal(picked.locale, 'en')
  assert.equal(picked.source, 'preferred')
  assert.deepEqual(picked.available.map(item => item.locale), ['en'])
})

test('locale：首选为空、另一语言有卡片时回退并保留 requested', async () => {
  const dir = tmpDir()
  writeAsset(dir, '.dsh-repowiki/knowledge/zh/a.md')
  const fs = makeFakeFs(dir)
  const picked = await resolveContentLocale(fs, dir, 'en')
  assert.equal(picked.locale, 'zh')
  assert.equal(picked.requested, 'en')
  assert.equal(picked.source, 'fallback')
  assert.deepEqual(picked.available.map(item => item.locale), ['zh'])
})

test('locale：显式指定时不回退（用于对照诊断）', async () => {
  const dir = tmpDir()
  writeAsset(dir, '.dsh-repowiki/knowledge/zh/a.md')
  const picked = await resolveContentLocale(makeFakeFs(dir), dir, 'en', true)
  assert.equal(picked.locale, 'en')
  assert.equal(picked.source, 'explicit')
})

test('locale：Wiki 嵌套模块页与记忆也计为有资产', async () => {
  const dir = tmpDir()
  writeAsset(dir, '.dsh-repowiki/wiki/en/modules/src/a.md')
  writeAsset(dir, '.dsh-repowiki/memory/en/note.md')
  const fs = makeFakeFs(dir)
  const en = await probeLocaleAssets(fs, dir, 'en')
  assert.equal(en.cards, false)
  assert.equal(en.wiki, true)
  assert.equal(en.memory, true)
  assert.equal(en.present, true)
  const picked = await resolveContentLocale(fs, dir, 'en')
  assert.equal(picked.source, 'preferred')
})

test('locale：两种语言都有资产时首选优先', async () => {
  const dir = tmpDir()
  writeAsset(dir, '.dsh-repowiki/knowledge/zh/a.md')
  writeAsset(dir, '.dsh-repowiki/knowledge/en/b.md')
  const picked = await resolveContentLocale(makeFakeFs(dir), dir, 'en')
  assert.equal(picked.locale, 'en')
  assert.equal(picked.source, 'preferred')
  assert.deepEqual(picked.available.map(item => item.locale).sort(), ['en', 'zh'])
})

test('locale：非法首选归一为第一个受支持语言', async () => {
  const dir = tmpDir()
  writeAsset(dir, '.dsh-repowiki/knowledge/en/a.md')
  const picked = await resolveContentLocale(makeFakeFs(dir), dir, 'fr')
  assert.equal(picked.requested, 'zh')
  assert.equal(picked.locale, 'en')
  assert.equal(picked.source, 'fallback')
})
