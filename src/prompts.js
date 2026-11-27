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
 * @param {{projectName?:string, technologies?:string[], modules?:string[]}} [project] -
 *   项目上下文（技术栈与模块路径），用于约束 relatedModules，避免模型臆造模块名。
 * @returns {string} prompt 文本。
 */
export function extractPrompt(file, locale, project = {}) {
  const langName = locale === 'zh' ? '中文' : 'English'
  const symbolLines = file.symbols.length > 0
    ? file.symbols.map(s => `- ${s.name} (${s.kind}, line ${s.line}${s.parent ? `, in ${s.parent}` : ''})`).join('\n')
    : '(no symbols extracted)'
  const truncated = file.truncated
    ? `\nNOTE: the source is truncated at ${MAX_SOURCE_CHARS} characters; extract mainly from what you see plus the symbol list.\n`
    : ''
  const techs = (project.technologies ?? []).filter(name => typeof name === 'string' && name)
  const projectLine = project.projectName
    ? `Project: ${project.projectName}${techs.length > 0 ? ` (${techs.join(', ')})` : ''}`
    : techs.length > 0 ? `Project stack: ${techs.join(', ')}` : ''
  const modules = (project.modules ?? []).filter(path => typeof path === 'string' && path)
  const moduleLine = modules.length > 0
    ? `Modules: ${modules.join(', ')} — use these exact module paths in relatedModules; do not invent new ones.`
    : ''
  return [
    `You are writing one knowledge card for a code repository wiki.`,
    `Write all human-readable fields in ${langName}.`,
    ``,
    ...(projectLine ? [projectLine] : []),
    ...(moduleLine ? [moduleLine] : []),
    ...(projectLine || moduleLine ? [``] : []),
    `File: ${file.path}`,
    `Language: ${file.lang}`,
    `Symbols found in this file:`,
    symbolLines,
    truncated,
    `Source code:`,
    // 四反引号围栏：源码内含 ``` 即可逃出三反引号围栏注入指令；输出虽受
    // outputSchema 约束（最坏是脏卡片），围栏加固降低该注入面
    '````' + fenceLang(file.lang),
    file.source,
    '````',
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
 * 构造 Wiki 主题合成 prompt。
 * @param {Array<object>} cards - 卡片摘要（路径/标题/模块/符号/标签）。
 * @param {{projectName?:string, technologies:Array}} stack - 技术栈。
 * @param {string} locale - zh/en。
 * @param {Array<object>} [memories] - 已采信会话记忆摘要。
 * @param {Array<{from:string, to:string, count:number}>} [moduleRelations]
 *   跨模块 import 边摘要（来自索引），用于约束跨模块关系描述。
 * @param {Array<{files:string[], size:number}>} [cycles]
 *   文件级循环依赖组（强连通分量口径），用于架构风险描述。
 * @param {Array<{path:string, dependents:number}>} [hubs]
 *   被最多文件依赖的入口（fan-in），用于改动风险热点描述。
 * @returns {string} prompt 文本。
 */
export function generatePrompt(cards, stack, locale, memories = [], moduleRelations = [], cycles = [], hubs = []) {
  const langName = locale === 'zh' ? '中文' : 'English'
  const cardLines = cards.map((c) => {
    const symbols = (Array.isArray(c.symbols) ? c.symbols : [])
      .slice(0, 8)
      .map(s => `${s.name} (${s.kind}${typeof s.line === 'number' ? `, L${s.line}${s.endLine && s.endLine > s.line ? `-L${s.endLine}` : ''}` : ''})`)
      .join('; ') || '(none)'
    return `- ${c.path} — ${c.title}\n  module: ${c.module || '.'}\n  summary: ${c.summary}\n  symbols: ${symbols}\n  tags: ${c.tags.join(', ') || '(none)'}`
  }).join('\n')
  const techs = stack.technologies.map(t => `${t.name} (${t.ecosystem})`).join(', ') || '(none detected)'
  const memoryLines = memories.length > 0
    ? memories.map(m => `- ${m.title} — ${m.summary}`).join('\n')
    : '(none)'
  const relationLines = moduleRelations.length > 0
    ? moduleRelations.map(r => `- ${r.from} → ${r.to} (${r.count} edge(s))`).join('\n')
    : '(none)'
  const cycleLines = (Array.isArray(cycles) ? cycles : []).length > 0
    ? cycles.map((cycle) => {
      const shown = (cycle.files ?? []).slice(0, 4).join(' ↔ ')
      const hidden = cycle.size - Math.min(cycle.files?.length ?? 0, 4)
      const route = Array.isArray(cycle.sample) && cycle.sample.length > 2
        ? ` — cycle: ${cycle.sample.join(' → ')}`
        : ''
      return `- ${shown}${hidden > 0 ? ` (+${hidden} more)` : ''}${route}`
    }).join('\n')
    : '(none)'
  const hubLines = (Array.isArray(hubs) ? hubs : []).length > 0
    ? hubs.map(h => `- ${h.path} (${h.dependents} importer(s))`).join('\n')
    : '(none)'
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
    `Reviewed session knowledge (${memories.length}):`,
    memoryLines,
    ``,
    `Module dependencies computed from the index (${moduleRelations.length}):`,
    relationLines,
    ``,
    `Import cycles detected in the index (${Array.isArray(cycles) ? cycles.length : 0}):`,
    cycleLines,
    ``,
    `High-fan-in files computed from the index (${Array.isArray(hubs) ? hubs.length : 0}):`,
    hubLines,
    ``,
    `Task:`,
    `1. Group the cards into a small number of wiki pages (e.g. overview, core modules, data flow). Do not produce one page per card; prefer keeping cards from the same module together and name the module boundary where it helps navigation.`,
    `2. Each page: title, ascii kebab slug, 1-2 sentence overview, sections with Markdown bodies that reference the actual file paths and symbol names from the cards.`,
    `3. Every section must carry a "sources" array naming the card file paths the section is grounded in. Use only the paths listed above; add "#L<line>" (or "#L<start>-L<end>") when pointing at a specific symbol. Leave sources empty only for purely synthesized framing.`,
    `4. Where a page describes relationships or flows, add a mermaid diagram in the mermaid field (mermaid syntax only, no fences). Use "flowchart TD" or "flowchart LR" and wrap nodes that belong to the same module or layer in "subgraph <name>" … "end" blocks so the diagram renders as grouped boxes; keep node labels short and otherwise leave mermaid empty.`,
    `5. Only use facts present in the cards; do not invent modules, symbols, or behavior.`,
    `6. The reviewed session knowledge above is authoritative project convention and decision context. Weave it into the relevant pages (e.g. a conventions or decisions section) and keep each memory title traceable in the prose.`,
    `7. The module dependency list above is computed from the index. When describing cross-module flows, use only those directions and do not add dependencies that are not listed.`,
    `8. The import cycle groups above are likewise computed from the index. If any are listed, call out the circular dependency as an architectural risk in the relevant section; when the list is (none), do not invent cycles.`,
    `9. The high-fan-in list above is also computed from the index (files with the most distinct importers). When describing architectural hotspots or change risk, mention those files by path; when the list is (none), do not invent such files.`,
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
    case 'vue': return 'vue'
    case 'svelte': return 'svelte'
    case 'python': return 'python'
    case 'go': return 'go'
    case 'rust': return 'rust'
    case 'java': return 'java'
    case 'csharp': return 'csharp'
    case 'kotlin': return 'kotlin'
    case 'php': return 'php'
    case 'ruby': return 'ruby'
    case 'swift': return 'swift'
    case 'scala': return 'scala'
    case 'dart': return 'dart'
    case 'elixir': return 'elixir'
    case 'lua': return 'lua'
    case 'zig': return 'zig'
    case 'gleam': return 'gleam'
    case 'shell': return 'bash'
    case 'r': return 'r'
    case 'julia': return 'julia'
    case 'nim': return 'nim'
    case 'ocaml': return 'ocaml'
    case 'haskell': return 'haskell'
    case 'c': return 'c'
    case 'cpp': return 'cpp'
    default: return ''
  }
}
