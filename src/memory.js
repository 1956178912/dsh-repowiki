/**
 * 会话记忆条目（Phase 4 §repowiki-memory）的存储层。
 *
 * 形态与知识卡片一致（JSON frontmatter + 正文），落在
 * <root>/.dsh-repowiki/memory/<locale>/<slug>.md，随 Git 共享。
 *
 * 与方案原文的差异（见 docs/checkpoints/phase-4a.md）：方案设想由
 * sessionProjections 投影会话日志自动产生候选；实现上改为**模型显式
 * 调用 repowiki-memory 写候选**——投影自动候选的文本判定噪声大，且
 * 显式写入与"工具由模型调用"的架构一致、质量由调用方保证。审核闭环
 * （pending → accepted / rejected）保持不变。
 */

import * as path from 'node:path'
import { ASSET_DIR, MEMORY_DIR, MEMORY_SCHEMA_VERSION, MEMORY_STATUS } from './schema.js'

/** slug 的最大长度（长标题截断，避免文件名失控）。 */
const SLUG_MAX = 48

/**
 * 把标题 slug 化为稳定文件名（小写、非字母数字归一为连字符）。
 * 纯非 ASCII 标题归一后为空串，调用方需用兜底 slug。
 * @param {string} title - 条目标题。
 * @returns {string} slug（可能为空串）。
 */
export function slugifyMemory(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
}

/**
 * 记忆条目文件的相对资产根路径。
 * @param {string} slug - 条目 slug。
 * @param {string} locale - 语言代码。
 * @returns {string} 形如 '.dsh-repowiki/memory/zh/foo-bar.md'。
 */
export function memoryPath(slug, locale) {
  return path.posix.join(ASSET_DIR, MEMORY_DIR, locale, `${slug}.md`)
}

/**
 * 渲染记忆条目 Markdown（frontmatter + 标题 + 正文）。
 * @param {object} meta - 元数据（schemaVersion/path/title/tags/status/createdAt 等）。
 * @param {string} body - 正文。
 * @returns {string} Markdown 文本。
 */
export function renderMemoryMarkdown(meta, body) {
  return `---\n${JSON.stringify(meta, null, 2)}\n---\n\n# ${meta.title}\n\n${body}\n`
}

/**
 * 写入一条记忆条目。
 * @param {object} fs - ctx.fs 服务。
 * @param {string} root - 资产根绝对路径。
 * @param {object} entry - { slug, locale, title, body, tags?, path?, status }。
 * @returns {Promise<string>} 写入文件相对资产根路径。
 */
export async function writeMemory(fs, root, entry) {
  const meta = {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    kind: 'memory',
    title: entry.title,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    status: entry.status,
    createdAt: new Date().toISOString(),
  }
  if (typeof entry.path === 'string' && entry.path) meta.path = entry.path
  const rel = memoryPath(entry.slug, entry.locale)
  const target = await fs.resolve(rel, { cwd: root })
  await fs.writeText(target, renderMemoryMarkdown(meta, entry.body))
  return rel
}

/**
 * 列出某 locale 的记忆条目（按状态过滤）。
 * @param {object} fs - ctx.fs 服务。
 * @param {string} root - 资产根绝对路径。
 * @param {string} locale - 语言代码。
 * @param {string} [status] - 过滤状态（'pending'/'accepted'/'rejected'），
 *   省略列出全部。
 * @param {boolean} [withBody=false] - 返回值附带正文（去掉标题行）。
 * @returns {Promise<object[]>} 条目摘要数组（slug/title/status/tags/createdAt/path?/body?）。
 */
export async function listMemory(fs, root, locale, status, withBody = false) {
  const dir = path.posix.join(ASSET_DIR, MEMORY_DIR, locale)
  let entries
  try {
    const dirTarget = await fs.resolve(dir, { cwd: root })
    const info = await fs.stat(dirTarget)
    if (info?.type !== 'directory') return []
    entries = await fs.listDir(dirTarget)
  } catch {
    return []
  }
  const out = []
  for (const entry of entries) {
    if (entry.type !== 'file' || !entry.name.endsWith('.md')) continue
    try {
      const text = await fs.readText(entry.target)
      const parsed = parseMemoryText(text)
      if (!parsed) continue
      if (status && parsed.meta.status !== status) continue
      const slug = entry.name.replace(/\.md$/, '')
      const item = {
        slug,
        title: parsed.meta.title ?? slug,
        status: MEMORY_STATUS.includes(parsed.meta.status) ? parsed.meta.status : 'pending',
        tags: Array.isArray(parsed.meta.tags) ? parsed.meta.tags : [],
        createdAt: typeof parsed.meta.createdAt === 'string' ? parsed.meta.createdAt : '',
        ...(typeof parsed.meta.path === 'string' && parsed.meta.path
          ? { path: parsed.meta.path } : {}),
      }
      if (withBody) {
        // 正文去掉 frontmatter、前导空行与一级标题行，供消费方（如 wiki 生成）取摘要
        item.body = parsed.body.replace(/^\s*#[^\n]*\n+/, '').trim()
      }
      out.push(item)
    } catch {
      // 单条坏条目不阻断枚举
    }
  }
  return out
}

/**
 * 修改记忆条目状态（审核闭环：accept/reject）。
 * @param {object} fs - ctx.fs 服务。
 * @param {string} root - 资产根绝对路径。
 * @param {string} locale - 语言代码。
 * @param {string} slug - 条目 slug。
 * @param {'accepted'|'rejected'} status - 目标状态。
 * @returns {Promise<string|null>} 更新后的相对路径；条目不存在返回 null。
 */
export async function setMemoryStatus(fs, root, locale, slug, status) {
  const rel = memoryPath(slug, locale)
  let text
  try {
    const target = await fs.resolve(rel, { cwd: root })
    text = await fs.readText(target)
  } catch {
    return null
  }
  const parsed = parseMemoryText(text)
  if (!parsed) return null
  const meta = { ...parsed.meta, status }
  const body = parsed.body.replace(/^#[^\n]*\n+/, '')
  const target = await fs.resolve(rel, { cwd: root })
  await fs.writeText(target, renderMemoryMarkdown(meta, body))
  return rel
}

/**
 * 解析记忆条目的 JSON frontmatter 与正文（与卡片解析同构）。
 * @param {string} text - 条目文件内容。
 * @returns {{meta:object, body:string}|null} 失败返回 null。
 */
function parseMemoryText(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)
  if (!m) return null
  try {
    const meta = JSON.parse(m[1])
    if (typeof meta !== 'object' || meta === null) return null
    if (meta.schemaVersion !== MEMORY_SCHEMA_VERSION) return null
    return { meta, body: m[2] }
  } catch {
    return null
  }
}
