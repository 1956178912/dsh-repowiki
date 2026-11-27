// @ts-check
/**
 * Wiki 引用内容漂移检测（异步，读取函数由调用方注入）。
 *
 * 清单 v3 为每条引用记录内容指纹；本模块重算当前指纹并比较，供状态工具
 * 与增量生成共用。读取函数由调用方提供（工具层负责 ctx.fs 与根路径），
 * 因此模块本身不做路径拼接；绝对路径与 `..` 引用在读取前被拒绝。
 *
 * 读取/比较均有上限；读取失败、范围非法、超过上限的引用计入 unchecked，
 * 绝不判为"已变化"。
 */

import { parseWikiSource } from './wiki-references.js'
import { citationDigest } from './citation-digest.js'

/** 单次最多比较的指纹条目。 */
export const MAX_CITATION_DRIFT_ENTRIES = 500

/** 单次最多读取的文件数。 */
export const MAX_CITATION_DRIFT_READS = 100

/** 报告里返回的页面数 / 每页条目上限。 */
export const MAX_CITATION_DRIFT_PAGES = 10
export const MAX_CITATION_DRIFT_ISSUES = 10

/**
 * 汇总清单的引用指纹覆盖率：按页面去重后统计引用条数与已记录指纹数。
 *
 * 生成时读取失败或超过读取上限的引用不会写入 `citationDigests`；本函数
 * 让 status/generate 能如实报告"哪些引用无法被漂移检查覆盖"，而不是
 * 把未覆盖误读为已验证。
 * @param {{pages?:Array<{sources?:string[], sections?:Array<{sources?:string[]}>,
 *   citationDigests?:Record<string, string>,
 *   citationMisses?:Record<string, string>}>}|null} manifest - Wiki 清单。
 * @returns {{total:number, tracked:number, untracked:number, hasDigests:boolean,
 *   reasons:{unreadable:number, range:number, cap:number, unknown:number}}|null}
 *   覆盖率；清单结构不可用时返回 null（0 条引用返回全 0 对象）。
 */
export function summarizeCitationCoverage(manifest) {
  if (!manifest || !Array.isArray(manifest.pages)) return null
  let total = 0
  let tracked = 0
  let hasDigests = false
  const reasons = { unreadable: 0, range: 0, cap: 0, unknown: 0 }
  for (const page of manifest.pages) {
    const digests = page?.citationDigests && typeof page.citationDigests === 'object'
      ? page.citationDigests
      : null
    if (digests && Object.values(digests).some(value => typeof value === 'string' && value)) {
      hasDigests = true
    }
    const misses = page?.citationMisses && typeof page.citationMisses === 'object'
      ? page.citationMisses
      : null
    /** @type {Set<string>} */
    const sources = new Set()
    for (const source of Array.isArray(page?.sources) ? page.sources : []) {
      if (typeof source === 'string' && source) sources.add(source)
    }
    for (const section of Array.isArray(page?.sections) ? page.sections : []) {
      for (const source of Array.isArray(section?.sources) ? section.sources : []) {
        if (typeof source === 'string' && source) sources.add(source)
      }
    }
    for (const source of sources) {
      total++
      if (digests && typeof digests[source] === 'string' && digests[source]) {
        tracked++
        continue
      }
      const reason = misses && typeof misses[source] === 'string' ? misses[source] : 'unknown'
      if (reason === 'unreadable' || reason === 'range' || reason === 'cap') reasons[reason]++
      else reasons.unknown++
    }
  }
  return { total, tracked, untracked: total - tracked, hasDigests, reasons }
}


/**
 * 比较清单记录与当前源码。
 * @param {{pages?:Array<{slug?:string, title?:string,
 *   citationDigests?:Record<string, string>}>}|null} manifest - Wiki 清单。
 * @param {(path:string) => Promise<string|null>} readText - 读取相对路径；
 *   失败返回 null（不得抛出）。
 * @param {{maxEntries?:number, maxReads?:number}} [options] - 上限覆盖。
 * @returns {Promise<{total:number, checked:number, unchecked:number,
 *   pages:Array<{slug:string, title:string,
 *     issues:Array<{source:string, path:string, start:number, end:number}>}>,
 *   truncated:boolean}|null>} 漂移结果；清单没有任何指纹时返回 null。
 */
