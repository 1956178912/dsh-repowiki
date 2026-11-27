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

test('Go：func/方法接收者/type/导出常量', () => {
  const code = [
    'package demo',
    '',
    'type Server struct {',
    '  addr string',
    '}',
    '',
    'type Greeter interface {',
    '  Greet() string',
    '}',
    '',
    'type Alias = string',
    'type Handler func(int) error',
    '',
    'func (s *Server) Start() error { return nil }',
    'func NewServer() *Server { return &Server{} }',
    'func hidden() {}',
    '',
    'const Version = "1"',
    'var debug = true',
    'const (',
    '  MaxRetries = 3',
    '  internal = 1',
    ')',
  ].join('\n')
  const syms = extractSymbols(code, 'go')
  const byName = Object.fromEntries(syms.map(s => [s.name, s]))

  assert.equal(byName.Server.kind, 'class')
  assert.equal(byName.Server.exported, true)
  assert.equal(byName.Greeter.kind, 'interface')
  assert.equal(byName.Alias.kind, 'type')
  assert.equal(byName.Handler.kind, 'type')
  assert.equal(byName.Start.kind, 'method')
  assert.equal(byName.Start.parent, 'Server')
  assert.equal(byName.NewServer.kind, 'function')
  assert.equal(byName.hidden.kind, 'function')
  assert.equal(byName.hidden.exported, false, 'Go 未导出函数仍索引，但标记 exported=false')
})

test('Rust：fn/impl 方法/trait/struct/enum/pub 可见性', () => {
  const code = [
    'use crate::a::Thing;',
    '',
    'pub struct Foo { x: i32 }',
    '',
    'enum Color { Red, Blue }',
    '',
    'impl Foo {',
    '  pub fn new() -> Self { Foo { x: 0 } }',
    '  fn hidden(&self) {}',
    '}',
    '',
    'pub trait Greet {',
    '  fn greet(&self);',
    '  fn default_greet(&self) { }',
    '}',
    '',
    'pub fn top() {}',
    'const LIMIT: usize = 10;',
  ].join('\n')
  const syms = extractSymbols(code, 'rust')
  const byName = Object.fromEntries(syms.map(s => [s.name, s]))

  assert.equal(byName.Foo.kind, 'class')
  assert.equal(byName.Foo.exported, true)
  assert.equal(byName.Color.kind, 'type')
  assert.equal(byName.new.kind, 'method')
  assert.equal(byName.new.parent, 'Foo')
  assert.equal(byName.new.exported, true)
  assert.equal(byName.hidden.parent, 'Foo')
  assert.equal(byName.hidden.exported, false)
  assert.equal(byName.Greet.kind, 'interface')
  assert.equal(byName.greet.parent, 'Greet')
  assert.equal(byName.greet.endLine, byName.greet.line, 'trait 无方法体声明止于本行')
  assert.equal(byName.top.kind, 'function')
  assert.equal(byName.LIMIT.kind, 'variable')
})

test('Java：class/interface/enum/record、构造器与成员方法', () => {
  const code = [
    'package com.acme;',
    '',
    'public class Demo {',
    '  private int x;',
    '  public Demo() { this.x = 0; }',
    '  public int add(int a, int b) { return a + b; }',
    '  private static void helper() { }',
    '  static { System.out.println("init"); }',
    '  class Inner {',
    '    void innerMethod() {}',
    '  }',
    '}',
    '',
    'interface Shape {',
    '  double area();',
    '}',
    '',
    'enum Color { RED, BLUE }',
    'record Point(int x, int y) {}',
  ].join('\n')
  const syms = extractSymbols(code, 'java')
  const classSym = syms.find(s => s.name === 'Demo' && s.kind === 'class')
  assert.ok(classSym?.exported)

  const methods = syms.filter(s => s.kind === 'method' && s.parent === 'Demo')
  assert.deepEqual(methods.map(m => m.name).sort(), ['Demo', 'add', 'helper'], '构造器与方法，不含 static 初始化块')
  assert.ok(syms.find(s => s.name === 'add')?.exported)
  assert.equal(syms.find(s => s.name === 'helper')?.exported, false)
  assert.equal(syms.find(s => s.name === 'Inner')?.kind, 'class')
  assert.ok(syms.find(s => s.name === 'innerMethod' && s.parent === 'Inner'), '嵌套类方法归属自身')
  assert.equal(syms.find(s => s.name === 'Shape')?.kind, 'interface')
  assert.equal(syms.find(s => s.name === 'Color')?.kind, 'type')
  assert.equal(syms.find(s => s.name === 'Point')?.kind, 'class')
})

test('C#：class/interface/record/enum、构造器与第一层方法', () => {
  const code = [
    'using System;',
    'namespace Demo {',
    '  public class UserService {',
    '    private int count;',
    '    public UserService() {}',
    '    public int Add(int a, int b) {',
    '      return a + b;',
    '    }',
    '    private static void Helper() { }',
    '    public class Nested {',
    '      public void Inner() { }',
    '    }',
    '  }',
    '  public interface IRepo { }',
    '  public record Point(int X, int Y);',
    '  public enum Color { Red }',
    '  internal class Hidden { }',
    '}',
  ].join('\n')
  const syms = extractSymbols(code, 'csharp')
  const byName = Object.fromEntries(syms.filter(s => s.kind !== 'method').map(s => [s.name, s]))

  assert.equal(byName.UserService.kind, 'class')
  assert.equal(byName.UserService.exported, true)
  assert.equal(byName.IRepo.kind, 'interface')
  assert.equal(byName.Point.kind, 'class')
  assert.equal(byName.Color.kind, 'type')
  assert.equal(byName.Hidden.exported, false)
  const methods = syms.filter(s => s.kind === 'method')
  assert.ok(methods.some(m => m.name === 'UserService' && m.parent === 'UserService'), '构造器')
  assert.ok(methods.some(m => m.name === 'Add' && m.parent === 'UserService' && m.exported))
  assert.ok(methods.some(m => m.name === 'Helper' && m.parent === 'UserService' && !m.exported))
  assert.ok(methods.some(m => m.name === 'Inner' && m.parent === 'Nested'), '嵌套类方法归属自身')
})

test('Kotlin：data/enum class、object、fun 与嵌套方法归属', () => {
  const code = [
    'package demo',
    'import demo.util.Helper',
    'data class User(val name: String)',
    'class Service {',
    '  fun run() {}',
    '  private fun hidden() {}',
    '  object Nested {',
    '    fun inner() {}',
    '  }',
    '}',
    'interface Repo {',
    '  fun save()',
    '}',
    'enum class Color { RED }',
    'fun top() = 1',
  ].join('\n')
  const syms = extractSymbols(code, 'kotlin')
  const byName = Object.fromEntries(syms.filter(s => s.kind !== 'method').map(s => [s.name, s]))

  assert.equal(byName.User.kind, 'class')
  assert.equal(byName.Service.kind, 'class')
  assert.equal(byName.Nested.kind, 'class')
  assert.equal(byName.Repo.kind, 'interface')
  assert.equal(byName.Color.kind, 'type')
  assert.equal(byName.top.kind, 'function')

  const methods = syms.filter(s => s.kind === 'method')
  assert.ok(methods.some(m => m.name === 'run' && m.parent === 'Service' && m.exported))
  assert.ok(methods.some(m => m.name === 'hidden' && m.parent === 'Service' && !m.exported))
  assert.ok(methods.some(m => m.name === 'inner' && m.parent === 'Nested'))
  assert.ok(methods.some(m => m.name === 'save' && m.parent === 'Repo'))
})

