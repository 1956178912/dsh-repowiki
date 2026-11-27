// @ts-check
/**
 * Wiki 引用内容漂移检测（异步，读取函数由调用方注入）。
 *
 * 清单 v3 为每条引用记录内容指纹；本模块重算当前指纹并比较，供状态工具
 * 与增量生成共用。读取函数由调用方提供（工具层负责 ctx.fs 与根路径），
 * 因此模块本身不做路径拼接；绝对路径与 `..` 引用在读取前被拒绝。
 *
 * 读取/比较均有上限；唯一路径先按有界并发预取，再按清单顺序比较，结果
 * 与串行版本一致。读取失败、范围非法、超过上限的引用计入 unchecked，
 * 绝不判为"已变化"。
 */

import { parseWikiSource } from './wiki-references.js'
import { citationDigest } from './citation-digest.js'

/** 单次最多比较的指纹条目。 */
export const MAX_CITATION_DRIFT_ENTRIES = 500

/** 单次最多读取的文件数。 */
export const MAX_CITATION_DRIFT_READS = 100

/** 重算指纹时的默认并发读取数（可通过 options.concurrency 覆盖）。 */
export const MAX_CITATION_DRIFT_CONCURRENCY = 8

/** 并发读取的硬上限（防止异常参数放大 IO）。 */
const CONCURRENCY_LIMIT = 16

/** 报告里返回的页面数 / 每页条目上限。 */
export const MAX_CITATION_DRIFT_PAGES = 10
export const MAX_CITATION_DRIFT_ISSUES = 10

/**
 * 单页的引用指纹覆盖率（sources 去重、未覆盖原因分桶）。
 * @param {{sources?:string[], sections?:Array<{sources?:string[]}>,
 *   citationDigests?:Record<string, string>,
 *   citationMisses?:Record<string, string>}} page - 清单页面条目。
 * @returns {{total:number, tracked:number, untracked:number, hasDigests:boolean,
 *   reasons:{unreadable:number, range:number, cap:number, unknown:number}}}
 *   页面覆盖率。
 */
function pageCoverage(page) {
  const digests = page?.citationDigests && typeof page.citationDigests === 'object'
    ? page.citationDigests
    : null
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
  const reasons = { unreadable: 0, range: 0, cap: 0, unknown: 0 }
  let tracked = 0
  for (const source of sources) {
    if (digests && typeof digests[source] === 'string' && digests[source]) {
      tracked++
      continue
    }
    const reason = misses && typeof misses[source] === 'string' ? misses[source] : 'unknown'
    if (reason === 'unreadable' || reason === 'range' || reason === 'cap') reasons[reason]++
    else reasons.unknown++
  }
  return {
    total: sources.size,
    tracked,
    untracked: sources.size - tracked,
    hasDigests: Boolean(digests
      && Object.values(digests).some(value => typeof value === 'string' && value)),
    reasons,
  }
}

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
    const stats = pageCoverage(page)
    total += stats.total
    tracked += stats.tracked
    hasDigests = hasDigests || stats.hasDigests
    for (const key of ['unreadable', 'range', 'cap', 'unknown']) {
      reasons[key] += stats.reasons[key]
    }
  }
  return { total, tracked, untracked: total - tracked, hasDigests, reasons }
}

/**
 * 列出存在未覆盖引用的页面（有界），供 status 直接指出需要刷新的页面。
 * @param {{pages?:Array<{slug?:string, title?:string, sources?:string[],
 *   sections?:Array<{sources?:string[]}>, citationDigests?:Record<string, string>,
 *   citationMisses?:Record<string, string>}>}|null} manifest - Wiki 清单。
 * @param {{limit?:number}} [options] - 明细条数上限（默认/最多 10）。
 * @returns {{pages:Array<{slug:string, title:string, total:number, tracked:number,
 *   untracked:number, reasons:{unreadable:number, range:number, cap:number,
 *   unknown:number}}>, truncated:boolean}} 页级明细。
 */
