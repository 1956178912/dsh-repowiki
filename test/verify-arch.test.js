/**
 * verify:arch 门禁：基线生成/比较、缺失与损坏基线、分层与重复块退化、CLI 契约。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { verifyArchitecture, parseArgs, formatReport } from '../scripts/verify-arch.mjs'
import { ARCH_BASELINE_SCHEMA_VERSION, ASSET_DIR, ARCH_BASELINE_FILE } from '../src/schema.js'

/** 脚本绝对路径（CLI 契约测试用）。 */
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'verify-arch.mjs')

/** 建临时项目根。 */
function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-arch-'))
}

/** 写 JSON 文件（自动建目录）。 */
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2))
}

/** 写文本文件（自动建目录）。 */
function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, value)
}

/** 写索引（files/edges 可直接给对象数组）。 */
function writeIndex(root, files, edges = []) {
  writeJson(path.join(root, ASSET_DIR, 'index.json'), { schemaVersion: 6, files, edges })
}

/** 基线文件路径。 */
function baselineFile(root) {
  return path.join(root, ASSET_DIR, ARCH_BASELINE_FILE)
}

/** 读基线 JSON。 */
function readBaseline(root) {
  return JSON.parse(fs.readFileSync(baselineFile(root), 'utf8'))
}

/** 两段互不相同的 10 行源码。 */
const TEXT_A = Array.from({ length: 10 }, (_, index) => `const a${index} = ${index}`).join('\n') + '\n'
const TEXT_B = Array.from({ length: 10 }, (_, index) => `const b${index} = ${index * 2}`).join('\n') + '\n'

test('verify-arch：--update 写入基线，随后检查通过', async () => {
  const root = makeRoot()
  writeText(path.join(root, 'a.js'), TEXT_A)
  writeText(path.join(root, 'b.js'), TEXT_B)
  writeIndex(root, [
    { path: 'a.js', lang: 'javascript', symbols: [] },
    { path: 'b.js', lang: 'javascript', symbols: [] },
  ], [{ from: 'a.js', to: 'b.js', line: 1 }])

  const update = await verifyArchitecture({ root, update: true })
  assert.equal(update.ok, true)
  assert.equal(update.exitCode, 0)
  assert.equal(update.updated, true)
  const written = readBaseline(root)
  assert.equal(written.schemaVersion, ARCH_BASELINE_SCHEMA_VERSION)
  assert.deepEqual(written.ceilings, { duplicateBlocks: 0, highComplexity: 0, maxComplexity: 0 })
  assert.equal(written.architectureScore, 100)
  assert.ok(fs.readFileSync(baselineFile(root), 'utf8').endsWith('\n'), '基线以换行结尾')

  const check = await verifyArchitecture({ root })
  assert.equal(check.ok, true)
  assert.equal(check.exitCode, 0)
  assert.deepEqual(check.regressions, [])
  assert.deepEqual(check.improvements, [])
  assert.equal(check.index.languages, 1)
})

test('verify-arch：新增循环与架构分下降判为退化', async () => {
  const root = makeRoot()
  writeIndex(root, [{ path: 'a.js' }, { path: 'b.js' }], [{ from: 'a.js', to: 'b.js' }])
  await verifyArchitecture({ root, update: true })

  writeIndex(root, [{ path: 'a.js' }, { path: 'b.js' }], [
    { from: 'a.js', to: 'b.js' },
    { from: 'b.js', to: 'a.js' },
  ])
  const result = await verifyArchitecture({ root })
  assert.equal(result.ok, false)
  assert.equal(result.exitCode, 1)
  const kinds = result.regressions.map(item => item.kind)
  assert.ok(kinds.includes('cycle'))
  assert.ok(kinds.includes('score'))
  assert.match(formatReport(result), /new import cycle group: a\.js ↔ b\.js/)
  assert.match(formatReport(result), /Result: FAIL/)
})

test('verify-arch：缺失基线默认只告警，--require 下失败', async () => {
  const root = makeRoot()
  writeIndex(root, [{ path: 'a.js' }], [])
  const relaxed = await verifyArchitecture({ root })
  assert.equal(relaxed.ok, true)
  assert.equal(relaxed.exitCode, 0)
  assert.equal(relaxed.problems[0].code, 'baseline/missing')
  assert.equal(relaxed.problems[0].severity, 'warning')

  const strict = await verifyArchitecture({ root, requireBaseline: true })
  assert.equal(strict.ok, false)
  assert.equal(strict.exitCode, 1)
  assert.equal(strict.problems[0].severity, 'error')
})

