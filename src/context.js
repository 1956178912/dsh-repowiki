// @ts-check
/**
 * 面向编码任务的确定性上下文打包（纯函数）。
 *
 * 目标不是"尽量多塞文件"，而是在固定字符预算内提供可核验的证据：
 * 任务相关的符号定义、带行号的源码片段、静态 import 邻域，以及已有
 * 卡片/Wiki/记忆摘要。文档检索与文件选择分离：中文任务描述可以直接
 * 命中中文知识库，标识符则用于精确定义定位。
 *
 * 边界：没有调用图、类型推断或运行时覆盖信息；关系仅来自静态 import。
 */

import { matchChangedPaths } from './impact.js'

/** 默认与允许的上下文预算（字符，不冒充 tokenizer 的 token 数）。 */
export const DEFAULT_CONTEXT_BUDGET = 12000
export const MIN_CONTEXT_BUDGET = 2000
export const MAX_CONTEXT_BUDGET = 40000
export const MAX_CONTEXT_FILES = 12

/**
 * @typedef {{name:string, kind?:string, line?:number, endLine?:number,
 *   exported?:boolean}} ContextSymbol
 * @typedef {{path:string, lang?:string, symbols?:ContextSymbol[]}} ContextFile
 * @typedef {{from:string, to:string, kind?:string, line?:number,
 *   symbols?:string[]}} ContextEdge
 * @typedef {{files?:ContextFile[], edges?:ContextEdge[]}} ContextIndex
 */

/** 常见英文停用词；标识符检索不把这些词当作符号。 */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'how', 'what', 'when',
  'where', 'why', 'are', 'was', 'were', 'can', 'could', 'should', 'would',
  'please', 'help', 'change', 'update', 'modify', 'fix', 'add', 'remove',
  'use', 'using', 'into', 'about', 'before', 'after', 'function', 'file',
])

/**
 * 从自然语言任务中提取可能出现在代码里的标识符。
 * 支持 camelCase / snake_case / $ 前缀；保留原始大小写用于展示，匹配时
 * 另行小写。路径片段也保留（如 src/config.ts 中的 config）。
 * @param {string} query - 任务描述。
 * @returns {string[]} 去重后的标识符，最多 12 个。
 */
export function contextTerms(query) {
  const terms = []
  const seen = new Set()
  const source = String(query ?? '')
  const re = /[A-Za-z_$][A-Za-z0-9_$]*/g
  let match
  while ((match = re.exec(source)) !== null) {
    const term = match[0]
    const lower = term.toLowerCase()
    if (term.length < 3 || STOP_WORDS.has(lower) || seen.has(lower)) continue
    seen.add(lower)
    terms.push(term)
    if (terms.length >= 12) break
  }
  return terms
}

/**
 * 符号名与标识符的匹配分。
 * @param {string} name - 符号名。
 * @param {string} term - 已小写的查询词。
 * @returns {number} 精确 40 / 前缀 20 / 子串 8 / 不匹配 0。
 */
function termScore(name, term) {
  const lower = String(name ?? '').toLowerCase()
  if (lower === term) return 40
  if (lower.startsWith(term)) return 20
  return lower.includes(term) ? 8 : 0
}

/**
 * 把调用方给出的符号锚点解析到索引定义。
 *
 * 支持 `path#name` 与裸名：
 * - 限定路径：复用影响面的路径匹配（精确/后缀/唯一 basename），再在该文件
 *   内精确查名；路径歧义或未命中直接报告，不猜。
 * - 裸名：在全部索引文件中查找精确同名定义；恰好一个文件命中才解析，多个
 *   文件命中列入 ambiguous（附候选），零命中列入 unmatched。同一文件内的
 *   重载按 `path#name` 去重并保留最小行号。
 * @param {ContextIndex} index - readIndex 返回的索引。
 * @param {string[]} inputs - 符号锚点。
 * @param {string} [root] - 项目根（用于剥离限定路径的绝对前缀）。
 * @returns {{resolved:Array<{path:string, name:string, kind:string, line:number}>,
 *   unmatched:string[], ambiguous:Array<{query:string, candidates:string[]}>}} 解析结果。
 */