export function citationCoveragePages(manifest, options = {}) {
  if (!manifest || !Array.isArray(manifest.pages)) return { pages: [], truncated: false }
  const limit = Number.isInteger(options.limit) && options.limit > 0
    ? Math.min(Math.floor(options.limit), MAX_CITATION_DRIFT_PAGES)
    : MAX_CITATION_DRIFT_PAGES
  const details = []
  for (const page of manifest.pages) {
    const stats = pageCoverage(page)
    if (stats.untracked <= 0) continue
    const slug = typeof page.slug === 'string' ? page.slug : ''
    const title = typeof page.title === 'string' && page.title ? page.title : slug
    details.push({
      slug,
      title,
      total: stats.total,
      tracked: stats.tracked,
      untracked: stats.untracked,
      reasons: stats.reasons,
    })
  }
  details.sort((a, b) => (b.untracked - a.untracked)
    || a.title.localeCompare(b.title)
    || a.slug.localeCompare(b.slug))
  return { pages: details.slice(0, limit), truncated: details.length > limit }
}


/**
 * 以有界并发执行异步任务：worker 从共享游标领取索引，异常由任务自行处理。
 * @template T
 * @param {T[]} items - 待处理项。
 * @param {number} limit - 并发上限。
 * @param {(item:T) => Promise<void>} worker - 单项任务。
 * @returns {Promise<void>} 全部完成。
 */
async function runBounded(items, limit, worker) {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      await worker(items[index])
    }
  })
  await Promise.all(workers)
}

/**
 * 比较清单记录与当前源码。
 * @param {{pages?:Array<{slug?:string, title?:string,
 *   citationDigests?:Record<string, string>}>}|null} manifest - Wiki 清单。
 * @param {(path:string) => Promise<string|null>} readText - 读取相对路径；
 *   失败返回 null（不得抛出）。
 * @param {{maxEntries?:number, maxReads?:number, concurrency?:number}} [options]
 *   上限与并发覆盖。
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
  const concurrency = Number.isInteger(options.concurrency) && options.concurrency > 0
    ? Math.min(Math.floor(options.concurrency), CONCURRENCY_LIMIT)
    : MAX_CITATION_DRIFT_CONCURRENCY
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
  const limited = entries.slice(0, maxEntries)
  // 先收集安全且在上限内的唯一路径，再有界并发预取；随后按清单顺序比较，
  // 结果与串行版本一致，但大仓库下读取延迟显著降低。
  /** @type {string[]} */
  const paths = []
  /** @type {Set<string>} */
  const pathSet = new Set()
  for (const entry of limited) {
    const parsed = parseWikiSource(entry.source)
    if (!parsed.path
      || parsed.path.startsWith('/')
      || /^[A-Za-z]:\//.test(parsed.path)
      || parsed.path.split('/').includes('..')) continue
    if (pathSet.has(parsed.path) || paths.length >= maxReads) continue
    pathSet.add(parsed.path)
    paths.push(parsed.path)
  }
  /** @type {Map<string, string|null>} */
  const textCache = new Map()
  await runBounded(paths, concurrency, async (path) => {
    let text = null
    try {
      text = await readText(path)
    } catch {
      // 读取失败保持 null：后续按未检查处理
    }
    textCache.set(path, text)
  })
  /** @type {Map<string, {slug:string, title:string,
   *   issues:Map<string, {source:string, path:string, start:number, end:number}>}>} */
  const byPage = new Map()
  let checked = 0
  // 超出比较上限或读取上限的条目同样未被验证，计入 unchecked 而不是
  // 静默忽略；调用方（增量生成）据此避免把未验证的清单误判为最新。
  let unchecked = entries.length - limited.length
  let total = 0
  for (const entry of limited) {
    const parsed = parseWikiSource(entry.source)
    if (!parsed.path
      || parsed.path.startsWith('/')
      || /^[A-Za-z]:\//.test(parsed.path)
      || parsed.path.split('/').includes('..')
      || !pathSet.has(parsed.path)) {
      unchecked++
      continue
    }
    const text = textCache.get(parsed.path) ?? null
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
