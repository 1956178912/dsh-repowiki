/**
 * .gitignore 子集匹配测试（ADR / README 文档化的能力边界）。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { parseIgnore, isIgnored } from '../src/ignore.js'
import { buildIndex } from '../src/indexer.js'

test('parseIgnore：注释/空行/否定/锚定/目录尾斜杠', () => {
  const rules = parseIgnore(`
# comment
dist/
!dist/keep.js
/build
*.log
docs/**/*.tmp
`)
  assert.deepEqual(rules, [
    { pattern: 'dist', negated: false, dirOnly: true, anchored: false },
    { pattern: 'dist/keep.js', negated: true, dirOnly: false, anchored: false },
    { pattern: 'build', negated: false, dirOnly: false, anchored: true },
    { pattern: '*.log', negated: false, dirOnly: false, anchored: false },
    { pattern: 'docs/**/*.tmp', negated: false, dirOnly: false, anchored: false },
  ])
})

test('isIgnored：目录剪枝、通配、锚定与 last-match-wins', () => {
  const rules = parseIgnore('dist/\n*.log\n!keep.log\n/build\ndocs/**/*.tmp\n')
  assert.equal(isIgnored('dist', true, rules), true)
  assert.equal(isIgnored('dist/a.js', false, rules), true, '目录规则覆盖子文件')
  assert.equal(isIgnored('src/dist-utils.js', false, rules), false, '不得误伤同前缀')
  assert.equal(isIgnored('a.log', false, rules), true)
  assert.equal(isIgnored('logs/keep.log', false, rules), false, '否定规则后置生效')
  assert.equal(isIgnored('build', true, rules), true)
  assert.equal(isIgnored('src/build', true, rules), false, '锚定规则只匹配根')
  assert.equal(isIgnored('docs/a/b.tmp', false, rules), true)
  assert.equal(isIgnored('docs/a/b.md', false, rules), false)
})

test('buildIndex：读取 .gitignore 并统计 ignored', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-ignore-'))
  nodefs.writeFileSync(path.join(dir, '.gitignore'), 'generated/\n*.skip.js\n')
  nodefs.mkdirSync(path.join(dir, 'generated'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'generated', 'a.ts'), 'export const a = 1\n')
  nodefs.writeFileSync(path.join(dir, 'keep.ts'), 'export const keep = 1\n')
  nodefs.writeFileSync(path.join(dir, 'drop.skip.js'), 'export const drop = 1\n')

  const doc = await buildIndex(makeFakeFs(dir), dir)
  assert.deepEqual(doc.files.map(f => f.path), ['keep.ts'])
  assert.ok(doc.stats.ignored >= 2, '目录与文件都应计数')
})
