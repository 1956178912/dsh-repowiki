// 门面一致性：locale 元数据（插件管理页展示的标题/描述/详情页）必须双语齐全、
// 描述覆盖 8 个工具、detail 文档与特性图满足官方 plugin-details 约定。
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

test('locale 元数据：双语 locale 文件合法且描述覆盖 8 个工具', () => {
  const langs = ['en', 'zh']
  const metas = {}
  for (const lang of langs) {
    const raw = fs.readFileSync(path.join(ROOT, 'locale', `${lang}.json`), 'utf8')
    const j = JSON.parse(raw)
    assert.ok(j.meta && j.meta.title && j.meta.description && j.meta.detail,
      `${lang}.json 必须含 meta.title/description/detail`)
    metas[lang] = j.meta
  }
  const tools = ['index', 'cards', 'extract', 'generate', 'edit', 'export', 'import', 'memory']
  for (const lang of langs) {
    for (const t of tools) assert.ok(metas[lang].description.includes(`repowiki-${t}`),
      `${lang} 描述应提及 repowiki-${t}`)
  }
})

test('详情页：detail 文档恰为一行图片引用且图片存在、满足官方约定', () => {
  for (const lang of ['en', 'zh']) {
    const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'locale', `${lang}.json`), 'utf8')).meta
    assert.ok(/\.(md|markdown)$/.test(meta.detail), `${lang} detail 路径应以 .md/.markdown 结尾`)
    const docPath = path.join(ROOT, meta.detail)
    assert.ok(fs.existsSync(docPath), `${lang} detail 文档必须存在（缺失是错误而非 README 回退）`)
    // 文档恰为一行 ![alt](image)
    const lines = fs.readFileSync(docPath, 'utf8').trim().split('\n').filter((l) => l.trim())
    assert.equal(lines.length, 1, `${lang} detail 文档应恰为一行图片`)
    const m = lines[0].match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    assert.ok(m, `${lang} detail 应为 ![alt](image) 形式`)
    assert.ok(m[1].length > 0, `${lang} 图片应有替代文本`)
    const imgPath = path.join(path.dirname(docPath), m[2])
    assert.ok(fs.existsSync(imgPath), `${lang} 图片文件必须存在`)
    // SVG 约定：640x300、无 text/字体/脚本/样式/foreignObject、自包含
    const svg = fs.readFileSync(imgPath, 'utf8')
    assert.match(svg, /width="640" height="300" viewBox="0 0 640 300"/, '特性图应为 640x300 viewBox')
    for (const banned of ['<text', '<font', '<script', '<style', 'foreignObject', '@import', '<animate']) {
      assert.ok(!svg.includes(banned), `特性图不得包含 ${banned}`)
    }
    assert.ok(!/<image[^>]+href="https?:/.test(svg), '特性图不得引用远程资源')
    assert.ok(svg.length < 5 * 1024 * 1024, '特性图不得超 5MiB（Host 默认上限）')
  }
})
