/**
 * 提取与生成子代理的 prompt 构造（纯函数）。
 *
 * spawn 子代理是 fresh 会话（无父对话历史，subagent.zh.md），prompt 必须
 * 自包含：任务、上下文、约束、输出要求。token 预算由调用方控制
 * （源码截断/卡片数量上限）。
 */

import { MAX_SOURCE_CHARS } from './schema.js'

/**
 * 构造单文件卡片提取的 prompt。
 * @param {{path:string, lang:string, symbols:Array, source:string}} file - 文件路径、语言、符号清单与源码（已截断）。
 * @param {string} locale - 卡片语言代码（zh/en）。
 * @returns {string} prompt 文本。
 */
export function extractPrompt(file, locale) {
  const langName = locale === 'zh' ? '中文' : 'English'
  const symbolLines = file.symbols.length > 0
    ? file.symbols.map(s => `- ${s.name} (${s.kind}, line ${s.line}${s.parent ? `, in ${s.parent}` : ''})`).join('\n')
    : '(no symbols extracted)'
  const truncated = file.truncated
    ? `\nNOTE: the source is truncated at ${MAX_SOURCE_CHARS} characters; extract mainly from what you see plus the symbol list.\n`
    : ''
  return [
    `You are writing one knowledge card for a code repository wiki.`,
    `Write all human-readable fields in ${langName}.`,
    ``,
    `File: ${file.path}`,
    `Language: ${file.lang}`,
    `Symbols found in this file:`,
    symbolLines,
    truncated,
    `Source code:`,
    '```' + fenceLang(file.lang),
    file.source,
    '```',
    ``,
    `Task:`,
    `1. Read the code and decide whether this file deserves a knowledge card (skip generated files, trivial constants, or files with no meaningful behavior).`,
    `2. If yes: fill title/summary/purpose/keySymbols/pitfalls/relatedModules/tags. Only state behavior proven by the code; do not speculate. Keep summary within 2-3 sentences, note within one sentence each.`,
    `3. If no: set skip=true and give skipReason.`,
    ``,
    `Return the JSON object matching the requested schema. Do not include markdown fences or extra text.`,
  ].join('\n')
}

/**
 * 构造 Wiki 生成的 prompt。
 * @param {Array<{path:string, title:string, summary:string, keySymbols:{name:string,note:string}[], tags:string[]}>} cards
 *   卡片摘要（由 knowledge 层读取并裁剪）。
 * @param {{technologies:{name:string,ecosystem:string}[], projectName?:string}} stack - 技术栈与项目名。
 * @param {string} locale - 页面语言。
 * @returns {string} prompt 文本。
 */
export function generatePrompt(cards, stack, locale) {
  const langName = locale === 'zh' ? '中文' : 'English'
  const cardLines = cards.map(c =>
    `- ${c.path} — ${c.title}\n  summary: ${c.summary}\n  symbols: ${c.keySymbols.map(s => `${s.name} (${s.note})`).join('; ') || '(none)'}\n  tags: ${c.tags.join(', ') || '(none)'}`)
    .join('\n')
  const techs = stack.technologies.map(t => `${t.name} (${t.ecosystem})`).join(', ') || '(none detected)'
  return [
    `You are synthesizing a repository wiki from knowledge cards.`,
    `Write all content (titles, overviews, section bodies) in ${langName}.`,
    ``,
    `Project: ${stack.projectName || '(unnamed)'}`,
    `Tech stack: ${techs}`,
    ``,
    `Knowledge cards (${cards.length}):`,
    cardLines,
    ``,
    `Task:`,
    `1. Group the cards into a small number of wiki pages (e.g. overview, core modules, data flow). Do not produce one page per card.`,
    `2. Each page: title, ascii kebab slug, 1-2 sentence overview, sections with Markdown bodies that reference the actual file paths and symbol names from the cards.`,
    `3. Where a page describes relationships or flows, add a mermaid diagram in the mermaid field (mermaid syntax only, no fences); otherwise leave mermaid empty.`,
    `4. Only use facts present in the cards; do not invent modules, symbols, or behavior.`,
    ``,
    `Return the JSON object matching the requested schema. Do not include markdown fences or extra text.`,
  ].join('\n')
}

/**
 * 选代码围栏语言标识（源码高亮用）。
 * @param {string} lang - 语言标识。
 * @returns {string} 围栏语言。
 */
function fenceLang(lang) {
  switch (lang) {
    case 'javascript': return 'javascript'
    case 'typescript': return 'typescript'
    case 'python': return 'python'
    default: return ''
  }
}
