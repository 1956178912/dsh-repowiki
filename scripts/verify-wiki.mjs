#!/usr/bin/env node
// @ts-check
/**
 * Wiki 新鲜度门禁（本地/CI 工具，非运行时依赖）。
 *
 * 校验 `.dsh-repowiki/wiki/<locale>/_index.json`：
 * - 缺失引用路径（索引 + 文件系统探测，最多 200 个）
 * - 行号越界（索引 v6 起记录 `files[].lines`）
 * - 引用内容漂移（清单 v3 `citationDigests`）
 * - 陈旧 Wiki（卡片与已采信记忆的 `inputDigest`/`memoryDigest` 与清单不一致）
 * - 清单登记但磁盘缺失的页面（孤儿页仅告警）
 * - 清单页面路径非法/与页面位置不符，以及页面内相对链接死链或越出项目根
 * - 上次生成失败页（清单 `failed`/`failedTotal`）
 * - 空清单（默认告警，`--strict`/`--require` 失败）
 * - 指纹覆盖率（默认仅告警，`--strict` 时失败）
 *
 * `--json` 另外输出 `problems[{code, severity, message, locale?}]`，供 CI
 * 按稳定问题码聚合或抑制，而不必解析英文文本。
 *
 * 用法：
 *   node scripts/verify-wiki.mjs [--root <dir>] [--locale zh] [--strict] [--json]
 *
 * 退出码：
 *   0 = 通过（没有 Wiki 资产也算通过，除非显式指定了缺失的 locale）
 *   1 = 存在断链 / 行号越界 / 内容漂移 / 陈旧 Wiki（严格模式还包含未覆盖/未验证）
 *   2 = 参数或读取错误
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  findBrokenWikiCitations, findCitationRangeIssues, normalizeWikiSource,
} from '../src/wiki-references.js'
import {
  checkCitationDrift, summarizeCitationCoverage, citationCoveragePages,
} from '../src/citation-drift.js'
import { parseCard } from '../src/knowledge.js'
import { parseMemoryText } from '../src/memory.js'
import { MEMORY_DIR } from '../src/schema.js'
import { digestText, parseFrontmatter } from '../src/util.js'

const ASSET_DIR = '.dsh-repowiki'
const WIKI_DIR = 'wiki'
const INDEX_FILE = 'index.json'
const MANIFEST_FILE = '_index.json'

/** 非索引引用的文件系统探测上限（与 status 一致）。 */
const MAX_FS_PROBES = 200

/** 发现 Wiki 页面的目录深度上限（与 listWikiPages 一致）。 */
const MAX_PAGE_DEPTH = 3

/** 页面内部链接的存在性探测上限（防止异常页面放大 IO）。 */
const MAX_LINK_PROBES = 200

/** 卡片/记忆/页面读取的并发上限（本地文件小、读多时收益明显）。 */
const READ_CONCURRENCY = 8

/**
 * 有界并发映射，结果保持输入顺序。
 * @param {Array} items - 输入数组。
 * @param {number} limit - 并发上限。
 * @param {(item:any, index:number)=>Promise<any>} fn - 异步映射函数。
 * @returns {Promise<Array>} 与输入同序的结果。
 */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (true) {
        const index = cursor++
        if (index >= items.length) return
        results[index] = await fn(items[index], index)
      }
    },
  )
  await Promise.all(workers)
  return results
}

/**
 * 提取 Markdown 正文中的相对链接（跳过代码、图片、外链、锚点与根路径）。
 *
 * Wiki 页面也会直接链接到源码或文档（例如 `../../../src/indexer.js#L10`），
 * 这些链接与 `.md` 页面链接一样会随重构失效，因此统一纳入存在性校验。
 * @param {string} text - 页面正文。
 * @returns {string[]} 目标路径（已剥离锚点与查询串，保留原始 URL 编码）。
 */
function extractRelativeLinks(text) {
  const sanitized = String(text ?? '')
    // 代码块/行内代码里的示例链接不应被当成真实链接
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '')
  const links = []
  const re = /(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let match
  while ((match = re.exec(sanitized))) {
    if (match[1] === '!') continue
    const raw = match[2].trim()
    if (!raw || raw.startsWith('#') || raw.startsWith('/')) continue
    // 任意 URI scheme（https:、mailto:、tel:、data:、javascript: …）都不做文件探测。
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue
    const hash = raw.indexOf('#')
    const withoutHash = hash >= 0 ? raw.slice(0, hash) : raw
    const query = withoutHash.indexOf('?')
    const target = query >= 0 ? withoutHash.slice(0, query) : withoutHash
    if (!target) continue
    links.push(target)
  }
  return links
}

