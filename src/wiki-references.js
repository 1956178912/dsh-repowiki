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

/** 引用完整性报告里返回的页面上限。 */
export const MAX_BROKEN_CITATION_PAGES = 10

/** 引用完整性报告中每个页面列出的缺失源文件上限。 */
export const MAX_BROKEN_CITATION_SOURCES = 10

/** 行号越界报告里返回的页面上限。 */
export const MAX_CITATION_RANGE_PAGES = 10

/** 行号越界报告中每个页面列出的问题上限。 */
export const MAX_CITATION_RANGE_ISSUES = 10

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
 * 解析 Wiki 引用值：路径 + 可选行号范围。
 * 支持 `path`、`path#L10`、`path#L10-L20`、`path#L10-20`（大小写不敏感）；
 * 无法识别的片段只保留路径，不猜测行号。
 * @param {unknown} source - 清单中的引用值。
 * @returns {{path:string, start?:number, end?:number}} 解析结果；无效路径为空串。
 */
export function parseWikiSource(source) {
  if (typeof source !== 'string') return { path: '' }
  const raw = source.trim()
  if (!raw) return { path: '' }
  const hash = raw.indexOf('#')
  const path = (hash >= 0 ? raw.slice(0, hash) : raw).trim()
  if (!path) return { path: '' }
  if (hash < 0) return { path }
  const fragment = raw.slice(hash + 1).trim()
  const match = /^L(?<start>\d+)(?:\s*-\s*L?(?<end>\d+))?$/i.exec(fragment)
  if (!match) return { path }
  const start = Number(match.groups.start)
  const end = match.groups.end ? Number(match.groups.end) : start
  return { path, start, end }
}

/**
 * 归一 Wiki 引用值：去空白、剥离 `#Lx-Ly` 片段；无效值返回空串。
 * @param {unknown} source - 清单中的引用值。
 * @returns {string} 归一后的源文件相对路径。
 */
