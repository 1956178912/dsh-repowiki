/**
 * 技术栈识别单元测试。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { detectStack } from '../src/stack.js'

test('package.json：项目元数据 + 常规/scoped 依赖识别 + 去重', () => {
  const pkg = JSON.stringify({
    name: 'demo-app',
    version: '1.2.3',
    dependencies: { react: '^18', '@nestjs/core': '^10', axios: '^1' },
    devDependencies: { vitest: '^1', 'react': '^18' }, // 与 dependencies 重复
  })
  const info = detectStack({ 'package.json': pkg })
  assert.equal(info.projectName, 'demo-app')
  assert.equal(info.projectVersion, '1.2.3')
  assert.equal(info.dependencyCounts.npm, 4)
  const names = info.technologies.map(t => t.name)
  assert.ok(names.includes('React'))
  assert.ok(names.includes('NestJS'), 'scoped 包按精确名命中')
  assert.ok(names.includes('Axios'))
  assert.ok(names.includes('Vitest'))
  // 同一技术来自 deps+devDeps 只计一次
  assert.equal(names.filter(n => n === 'React').length, 1)
})

test('requirements.txt：版本约束剥离与常见包识别', () => {
  const reqs = [
    '# 注释行',
    'django==4.2.0',
    'fastapi>=0.100',
    'requests>=2,<3',
    'unknown-pkg-xyz ; python_version>"3.8"',
    'pytest',
  ].join('\n')
  const info = detectStack({ 'requirements.txt': reqs })
  const names = info.technologies.map(t => t.name)
  assert.ok(names.includes('Django'))
  assert.ok(names.includes('FastAPI'))
  assert.ok(names.includes('Requests'))
  assert.ok(names.includes('pytest'))
  assert.ok(!names.some(n => n.includes('unknown')), '未命中映射不产生技术条目')
})

test('go.mod：require 块与单行 require 均可识别', () => {
  const goMod = [
    'module example.com/demo',
    'go 1.22',
    'require (',
    '\tgithub.com/gin-gonic/gin v1.9',
    '\tgithub.com/spf13/cobra v1.8',
    ')',
    'require github.com/stretchr/testify v1.9',
  ].join('\n')
  const info = detectStack({ 'go.mod': goMod })
  const names = info.technologies.map(t => t.name)
  assert.ok(names.includes('Gin'))
  assert.ok(names.includes('Cobra'))
  assert.ok(names.includes('testify'), '单行 require 也识别')
})

test('Cargo.toml：[dependencies] 段 crate 识别', () => {
  const cargo = [
    '[dependencies]',
    'tokio = { version = "1", features = ["full"] }',
    'serde = "1"',
    'reqwest = "0.12"',
    '',
    '[dev-dependencies]',
    'criterion = "0.5"',
  ].join('\n')
  const info = detectStack({ 'Cargo.toml': cargo })
  const names = info.technologies.map(t => t.name)
  assert.ok(names.includes('Tokio'))
  assert.ok(names.includes('Serde'))
  assert.ok(names.includes('Reqwest'))
  assert.ok(!names.includes('criterion'), '表外 crate 不误识别')
})

test('多清单混合：生态不串扰', () => {
  const info = detectStack({
    'package.json': JSON.stringify({ dependencies: { vue: '^3' } }),
    'requirements.txt': 'flask\n',
  })
  const names = info.technologies.map(t => t.name)
  assert.ok(names.includes('Vue'))
  assert.ok(names.includes('Flask'))
})

test('坏 JSON 与空清单不抛异常', () => {
  const info = detectStack({ 'package.json': '{not json' })
  assert.deepEqual(info.technologies, [])
})
