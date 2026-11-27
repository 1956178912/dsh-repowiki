/**
 * repowiki-impact 工具：给定准备修改的文件，返回静态 import 图上的影响面。
 *
 * 定位是"改之前先看爆炸半径"：AI 编程代理在编辑前调用一次，即可知道
 * 哪些文件会间接受影响、是否踩在循环依赖上、哪些卡片/Wiki 会因此失效，
 * 以及建议的验证顺序。只读、无 LLM、输出有界。
 */

import { resolveAssetRoot, readIndex } from './assets.js'
import { readExistingCards, readWikiManifest } from './knowledge.js'
import { resolveContentLocale } from './locale.js'
import { getLocale } from './spawn.js'
import { cwdOf } from './util.js'
import { SUPPORTED_LOCALES, DEFAULT_RESULT_LIMIT } from './schema.js'
import {
  matchChangedPaths, computeImpact, computeSymbolImpact, resolveSymbolChanges,
  cyclesForChanged, hubsForChanged,
  affectedDocs, assessRisk, recommendationsFor,
  MAX_IMPACT_DEPTH, MAX_IMPACT_ENTRIES, MAX_IMPACT_CYCLES, MAX_IMPACT_CYCLE_FILES, MAX_IMPACT_DOCS,
} from './impact.js'
import {
  findSymbolUsages, usageImporters, selectUsageFiles,
  MAX_USAGE_ENTRIES, MAX_USAGES_PER_SYMBOL, MAX_USAGE_FILES,
} from './usages.js'
import { readPlan } from './config.js'
import { architectureImpact } from './impact-architecture.js'

/** 改动文件源码读取的并发上限（热点函数只需改动文件）。 */
const IMPACT_READ_CONCURRENCY = 8

/**
 * 有界并发读取改动文件源码（热点函数输入）。
 * @param {FsService} fs - ctx.fs。
 * @param {string} root - 项目根。
 * @param {string[]} paths - 已匹配的索引路径。
 * @returns {Promise<Array<{path:string, text:string}>>} 可读源码。
 */
async function readChangedSources(fs, root, paths) {
  const sources = []
  let cursor = 0
  const worker = async () => {
    while (cursor < paths.length) {
      const path = paths[cursor++]
      try {
        sources.push({ path, text: await fs.readText(await fs.resolve(path, { cwd: root })) })
      } catch {
        // 不可读文件跳过：热点统计只覆盖可验证源码
      }
    }
  }
  await Promise.all(Array.from({ length: IMPACT_READ_CONCURRENCY }, worker))
  sources.sort((a, b) => a.path.localeCompare(b.path))
  return sources
}

/** 工具描述。 */
const DESCRIPTION = [
  'Analyze the blast radius of a change before editing. Given the files you plan to change,',
  'return the static import-graph consequences: direct and transitive dependents (bounded,',
  'nearest hop wins), import cycles the change sits on, fan-in counts, knowledge cards and wiki',
  'pages/sections that cite those files, a heuristic risk level with its scoring factors, and',
  'ordered verification steps. Pass symbols (name or path#name) to require named-import evidence',
  'for direct impact while retaining the unfiltered file total as an upper bound; by default the',
  'importers are also scanned for lexical usage sites (identifier-boundary occurrences, not resolved',
  'call sites; set includeUsages=false to skip source reads). The declared layer of the change,',
  'impacted-layer distribution, cross-layer edges and high-complexity hotspots in the changed',
  'files are reported with the same rules as repowiki-status. Impacted files that look like tests',
  'are listed separately (path heuristics) so the right test files can run first. Read-only and',
  'deterministic; based on import/use/require edges, not a runtime call graph. Run repowiki-index first.',
].join(' ')

/**
 * 把输入规整为路径数组（容忍模型传字符串）。
 * @param {unknown} value - 工具参数 paths。
 * @returns {string[]} 非空路径。
 */
function normalizeInputs(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,]+/)
      : []
  return list
    .filter(item => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
}

