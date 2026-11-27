/**
 * repowiki-cards 工具：跨会话检索仓库的符号索引与知识卡片（只读）。
 *
 * 这是 Phase 1 的"价值兑现"工具：任意会话打开同目录即可查询符号/文件/
 * 依赖，无需重读源码。无索引时给出明确的降级提示（先调 repowiki-index），
 * 不静默返回空。
 */

import {
  resolveAssetRoot, readIndex, searchIndex,
} from './assets.js'
import { DEFAULT_RESULT_LIMIT, SUPPORTED_LOCALES } from './schema.js'
import { listMemory } from './memory.js'
import { resolveContentLocale } from './locale.js'
import {
  readCardDocuments, readWikiDocuments, readWikiManifest,
} from './knowledge.js'
import { rankDocuments } from './search.js'
import { buildReferenceIndex, referencesFor, importsFor, dependentsFor, MAX_IMPORT_DEPTH, MAX_IMPORT_ENTRIES } from './references.js'
import { buildWikiReferenceIndex, wikiReferencesFor } from './wiki-references.js'
import { collectSymbolUsages } from './usages.js'
import { getLocale } from './spawn.js'
import { cwdOf } from './util.js'

/** 工具描述。 */
const DESCRIPTION = [
  'Query the repository knowledge index built by repowiki-index: find symbols (functions, classes,',
  'methods, types) and the files that define them, plus project tech stack. Read-only. If no index',
  'exists yet, run repowiki-index first. Matches are ranked by name quality (exact > prefix >',
  'substring; exported symbols first within a tier) and files by their best match. Set target=docs/all',
  'to run a zero-dependency BM25 search over card,',
  'wiki and accepted-memory bodies. Set includeMemory=true to also return accepted session memory',
  'entries (repowiki-memory) filtered by the same query substring. Set references=true to add',
  'import-level reverse references: which indexed files import each matched symbol. Set',
  'wikiReferences=true to add wiki citations: which wiki pages/sections cite each matched file. Set',
  'imports=true to list each matched file\'s outgoing import edges (target file, statement line and',
  'named symbols), the complement of reverse references; depth=2..3 expands those edges into',
  'transitive dependencies (bounded, nearest hop wins). Set dependents=true for the reverse view:',
  'which files import each matched file, and with depth=2..3 which files transitively depend on it',
  '(the impact surface of a change). Set usages=true to locate lexical usage sites of matched',
  'symbols inside their direct named importers and the defining file itself (identifier-boundary',
  'matches; import lines, import blocks, whole-line comments and the definition range are skipped;',
  'bounded by 5 symbols, 20 importer files and 100 sites; unreadable files are reported as unknown,',
  'never as unused).',
].join(' ')

/**
 * 依赖方向条目的文本行（imports / dependents 共用）。
 * @param {Array<{path:string, line?:number, symbols:string[], depth:number}>} entries - 边条目。
 * @param {string} arrow - 直接边的箭头（正向 →，反向 ←）。
 * @param {string} deepArrow - 传递边的箭头（正向 ⇢，反向 ⇠）。
 * @returns {string} 每行一条的文本。
 */
function formatEdgeEntries(entries, arrow, deepArrow) {
  return entries.slice(0, 10).map((entry) => {
    const symbols = entry.symbols.length > 0 ? entry.symbols.join(', ') : ''
    const detail = entry.depth > 1
      ? (symbols ? `${symbols}, ${entry.depth} hops` : `${entry.depth} hops`)
      : symbols
    return `- ${entry.depth > 1 ? deepArrow : arrow} ${formatReferenceSite(entry)}${detail ? ` (${detail})` : ''}`
  }).join('\n')
}

/**
 * 引用位置格式化：有行号时输出 `path:L12`，旧索引降级为 `path`。
 * @param {{path?:string, line?:number}} site - 引用位置。
 * @returns {string} 可读位置。
 */
function formatReferenceSite(site) {
  const path = typeof site?.path === 'string' ? site.path : ''
  return typeof site?.line === 'number' && site.line > 0 ? `${path}:L${site.line}` : path
}

