/**
 * src/util.js 公共工具函数测试：cwdOf / toAbsPath / encodeFrontmatter / parseFrontmatter。
 *
 * 重点验证 DRY 抽取后行为与原内联实现完全一致（被 8 个工具文件与
 * render/knowledge/memory 三处序列化、两处解析依赖）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { cwdOf, toAbsPath, encodeFrontmatter, parseFrontmatter, countSourceLines } from '../src/util.js'

test('cwdOf：ctx.workingDirectory.get() 可用时返回其值', () => {
  const ctx = { workingDirectory: { get: () => '/some/session/cwd' } }
  assert.equal(cwdOf(ctx), '/some/session/cwd')
})

test('cwdOf：workingDirectory 缺失时降级 process.cwd', () => {
  assert.equal(cwdOf({}), process.cwd())
  assert.equal(cwdOf({ workingDirectory: null }), process.cwd())
})

test('cwdOf：workingDirectory.get 抛错时降级 process.cwd', () => {
  const ctx = { workingDirectory: { get: () => { throw new Error('nope') } } }
  assert.equal(cwdOf(ctx), process.cwd())
})

test('toAbsPath：相对路径相对 cwd 解析并归一 POSIX 分隔符', () => {
  assert.equal(toAbsPath('a/b.md', '/root'), '/root/a/b.md')
  assert.equal(toAbsPath('./a.md', '/root'), '/root/a.md')
})

test('toAbsPath：绝对路径原样保留（POSIX 归一）', () => {
  assert.equal(toAbsPath('/abs/x.md', '/root'), '/abs/x.md')
  assert.equal(toAbsPath('  /abs/x.md  ', '/root'), '/abs/x.md', '首尾空白裁剪')
})

test('encodeFrontmatter：JSON + --- 分隔（含首尾分隔符行）', () => {
  const out = encodeFrontmatter({ schemaVersion: 2, path: 'src/a.js' })
  assert.equal(out.startsWith('---\n'), true)
  assert.equal(out.endsWith('\n---\n'), true)
  assert.equal(out.includes('"schemaVersion": 2'), true)
  assert.equal(out.includes('"path": "src/a.js"'), true)
})

test('parseFrontmatter：与 encodeFrontmatter 互逆', () => {
  const meta = { schemaVersion: 3, title: 't', tags: ['x'] }
  const parsed = parseFrontmatter(encodeFrontmatter(meta) + '\n# t\n\nbody\n')
  assert.deepEqual(parsed.meta, meta)
  assert.equal(parsed.body, '\n# t\n\nbody\n')
})

test('parseFrontmatter：指定 schemaVersion 且不符返回 null', () => {
  const text = encodeFrontmatter({ schemaVersion: 1 })
  assert.equal(parseFrontmatter(text, 2), null)
  assert.equal(parseFrontmatter(text, 1).meta.schemaVersion, 1)
})

test('parseFrontmatter：无 frontmatter / 非 JSON / 标量 meta 返回 null', () => {
  assert.equal(parseFrontmatter('plain text'), null)
  assert.equal(parseFrontmatter('---\nnot json\n---\nbody'), null)
  assert.equal(parseFrontmatter('---\n"scalar"\n---\nbody'), null)
  assert.equal(parseFrontmatter('---\nnull\n---\nbody'), null)
})

test('countSourceLines：空文本/换行结尾/无结尾换行', () => {
  assert.equal(countSourceLines(''), 0)
  assert.equal(countSourceLines('a'), 1)
  assert.equal(countSourceLines('a\n'), 1)
  assert.equal(countSourceLines('a\nb'), 2)
  assert.equal(countSourceLines('a\nb\n'), 2)
  assert.equal(countSourceLines('\n'), 1)
  assert.equal(countSourceLines(null), 0)
})