test('verify-arch：缺少索引是读取错误（退出码 2）', async () => {
  const root = makeRoot()
  const result = await verifyArchitecture({ root })
  assert.equal(result.ok, false)
  assert.equal(result.exitCode, 2)
  assert.equal(result.problems[0].code, 'index/missing')
  const update = await verifyArchitecture({ root, update: true })
  assert.equal(update.exitCode, 2)
  assert.equal(fs.existsSync(baselineFile(root)), false, '无索引时不写基线')
})

test('verify-arch：坏 JSON 与不支持的版本都判基线不可用', async () => {
  const root = makeRoot()
  writeIndex(root, [{ path: 'a.js' }], [])
  writeText(baselineFile(root), '{ not json')
  const broken = await verifyArchitecture({ root })
  assert.equal(broken.exitCode, 1)
  assert.equal(broken.ok, false)
  assert.ok(broken.problems.some(problem => problem.code === 'baseline/invalid'))

  writeJson(baselineFile(root), { schemaVersion: ARCH_BASELINE_SCHEMA_VERSION + 1, cycles: [] })
  const outdated = await verifyArchitecture({ root })
  assert.equal(outdated.exitCode, 1)
  assert.ok(outdated.problems.some(problem => problem.code === 'baseline/unusable'))
  assert.ok(outdated.problems.some(problem => problem.code === 'baseline/normalized'))
})

test('verify-arch：plan 分层违规按层对计数逐次收紧', async () => {
  const root = makeRoot()
  writeText(path.join(root, 'src/a.js'), TEXT_A)
  writeText(path.join(root, 'lib/b.js'), TEXT_B)
  writeJson(path.join(root, ASSET_DIR, 'repowiki-plan.json'), {
    layers: [
      { name: 'app', paths: ['src'], mayDependOn: [] },
      { name: 'lib', paths: ['lib'], mayDependOn: ['app'] },
    ],
  })
  writeIndex(root, [{ path: 'src/a.js' }, { path: 'lib/b.js' }], [
    { from: 'src/a.js', to: 'lib/b.js' },
  ])
  const update = await verifyArchitecture({ root, update: true })
  assert.equal(update.ok, true)
  assert.equal(readBaseline(root).layerViolations.length, 1)
  assert.equal(update.planSource, 'file')

  writeIndex(root, [{ path: 'src/a.js' }, { path: 'lib/b.js' }], [
    { from: 'src/a.js', to: 'lib/b.js' },
    { from: 'src/a.js', to: 'lib/b.js' },
  ])
  const result = await verifyArchitecture({ root })
  assert.equal(result.ok, false)
  assert.match(result.regressions[0].message, /cross-layer imports app → lib increased from 1 to 2/)
})

test('verify-arch：重复块数量上升判为退化，下降提示收紧基线', async () => {
  const root = makeRoot()
  writeText(path.join(root, 'a.js'), TEXT_A)
  writeText(path.join(root, 'b.js'), TEXT_B)
  writeIndex(root, [{ path: 'a.js' }, { path: 'b.js' }], [])
  await verifyArchitecture({ root, update: true })
  assert.equal(readBaseline(root).ceilings.duplicateBlocks, 0)

  writeText(path.join(root, 'b.js'), TEXT_A)
  const regressed = await verifyArchitecture({ root })
  assert.equal(regressed.ok, false)
  assert.ok(regressed.regressions.some(item => /duplicate code blocks increased from 0 to 1/.test(item.message)))

  await verifyArchitecture({ root, update: true })
  writeText(path.join(root, 'b.js'), TEXT_B)
  const improved = await verifyArchitecture({ root })
  assert.equal(improved.ok, true)
  assert.ok(improved.improvements.some(item => item.kind === 'ceiling'))
  assert.match(formatReport(improved), /Tighten the baseline/)
})

test('verify-arch：坏索引路径被丢弃并告警，不影响检查', async () => {
  const root = makeRoot()
  writeIndex(root, [{ path: 'a.js' }, { path: '../secret.js' }], [
    { from: 'a.js', to: '../secret.js' },
  ])
  const result = await verifyArchitecture({ root, update: true })
  assert.equal(result.ok, true)
  assert.ok(result.problems.some(problem => problem.code === 'index/untrusted'))
  const written = readBaseline(root)
  assert.equal(written.totals.files, 1)
  assert.equal(written.totals.edges, 0)
})