const USAGE = [
  'Usage: node scripts/verify-wiki.mjs [options]',
  '',
  '  --root <dir>      Project root (default: current directory)',
  '  --locale <name>   Verify one locale (repeatable; default: every wiki locale)',
  '  --require         Fail when no wiki manifest exists (for CI)',
  '  --strict          Also fail on untracked citations and unverifiable digests',
  '  --json            Machine-readable output',
  '  --help            Show this help',
  '',
  'Exit codes: 0 pass, 1 verification failed, 2 usage/read error.',
].join('\n')

/**
 * 解析命令行参数。
 * @param {string[]} argv - 参数（不含 node 与脚本名）。
 * @returns {{root:string, locales:string[], strict:boolean, json:boolean, help:boolean,
 *   require:boolean}} 解析结果。
 */
export function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    locales: [],
    strict: false,
    json: false,
    help: false,
    require: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--strict') { args.strict = true; continue }
    if (arg === '--require') { args.require = true; continue }
    if (arg === '--json') { args.json = true; continue }
    if (arg === '--help' || arg === '-h') { args.help = true; continue }
    if (arg === '--root') {
      const value = argv[++i]
      if (!value) throw new Error('--root requires a directory')
      args.root = path.resolve(value)
      continue
    }
    if (arg === '--locale') {
      const value = argv[++i]
      if (!value) throw new Error('--locale requires a name')
      if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`invalid locale: ${value}`)
      args.locales.push(value)
      continue
    }
    throw new Error(`unknown argument: ${arg}`)
  }
  return args
}

/**
 * 读取 JSON 文件；缺失与损坏分开报告。
 * @param {string} file - 绝对路径。
 * @returns {Promise<{exists:boolean, value:any, error:string}>} 读取结果。
 */
async function readJson(file) {
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (err) {
    if (err?.code === 'ENOENT') return { exists: false, value: null, error: '' }
    return { exists: true, value: null, error: err?.message ?? String(err) }
  }
  try {
    return { exists: true, value: JSON.parse(text), error: '' }
  } catch (err) {
    return { exists: true, value: null, error: err?.message ?? String(err) }
  }
}

/**
 * 判断路径是否为普通文件。
 * @param {string} file - 绝对路径。
 * @returns {Promise<boolean>} 是否存在且为文件。
 */
