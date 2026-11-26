// 漂移自检脚本自身的测试：构造合成 asar 夹具，直接驱动
// scripts/verify-host-tokens.mjs 的通过/缺失/无深色变体三条路径。
// 背景该脚本此前只在"本机有真实 app.asar"时被 exercise，CI 里永远跳过——
// 它自己的逻辑（header 解析、offset 换算、令牌收集）没有任何回归保护。
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SCRIPT = path.join(ROOT, 'scripts', 'verify-host-tokens.mjs')
const CLIENT = path.join(ROOT, 'client.js')

/** 与脚本同法从 client.js 收集 --dsw-* 令牌名（夹具自维护）。 */
function clientTokens() {
  const src = fs.readFileSync(CLIENT, 'utf8')
  return [...new Set([...src.matchAll(/var\(\s*(--dsw-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?=[,)\s])/g)].map((m) => m[1]))].sort()
}

/** 构造最小 asar：[4][headerSize][headerJSON][文件内容拼接]。 */
function makeAsar(entries) {
  const header = { files: {} }
  let offset = 0
  const chunks = []
  for (const [p, content] of entries) {
    const b = Buffer.from(content, 'utf8')
    const parts = p.split('/')
    let node = header
    for (let i = 0; i < parts.length - 1; i++) {
      node.files[parts[i]] = node.files[parts[i]] || { files: {} }
      node = node.files[parts[i]]
    }
    node.files[parts[parts.length - 1]] = { size: b.length, offset: String(offset) }
    chunks.push(b)
    offset += b.length
  }
  const hj = Buffer.from(JSON.stringify(header), 'utf8')
  const pre = Buffer.alloc(8)
  pre.writeUInt32LE(4, 0)
  pre.writeUInt32LE(hj.length, 4)
  return Buffer.concat([pre, hj, ...chunks])
}

const THEME_CSS = 'dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/src/styles/design-platform.css'

/** 造一份主题 CSS：每个令牌 defs 次，可整体缺一个、可去深色选择器。 */
function themeCss(tokens, { defs = 2, drop = null, withDark = true } = {}) {
  const lines = []
  for (const t of tokens) {
    if (t === drop) continue
    for (let i = 0; i < defs; i++) {
      if (i === 1 && withDark) lines.push('body[data-ds-dark-theme] {')
      lines.push(`  ${t}: rgb(1, 2, 3);`)
      if (i === 1 && withDark) lines.push('}')
    }
  }
  return lines.join('\n')
}

function runWith(fixturePath) {
  return spawnSync(process.execPath, [SCRIPT, '--json'], {
    encoding: 'utf8',
    env: { ...process.env, DSH_APP_ASAR: fixturePath },
  })
}

test('漂移自检：合成 asar 全量令牌 + 深色变体 → pass', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-fixture-'))
  try {
    const p = path.join(tmp, 'app.asar')
    fs.writeFileSync(p, makeAsar([[THEME_CSS, themeCss(clientTokens())]]))
    const res = runWith(p)
    assert.equal(res.status, 0, res.stderr)
    const j = JSON.parse(res.stdout)
    assert.equal(j.status, 'pass')
    assert.deepEqual(j.missing, [])
    assert.deepEqual(j.noDark, [])
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('漂移自检：缺一个令牌 → fail 且 missing 指名', () => {
  const tokens = clientTokens()
  const victim = tokens[0]
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-fixture-'))
  try {
    const p = path.join(tmp, 'app.asar')
    fs.writeFileSync(p, makeAsar([[THEME_CSS, themeCss(tokens, { drop: victim })]]))
    const res = runWith(p)
    assert.equal(res.status, 1)
    const j = JSON.parse(res.stdout)
    assert.equal(j.status, 'fail')
    assert.deepEqual(j.missing, [victim])
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('漂移自检：令牌只定义一次（无深色变体）→ fail 且 noDark 指名', () => {
  const tokens = clientTokens()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-fixture-'))
  try {
    const p = path.join(tmp, 'app.asar')
    fs.writeFileSync(p, makeAsar([[THEME_CSS, themeCss(tokens, { defs: 1 })]]))
    const res = runWith(p)
    assert.equal(res.status, 1)
    const j = JSON.parse(res.stdout)
    assert.equal(j.status, 'fail')
    assert.ok(j.noDark.length > 0, '应报告无深色变体的令牌')
    assert.deepEqual(j.missing, [])
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