test('PHP：class/interface/trait/enum、方法可见性与顶层函数', () => {
  const code = [
    '<?php',
    'namespace App\\Services;',
    'use App\\Models\\User;',
    'abstract class Service {',
    '  public function __construct() {}',
    '  public function run(): void {',
    '    return;',
    '  }',
    '  private function hidden(): void {}',
    '}',
    'interface Repo {',
    '  public function save(): void;',
    '}',
    'trait Loggable {',
    '  public function log(): void {}',
    '}',
    'enum Status {',
    '  case On;',
    '}',
    'function top_level() {}',
  ].join('\n')
  const syms = extractSymbols(code, 'php')
  const byName = Object.fromEntries(syms.filter(s => s.kind !== 'method').map(s => [s.name, s]))

  assert.equal(byName.Service.kind, 'class')
  assert.equal(byName.Repo.kind, 'interface')
  assert.equal(byName.Loggable.kind, 'class', 'trait 归为 class')
  assert.equal(byName.Status.kind, 'type')
  assert.equal(byName.top_level.kind, 'function')

  const methods = syms.filter(s => s.kind === 'method')
  assert.ok(methods.some(m => m.name === '__construct' && m.parent === 'Service'))
  assert.ok(methods.some(m => m.name === 'run' && m.parent === 'Service' && m.exported))
  assert.ok(methods.some(m => m.name === 'hidden' && m.parent === 'Service' && !m.exported))
  assert.ok(methods.some(m => m.name === 'save' && m.parent === 'Repo'))
  assert.ok(methods.some(m => m.name === 'log' && m.parent === 'Loggable'))
})

test('Ruby：class/module/def（含 self 与 ?!=）、attr_* 与常量', () => {
  const code = [
    'module Billing',
    '  VERSION = "1.0"',
    '',
    '  class Invoice < Base',
    '    attr_reader :id, :total',
    '    attr_accessor :status',
    '',
    '    def initialize(id)',
    '      @id = id',
    '    end',
    '',
    '    def self.build(attrs)',
    '      new(attrs)',
    '    end',
    '',
    '    def paid?',
    '      status == :paid',
    '    end',
    '',
    '    def summary(items)',
    '      items.map do |item|',
    '        item.to_s',
    '      end',
    '    end',
    '',
    '    def total = items.sum',
    '  end',
    'end',
  ].join('\n')
  const syms = extractSymbols(code, 'ruby')
  const byName = Object.fromEntries(syms.filter(s => s.kind !== 'method').map(s => [s.name, s]))

  assert.equal(byName.Billing.kind, 'type', 'module 记为命名空间')
  assert.equal(byName.Invoice.kind, 'class')
  assert.equal(byName.VERSION.kind, 'variable')
  assert.equal(byName.id.kind, 'variable', 'attr_reader 生成读属性')
  assert.equal(byName.status.kind, 'variable', 'attr_accessor 生成属性')

  const methods = syms.filter(s => s.kind === 'method')
  assert.ok(methods.some(m => m.name === 'initialize' && m.parent === 'Invoice'))
  assert.ok(methods.some(m => m.name === 'build' && m.parent === 'Invoice'), 'def self.x 归属类')
  assert.ok(methods.some(m => m.name === 'paid?' && m.parent === 'Invoice'), '? 后缀方法名')
  assert.ok(methods.some(m => m.name === 'summary' && m.parent === 'Invoice'))
  assert.ok(methods.some(m => m.name === 'total' && m.parent === 'Invoice'), '表达式体 def 也提取')
  assert.equal(methods.find(m => m.name === 'total').endLine, 26, '表达式体 def 不吞后续块')
  assert.equal(byName.Invoice.endLine, 27, 'class 块结束行停在自身 end（嵌套 do/end 配平）')
  assert.equal(byName.Billing.endLine, 28, 'module 块覆盖到自身 end')
})

test('Ruby：单行定义、setter、||= 常量与未闭合块降级', () => {
  const lines = [
    'class Empty; end',
    'class Open',
    '  def name=(value)',
    '    @name = value',
    '  end',
    '  MAX ||= 10',
    '  attr_writer :token',
  ]
  const syms = extractSymbols(lines.join('\n'), 'ruby')

  assert.equal(syms.find(s => s.name === 'Empty').endLine, 1, '单行 class ...; end 止于本行')
  assert.equal(syms.find(s => s.name === 'Open').endLine, lines.length, '未闭合块降级到文件尾')
  assert.ok(syms.some(s => s.name === 'name=' && s.kind === 'method'), 'setter 方法名带 =')
  assert.ok(syms.some(s => s.name === 'MAX' && s.kind === 'variable'), '||= 常量')
  assert.ok(syms.some(s => s.name === 'token' && s.kind === 'variable'), 'attr_writer')
})

test('Ruby：heredoc 与 =begin 块注释不干扰块范围', () => {
  const code = [
    'class Report',
    '  SQL = <<~SQL',
    "    SELECT 'end' FROM t",
    '  SQL',
    '',
    '  ITEMS = []',
    '',
    '  def append(items)',
    '    items << ITEM',
    '    items',
    '  end',
    '',
    '=begin',
    'def commented_out',
    'end',
    '=end',
    '',
    '  def render',
    '    puts SQL',
    '  end',
    'end',
  ].join('\n')
  const syms = extractSymbols(code, 'ruby')

  assert.ok(!syms.some(s => s.name === 'commented_out'), '块注释内不提取符号')
  assert.equal(syms.find(s => s.name === 'Report').endLine, 21, 'heredoc 内的 end 不参与配平')
  assert.equal(syms.find(s => s.name === 'append').endLine, 11, '`list << ITEM` 不被误判为 heredoc')
  assert.equal(syms.find(s => s.name === 'render').parent, 'Report')
  assert.equal(syms.find(s => s.name === 'SQL').kind, 'variable')
})

test('Swift：class/struct/enum/protocol/extension 与 func/init/typealias', () => {
  const code = [
    'import Foundation',
    '',
    'public protocol Repository {',
    '  func find(id: Int) -> User?',
    '}',
    '',
    'public final class UserService: Repository {',
    '  private let store: Store',
    '',
    '  public init(store: Store) {',
    '    self.store = store',
    '  }',
    '',
    '  public func find(id: Int) -> User? {',
    '    return store.find(id)',
    '  }',
    '',
    '  private func cache() {}',
    '}',
    '',
    'struct User {',
    '  let id: Int',
    '}',
    '',
    'extension UserService {',
    '  func reload() {}',
    '}',
    '',
    'enum Role { case admin }',
    'typealias Handler = (User) -> Void',
    'func topLevel() {}',
  ].join('\n')
  const syms = extractSymbols(code, 'swift')
  const byName = Object.fromEntries(syms.filter(s => s.kind !== 'method').map(s => [s.name, s]))

  assert.equal(byName.Repository.kind, 'interface')
  assert.equal(byName.UserService.kind, 'class')
  assert.equal(byName.User.kind, 'class')
  assert.equal(byName.Role.kind, 'type')
  assert.equal(byName.Handler.kind, 'type')
  assert.equal(byName.topLevel.kind, 'function')
  assert.equal(syms.filter(s => s.name === 'UserService').length, 1, 'extension 不重复产出类型符号')

  const methods = syms.filter(s => s.kind === 'method')
  assert.ok(methods.some(m => m.name === 'init' && m.parent === 'UserService'))
  assert.ok(methods.some(m => m.name === 'find' && m.parent === 'UserService' && m.exported))
  assert.ok(methods.some(m => m.name === 'cache' && m.parent === 'UserService' && !m.exported))
  assert.ok(methods.some(m => m.name === 'find' && m.parent === 'Repository'), '协议方法有归属')
  assert.ok(methods.some(m => m.name === 'reload' && m.parent === 'UserService'), 'extension 方法归属被扩展类型')
})

test('Scala：class/case class/trait/object/enum 与 def 归属', () => {
  const code = [
    'package com.acme',
    '',
    'trait Repository {',
    '  def find(id: Int): Option[String]',
    '}',
    '',
    'case class User(id: Int, name: String)',
    '',
    'object UserService extends Repository {',
    '  private val cache = Map.empty[Int, String]',
    '',
    '  override def find(id: Int): Option[String] = cache.get(id)',
    '',
    '  def save(user: User): Unit = {',
    '    cache.updated(user.id, user.name)',
    '  }',
    '}',
    '',
    'enum Role {',
    '  case Admin',
    '}',
    'private[acme] def topLevel(x: Int): Int = x + 1',
  ].join('\n')
  const syms = extractSymbols(code, 'scala')
  const byName = Object.fromEntries(syms.filter(s => s.kind !== 'method').map(s => [s.name, s]))

  assert.equal(byName.Repository.kind, 'interface')
  assert.equal(byName.User.kind, 'class')
  assert.equal(byName.UserService.kind, 'class', 'object 记为单例容器')
  assert.equal(byName.Role.kind, 'type')
  assert.equal(byName.topLevel.kind, 'function')
  assert.equal(byName.topLevel.exported, false, 'private[acme] 视为非公开')

  const methods = syms.filter(s => s.kind === 'method')
  assert.ok(methods.some(m => m.name === 'find' && m.parent === 'Repository'))
  assert.ok(methods.some(m => m.name === 'find' && m.parent === 'UserService'), 'override def 归属 object')
  assert.ok(methods.some(m => m.name === 'save' && m.parent === 'UserService'))
})