export function normalizeWikiSource(source) {
  return parseWikiSource(source).path
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

/**
 * 找出 Wiki 清单中指向不存在文件的引用（引用完整性）。
 *
 * 只读取页面级与章节级 `sources`，剥离 `#Lx-Ly` 片段；存在性由调用方
 * 提供（索引文件 + 文件系统确认），本函数保持纯函数。`total` 是去重后的
 * 缺失路径数，`references` 是引用出现次数（页面级与章节级分别计数），
 * 页面明细有界，不因截断而改变前两个总数。
 * @param {{pages?:WikiManifestPage[]}|null} manifest - Wiki 清单。
 * @param {Set<string>|Iterable<string>} [existingPaths] - 已确认存在的相对路径。
 * @returns {{total:number, references:number,
 *   pages:Array<{slug:string, title:string, sources:string[]}>, truncated:boolean}}
 *   缺失引用统计与有界明细。
 */
export function findBrokenWikiCitations(manifest, existingPaths = []) {
  const known = existingPaths instanceof Set ? existingPaths : new Set(existingPaths)
  /** @type {Map<string, {slug:string, title:string, sources:Set<string>}>} */
  const byPage = new Map()
  /** @type {Set<string>} */
  const missingPaths = new Set()
  let references = 0
  for (const page of Array.isArray(manifest?.pages) ? manifest.pages : []) {
    if (!page || typeof page !== 'object') continue
    const slug = typeof page.slug === 'string' ? page.slug : ''
    const title = typeof page.title === 'string' && page.title ? page.title : slug
    const pageKey = `${slug}\u0000${title}`
    /** @type {Set<string>} */
    const missing = new Set()
    /** @param {unknown} source */
    const check = (source) => {
      const path = normalizeWikiSource(source)
      if (!path || known.has(path)) return
      missing.add(path)
      missingPaths.add(path)
      references++
    }
    for (const source of Array.isArray(page.sources) ? page.sources : []) check(source)
    for (const section of Array.isArray(page.sections) ? page.sections : []) {
      if (!section || typeof section !== 'object') continue
      for (const source of Array.isArray(section.sources) ? section.sources : []) check(source)
    }
    if (missing.size === 0) continue
    let entry = byPage.get(pageKey)
    if (!entry) {
      entry = { slug, title, sources: new Set() }
      byPage.set(pageKey, entry)
    }
    for (const path of missing) entry.sources.add(path)
  }
  const pages = [...byPage.values()]
    .map(page => ({
      slug: page.slug,
      title: page.title,
      sources: [...page.sources].sort(),
    }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug))
  const truncated = pages.length > MAX_BROKEN_CITATION_PAGES
    || pages.some(page => page.sources.length > MAX_BROKEN_CITATION_SOURCES)
  return {
    total: missingPaths.size,
    references,
    pages: pages.slice(0, MAX_BROKEN_CITATION_PAGES).map(page => ({
      ...page,
      sources: page.sources.slice(0, MAX_BROKEN_CITATION_SOURCES),
    })),
    truncated,
  }
}

/**
 * 检查 Wiki 引用的 `#Lx-Ly` 行号范围是否落在文件行数内。
 *
 * 行数来自索引 `files[].lines`（v6 起）。旧索引或未索引文件没有行数：
 * 这些引用计入 `unchecked`（无法验证），不计入越界。缺失文件的引用由
 * `findBrokenWikiCitations` 负责，本函数在提供 `knownPaths` 时不重复计入
 * unchecked。
 * @param {{pages?:WikiManifestPage[]}|null} manifest - Wiki 清单。
 * @param {Map<string, number>|Record<string, number>} [lineCounts] - 相对路径 → 行数。
 * @param {Set<string>|Iterable<string>|null} [knownPaths] - 已确认存在的路径；
 *   提供时只有存在但缺行数的引用计入 unchecked。
 * @returns {{total:number, unchecked:number,
 *   pages:Array<{slug:string, title:string,
 *     issues:Array<{path:string, start:number, end:number, lines:number}>}>,
 *   truncated:boolean}} 越界统计与有界明细。
 */
export function findCitationRangeIssues(manifest, lineCounts = new Map(), knownPaths = null) {
  /** @type {Map<string, number>} */
  const counts = lineCounts instanceof Map
    ? lineCounts
    : new Map(Object.entries(lineCounts ?? {}))
  const known = knownPaths
    ? (knownPaths instanceof Set ? knownPaths : new Set(knownPaths))
    : null
  /** @type {Map<string, {slug:string, title:string, issues:Map<string, {path:string, start:number, end:number, lines:number}>}>} */
  const byPage = new Map()
  let total = 0
  let unchecked = 0
  /**
   * 校验一处引用。
   * @param {unknown} source - 引用值。
   * @param {string} slug - 页面 slug。
   * @param {string} title - 页面标题。
   * @returns {void}
   */
  const check = (source, slug, title) => {
    const parsed = parseWikiSource(source)
    if (!parsed.path || !Number.isInteger(parsed.start)) return
    const start = parsed.start
    const end = Number.isInteger(parsed.end) ? parsed.end : start
    const lines = counts.get(parsed.path)
    if (!Number.isInteger(lines)) {
      if (!known || known.has(parsed.path)) unchecked++
      return
    }
    const invalid = start < 1 || end < start || start > lines || end > lines
    if (!invalid) return
    total++
    const pageKey = `${slug}\u0000${title}`
    let entry = byPage.get(pageKey)
    if (!entry) {
      entry = { slug, title, issues: new Map() }
      byPage.set(pageKey, entry)
    }
    entry.issues.set(`${parsed.path}\u0000${start}\u0000${end}`, {
      path: parsed.path, start, end, lines,
    })
  }
  for (const page of Array.isArray(manifest?.pages) ? manifest.pages : []) {
    if (!page || typeof page !== 'object') continue
    const slug = typeof page.slug === 'string' ? page.slug : ''
    const title = typeof page.title === 'string' && page.title ? page.title : slug
    for (const source of Array.isArray(page.sources) ? page.sources : []) check(source, slug, title)
    for (const section of Array.isArray(page.sections) ? page.sections : []) {
      if (!section || typeof section !== 'object') continue
      for (const source of Array.isArray(section.sources) ? section.sources : []) check(source, slug, title)
    }
  }
  const pages = [...byPage.values()]
    .map(page => ({
      slug: page.slug,
      title: page.title,
      issues: [...page.issues.values()]
        .sort((a, b) => a.path.localeCompare(b.path) || a.start - b.start || a.end - b.end),
    }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug))
  const truncated = pages.length > MAX_CITATION_RANGE_PAGES
    || pages.some(page => page.issues.length > MAX_CITATION_RANGE_ISSUES)
  return {
    total,
    unchecked,
    pages: pages.slice(0, MAX_CITATION_RANGE_PAGES).map(page => ({
      ...page,
      issues: page.issues.slice(0, MAX_CITATION_RANGE_ISSUES),
    })),
    truncated,
  }
}
