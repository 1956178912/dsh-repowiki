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
import {
  ASSET_DIR, KNOWLEDGE_DIR, WIKI_DIR, CARD_SCHEMA_VERSION,
} from './schema.js'
import { parseFrontmatter } from './util.js'

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
 * @returns {string} 形如 '.dsh-repowiki/knowledge/zh/src-indexer.md'。
 */
export function cardPath(relPath, locale) {
  return path.posix.join(ASSET_DIR, KNOWLEDGE_DIR, locale, `${cardSlug(relPath)}.md`)
}

/**
 * Wiki 页文件相对资产根的路径。
 * @param {string} slug - 页面 slug。
 * @param {string} locale - 语言代码。
 * @returns {string} 形如 '.dsh-repowiki/wiki/zh/overview.md'。
 */
export function wikiPath(slug, locale) {
  return path.posix.join(ASSET_DIR, WIKI_DIR, locale, `${slug}.md`)
}

/**
 * 写入一张卡片。
 * @param {object} fs - ctx.fs 服务。
 * @param {string} root - 资产根。
 * @param {string} relPath - 源文件相对路径。
 * @param {string} locale - 语言。
 * @param {string} markdown - 渲染后的卡片 Markdown。
 * @returns {Promise<string>} 写入文件 displayPath。
 */
export async function writeCard(fs, root, relPath, locale, markdown) {
  const target = await fs.resolve(cardPath(relPath, locale), { cwd: root })
  await fs.writeText(target, markdown)
  return target.displayPath
}

/**
 * 写入一个 Wiki 页。
 * @param {object} fs - ctx.fs 服务。
 * @param {string} root - 资产根。
 * @param {string} slug - 页面 slug。
 * @param {string} locale - 语言。
 * @param {string} markdown - 渲染后的页面 Markdown。
 * @returns {Promise<string>} 写入文件 displayPath。
 */
export async function writeWikiPage(fs, root, slug, locale, markdown) {
  const target = await fs.resolve(wikiPath(slug, locale), { cwd: root })
  await fs.writeText(target, markdown)
  return target.displayPath
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
 * @param {object} fs - ctx.fs 服务。
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
