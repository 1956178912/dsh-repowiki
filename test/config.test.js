/**
 * 项目级配置与候选筛选单元测试。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { readPlan, selectCandidates, DEFAULT_PLAN } from '../src/config.js'

/**
 * 创建带 plan 文件的临时项目。
 * @param {string|null} content - plan 文件内容；null 表示不创建。
 * @returns {string} 项目根。
 */
function makeProject(content) {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-plan-'))
  if (content !== null) {
    nodefs.mkdirSync(path.join(dir, '.dsh-repowiki'), { recursive: true })
    nodefs.writeFileSync(path.join(dir, '.dsh-repowiki/repowiki-plan.json'), content)
  }
  return dir
}

test('readPlan：无文件返回默认配置', async () => {
  const dir = makeProject(null)
  const fs = makeFakeFs(dir)
  const { plan, source } = await readPlan(fs, dir)
  assert.equal(source, 'default')
  assert.deepEqual(plan.exclude, [])
  assert.equal(plan.maxCardsPerRun, DEFAULT_PLAN.maxCardsPerRun)
})

test('readPlan：合法文件覆盖默认值', async () => {
  const dir = makeProject(JSON.stringify({ exclude: ['vendor'], maxCardsPerRun: 5, cardComplexityThreshold: 10 }))
  const fs = makeFakeFs(dir)
  const { plan, source } = await readPlan(fs, dir)
  assert.equal(source, 'file')
  assert.deepEqual(plan.exclude, ['vendor'])
  assert.equal(plan.maxCardsPerRun, 5)
  assert.equal(plan.cardComplexityThreshold, 10)
})

test('readPlan：坏文件回退默认并标记 broken', async () => {
  const dir = makeProject('{not json')
  const fs = makeFakeFs(dir)
  const { plan, source, error } = await readPlan(fs, dir)
  assert.equal(source, 'broken')
  assert.ok(error)
  assert.deepEqual(plan.exclude, [])
})

test('readPlan：字段类型错误回退默认（不抛异常）', async () => {
  const dir = makeProject(JSON.stringify({ exclude: 'not-array', maxCardsPerRun: -1, locales: 3 }))
  const fs = makeFakeFs(dir)
  const { plan } = await readPlan(fs, dir)
  assert.deepEqual(plan.exclude, [])
  assert.equal(plan.maxCardsPerRun, DEFAULT_PLAN.maxCardsPerRun)
  assert.deepEqual(plan.locales, [])
})

test('selectCandidates：阈值过滤 + 路径限定 + 上限截断', () => {
  const files = [
    { path: 'src/big.ts', symbols: [{}, {}, {}, {}] },   // 4 符号
    { path: 'src/small.ts', symbols: [{}] },              // 1 符号
    { path: 'lib/x.ts', symbols: [{}, {}, {}] },          // 3 符号
  ]
  const got = selectCandidates(files, DEFAULT_PLAN, {})
  assert.deepEqual(got.candidates, ['src/big.ts', 'lib/x.ts'])
  assert.deepEqual(got.skippedSimple, ['src/small.ts'])
  assert.equal(got.capped, false)

  const limited = selectCandidates(files, DEFAULT_PLAN, { maxCards: 1 })
  assert.equal(limited.candidates.length, 1)
  assert.equal(limited.capped, true)

  const scoped = selectCandidates(files, DEFAULT_PLAN, { paths: ['src/'] })
  assert.deepEqual(scoped.candidates, ['src/big.ts'])

  const strict = selectCandidates(files, DEFAULT_PLAN, { threshold: 5 })
  assert.deepEqual(strict.candidates, [])
})

test('selectCandidates：plan.includeOnly 生效', () => {
  const files = [
    { path: 'src/a.ts', symbols: [{}, {}, {}] },
    { path: 'lib/b.ts', symbols: [{}, {}, {}] },
  ]
  const plan = { ...DEFAULT_PLAN, includeOnly: ['src/'] }
  const got = selectCandidates(files, plan, {})
  assert.deepEqual(got.candidates, ['src/a.ts'])
})
