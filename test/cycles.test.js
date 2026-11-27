/**
 * 循环依赖检测纯函数测试：SCC 口径、自引用忽略、排序与双重截断。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { findImportCycles, MAX_CYCLE_GROUPS, MAX_FILES_PER_CYCLE } from '../src/cycles.js'

/** 构造一条依赖边。 */
const edge = (from, to) => ({ from, to, kind: 'import' })

test('findImportCycles：两文件互引识别为一组（组内字典序 + 最短环路径）', () => {
  const result = findImportCycles([edge('b.ts', 'a.ts'), edge('a.ts', 'b.ts')])
  assert.deepEqual(result.cycles, [{
    files: ['a.ts', 'b.ts'], size: 2, truncated: false,
    sample: ['a.ts', 'b.ts', 'a.ts'],
  }])
  assert.equal(result.truncated, false)
})

test('findImportCycles：多文件环只报一个组，链式无环返回空', () => {
  const ring = findImportCycles([edge('a.ts', 'b.ts'), edge('b.ts', 'c.ts'), edge('c.ts', 'a.ts')])
  assert.deepEqual(ring.cycles, [{
    files: ['a.ts', 'b.ts', 'c.ts'], size: 3, truncated: false,
    sample: ['a.ts', 'b.ts', 'c.ts', 'a.ts'],
  }])

  const chain = findImportCycles([edge('a.ts', 'b.ts'), edge('b.ts', 'c.ts')])
  assert.deepEqual(chain, { cycles: [], truncated: false })

  // 菱形（共同目标）不是环
  const diamond = findImportCycles([edge('a.ts', 'b.ts'), edge('a.ts', 'c.ts'), edge('b.ts', 'd.ts'), edge('c.ts', 'd.ts')])
  assert.deepEqual(diamond.cycles, [])
})

test('findImportCycles：自引用、坏边与空输入安全忽略', () => {
  assert.deepEqual(findImportCycles([edge('a.ts', 'a.ts')]), { cycles: [], truncated: false })
  assert.deepEqual(findImportCycles([null, {}, { from: 1, to: 'a.ts' }, { from: 'a.ts' }]), { cycles: [], truncated: false })
  assert.deepEqual(findImportCycles(), { cycles: [], truncated: false })
  // 重复边不改变结果
  assert.deepEqual(
    findImportCycles([edge('a.ts', 'b.ts'), edge('a.ts', 'b.ts'), edge('b.ts', 'a.ts')]).cycles,
    [{
      files: ['a.ts', 'b.ts'], size: 2, truncated: false,
      sample: ['a.ts', 'b.ts', 'a.ts'],
    }],
  )
})

test('findImportCycles：多组按大小降序、同大小按首文件字典序', () => {
  const result = findImportCycles([
    edge('z.ts', 'y.ts'), edge('y.ts', 'z.ts'), // 组 [y,z]
    edge('a.ts', 'b.ts'), edge('b.ts', 'a.ts'), // 组 [a,b]
    edge('m.ts', 'n.ts'), edge('n.ts', 'o.ts'), edge('o.ts', 'm.ts'), // 组 [m,n,o]（最大）
  ])
  assert.deepEqual(result.cycles.map(c => c.files), [
    ['m.ts', 'n.ts', 'o.ts'],
    ['a.ts', 'b.ts'],
    ['y.ts', 'z.ts'],
  ])
  assert.equal(result.truncated, false)
})

test('findImportCycles：组数与每组文件数双重截断', () => {
  const twoGroups = [
    edge('a.ts', 'b.ts'), edge('b.ts', 'a.ts'),
    edge('c.ts', 'd.ts'), edge('d.ts', 'c.ts'),
  ]
  const limited = findImportCycles(twoGroups, { limit: 1 })
  assert.equal(limited.cycles.length, 1)
  assert.equal(limited.truncated, true, '还有未返回的组时如实标记')

  const big = findImportCycles([
    edge('a.ts', 'b.ts'), edge('b.ts', 'c.ts'), edge('c.ts', 'a.ts'),
  ], { filesPerCycle: 2 })
  assert.deepEqual(big.cycles, [{
    files: ['a.ts', 'b.ts'], size: 3, truncated: true,
    sample: ['a.ts', 'b.ts', 'c.ts', 'a.ts'],
  }])
  assert.equal(big.truncated, false, '组内截断不算组级截断')
})

test('findImportCycles：超长链不爆栈（迭代 Tarjan）', () => {
  const size = 5000
  const edges = []
  for (let i = 0; i < size - 1; i++) edges.push(edge(`f${i}.ts`, `f${i + 1}.ts`))
  const chain = findImportCycles(edges)
  assert.deepEqual(chain.cycles, [], '长链无环且不抛栈溢出')

  // 闭合成长链环：一个 size=size 的 SCC，文件列表按上限截断
  edges.push(edge(`f${size - 1}.ts`, 'f0.ts'))
  const ring = findImportCycles(edges, { filesPerCycle: 5 })
  assert.equal(ring.cycles.length, 1)
  assert.equal(ring.cycles[0].size, size)
  assert.equal(ring.cycles[0].files.length, 5)
  assert.equal(ring.cycles[0].truncated, true)
  assert.deepEqual(ring.cycles[0].sample, [], '超长环不给出代表性路径（避免输出膨胀）')
})

test('findImportCycles：代表性环路径只在 12 节点内给出', () => {
  const ringOf = (count) => {
    const list = []
    for (let i = 0; i < count; i++) list.push(edge(`f${i}.ts`, `f${(i + 1) % count}.ts`))
    return findImportCycles(list).cycles[0]
  }
  const twelve = ringOf(12)
  assert.equal(twelve.sample.length, 13, '12 节点环保留完整闭合路径')
  assert.equal(twelve.sample[0], 'f0.ts')
  assert.equal(twelve.sample.at(-1), 'f0.ts')
  assert.deepEqual(ringOf(13).sample, [], '13 节点环超出上限')
})

test('MAX_CYCLE_GROUPS / MAX_FILES_PER_CYCLE 是有界输出常量', () => {
  assert.ok(MAX_CYCLE_GROUPS > 0 && MAX_CYCLE_GROUPS <= 100)
  assert.ok(MAX_FILES_PER_CYCLE > 0 && MAX_FILES_PER_CYCLE <= 200)
})
