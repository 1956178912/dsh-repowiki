// 门面一致性：locale 元数据（插件管理页展示的标题/描述）必须双语齐全且为合法 JSON，
// 描述需与当前工具全集一致（8 个工具）。
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
    assert.ok(j.meta && j.meta.title && j.meta.description, `${lang}.json 必须含 meta.title/description`)
    metas[lang] = j.meta
  }
  const tools = ['index', 'cards', 'extract', 'generate', 'edit', 'export', 'import', 'memory']
  for (const lang of langs) {
    for (const t of tools) assert.ok(metas[lang].description.includes(`repowiki-${t}`),
      `${lang} 描述应提及 repowiki-${t}`)
  }
})
