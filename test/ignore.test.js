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
    { pattern: 'dist', negated: false, dirOnly: true, anchored: false, base: '' },
    { pattern: 'dist/keep.js', negated: true, dirOnly: false, anchored: false, base: '' },
    { pattern: 'build', negated: false, dirOnly: false, anchored: true, base: '' },
    { pattern: '*.log', negated: false, dirOnly: false, anchored: false, base: '' },
    { pattern: 'docs/**/*.tmp', negated: false, dirOnly: false, anchored: false, base: '' },
  ])
})

test('parseIgnore/isIgnored：嵌套规则只作用于所在目录子树', () => {
  const rules = [
    ...parseIgnore('*.log\n', ''),
    ...parseIgnore('/build\ngenerated/\n!keep.log\n', 'packages/app'),
  ]
  assert.equal(isIgnored('a.log', false, rules), true)
  assert.equal(isIgnored('packages/app/a.log', false, rules), true, '父规则仍覆盖子树')
  assert.equal(isIgnored('packages/app/build', true, rules), true, '嵌套锚定相对所在目录')
  assert.equal(isIgnored('build', true, rules), false, '嵌套锚定不作用于根')
  assert.equal(isIgnored('packages/app/generated/x.ts', false, rules), true, '嵌套目录规则覆盖子文件')
  assert.equal(isIgnored('packages/other/generated/x.ts', false, rules), false, '不越出规则目录')
  assert.equal(isIgnored('packages/app/keep.log', false, rules), false, '嵌套否定后置生效')
  assert.equal(isIgnored('packages/other/keep.log', false, rules), true, '否定只在嵌套目录内生效')
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

test('isIgnored：字符类与非法范围按字面降级', () => {
  const rules = parseIgnore('*.py[cod]\nfile[0-9].txt\ntmp[!x]/\nbad[z-a].log\nunclosed[abc\n')
  assert.equal(isIgnored('a.pyc', false, rules), true)
  assert.equal(isIgnored('a.pyo', false, rules), true)
  assert.equal(isIgnored('a.py', false, rules), false)
  assert.equal(isIgnored('file7.txt', false, rules), true)
  assert.equal(isIgnored('filex.txt', false, rules), false)
  assert.equal(isIgnored('tmp1/a.js', false, rules), true, '否定字符类目录规则')
  assert.equal(isIgnored('tmpx/a.js', false, rules), false)
  assert.equal(isIgnored('bad[z-a].log', false, rules), true, '非法范围按字面匹配')
  assert.equal(isIgnored('unclosed[abc', false, rules), true, '未闭合字符类按字面匹配')
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

test('buildIndex：嵌套 .gitignore 按目录作用域生效', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-ignore-nested-'))
  nodefs.mkdirSync(path.join(dir, 'packages/app'), { recursive: true })
  nodefs.mkdirSync(path.join(dir, 'packages/other'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, '.gitignore'), '*.skip.ts\n')
  nodefs.writeFileSync(path.join(dir, 'packages/app/.gitignore'), 'generated/\n!keep.skip.ts\n')
  nodefs.writeFileSync(path.join(dir, 'packages/app/drop.ts'), 'export const drop = 1\n')
  nodefs.writeFileSync(path.join(dir, 'packages/app/keep.skip.ts'), 'export const keep = 1\n')
  nodefs.writeFileSync(path.join(dir, 'packages/app/other.skip.ts'), 'export const skip = 1\n')
  nodefs.mkdirSync(path.join(dir, 'packages/app/generated'), { recursive: true })
  nodefs.writeFileSync(path.join(dir, 'packages/app/generated/a.ts'), 'export const a = 1\n')
  nodefs.writeFileSync(path.join(dir, 'packages/other/drop.ts'), 'export const drop = 1\n')

  const doc = await buildIndex(makeFakeFs(dir), dir)
  const paths = doc.files.map(f => f.path)
  assert.ok(paths.includes('packages/app/drop.ts'), '嵌套规则不影响未命中文件')
  assert.ok(paths.includes('packages/app/keep.skip.ts'), '嵌套否定可恢复父规则忽略的文件')
  assert.ok(!paths.includes('packages/app/other.skip.ts'), '父规则在子树内仍生效')
  assert.ok(!paths.includes('packages/app/generated/a.ts'), '嵌套目录规则生效')
  assert.ok(paths.includes('packages/other/drop.ts'), '嵌套规则不越出所在目录')
})
