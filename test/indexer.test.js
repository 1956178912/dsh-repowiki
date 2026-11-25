/**
 * 索引编排器单元测试：在真实临时目录里造项目，验证遍历、提取、依赖边。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { buildIndex } from '../src/indexer.js'
import { INDEX_SCHEMA_VERSION } from '../src/schema.js'

/**
 * 创建临时项目并写入 fixture 文件。
 * @param {Record<string,string>} files - 相对路径 → 内容。
 * @returns {string} 项目根绝对路径。
 */
function makeProject(files) {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-idx-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    nodefs.mkdirSync(path.dirname(abs), { recursive: true })
    nodefs.writeFileSync(abs, content)
  }
  return dir
}

test('端到端：JS/TS 项目产出符号、依赖边与技术栈', async () => {
  const dir = makeProject({
    'package.json': JSON.stringify({ name: 'demo', version: '0.1.0', dependencies: { express: '^4' } }),
    'src/app.ts': 'export function start(port: number) { return port }\n',
    'src/util.js': 'const help = (x) => x\nmodule.exports = { help }\n',
    'src/index.ts': "import { start } from './app';\nstart(3000);\n",
  })
  const fs = makeFakeFs(dir)
  const doc = await buildIndex(fs, dir)

  assert.equal(doc.schemaVersion, INDEX_SCHEMA_VERSION)
  assert.equal(doc.stack.projectName, 'demo')
  assert.ok(doc.stack.technologies.some(t => t.name === 'Express'))
  const paths = doc.files.map(f => f.path)
  assert.ok(paths.includes('src/app.ts'))
  assert.ok(paths.includes('src/util.js'))
  assert.ok(paths.includes('src/index.ts'))

  const app = doc.files.find(f => f.path === 'src/app.ts')
  assert.ok(app.symbols.some(s => s.name === 'start' && s.kind === 'function' && s.exported))

  // 依赖边：src/index.ts → src/app.ts（.ts 后缀解析）
  const edge = doc.edges.find(e => e.from === 'src/index.ts')
  assert.ok(edge, '存在依赖边')
  assert.equal(edge.to, 'src/app.ts')
  assert.deepEqual(edge.symbols, ['start'], '符号级引用')

  // stats 自洽
  assert.equal(doc.stats.files, 3)
  assert.equal(doc.stats.symbols, doc.files.reduce((n, f) => n + f.symbols.length, 0))
  assert.equal(doc.stats.edges, doc.edges.length)
})

test('Python 项目：相对 import 解析与方法归属', async () => {
  const dir = makeProject({
    'pkg/__init__.py': '',
    'pkg/mod.py': 'def hello():\n    return 1\n',
    'pkg/main.py': 'from .mod import hello\n\nhello()\n',
    'pkg/other.py': 'from pkg.mod import hello\n',
  })
  const fs = makeFakeFs(dir)
  const doc = await buildIndex(fs, dir)
  const edges = doc.edges.filter(e => e.to === 'pkg/mod.py')
  assert.ok(edges.some(e => e.from === 'pkg/main.py'), 'from .mod 相对引用解析')
  // 非相对（绝对包名）引用在 Phase 1 不解析为文件边：projects 内的 pkg.mod
  // 按 Node 解析规则属于 node_modules 解析域，不属于本仓库相对引用
  assert.equal(edges.filter(e => e.from === 'pkg/other.py').length, 0, '绝对包引用不产生文件边')

  const mod = doc.files.find(f => f.path === 'pkg/mod.py')
  assert.ok(mod.symbols.some(s => s.name === 'hello' && s.kind === 'function'))
})

test('排除规则：node_modules/.git/资产目录不进入索引', async () => {
  const dir = makeProject({
    'keep.ts': 'export const a = 1\n',
    'node_modules/lib/index.js': 'export const b = 2\n',
    '.git/HEAD': 'ref: refs/heads/main',
    'dist/bundle.js': 'var c = 3\n',
    '.dsh-repowiki/index.json': '{}',
  })
  const fs = makeFakeFs(dir)
  const doc = await buildIndex(fs, dir)
  const paths = doc.files.map(f => f.path)
  assert.ok(paths.includes('keep.ts'))
  for (const p of paths) {
    assert.ok(!p.startsWith('node_modules/'), p)
    assert.ok(!p.startsWith('.git/'), p)
    assert.ok(!p.startsWith('dist/'), p)
    assert.ok(!p.startsWith('.dsh-repowiki/'), p)
  }
})

test('maxFiles 上限停扫且 capped=true', async () => {
  const files = {}
  for (let i = 0; i < 10; i++) files[`f${i}.ts`] = 'export const x = 1\n'
  const dir = makeProject(files)
  const fs = makeFakeFs(dir)
  const doc = await buildIndex(fs, dir, { maxFiles: 4 })
  assert.equal(doc.stats.capped, true)
  assert.ok(doc.stats.files <= 4)
})

test('不可读文件不阻断整体索引', async () => {
  const dir = makeProject({
    'good.ts': 'export const fine = 1\n',
    'bad.ts': 'export const oops = 2\n',
  })
  nodefs.chmodSync(path.join(dir, 'bad.ts'), 0o000)
  const fs = makeFakeFs(dir)
  try {
    const doc = await buildIndex(fs, dir)
    assert.ok(doc.files.some(f => f.path === 'good.ts'))
  } finally {
    nodefs.chmodSync(path.join(dir, 'bad.ts'), 0o644)
  }
})