test('Scala 3：缩进语法（无花括号）的类型体与 def 归属', () => {
  const code = [
    'object App:',
    '  def run(): Unit =',
    '    println("hi")',
    '',
    '  private def helper(): Unit = ()',
    '',
    'trait Service:',
    '  def find(id: Int): Option[String]',
    '',
    'extension (s: String)',
    '  def shout: String = s.toUpperCase',
    '',
    'given UserOrdering: Ordering[User] with',
    '  def compare(a: User, b: User): Int = 0',
    '',
    'def top(): Unit = ()',
  ].join('\n')
  const syms = extractSymbols(code, 'scala')
  const byName = Object.fromEntries(syms.filter(s => s.kind !== 'method').map(s => [s.name, s]))

  assert.equal(byName.App.endLine, 6, 'object 缩进体覆盖到同级声明前')
  assert.equal(byName.Service.kind, 'interface')
  assert.equal(byName.UserOrdering.kind, 'variable', 'given 实例登记为 variable')
  assert.equal(byName.UserOrdering.endLine, 15, 'given 缩进体覆盖到同级声明前')
  assert.equal(byName.top.kind, 'function', '顶层 def 无 parent')
  assert.equal(byName.top.parent, undefined)

  const methods = syms.filter(s => s.kind === 'method')
  assert.ok(methods.some(m => m.name === 'run' && m.parent === 'App'), '缩进体 def 归属 object')
  assert.ok(methods.some(m => m.name === 'helper' && m.parent === 'App'))
  assert.ok(methods.some(m => m.name === 'find' && m.parent === 'Service'), 'trait 缩进体成员有归属')
  assert.ok(methods.some(m => m.name === 'shout' && m.parent === 'String'), 'extension 方法归属被扩展类型')
  assert.ok(methods.some(m => m.name === 'compare' && m.parent === 'UserOrdering'), 'given 内方法归属 given')
  assert.ok(methods.every(m => m.endLine >= m.line), '缩进体 def 的结束行不早于起始行')
})

test('边界：空字符串与不支持的语言返回空数组', () => {
  assert.deepEqual(extractSymbols('', 'typescript'), [])
  assert.deepEqual(extractSymbols('x = 1', 'fortran'), [])
})

test('C/C++：类型、函数、方法、构造/析构、多行签名与 static 可见性', () => {
  const code = [
    '// 注释里的 class Ghost {',
    'struct Point {',
    '  int x;',
    '  int y;',
    '};',
    'class Widget final : public Base {',
    'public:',
    '  Widget(int size);',
    '  ~Widget();',
    '  void draw(int w,',
    '            int h) {',
    '    return;',
    '  }',
    '  static int count() { return 0; }',
    '};',
    'typedef struct {',
    '  int a;',
    '} Handle;',
    'enum class Color : int { Red, Green };',
    'int main(int argc, char **argv) {',
    '  if (argc > 1) { return 1; }',
    '  return 0;',
    '}',
    'void Widget::draw(int w, int h) {',
    '}',
    'static void helper() {}',
  ].join('\n')
  const symbols = extractSymbols(code, 'cpp')
  const byName = (name) => symbols.filter(s => s.name === name)
  const point = byName('Point')[0]
  assert.equal(point?.kind, 'class')
  assert.equal(point?.endLine, 5, 'struct 块范围到闭合行')
  const widget = byName('Widget')[0]
  assert.equal(widget?.kind, 'class')
  assert.equal(widget?.endLine, 15)
  const ctor = byName('Widget')[1]
  assert.equal(ctor?.kind, 'method')
  assert.equal(ctor?.parent, 'Widget')
  assert.equal(ctor?.line, 8)
  const dtor = byName('~Widget')[0]
  assert.equal(dtor?.kind, 'method')
  assert.equal(dtor?.parent, 'Widget', '析构函数名保留 ~，归属类')
  const draw = byName('draw')[0]
  assert.equal(draw?.parent, 'Widget')
  assert.equal(draw?.line, 10)
  assert.equal(draw?.endLine, 13, '多行参数列表后的函数体范围')
  const count = byName('count')[0]
  assert.equal(count?.exported, false, 'static 方法不是导出符号')
  const handle = byName('Handle')[0]
  assert.equal(handle?.kind, 'class', '匿名 typedef 取别名')
  assert.equal(handle?.endLine, 18)
  const color = byName('Color')[0]
  assert.equal(color?.kind, 'type')
  assert.equal(byName('main')[0]?.kind, 'function')
  assert.equal(byName('main')[0]?.endLine, 23)
  assert.equal(byName('if').length, 0, '控制流关键字不产出符号')
  assert.equal(byName('return').length, 0)
  assert.equal(byName('draw')[1]?.parent, 'Widget', '类外定义按限定名归属')
  assert.equal(byName('draw')[1]?.line, 24)
  assert.equal(byName('helper')[0]?.exported, false)
})

test('Scala：多行参数子句/继承/表达式体获得正确范围与归属', () => {
  const code = [
    'class Service(',
    '  dep: Dep,',
    '  other: Other',
    ') extends Base {',
    '  def handle(',
    '    req: Request',
    '  ): Response = {',
    '    respond(req)',
    '  }',
    '  def pure(',
    '    x: Int',
    '  ): Int =',
    '    x + 1',
    '}',
    'def topLevel(',
    '  a: Int',
    ') = a * 2',
  ].join('\n')
  const symbols = extractSymbols(code, 'scala')
  const byName = (name) => symbols.filter(s => s.name === name)
  const service = byName('Service')[0]
  assert.equal(service?.kind, 'class')
  assert.equal(service?.endLine, 14, '多行构造参数后的类体范围')
  const handle = byName('handle')[0]
  assert.equal(handle?.parent, 'Service')
  assert.equal(handle?.endLine, 9, '表达式块体到闭合花括号')
  const pure = byName('pure')[0]
  assert.equal(pure?.parent, 'Service')
  assert.equal(pure?.endLine, 13, '多行参数 + 换行表达式体的缩进范围')
  const top = byName('topLevel')[0]
  assert.equal(top?.kind, 'function')
  assert.equal(top?.endLine, 17, '顶层多行参数的单行表达式体')
})

test('Vue SFC：只提取 script 块内符号，行号保持源文件位置', () => {
  const code = [
    '<template>',
    '  <div>{{ label }}</div>',
    '</template>',
    '',
    '<script setup lang="ts">',
    "import { ref } from 'vue'",
    'const label = ref("x")',
    'const inc = () => label.value + 1',
    'export function greet() {',
    '  return inc()',
    '}',
    '</script>',
    '',
    '<style scoped>',
    '.a { color: red }',
    '</style>',
  ].join('\n')
  const symbols = extractSymbols(code, 'vue')
  assert.deepEqual(symbols.map(s => [s.name, s.kind, s.line]), [
    ['inc', 'function', 8],
    ['greet', 'function', 9],
  ])
  assert.equal(symbols[1].exported, true)
  // 多个 script 块分别保留原始行号
  const multi = [
    '<script>',
    'function a() {}',
    '</script>',
    '<script setup>',
    'const b = () => 1',
    '</script>',
  ].join('\n')
  assert.deepEqual(extractSymbols(multi, 'vue').map(s => [s.name, s.line]), [['a', 2], ['b', 5]])
  // template/style 中的文本不产生额外符号
  assert.equal(symbols.filter(s => s.name === 'label').length, 0, '非导出常量不产符号（与 JS 规则一致）')
  assert.ok(!symbols.some(s => s.name === 'a'), '.a 样式选择器不产符号')
})