async function isFile(file) {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

/**
 * 判断路径是否存在（文件或目录；目录链接也是有效目标）。
 * @param {string} target - 绝对路径。
 * @returns {Promise<boolean>} 是否存在。
 */
async function pathExists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

/**
 * 读取索引（缺失/损坏不抛出，交由调用方报告）。
 * @param {string} root - 项目根。
 * @returns {Promise<{exists:boolean, compatible:boolean, schemaVersion?:number,
 *   files:Array<{path?:string, lines?:number}>, error:string}>} 索引摘要。
 */
async function loadIndex(root) {
  const loaded = await readJson(path.join(root, ASSET_DIR, INDEX_FILE))
  if (!loaded.exists) return { exists: false, compatible: false, files: [], error: '' }
  if (!loaded.value || !Array.isArray(loaded.value.files)) {
    return {
      exists: true,
      compatible: false,
      files: [],
      error: loaded.error || 'index.json is not a valid index',
    }
  }
  return {
    exists: true,
    compatible: true,
    ...(typeof loaded.value.schemaVersion === 'number' ? { schemaVersion: loaded.value.schemaVersion } : {}),
    files: loaded.value.files,
    error: '',
  }
}

/**
 * 收集清单里的引用路径（页级 + 章节级去重）。
 * @param {object|null} manifest - Wiki 清单。
 * @returns {Set<string>} 归一化后的相对路径。
 */
function collectCited(manifest) {
  const cited = new Set()
  for (const page of Array.isArray(manifest?.pages) ? manifest.pages : []) {
    for (const source of Array.isArray(page?.sources) ? page.sources : []) {
      const rel = normalizeWikiSource(source)
      if (rel) cited.add(rel)
    }
    for (const section of Array.isArray(page?.sections) ? page.sections : []) {
      for (const source of Array.isArray(section?.sources) ? section.sources : []) {
        const rel = normalizeWikiSource(source)
        if (rel) cited.add(rel)
      }
    }
  }
  return cited
}

/**
 * 构建"存在"引用集合：索引路径优先，非索引路径做有界文件系统探测。
 * @param {string} root - 项目根。
 * @param {object} manifest - Wiki 清单。
 * @param {Array<{path?:string}>} indexFiles - 索引文件条目。
 * @returns {Promise<{known:Set<string>, capped:boolean}>} 已知路径与探测截断标记。
 */
async function resolveKnown(root, manifest, indexFiles) {
  const known = new Set()
  for (const file of indexFiles) {
    if (file && typeof file.path === 'string') known.add(file.path)
  }
  const cited = collectCited(manifest)
  let probes = 0
  let capped = false
  for (const rel of cited) {
    if (known.has(rel)) continue
    // 绝对路径/上跳路径不是合法引用：交给 findBrokenWikiCitations 报缺失。
    if (rel.startsWith('/') || /^[A-Za-z]:\//.test(rel) || rel.split('/').includes('..')) continue
    if (probes >= MAX_FS_PROBES) {
      capped = true
      break
    }
    probes++
    if (await isFile(path.join(root, rel))) known.add(rel)
  }
  if (capped) {
    for (const rel of cited) known.add(rel)
  }
  return { known, capped }
}

/**
 * 从索引条目构建行数映射。
 * @param {Array<{path?:string, lines?:number}>} files - 索引文件条目。
 * @returns {Map<string, number>} 路径 → 行数。
 */
function lineCounts(files) {
  const counts = new Map()
  for (const file of files) {
    if (file && typeof file.path === 'string'
      && Number.isInteger(file.lines) && file.lines >= 0) {
      counts.set(file.path, file.lines)
    }
  }
  return counts
}

/**
 * 读取某 locale 的卡片元数据（按源路径去重，与 generate 的 inputDigest 口径一致）。
 * @param {string} root - 项目根。
 * @param {string} locale - 语言。
 * @returns {Promise<Map<string, {sourceDigest?:string}>>} 源路径 → 卡片元数据。
 */
async function readCards(root, locale) {
  const dir = path.join(root, ASSET_DIR, 'knowledge', locale)
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return new Map()
  }
  const cards = new Map()
  const files = entries.filter(entry => entry.isFile() && entry.name.endsWith('.md'))
  const parsedCards = await mapLimit(files, READ_CONCURRENCY, async (entry) => {
    try {
      const parsed = parseCard(await readFile(path.join(dir, entry.name), 'utf8'))
      return parsed && typeof parsed.meta.path === 'string' ? parsed.meta : null
    } catch {
      // 单张坏卡不阻断门禁；缺失会让 inputDigest 不匹配而报 stale
      return null
    }
  })
  for (const meta of parsedCards) {
    if (meta) cards.set(meta.path, meta)
  }
  return cards
}

/**
 * 计算卡片集合的 inputDigest（与 repowiki-generate 相同）。
 * @param {Map<string, {sourceDigest?:string}>} cards - 源路径 → 卡片元数据。
 * @returns {string} sha256-16。
 */
function cardsDigest(cards) {
  return digestText(
    [...cards.entries()]
      .map(([sourcePath, card]) => `${sourcePath}:${card.sourceDigest ?? ''}`)
      .sort()
      .join('\n'),
    16,
  )
}

/**
 * 读取某 locale 的已采信记忆（正文口径与 repowiki-generate 一致）。
 * @param {string} root - 项目根。
 * @param {string} locale - 语言。
 * @returns {Promise<Map<string, string>>} slug → 去掉一级标题的正文。
 */
async function readMemories(root, locale) {
  const dir = path.join(root, ASSET_DIR, MEMORY_DIR, locale)
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return new Map()
  }
  const memories = new Map()
  const files = entries.filter(entry => entry.isFile() && entry.name.endsWith('.md'))
  const parsedMemories = await mapLimit(files, READ_CONCURRENCY, async (entry) => {
    try {
      const parsed = parseMemoryText(await readFile(path.join(dir, entry.name), 'utf8'))
      if (!parsed || parsed.meta.status !== 'accepted') return null
      return {
        slug: entry.name.replace(/\.md$/, ''),
        body: parsed.body.replace(/^\s*#[^\n]*\n+/, '').trim(),
      }
    } catch {
      // 单条坏记忆不阻断门禁；缺失会让 memoryDigest 不匹配而报 stale
      return null
    }
  })
  for (const item of parsedMemories) {
    if (item) memories.set(item.slug, item.body)
  }
  return memories
}

/**
 * 计算已采信记忆集合的 memoryDigest（与 repowiki-generate 相同）。
 * @param {Map<string, string>} memories - slug → 正文。
 * @returns {string} sha256-16。
 */
function memoriesDigest(memories) {
  return digestText(
    [...memories.entries()].map(([slug, body]) => `${slug}:${body}`).sort().join('\n'),
    16,
  )
}

/**
 * 枚举某 locale 的 Wiki 页面文件（slug 优先取 frontmatter，与 listWikiPages 一致）。
 * @param {string} root - 项目根。
 * @param {string} locale - 语言。
 * @returns {Promise<Map<string, {path:string, rel:string, title:string, text:string}>>}
 *   slug → 页面信息（rel 相对资产根，text 为正文）。
 */
async function readWikiPages(root, locale) {
  const base = path.join(root, ASSET_DIR, WIKI_DIR, locale)
  /** @type {string[]} */
  const files = []
  /**
   * 递归枚举目录（深度上限防异常树），只收集文件路径。
   * @param {string} dir - 绝对目录。
   * @param {number} depth - 当前深度。
   * @returns {Promise<void>}
   */
  const walk = async (dir, depth) => {
    if (depth > MAX_PAGE_DEPTH) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), depth + 1)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      files.push(path.join(dir, entry.name))
    }
  }
  await walk(base, 0)
  const parsedPages = await mapLimit(files, READ_CONCURRENCY, async (file) => {
    let slug = path.basename(file, '.md')
    let title = slug
    let text = ''
    try {
      text = await readFile(file, 'utf8')
      const parsed = parseFrontmatter(text)
      if (parsed) {
        if (typeof parsed.meta.slug === 'string' && parsed.meta.slug) slug = parsed.meta.slug
        if (typeof parsed.meta.title === 'string' && parsed.meta.title) title = parsed.meta.title
        text = parsed.body
      }
    } catch {
      // 坏页仍以文件名参与缺失/孤儿判定
    }
    return {
      slug,
      page: {
        path: path.relative(root, file).split(path.sep).join('/'),
        rel: path.relative(path.join(root, ASSET_DIR), file).split(path.sep).join('/'),
        title,
        text,
      },
    }
  })
  const pages = new Map()
  for (const item of parsedPages) pages.set(item.slug, item.page)
  return pages
}