/**
 * 构造 repowiki-cards 工具定义。
 * @param {PluginContext} ctx - 插件上下文。
 * @returns {object} ToolDefinition。
 */
export function repowikiCardsTool(ctx) {
  return {
    name: 'repowiki-cards',
    description: DESCRIPTION,
    parameters: {
      query: {
        type: 'string',
        description: 'Substring of a symbol name to find (case-insensitive), e.g. "parse" or "IndexService". Empty matches all symbols.',
      },
      kind: {
        type: 'string',
        enum: ['function', 'class', 'method', 'variable', 'interface', 'type'],
        description: 'Restrict matches to one symbol kind.',
      },
      path: {
        type: 'string',
        description: 'Substring of a file path to restrict the search scope, e.g. "src/" or "tools".',
      },
      module: {
        type: 'string',
        description: 'Exact module path (directory grouping from the index, e.g. "src" or "src/graph") to restrict the search scope. Use the modules list in the result to discover valid values.',
      },
      lang: {
        type: 'string',
        description: 'Restrict matches to one indexed language id, e.g. "typescript", "python", "go", "ruby", "swift", "scala".',
      },
      exportedOnly: {
        type: 'boolean',
        description: 'Only return public/exported symbols. Languages without an export keyword record visibility (e.g. private methods are excluded). Default false.',
      },
      limit: {
        type: 'integer',
        description: `Max number of matching files returned; extra matches are reported as truncated. Defaults to ${DEFAULT_RESULT_LIMIT}.`,
      },
      offset: {
        type: 'integer',
        description: 'Skip the first N matching files/knowledge hits for pagination (default 0). total always reports the full count.',
      },
      includeMemory: {
        type: 'boolean',
        description: 'Also return accepted session memory entries (repowiki-memory) whose title, tags, or body contain the query substring; an empty query returns all of them. Default false.',
      },
      target: {
        type: 'string',
        enum: ['symbols', 'docs', 'all'],
        description: 'What to search: symbols (default), docs (BM25 over cards/wiki/accepted memory), or all.',
      },
      references: {
        type: 'boolean',
        description: 'Also return import-level reverse references for matched symbols (which indexed files import them). Covers static import/use/require edges, not call-graph or reflection usage. Default false.',
      },
      wikiReferences: {
        type: 'boolean',
        description: 'Also return wiki citations for matched files (which wiki pages and sections reference them), read from wiki/<locale>/_index.json. Requires repowiki-generate to have run. Default false.',
      },
      imports: {
        type: 'boolean',
        description: 'Also return each matched file\'s outgoing import edges (target file, statement line and named symbols). This is the complement of references=true. Bounded to 100 entries. Default false.',
      },
      dependents: {
        type: 'boolean',
        description: 'Also return the files that import each matched file (reverse import edges, the impact surface of a change). depth expands them into transitive dependents. Bounded to 100 entries. Default false.',
      },
      depth: {
        type: 'integer',
        description: 'With imports=true or dependents=true, expand transitive dependencies/dependents up to N hops (1-3, default 1). Nearest hop wins when a file is reachable at several depths.',
      },
      usages: {
        type: 'boolean',
        description: 'Also locate lexical usage sites of matched symbols inside their direct named importers and the defining file (the definition range is excluded). Evidence is lexical (same-name entities and trailing comments cannot be distinguished), covers only languages whose import edges carry named symbols, and is bounded to 5 symbols / 20 importer files / 100 sites. Default false.',
      },
      locale: {
        type: 'string',
        enum: ['zh', 'en'],
        description: 'Locale used for docs/memory/wiki citations. Omit to use the session language, falling back to the other locale when it is the only one with assets. Pass a value to read that locale strictly.',
      },
    },
    output: {
      // JsonSchemaNode 子集：required 为顶层数组（见 ADR-0002 的运行时校验约束）。
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          indexed: { type: 'boolean' },
          root: { type: 'string' },
          indexPath: { type: 'string' },
          indexVersion: { type: 'integer', description: 'schemaVersion of the loaded index (v2 is upgraded in memory; the next repowiki-index writes v3).' },
          locale: { type: 'string', description: 'Locale actually used for docs/memory/wiki citations.' },
          localeRequested: { type: 'string', description: 'Locale requested by the caller or inferred from the session.' },
          localeSource: { type: 'string', enum: ['explicit', 'preferred', 'fallback', 'default'], description: 'How the locale was chosen; fallback means the requested locale has no assets.' },
          matches: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                lang: { type: 'string' },
                symbols: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string' },
                      kind: { type: 'string' },
                      line: { type: 'integer' },
                      endLine: { type: 'integer' },
                      exported: { type: 'boolean' },
                      parent: { type: 'string', description: 'Owning type for methods (class/struct/etc.).' },
                    },
                    required: ['name', 'kind', 'line', 'endLine', 'exported'],
                  },
                },
              },
              required: ['path', 'lang', 'symbols'],
            },
          },
          total: { type: 'integer' },
          truncated: { type: 'boolean' },
          offset: { type: 'integer', description: 'Number of matches skipped before this page.' },
          technologies: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string' },
                ecosystem: { type: 'string' },
              },
              required: ['name', 'ecosystem'],
            },
          },
          hint: { type: 'string' },
          modules: {
            type: 'array',
            description: 'Module tree of the indexed repository (directory grouping, direct file counts).',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                parent: { type: 'string' },
                files: { type: 'integer' },
                symbols: { type: 'integer' },
              },
              required: ['path', 'parent', 'files', 'symbols'],
            },
          },
          knowledge: {
            type: 'array',
            description: 'BM25-ranked knowledge documents (cards/wiki/accepted memory) when target=docs/all.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                type: { type: 'string', enum: ['card', 'wiki', 'memory'] },
                path: { type: 'string' },
                title: { type: 'string' },
                score: { type: 'number' },
                snippet: { type: 'string' },
              },
              required: ['type', 'path', 'title', 'score', 'snippet'],
            },
          },
          knowledgeTotal: { type: 'integer' },
          knowledgeTruncated: { type: 'boolean' },
          target: { type: 'string', enum: ['symbols', 'docs', 'all'] },
          memories: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                slug: { type: 'string' },
                title: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },
                summary: { type: 'string' },
                path: { type: 'string' },
              },
              required: ['slug', 'title', 'tags', 'summary'],
            },
          },
          references: {
            type: 'array',
            description: 'Import-level reverse references for matched symbols when references=true.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', description: 'File that defines/owns the symbol.' },
                symbol: { type: 'string' },
                referencedBy: {
                  type: 'array',
                  description: 'Import sites that reference this symbol, sorted by path then line. Indexes before schema v5 only carry the path.',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      path: { type: 'string' },
                      line: { type: 'integer', description: '1-based line of the import/use/require statement.' },
                    },
                    required: ['path'],
                  },
                },
              },
              required: ['path', 'symbol', 'referencedBy'],
            },
          },
          referencesTruncated: { type: 'boolean', description: 'True when more reference entries exist than were returned.' },
          wikiReferences: {
            type: 'array',
            description: 'Wiki pages/sections that cite matched files when wikiReferences=true.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', description: 'Source file that the wiki page cites.' },
                slug: { type: 'string' },
                title: { type: 'string' },
                sections: { type: 'array', items: { type: 'string' }, description: 'Section headings that cite the file; empty for page-level-only citations.' },
              },
              required: ['path', 'slug', 'title', 'sections'],
            },
          },
          wikiReferencesTruncated: { type: 'boolean', description: 'True when more wiki citation entries exist than were returned.' },
          imports: {
            type: 'array',
            description: 'Outgoing import edges for matched files when imports=true (transitive up to depth).',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', description: 'Imported file (a transitive target when depth > 1).' },
                line: { type: 'integer', description: '1-based line of the import/use/require/include statement.' },
                symbols: { type: 'array', items: { type: 'string' }, description: 'Named symbols imported from the target; empty for side-effect imports.' },
                depth: { type: 'integer', description: 'Hops from the matched file (1 = direct dependency).' },
              },
              required: ['path', 'symbols', 'depth'],
            },
          },
          importsTruncated: { type: 'boolean', description: 'True when more outgoing edges exist than were returned.' },
          dependents: {
            type: 'array',
            description: 'Files that depend on the matched files (reverse import edges) when dependents=true.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', description: 'Depending file (a transitive dependent when depth > 1).' },
                line: { type: 'integer', description: '1-based line of the import/use/require/include statement in the depending file.' },
                symbols: { type: 'array', items: { type: 'string' }, description: 'Named symbols the depending file takes from its target; empty for side-effect imports.' },
                depth: { type: 'integer', description: 'Hops to the matched file (1 = direct dependent).' },
              },
              required: ['path', 'symbols', 'depth'],
            },
          },
          dependentsTruncated: { type: 'boolean', description: 'True when more dependents exist than were returned.' },
          symbolUsages: {
            type: 'array',
            description: 'Lexical usage evidence for matched symbols when usages=true (direct named importers only).',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', description: 'File that defines/owns the symbol.' },
                symbol: { type: 'string' },
                importers: {
                  type: 'array',
                  description: 'Direct named importers whose sources were considered, sorted by path then line.',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      path: { type: 'string' },
                      line: { type: 'integer', description: '1-based line of the import statement.' },
                    },
                    required: ['path'],
                  },
                },
                usages: {
                  type: 'array',
                  description: 'Identifier-boundary matches inside importer sources; import lines and whole-line comments are excluded.',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      path: { type: 'string' },
                      line: { type: 'integer' },
                      text: { type: 'string', description: 'Trimmed source line, truncated to 200 characters.' },
                    },
                    required: ['path', 'line', 'text'],
                  },
                },
                filesScanned: { type: 'integer', description: 'Importer files successfully read for this symbol.' },
                unreadable: { type: 'array', items: { type: 'string' }, description: 'Importer paths that could not be read; their usage sites are unknown, not absent.' },
                truncated: { type: 'boolean', description: 'True when this symbol hit the per-symbol/total site cap or had an importer skipped by the file cap.' },
              },
              required: ['path', 'symbol', 'importers', 'usages', 'filesScanned', 'unreadable', 'truncated'],
            },
          },
          symbolUsagesSkipped: { type: 'integer', description: 'Matched symbols not scanned because of the 5-symbol cap.' },
          symbolUsagesSkippedFiles: { type: 'integer', description: 'Importer files not read because of the 20-file cap.' },
          symbolUsagesTruncated: { type: 'boolean', description: 'True when usage sites or importer files hit their caps.' },
        },
        required: ['indexed', 'matches', 'total', 'truncated', 'offset'],
      },
      render: (_args, value) => {
        if (!value.indexed) {
          return [{ type: 'text', text: value.hint }]
        }
        const lines = value.matches.map(f =>
          `${f.path} — ${f.symbols.length} symbol(s): ${f.symbols.slice(0, 8).map(s => `${s.name} (${s.kind}:${s.line}${s.parent ? `, in ${s.parent}` : ''})`).join(', ')}${f.symbols.length > 8 ? ', …' : ''}`)
        const knowledgeLines = Array.isArray(value.knowledge) && value.knowledge.length > 0
          ? value.knowledge.map(k => `[${k.type}] ${k.title} — ${k.path || '(no path)'} (score ${k.score})\n  ${k.snippet}`)
          : []
        const fileRange = value.matches.length > 0
          ? `${value.offset + 1}–${value.offset + value.matches.length}`
          : 'none'
        const knowledgeRange = Array.isArray(value.knowledge) && value.knowledge.length > 0
          ? `${value.offset + 1}–${value.offset + value.knowledge.length}`
          : 'none'
        const tail = value.truncated || value.offset > 0
          ? `\n… ${value.total} matching file(s) total, showing ${fileRange}`
          : ''
        const knowledgeTail = value.knowledgeTruncated || value.offset > 0
          ? `\n… ${value.knowledgeTotal} knowledge hit(s) total, showing ${knowledgeRange}`
          : ''
        const memoryLine = Array.isArray(value.memories) && value.memories.length > 0
          ? `\nMemory: ${value.memories.map(m => `${m.title}${m.path ? ` (${m.path})` : ''}`).join('; ')}`
          : ''
        const localeLine = value.localeSource === 'fallback'
          ? `\nLocale: ${value.locale} (requested ${value.localeRequested} has no assets)`
          : ''
        const referenceLines = Array.isArray(value.references) && value.references.length > 0
          ? `\nReferences:\n${value.references.slice(0, 10).map(r => `- ${r.symbol} in ${r.path} ← ${r.referencedBy.map(formatReferenceSite).join(', ')}`).join('\n')}${value.referencesTruncated ? '\n… more reference entries omitted' : ''}`
          : ''
        const wikiLines = Array.isArray(value.wikiReferences) && value.wikiReferences.length > 0
          ? `\nWiki citations:\n${value.wikiReferences.slice(0, 10).map(r => `- ${r.path} ← ${r.title}${r.sections.length > 0 ? ` (${r.sections.join(' / ')})` : ''}`).join('\n')}${value.wikiReferencesTruncated ? '\n… more wiki citations omitted' : ''}`
          : ''
        const importLines = Array.isArray(value.imports) && value.imports.length > 0
          ? `\nImports:\n${formatEdgeEntries(value.imports, '→', '⇢')}${value.importsTruncated ? '\n… more import entries omitted' : ''}`
          : ''
        const dependentLines = Array.isArray(value.dependents) && value.dependents.length > 0
          ? `\nDependents:\n${formatEdgeEntries(value.dependents, '←', '⇠')}${value.dependentsTruncated ? '\n… more dependent entries omitted' : ''}`
          : ''
        const usageLines = Array.isArray(value.symbolUsages) && value.symbolUsages.length > 0
          ? `\nUsages:\n${value.symbolUsages.map((entry) => {
            const head = `- ${entry.symbol} in ${entry.path} — ${entry.usages.length} site(s) in ${entry.filesScanned} file(s)${entry.importers.length === 0 ? ' (no named importer)' : ''}${entry.truncated ? ' [truncated]' : ''}`
            const sites = entry.usages.slice(0, 5).map(site => `  ${site.path}:L${site.line}: ${site.text}`)
            const unreadable = entry.unreadable.length > 0
              ? [`  unreadable: ${entry.unreadable.join(', ')} (usage unknown, not absent)`]
              : []
            return [head, ...sites, ...unreadable].join('\n')
          }).join('\n')}${value.symbolUsagesTruncated ? '\n… more usage sites or importer files omitted' : ''}${value.symbolUsagesSkipped > 0 ? `\n… ${value.symbolUsagesSkipped} matched symbol(s) not scanned (cap 5)` : ''}`
          : ''
        return [{ type: 'text', text: [...lines, ...knowledgeLines].join('\n') + tail + knowledgeTail + memoryLine + localeLine + referenceLines + wikiLines + importLines + dependentLines + usageLines + (value.hint ? `\n${value.hint}` : '') }]
      },
    },
    async execute(args, _exec) {
      const fs = ctx.fs
      if (!fs) {
        throw new Error('repowiki-cards requires the ctx.fs capability to be available in this profile')
      }
      const startDir = cwdOf(ctx)
      const { root } = await resolveAssetRoot(fs, startDir)
      const index = await readIndex(fs, root)
      if (!index) {
        return {
          indexed: false,
          matches: [],
          total: 0,
          truncated: false,
          offset: 0,
          hint: 'No usable index found for this project. Run the repowiki-index tool first to build .dsh-repowiki/index.json.',
        }
      }
      const target = ['symbols', 'docs', 'all'].includes(args.target) ? args.target : 'symbols'
      const limit = typeof args.limit === 'number' ? Math.max(1, Math.floor(args.limit)) : undefined
      const offset = typeof args.offset === 'number' && Number.isFinite(args.offset)
        ? Math.max(0, Math.floor(args.offset))
        : 0
      const { matches, total, truncated } = target === 'docs'
        ? { matches: [], total: 0, truncated: false }
        : searchIndex(index, {
          query: typeof args.query === 'string' ? args.query : undefined,
          kind: typeof args.kind === 'string' ? args.kind : undefined,
          pathPrefix: typeof args.path === 'string' ? args.path : undefined,
          module: typeof args.module === 'string' ? args.module : undefined,
          lang: typeof args.lang === 'string' ? args.lang : undefined,
          exportedOnly: args.exportedOnly === true,
          // limit=0 会得到 truncated=true 且空结果，钳制为 ≥1
          limit,
          offset,
        })

      const requestedLocale = typeof args.locale === 'string' && SUPPORTED_LOCALES.includes(args.locale)
        ? args.locale
        : getLocale(ctx)
      const localeInfo = await resolveContentLocale(
        fs, root, requestedLocale, typeof args.locale === 'string' && SUPPORTED_LOCALES.includes(args.locale),
      )
      const locale = localeInfo.locale
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      let acceptedEntries = null
      /**
       * 懒加载已采信记忆（docs 检索与 includeMemory 共用一个快照）。
       * @returns {Promise<object[]>} 已采信记忆（带正文）。
       */
      const readAccepted = async () => {
        if (!acceptedEntries) acceptedEntries = await listMemory(fs, root, locale, 'accepted', true)
        return acceptedEntries
      }

      // 正文检索（BM25）：卡片 + Wiki + 已采信记忆
      let knowledge = null
      let knowledgeTotal = 0
      let knowledgeTruncated = false
      let knowledgeHint = ''
      if (target !== 'symbols') {
        if (!query) {
          knowledge = []
          knowledgeHint = 'query is required for docs search.'
        } else {
          const [cardDocs, wikiDocs, memoryEntries] = await Promise.all([
            readCardDocuments(fs, root, locale),
            readWikiDocuments(fs, root, locale),
            readAccepted(),
          ])
          const docs = [
            ...cardDocs.map(doc => ({ ...doc, type: 'card' })),
            ...wikiDocs.map(doc => ({ ...doc, type: 'wiki' })),
            ...memoryEntries.map(entry => ({
              id: `memory:${entry.slug}`,
              type: 'memory',
              path: entry.path ?? '',
              title: entry.title,
              tags: entry.tags,
              body: entry.body ?? '',
            })),
          ]
          const ranked = rankDocuments(docs, query, { limit: limit ?? DEFAULT_RESULT_LIMIT, offset })
          knowledge = ranked.results
          knowledgeTotal = ranked.total
          knowledgeTruncated = ranked.truncated
        }
      }

      // 反向引用（import 级）：查询命中的符号被哪些文件导入
      let referenceResult = null
      if (args.references === true) {
        referenceResult = referencesFor(buildReferenceIndex(index.edges, index.files), matches)
      }

      // 出边（正向依赖）与依赖方（反向影响面）共用 depth：1–MAX_IMPORT_DEPTH，
      // 非法或越界值集中钳制一次
      const depth = typeof args.depth === 'number' && Number.isFinite(args.depth)
        ? Math.min(MAX_IMPORT_DEPTH, Math.max(1, Math.floor(args.depth)))
        : 1

      // 出边（正向依赖）：命中文件 import 了哪些文件；depth>1 展开传递依赖
      let importResult = null
      if (args.imports === true) {
        importResult = importsFor(index.edges, matches, MAX_IMPORT_ENTRIES, depth)
      }

      // 依赖方（反向影响面）：谁 import 了命中文件；depth>1 展开传递依赖方
      let dependentResult = null
      if (args.dependents === true) {
        dependentResult = dependentsFor(index.edges, matches, MAX_IMPORT_ENTRIES, depth)
      }

      // 词法使用点：在直接具名导入方里按标识符边界定位出现行（有界读取）
      let usageResult = null
      if (args.usages === true) {
        usageResult = await collectSymbolUsages(fs, root, index.edges ?? [], matches, index.files ?? [])
      }

      // Wiki 引用反查：命中文件被哪些 Wiki 页面/章节引用
      let wikiReferenceResult = null
      let wikiHint = ''
      if (args.wikiReferences === true) {
        const manifest = await readWikiManifest(fs, root, locale)
        if (manifest) {
          wikiReferenceResult = wikiReferencesFor(
            buildWikiReferenceIndex(manifest),
            matches.map(match => match.path),
          )
        } else {
          wikiReferenceResult = { wikiReferences: [], truncated: false }
          wikiHint = 'No wiki manifest for this locale; run repowiki-generate before wikiReferences=true.'
        }
      }

      // 记忆消费侧（Phase 4）：includeMemory=true 时附已采信记忆，按 query 过滤
      let memories
      if (args.includeMemory === true) {
        const entries = await readAccepted()
        const q = query.toLowerCase()
        const filtered = q
          ? entries.filter(m => `${m.title}\n${m.tags.join(' ')}\n${m.body ?? ''}`.toLowerCase().includes(q))
          : entries
        memories = filtered.map(m => ({
          slug: m.slug,
          title: m.title,
          tags: m.tags,
          summary: (m.body ?? '').split('\n')[0].slice(0, 200),
          ...(typeof m.path === 'string' && m.path ? { path: m.path } : {}),
        }))
      }

      const localeHint = localeInfo.source === 'fallback'
        ? `No ${requestedLocale} cards/wiki/memory were found; using ${locale} instead.`
        : ''
      const hint = [knowledgeHint, wikiHint, localeHint].filter(Boolean).join(' ')
      return {
        indexed: true,
        root,
        indexPath: `${root}/.dsh-repowiki/index.json`,
        indexVersion: index.schemaVersion,
        locale,
        localeRequested: requestedLocale,
        localeSource: localeInfo.source,
        target,
        matches,
        total,
        truncated,
        offset,
        technologies: (index.stack?.technologies ?? []).map(t => ({ name: t.name, ecosystem: t.ecosystem })),
        modules: Array.isArray(index.modules) ? index.modules : [],
        ...(knowledge ? { knowledge, knowledgeTotal, knowledgeTruncated } : {}),
        ...(hint ? { hint } : {}),
        ...(memories ? { memories } : {}),
        ...(referenceResult ? { references: referenceResult.references, referencesTruncated: referenceResult.truncated } : {}),
        ...(importResult ? { imports: importResult.imports, importsTruncated: importResult.truncated } : {}),
        ...(dependentResult ? { dependents: dependentResult.dependents, dependentsTruncated: dependentResult.truncated } : {}),
        ...(usageResult ? {
          symbolUsages: usageResult.entries,
          symbolUsagesSkipped: usageResult.skipped,
          symbolUsagesSkippedFiles: usageResult.skippedFiles,
          symbolUsagesTruncated: usageResult.truncated,
        } : {}),
        ...(wikiReferenceResult
          ? { wikiReferences: wikiReferenceResult.wikiReferences, wikiReferencesTruncated: wikiReferenceResult.truncated }
          : {}),
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Search repository knowledge',
      kind: 'search',
      rawInput: { query: args.query ?? '', kind: args.kind ?? '', path: args.path ?? '', module: args.module ?? '', lang: args.lang ?? '', exportedOnly: args.exportedOnly ?? false, target: args.target ?? 'symbols', includeMemory: args.includeMemory ?? false, references: args.references ?? false, wikiReferences: args.wikiReferences ?? false, imports: args.imports ?? false, dependents: args.dependents ?? false, usages: args.usages ?? false, depth: args.depth ?? 1, locale: args.locale ?? 'auto' },
    }),
    presentResult: (_args, result) => {
      // 官方渲染词汇：发现型搜索用 card:'search'，按文件分组显示匹配
      const value = result.value
      if (!value?.indexed) return undefined // 回退到 render 的 hint 文本
      const total = value.target === 'docs'
        ? value.knowledgeTotal
        : value.target === 'all'
          ? value.total + (value.knowledgeTotal ?? 0)
          : value.total
      const truncated = value.target === 'docs' ? value.knowledgeTruncated : value.truncated
      return {
        card: 'search',
        shape: 'matches',
        title: total > 0 ? `${total} result(s) match` : 'No matches',
        total,
        truncated,
      }
    },
  }
}