test('Dart：类型/顶层函数/变量、构造器/方法/getter 与私有可见性', () => {
  const code = [
    "typedef Callback = void Function(int);",
    "const appName = 'demo';",
    'final int counter = 0;',
    'int get answer => 42;',
    'void main() {',
    '  runApp(App());',
    '}',
    'class App extends StatelessWidget {',
    '  const App({super.key});',
    '  const App.named();',
    "  final String title = 'x';",
    '  @override',
    '  Widget build(BuildContext context) {',
    '    if (true) { return Container(); }',
    "    return Text('x');",
    '  }',
    '  int get value => 1;',
    "  String _secret() => 's';",
    '  static App create() => App();',
    '}',
    'enum Color { red, green }',
    'mixin Logging {',
    '  void log(String msg) {}',
    '}',
    'extension StringExt on String {',
    '  int get wordCount => 1;',
    '}',
  ].join('\n')
  const symbols = extractSymbols(code, 'dart')
  const byName = Object.fromEntries(symbols.map(s => [`${s.name}:${s.line}`, s]))

  assert.equal(byName['Callback:1'].kind, 'type')
  assert.equal(byName['appName:2'].kind, 'variable')
  assert.equal(byName['counter:3'].kind, 'variable')
  assert.equal(byName['answer:4'].kind, 'function')
  assert.equal(byName['main:5'].kind, 'function')
  assert.equal(byName['main:5'].endLine, 7)

  const app = byName['App:8']
  assert.equal(app.kind, 'class')
  assert.ok(app.endLine >= 20, '类结束行')
  assert.equal(byName['App:9'].kind, 'method')
  assert.equal(byName['App:9'].parent, 'App', '默认构造器')
  assert.equal(byName['App.named:10'].parent, 'App', '命名构造器')
  assert.equal(byName['build:13'].kind, 'method')
  assert.equal(byName['build:13'].parent, 'App')
  assert.equal(byName['value:17'].kind, 'method', 'getter 作为方法')
  assert.equal(byName['_secret:18'].exported, false)
  assert.equal(byName['create:19'].exported, true)

  assert.equal(byName['Color:21'].kind, 'class')
  assert.equal(byName['Logging:22'].kind, 'class')
  assert.ok(symbols.some(s => s.name === 'log' && s.parent === 'Logging'))
  assert.equal(byName['StringExt:25'].kind, 'class')
  assert.ok(symbols.some(s => s.name === 'wordCount' && s.parent === 'StringExt'))
  assert.ok(!symbols.some(s => s.name === 'red'), '枚举常量不产符号')
})

test('Elixir：模块/函数/宏/guard/delegate 与嵌套模块命名', () => {
  const code = [
    'defmodule MyApp.Accounts.User do',
    '  @moduledoc "用户"',
    '',
    '  def new(name), do: %__MODULE__{name: name}',
    '',
    '  def find(',
    '    id,',
    '    opts \\\\ []',
    '  ) do',
    '    case id do',
    '      nil -> :error',
    '      _ -> :ok',
    '    end',
    '  end',
    '',
    '  defp validate(x) do',
    '    if x, do: :ok, else: :error',
    '  end',
    '',
    '  defmacro helper(a) do',
    '    quote do',
    '      unquote(a)',
    '    end',
    '  end',
    '',
    '  defguard is_id(v) when is_integer(v)',
    '  defdelegate name(user), to: MyApp.Repo',
    '',
    '  # def commented_out(x), do: x',
    '',
    '  defmodule Inner do',
    '    def run, do: :ok',
    '  end',
    'end',
  ].join('\n')
  const symbols = extractSymbols(code, 'elixir')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.equal(byName.get('MyApp.Accounts.User').kind, 'class')
  assert.equal(byName.get('MyApp.Accounts.User').endLine, 34)
  assert.equal(byName.get('MyApp.Accounts.User.Inner').kind, 'class', '嵌套模块使用完整名')
  assert.equal(byName.get('MyApp.Accounts.User.Inner').endLine, 33)

  assert.equal(byName.get('new').kind, 'method')
  assert.equal(byName.get('new').exported, true)
  assert.equal(byName.get('new').parent, 'MyApp.Accounts.User')
  assert.equal(byName.get('new').endLine, 4, 'do: 单行形式只占一行')

  assert.equal(byName.get('find').line, 6, '多行签名按声明行定位')
  assert.equal(byName.get('find').endLine, 14, '范围从 do 行到匹配的 end')

  assert.equal(byName.get('validate').exported, false, 'defp 为私有')
  assert.equal(byName.get('validate').endLine, 18)

  assert.equal(byName.get('helper').kind, 'method', '宏记为方法')
  assert.equal(byName.get('helper').endLine, 24)
  assert.equal(byName.get('is_id').exported, true)
  assert.equal(byName.get('name').kind, 'method')
  assert.equal(byName.get('name').endLine, 27)

  assert.equal(byName.get('run').parent, 'MyApp.Accounts.User.Inner')
  assert.ok(!byName.has('commented_out'), '注释行不产出符号')
})

test('Lua：函数/方法/局部函数/模块变量与注释/长字符串', () => {
  const code = [
    'local M = {}',
    '',
    '--[[ function commented() end ]]',
    '-- function alsoCommented() end',
    'local function helper(x)',
    '  if x then',
    '    return x',
    '  end',
    'end',
    '',
    'function M.setup(opts)',
    '  for _, v in ipairs(opts) do',
    '    helper(v)',
    '  end',
    'end',
    '',
    'function M:run()',
    '  return M.util',
    'end',
    '',
    'M.util = function()',
    '  local sql = [[',
    '  function fake() end',
    '  ]]',
    '  return sql',
    'end',
    '',
    'return M',
  ].join('\n')
  const symbols = extractSymbols(code, 'lua')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.equal(byName.get('M').kind, 'variable')
  assert.equal(byName.get('M').exported, false, 'local 变量非导出')
  assert.equal(byName.get('helper').endLine, 9)
  assert.equal(byName.get('helper').exported, false, 'local function 非导出')
  assert.equal(byName.get('setup').kind, 'method')
  assert.equal(byName.get('setup').parent, 'M')
  assert.equal(byName.get('setup').endLine, 15, 'for…do 不重复计块')
  assert.equal(byName.get('run').kind, 'method')
  assert.equal(byName.get('run').parent, 'M', 'M:run 归一为 M.run')
  assert.equal(byName.get('util').parent, 'M')
  assert.equal(byName.get('util').endLine, 26, '长字符串内的 end/function 被屏蔽')
  assert.ok(!byName.has('commented') && !byName.has('alsoCommented'), '注释不产出符号')
  assert.ok(!byName.has('fake'), '长字符串不产出符号')
})