export function resolveSymbolAnchors(index, inputs = [], root = '') {
  const byPath = new Map((index.files ?? []).map(file => [file.path, file]))
  const files = [...byPath.keys()]
  /** @type {Map<string, {path:string, name:string, kind:string, line:number}>} */
  const resolved = new Map()
  const unmatched = []
  const ambiguous = []
  for (const raw of inputs) {
    const input = String(raw ?? '').trim()
    if (!input) continue
    const hash = input.lastIndexOf('#')
    const qualifier = hash > 0 ? input.slice(0, hash).trim() : ''
    const name = (hash > 0 ? input.slice(hash + 1) : input).trim()
    if (!name) {
      unmatched.push(input)
      continue
    }
    /** @type {string[]} */
    let candidates = files
    if (qualifier) {
      const match = matchChangedPaths(index, [qualifier], root)
      if (match.ambiguous.length > 0) {
        ambiguous.push({ query: input, candidates: match.ambiguous[0].candidates })
        continue
      }
      if (match.matched.length === 0) {
        unmatched.push(input)
        continue
      }
      candidates = match.matched
    }
    /** @type {Array<{path:string, name:string, kind:string, line:number}>} */
    const hits = []
    for (const path of candidates) {
      const file = byPath.get(path)
      for (const symbol of file?.symbols ?? []) {
        if (!symbol || symbol.name !== name) continue
        hits.push({
          path,
          name,
          kind: typeof symbol.kind === 'string' ? symbol.kind : '',
          line: Number.isInteger(symbol.line) && symbol.line > 0 ? symbol.line : 0,
        })
      }
    }
    if (hits.length === 0) {
      unmatched.push(input)
      continue
    }
    if (!qualifier) {
      const hitPaths = [...new Set(hits.map(hit => hit.path))].sort()
      if (hitPaths.length > 1) {
        ambiguous.push({ query: input, candidates: hitPaths.slice(0, 10) })
        continue
      }
    }
    for (const hit of hits) {
      const key = `${hit.path}\u0000${hit.name}`
      const existing = resolved.get(key)
      if (!existing || (hit.line > 0 && (existing.line === 0 || hit.line < existing.line))) {
        resolved.set(key, hit)
      }
    }
  }
  return {
    resolved: [...resolved.values()]
      .sort((a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name)),
    unmatched,
    ambiguous,
  }
}

/**
 * 选择任务相关文件。显式路径优先；标识符命中符号优先于命中路径；文档
 * 命中的源文件获得少量加分，使纯中文任务也能通过卡片回到代码。
 * @param {ContextIndex} index - readIndex 返回的索引。
 * @param {{query?:string, paths?:string[], documentPaths?:string[], root?:string,
 *   limit?:number}} [options] - 检索条件。
 * @returns {{files:Array<{path:string, score:number, symbols:ContextSymbol[]}>,
 *   unmatched:string[], ambiguous:Array<{query:string,candidates:string[]}>}} 排名结果。
 */
export function rankContextFiles(index, options = {}) {
  const limit = Math.min(MAX_CONTEXT_FILES, Math.max(1, Math.floor(options.limit ?? 8)))
  const paths = Array.isArray(options.paths) ? options.paths : []
  const explicit = matchChangedPaths(index, paths, options.root ?? '')
  const explicitSet = new Set(explicit.matched)
  const documentPaths = new Set((options.documentPaths ?? []).filter(path => typeof path === 'string'))
  const query = String(options.query ?? '').trim()
  const fullQuery = query.toLowerCase()
  const terms = contextTerms(query).map(term => term.toLowerCase())
  const ranked = []
  for (const file of index.files ?? []) {
    if (!file || typeof file.path !== 'string') continue
    let score = explicitSet.has(file.path) ? 10000 : 0
    if (documentPaths.has(file.path)) score += 6
    if (fullQuery.length >= 3 && file.path.toLowerCase().includes(fullQuery)) score += 25
    /** @type {Map<object, number>} */
    const symbolScores = new Map()
    for (const term of terms) {
      if (file.path.toLowerCase().includes(term)) score += 4
      let best = 0
      for (const symbol of file.symbols ?? []) {
        const value = termScore(symbol.name, term)
        if (value === 0) continue
        best = Math.max(best, value + (symbol.exported === true ? 2 : 0))
        symbolScores.set(symbol, Math.max(symbolScores.get(symbol) ?? 0, value))
      }
      score += best
    }
    if (score === 0) continue
    const symbols = (file.symbols ?? [])
      .filter(symbol => symbolScores.has(symbol))
      .sort((a, b) => (symbolScores.get(b) - symbolScores.get(a))
        || ((a.line ?? 0) - (b.line ?? 0)) || String(a.name).localeCompare(String(b.name)))
      .slice(0, 5)
    ranked.push({ path: file.path, score, symbols })
  }
  ranked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
  return {
    files: ranked.slice(0, limit),
    unmatched: explicit.unmatched,
    ambiguous: explicit.ambiguous,
  }
}