export async function checkCitationDrift(manifest, readText, options = {}) {
  const maxEntries = Number.isInteger(options.maxEntries) && options.maxEntries > 0
    ? Math.floor(options.maxEntries)
    : MAX_CITATION_DRIFT_ENTRIES
  const maxReads = Number.isInteger(options.maxReads) && options.maxReads > 0
    ? Math.floor(options.maxReads)
    : MAX_CITATION_DRIFT_READS
  /** @type {Array<{slug:string, title:string, source:string, expected:string}>} */
  const entries = []
  for (const page of Array.isArray(manifest?.pages) ? manifest.pages : []) {
    const digests = page?.citationDigests
    if (!digests || typeof digests !== 'object') continue
    const slug = typeof page.slug === 'string' ? page.slug : ''
    const title = typeof page.title === 'string' && page.title ? page.title : slug
    for (const [source, expected] of Object.entries(digests)) {
      if (typeof expected === 'string' && expected) entries.push({ slug, title, source, expected })
    }
  }
  if (entries.length === 0) return null

  const entriesTruncated = entries.length > maxEntries
  /** @type {Map<string, string|null>} */
  const textCache = new Map()
  /** @type {Map<string, {slug:string, title:string,
   *   issues:Map<string, {source:string, path:string, start:number, end:number}>}>} */
  const byPage = new Map()
  let reads = 0
  let checked = 0
  // 超出比较上限的条目同样未被验证，计入 unchecked 而不是静默忽略，
  // 调用方（增量生成）据此避免把未验证的清单误判为最新。
  let unchecked = entries.length - Math.min(entries.length, maxEntries)
  let total = 0
  for (const entry of entries.slice(0, maxEntries)) {
    const parsed = parseWikiSource(entry.source)
    if (!parsed.path
      || parsed.path.startsWith('/')
      || /^[A-Za-z]:\//.test(parsed.path)
      || parsed.path.split('/').includes('..')) {
      unchecked++
      continue
    }
    let text = textCache.get(parsed.path)
    if (text === undefined) {
      if (reads >= maxReads) {
        text = null
      } else {
        reads++
        text = await readText(parsed.path)
      }
      textCache.set(parsed.path, text)
    }
    const actual = text === null ? null : citationDigest(text, parsed.start, parsed.end)
    if (actual === null) {
      unchecked++
      continue
    }
    checked++
    if (actual === entry.expected) continue
    total++
    const pageKey = `${entry.slug}\u0000${entry.title}`
    let pageEntry = byPage.get(pageKey)
    if (!pageEntry) {
      pageEntry = { slug: entry.slug, title: entry.title, issues: new Map() }
      byPage.set(pageKey, pageEntry)
    }
    pageEntry.issues.set(entry.source, {
      source: entry.source,
      path: parsed.path,
      start: Number.isInteger(parsed.start) ? parsed.start : 0,
      end: Number.isInteger(parsed.end) ? parsed.end : 0,
    })
  }
  const pages = [...byPage.values()]
    .map(page => ({
      slug: page.slug,
      title: page.title,
      issues: [...page.issues.values()].sort((a, b) => a.source.localeCompare(b.source)),
    }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug))
  return {
    total,
    checked,
    unchecked,
    pages: pages.slice(0, MAX_CITATION_DRIFT_PAGES).map(page => ({
      ...page,
      issues: page.issues.slice(0, MAX_CITATION_DRIFT_ISSUES),
    })),
    truncated: entriesTruncated
      || pages.length > MAX_CITATION_DRIFT_PAGES
      || pages.some(page => page.issues.length > MAX_CITATION_DRIFT_ISSUES),
  }
}
