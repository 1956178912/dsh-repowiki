/**
 * 卡片与 Wiki 页面的 Markdown 渲染（纯函数）。
 *
 * 子代理返回受约束 JSON；Markdown 格式由插件统一渲染，避免 LLM 输出
 * 格式漂移（方案 §6.3：卡片/Wiki 的形态由插件控制）。
 */

import { CARD_SCHEMA_VERSION } from './schema.js'
import { encodeFrontmatter } from './util.js'

/**
 * 单张知识卡片 JSON → Markdown。
 * @param {object} card - 卡片结构化数据（cardOutputSchema 的输出）。
 * @param {{path:string, lang:string, generatedAt:string, locale:string, sourceDigest?:string, manuallyEdited?:boolean}} meta
 *   文件级元数据（sourceDigest 来自 index.json 的文件条目，供失效检测）。
 * @returns {string} 卡片 Markdown。
 */
export function renderCardMarkdown(card, meta) {
  const symbols = card.keySymbols.map(s => `- \`${s.name}\` (${s.kind}): ${s.note}`).join('\n')
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
    `> ${meta.path}`,
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
 * Wiki 页 JSON → Markdown。
 * @param {object} page - 页面结构化数据（wikiOutputSchema 的 pages 项）。
 * @param {{generatedAt:string, locale:string}} meta - 生成元数据。
 * @returns {string} 页面 Markdown。
 */
export function renderWikiMarkdown(page, meta) {
  const sections = page.sections.map(s => `## ${s.heading}\n\n${s.body}`).join('\n\n')
  const mermaid = page.mermaid && page.mermaid.trim().length > 0
    ? `\n\n\`\`\`mermaid\n${page.mermaid.trim()}\n\`\`\``
    : ''
  return encodeFrontmatter({
    schemaVersion: 1,
    title: page.title,
    slug: page.slug,
    locale: meta.locale,
    generatedAt: meta.generatedAt,
  }) + [
    `# ${page.title}`,
    ``,
    page.overview,
    ``,
    sections,
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
