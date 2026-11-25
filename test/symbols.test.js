/**
 * 符号提取器单元测试（JS/TS/Python + 边界）。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { extractSymbols } from '../src/symbols.js'

test('TS：提取函数、类与方法、interface/type、export 标记', () => {
  const code = [
    'export function foo(a) { return a }',
    'const bar = (x) => x + 1',
    'class Foo {',
    '  methodOne(p) { return p }',
    '  async methodTwo() {}',
    '  arrow = (z) => z',
    '}',
    'export interface Iface { a: string }',
    'type Alias = string | number;',
    'export const PI = 3.14',
    '// if (x) { 注释里的关键字不提取',
    'function notExported() {}',
  ].join('\n')
  const syms = extractSymbols(code, 'typescript')
  const byName = Object.fromEntries(syms.map(s => [s.name + ':' + s.line, s]))

  assert.ok(byName['foo:1'], 'export function foo')
  assert.equal(byName['foo:1'].kind, 'function')
  assert.equal(byName['foo:1'].exported, true)

  assert.ok(byName['bar:2'], '箭头函数变量')
  assert.equal(byName['bar:2'].kind, 'function')

  assert.ok(byName['Foo:3'], 'class Foo')
  assert.equal(byName['Foo:3'].kind, 'class')
  assert.ok(byName['Foo:3'].endLine >= 6, '类块结束行')

  const methods = syms.filter(s => s.kind === 'method')
  assert.ok(methods.some(m => m.name === 'methodOne' && m.parent === 'Foo'))
  assert.ok(methods.some(m => m.name === 'methodTwo' && m.parent === 'Foo'))
  assert.ok(methods.some(m => m.name === 'arrow'), '类属性箭头方法')
  assert.ok(methods.every(m => m.endLine <= byName['Foo:3'].endLine), '方法不越过类边界')

  assert.equal(byName['Iface:8'].kind, 'interface')
  assert.equal(byName['Iface:8'].exported, true)
  assert.equal(byName['Alias:9'].kind, 'type')
  assert.equal(byName['PI:10'].kind, 'variable')
  assert.equal(byName['PI:10'].exported, true)
  assert.equal(byName['notExported:12'].exported, false)
  assert.equal(syms.filter(s => s.name === 'if').length, 0, '注释关键字不提取')
})

test('JS：控制流关键字不被误识别为方法', () => {
  const code = [
    'class Handler {',
    '  run() {',
    '    if (a) { return 1 }',
    '    for (const i of xs) { }',
    '    while (x) { }',
    '    switch (y) { default: return 2 }',
    '    return this.run()',
    '  }',
    '}',
  ].join('\n')
  const syms = extractSymbols(code, 'javascript')
  const methods = syms.filter(s => s.kind === 'method')
  assert.deepEqual(methods.map(m => m.name), ['run'])
})

test('TS：泛型与修饰符前缀的方法可提取', () => {
  const code = [
    'class Box {',
    '  static create<T>(v: T): Box { return new Box() }',
    '  private async load(id: string): Promise<void> {}',
    '  get value() { return this._v }',
    '}',
  ].join('\n')
  const syms = extractSymbols(code, 'typescript')
  const names = syms.filter(s => s.kind === 'method').map(s => s.name)
  assert.ok(names.includes('create'), 'static 泛型方法')
  assert.ok(names.includes('load'), 'private async 方法')
  assert.ok(names.includes('value'), 'getter')
})

test('Python：class/def/async def 与方法归属、缩进块范围', () => {
  const code = [
    'class Bar:',
    '    def meth(self, x):',
    '        return x',
    '',
    '    async def ameth(self):',
    '        pass',
    '',
    'async def top(): ...',
    'def plain(): pass',
  ].join('\n')
  const syms = extractSymbols(code, 'python')
  const byName = Object.fromEntries(syms.map(s => [s.name, s]))

  assert.equal(byName.Bar.kind, 'class')
  assert.equal(byName.meth.kind, 'method')
  assert.equal(byName.meth.parent, 'Bar')
  assert.equal(byName.ameth.kind, 'method')
  assert.equal(byName.ameth.parent, 'Bar')
  assert.equal(byName.top.kind, 'function')
  assert.equal(byName.plain.kind, 'function')
  assert.ok(!byName.plain.parent, '顶层函数无 parent')
  assert.ok(byName.Bar.endLine >= byName.ameth.endLine, '类块覆盖其方法')
})

test('边界：空字符串与不支持的语言返回空数组', () => {
  assert.deepEqual(extractSymbols('', 'typescript'), [])
  assert.deepEqual(extractSymbols('x = 1', 'ruby'), [])
})
