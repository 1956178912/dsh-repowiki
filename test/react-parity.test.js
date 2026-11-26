// devOnly React 与宿主前端 bundle 内嵌版本的一致性守卫。
// 背景：client.js 运行时用宿主的 React（浏览器模块表），测试侧的
// react/react-dom devDependency 只为提供同一 API 面——若宿主升级到
// React 19 而 devDep 仍 18，测试与运行时行为可能分叉。本测试从
// app.asar 内 dsh-web-frontend 的 dist bundle 提取内嵌版本号比对。
// 无 app.asar（CI）时跳过。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findAsarPath, readAsarIndex, readAsarFile } from '../scripts/verify-host-tokens.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

test('devOnly react 版本与宿主前端 bundle 内嵌版本一致', () => {
  const asar = findAsarPath()
  if (!asar) {
    console.log('跳过：本机未找到 app.asar（CI 正常）')
    return
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  // devDependency 形如 ^18.3.1，取其版本字面量
  const ours = String(pkg.devDependencies?.react ?? '').replace(/^[^\d]*/, '')
  assert.ok(/^\d+\.\d+\.\d+$/.test(ours), `devDependencies.react 应为可解析版本：${ours}`)

  const { base, files } = readAsarIndex(asar)
  const bundles = files.filter((f) =>
    /dsh-web-frontend\/dist\/assets\/.*\.js$/.test(f.path)
    && /^(index|vendor)-/.test(path.basename(f.path)))
  assert.ok(bundles.length > 0, '应找到宿主前端 index/vendor bundle')

  const versions = new Set()
  for (const f of bundles) {
    const t = readAsarFile(asar, f, base)
    for (const m of t.matchAll(/["']((?:1[6-9])\.\d+\.\d+)["']/g)) versions.add(m[1])
  }
  assert.ok(versions.has(ours),
    `宿主 bundle 未发现我们的 react ${ours}（发现：${[...versions].slice(0, 10).join(', ')}）——` +
    '宿主已升级 React 主版本，需同步 devOnly devDependencies')
})
