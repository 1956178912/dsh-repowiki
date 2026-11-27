// @ts-check
/**
 * 资产语言（locale）探测与选择。
 *
 * 背景：卡片与 Wiki 按 `knowledge/<locale>/`、`wiki/<locale>/` 落盘，而
 * 读取侧原先直接用"会话环境语言"（`LANG`）。当仓库只生成过 `zh` 资产、
 * 而宿主环境是 `en` 时，`repowiki-cards` 的正文检索与记忆消费会静默返回
 * 空——资产明明存在，用户却看不到。状态工具也会把 Wiki 陈旧判成 0。
 *
 * 本模块把"读哪一份资产"变成显式解析：
 * - 调用方显式指定 locale 时严格使用（用于诊断/对照）；
 * - 未指定时优先环境语言，该语言没有任何内容则回退到另一个受支持
 *   locale（仅当它确实有卡片/Wiki/记忆）；两者都空则保留环境语言，
 *   让"从未生成"与"生成在另一个语言"可区分（`source` 字段可见）。
 *
 * 探测只做目录存在性 + 是否含 Markdown，不解析内容，成本恒定（2 个
 * locale × 3 个资产目录）。
 */

import * as path from 'node:path'
import {
  ASSET_DIR, KNOWLEDGE_DIR, WIKI_DIR, MEMORY_DIR, SUPPORTED_LOCALES,
} from './schema.js'

/**
 * 某 locale 的资产可用性。
 * @typedef {Object} LocaleAssets
 * @property {string} locale - 语言代码。
 * @property {boolean} cards - 是否有卡片（knowledge/<locale>/*.md）。
 * @property {boolean} wiki - 是否有 Wiki 页（wiki/<locale>/**\/*.md）。
 * @property {boolean} memory - 是否有会话记忆（memory/<locale>/*.md）。
 * @property {boolean} present - 三类资产任一存在。
 */

/**
 * 判断目录下（递归到指定深度）是否存在 Markdown 文件。
 * 目录不存在/不可读一律视为无内容；不抛错。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根绝对路径。
 * @param {string} rel - 相对资产根的目录。
 * @param {number} depth - 剩余递归深度（Wiki 的 modules/ 需要 1 层）。
 * @returns {Promise<boolean>} 是否含 .md。
 */
async function hasMarkdown(fs, root, rel, depth) {
  try {
    const target = await fs.resolve(rel, { cwd: root })
    const info = await fs.stat(target)
    if (info?.type !== 'directory') return false
    const entries = await fs.listDir(target)
    for (const entry of entries) {
      if (entry.type === 'file' && entry.name.endsWith('.md')) return true
      if (entry.type === 'directory' && depth > 0) {
        if (await hasMarkdown(fs, root, `${rel}/${entry.name}`, depth - 1)) return true
      }
    }
  } catch {
    // 缺失/不可读：视为无资产
  }
  return false
}

/**
 * 探测某 locale 的三类资产是否存在。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根绝对路径。
 * @param {string} locale - 语言代码。
 * @returns {Promise<LocaleAssets>} 可用性。
 */
export async function probeLocaleAssets(fs, root, locale) {
  const [cards, wiki, memory] = await Promise.all([
    hasMarkdown(fs, root, path.posix.join(ASSET_DIR, KNOWLEDGE_DIR, locale), 0),
    hasMarkdown(fs, root, path.posix.join(ASSET_DIR, WIKI_DIR, locale), 2),
    hasMarkdown(fs, root, path.posix.join(ASSET_DIR, MEMORY_DIR, locale), 0),
  ])
  return {
    locale,
    cards,
    wiki,
    memory,
    present: cards || wiki || memory,
  }
}

/**
 * 解析读取资产时应使用的 locale。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根绝对路径。
 * @param {string} preferred - 调用方未显式指定时的首选 locale（环境语言）。
 * @param {boolean} [explicit=false] - 调用方是否显式指定了 preferred。
 * @returns {Promise<{locale:string, requested:string, source:'explicit'|'preferred'|'fallback'|'default', available:LocaleAssets[]}>}
 *   `source`：explicit=按要求严格使用；preferred=首选语言有资产；
 *   fallback=首选为空、改用另一语言；default=两者都没有内容。
 */
export async function resolveContentLocale(fs, root, preferred, explicit = false) {
  const requested = SUPPORTED_LOCALES.includes(preferred) ? preferred : SUPPORTED_LOCALES[0]
  const probes = await Promise.all(
    SUPPORTED_LOCALES.map(locale => probeLocaleAssets(fs, root, locale)),
  )
  const available = probes.filter(probe => probe.present)
  if (explicit) {
    return { locale: requested, requested, source: 'explicit', available }
  }
  const preferredProbe = probes.find(probe => probe.locale === requested)
  if (preferredProbe?.present) {
    return { locale: requested, requested, source: 'preferred', available }
  }
  const other = probes.find(probe => probe.locale !== requested && probe.present)
  if (other) {
    return { locale: other.locale, requested, source: 'fallback', available }
  }
  return { locale: requested, requested, source: 'default', available }
}