/**
 * 校验单个 locale。
 * @param {string} root - 项目根。
 * @param {string} locale - 语言目录名。
 * @param {{files:Array<{path?:string, lines?:number}>}} index - 索引摘要。
 * @param {boolean} strict - 严格模式。
 * @param {boolean} requireAssets - 要求存在可用资产（空清单失败）。
 * @returns {Promise<object>} locale 结果。
 */
async function verifyLocale(root, locale, index, strict, requireAssets) {
  const manifestRel = `${ASSET_DIR}/${WIKI_DIR}/${locale}/${MANIFEST_FILE}`
  const loaded = await readJson(path.join(root, ASSET_DIR, WIKI_DIR, locale, MANIFEST_FILE))
  if (!loaded.exists) {
    const message = `${manifestRel} is missing`
    return {
      locale,
      manifest: manifestRel,
      ok: false,
      issues: [message],
      warnings: [],
      problems: [{ code: 'manifest/missing', severity: 'error', message }],
      pages: 0,
    }
  }
  if (!loaded.value || !Array.isArray(loaded.value.pages)) {
    const message = `${manifestRel} is not a valid manifest${loaded.error ? `: ${loaded.error}` : ''}`
    return {
      locale,
      manifest: manifestRel,
      ok: false,
      issues: [message],
      warnings: [],
      problems: [{ code: 'manifest/invalid', severity: 'error', message }],
      pages: 0,
    }
  }
  const manifest = loaded.value
  const issues = []
  const warnings = []
  const problems = []
  /**
   * 记录一个失败项（文本报告 + 结构化问题码）。
   * @param {string} code - 稳定问题码。
   * @param {string} message - 英文可读消息。
   * @returns {void}
   */
  const addIssue = (code, message) => {
    issues.push(message)
    problems.push({ code, severity: 'error', message })
  }
  /**
   * 记录一个警告项（文本报告 + 结构化问题码）。
   * @param {string} code - 稳定问题码。
   * @param {string} message - 英文可读消息。
   * @returns {void}
   */
  const addWarning = (code, message) => {
    warnings.push(message)
    problems.push({ code, severity: 'warning', message })
  }
  // 空清单：generate 不会短路（manifestSlugs.length > 0 是前提），
  // 说明生成没有产出页面；--strict/--require 下应阻止其通过。
  if (manifest.pages.length === 0) {
    const message = 'manifest lists no pages'
    if (strict || requireAssets) addIssue('manifest/empty', message)
    else addWarning('manifest/empty', message)
  }
  // 陈旧检查：卡片与已采信记忆的指纹只要有一项与清单不一致，就说明生成后
  // 输入变了；即使引用路径都有效，内容也可能过期。generate 的增量短路同时
  // 比较两者，门禁必须同口径，避免"生成认为要重跑、verify 认为新鲜"。
  const cards = await readCards(root, locale)
  const cardStale = typeof manifest.inputDigest === 'string' && manifest.inputDigest
    ? cardsDigest(cards) !== manifest.inputDigest
    : null
  const memories = await readMemories(root, locale)
  const memoryStale = typeof manifest.memoryDigest === 'string' && manifest.memoryDigest
    ? memoriesDigest(memories) !== manifest.memoryDigest
    : null
  const staleReasons = []
  if (cardStale === true) {
    staleReasons.push('cards')
    addIssue('wiki/stale-cards', 'wiki is stale: cards changed since generation (run repowiki-generate)')
  }
  if (memoryStale === true) {
    staleReasons.push('memory')
    addIssue('wiki/stale-memory', 'wiki is stale: accepted memory changed since generation (run repowiki-generate)')
  }
  const stale = staleReasons.length > 0
    ? true
    : cardStale === null && memoryStale === null ? null : false
  const missingDigests = []
  if (cardStale === null) missingDigests.push('inputDigest')
  if (memoryStale === null) missingDigests.push('memoryDigest')
  if (missingDigests.length > 0) {
    const message = `manifest has no ${missingDigests.join('/')}; stale check skipped`
    if (strict) addIssue('manifest/missing-digests', message)
    else addWarning('manifest/missing-digests', message)
  }
  // 页面完整性：generate 的短路要求清单里的每个 slug 都仍在磁盘上；
  // 缺失页说明 Wiki 被部分删除或写入失败，不重新生成就会一直缺页。
  const diskPages = await readWikiPages(root, locale)
  const manifestSlugs = [...new Set(
    manifest.pages
      .map(page => (typeof page?.slug === 'string' ? page.slug : ''))
      .filter(Boolean),
  )]
  const manifestSlugSet = new Set(manifestSlugs)
  const missingPages = manifestSlugs.filter(slug => !diskPages.has(slug))
  const orphanedPages = [...diskPages.keys()].filter(slug => !manifestSlugSet.has(slug)).sort()
  if (missingPages.length > 0) {
    addIssue('wiki/missing-pages', `${missingPages.length} page(s) in the manifest have no file on disk: ${missingPages.slice(0, 3).join(', ')}`)
  }
  if (orphanedPages.length > 0) {
    addWarning('wiki/orphaned-pages', `${orphanedPages.length} page file(s) are not in the manifest: ${orphanedPages.slice(0, 3).join(', ')}`)
  }
  // 清单路径与页面内部链接：generate 只写净化后的路径，但手工改清单/正文
  // 可能引入跨 locale、路径穿越或指向已删除文件/页面的死链。
  const invalidPagePaths = []
  const pagePathMismatches = []
  for (const page of manifest.pages) {
    const slug = typeof page?.slug === 'string' ? page.slug : ''
    const rel = typeof page?.path === 'string' ? page.path.replace(/\\/g, '/') : ''
    if (!slug || !rel) continue
    if (rel.startsWith('/') || rel.split('/').includes('..')
      || !rel.startsWith(`${WIKI_DIR}/${locale}/`) || !rel.endsWith('.md')) {
      invalidPagePaths.push(`${slug} → ${rel}`)
      continue
    }
    const disk = diskPages.get(slug)
    if (disk && disk.rel !== rel) pagePathMismatches.push(`${slug} → ${rel} (file: ${disk.rel})`)
  }
  if (invalidPagePaths.length > 0) {
    addIssue('wiki/invalid-page-path', `${invalidPagePaths.length} manifest page path(s) are invalid: ${invalidPagePaths.slice(0, 3).join(', ')}`)
  }
  if (pagePathMismatches.length > 0) {
    addIssue('wiki/page-path-mismatch', `${pagePathMismatches.length} manifest page path(s) do not match the file location: ${pagePathMismatches.slice(0, 3).join(', ')}`)
  }
  // 链接按 Markdown 语义相对页面所在目录解析，只拒绝越出**项目根**的目标
  // （页面位于 `.dsh-repowiki/wiki/<locale>/`，`../../../src/x.ts` 是合法
  // 项目内链接）；源码/文档链接与 `.md` 页面链接同样做存在性校验。
  const brokenLinks = []
  const unsafeLinks = []
  const seenLinks = new Set()
  const rootDir = path.resolve(root)
  let linkProbes = 0
  let linkCapped = false
  for (const [slug, page] of diskPages) {
    const pageDir = path.dirname(path.join(rootDir, ASSET_DIR, page.rel))
    for (const rawTarget of extractRelativeLinks(page.text)) {
      let target = rawTarget
      try {
        target = decodeURIComponent(rawTarget)
      } catch {
        // 非法转义保留原值，存在性探测会自然失败
      }
      const resolved = path.resolve(pageDir, target)
      if (seenLinks.has(resolved)) continue
      seenLinks.add(resolved)
      const rel = path.relative(rootDir, resolved)
      if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
        unsafeLinks.push(`${slug} → ${rawTarget}`)
        continue
      }
      const display = rel.split(path.sep).join('/') || '.'
      if (linkProbes >= MAX_LINK_PROBES) {
        linkCapped = true
        break
      }
      linkProbes++
      if (!(await pathExists(resolved))) {
        brokenLinks.push(`${slug} → ${display}`)
      }
    }
    if (linkCapped) break
  }
  if (unsafeLinks.length > 0) {
    addIssue('wiki/unsafe-link', `${unsafeLinks.length} link(s) escape the project root: ${unsafeLinks.slice(0, 3).join(', ')}`)
  }
  if (brokenLinks.length > 0) {
    addIssue('wiki/broken-link', `${brokenLinks.length} relative link(s) point to missing files: ${brokenLinks.slice(0, 3).join(', ')}`)
  }
  if (linkCapped) {
    const message = `relative link existence check stopped after ${MAX_LINK_PROBES} probes; unverified links are not reported as broken`
    if (strict) addIssue('wiki/link-probe-capped', message)
    else addWarning('wiki/link-probe-capped', message)
  }
  // 上次生成失败页：清单已按新输入指纹更新，但部分页面没写成功；
  // 不报告就会把一次不完整的生成当成新鲜 Wiki。
  const failedTotal = Number.isInteger(manifest.failedTotal)
    ? manifest.failedTotal
    : Array.isArray(manifest.failed) ? manifest.failed.length : 0
  if (failedTotal > 0) {
    const message = `manifest records ${failedTotal} failed page(s) from the last generation (run repowiki-generate)`
    if (strict) addIssue('wiki/generation-failed', message)
    else addWarning('wiki/generation-failed', message)
  }
  const { known, capped } = await resolveKnown(root, manifest, index.files)
  const broken = findBrokenWikiCitations(manifest, known)
  const ranges = findCitationRangeIssues(manifest, lineCounts(index.files), known)
  const drift = await checkCitationDrift(manifest, async (rel) => {
    try {
      return await readFile(path.join(root, rel), 'utf8')
    } catch {
      return null
    }
  })
  const coverage = summarizeCitationCoverage(manifest)
  const coveragePages = citationCoveragePages(manifest)
  if (broken.total > 0) addIssue('citation/missing', `${broken.total} missing citation path(s)`)
  if (ranges.total > 0) addIssue('citation/range', `${ranges.total} citation line range(s) out of bounds`)
  if (ranges.unchecked > 0) {
    const message = `${ranges.unchecked} citation line range(s) could not be verified`
    if (strict) addIssue('citation/range-unchecked', message)
    else addWarning('citation/range-unchecked', message)
  }
  if (drift && drift.total > 0) addIssue('citation/drift', `${drift.total} citation(s) changed since generation`)
  if (capped) {
    const message = `citation existence check stopped after ${MAX_FS_PROBES} probes; unverified paths are not reported as broken`
    if (strict) addIssue('citation/probe-capped', message)
    else addWarning('citation/probe-capped', message)
  }
  if (coverage && coverage.untracked > 0) {
    const message = `${coverage.untracked} citation(s) have no content digest`
    if (strict) addIssue('citation/untracked', message)
    else addWarning('citation/untracked', message)
  }
  if (drift && drift.unchecked > 0) {
    const message = `${drift.unchecked} citation(s) could not be verified`
    if (strict) addIssue('citation/unchecked', message)
    else addWarning('citation/unchecked', message)
  }
  return {
    locale,
    manifest: manifestRel,
    ok: issues.length === 0,
    issues,
    warnings,
    problems,
    stale,
    staleReasons,
    pages: manifest.pages.length,
    pageFiles: diskPages.size,
    missingPages,
    orphanedPages,
    invalidPagePaths,
    pagePathMismatches,
    brokenLinks,
    unsafeLinks,
    linkProbeCapped: linkCapped,
    failedPages: failedTotal,
    broken,
    ranges,
    drift,
    coverage,
    coveragePages,
  }
}

