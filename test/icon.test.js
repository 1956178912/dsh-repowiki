// 图标守卫：icon.svg（插件管理页/设置行）遵循官方 artwork 约定——
// 36x36 画布、主题元素不画全出血 tile、无 text/字体/脚本/样式/动画/图片、
// 渐变/遮罩/裁剪引用本地且唯一命名；client.js 侧栏图标使用 currentColor。
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

test('icon.svg 满足官方 artwork 约定', () => {
  const svg = fs.readFileSync(path.join(ROOT, 'icon.svg'), 'utf8')
  assert.match(svg, /width="36" height="36" viewBox="0 0 36 36"/, '应为 36x36 viewBox')
  for (const banned of ['<text', '<font', '<script', '<style', 'foreignObject', '<animate', '<image']) {
    assert.ok(!svg.includes(banned), `图标不得包含 ${banned}（保持自包含）`)
  }
  assert.ok(!svg.includes('href="http'), '图标不得引用远程资源')
  assert.ok(svg.length < 256 * 1024, '图标不得超 256KiB（Host 上限）')
  // 渐变/遮罩/裁剪 id 必须本地且唯一命名（官方: uniquely named references）
  const ids = [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
  assert.equal(new Set(ids).size, ids.length, 'id 必须唯一')
  for (const id of ids) assert.ok(/^[-\w]+$/.test(id), `id 应为简单本地名: ${id}`)
})

test('client.js 侧栏图标使用 currentColor 且无背景 tile', () => {
  const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  const m = src.match(/function RepoWikiIcon\(\{ size \}\)[\s\S]*?\n    \}/)
  assert.ok(m, '应存在 RepoWikiIcon 组件')
  const body = m[0]
  assert.ok(body.includes("stroke: 'currentColor'"), '侧栏图标应用 currentColor 随主题适配')
  assert.ok(!body.includes("fill: '#2563eb'") && !body.includes('#93c5fd'), '不得残留旧的固定配色')
  assert.ok(body.includes("viewBox: '0 0 24 24'"), '应为 24x24 字形画布')
  assert.ok(body.includes('aria-hidden'), '纯装饰图标需 aria-hidden')
})