test('Zig：容器类型、成员方法、测试块与注释/字符串屏蔽', () => {
  const code = [
    'const std = @import("std");',
    'const builtin = @import("builtin");',
    'pub const Point = struct {',
    '    x: i32,',
    '    y: i32,',
    '',
    '    pub fn init(x: i32, y: i32) Point {',
    '        return .{ .x = x, .y = y };',
    '    }',
    '',
    '    const Self = @This();',
    '',
    '    fn hidden() void {}',
    '};',
    '',
    'pub const Color = enum(u8) {',
    '    red,',
    '    green,',
    '',
    '    pub fn code(self: Color) u8 {',
    '        return @intFromEnum(self);',
    '    }',
    '};',
    '',
    'pub const Value = union(enum) {',
    '    int: i64,',
    '    float: f64,',
    '};',
    '',
    '// const commented = struct {};',
    '/// doc comment',
    'pub fn main() !void {',
    '    const unused = "fake { } // not a comment";',
    '    _ = unused;',
    '}',
    '',
    'test "parses points" {',
    '    try std.testing.expect(true);',
    '}',
    '',
    'extern fn native_add(a: i32, b: i32) i32;',
    'const MULTI =',
    '    \\\\multi',
    '    \\\\line',
    ';',
    'const after = 1;',
    'pub const net = @import("net.zig");',
  ].join('\n')
  const symbols = extractSymbols(code, 'zig')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.ok(!byName.has('std') && !byName.has('builtin'), '@import 绑定不是符号')
  assert.ok(!byName.has('Self'), '@This 绑定不是符号')
  assert.equal(byName.get('Point').kind, 'class')
  assert.equal(byName.get('Point').exported, true)
  assert.equal(byName.get('Point').endLine, 14)
  assert.equal(byName.get('init').kind, 'method')
  assert.equal(byName.get('init').parent, 'Point')
  assert.equal(byName.get('init').endLine, 9)
  assert.equal(byName.get('hidden').parent, 'Point')
  assert.equal(byName.get('hidden').exported, false, '无 pub 的成员非导出')
  assert.equal(byName.get('hidden').endLine, 13, '单行块体范围正确')
  assert.equal(byName.get('Color').kind, 'class')
  assert.equal(byName.get('code').parent, 'Color')
  assert.equal(byName.get('code').endLine, 22)
  assert.equal(byName.get('Value').kind, 'class', 'union(enum) 识别为类型')
  assert.equal(byName.get('main').kind, 'function')
  assert.equal(byName.get('main').exported, true)
  assert.equal(byName.get('main').endLine, 35)
  assert.equal(byName.get('parses points').exported, false)
  assert.equal(byName.get('parses points').endLine, 39)
  assert.equal(byName.get('native_add').endLine, 41, 'extern 原型为单行符号')
  assert.equal(byName.get('MULTI').kind, 'variable')
  assert.equal(byName.get('after').line, 46)
  assert.equal(byName.get('net').kind, 'variable', 'pub 再导出可见')
  assert.equal(byName.get('net').exported, true)
  assert.equal(byName.get('net').line, 47)
  assert.ok(!byName.has('unused'), '函数体内局部量不登记')
  assert.ok(!byName.has('commented'), '注释不产出符号')
  assert.ok(!byName.has('x') && !byName.has('y'), '结构体字段不登记为变量')
})

test('Gleam：类型/别名/opaque/external、函数与常量', () => {
  const code = [
    'import gleam/io',
    'import my_app/user.{type User, User as U}',
    '',
    'pub type Person {',
    '  Person(name: String, age: Int)',
    '}',
    '',
    'pub type Alias = String',
    '',
    'pub opaque type Counter {',
    '  Counter(value: Int)',
    '}',
    '',
    'pub external type Handle',
    'pub external fn open(path: String) -> Handle = "os" "open"',
    '',
    '// fn commented() { }',
    '/// doc',
    'pub fn greet(person: Person) -> String {',
    '  let name = person.name',
    '  "Hello " <> name',
    '}',
    '',
    'fn helper(x: Int) -> Int { x + 1 }',
    '',
    'pub const version = "1.0.0"',
    '',
    'fn multiline(',
    '  a: Int,',
    '  b: Int,',
    ') -> Int {',
    '  a + b',
    '}',
    '',
    'const secret = "fake // not a comment"',
  ].join('\n')
  const symbols = extractSymbols(code, 'gleam')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.equal(byName.get('Person').kind, 'class')
  assert.equal(byName.get('Person').exported, true)
  assert.equal(byName.get('Person').endLine, 6)
  assert.equal(byName.get('Alias').kind, 'type', '类型别名不当作容器类型')
  assert.equal(byName.get('Alias').endLine, 8)
  assert.equal(byName.get('Counter').kind, 'class')
  assert.equal(byName.get('Counter').endLine, 12)
  assert.equal(byName.get('Handle').kind, 'class', 'external type 识别为类型')
  assert.equal(byName.get('Handle').endLine, 14)
  assert.equal(byName.get('open').endLine, 15, 'external fn 为单行符号')
  assert.equal(byName.get('greet').kind, 'function')
  assert.equal(byName.get('greet').endLine, 22)
  assert.equal(byName.get('helper').exported, false)
  assert.equal(byName.get('helper').endLine, 24, '单行块体范围正确')
  assert.equal(byName.get('version').kind, 'variable')
  assert.equal(byName.get('version').exported, true)
  assert.equal(byName.get('multiline').endLine, 33, '跨行签名按块体配平')
  assert.equal(byName.get('secret').line, 35, '字符串内 // 不截断')
  assert.ok(!byName.has('commented'), '注释不产出符号')
  assert.ok(!byName.has('name'), '函数体内 let 不登记')
})

test('Shell：函数三种写法、公开变量与注释/heredoc 屏蔽', () => {
  const code = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    'export PROJECT_NAME="demo"',
    'readonly MAX_RETRIES=3',
    'declare -a TARGETS=(a b)',
    'LOCAL_TMP=/tmp/x',
    '',
    'greet() {',
    '  local who="$1"',
    '  echo "Hello, $who"',
    '}',
    '',
    'function deploy {',
    '  echo "deploying ${PROJECT_NAME}"',
    '}',
    '',
    'function cleanup()',
    '{',
    '  rm -f "${LOCAL_TMP}"',
    '}',
    '',
    '# function commented() {',
    'cat <<EOF',
    'function fake() {',
    '}',
    'EOF',
    '',
    'run() { echo "done"; }',
  ].join('\n')
  const symbols = extractSymbols(code, 'shell')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.equal(byName.get('PROJECT_NAME').kind, 'variable')
  assert.equal(byName.get('MAX_RETRIES').kind, 'variable')
  assert.equal(byName.get('TARGETS').kind, 'variable')
  assert.ok(!byName.has('LOCAL_TMP'), '普通赋值不登记')
  assert.equal(byName.get('greet').kind, 'function')
  assert.equal(byName.get('greet').endLine, 12)
  assert.equal(byName.get('deploy').endLine, 16)
  assert.equal(byName.get('cleanup').endLine, 21, 'function name 与 { 分行')
  assert.ok(!byName.has('who'), 'local 不登记')
  assert.ok(!byName.has('commented'), '注释不产符号')
  assert.ok(!byName.has('fake'), 'heredoc 内容不产符号')
  assert.equal(byName.get('run').endLine, 29, '单行函数块')
})

test('R：函数/类声明、无块体函数与注释/字符串屏蔽', () => {
  const code = [
    '# f <- function() { 1 }',
    "msg <- 'source(\"fake.R\")'",
    'add <- function(x, y) {',
    '  x + y',
    '}',
    '',
    '.helper <- function(x) x + 1',
    '',
    'multi <- function(',
    '  a,',
    '  b',
    ') {',
    '  a * b',
    '}',
    '',
    'block <- function(x)',
    '{',
    '  x',
    '}',
    '',
    'setClass("Person", representation(name = "character"))',
    '',
    'R6Class("Counter",',
    '  public = list(',
    '    initialize = function(value = 0) {',
    '      private$value <- value',
    '    },',
    '    get = function() private$value',
    '  )',
    ')',
    '',
    'outer <- function() {',
    '  inner <- function() 1',
    '  inner()',
    '}',
  ].join('\n')
  const symbols = extractSymbols(code, 'r')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.equal(byName.get('add').kind, 'function')
  assert.equal(byName.get('add').endLine, 5)
  assert.equal(byName.get('add').exported, true)
  assert.equal(byName.get('.helper').exported, false, '. 前缀按 R 约定私有')
  assert.equal(byName.get('.helper').endLine, 7, '无块体单行函数')
  assert.equal(byName.get('multi').endLine, 14, '跨行签名后的块体')
  assert.equal(byName.get('block').endLine, 19, '块体 { 写在下一行')
  assert.equal(byName.get('Person').kind, 'class')
  assert.equal(byName.get('Counter').kind, 'class')
  assert.equal(byName.get('Counter').endLine, 30)
  assert.equal(byName.get('initialize').kind, 'method', 'R6 方法归属类')
  assert.equal(byName.get('initialize').parent, 'Counter')
  assert.equal(byName.get('initialize').exported, false)
  assert.equal(byName.get('initialize').endLine, 27)
  assert.equal(byName.get('get').kind, 'method')
  assert.equal(byName.get('get').parent, 'Counter')
  assert.equal(byName.get('get').endLine, 28, '单行表达式体方法')
  assert.ok(!byName.has('inner'), '函数体内嵌套函数不登记')
  assert.ok(!byName.has('f'), '注释不产符号')
  assert.ok(!byName.has('msg'), '普通赋值不登记')
})