/**
 * 发现包含清单或 Markdown 页面的 locale 目录。
 * @param {string} root - 项目根。
 * @returns {Promise<string[]>} 排序后的 locale 列表。
 */
async function discoverLocales(root) {
  const base = path.join(root, ASSET_DIR, WIKI_DIR)
  let entries
  try {
    entries = await readdir(base, { withFileTypes: true })
  } catch {
    return []
  }
  const locales = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(base, entry.name)
    let children
    try {
      children = await readdir(dir)
    } catch {
      continue
    }
    if (children.includes(MANIFEST_FILE) || children.some(name => name.endsWith('.md'))) {
      locales.push(entry.name)
    }
  }
  return locales.sort((a, b) => a.localeCompare(b))
}

/**
 * 校验 Wiki 资产。
 * @param {{root?:string, locales?:string[], strict?:boolean, requireAssets?:boolean}} [options]
 *   选项；`requireAssets` 为 true 时没有 Wiki 清单或清单为空也判失败（CI 用）。
 * @returns {Promise<{root:string, strict:boolean, ok:boolean, issues:string[],
 *   warnings:string[], problems:Array<{code:string, severity:string, message:string, locale?:string}>,
 *   locales:object[], index:object, totals:object}>} 结果。
 */
export async function verifyWiki(options = {}) {
  const root = path.resolve(options.root ?? process.cwd())
  const strict = options.strict === true
  const requireAssets = options.requireAssets === true
  const requested = Array.isArray(options.locales) ? [...new Set(options.locales)] : []
  const index = await loadIndex(root)
  const globalProblems = []
  if (index.error) {
    globalProblems.push({ code: 'index/read-error', severity: 'error', message: `index.json: ${index.error}` })
  }
  // 索引 v6 才记录行数；旧索引下越界检查只能部分覆盖，严格模式应视为
  // 不可验证而失败，而不是静默放过。
  if (index.exists && index.compatible
    && typeof index.schemaVersion === 'number' && index.schemaVersion < 6) {
    globalProblems.push({
      code: 'index/outdated',
      severity: strict ? 'error' : 'warning',
      message: `index schema v${index.schemaVersion} has no line counts; range checks are limited (run repowiki-index)`,
    })
  }
  const globalIssues = globalProblems
    .filter(problem => problem.severity === 'error')
    .map(problem => problem.message)
  const globalWarnings = globalProblems
    .filter(problem => problem.severity === 'warning')
    .map(problem => problem.message)
  const targetLocales = requested.length > 0 ? requested : await discoverLocales(root)
  if (targetLocales.length === 0) {
    const missing = 'no wiki manifests found'
    const problems = [
      ...globalProblems,
      { code: 'assets/missing', severity: requireAssets ? 'error' : 'warning', message: missing },
    ]
    return {
      root,
      strict,
      ok: problems.every(problem => problem.severity !== 'error'),
      issues: problems.filter(problem => problem.severity === 'error').map(problem => problem.message),
      warnings: problems.filter(problem => problem.severity === 'warning').map(problem => problem.message),
      problems,
      locales: [],
      index: summarizeIndex(index),
      totals: { pages: 0, citations: 0, tracked: 0, untracked: 0, broken: 0, outOfRange: 0, drift: 0 },
    }
  }
  const locales = []
  for (const locale of targetLocales) {
    locales.push(await verifyLocale(root, locale, index, strict, requireAssets))
  }
  const issues = [...globalIssues]
  const warnings = [...globalWarnings]
  const problems = [...globalProblems]
  for (const result of locales) {
    for (const issue of result.issues) issues.push(`${result.locale}: ${issue}`)
    for (const warning of result.warnings) warnings.push(`${result.locale}: ${warning}`)
    for (const problem of result.problems ?? []) problems.push({ ...problem, locale: result.locale })
  }
  const totals = { pages: 0, citations: 0, tracked: 0, untracked: 0, broken: 0, outOfRange: 0, drift: 0 }
  for (const result of locales) {
    totals.pages += result.pages ?? 0
    totals.citations += result.coverage?.total ?? 0
    totals.tracked += result.coverage?.tracked ?? 0
    totals.untracked += result.coverage?.untracked ?? 0
    totals.broken += result.broken?.total ?? 0
    totals.outOfRange += result.ranges?.total ?? 0
    totals.drift += result.drift?.total ?? 0
  }
  return {
    root,
    strict,
    ok: issues.length === 0,
    issues,
    warnings,
    problems,
    locales,
    index: summarizeIndex(index),
    totals,
  }
}

