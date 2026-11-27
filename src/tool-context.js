// @ts-check
/**
 * repowiki-context：为一次编码任务打包有预算、可核验的仓库上下文。
 *
 * 与 repowiki-cards 的"逐项查询"不同，本工具一次聚合任务相关文件、带行号
 * 源码片段、直接依赖/依赖方、循环与 fan-in 风险，以及 BM25 命中的卡片、
 * Wiki 和已采信记忆。只读、确定性、无 LLM；预算是字符数而非 token 数。
 */

import { resolveAssetRoot, readIndex } from './assets.js'
import { readCardDocuments, readWikiDocuments } from './knowledge.js'
import { listMemory } from './memory.js'
import { rankDocuments } from './search.js'
import { importsFor, dependentsFor } from './references.js'
import { collectSymbolUsages } from './usages.js'
import { resolveContentLocale } from './locale.js'
import { getLocale } from './spawn.js'
import { cwdOf } from './util.js'
import { SUPPORTED_LOCALES } from './schema.js'
import { cyclesForChanged, hubsForChanged } from './impact.js'
import { computeFileRank } from './graph-rank.js'
import {
  contextTerms, rankContextFiles, buildContextSnippets, packContextPack,
  resolveSymbolAnchors,
  DEFAULT_CONTEXT_BUDGET, MIN_CONTEXT_BUDGET, MAX_CONTEXT_BUDGET, MAX_CONTEXT_FILES,
} from './context.js'

const DESCRIPTION = [
  'Build a bounded evidence pack for a coding task in one read-only call. Given a natural-language',
  'task and optional anchor paths or symbols (bare names or path#name), rank relevant files from',
  'symbols, paths and knowledge documents; include line-numbered source snippets, direct',
  'imports/dependents, cycles and fan-in, plus BM25 matches from cards, wiki and accepted memory.',
  'Every source excerpt has path:line evidence. The budget is characters (not tokens); omitted',
  'items are counted and the pack never claims runtime call-graph certainty. Symbol anchors work',
  'without a query and never guess when a bare name is defined in multiple files. Run',
  'repowiki-index first. No model calls.',
].join(' ')

/** @param {unknown} value @returns {string[]} 非空字符串数组。 */
function strings(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,]+/) : []
  return list.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim())
}

/** @param {unknown} value @param {number} fallback @param {number} min @param {number} max */
function boundedInt(value, fallback, min, max) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback
}

/**
 * 构造 repowiki-context 工具。
 * @param {PluginContext} ctx - 插件上下文。
 * @returns {object} ToolDefinition。
 */