test('Julia：模块/结构体/函数/短函数/宏与 export', () => {
  const code = [
    'module Demo',
    '',
    'export add, Point, greet',
    '',
    '# function commented() end',
    '#= block',
    '   function hidden() end',
    '=#',
    'const MAX_SIZE = 10',
    '',
    '"""',
    'function fake()',
    'end',
    '"""',
    'function add(x::Int, y::Int)',
    '    x + y',
    'end',
    '',
    'struct Point',
    '    x::Float64',
    '    y::Float64',
    'end',
    '',
    'mutable struct Counter',
    '    value::Int',
    'end',
    '',
    'abstract type Shape end',
    '',
    'function Base.show(io::IO, p::Point)',
    '    print(io, p.x)',
    'end',
    '',
    'greet(name) = "Hi $name"',
    '',
    'internal(x) = x[end]',
    '',
    'macro m(ex)',
    '    esc(ex)',
    'end',
    '',
    'function outer()',
    '    inner() = 1',
    '    inner()',
    'end',
    '',
    'end',
  ].join('\n')
  const symbols = extractSymbols(code, 'julia')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.equal(byName.get('Demo').kind, 'class')
  assert.equal(byName.get('Demo').endLine, 47)
  assert.equal(byName.get('MAX_SIZE').kind, 'variable')
  assert.equal(byName.get('MAX_SIZE').exported, false)
  assert.equal(byName.get('add').kind, 'function')
  assert.equal(byName.get('add').endLine, 17)
  assert.equal(byName.get('add').exported, true)
  assert.equal(byName.get('Point').kind, 'class')
  assert.equal(byName.get('Point').endLine, 22)
  assert.equal(byName.get('Point').exported, true)
  assert.equal(byName.get('Counter').kind, 'class')
  assert.equal(byName.get('Counter').endLine, 26)
  assert.equal(byName.get('Shape').kind, 'class')
  assert.equal(byName.get('Shape').endLine, 28)
  assert.equal(byName.get('show').kind, 'method')
  assert.equal(byName.get('show').parent, 'Base')
  assert.equal(byName.get('show').exported, false)
  assert.equal(byName.get('greet').kind, 'function')
  assert.equal(byName.get('greet').exported, true)
  assert.equal(byName.get('internal').exported, false, '未在 export 中的符号')
  assert.equal(byName.get('internal').endLine, 36, '短函数单行，a[end] 不干扰')
  assert.equal(byName.get('m').kind, 'function')
  assert.ok(!byName.has('fake'), '三引号字符串不产符号')
  assert.ok(!byName.has('commented') && !byName.has('hidden'), '注释不产符号')
  assert.ok(!byName.has('inner'), '函数体内嵌套短函数不登记')
})

test('R：S4 泛型与方法符号', () => {
  const code = [
    'setGeneric("area", function(shape) standardGeneric("area"))',
    'setMethod("area", "Circle", function(shape) 3.14)',
    'setMethod("area", signature("Square"), function(shape) 4)',
  ].join('\n')
  const symbols = extractSymbols(code, 'r')
  assert.deepEqual(symbols.map(s => [s.name, s.kind, s.parent]), [
    ['area', 'function', undefined],
    ['area', 'method', 'Circle'],
    ['area', 'method', 'Square'],
  ])
})

test('Julia：@kwdef struct 与 @enum 符号', () => {
  const code = [
    'module Demo',
    '@kwdef struct Config',
    '    name::String',
    '    size::Int',
    'end',
    '',
    'Base.@kwdef mutable struct State',
    '    value::Int = 0',
    'end',
    '',
    '@enum Color::UInt8 red green blue',
    '',
    'export Config, Color',
    'end',
  ].join('\n')
  const symbols = extractSymbols(code, 'julia')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.equal(byName.get('Config').kind, 'class')
  assert.equal(byName.get('Config').endLine, 5, '宏前缀不影响块范围')
  assert.equal(byName.get('State').kind, 'class')
  assert.equal(byName.get('State').endLine, 9)
  assert.equal(byName.get('Color').kind, 'class')
  assert.equal(byName.get('Color').endLine, 11)
  assert.equal(byName.get('Color').exported, true)
  assert.equal(byName.get('red').kind, 'variable')
  assert.equal(byName.get('red').exported, false, '枚举值经类型访问')
  assert.equal(byName.get('blue').line, 11)
})

test('Nim：proc/func/type/const 与缩进范围、* 导出', () => {
  const code = [
    'import std/os',
    '',
    '# proc commented() = discard',
    '#[ proc hidden() = discard ]#',
    '',
    'proc greet*(name: string): string =',
    '  "Hello " & name',
    '',
    'func add(a, b: int): int =',
    '  a + b',
    '',
    'type Person* = object',
    '  name*: string',
    '  age: int',
    '',
    'template twice*(body: untyped) =',
    '  body',
    '  body',
    '',
    'const Version* = "1.0.0"',
    'let runtime = 1',
    '',
    'proc internal() =',
    '  proc nested() = discard',
    '  nested()',
    '',
    'iterator items*(x: int): int =',
    '  yield x',
  ].join('\n')
  const symbols = extractSymbols(code, 'nim')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.equal(byName.get('greet').kind, 'function')
  assert.equal(byName.get('greet').exported, true)
  assert.equal(byName.get('greet').endLine, 8, '缩进体范围')
  assert.equal(byName.get('add').exported, false)
  assert.equal(byName.get('add').endLine, 11)
  assert.equal(byName.get('Person').kind, 'class')
  assert.equal(byName.get('Person').exported, true)
  assert.equal(byName.get('Person').endLine, 15)
  assert.equal(byName.get('twice').endLine, 19)
  assert.equal(byName.get('Version').kind, 'variable')
  assert.equal(byName.get('Version').exported, true)
  assert.equal(byName.get('runtime').exported, false)
  assert.equal(byName.get('internal').endLine, 26)
  assert.equal(byName.get('items').exported, true)
  assert.equal(byName.get('items').endLine, 28)
  assert.ok(!byName.has('commented') && !byName.has('hidden'), '注释不产符号')
  assert.ok(!byName.has('nested'), '嵌套 proc 不登记')
})

test('Nim：type 块成员', () => {
  const code = [
    'type',
    '  Person* = object',
    '    name*: string',
    '    age: int',
    '  Color = enum',
    '    red, green',
    '',
    'proc run*() = discard',
  ].join('\n')
  const symbols = extractSymbols(code, 'nim')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.equal(byName.get('Person').kind, 'class')
  assert.equal(byName.get('Person').exported, true)
  assert.equal(byName.get('Person').endLine, 4)
  assert.equal(byName.get('Color').kind, 'class')
  assert.equal(byName.get('Color').exported, false)
  assert.equal(byName.get('Color').endLine, 7)
  assert.ok(!byName.has('name') && !byName.has('age'), '字段不登记')
  assert.ok(!byName.has('red'), '枚举值不登记')
  assert.equal(byName.get('run').line, 8)
})

test('OCaml：顶层 let/type/module/class/val 与注释字符串屏蔽', () => {
  const code = [
    '(* let hidden = 1 *)',
    'let id x = x',
    '',
    'let greet name = "let fake = 1"',
    'type color = Red | Green',
    "type 'a tree = Leaf",
    'module Util = struct',
    '  let helper x = x + 1',
    'end',
    'exception Boom of string',
    'val run : int -> int',
    'external raw : int -> int = "caml_raw"',
  ].join('\n')
  const symbols = extractSymbols(code, 'ocaml')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.equal(byName.get('id').kind, 'function')
  assert.equal(byName.get('id').endLine, 2)
  assert.equal(byName.get('greet').line, 4)
  assert.equal(byName.get('color').kind, 'class')
  assert.equal(byName.get('tree').kind, 'class')
  assert.ok(!byName.has('hidden'), '注释内声明不登记')
  assert.ok(!byName.has('fake'), '字符串内声明不登记')
  assert.ok(!byName.has('helper'), '模块体内部不登记')
  assert.equal(byName.get('Util').kind, 'class')
  assert.equal(byName.get('Util').endLine, 9)
  assert.equal(byName.get('Boom').kind, 'type')
  assert.equal(byName.get('run').kind, 'function')
  assert.equal(byName.get('raw').kind, 'function')
  assert.equal(byName.get('run').endLine, 11)
})