/**
 * 从源码构造带行号的证据片段。优先任务词命中的符号；无命中时选择导出
 * 符号；文件没有符号时只给开头少量行。重叠范围合并，单段上限 50 行，
 * 避免一个超长函数耗尽全部预算。
 * @param {string} source - 源码文本。
 * @param {ContextFile} file - 索引文件条目。
 * @param {string[]} [terms] - 任务标识符。
 * @param {{maxSnippets?:number, maxLines?:number}} [options] - 片段数量与行数上限。
 * @returns {Array<{line:number, endLine:number, text:string, truncated:boolean}>} 片段。
 */
export function buildContextSnippets(source, file, terms = [], options = {}) {
  const lines = String(source ?? '').split('\n')
  const maxSnippets = Math.max(1, Math.floor(options.maxSnippets ?? 2))
  const maxLines = Math.min(80, Math.max(10, Math.floor(options.maxLines ?? 50)))
  const lowered = terms.map(term => term.toLowerCase())
  const scored = (file.symbols ?? []).map((symbol, index) => {
    let score = 0
    for (const term of lowered) score = Math.max(score, termScore(symbol.name, term))
    return { symbol, index, score }
  })
  scored.sort((a, b) => b.score - a.score
    || Number(b.symbol.exported === true) - Number(a.symbol.exported === true)
    || ((a.symbol.line ?? 0) - (b.symbol.line ?? 0)) || a.index - b.index)
  const chosen = scored.filter(item => Number.isInteger(item.symbol.line) && item.symbol.line > 0)
    .filter((item, index) => item.score > 0 || index < maxSnippets)
    .slice(0, maxSnippets)
  /** @type {Array<{start:number, end:number, truncated:boolean}>} */
  const ranges = []
  for (const item of chosen) {
    const definition = item.symbol.line
    const declaredEnd = Number.isInteger(item.symbol.endLine) ? item.symbol.endLine : definition + 20
    const end = Math.min(declaredEnd, definition + maxLines - 1)
    ranges.push({
      start: Math.max(1, definition - 3),
      end: Math.min(lines.length, end + 3),
      truncated: declaredEnd > end,
    })
  }
  if (ranges.length === 0 && lines.some(line => line.trim())) {
    ranges.push({ start: 1, end: Math.min(lines.length, 40), truncated: lines.length > 40 })
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end)
  /** @type {Array<{start:number, end:number, truncated:boolean}>} */
  const merged = []
  for (const range of ranges) {
    const previous = merged[merged.length - 1]
    if (previous && range.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, range.end)
      previous.truncated = previous.truncated || range.truncated
    } else merged.push({ ...range })
  }
  return merged.map(range => ({
    line: range.start,
    endLine: range.end,
    text: lines.slice(range.start - 1, range.end)
      .map((line, index) => `${range.start + index} | ${line}`).join('\n'),
    truncated: range.truncated,
  }))
}

/**
 * 按字符上限截断文本，优先在换行处结束。
 * @param {string} text - 原文。
 * @param {number} max - 最大字符数。
 * @returns {{text:string, truncated:boolean}} 截断结果。
 */
function clip(text, max) {
  if (max <= 0) return { text: '', truncated: text.length > 0 }
  if (text.length <= max) return { text, truncated: false }
  if (max <= 12) return { text: text.slice(0, max), truncated: true }
  const marker = '\n… [truncated]'
  const room = max - marker.length
  let cut = text.lastIndexOf('\n', room)
  if (cut < Math.floor(room * 0.6)) cut = room
  return { text: `${text.slice(0, cut).trimEnd()}${marker}`, truncated: true }
}

