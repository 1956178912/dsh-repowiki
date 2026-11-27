/**
 * 知识卡片与 Wiki 页面的目录读写（ctx.fs 注入式）。
 *
 * 目录结构（方案 §6.1）：
 *   <root>/.dsh-repowiki/
 *     knowledge/{locale}/{slug}.md     卡片（JSON frontmatter + 正文）
 *     wiki/{locale}/{slug}.md          Wiki 页面
 *     index.json                        符号索引（Phase 1）
 * 卡片文件名由源文件路径经 slug 化得到，保证双向可定位。
 */

import * as path from 'node:path'
import { createHash } from 'node:crypto'
import {
  ASSET_DIR, KNOWLEDGE_DIR, WIKI_DIR, CARD_SCHEMA_VERSION,
} from './schema.js'
import { parseFrontmatter, writeTextVerified } from './util.js'

/** 源路径的 8 位 sha256 前缀（碰撞保护后缀；稳定可复现）。 */
function HASH8(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 8)
}

/**
 * 把源文件相对路径 slug 化为卡片文件名。
 * 例：'src/indexer.js' → 'src-indexer'；'pkg/mod.py' → 'pkg-mod'。
 * @param {string} relPath - 相对项目根的源文件路径。
 * @returns {string} slug。
 */
export function cardSlug(relPath) {
  return relPath
    .replace(/\\/g, '/')
    .replace(/\.[^.]+$/, '') // 去扩展名
    .replace(/\//g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-') // 非 ASCII 字符归一为连字符
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

/**
 * 卡片文件相对资产根的路径。
 * @param {string} relPath - 源文件相对路径。
 * @param {string} locale - 语言代码。
 * @param {string} [suffix] - slug 后缀（碰撞保护用）。
 * @returns {string} 形如 '.dsh-repowiki/knowledge/zh/src-indexer.md'。
 */
export function cardPath(relPath, locale, suffix = '') {
  return path.posix.join(ASSET_DIR, KNOWLEDGE_DIR, locale, `${cardSlug(relPath)}${suffix}.md`)
}

/**
 * 净化 Wiki 页 slug（LLM 输出不得直达文件路径拼接）。
 * 小写 + 非 [a-z0-9-] 归一为连字符 + 去首尾连字符 + 长度上限；空串兜底
 * 为 'page'，保证 writeWikiPage 永远落在 wiki/<locale>/ 目录内。
 * @param {string} slug - LLM 返回的页面 slug。
 * @returns {string} 净化后的 slug。
 */
export function wikiSlug(slug) {
  const cleaned = String(slug)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return cleaned || 'page'
}

/**
 * 分层 Wiki slug：逐段走 wikiSlug 净化并保留 `/`（模块页等嵌套路径用）。
 * 与平铺 wikiSlug 的区别：`modules/src` → `modules/src`；空段被丢弃。
 * @param {string} slug - 原始 slug（可含 `/`）。
 * @returns {string} 净化后的分层 slug。
 */
export function wikiSlugPath(slug) {
  const segments = String(slug).split('/').filter(Boolean).map(wikiSlug)
  return segments.length > 0 ? segments.join('/') : 'page'
}

/**
 * Wiki 页文件相对资产根的路径。内部强制走 wikiSlug 逐段净化（路径穿越防线），
 * 支持 `modules/src` 这类嵌套路径。
 * @param {string} slug - 页面 slug（可含 `/` 分层）。
 * @param {string} locale - 语言代码。
 * @returns {string} 形如 '.dsh-repowiki/wiki/zh/overview.md' 或
 *   '.dsh-repowiki/wiki/zh/modules/src.md'。
 */
export function wikiPath(slug, locale) {
  return path.posix.join(ASSET_DIR, WIKI_DIR, locale, `${wikiSlugPath(slug)}.md`)
}

/**
 * 写入一张卡片。碰撞保护：若目标文件已存在且其 frontmatter 记录的源路径
 * 与本卡不同（两个不同源路径归一到同一 slug，如 'src/a b.js' 与
 * 'src/a-b.js'），改用源路径 8 位哈希后缀写盘，避免静默覆盖。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根。
 * @param {string} relPath - 源文件相对路径。
 * @param {string} locale - 语言。
 * @param {string} markdown - 渲染后的卡片 Markdown。
 * @returns {Promise<string>} 写入文件 displayPath。
 */
export async function writeCard(fs, root, relPath, locale, markdown) {
  let rel = cardPath(relPath, locale)
  try {
    const existing = await fs.readText(await fs.resolve(rel, { cwd: root }))
    const parsed = parseCard(existing)
    if (parsed && parsed.meta.path !== relPath) {
      // 归一碰撞且非同源：加后缀（同一 relPath 后缀稳定，重跑不漂移）
      rel = cardPath(relPath, locale, '-' + HASH8(relPath))
    }
  } catch {
    // 目标不存在或不可读：无碰撞，按原路径写
  }
  const target = await fs.resolve(rel, { cwd: root })
  await writeTextVerified(fs, target, markdown)
  return target.displayPath
}

/**
 * 读取某源路径对应的单张卡片（考虑 slug 碰撞后缀）。
 * 用于并发写前的二次判定：LLM 返回后重新确认卡片是否已被他人刷新/人工修订。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根。
 * @param {string} relPath - 源文件相对路径。
 * @param {string} locale - 语言。
 * @returns {Promise<{meta:object, path:string}|null>} 命中卡片或 null。
 */
export async function readCardFor(fs, root, relPath, locale) {
  const candidates = [
    cardPath(relPath, locale),
    cardPath(relPath, locale, '-' + HASH8(relPath)),
  ]
  for (const rel of candidates) {
    try {
      const text = await fs.readText(await fs.resolve(rel, { cwd: root }))
      const parsed = parseCard(text)
      if (parsed && parsed.meta.path === relPath) return { meta: parsed.meta, path: rel }
    } catch {
      // 该候选不存在/不可读：尝试下一个
    }
  }
  return null
}

/**
 * 写入一个 Wiki 页。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根。
 * @param {string} slug - 页面 slug。
 * @param {string} locale - 语言。
 * @param {string} markdown - 渲染后的页面 Markdown。
 * @returns {Promise<string>} 写入文件 displayPath。
 */
export async function writeWikiPage(fs, root, slug, locale, markdown) {
  const target = await fs.resolve(wikiPath(slug, locale), { cwd: root })
  await writeTextVerified(fs, target, markdown)
  return target.displayPath
}

/**
 * 写入 Wiki 清单（`wiki/<locale>/_index.json`），供面板排序/分组与状态诊断。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根。
 * @param {string} locale - 语言。
 * @param {object} payload - { schemaVersion, generatedAt, inputDigest, pages }。
 * @returns {Promise<string>} 相对资产根路径。
 */
export async function writeWikiManifest(fs, root, locale, payload) {
  const rel = path.posix.join(ASSET_DIR, WIKI_DIR, locale, '_index.json')
  const target = await fs.resolve(rel, { cwd: root })
  await writeTextVerified(fs, target, JSON.stringify(payload, null, 2) + '\n')
  return rel
}

/**
 * 读取 Wiki 清单；缺失/损坏返回 null（面板与状态工具据此降级）。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根。
 * @param {string} locale - 语言。
 * @returns {Promise<object|null>} 清单文档。
 */
export async function readWikiManifest(fs, root, locale) {
  try {
    const rel = path.posix.join(ASSET_DIR, WIKI_DIR, locale, '_index.json')
    const text = await fs.readText(await fs.resolve(rel, { cwd: root }))
    const doc = JSON.parse(text)
    return doc && typeof doc === 'object' && Array.isArray(doc.pages) ? doc : null
  } catch {
    return null
  }
}

/**
 * 枚举某 locale 下的 Wiki 页面（含 `modules/` 等子目录；`_index.json` 等非 md 文件忽略）。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根。
 * @param {string} locale - 语言。
 * @returns {Promise<Array<{slug:string, title:string, path:string, inputDigest:string}>>} 页面清单。
 */
export async function listWikiPages(fs, root, locale) {
  const base = path.posix.join(ASSET_DIR, WIKI_DIR, locale)
  const out = []
  /**
   * 递归枚举目录（深度上限 3，防异常树）。
   * @param {string} rel - 相对资产根的目录路径。
   * @param {number} depth - 当前深度。
   */
  const walk = async (rel, depth) => {
    if (depth > 3) return
    let entries
    try {
      const dirTarget = await fs.resolve(rel, { cwd: root })
      const info = await fs.stat(dirTarget)
      if (info?.type !== 'directory') return
      entries = await fs.listDir(dirTarget)
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.type === 'directory') {
        await walk(`${rel}/${entry.name}`, depth + 1)
        continue
      }
      if (!entry.name.endsWith('.md')) continue
      const fileRel = `${rel}/${entry.name}`
      let slug = entry.name.replace(/\.md$/, '')
      let title = slug
      let inputDigest = ''
      try {
        const text = await fs.readText(entry.target)
        const parsed = parseFrontmatter(text)
        if (parsed) {
          if (typeof parsed.meta.slug === 'string' && parsed.meta.slug) slug = parsed.meta.slug
          if (typeof parsed.meta.title === 'string' && parsed.meta.title) title = parsed.meta.title
          if (typeof parsed.meta.inputDigest === 'string') inputDigest = parsed.meta.inputDigest
        }
      } catch {
        // 坏页仍以文件名参与孤儿判定
      }
      out.push({ slug, title, path: fileRel, inputDigest })
    }
  }
  await walk(base, 0)
  return out
}

/**
 * 读取某 locale 的卡片文档（含正文），供 BM25 检索使用。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根。
 * @param {string} locale - 语言。
 * @returns {Promise<Array<{id:string, path:string, title:string, tags:string[], summary:string, body:string}>>}
 *   文档列表（单卡不可读时跳过）。
 */
export async function readCardDocuments(fs, root, locale) {
  const cards = await readExistingCards(fs, root, locale)
  const out = []
  for (const [sourcePath, card] of cards) {
    try {
      const text = await fs.readText(await fs.resolve(card.path, { cwd: root }))
      const parsed = parseCard(text)
      if (!parsed) continue
      out.push({
        id: `card:${sourcePath}`,
        path: sourcePath,
        title: typeof parsed.meta.title === 'string' ? parsed.meta.title : sourcePath,
        tags: Array.isArray(parsed.meta.tags) ? parsed.meta.tags : [],
        summary: cardSummaryFromBody(parsed.body),
        body: parsed.body,
      })
    } catch {
      // 单卡不可读不阻断检索
    }
  }
  return out
}

/**
 * 读取某 locale 的 Wiki 文档（含正文），供 BM25 检索使用。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根。
 * @param {string} locale - 语言。
 * @returns {Promise<Array<{id:string, path:string, title:string, body:string}>>} 文档列表。
 */
export async function readWikiDocuments(fs, root, locale) {
  const pages = await listWikiPages(fs, root, locale)
  const out = []
  for (const page of pages) {
    try {
      const text = await fs.readText(await fs.resolve(page.path, { cwd: root }))
      const parsed = parseFrontmatter(text)
      out.push({
        id: `wiki:${page.path}`,
        path: page.path,
        title: page.title,
        body: parsed ? parsed.body : text,
      })
    } catch {
      // 单页不可读不阻断检索
    }
  }
  return out
}

/**
 * 写入某 locale 的知识库清单（模块 → 卡片映射，对齐 Qoder Repo Wiki 的
 * knowledge/_index.yaml；本插件用 JSON 以保持零依赖）。清单是派生视图：
 * 面板与工具仍以 index.json + 卡片文件为准，清单供外部工具与 Git 审阅。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根。
 * @param {string} locale - 语言。
 * @param {object} payload - 清单内容（schemaVersion/locale/generatedAt/modules）。
 * @returns {Promise<string>} 写入文件相对资产根路径。
 */
export async function writeKnowledgeIndex(fs, root, locale, payload) {
  const rel = path.posix.join(ASSET_DIR, KNOWLEDGE_DIR, locale, '_index.json')
  const target = await fs.resolve(rel, { cwd: root })
  await writeTextVerified(fs, target, JSON.stringify(payload, null, 2) + '\n')
  return rel
}

/**
 * 读取某 locale 的知识库清单（`knowledge/<locale>/_index.json`）。
 * 缺失/损坏/形状不符返回 null（状态工具据此降级）。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根。
 * @param {string} locale - 语言。
 * @returns {Promise<object|null>} 清单文档。
 */
export async function readKnowledgeIndex(fs, root, locale) {
  const rel = path.posix.join(ASSET_DIR, KNOWLEDGE_DIR, locale, '_index.json')
  try {
    const target = await fs.resolve(rel, { cwd: root })
    const text = await fs.readText(target)
    const doc = JSON.parse(text)
    return doc && typeof doc === 'object' && Array.isArray(doc.modules) ? doc : null
  } catch {
    return null
  }
}

/**
 * 解析卡片的 JSON frontmatter 与正文。
 * @param {string} text - 卡片文件内容。
 * @returns {{meta:object, body:string}|null} 解析失败（无 frontmatter / 非 JSON / 版本不符）返回 null。
 */
export function parseCard(text) {
  return parseFrontmatter(text, CARD_SCHEMA_VERSION)
}

/**
 * 枚举某 locale 下已有卡片，返回"源文件相对路径 → 卡片元数据"映射。
 * 用于提取时的缓存跳过与生成时的卡片汇总。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根。
 * @param {string} locale - 语言。
 * @returns {Promise<Map<string, {meta:object, path:string}>>} 已有卡片映射。
 */
export async function readExistingCards(fs, root, locale) {
  const dir = path.posix.join(ASSET_DIR, KNOWLEDGE_DIR, locale)
  const result = new Map()
  let entries
  try {
    const dirTarget = await fs.resolve(dir, { cwd: root })
    const info = await fs.stat(dirTarget)
    if (info?.type !== 'directory') return result
    entries = await fs.listDir(dirTarget)
  } catch {
    return result
  }
  for (const entry of entries) {
    if (entry.type !== 'file' || !entry.name.endsWith('.md')) continue
    try {
      const text = await fs.readText(entry.target)
      const parsed = parseCard(text)
      if (parsed && typeof parsed.meta.path === 'string') {
        result.set(parsed.meta.path, { meta: parsed.meta, path: `${dir}/${entry.name}` })
      }
    } catch {
      // 单张坏卡不阻断枚举
    }
  }
  return result
}

/**
 * 从卡片正文里提取摘要给 generate prompt 用（避免喂入全部 Markdown）。
 * @param {string} body - 卡片正文（frontmatter 之后）。
 * @returns {string} 概要段落（取"## 概要"节的前几句；缺节返回空串）。
 */
export function cardSummaryFromBody(body) {
  const m = /## 概要 \/ Summary\n\n([\s\S]*?)(?=\n## )/.exec(body)
  if (!m) return ''
  return m[1].trim().split('\n')[0]
}
