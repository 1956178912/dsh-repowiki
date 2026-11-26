// 打包完整性守卫：`npm pack` 产物必须含全部运行时文件、排除开发文件。
// 背景：package.json 的 files 字段是手工维护的，若新增 src 模块或 locale
// 后忘记加入，安装方会静默缺文件。CI 每次跑此测试即覆盖供应链一致性。
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

/** 取 npm pack --dry-run 的文件清单（不落盘）。 */
function packFiles() {
  const res = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(res.status, 0, `npm pack 失败：${res.stderr}`)
  const entries = JSON.parse(res.stdout)
  return new Set(entries[0].files.map((f) => f.path))
}

// 运行时必需文件：入口、客户端、loader patch、图标、locale、全部 src 模块、详情页
const required = [
  'index.js', 'client.js', 'cordis.patch.yml', 'icon.svg',
  'locale/en.json', 'locale/zh.json',
  'docs/detail/DETAIL.md', 'docs/detail/DETAIL.zh.md', 'docs/detail/preview.svg',
  ...fs.readdirSync(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js')).map((f) => `src/${f}`),
]
// 开发态文件不应进包：测试、脚本、内部文档、CI、门面 CHANGELOG
const forbidden = [
  'test', 'scripts', '.github', 'CHANGELOG.md', 'CHANGELOG.zh-CN.md', 'package-lock.json',
  'docs/adr', 'docs/checkpoints', 'docs/coverage.md', 'docs/ui-plan.md',
]

test('npm pack 产物含全部运行时文件', () => {
  const files = packFiles()
  const missing = required.filter((f) => !files.has(f))
  assert.deepEqual(missing, [], `pack 缺失运行时文件：${missing.join(', ')}`)
})

test('npm pack 产物排除开发态文件', () => {
  const files = packFiles()
  const leaked = forbidden.filter((f) => [...files].some((p) => p === f || p.startsWith(f + '/')))
  assert.deepEqual(leaked, [], `pack 泄漏开发文件：${leaked.join(', ')}`)
})

test('package.json 声明的导出均指向包内已打包文件', () => {
  const files = packFiles()
  const exportPaths = [
    pkg.main,
    ...(pkg.exports && pkg.exports['./client'] ? [pkg.exports['./client']] : []),
  ].filter(Boolean)
  for (const p of exportPaths) {
    const rel = p.replace(/^\.\//, '')
    assert.ok(files.has(rel), `exports 指向的 ${rel} 应在 pack 产物中`)
  }
  assert.deepEqual(pkg.dependencies || {}, {}, '运行时应保持零 npm 依赖')
  assert.equal(files.has('package.json'), true)
})

test('版本一致性：package.json 与两份 CHANGELOG 最新条目一致', () => {
  const v = pkg.version
  for (const f of ['CHANGELOG.md', 'CHANGELOG.zh-CN.md']) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8')
    const m = text.match(/^## \[([^\]]+)\] -/m)
    assert.ok(m, `${f} 应含 ## [x.y.z] 版本条目`)
    assert.equal(m[1], v, `${f} 最新条目应为 ${v}（发布前 CHANGELOG 漏更新是真实漂移源）`)
  }
})
