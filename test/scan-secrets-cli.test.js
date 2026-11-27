/**
 * 密钥扫描脚本的 CLI 端到端测试：干净仓库通过，跳过规则（清单/二进制/超大文件）
 * 生效，真实泄露以非零退出码失败。
 */

import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(__dirname, '..', 'scripts', 'scan-secrets.mjs')

/**
 * 在仓库外跑脚本。
 * @param {string} cwd - 工作目录。
 * @param {string} script - 脚本绝对路径。
 * @returns {import('node:child_process').SpawnSyncReturns<string>} 结果。
 */
function run(cwd, script = SCRIPT) {
  return spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' })
}

test('scan-secrets CLI：干净仓库通过，跳过规则与泄露检测生效', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-secrets-'))
  try {
    const init = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' })
    if (init.status !== 0) {
      t.skip('git 不可用')
      return
    }
    // 干净文件 + 三类跳过项：锁文件、二进制（含 NUL）、超过 1MiB 的大文件
    fs.writeFileSync(path.join(dir, 'README.md'), '# clean\n')
    fs.writeFileSync(path.join(dir, 'package-lock.json'), `sk-${'a'.repeat(40)}\n`)
    fs.writeFileSync(path.join(dir, 'asset.bin'), Buffer.from([0, 1, 2, 0x41]))
    fs.writeFileSync(path.join(dir, 'big.txt'), `sk-${'b'.repeat(40)}\n${'x'.repeat(1024 * 1024)}`)
    spawnSync('git', ['add', '-A'], { cwd: dir, encoding: 'utf8' })

    const clean = run(dir)
    assert.equal(clean.status, 0, clean.stderr)
    assert.match(clean.stdout, /clean/)

    // 真实泄露：私钥头 -> 退出 1 且指名文件与模式
    fs.writeFileSync(path.join(dir, 'leak.txt'), '-----BEGIN ' + 'RSA PRIVATE KEY-----\n')
    spawnSync('git', ['add', '-A'], { cwd: dir, encoding: 'utf8' })
    const leak = run(dir)
    assert.equal(leak.status, 1)
    assert.match(leak.stderr, /leak\.txt: private-key/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
