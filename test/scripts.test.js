/**
 * 工程脚本单测：覆盖率解析、密钥扫描、版本 bump。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCoverage, checkThresholds } from '../scripts/check-coverage.mjs'
import { scanText } from '../scripts/scan-secrets.mjs'
import { bumpVersion } from '../scripts/release.mjs'

test('parseCoverage：解析 node:test 汇总行', () => {
  const out = 'ℹ all files               |  96.43 |    82.46 |   89.34 |'
  assert.deepEqual(parseCoverage(out), { lines: 96.43, branches: 82.46, functions: 89.34 })
  assert.equal(parseCoverage('no summary'), null)
})

test('checkThresholds：低于阈值列出全部失败项', () => {
  assert.deepEqual(checkThresholds({ lines: 99, branches: 90, functions: 95 }), [])
  assert.deepEqual(checkThresholds({ lines: 90, branches: 80, functions: 70 }), [
    'lines 90% < 95%',
    'branches 80% < 85%',
    'functions 70% < 85%',
  ])
})

test('scanText：命中高置信度密钥、忽略普通文本', () => {
  assert.deepEqual(scanText('token = "sk-' + 'a'.repeat(40) + '"'), ['openai-key'])
  assert.deepEqual(scanText('AKIA' + 'A'.repeat(16)), ['aws-access-key'])
  assert.deepEqual(scanText('-----BEGIN ' + 'RSA PRIVATE KEY-----'), ['private-key'])
  assert.deepEqual(scanText('normal documentation text'), [])
})

test('bumpVersion：patch/minor/major 与非法输入', () => {
  assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4')
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0')
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0')
  assert.throws(() => bumpVersion('1.2', 'patch'), /invalid version/)
  assert.throws(() => bumpVersion('1.2.3', 'nope'), /invalid release type/)
})
