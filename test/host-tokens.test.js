// 宿主令牌漂移自检：本地解析 app.asar 核对 client.js 引用的 --dsw-alias-*
// 令牌；CI 等无宿主环境以 exit=3 跳过。
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(__dirname, '..', 'scripts', 'verify-host-tokens.mjs')

test('宿主主题令牌自检：client.js 引用的令牌在官方 CSS 有定义且有深色变体', () => {
  const res = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  if (res.status === 3) {
    // 无 app.asar（CI/未安装宿主）：跳过而非失败
    console.log(`跳过：${res.stdout.trim()}`)
    return
  }
  assert.equal(res.status, 0, `自检失败（exit=${res.status}）\n${res.stdout}\n${res.stderr}`)
  assert.match(res.stdout, /全部令牌存在；alias 令牌带深色重定义/)
})
