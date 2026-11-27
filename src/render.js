/**
 * 卡片与 Wiki 页面的 Markdown 渲染（纯函数）。
 *
 * 子代理返回受约束 JSON；Markdown 格式由插件统一渲染，避免 LLM 输出
 * 格式漂移（方案 §6.3：卡片/Wiki 的形态由插件控制）。
 *
 * v0.43.0 起对齐 Qoder Repo Wiki 的可溯源形态（ADR-0006）：
 * - 卡片：源文件引用行走双语标签，关键符号附索引中的行号（`L12-L40`）；
 * - Wiki：页级引用文件块、自动目录、每节"章节来源"（相对路径 + 可选行号）。
 *   引用值由调用方（tool-generate）先按索引白名单净化，渲染层只负责排版。
 */

import { CARD_SCHEMA_VERSION } from './schema.js'
import { encodeFrontmatter } from './util.js'

/**
 * 单张知识卡片 JSON → Markdown。
 * @param {object} card - 卡片结构化数据（cardOutputSchema 的输出）。
 * @param {{path:string, lang:string, generatedAt:string, locale:string, sourceDigest?:string,
 *   manuallyEdited?:boolean, symbols?:Array<{name:string, line:number, endLine?:number}>}} meta
 *   文件级元数据；symbols 为索引中的符号清单（用于给关键符号标注行号）。
 * @returns {string} 卡片 Markdown。
 */
export function renderCardMarkdown(card, meta) {
  const symbolLines = Array.isArray(meta.symbols) ? meta.symbols : []
  const symbols = card.keySymbols.map((s) => {
    const hit = symbolLines.find(x => x.name === s.name)
    const range = hit
      ? (hit.endLine && hit.endLine > hit.line ? `, L${hit.line}-L${hit.endLine}` : `, L${hit.line}`)
      : ''
    return `- \`${s.name}\` (${s.kind}${range}): ${s.note}`
  }).join('\n')
  const pitfalls = card.pitfalls.length > 0
    ? card.pitfalls.map(p => `- ${p}`).join('\n')
    : '- (none)'
  const related = card.relatedModules.length > 0
    ? card.relatedModules.map(r => `- ${r}`).join('\n')
    : '- (none)'
  return encodeFrontmatter({
    schemaVersion: CARD_SCHEMA_VERSION,
    path: meta.path,
    lang: meta.lang,
    locale: meta.locale,
    sourceDigest: meta.sourceDigest ?? '',
    title: card.title,
    tags: card.tags,
    manuallyEdited: meta.manuallyEdited ?? false,
    generatedAt: meta.generatedAt,
  }) + [
    `# ${card.title}`,
    ``,
    `> 源文件 / Source: \`${meta.path}\``,
    ``,
    `## 概要 / Summary`,
    ``,
    card.summary,
    ``,
    `## 职责 / Purpose`,
    ``,
    card.purpose,
    ``,
    `## 关键符号 / Key symbols`,
    ``,
    symbols,
    ``,
    `## 陷阱 / Pitfalls`,
    ``,
    pitfalls,
    ``,
    `## 相关模块 / Related modules`,
    ``,
    related,
    ``,
  ].join('\n')
}

/**
 * 生成章节锚点（GitHub 风格：小写、去标点、空白转连字符；重名追加序号）。
 * @param {string} heading - 章节标题。
 * @param {Map<string, number>} seen - 已用锚点计数。
 * @returns {string} 锚点。
 */
function anchorOf(heading, seen) {
  const base = String(heading)
    .trim()
    .toLowerCase()
    .replace(/[`*_~[\]()#]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section'
  const count = seen.get(base) ?? 0
  seen.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}

/**
 * Wiki 页 JSON → Markdown。
 * @param {object} page - 页面结构化数据（wikiOutputSchema 的 pages 项）。
 * @param {{generatedAt:string, locale:string}} meta - 生成元数据。
 * @returns {string} 页面 Markdown。
 */
export function renderWikiMarkdown(page, meta) {
  const zh = meta.locale === 'zh'
  const sections = Array.isArray(page.sections) ? page.sections : []
  const sourceUnion = []
  const seenSources = new Set()
  for (const section of sections) {
    for (const source of Array.isArray(section.sources) ? section.sources : []) {
      if (typeof source !== 'string' || seenSources.has(source)) continue
      seenSources.add(source)
      sourceUnion.push(source)
    }
  }

  const cite = sourceUnion.length > 0
    ? [
      `**${zh ? '本文引用的文件' : 'Referenced files'}**`,
      ``,
      ...sourceUnion.map(source => `- \`${source}\``),
      ``,
    ]
    : []

  const anchors = new Map()
  // 页面标题先占用自己的锚点：面板渲染时 H1 先于章节处理，二者保持一致
  anchorOf(page.title, anchors)
  const toc = sections.length >= 2
    ? [
      `## ${zh ? '目录' : 'Contents'}`,
      ``,
      ...sections.map((section, i) => `${i + 1}. [${section.heading}](#${anchorOf(section.heading, anchors)})`),
      ``,
    ]
    : []

  const body = sections.map((section) => {
    const sources = Array.isArray(section.sources) ? section.sources.filter(s => typeof s === 'string' && s) : []
    const sourceLine = sources.length > 0
      ? `\n\n**${zh ? '章节来源：' : 'Section sources:'}** ${sources.map(s => `\`${s}\``).join(' · ')}`
      : ''
    return `## ${section.heading}\n\n${section.body}${sourceLine}`
  }).join('\n\n')

  const mermaid = page.mermaid && page.mermaid.trim().length > 0
    ? `\n\n\`\`\`mermaid\n${page.mermaid.trim()}\n\`\`\``
    : ''

  return encodeFrontmatter({
    schemaVersion: 1,
    title: page.title,
    slug: page.slug,
    locale: meta.locale,
    generatedAt: meta.generatedAt,
    ...(meta.inputDigest ? { inputDigest: meta.inputDigest } : {}),
  }) + [
    `# ${page.title}`,
    ``,
    page.overview,
    ``,
    ...cite,
    ...toc,
    body,
  ].join('\n') + mermaid + '\n'
}

/**
 * 校验卡片结构化数据是否满足最小可渲染形态（缺失字段返回 false，
 * 调用方把该文件记为 failed 而不是写坏卡）。skip 缺失也判为不可用：
 * outputSchema 把 skip 列为必填，缺失意味着 structured 未经校验或异常。
 * @param {object} card - 子代理返回的 structured。
 * @returns {boolean} 可渲染。
 */
export function isUsableCard(card) {
  return typeof card === 'object' && card !== null
    && typeof card.title === 'string' && card.title.trim().length > 0
    && typeof card.summary === 'string'
    && typeof card.purpose === 'string'
    && Array.isArray(card.keySymbols)
    && Array.isArray(card.pitfalls)
    && Array.isArray(card.relatedModules)
    && Array.isArray(card.tags)
    && card.skip === false
}