/**
 * 把候选证据装入固定字符预算。源码最多 55%、文档最多 22%，给文件清单
 * 与关系/风险保留空间；预算是上限而非必须填满，未使用不会填充废话。
 * @param {object} input - 候选内容。
 * @param {string} input.query - 任务描述。
 * @param {number} input.budget - 总字符预算。
 * @param {string[]} input.files - 文件清单行。
 * @param {Array<{path:string, line:number, endLine:number, text:string}>} input.snippets - 源码片段。
 * @param {Array<{type:string, path:string, title:string, snippet:string}>} input.documents - 文档命中。
 * @param {string[]} input.relations - 依赖与风险行。
 * @param {string[]} [input.warnings] - 降级/未命中提示。
 * @returns {{text:string, usedChars:number, truncated:boolean,
 *   omitted:{snippets:number, documents:number, relations:number}}} 上下文包与省略统计。
 */
export function packContextPack(input) {
  const budget = Math.min(MAX_CONTEXT_BUDGET, Math.max(MIN_CONTEXT_BUDGET, Math.floor(input.budget)))
  const header = [
    '# Repository context',
    `Task: ${input.query}`,
    'Evidence: source definitions and static imports; docs are generated knowledge, not runtime truth.',
  ].join('\n')
  const omitted = { snippets: 0, documents: 0, relations: 0 }
  let truncated = false
  /** @param {string} text @param {number} max */
  const fit = (text, max) => {
    const result = clip(text, Math.max(0, max))
    truncated = truncated || result.truncated
    return result.text
  }
  const inventory = input.files.length > 0 ? input.files.join('\n') : '(no indexed file matched)'
  const fileSection = fit(`\n\n## Relevant files\n${inventory}`, Math.floor(budget * 0.16))

  let sourceBody = ''
  const sourceCap = Math.floor(budget * 0.55)
  for (const snippet of input.snippets) {
    const block = `${sourceBody ? '\n\n' : ''}### ${snippet.path}:${snippet.line}-${snippet.endLine}\n${snippet.text}`
    if (sourceBody.length + block.length > sourceCap) {
      omitted.snippets++
      continue
    }
    sourceBody += block
  }
  if (!sourceBody && input.snippets.length > 0) {
    const first = input.snippets[0]
    sourceBody = fit(`### ${first.path}:${first.line}-${first.endLine}\n${first.text}`, sourceCap)
    omitted.snippets = Math.max(0, input.snippets.length - 1)
  }

  let docsBody = ''
  const docsCap = Math.floor(budget * 0.22)
  for (const doc of input.documents) {
    const block = `${docsBody ? '\n' : ''}- [${doc.type}] ${doc.title} — ${doc.path}\n  ${doc.snippet || '(no snippet)'}`
    if (docsBody.length + block.length > docsCap) {
      omitted.documents++
      continue
    }
    docsBody += block
  }

  let relationBody = ''
  for (const line of input.relations) {
    const block = `${relationBody ? '\n' : ''}- ${line}`
    if (relationBody.length + block.length > Math.floor(budget * 0.14)) {
      omitted.relations++
      continue
    }
    relationBody += block
  }
  const warningBody = (input.warnings ?? []).map(line => `- ${line}`).join('\n')
  const sections = [
    header,
    fileSection,
    sourceBody ? `\n\n## Source evidence\n${sourceBody}` : '',
    docsBody ? `\n\n## Knowledge documents\n${docsBody}` : '',
    relationBody ? `\n\n## Static relations and risks\n${relationBody}` : '',
    warningBody ? `\n\n## Caveats\n${warningBody}` : '',
  ]
  let text = sections.join('')
  if (text.length > budget) {
    text = fit(text, budget)
    truncated = true
    // 最终硬上限可能切掉某个段的后半部分；即使候选阶段没有溢出，也要把
    // 这种省略计入对应类别，避免 omitted=0 给用户"其实完整"的错觉。
    if (sourceBody && !text.includes(sourceBody)) omitted.snippets = Math.max(1, omitted.snippets)
    if (docsBody && !text.includes(docsBody)) omitted.documents = Math.max(1, omitted.documents)
    if (relationBody && !text.includes(relationBody)) omitted.relations = Math.max(1, omitted.relations)
  }
  return { text, usedChars: text.length, truncated, omitted }
}