/**
 * 构造 repowiki-impact 工具定义。
 * @param {PluginContext} ctx - 插件上下文（提供 ctx.fs）。
 * @returns {object} ToolDefinition。
 */
export function repowikiImpactTool(ctx) {
  return {
    name: 'repowiki-impact',
    description: DESCRIPTION,
    parameters: {
      paths: {
        type: 'array',
        description: 'Files you plan to change, relative to the project root (absolute paths are also accepted). Ambiguous basenames are reported, never guessed.',
        items: { type: 'string' },
      },
      symbols: {
        type: 'array',
        description: 'Optional symbol names to narrow the analysis, e.g. ["parseConfig"] or ["src/config.ts#parseConfig"]. Only direct importers of these symbols are seeds; deeper hops remain a conservative file-graph upper bound.',
        items: { type: 'string' },
      },
      depth: {
        type: 'integer',
        description: `Transitive dependent hops to expand (1-${MAX_IMPACT_DEPTH}, default 2).`,
      },
      limit: {
        type: 'integer',
        description: `Max impacted files listed (1-${MAX_IMPACT_ENTRIES}, default ${DEFAULT_RESULT_LIMIT}). Totals stay exact when truncated.`,
      },
      root: {
        type: 'string',
        description: 'Optional project root. Defaults to the current directory; the asset root is found by walking up for .dsh-repowiki.',
      },
      locale: {
        type: 'string',
        enum: ['zh', 'en'],
        description: 'Locale for affected cards/wiki citations. Omit to use the session language with fallback to the other locale when it is the only one with assets.',
      },
      includeDocs: {
        type: 'boolean',
        description: 'Also report cards and wiki pages/sections citing the changed files (default true).',
      },
      includeUsages: {
        type: 'boolean',
        description: `In symbol scope, scan direct importers for lexical usage sites (default true; at most ${MAX_USAGE_FILES} files, ${MAX_USAGES_PER_SYMBOL} per symbol, ${MAX_USAGE_ENTRIES} total). These are identifier occurrences, not resolved call sites.`,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          indexed: { type: 'boolean' },
          scope: { type: 'string', enum: ['file', 'symbol'], description: 'symbol when a symbols filter was supplied; file otherwise.' },
          root: { type: 'string' },
          locale: { type: 'string' },
          localeRequested: { type: 'string' },
          localeSource: { type: 'string', enum: ['explicit', 'preferred', 'fallback', 'default'] },
          changed: {
            type: 'array',
            description: 'Matched changed files with their language and symbol count.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                lang: { type: 'string' },
                symbols: { type: 'integer', description: 'Number of symbols defined in this file.' },
              },
              required: ['path', 'lang', 'symbols'],
            },
          },
          symbolChanges: {
            type: 'array',
            description: 'Resolved symbol definitions used as the change scope.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                name: { type: 'string' },
                kind: { type: 'string' },
                line: { type: 'integer', description: 'Definition line, or 0 when the index has no line.' },
              },
              required: ['path', 'name', 'kind', 'line'],
            },
          },
          unmatchedSymbols: { type: 'array', items: { type: 'string' } },
          symbolReferences: {
            type: 'array',
            description: 'Named import sites proving direct symbol impact; not runtime call sites.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                line: { type: 'integer' },
                symbols: { type: 'array', items: { type: 'string' } },
              },
              required: ['path', 'line', 'symbols'],
            },
          },
          conservativeImpactedTotal: { type: 'integer', description: 'Unfiltered file-level impact total, retained as an upper bound in symbol scope.' },
          usages: {
            type: 'array',
            description: 'Lexical usage sites of the selected symbols inside their direct importers; identifier-boundary occurrences, not resolved call sites (strings and trailing comments may match).',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', description: 'Importer file containing the occurrence.' },
                symbol: { type: 'string' },
                line: { type: 'integer' },
                text: { type: 'string', description: 'Trimmed source line, truncated at 200 characters.' },
              },
              required: ['path', 'symbol', 'line', 'text'],
            },
          },
          usagesScanned: { type: 'integer', description: 'Importer files successfully read and scanned.' },
          usagesSkippedFiles: { type: 'integer', description: 'Importer files not scanned because of the file cap or a read failure.' },
          usagesTruncated: { type: 'boolean' },
          usagesUnreadable: { type: 'array', items: { type: 'string' }, description: 'Importer paths that could not be read; their usage sites are unknown, not absent.' },
          unmatched: { type: 'array', items: { type: 'string' }, description: 'Inputs that match no indexed file.' },
          ambiguous: {
            type: 'array',
            description: 'Inputs matching more than one indexed file; candidates are listed instead of guessing.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                query: { type: 'string' },
                candidates: { type: 'array', items: { type: 'string' } },
              },
              required: ['query', 'candidates'],
            },
          },
          impacted: {
            type: 'array',
            description: 'Files that transitively depend on the changed files (nearest hop wins), ordered by depth then path.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                depth: { type: 'integer', description: '1 = direct importer.' },
                symbols: { type: 'array', items: { type: 'string' }, description: 'Named symbols imported directly from a changed file; empty for deeper hops.' },
              },
              required: ['path', 'depth', 'symbols'],
            },
          },
          impactedTotal: { type: 'integer', description: 'Exact number of impacted files within the requested depth (even when truncated).' },
          impactedDirect: { type: 'integer', description: 'Exact number of direct importers.' },
          impactedTruncated: { type: 'boolean' },
          affectedTests: {
            type: 'array',
            description: 'Impacted files that look like tests by path heuristics (test/spec directories and common naming conventions), nearest hop first, up to 50. Heuristics can misclassify; verify before running.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                depth: { type: 'integer', description: '1 = direct importer of a changed file.' },
              },
              required: ['path', 'depth'],
            },
          },
          affectedTestsTruncated: { type: 'boolean' },
          cycles: {
            type: 'array',
            description: 'Import cycles (strong connected components) containing at least one changed file, capped at 10 groups.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                files: { type: 'array', items: { type: 'string' } },
                size: { type: 'integer' },
                truncated: { type: 'boolean' },
                sample: { type: 'array', items: { type: 'string' }, description: 'Shortest cycle through the group, e.g. [a, b, a].' },
                contains: { type: 'array', items: { type: 'string' }, description: 'Changed files inside this group.' },
              },
              required: ['files', 'size', 'truncated', 'sample', 'contains'],
            },
          },
          cyclesTruncated: { type: 'boolean' },
          hubs: {
            type: 'array',
            description: 'Direct fan-in of the changed files (distinct importers), highest first.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                dependents: { type: 'integer' },
              },
              required: ['path', 'dependents'],
            },
          },
          architecture: {
            type: 'object',
            description: 'Architecture context for the change, using the same layer rules as repowiki-status and verify:arch: declared layers, the layers of the changed and impacted files, cross-layer import edges between changed and impacted files, and high-complexity functions inside the changed files.',
            additionalProperties: false,
            properties: {
              declaredLayers: {
                type: 'array',
                description: 'Declared layers with indexed file counts.',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    files: { type: 'integer' },
                  },
                  required: ['name', 'files'],
                },
              },
              changedLayers: { type: 'array', items: { type: 'string' }, description: 'Sorted distinct layers of the changed files.' },
              impactedLayers: {
                type: 'array',
                description: 'Impacted dependents grouped by layer (bounded).',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    layer: { type: 'string' },
                    files: { type: 'integer' },
                  },
                  required: ['layer', 'files'],
                },
              },
              crossLayerPairs: {
                type: 'array',
                description: 'Import edges between a changed file and an impacted file whose layers differ (exact counts, bounded by layer pairs).',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    from: { type: 'string' },
                    to: { type: 'string' },
                    count: { type: 'integer' },
                  },
                  required: ['from', 'to', 'count'],
                },
              },
              hotspots: {
                type: 'array',
                description: 'Functions in the changed files at or above the plan complexity threshold (up to 10, highest first).',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    path: { type: 'string' },
                    name: { type: 'string' },
                    line: { type: 'integer' },
                    endLine: { type: 'integer' },
                    complexity: { type: 'integer' },
                  },
                  required: ['path', 'name', 'line', 'endLine', 'complexity'],
                },
              },
              hotspotTotal: { type: 'integer', description: 'Exact count of high-complexity functions in the changed files (readable sources only).' },
            },
            required: ['declaredLayers', 'changedLayers', 'impactedLayers', 'crossLayerPairs', 'hotspots', 'hotspotTotal'],
          },
          cards: {
            type: 'array',
            description: 'Knowledge cards that document the changed files.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                title: { type: 'string' },
                stale: { type: 'boolean', description: 'Card digest no longer matches the index.' },
              },
              required: ['path', 'title', 'stale'],
            },
          },
          wiki: {
            type: 'array',
            description: 'Wiki pages/sections citing the changed files.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                slug: { type: 'string' },
                title: { type: 'string' },
                sections: { type: 'array', items: { type: 'string' } },
              },
              required: ['path', 'slug', 'title', 'sections'],
            },
          },
          wikiTruncated: { type: 'boolean' },
          risk: {
            type: 'object',
            description: 'Heuristic risk level with explicit scoring factors (static import graph, not a guarantee).',
            additionalProperties: false,
            properties: {
              score: { type: 'integer' },
              level: { type: 'string', enum: ['low', 'moderate', 'high', 'critical'] },
              factors: { type: 'array', items: { type: 'string' } },
            },
            required: ['score', 'level', 'factors'],
          },
          recommendations: { type: 'array', items: { type: 'string' } },
          hint: { type: 'string', description: 'Present when the tool degrades (no index, no matched path, truncation note).' },
          durationMs: { type: 'integer' },
        },
        required: ['indexed', 'durationMs'],
      },
      render: (_args, value) => {
        if (!value.indexed) return [{ type: 'text', text: value.hint ?? 'No usable index; run repowiki-index first.' }]
        if (value.changed.length === 0) {
          return [{ type: 'text', text: [value.hint ?? 'No changed file matched the index.', ...(value.ambiguous ?? []).map(a => `Ambiguous: ${a.query} → ${a.candidates.join(' | ')}`)].join('\n') }]
        }
        const lines = [
          `Impact for ${value.changed.length} changed file(s) in ${value.root}${value.scope === 'symbol' ? ' [symbol scope]' : ''}${value.localeSource === 'fallback' ? ` (docs locale ${value.locale}, fallback from ${value.localeRequested})` : ''}`,
          `Changed: ${value.changed.map(item => `${item.path} (${item.lang || 'unknown'}, ${item.symbols} symbols)`).join('; ')}`,
        ]
        if (value.scope === 'symbol') {
          lines.push(`Symbols: ${(value.symbolChanges ?? []).map(item => `${item.path}#${item.name}${item.line ? `:${item.line}` : ''}`).join('; ') || '(none resolved)'}`)
          if ((value.unmatchedSymbols ?? []).length > 0) lines.push(`Unmatched symbols: ${value.unmatchedSymbols.join(', ')}`)
          for (const ref of (value.symbolReferences ?? []).slice(0, 10)) {
            lines.push(`- import evidence: ${ref.path}${ref.line ? `:${ref.line}` : ''} (${ref.symbols.join(', ')})`)
          }
          const usages = value.usages ?? []
          if (usages.length > 0) {
            lines.push('Usage evidence (lexical occurrences, not resolved call sites):')
            for (const site of usages.slice(0, 8)) {
              lines.push(`- ${site.path}:${site.line} (${site.symbol}) — ${site.text}`)
            }
            if (usages.length > 8) lines.push(`… ${usages.length - 8} more usage site(s) omitted`)
          } else if ((value.usagesScanned ?? 0) > 0) {
            lines.push('Usage evidence: no lexical occurrence in the scanned importer files.')
          }
          if ((value.usagesUnreadable ?? []).length > 0) {
            lines.push(`Unreadable for usage scan: ${value.usagesUnreadable.join(', ')} (usage unknown, not absent)`)
          }
        }
        if (value.unmatched.length > 0) lines.push(`Unmatched: ${value.unmatched.join(', ')}`)
        for (const item of value.ambiguous ?? []) lines.push(`Ambiguous: ${item.query} → ${item.candidates.join(' | ')}`)
        const transitive = Math.max(0, value.impactedTotal - value.impactedDirect)
        lines.push(`Impacted: ${value.impactedDirect} direct / ${transitive} transitive${value.impactedTruncated ? ` (showing ${value.impacted.length} of ${value.impactedTotal})` : ''}`)
        if (value.scope === 'symbol') lines.push(`File-level upper bound: ${value.conservativeImpactedTotal ?? value.impactedTotal} impacted file(s); transitive symbol impact is conservative.`)
        for (const entry of value.impacted.slice(0, 10)) {
          const symbols = entry.symbols.length > 0 ? ` (${entry.symbols.slice(0, 6).join(', ')})` : ''
          lines.push(`- ${entry.depth === 1 ? '←' : '⇠'} ${entry.path}${entry.depth > 1 ? ` (${entry.depth} hops)` : ''}${symbols}`)
        }
        if (value.impacted.length > 10) lines.push(`… ${value.impacted.length - 10} more impacted file(s) omitted`)
        const affectedTests = value.affectedTests ?? []
        if (affectedTests.length > 0) {
          lines.push(`Affected tests: ${affectedTests.slice(0, 8).map(item => `${item.path}${item.depth > 1 ? ` (${item.depth} hops)` : ''}`).join('; ')}${affectedTests.length > 8 ? ` … +${affectedTests.length - 8}` : ''}${value.affectedTestsTruncated ? ' (truncated)' : ''}`)
        }
        if (value.cycles.length > 0) {
          lines.push(`Cycles: ${value.cycles.map(cycle => {
            const shown = cycle.files.slice(0, 3).join(' ↔ ')
            const hidden = cycle.size - Math.min(cycle.files.length, 3)
            const route = cycle.sample.length > 2 && cycle.sample.length <= 4 ? ` (${cycle.sample.join(' → ')})` : ''
            return `${hidden > 0 ? `${shown} (+${hidden})` : shown}${route}`
          }).join('; ')}${value.cyclesTruncated ? ' … more' : ''}`)
        }
        if (value.hubs.length > 0) {
          lines.push(`Fan-in: ${value.hubs.map(hub => `${hub.path} (${hub.dependents})`).join('; ')}`)
        }
        if (value.architecture) {
          const arch = value.architecture
          const parts = []
          if (arch.declaredLayers.length > 0) {
            parts.push(`layers ${arch.declaredLayers.map(layer => `${layer.name} (${layer.files})`).join(', ')}`)
          }
          if (arch.changedLayers.length > 0) parts.push(`changed ${arch.changedLayers.join(', ')}`)
          if (arch.impactedLayers.length > 0) {
            parts.push(`impacted ${arch.impactedLayers.map(layer => `${layer.layer} (${layer.files})`).join(', ')}`)
          }
          if (arch.crossLayerPairs.length > 0) {
            parts.push(`cross-layer ${arch.crossLayerPairs.map(pair => `${pair.from} → ${pair.to} (${pair.count})`).join(', ')}`)
          }
          if (arch.hotspotTotal > 0) {
            const example = arch.hotspots[0]
            parts.push(`hotspots ${arch.hotspotTotal}${example ? ` — e.g. ${example.path}#${example.name} (${example.complexity})` : ''}`)
          }
          if (parts.length > 0) lines.push(`Architecture: ${parts.join('; ')}`)
        }
        const cardPart = value.cards.length > 0
          ? `${value.cards.length} card(s)${value.cards.some(card => card.stale) ? `, ${value.cards.filter(card => card.stale).length} stale` : ''}`
          : 'no cards'
        lines.push(`Docs: ${cardPart}; ${value.wiki.length} wiki citation(s)${value.wikiTruncated ? ' (truncated)' : ''}`)
        lines.push(`Risk: ${value.risk.level} (${value.risk.score}/100)${value.risk.factors.length > 0 ? ` — ${value.risk.factors.join('; ')}` : ''}`)
        if (value.recommendations.length > 0) lines.push(`Next: ${value.recommendations.join(' ')}`)
        if (value.hint) lines.push(value.hint)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    timeoutMs: 30_000,
    async execute(args, _exec) {
      const fs = ctx.fs
      if (!fs) throw new Error('repowiki-impact requires the ctx.fs capability')
      const startedAt = Date.now()
      const startDir = typeof args.root === 'string' && args.root.trim() ? args.root : cwdOf(ctx)
      const { root } = await resolveAssetRoot(fs, startDir)
      const index = await readIndex(fs, root)
      if (!index) {
        return {
          indexed: false,
          root,
          durationMs: Date.now() - startedAt,
          hint: 'No usable index found for this project. Run the repowiki-index tool first, then analyze the change again.',
        }
      }
      const inputs = normalizeInputs(args.paths)
      if (inputs.length === 0) {
        return {
          indexed: true,
          root,
          changed: [],
          unmatched: [],
          ambiguous: [],
          impacted: [],
          impactedTotal: 0,
          impactedDirect: 0,
          impactedTruncated: false,
          cycles: [],
          cyclesTruncated: false,
          hubs: [],
          cards: [],
          wiki: [],
          wikiTruncated: false,
          risk: { score: 0, level: 'low', factors: [] },
          recommendations: [],
          durationMs: Date.now() - startedAt,
          hint: 'paths is required: list the files you plan to change (relative to the project root).',
        }
      }

      const match = matchChangedPaths(index, inputs, root)
      if (match.matched.length === 0) {
        return {
          indexed: true,
          root,
          changed: [],
          unmatched: match.unmatched,
          ambiguous: match.ambiguous,
          impacted: [],
          impactedTotal: 0,
          impactedDirect: 0,
          impactedTruncated: false,
          cycles: [],
          cyclesTruncated: false,
          hubs: [],
          cards: [],
          wiki: [],
          wikiTruncated: false,
          risk: { score: 0, level: 'low', factors: [] },
          recommendations: [],
          durationMs: Date.now() - startedAt,
          hint: match.ambiguous.length > 0
            ? 'No unambiguous indexed match. Pass a full relative path from the candidates above.'
            : 'None of the paths match indexed files. Use repowiki-cards with a path filter to find the right path.',
        }
      }

      const settings = index.files.reduce((map, file) => {
        if (file?.path) map.set(file.path, file)
        return map
      }, new Map())
      const changed = match.matched.map(path => {
        const file = settings.get(path)
        return {
          path,
          lang: typeof file?.lang === 'string' ? file.lang : '',
          symbols: Array.isArray(file?.symbols) ? file.symbols.length : 0,
        }
      })

      const depth = typeof args.depth === 'number' && Number.isFinite(args.depth)
        ? Math.min(MAX_IMPACT_DEPTH, Math.max(1, Math.floor(args.depth)))
        : 2
      const limit = typeof args.limit === 'number' && Number.isFinite(args.limit)
        ? Math.min(MAX_IMPACT_ENTRIES, Math.max(1, Math.floor(args.limit)))
        : DEFAULT_RESULT_LIMIT
      const symbolInputs = normalizeInputs(args.symbols)
      const scope = symbolInputs.length > 0 ? 'symbol' : 'file'
      const fileImpact = computeImpact(index.edges ?? [], match.matched, depth, limit)
      const symbolChanges = scope === 'symbol'
        ? resolveSymbolChanges(index, match.matched, symbolInputs, root)
        : { resolved: [], unmatched: [] }
      const symbolImpact = scope === 'symbol'
        ? computeSymbolImpact(index.edges ?? [], symbolChanges.resolved, depth, limit, index.files ?? [])
        : null
      const impact = symbolImpact ?? fileImpact

      // 符号级使用点：在直接具名导入方里按标识符边界定位出现行。这是词法
      // 证据（可能命中字符串/行尾注释），不是解析后的调用点；读取有上限，
      // 失败的文件单独披露，绝不把"没读到"当成"没使用"。
      const includeUsages = scope === 'symbol' && args.includeUsages !== false
      /** @type {Array<{path:string, symbol:string, line:number, text:string}>} */
      const usages = []
      let usagesScanned = 0
      let usagesSkippedFiles = 0
      let usagesTruncated = false
      /** @type {string[]} */
      const usagesUnreadable = []
      if (includeUsages && symbolChanges.resolved.length > 0) {
        /** @type {Map<string, {symbols:Set<string>, importLines:Set<number>}>} */
        const byFile = new Map()
        for (const symbol of symbolChanges.resolved) {
          for (const importer of usageImporters(index.edges ?? [], symbol, index.files ?? [])) {
            let entry = byFile.get(importer.path)
            if (!entry) {
              entry = { symbols: new Set(), importLines: new Set() }
              byFile.set(importer.path, entry)
            }
            entry.symbols.add(symbol.name)
            for (const line of importer.importLines) entry.importLines.add(line)
          }
        }
        const selection = selectUsageFiles([...byFile.keys()].map(path => ({ path })))
        usagesSkippedFiles += selection.skipped
        for (const path of selection.scanned) {
          const entry = byFile.get(path)
          if (!entry) continue
          let source
          try {
            source = await fs.readText(await fs.resolve(path, { cwd: root }))
          } catch {
            // 读取失败：明确列为缺口，不静默当作零使用。
            usagesUnreadable.push(path)
            usagesSkippedFiles++
            continue
          }
          usagesScanned++
          for (const name of [...entry.symbols].sort()) {
            const remaining = MAX_USAGE_ENTRIES - usages.length
            if (remaining <= 0) {
              usagesTruncated = true
              break
            }
            const found = findSymbolUsages(source, name, {
              skipLines: entry.importLines,
              limit: Math.min(MAX_USAGES_PER_SYMBOL, remaining),
            })
            for (const site of found.usages) usages.push({ path, symbol: name, ...site })
            if (found.truncated) usagesTruncated = true
          }
        }
      }
      const cycleResult = cyclesForChanged(index.edges ?? [], match.matched, {
        limit: MAX_IMPACT_CYCLES, filesPerCycle: MAX_IMPACT_CYCLE_FILES,
      })
      const hubs = hubsForChanged(index.edges ?? [], match.matched)
      const risk = assessRisk({
        direct: impact.direct, total: impact.total, cycles: cycleResult.cycles.length, hubs,
      })
      // 架构上下文：改动落在哪个声明层、受影响的层分布、跨层边与热点函数
      const { plan } = await readPlan(fs, root)
      const changedSources = await readChangedSources(fs, root, match.matched)
      const architecture = architectureImpact({
        files: index.files ?? [],
        edges: index.edges ?? [],
        layers: plan.layers,
        changed: match.matched,
        impacted: impact.impacted.map(item => item.path),
        sources: changedSources,
        threshold: plan.complexityThreshold,
      })

      // 文档影响面：卡片/Wiki 的 locale 沿用与 cards 相同的"有资产优先"策略
      const explicitLocale = typeof args.locale === 'string' && SUPPORTED_LOCALES.includes(args.locale)
      const requestedLocale = explicitLocale ? args.locale : getLocale(ctx)
      const localeInfo = await resolveContentLocale(fs, root, requestedLocale, explicitLocale)
      const includeDocs = args.includeDocs !== false
      const cardsMap = includeDocs ? await readExistingCards(fs, root, localeInfo.locale) : new Map()
      const digests = new Map((index.files ?? []).map(file => [file.path, file.digest]))
      const manifest = includeDocs ? await readWikiManifest(fs, root, localeInfo.locale) : null
      const docs = affectedDocs({
        changed: match.matched,
        cardsMap,
        digests,
        manifest,
        limit: MAX_IMPACT_DOCS,
      })
      const recommendations = recommendationsFor({ impact, cycles: cycleResult, hubs, docs, tests: impact.tests })

      const notes = []
      if (symbolChanges.unmatched.length > 0) notes.push(`No indexed definition matched: ${symbolChanges.unmatched.join(', ')}; these requests were not broadened to file scope.`)
      if (usagesUnreadable.length > 0) notes.push(`Usage scan could not read: ${usagesUnreadable.join(', ')}; their usage sites are unknown, not absent.`)
      if (usagesSkippedFiles > usagesUnreadable.length) notes.push(`Usage scan covered ${usagesScanned} importer file(s); the rest were skipped by the ${MAX_USAGE_FILES}-file cap.`)
      if (usagesTruncated) notes.push(`Usage evidence is capped at ${MAX_USAGES_PER_SYMBOL} sites per symbol and ${MAX_USAGE_ENTRIES} in total.`)
      if (impact.testsTruncated) notes.push('Affected test files are capped at 50; the list is incomplete but the impacted totals above remain exact.')
      if (impact.truncated) notes.push(`Only the first ${impact.impacted.length} of ${impact.total} impacted files are listed; raise limit or lower depth for detail.`)
      if (cycleResult.truncated) notes.push('More cycle groups touch the change than are listed; inspect repowiki-status cycles.')
      if (docs.wikiTruncated) notes.push(`Only ${docs.wiki.length} wiki citation(s) are listed.`)
      if (localeInfo.source === 'fallback') notes.push(`No ${requestedLocale} cards/wiki were found; docs are read from ${localeInfo.locale}.`)
      if (architecture.crossLayerPairs.length > 0) {
        notes.push(`The change crosses declared layers (${architecture.crossLayerPairs.map(pair => `${pair.from} → ${pair.to}`).join(', ')}); verify tests on both sides.`)
      }
      if (architecture.hotspotTotal > 0) {
        notes.push(`${architecture.hotspotTotal} high-complexity function(s) live in the changed files; review them before editing.`)
      }

      return {
        indexed: true,
        scope,
        root,
        locale: localeInfo.locale,
        localeRequested: requestedLocale,
        localeSource: localeInfo.source,
        changed,
        ...(scope === 'symbol' ? {
          symbolChanges: symbolChanges.resolved,
          unmatchedSymbols: symbolChanges.unmatched,
          symbolReferences: symbolImpact?.references ?? [],
          conservativeImpactedTotal: fileImpact.total,
          usages,
          usagesScanned,
          usagesSkippedFiles,
          usagesTruncated,
          usagesUnreadable,
        } : {}),
        unmatched: match.unmatched,
        ambiguous: match.ambiguous,
        impacted: impact.impacted,
        impactedTotal: impact.total,
        impactedDirect: impact.direct,
        impactedTruncated: impact.truncated,
        affectedTests: impact.tests,
        affectedTestsTruncated: impact.testsTruncated,
        cycles: cycleResult.cycles,
        cyclesTruncated: cycleResult.truncated,
        hubs,
        architecture,
        cards: docs.cards,
        wiki: docs.wiki,
        wikiTruncated: docs.wikiTruncated,
        risk,
        recommendations,
        ...(notes.length > 0 ? { hint: notes.join(' ') } : {}),
        durationMs: Date.now() - startedAt,
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Analyze change impact',
      kind: 'search',
      rawInput: { paths: Array.isArray(args.paths) ? args.paths.join(', ') : String(args.paths ?? ''), symbols: Array.isArray(args.symbols) ? args.symbols.join(', ') : String(args.symbols ?? ''), depth: args.depth ?? 2 },
    }),
  }
}