test('OCaml：let rec、let%ppx、属性、class 与私有前缀', () => {
  const code = [
    'let rec loop n =',
    '  if n = 0 then 0 else loop (n - 1)',
    '',
    'let[@inline] fast x = x',
    'let%lwt fetch url = return url',
    'class counter = object',
    '  val mutable count = 0',
    'end',
    'let _private = 1',
  ].join('\n')
  const symbols = extractSymbols(code, 'ocaml')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.equal(byName.get('loop').kind, 'function')
  assert.equal(byName.get('loop').endLine, 2)
  assert.equal(byName.get('fast').kind, 'function')
  assert.equal(byName.get('fetch').kind, 'function')
  assert.equal(byName.get('counter').kind, 'class')
  assert.equal(byName.get('counter').endLine, 8)
  assert.equal(byName.get('_private').exported, false)
})

test('OCaml：and 续接与原始字符串屏蔽（含跨行）', () => {
  const code = [
    'let rec even n = n = 0 || odd (n - 1)',
    'and odd n = n <> 0 && even (n - 1)',
    'type a = A',
    'and b = B',
    "let query = {sql| select \"x\" (* not a comment *) |sql}",
    'let doc = {html|',
    '  <p>(* also not a comment *)</p>',
    '|html}',
    'let after = 1',
  ].join('\n')
  const symbols = extractSymbols(code, 'ocaml')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.equal(byName.get('even').kind, 'function')
  assert.equal(byName.get('even').endLine, 1)
  assert.equal(byName.get('odd').kind, 'function')
  assert.equal(byName.get('odd').line, 2)
  assert.equal(byName.get('a').kind, 'class')
  assert.equal(byName.get('b').kind, 'class')
  assert.equal(byName.get('b').line, 4)
  assert.equal(byName.get('query').line, 5)
  assert.equal(byName.get('doc').endLine, 8, '原始字符串体内注释标记不截断')
  assert.equal(byName.get('after').line, 9)
})

test('Haskell：module/data/newtype/type/class 与签名定义合并', () => {
  const code = [
    '-- data Hidden = Hidden',
    '{- newtype Blocked = Blocked -}',
    'module Demo.Core (foo, Bar) where',
    'import Data.Text (Text)',
    'data Bar = Bar { value :: Int }',
    'newtype Wrap a = Wrap a',
    'type Alias = Int',
    'class Describe a where',
    '  describe :: a -> String',
    'foo :: Int -> Int',
    'foo x = x + 1',
    'helper y = y',
    '(<+>) :: Int -> Int -> Int',
    'a <+> b = a + b',
  ].join('\n')
  const symbols = extractSymbols(code, 'haskell')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.equal(byName.get('Demo.Core').kind, 'class')
  assert.equal(byName.get('Demo.Core').endLine, 14, '模块覆盖整个文件')
  assert.equal(byName.get('Bar').kind, 'class')
  assert.equal(byName.get('Wrap').kind, 'class')
  assert.equal(byName.get('Alias').kind, 'class')
  assert.equal(byName.get('Describe').kind, 'class')
  assert.equal(byName.get('describe').kind, 'method')
  assert.equal(byName.get('describe').parent, 'Describe')
  assert.ok(!byName.has('Hidden') && !byName.has('Blocked'), '注释内声明不登记')
  assert.equal(byName.get('foo').kind, 'function')
  assert.equal(byName.get('foo').line, 10)
  assert.equal(byName.get('foo').endLine, 11, '签名与定义合并范围')
  assert.equal(byName.get('helper').line, 12)
  assert.equal(byName.get('<+>').line, 13)
  assert.equal(byName.get('<+>').endLine, 14)
  assert.ok(!byName.has('a'), '中缀操作符定义不登记首操作数')
})

test('Haskell：类方法与多行签名', () => {
  const code = [
    'class Describe a where',
    '  describe',
    '    :: a -> String',
    '  describe x = "x"',
    'render',
    '  :: Int -> String',
    'render n = show n',
  ].join('\n')
  const symbols = extractSymbols(code, 'haskell')
  const describe = symbols.find(s => s.name === 'describe')
  assert.equal(describe.kind, 'method')
  assert.equal(describe.parent, 'Describe')
  assert.equal(describe.line, 2)

  const render = symbols.find(s => s.name === 'render')
  assert.equal(render.kind, 'function')
  assert.equal(render.line, 5)
  assert.equal(render.endLine, 7)
})

test('Haskell：模块导出列表限制可见性', () => {
  const code = [
    'module Demo (run, Internal(..)) where',
    '',
    'run :: Int -> Int',
    'run x = x',
    '',
    'data Internal = Internal',
    '',
    'hidden = 1',
  ].join('\n')
  const symbols = extractSymbols(code, 'haskell')
  const byName = new Map(symbols.map(s => [s.name, s]))
  assert.equal(byName.get('run').exported, true)
  assert.equal(byName.get('Internal').exported, true)
  assert.equal(byName.get('hidden').exported, false, '未列入导出列表')
})

test('Haskell：多行导出列表与操作符', () => {
  const code = [
    'module Demo',
    '  ( run',
    '  , (<+>)',
    '  , module Data.List',
    '  ) where',
    '',
    'run = 1',
    'a <+> b = a + b',
    'other = 2',
  ].join('\n')
  const symbols = extractSymbols(code, 'haskell')
  const byName = new Map(symbols.map(s => [s.name, s]))
  assert.equal(byName.get('run').exported, true)
  assert.equal(byName.get('<+>').exported, true)
  assert.equal(byName.get('other').exported, false)
})

test('Erlang：module/record/type/define/函数与 export 可见性', () => {
  const code = [
    '%% -module(hidden).',
    '-module(demo).',
    '-export([run/1, init/0]).',
    '',
    '-record(state, {count = 0}).',
    '-type result() :: ok | error.',
    '-opaque handle() :: reference().',
    '-define(TIMEOUT, 5000).',
    '',
    'run(X) ->',
    '    X + 1.',
    '',
    'init() ->',
    '    ok;',
    'init(Arg) ->',
    '    Arg.',
    '',
    'private() -> ok.',
    '',
    'double(1) -> 2;',
    'double(2) -> 4.',
  ].join('\n')
  const symbols = extractSymbols(code, 'erlang')
  const byName = new Map(symbols.map(s => [s.name, s]))
  assert.equal(byName.get('demo').kind, 'class')
  assert.equal(byName.get('demo').exported, true)
  assert.equal(byName.get('state').kind, 'class')
  assert.equal(byName.get('state').exported, false, '未导出记录')
  assert.equal(byName.get('result').kind, 'type')
  assert.equal(byName.get('handle').kind, 'type')
  assert.equal(byName.get('TIMEOUT').kind, 'variable')
  assert.equal(byName.get('run').kind, 'function')
  assert.equal(byName.get('run').exported, true)
  assert.equal(byName.get('run').endLine, 11)
  assert.equal(byName.get('init').exported, true)
  assert.equal(byName.get('init').endLine, 16, '多子句范围')
  assert.equal(byName.get('private').exported, false)
  assert.equal(byName.get('double').exported, false)
  assert.equal(byName.get('double').endLine, 21)
  assert.ok(!byName.has('hidden'), '注释内 module 不登记')
})

test('Solidity：contract/函数/事件/结构体与可见性', () => {
  const code = [
    'pragma solidity ^0.8.20;',
    '// contract Hidden {}',
    'import "./IERC20.sol";',
    'interface IERC20 {',
    '    function transfer(address to, uint256 amount) external returns (bool);',
    '}',
    'contract Token {',
    '    event Transfer(address indexed from, address indexed to, uint256 value);',
    '    struct Account { uint256 balance; }',
    '    uint256 private total;',
    '    constructor() { total = 0; }',
    '    function mint(uint256 amount) public {',
    '        total += amount;',
    '    }',
    '    function _burn(uint256 amount) internal {',
    '        total -= amount;',
    '    }',
    '}',
  ].join('\n')
  const symbols = extractSymbols(code, 'solidity')
  const byName = new Map(symbols.map(s => [s.name, s]))
  assert.equal(byName.get('IERC20').kind, 'class')
  assert.equal(byName.get('Token').kind, 'class')
  assert.equal(byName.get('Token').endLine, 18)
  assert.equal(byName.get('Transfer').kind, 'type')
  assert.equal(byName.get('Transfer').parent, 'Token')
  assert.equal(byName.get('Account').kind, 'class')
  assert.equal(byName.get('mint').kind, 'method')
  assert.equal(byName.get('mint').exported, true)
  assert.equal(byName.get('_burn').exported, false, 'internal 非导出')
  assert.equal(byName.get('constructor').kind, 'method')
  assert.ok(!byName.has('Hidden'), '注释内合约不登记')
})