test('verify-arch：坏 plan 退化为默认阈值并告警', async () => {
  const root = makeRoot()
  writeIndex(root, [{ path: 'a.js' }], [])
  writeText(path.join(root, ASSET_DIR, 'repowiki-plan.json'), '{ oops')
  const result = await verifyArchitecture({ root, update: true })
  assert.equal(result.ok, true)
  assert.equal(result.planSource, 'broken')
  assert.ok(result.problems.some(problem => problem.code === 'plan/invalid'))
  assert.equal(readBaseline(root).config.duplicateMinLines, 8)
})

test('verify-arch：参数解析接受 --check 并拒绝未知参数', () => {
  const parsed = parseArgs(['--root', '.', '--check', '--require', '--json'])
  assert.equal(parsed.require, true)
  assert.equal(parsed.json, true)
  assert.equal(parsed.update, false)
  assert.throws(() => parseArgs(['--nope']), /unknown argument/)
  assert.throws(() => parseArgs(['--root']), /--root requires a directory/)
  assert.equal(parseArgs(['--help']).help, true)
  assert.equal(parseArgs(['--update']).update, true)
})

test('verify-arch：报告在通过时也展示当前事实', async () => {
  const root = makeRoot()
  writeIndex(root, [{ path: 'a.js' }], [])
  await verifyArchitecture({ root, update: true })
  const result = await verifyArchitecture({ root })
  const report = formatReport(result)
  assert.match(report, /Index: 1 file\(s\), 0 edge\(s\)/)
  assert.match(report, /architecture score 100/)
  assert.match(report, /Result: PASS/)
})

test('verify-arch：坏索引 JSON 与非索引对象都是读取错误', async () => {
  const root = makeRoot()
  writeText(path.join(root, ASSET_DIR, 'index.json'), '{ oops')
  const broken = await verifyArchitecture({ root })
  assert.equal(broken.exitCode, 2)
  assert.equal(broken.problems[0].code, 'index/invalid')
  assert.match(broken.problems[0].message, /not valid JSON/)

  writeJson(path.join(root, ASSET_DIR, 'index.json'), { schemaVersion: 6, edges: [] })
  const shape = await verifyArchitecture({ root })
  assert.equal(shape.exitCode, 2)
  assert.match(shape.problems[0].message, /not a valid index/)
})

test('verify-arch：截断基线给出告警，修复项超过 5 条时折叠', async () => {
  const root = makeRoot()
  writeIndex(root, [{ path: 'a.js' }], [])
  const cycles = Array.from({ length: 6 }, (_, index) => [`g${index}/a.js`, `g${index}/b.js`])
  writeJson(baselineFile(root), {
    schemaVersion: ARCH_BASELINE_SCHEMA_VERSION,
    cycles,
    layerViolations: [],
    unresolvedImports: [],
    ceilings: { duplicateBlocks: 0, highComplexity: 0, maxComplexity: 0 },
    architectureScore: 40,
    truncated: { cycles: true, unresolvedImports: true },
  })
  const result = await verifyArchitecture({ root })
  assert.equal(result.ok, true)
  assert.ok(result.problems.some(problem => problem.code === 'baseline/truncated'))
  assert.equal(result.improvements.length, 7, '6 个环 + 1 个分值')
  const report = formatReport(result)
  assert.match(report, /Tighten the baseline \(7 fixed\)/)
  assert.match(report, /… 2 more/)
})

test('verify-arch：基线不可写（目标是目录）时退出码 2', async () => {
  const root = makeRoot()
  writeIndex(root, [{ path: 'a.js' }], [])
  fs.mkdirSync(baselineFile(root), { recursive: true })
  const result = await verifyArchitecture({ root, update: true })
  assert.equal(result.ok, false)
  assert.equal(result.exitCode, 2)
  assert.ok(result.problems.some(problem => problem.code === 'baseline/write-failed'))
})

test('verify-arch：CLI 入口 --help 与 --json 契约', () => {
  const help = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /Usage: node scripts\/verify-arch\.mjs/)

  const root = makeRoot()
  writeIndex(root, [{ path: 'a.js' }], [])
  const check = spawnSync(process.execPath, [SCRIPT, '--root', root, '--json'], { encoding: 'utf8' })
  assert.equal(check.status, 0, '无基线默认通过')
  const report = JSON.parse(check.stdout)
  assert.equal(report.ok, true)
  assert.equal(report.current.architectureScore, 100)
  assert.ok(report.problems.some(problem => problem.code === 'baseline/missing'))

  const unknown = spawnSync(process.execPath, [SCRIPT, '--nope'], { encoding: 'utf8' })
  assert.equal(unknown.status, 2)
  assert.match(unknown.stderr, /unknown argument/)
})