/**
 * 索引摘要（去掉完整 files，避免 JSON 输出膨胀）。
 * @param {{exists:boolean, compatible:boolean, schemaVersion?:number, files:Array}} index
 *   索引读取结果。
 * @returns {{exists:boolean, compatible:boolean, schemaVersion?:number, files:number}}
 *   摘要。
 */
function summarizeIndex(index) {
  return {
    exists: index.exists,
    compatible: index.compatible,
    ...(typeof index.schemaVersion === 'number' ? { schemaVersion: index.schemaVersion } : {}),
    files: Array.isArray(index.files) ? index.files.length : 0,
  }
}

/**
 * 渲染人类可读报告。
 * @param {Awaited<ReturnType<typeof verifyWiki>>} result - 校验结果。
 * @returns {string} 文本报告。
 */
export function formatReport(result) {
  const lines = [`Wiki verification: ${result.root}`]
  const index = result.index
  lines.push(`Index: ${index.exists
    ? `${index.compatible ? `v${index.schemaVersion ?? '?'} (${index.files} files)` : 'INCOMPATIBLE'}`
    : 'missing'}`)
  if (result.locales.length === 0) lines.push('No wiki manifests found.')
  for (const locale of result.locales) {
    const staleNote = locale.stale === true
      ? ` (stale${Array.isArray(locale.staleReasons) && locale.staleReasons.length > 0 ? `: ${locale.staleReasons.join(', ')}` : ''})`
      : ''
    lines.push(`${locale.locale}: ${locale.pages} page(s), ${locale.coverage?.total ?? 0} citation(s) (${locale.coverage?.tracked ?? 0} tracked, ${locale.coverage?.untracked ?? 0} untracked)${staleNote}`)
    lines.push(`  broken ${locale.broken?.total ?? 0} / out-of-range ${locale.ranges?.total ?? 0} / drift ${locale.drift?.total ?? 0}`)
    for (const issue of locale.issues) lines.push(`  - ${issue}`)
    for (const warning of locale.warnings) lines.push(`  ! ${warning}`)
    const broken = locale.broken?.pages?.[0]
    if (broken) lines.push(`    e.g. missing ${broken.title}: ${broken.sources.slice(0, 3).join(', ')}`)
    const range = locale.ranges?.pages?.[0]?.issues?.[0]
    if (range) lines.push(`    e.g. out-of-range ${locale.ranges.pages[0].title}: ${range.path}#L${range.start}-L${range.end} (file has ${range.lines} lines)`)
    const drift = locale.drift?.pages?.[0]?.issues?.[0]
    if (drift) lines.push(`    e.g. drift ${locale.drift.pages[0].title}: ${drift.source}`)
    const coverage = locale.coveragePages?.pages?.[0]
    if (coverage) lines.push(`    e.g. untracked ${coverage.title}: ${coverage.untracked}`)
    const link = locale.brokenLinks?.[0]
    if (link) lines.push(`    e.g. broken link ${link}`)
  }
  lines.push(result.ok ? 'Result: PASS' : 'Result: FAIL')
  return lines.join('\n')
}

/**
 * CLI 入口。
 * @param {string[]} [argv] - 参数（不含 node 与脚本名）。
 * @returns {Promise<number>} 退出码。
 */
export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (args.help) {
    console.log(USAGE)
    return 0
  }
  const result = await verifyWiki({
    root: args.root,
    locales: args.locales,
    strict: args.strict,
    requireAssets: args.require,
  })
  console.log(args.json ? JSON.stringify(result, null, 2) : formatReport(result))
  return result.ok ? 0 : 1
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().then((code) => {
    process.exitCode = code
  }).catch((err) => {
    console.error(`verify-wiki: ${err?.message ?? err}`)
    process.exitCode = 2
  })
}