export function repowikiContextTool(ctx) {
  const relationSchema = {
    type: 'array',
    items: {
      type: 'object', additionalProperties: false,
      properties: {
        path: { type: 'string' }, line: { type: 'integer' },
        symbols: { type: 'array', items: { type: 'string' } },
        depth: { type: 'integer' },
      },
      required: ['path', 'symbols', 'depth'],
    },
  }
  return {
    name: 'repowiki-context',
    description: DESCRIPTION,
    parameters: {
      query: { type: 'string', description: 'Natural-language coding task. Identifier-like terms locate symbols; the full query also drives BM25 over knowledge documents. Optional when paths or symbols are provided.' },
      paths: { type: 'array', items: { type: 'string' }, description: 'Optional anchor files. Explicit matches rank first; ambiguous paths are reported, never guessed.' },
      symbols: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional symbol anchors as bare names or path#name. Defined files rank first and the anchor names drive snippet selection; a bare name defined in multiple files is reported as ambiguous instead of guessed. Works without a query.',
      },
      root: { type: 'string', description: 'Optional project root. Defaults to the current directory and walks up for .dsh-repowiki.' },
      locale: { type: 'string', enum: ['zh', 'en'], description: 'Knowledge document locale. Omit for session language with content-first fallback.' },
      budget: { type: 'integer', description: `Maximum characters in the rendered evidence pack (${MIN_CONTEXT_BUDGET}-${MAX_CONTEXT_BUDGET}, default ${DEFAULT_CONTEXT_BUDGET}); this is not a token count.` },
      limit: { type: 'integer', description: `Maximum primary source files (1-${MAX_CONTEXT_FILES}, default 8).` },
      includeSource: { type: 'boolean', description: 'Include line-numbered source excerpts (default true).' },
      includeDocs: { type: 'boolean', description: 'Include cards, wiki and accepted memory via BM25 (default true).' },
      usages: {
        type: 'boolean',
        description: 'Also scan lexical usage sites for resolved symbol anchors (direct named/namespace importers and the defining file, definition range excluded). Bounded to 5 symbols and 20 importer files; unreadable files are reported as unknown. Default false.',
      },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          indexed: { type: 'boolean' }, root: { type: 'string' }, query: { type: 'string' },
          locale: { type: 'string' }, localeRequested: { type: 'string' },
          localeSource: { type: 'string', enum: ['explicit', 'preferred', 'fallback', 'default'] },
          budget: { type: 'integer' }, usedChars: { type: 'integer' }, truncated: { type: 'boolean' },
          text: { type: 'string', description: 'Budgeted Markdown evidence pack.' },
          files: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                path: { type: 'string' }, score: { type: 'integer' },
                symbols: {
                  type: 'array',
                  items: {
                    type: 'object', additionalProperties: false,
                    properties: {
                      name: { type: 'string' }, kind: { type: 'string' },
                      line: { type: 'integer' }, endLine: { type: 'integer' },
                    },
                    required: ['name', 'kind', 'line', 'endLine'],
                  },
                },
              },
              required: ['path', 'score', 'symbols'],
            },
          },
          snippets: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                path: { type: 'string' }, line: { type: 'integer' }, endLine: { type: 'integer' },
                text: { type: 'string' }, truncated: { type: 'boolean' },
              },
              required: ['path', 'line', 'endLine', 'text', 'truncated'],
            },
          },
          documents: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                type: { type: 'string' }, path: { type: 'string' }, title: { type: 'string' },
                snippet: { type: 'string' }, score: { type: 'number' },
              },
              required: ['type', 'path', 'title', 'snippet', 'score'],
            },
          },
          relations: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: { path: { type: 'string' }, imports: relationSchema, dependents: relationSchema },
              required: ['path', 'imports', 'dependents'],
            },
          },
          cycles: { type: 'array', items: { type: 'object' } },
          hubs: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: { path: { type: 'string' }, dependents: { type: 'integer' } },
              required: ['path', 'dependents'],
            },
          },
          omitted: {
            type: 'object', additionalProperties: false,
            properties: {
              snippets: { type: 'integer' }, documents: { type: 'integer' }, relations: { type: 'integer' },
            },
            required: ['snippets', 'documents', 'relations'],
          },
          unmatched: { type: 'array', items: { type: 'string' } },
          ambiguous: { type: 'array', items: { type: 'object' } },
          symbolAnchors: {
            type: 'array',
            description: 'Resolved symbol anchors used as primary evidence (path#name plus definition line).',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                path: { type: 'string' }, name: { type: 'string' },
                kind: { type: 'string' }, line: { type: 'integer' },
              },
              required: ['path', 'name', 'kind', 'line'],
            },
          },
          unmatchedSymbols: { type: 'array', items: { type: 'string' } },
          usages: {
            type: 'array',
            description: 'Lexical usage evidence for resolved symbol anchors when usages=true.',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                path: { type: 'string' }, symbol: { type: 'string' },
                importers: {
                  type: 'array',
                  items: {
                    type: 'object', additionalProperties: false,
                    properties: { path: { type: 'string' }, line: { type: 'integer' } },
                    required: ['path'],
                  },
                },
                usages: {
                  type: 'array',
                  items: {
                    type: 'object', additionalProperties: false,
                    properties: {
                      path: { type: 'string' }, line: { type: 'integer' }, text: { type: 'string' },
                    },
                    required: ['path', 'line', 'text'],
                  },
                },
                filesScanned: { type: 'integer' },
                unreadable: { type: 'array', items: { type: 'string' } },
                truncated: { type: 'boolean' },
              },
              required: ['path', 'symbol', 'importers', 'usages', 'filesScanned', 'unreadable', 'truncated'],
            },
          },
          usagesSkipped: { type: 'integer' },
          usagesSkippedFiles: { type: 'integer' },
          usagesTruncated: { type: 'boolean' },
          ambiguousSymbols: {
            type: 'array',
            description: 'Bare symbol anchors defined in more than one file; candidates are listed instead of guessing.',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                query: { type: 'string' }, candidates: { type: 'array', items: { type: 'string' } },
              },
              required: ['query', 'candidates'],
            },
          },
          fallback: { type: 'string', enum: ['repo-map'], description: 'Set when no file matched the task and the pack instead lists top files by static import-graph PageRank; these are a starting point, not task relevance.' },
          hint: { type: 'string' }, durationMs: { type: 'integer' },
        },
        required: ['indexed', 'durationMs'],
      },
      render: (_args, value) => {
        if (!value.indexed || !value.text) {
          return [{ type: 'text', text: value.hint ?? 'No usable index; run repowiki-index first.' }]
        }
        return [{
          type: 'text',
          text: `Context pack: ${value.usedChars}/${value.budget} chars, ${value.files.length} file(s), ${value.snippets.length} source excerpt(s), ${value.documents.length} document hit(s)${value.truncated ? ' (bounded)' : ''}\n\n${value.text}${value.hint ? `\n\n${value.hint}` : ''}`,
        }]
      },
    },
    timeoutMs: 30_000,
    async execute(args, _exec) {
      const fs = ctx.fs
      if (!fs) throw new Error('repowiki-context requires the ctx.fs capability')
      const startedAt = Date.now()
      const startDir = typeof args.root === 'string' && args.root.trim() ? args.root : cwdOf(ctx)
      const { root } = await resolveAssetRoot(fs, startDir)
      const rawIndex = await readIndex(fs, root)
      if (!rawIndex) {
        return {
          indexed: false, root, durationMs: Date.now() - startedAt,
          hint: 'No usable index found. Run repowiki-index first, then build the task context again.',
        }
      }
      const index = /** @type {import('./context.js').ContextIndex} */ (rawIndex)
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      const pathInputs = strings(args.paths)
      const symbolInputs = strings(args.symbols)
      if (!query && pathInputs.length === 0 && symbolInputs.length === 0) {
        return {
          indexed: true, root, query: '', durationMs: Date.now() - startedAt,
          hint: 'query is required unless paths or symbols are provided: describe the task or anchor it.',
        }
      }
      // 符号锚点先解析再排序：解析失败/裸名歧义如实报告，绝不静默回退为
      // 词法搜索或扩大成整个文件。
      const symbolResolution = resolveSymbolAnchors(index, symbolInputs, root)
      // 符号锚点的词法使用点（可选）：与 repowiki-cards usages=true 共用收集器
      let usageResult = null
      if (args.usages === true && symbolResolution.resolved.length > 0) {
        /** @type {Map<string, Array<{name:string, line?:number}>>} */
        const byPath = new Map()
        for (const item of symbolResolution.resolved) {
          const list = byPath.get(item.path) ?? []
          list.push({ name: item.name, ...(Number.isInteger(item.line) ? { line: item.line } : {}) })
          byPath.set(item.path, list)
        }
        usageResult = await collectSymbolUsages(
          fs, root, index.edges ?? [],
          [...byPath.entries()].map(([path, symbols]) => ({ path, symbols })),
        )
      }
      const anchorPaths = symbolResolution.resolved.map(item => item.path)
      const hasAnchors = pathInputs.length > 0 || symbolInputs.length > 0
      const taskLabel = query || (symbolInputs.length > 0
        ? `symbols: ${symbolInputs.join(', ')}`
        : `paths: ${pathInputs.join(', ')}`)
      const budget = boundedInt(args.budget, DEFAULT_CONTEXT_BUDGET, MIN_CONTEXT_BUDGET, MAX_CONTEXT_BUDGET)
      const limit = boundedInt(args.limit, 8, 1, MAX_CONTEXT_FILES)
      const explicitLocale = typeof args.locale === 'string' && SUPPORTED_LOCALES.includes(args.locale)
      const requestedLocale = explicitLocale ? args.locale : getLocale(ctx)
      const localeInfo = await resolveContentLocale(fs, root, requestedLocale, explicitLocale)
      const includeDocs = args.includeDocs !== false
      let documents = []
      if (includeDocs) {
        const [cardDocs, wikiDocs, memoryEntries] = await Promise.all([
          readCardDocuments(fs, root, localeInfo.locale),
          readWikiDocuments(fs, root, localeInfo.locale),
          listMemory(fs, root, localeInfo.locale, 'accepted', true),
        ])
        const acceptedMemories = /** @type {Array<{slug:string, path?:string, title:string, tags:string[], body?:string}>} */ (memoryEntries)
        const docs = [
          ...cardDocs.map(doc => ({ ...doc, type: 'card' })),
          ...wikiDocs.map(doc => ({ ...doc, type: 'wiki' })),
          ...acceptedMemories.map(entry => ({
            id: `memory:${entry.slug}`, type: 'memory', path: entry.path ?? '',
            title: entry.title, tags: entry.tags, body: entry.body ?? '',
          })),
        ]
        const rankedDocs = /** @type {Array<{type:string, path:string, title:string, snippet:string, score:number}>} */ (rankDocuments(docs, query, { limit: 12 }).results)
        documents = rankedDocs.map(doc => ({
          type: doc.type, path: doc.path, title: doc.title, snippet: doc.snippet, score: doc.score,
        }))
      }
      const ranked = rankContextFiles(index, {
        query, paths: [...pathInputs, ...anchorPaths], root, limit,
        documentPaths: documents.map(doc => doc.path),
      })
      // 无任何词法/文档命中且调用方没有给锚点时，用静态 import 图的 PageRank
      // 给出仓库起点：这不是任务相关性，并显式标注 fallback。给了锚点却全部
      // 未命中时不做兜底，避免掩盖"锚点写错/歧义"的真实信号。
      let fallback = ''
      let selectedFiles = ranked.files
      if (ranked.files.length === 0 && !hasAnchors && (index.edges ?? []).length > 0) {
        const core = computeFileRank(index.edges, { limit: Math.min(5, limit) }).entries
        if (core.length > 0) {
          fallback = 'repo-map'
          selectedFiles = core.map(entry => ({ path: entry.path, score: 0, symbols: [] }))
        }
      }
      const byPath = new Map((index.files ?? []).map(file => [file.path, file]))
      const terms = [...new Set([
        ...contextTerms(query),
        ...symbolResolution.resolved.map(item => item.name),
      ])]
      const snippets = []
      const sourceWarnings = []
      if (args.includeSource !== false) {
        for (const selected of selectedFiles) {
          const file = byPath.get(selected.path)
          if (!file) continue
          try {
            const source = await fs.readText(await fs.resolve(selected.path, { cwd: root }))
            for (const snippet of buildContextSnippets(source, file, terms)) {
              snippets.push({ path: selected.path, ...snippet })
            }
          } catch {
            // 单文件不可读：保留索引/文档证据，同时显式披露证据缺口。
            sourceWarnings.push(`Source unreadable: ${selected.path}`)
          }
        }
      }
      const selectedPaths = selectedFiles.map(file => file.path)
      const relations = selectedPaths.slice(0, 5).map(path => ({
        path,
        imports: importsFor(index.edges ?? [], [{ path }], 5, 1).imports,
        dependents: dependentsFor(index.edges ?? [], [{ path }], 5, 1).dependents,
      }))
      const cycles = cyclesForChanged(index.edges ?? [], selectedPaths, { limit: 3, filesPerCycle: 12 }).cycles
      const hubs = hubsForChanged(index.edges ?? [], selectedPaths, 5)
      const relationLines = []
      for (const relation of relations) {
        if (relation.imports.length > 0) relationLines.push(`${relation.path} imports ${relation.imports.map(item => item.path).join(', ')}`)
        if (relation.dependents.length > 0) relationLines.push(`${relation.path} is imported by ${relation.dependents.map(item => item.path).join(', ')}`)
      }
      for (const hub of hubs) relationLines.push(`fan-in ${hub.path}: ${hub.dependents} direct importer(s)`)
      for (const cycle of cycles) relationLines.push(`cycle (${cycle.size} files): ${cycle.sample.length > 0 ? cycle.sample.join(' → ') : cycle.files.join(' ↔ ')}`)
      for (const entry of usageResult?.entries ?? []) {
        relationLines.push(`usage ${entry.symbol} in ${entry.path}: ${entry.usages.length} site(s) in ${entry.filesScanned} file(s)`)
        for (const site of entry.usages.slice(0, 2)) {
          relationLines.push(`${entry.symbol} used at ${site.path}:${site.line}: ${site.text}`)
        }
        if (entry.unreadable.length > 0) {
          relationLines.push(`usage unknown for ${entry.symbol}: ${entry.unreadable.join(', ')}`)
        }
      }
      const warnings = [...sourceWarnings]
      if (ranked.unmatched.length > 0) warnings.push(`Unmatched anchor paths: ${ranked.unmatched.join(', ')}`)
      for (const item of ranked.ambiguous) warnings.push(`Ambiguous anchor ${item.query}: ${item.candidates.join(' | ')}`)
      if (symbolResolution.unmatched.length > 0) warnings.push(`Unmatched symbol anchors: ${symbolResolution.unmatched.join(', ')}; they were not broadened to file or lexical search.`)
      for (const item of symbolResolution.ambiguous) warnings.push(`Ambiguous symbol anchor ${item.query}: ${item.candidates.join(' | ')}`)
      if (localeInfo.source === 'fallback') warnings.push(`Knowledge locale ${requestedLocale} has no assets; using ${localeInfo.locale}.`)
      if (includeDocs && documents.length === 0) warnings.push('No knowledge document matched; source and static relations are still included when available.')
      if (fallback === 'repo-map') warnings.push('Repo-map fallback: the task matched no indexed file; these files rank highest on the static import graph, not on task relevance.')
      if (usageResult?.skipped) warnings.push(`Usage scan covered ${usageResult.entries.length} symbol(s); ${usageResult.skipped} more were skipped by the cap.`)
      if (usageResult?.skippedFiles) warnings.push(`Usage scan skipped ${usageResult.skippedFiles} importer file(s) by the cap.`)
      if (usageResult?.truncated) warnings.push('Usage evidence is capped at 10 sites per symbol and 100 in total.')
      const fileLines = selectedFiles.map(file => {
        const names = file.symbols.map(symbol => symbol.name).slice(0, 5)
        return `- ${file.path}${names.length > 0 ? ` — ${names.join(', ')}` : ''}${fallback ? ' (repo map)' : ` (rank ${file.score})`}`
      })
      const pack = packContextPack({
        query: taskLabel, budget, files: fileLines, snippets, documents, relations: relationLines, warnings,
      })
      const notes = []
      if (pack.truncated) notes.push('The evidence pack reached its character budget; omitted counts are reported explicitly.')
      if (fallback === 'repo-map') notes.push('No indexed file matched the task; the pack lists top static-import PageRank files as a starting point, not as task relevance.')
      else if (selectedFiles.length === 0) notes.push(hasAnchors
        ? 'None of the provided anchors matched the index; unmatched or ambiguous anchors are listed above.'
        : 'No source file matched. Try an identifier, a path anchor, or run repowiki-extract to enrich document-based routing.')
      return {
        indexed: true, root, query,
        locale: localeInfo.locale, localeRequested: requestedLocale, localeSource: localeInfo.source,
        budget, usedChars: pack.usedChars, truncated: pack.truncated, text: pack.text,
        ...(fallback ? { fallback } : {}),
        symbolAnchors: symbolResolution.resolved,
        unmatchedSymbols: symbolResolution.unmatched,
        ambiguousSymbols: symbolResolution.ambiguous,
        ...(usageResult ? {
          usages: usageResult.entries,
          usagesSkipped: usageResult.skipped,
          usagesSkippedFiles: usageResult.skippedFiles,
          usagesTruncated: usageResult.truncated,
        } : {}),
        files: selectedFiles.map(file => ({
          path: file.path, score: file.score,
          symbols: file.symbols.map(symbol => ({
            name: String(symbol.name ?? ''), kind: String(symbol.kind ?? ''),
            line: Number.isInteger(symbol.line) ? symbol.line : 0,
            endLine: Number.isInteger(symbol.endLine) ? symbol.endLine : 0,
          })),
        })),
        snippets, documents, relations, cycles, hubs,
        omitted: pack.omitted, unmatched: ranked.unmatched, ambiguous: ranked.ambiguous,
        ...(notes.length > 0 ? { hint: notes.join(' ') } : {}),
        durationMs: Date.now() - startedAt,
      }
    },
    presentCall: (args) => ({
      card: 'generic', title: 'Build task context', kind: 'search',
      rawInput: {
        query: args.query ?? '',
        paths: Array.isArray(args.paths) ? args.paths.join(', ') : '',
        symbols: Array.isArray(args.symbols) ? args.symbols.join(', ') : '',
        usages: args.usages ?? false,
        budget: args.budget ?? DEFAULT_CONTEXT_BUDGET,
      },
    }),
  }
}