test('Clojure：ns/defn/def/defrecord/defprotocol 与括号范围', () => {
  const code = [
    '; (defn hidden [] 1)',
    '(ns app.core',
    '  (:require [app.util :as util]))',
    '',
    '(defn greet',
    '  [name]',
    '  (str "Hello " name))',
    '',
    '(defn- private-fn [x] x)',
    '',
    '(def config {:port 8080})',
    '',
    '(defrecord User [id name])',
    '(defprotocol Store',
    '  (save [this item]))',
    '(defmulti handle :type)',
    '(defmethod handle :ok [m] m)',
    '(comment',
    '  (defn commented [] 1))',
  ].join('\n')
  const symbols = extractSymbols(code, 'clojure')
  const byName = new Map(symbols.map(s => [s.name, s]))
  assert.equal(byName.get('app.core').kind, 'class')
  assert.equal(byName.get('greet').kind, 'function')
  assert.equal(byName.get('greet').line, 5)
  assert.equal(byName.get('greet').endLine, 7)
  assert.equal(byName.get('private-fn').exported, false)
  assert.equal(byName.get('config').kind, 'variable')
  assert.equal(byName.get('User').kind, 'class')
  assert.equal(byName.get('Store').kind, 'class')
  assert.equal(byName.get('handle').kind, 'function')
  assert.ok(!byName.has('hidden'), '注释内声明不登记')
  assert.ok(!byName.has('commented'), 'comment 形式整体跳过')
})

test('HCL：resource/data/module/variable 与块范围', () => {
  const code = [
    '# resource "hidden" "x" {}',
    'terraform {',
    '  required_version = ">= 1.5"',
    '}',
    '',
    'provider "aws" {',
    '  region = "us-east-1"',
    '}',
    '',
    'resource "aws_instance" "web" {',
    '  ami = "ami-123"',
    '  lifecycle {',
    '    prevent_destroy = true',
    '  }',
    '}',
    '',
    'data "aws_ami" "ubuntu" {',
    '  most_recent = true',
    '}',
    '',
    'module "vpc" {',
    '  source = "./modules/vpc"',
    '}',
    '',
    'variable "region" {}',
    'output "id" { value = "x" }',
    'locals { a = 1 }',
  ].join('\n')
  const symbols = extractSymbols(code, 'hcl')
  const byName = new Map(symbols.map(s => [s.name, s]))
  assert.equal(byName.get('terraform').kind, 'class')
  assert.equal(byName.get('aws').kind, 'class')
  assert.equal(byName.get('aws_instance.web').kind, 'class')
  assert.equal(byName.get('aws_instance.web').endLine, 15)
  assert.equal(byName.get('aws_ami.ubuntu').kind, 'class')
  assert.equal(byName.get('vpc').kind, 'class')
  assert.equal(byName.get('region').kind, 'variable')
  assert.equal(byName.get('id').kind, 'variable')
  assert.equal(byName.get('locals').kind, 'variable')
  assert.ok(!byName.has('lifecycle'), '嵌套块不登记')
  assert.ok(!byName.has('hidden'), '注释内块不登记')
})

test('Groovy：class/trait/方法/脚本函数与可见性', () => {
  const code = [
    '// class Hidden {}',
    'class Pipeline {',
    '    String name',
    '    def run(String cmd) {',
    '        sh cmd',
    '    }',
    '    private void secret() {}',
    '    static Pipeline create() { return null }',
    '}',
    '',
    'trait Loggable {',
    '    def log(msg) { println msg }',
    '}',
    '',
    'def deploy(env) {',
    '    echo env',
    '}',
  ].join('\n')
  const symbols = extractSymbols(code, 'groovy')
  const byName = new Map(symbols.map(s => [s.name, s]))
  assert.equal(byName.get('Pipeline').kind, 'class')
  assert.equal(byName.get('Pipeline').endLine, 9)
  assert.equal(byName.get('run').kind, 'method')
  assert.equal(byName.get('run').parent, 'Pipeline')
  assert.equal(byName.get('secret').exported, false)
  assert.equal(byName.get('create').kind, 'method')
  assert.equal(byName.get('Loggable').kind, 'class')
  assert.equal(byName.get('log').kind, 'method')
  assert.equal(byName.get('deploy').kind, 'function')
  assert.ok(!byName.has('Hidden'), '注释内类不登记')
})

test('PowerShell：function/filter/class/enum 与类内方法、作用域可见性', () => {
  const code = [
    '# function FakeComment { }',
    '<#',
    'function FakeBlock { }',
    '#>',
    "$here = @'",
    'function FakeHere { }',
    "'@",
    'function Get-Thing {',
    '    param($x)',
    '    Write-Output "}"',
    '}',
    'function private:Get-Secret { }',
    'function script:Invoke-Build($name) { }',
    'filter Select-Thing { $_ }',
    'class Widget {',
    '    [string]$Name',
    '    [OutputType([string])]',
    '    [string] Render() {',
    '        return "}"',
    '    }',
    '    hidden [void] Reset() { }',
    '    static [Widget] Create() { return $null }',
    '    Widget() { }',
    '}',
    'enum Color { Red, Blue }',
    'configuration ServerConfig { }',
  ].join('\n')
  const symbols = extractSymbols(code, 'powershell')
  const byName = new Map(symbols.map(s => [s.name, s]))

  assert.equal(byName.get('Get-Thing').kind, 'function')
  assert.equal(byName.get('Get-Thing').exported, true)
  assert.equal(byName.get('Get-Thing').endLine, 11)
  assert.equal(byName.get('Get-Secret').exported, false, 'private: 作用域非导出')
  assert.equal(byName.get('Invoke-Build').exported, true, 'script: 作用域仍导出')
  assert.equal(byName.get('Select-Thing').kind, 'function', 'filter')
  const widget = symbols.find(s => s.name === 'Widget' && s.kind === 'class')
  assert.equal(widget.kind, 'class')
  assert.equal(widget.endLine, 24)
  assert.equal(byName.get('Render').kind, 'method')
  assert.equal(byName.get('Render').parent, 'Widget')
  assert.equal(byName.get('Render').endLine, 20, '字符串内花括号不越过方法边界')
  assert.equal(byName.get('Reset').exported, false, 'hidden 成员非导出')
  assert.equal(byName.get('Create').kind, 'method')
  assert.ok(symbols.some(s => s.name === 'Widget' && s.kind === 'method' && s.parent === 'Widget'), '构造器')
  assert.equal(byName.get('Color').kind, 'class')
  assert.equal(byName.get('ServerConfig').kind, 'function')
  assert.ok(!byName.has('FakeComment'), '行注释不登记')
  assert.ok(!byName.has('FakeBlock'), '块注释不登记')
  assert.ok(!byName.has('FakeHere'), 'here-string 不登记')
})

test('Svelte：模块脚本与实例脚本分别保留行号', () => {
  const code = [
    '<script context="module" lang="ts">',
    'export function loadData() { return 1 }',
    '</script>',
    '',
    '<script lang="ts">',
    'export let count = 0',
    'const increment = () => { count += 1 }',
    '</script>',
    '',
    '<button on:click={increment}>{count}</button>',
  ].join('\n')
  const symbols = extractSymbols(code, 'svelte')
  assert.deepEqual(symbols.map(s => [s.name, s.kind, s.line]), [
    ['loadData', 'function', 2],
    ['count', 'variable', 6],
    ['increment', 'function', 7],
  ])
  assert.ok(symbols.every(s => typeof s.endLine === 'number' && s.endLine >= s.line))
})
