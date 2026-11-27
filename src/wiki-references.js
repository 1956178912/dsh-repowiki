// @ts-check
/**
 * Wiki 引用反查（纯函数）。
 *
 * `wiki/<locale>/_index.json` 记录了每个 Wiki 页面引用的源文件：
 * - 页面级 `sources`（所有章节引用的并集）；
 * - v2 起每页 `sections: [{heading, sources}]`，可定位到具体章节。
 *
 * 本模块把清单反转成 `源文件 → [{slug, title, sections}]`，供
 * `repowiki-cards wikiReferences=true` 与面板详情回答"这个文件被哪些
 * Wiki 页面/章节引用"。引用值中的 `#Lx-Ly` 片段在匹配前剥离。
 */

/** 单次反查返回的条目上限。 */
export const MAX_WIKI_REFERENCE_ENTRIES = 100

/**
 * Wiki 清单中的页面（v1 无 sections，v2 起有）。
 * @typedef {{slug?:string, path?:string, title?:string, sources?:string[],
 *   sections?:Array<{heading?:string, sources?:string[]}>}} WikiManifestPage
 */

/**
 * 单条 Wiki 反查结果。
 * @typedef {{path:string, slug:string, title:string, sections:string[]}} WikiReferenceEntry
 */

/**
 * 归一 Wiki 引用值：去空白、剥离 `#Lx-Ly` 片段；无效值返回空串。
 * @param {unknown} source - 清单中的引用值。
 * @returns {string} 归一后的源文件相对路径。
 */
export function normalizeWikiSource(source) {
  if (typeof source !== 'string') return ''
  return source.trim().split('#')[0].trim()
}

/**
 * 构建 Wiki 引用反查索引。
 * @param {{pages?:WikiManifestPage[]}|null} manifest - wiki 清单（缺失时返回空索引）。
 * @returns {Map<string, Array<{slug:string, title:string, sections:string[]}>>}
 *   源文件 → 引用它的页面（按标题、slug 排序；sections 已去重排序）。
 */
export function buildWikiReferenceIndex(manifest) {
  /** @type {Map<string, Map<string, {slug:string, title:string, sections:Set<string>}>>} */
  const bySource = new Map()
  for (const page of Array.isArray(manifest?.pages) ? manifest.pages : []) {
    if (!page || typeof page !== 'object') continue
    const slug = typeof page.slug === 'string' ? page.slug : ''
    const title = typeof page.title === 'string' && page.title ? page.title : slug
    const pageKey = `${slug}\u0000${title}`
    /**
     * 登记一处引用。
     * @param {unknown} source - 引用值。
     * @param {string} heading - 章节标题（页面级引用为空串）。
     * @returns {void}
     */
    const add = (source, heading) => {
      const path = normalizeWikiSource(source)
      if (!path) return
      if (!bySource.has(path)) bySource.set(path, new Map())
      const pages = bySource.get(path)
      let entry = pages.get(pageKey)
      if (!entry) {
        entry = { slug, title, sections: new Set() }
        pages.set(pageKey, entry)
      }
      if (heading) entry.sections.add(heading)
    }
    for (const source of Array.isArray(page.sources) ? page.sources : []) add(source, '')
    for (const section of Array.isArray(page.sections) ? page.sections : []) {
      if (!section || typeof section !== 'object') continue
      const heading = typeof section.heading === 'string' ? section.heading.trim() : ''
      for (const source of Array.isArray(section.sources) ? section.sources : []) add(source, heading)
    }
  }

  /** @type {Map<string, Array<{slug:string, title:string, sections:string[]}>>} */
  const out = new Map()
  for (const [path, pages] of bySource) {
    const list = [...pages.values()]
      .map(page => ({
        slug: page.slug,
        title: page.title,
        sections: [...page.sections].sort(),
      }))
      .sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug))
    out.set(path, list)
  }
  return out
}

/**
 * 为文件列表收集 Wiki 引用（保持文件顺序，页面按标题排序）。
 * @param {Map<string, Array<{slug:string, title:string, sections:string[]}>>} index
 *   buildWikiReferenceIndex 的结果。
 * @param {string[]} [paths] - 需要反查的源文件路径。
 * @param {number} [limit] - 条目上限（默认 MAX_WIKI_REFERENCE_ENTRIES）。
 * @returns {{wikiReferences: WikiReferenceEntry[], truncated: boolean}} 结果与截断标记。
 */
export function wikiReferencesFor(index, paths = [], limit = MAX_WIKI_REFERENCE_ENTRIES) {
  /** @type {WikiReferenceEntry[]} */
  const wikiReferences = []
  let truncated = false
  for (const path of paths) {
    const pages = index.get(path)
    if (!pages) continue
    for (const page of pages) {
      if (wikiReferences.length >= limit) {
        truncated = true
        break
      }
      wikiReferences.push({ path, slug: page.slug, title: page.title, sections: page.sections })
    }
    if (truncated) break
  }
  return { wikiReferences, truncated }
}
