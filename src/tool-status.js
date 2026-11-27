/**
 * repowiki-status 工具：知识库健康诊断（只读、无 LLM）。
 *
 * 回答“为什么面板/工具看起来不对”：索引是否存在及版本是否兼容、
 * 卡片是否陈旧/孤儿、Wiki 清单与陈旧页面、记忆审核计数、plan 来源、
 * 当前进程内锁队列。所有计数来自磁盘快照，不修改任何文件。
 */

import { resolveAssetRoot, readIndex } from './assets.js'
import {
  readExistingCards, listWikiPages, readWikiManifest, readKnowledgeIndex,
} from './knowledge.js'
import { listMemory } from './memory.js'
import { readPlan, selectCandidates } from './config.js'
import { documentationCoverage, assessHealth } from './health.js'
import { pendingLocks } from './lock.js'
import { INDEX_REL_PATH, SUPPORTED_LOCALES } from './schema.js'
import { resolveContentLocale } from './locale.js'
import { summarizeModuleRelations } from './modules.js'
import { findImportCycles } from './cycles.js'
import { topDependents, MAX_HUB_ENTRIES } from './references.js'
import { computeFileRank, MAX_CORE_FILES } from './graph-rank.js'
import { findBrokenWikiCitations, normalizeWikiSource } from './wiki-references.js'
import { unusedExports } from './unused-exports.js'
import { moduleCoupling } from './coupling.js'
import { digestText, cwdOf } from './util.js'
import { getLocale } from './spawn.js'
import { readGitInfo } from './git.js'

/** 状态报告里展示的模块依赖热点条数上限。 */
const STATUS_MODULE_RELATIONS = 10

/** 状态报告里展示的循环依赖组数上限。 */
const STATUS_CYCLE_GROUPS = 10

/** 渲染循环组时每组的展示文件数（完整数据在结构化输出里）。 */
const CYCLE_RENDER_FILES = 3

/** 渲染警告的条数上限（结构化输出保留全量，避免文本报告过长）。 */
const RENDERED_WARNINGS = 3

/** Wiki 引用存在性检查的文件系统探测上限。 */
const WIKI_CITATION_CHECK_LIMIT = 200

/**
 * 渲染循环依赖组：`a.ts ↔ b.ts (+2)`，组间以分号分隔；短环附加具体
 * 路径（`e.g. a.ts → b.ts → a.ts`），便于定位断链位置。
 * @param {Array<{files:string[], size:number, sample?:string[]}>} cycles - 循环组。
 * @returns {string} 单行可读文本；无环时为 `(none)`。
 */
function formatCycles(cycles) {
  if (!Array.isArray(cycles) || cycles.length === 0) return '(none)'
  return cycles.map(cycle => {
    const shown = cycle.files.slice(0, CYCLE_RENDER_FILES).join(' ↔ ')
    const hidden = cycle.size - Math.min(cycle.files.length, CYCLE_RENDER_FILES)
    const route = Array.isArray(cycle.sample) && cycle.sample.length > 2 && cycle.sample.length <= 4
      ? ` (e.g. ${cycle.sample.join(' → ')})`
      : ''
    return `${hidden > 0 ? `${shown} (+${hidden})` : shown}${route}`
  }).join('; ')
}

/** 工具描述。 */
const DESCRIPTION = [
  'Read-only health report for the .dsh-repowiki knowledge base: index presence and schema',
  'compatibility, card stale/orphan counts, wiki manifest and stale pages, memory review counts,',
  'plan source, the current in-process write-lock queue, and architecture signals (top cross-module',
  'import edges, file-level import cycles, the most imported files by fan-in, and PageRank core files',
  'that weigh indirect importance rather than fan-in alone). Wiki citation integrity is checked',
  'against the index and the filesystem; export candidates without named-import evidence are',
  'reported conservatively (files with any unnamed inbound edge are skipped); module Ca/Ce',
  'coupling and instability are reported for cross-module imports. Use it to diagnose',
  'why a panel or tool looks out of',
  'date before re-running index/extract/generate. No model calls, no writes.',
].join(' ')

/**
 * 构造 repowiki-status 工具定义。
 * @param {PluginContext} ctx - 插件上下文（提供 ctx.fs）。
 * @returns {object} ToolDefinition。
 */
export function repowikiStatusTool(ctx) {
  return {
    name: 'repowiki-status',
    description: DESCRIPTION,
    parameters: {
      root: {
        type: 'string',
        description: 'Optional project root. Defaults to the current directory; the asset root is found by walking up for .dsh-repowiki.',
      },
      locale: {
        type: 'string',
        enum: ['zh', 'en'],
        description: 'Locale whose cards/wiki/memory should be inspected. Defaults to the session environment language.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string' },
          assetDir: { type: 'string' },
          locale: { type: 'string' },
          localeRequested: { type: 'string', description: 'Locale requested by the caller or inferred from the session.' },
          localeSource: { type: 'string', enum: ['explicit', 'preferred', 'fallback', 'default'], description: 'How the inspected locale was chosen; fallback means it has assets while the requested locale has none.' },
          availableLocales: { type: 'array', items: { type: 'string' }, description: 'Locales that contain at least one card, wiki page, or memory entry.' },
          index: {
            type: 'object',
            additionalProperties: false,
            properties: {
              exists: { type: 'boolean' },
              schemaVersion: { type: 'integer' },
              compatible: { type: 'boolean' },
              files: { type: 'integer' },
              symbols: { type: 'integer' },
              modules: { type: 'integer' },
              languages: { type: 'object', additionalProperties: { type: 'integer' } },
              skipped: { type: 'integer', description: 'Source files skipped during indexing (unreadable or above the per-file size limit).' },
              generatedAt: { type: 'string' },
            },
            required: ['exists', 'compatible', 'files', 'symbols', 'modules', 'generatedAt'],
          },
          git: {
            type: 'object',
            additionalProperties: false,
            description: 'Branch/commit read from .git/HEAD (no git command is executed).',
            properties: {
              branch: { type: 'string' },
              commit: { type: 'string' },
              shortCommit: { type: 'string' },
            },
            required: ['branch', 'commit', 'shortCommit'],
          },
          lastExtract: {
            type: 'object',
            additionalProperties: false,
            description: 'Snapshot of the most recent extract run for this locale (from knowledge/<locale>/_index.json v2).',
            properties: {
              generatedAt: { type: 'string' },
              extracted: { type: 'integer' },
              skippedExisting: { type: 'integer' },
              skippedManual: { type: 'integer' },
              skippedSimple: { type: 'integer' },
              orphaned: { type: 'integer' },
              failed: { type: 'integer' },
              retried: { type: 'integer' },
              capped: { type: 'boolean' },
              concurrency: { type: 'integer' },
              attempts: { type: 'integer' },
              durationMs: { type: 'integer' },
            },
            required: [
              'generatedAt', 'extracted', 'skippedExisting', 'skippedManual', 'skippedSimple',
              'orphaned', 'failed', 'retried', 'capped', 'concurrency', 'attempts', 'durationMs',
            ],
          },
          cards: {
            type: 'object',
            additionalProperties: false,
            properties: {
              count: { type: 'integer' },
              stale: { type: 'integer' },
              orphaned: { type: 'integer' },
            },
            required: ['count', 'stale', 'orphaned'],
          },
          wiki: {
            type: 'object',
            additionalProperties: false,
            properties: {
              count: { type: 'integer' },
              manifest: { type: 'boolean' },
              stale: { type: 'integer' },
              orphaned: { type: 'integer' },
            },
            required: ['count', 'manifest', 'stale', 'orphaned'],
          },
          brokenCitations: {
            type: 'object',
            description: 'Wiki citations whose normalized source path does not exist in the index or on disk. Present only when a manifest exists.',
            additionalProperties: false,
            properties: {
              total: { type: 'integer', description: 'Distinct missing source paths.' },
              references: { type: 'integer', description: 'Citation occurrences (page-level and section-level counted separately).' },
              pages: {
                type: 'array',
                description: 'Affected pages (up to 10) with up to 10 missing sources each.',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    slug: { type: 'string' },
                    title: { type: 'string' },
                    sources: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['slug', 'title', 'sources'],
                },
              },
              truncated: { type: 'boolean' },
            },
            required: ['total', 'references', 'pages', 'truncated'],
          },
          coverage: {
            type: 'object',
            description: 'Documentation coverage over files that meet the card-complexity threshold (plan-aware).',
            additionalProperties: false,
            properties: {
              eligible: { type: 'integer', description: 'Files eligible for a knowledge card under the project plan.' },
              documented: { type: 'integer' },
              fresh: { type: 'integer' },
              stale: { type: 'integer' },
              percent: { type: 'integer' },
              gaps: {
                type: 'array',
                description: 'Modules with the most eligible files missing cards (up to 5).',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    module: { type: 'string' },
                    eligible: { type: 'integer' },
                    documented: { type: 'integer' },
                  },
                  required: ['module', 'eligible', 'documented'],
                },
              },
            },
            required: ['eligible', 'documented', 'fresh', 'stale', 'percent', 'gaps'],
          },
          health: {
            type: 'object',
            description: 'Weighted knowledge-base health score with explainable components and top issues.',
            additionalProperties: false,
            properties: {
              score: { type: 'integer' },
              grade: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
              components: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    key: { type: 'string' },
                    score: { type: 'integer' },
                    weight: { type: 'integer' },
                    detail: { type: 'string' },
                  },
                  required: ['key', 'score', 'weight', 'detail'],
                },
              },
              issues: { type: 'array', items: { type: 'string' } },
            },
            required: ['score', 'grade', 'components', 'issues'],
          },
          memory: {
            type: 'object',
            additionalProperties: false,
            properties: {
              pending: { type: 'integer' },
              accepted: { type: 'integer' },
              rejected: { type: 'integer' },
              total: { type: 'integer' },
            },
            required: ['pending', 'accepted', 'rejected', 'total'],
          },
          plan: {
            type: 'object',
            additionalProperties: false,
            properties: {
              source: { type: 'string' },
              error: { type: 'string' },
            },
            required: ['source'],
          },
          lock: {
            type: 'object',
            additionalProperties: false,
            properties: { pending: { type: 'integer' } },
            required: ['pending'],
          },
          moduleDependencies: {
            type: 'array',
            description: 'Top cross-module import edges (module → module counts), capped at 10.',
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
          moduleCoupling: {
            type: 'object',
            description: 'Module-level afferent (Ca) / efferent (Ce) coupling and instability = Ce/(Ca+Ce), from cross-module static imports only.',
            additionalProperties: false,
            properties: {
              modules: {
                type: 'array',
                description: 'Modules ordered by instability (desc), then total coupling, then name; capped at 10.',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    module: { type: 'string' },
                    ca: { type: 'integer', description: 'Distinct modules importing this one.' },
                    ce: { type: 'integer', description: 'Distinct modules this one imports.' },
                    instability: { type: 'number', description: 'Ce/(Ca+Ce), rounded to 3 decimals; 0 when uncoupled.' },
                  },
                  required: ['module', 'ca', 'ce', 'instability'],
                },
              },
              truncated: { type: 'boolean' },
            },
            required: ['modules', 'truncated'],
          },
          cycles: {
            type: 'array',
            description: 'File-level import cycles as strongly connected components (size ≥ 2), largest first, capped at 10 groups; each group lists at most 30 files.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                files: { type: 'array', items: { type: 'string' } },
                size: { type: 'integer' },
                truncated: { type: 'boolean', description: 'True when the group holds more files than the listed ones.' },
                sample: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'One shortest cycle starting and ending at the same file (e.g. [a, b, a]); empty when the shortest cycle exceeds 12 files.',
                },
              },
              required: ['files', 'size', 'truncated', 'sample'],
            },
          },
          topDependents: {
            type: 'array',
            description: 'Files with the most distinct importers (fan-in hubs), highest first, capped at 10; use them to gauge change risk.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                dependents: { type: 'integer', description: 'Number of distinct files importing this one.' },
              },
              required: ['path', 'dependents'],
            },
          },
          coreFiles: {
            type: 'array',
            description: 'PageRank over the static import graph (highest first, capped at 10): weights indirect importance, unlike fan-in which counts only direct importers. Empty when the index has no edges.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                score: { type: 'number', description: 'PageRank score (rounded to 6 decimals; sums to ~1 across all indexed nodes).' },
                inDegree: { type: 'integer', description: 'Distinct files importing this one.' },
                outDegree: { type: 'integer', description: 'Distinct files this one imports.' },
              },
              required: ['path', 'score', 'inDegree', 'outDegree'],
            },
          },
          unusedExports: {
            type: 'object',
            description: 'Conservative export audit: exported symbols without named-import evidence. Only files whose inbound edges all carry named symbols are assessed; files with no inbound edges or any unnamed import are counted as skipped, not as unused.',
            additionalProperties: false,
            properties: {
              total: { type: 'integer', description: 'Exported symbols without named-import evidence (exact, even when detail is truncated).' },
              exportedTotal: { type: 'integer', description: 'Exported symbols in assessed files.' },
              skippedFiles: { type: 'integer', description: 'Files with exports that could not be assessed (no inbound edge or an unnamed inbound import).' },
              files: {
                type: 'array',
                description: 'Assessed files with candidates (up to 10 files, 10 symbols each).',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    path: { type: 'string' },
                    symbols: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          name: { type: 'string' },
                          kind: { type: 'string' },
                          line: { type: 'integer' },
                        },
                        required: ['name', 'kind', 'line'],
                      },
                    },
                    hidden: { type: 'integer', description: 'Candidates in this file not listed because of the per-file cap.' },
                  },
                  required: ['path', 'symbols', 'hidden'],
                },
              },
              truncated: { type: 'boolean' },
            },
            required: ['total', 'exportedTotal', 'skippedFiles', 'files', 'truncated'],
          },
          warnings: { type: 'array', items: { type: 'string' } },
          durationMs: { type: 'integer' },
        },
        required: ['root', 'assetDir', 'locale', 'index', 'cards', 'wiki', 'coverage', 'memory', 'plan', 'lock', 'warnings', 'durationMs'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `Knowledge base: ${value.root} (${value.locale}${value.localeSource === 'fallback' ? `, fallback from ${value.localeRequested}` : ''})`,
          `Index: ${value.index.exists ? `v${value.index.schemaVersion ?? '?'} ${value.index.compatible ? 'compatible' : 'INCOMPATIBLE'}, ${value.index.files} files / ${value.index.symbols} symbols / ${value.index.modules} modules${value.index.skipped ? ` / ${value.index.skipped} skipped` : ''}` : 'missing'}`,
          `Cards: ${value.cards.count} (stale ${value.cards.stale}, orphaned ${value.cards.orphaned})`,
          `Wiki: ${value.wiki.count} page(s), manifest ${value.wiki.manifest ? 'present' : 'missing'}, stale ${value.wiki.stale}, orphaned ${value.wiki.orphaned}`,
          ...(value.brokenCitations
            ? [`Broken citations: ${value.brokenCitations.total === 0
              ? '(none)'
              : `${value.brokenCitations.total} path(s) in ${value.brokenCitations.pages.length} page(s)${value.brokenCitations.truncated ? ' (bounded)' : ''}${value.brokenCitations.pages.length > 0 ? ` — e.g. ${value.brokenCitations.pages[0].title}: ${value.brokenCitations.pages[0].sources.join(', ')}` : ''}`}`]
            : []),
          ...(value.index.exists
            ? [`Docs coverage: ${value.coverage.documented}/${value.coverage.eligible} eligible file(s) (${value.coverage.percent}%)${value.coverage.stale ? `, ${value.coverage.stale} stale` : ''}${value.coverage.gaps.length > 0 ? `; largest gap: ${value.coverage.gaps[0].module} (${value.coverage.gaps[0].eligible - value.coverage.gaps[0].documented})` : ''}`]
            : []),
          ...(value.health
            ? [`Health: ${value.health.score}/100 (${value.health.grade})${value.health.issues.length > 0 ? ` — ${value.health.issues.slice(0, 3).join('; ')}` : ''}`]
            : []),
          `Memory: ${value.memory.total} (pending ${value.memory.pending}, accepted ${value.memory.accepted}, rejected ${value.memory.rejected})`,
          `Plan: ${value.plan.source}${value.plan.error ? ` (${value.plan.error})` : ''}`,
          `Git: ${value.git ? `${value.git.branch || '(detached)'}@${value.git.shortCommit}` : '(not a repository)'}`,
          `Module dependencies: ${value.moduleDependencies.length > 0
            ? value.moduleDependencies.map(d => `${d.from} → ${d.to} (${d.count})`).join('; ')
            : '(none)'}`,
          ...(value.moduleCoupling
            ? [`Module instability: ${value.moduleCoupling.modules.length > 0
              ? value.moduleCoupling.modules.map(item => `${item.module} (${item.instability.toFixed(2)}, Ca ${item.ca}/Ce ${item.ce})`).join('; ')
              : '(none)'}`]
            : []),
          `Import cycles: ${formatCycles(value.cycles)}`,
          `Fan-in hubs: ${value.topDependents.length > 0
            ? value.topDependents.map(d => `${d.path} (${d.dependents})`).join('; ')
            : '(none)'}`,
          `Core files (PageRank): ${value.coreFiles.length > 0
            ? value.coreFiles.map(entry => `${entry.path} (${entry.score.toFixed(4)})`).join('; ')
            : '(none)'}`,
          ...(value.unusedExports
            ? [`Unused export candidates: ${value.unusedExports.total === 0
              ? '(none)'
              : `${value.unusedExports.total} symbol(s) in ${value.unusedExports.files.length} file(s)${value.unusedExports.truncated ? ' (bounded)' : ''}${value.unusedExports.files.length > 0 ? ` — e.g. ${value.unusedExports.files[0].path}#${value.unusedExports.files[0].symbols[0].name}` : ''}`}${value.unusedExports.skippedFiles > 0 ? `; ${value.unusedExports.skippedFiles} file(s) not assessed` : ''}`]
            : []),
          value.lastExtract
            ? `Last extract: ${value.lastExtract.extracted} new / ${value.lastExtract.skippedExisting} unchanged / ${value.lastExtract.skippedManual} manual / ${value.lastExtract.skippedSimple} trivial, ${value.lastExtract.failed} failed, ${value.lastExtract.retried} retried, concurrency ${value.lastExtract.concurrency}, ${value.lastExtract.durationMs}ms${value.lastExtract.generatedAt ? ` (${value.lastExtract.generatedAt})` : ''}`
            : 'Last extract: none',
          `Write-lock roots pending: ${value.lock.pending}`,
          ...value.warnings.slice(0, RENDERED_WARNINGS).map(w => `Warning: ${w}`),
          ...(value.warnings.length > RENDERED_WARNINGS
            ? [`Warning: … +${value.warnings.length - RENDERED_WARNINGS} more (see the structured warnings array)`]
            : []),
        ].join('\n'),
      }],
    },
    timeoutMs: 30_000,
    async execute(args, _exec) {
      const fs = ctx.fs
      if (!fs) throw new Error('repowiki-status requires the ctx.fs capability')
      const startedAt = Date.now()
      const explicitLocale = typeof args.locale === 'string' && SUPPORTED_LOCALES.includes(args.locale)
      const requestedLocale = explicitLocale ? args.locale : getLocale(ctx)
      const startDir = typeof args.root === 'string' && args.root.trim() ? args.root : cwdOf(ctx)
      const { root, assetDir } = await resolveAssetRoot(fs, startDir)
      const localeInfo = await resolveContentLocale(fs, root, requestedLocale, explicitLocale)
      const locale = localeInfo.locale
      const warnings = []

      // 索引：同时读取原始版本与兼容读取结果（兼容读取会为 v2 补模块树）
      let rawIndex = null
      try {
        const text = await fs.readText(await fs.resolve(INDEX_REL_PATH, { cwd: root }))
        rawIndex = JSON.parse(text)
      } catch {
        // 缺失/损坏：保持 null
      }
      const index = await readIndex(fs, root)
      if (rawIndex && !index) {
        warnings.push(`index.json schemaVersion ${rawIndex.schemaVersion ?? 'unknown'} is not compatible; run repowiki-index to rebuild.`)
      }
      if (index?.warnings) warnings.push(...index.warnings)

      // 卡片：陈旧 = digest 与索引不一致；孤儿 = 源文件已不在索引
      const cardsMap = await readExistingCards(fs, root, locale)
      const digestByPath = new Map((index?.files ?? []).map(f => [f.path, f.digest]))
      let staleCards = 0
      let orphanedCards = 0
      for (const [sourcePath, card] of cardsMap) {
        if (!digestByPath.has(sourcePath)) {
          orphanedCards++
        } else if (card.meta.sourceDigest !== digestByPath.get(sourcePath)) {
          staleCards++
        }
      }

      // 最近一次抽取快照（knowledge/<locale>/_index.json v2 的 lastRun）
      const knowledgeIndex = await readKnowledgeIndex(fs, root, locale)
      const run = knowledgeIndex?.lastRun
      const lastExtract = run && typeof run === 'object'
        ? {
          generatedAt: typeof run.generatedAt === 'string' ? run.generatedAt : '',
          extracted: Number.isInteger(run.extracted) ? run.extracted : 0,
          skippedExisting: Number.isInteger(run.skippedExisting) ? run.skippedExisting : 0,
          skippedManual: Number.isInteger(run.skippedManual) ? run.skippedManual : 0,
          skippedSimple: Number.isInteger(run.skippedSimple) ? run.skippedSimple : 0,
          orphaned: Number.isInteger(run.orphaned) ? run.orphaned : 0,
          failed: Number.isInteger(run.failed) ? run.failed : 0,
          retried: Number.isInteger(run.retried) ? run.retried : 0,
          capped: run.capped === true,
          concurrency: Number.isInteger(run.concurrency) ? run.concurrency : 1,
          attempts: Number.isInteger(run.attempts) ? run.attempts : 1,
          durationMs: Number.isInteger(run.durationMs) ? run.durationMs : 0,
        }
        : null

      // Wiki：清单缺失时无法可靠判定孤儿/陈旧
      const wikiPages = await listWikiPages(fs, root, locale)
      const manifest = await readWikiManifest(fs, root, locale)
      const currentDigest = digestText(
        [...cardsMap.entries()].map(([path, card]) => `${path}:${card.meta.sourceDigest ?? ''}`).sort().join('\n'),
        16,
      )
      const manifestSlugs = new Set((manifest?.pages ?? []).map(p => p.slug))
      const wikiOrphaned = manifest ? wikiPages.filter(p => !manifestSlugs.has(p.slug)).length : 0
      const wikiStale = wikiPages.filter(p => p.inputDigest && p.inputDigest !== currentDigest).length
      if (!manifest && wikiPages.length > 0) {
        warnings.push('wiki/_index.json is missing; page ordering/orphan detection is degraded until repowiki-generate runs.')
      }
      // 生成侧还会用已采信记忆指纹做增量短路：记忆变化时提示刷新，
      // 避免用户看到 stale=0 却在下一次 generate 触发重新合成
      if (manifest && wikiPages.length > 0 && typeof manifest.memoryDigest === 'string') {
        const accepted = await listMemory(fs, root, locale, 'accepted', true)
        const currentMemoryDigest = digestText(
          accepted.map(entry => `${entry.slug}:${(entry.body ?? '').trim()}`).sort().join('\n'),
          16,
        )
        if (currentMemoryDigest !== manifest.memoryDigest) {
          warnings.push('Accepted memory changed since the wiki was generated; run repowiki-generate to refresh it.')
        }
      }

      // Wiki 引用完整性：清单里的 sources 必须能落到索引文件或磁盘文件。
      // 非索引引用（README 等）用 fs 探测确认；超过探测上限时视为"未验证"，
      // 不冒充缺失。
      let brokenCitations = null
      if (manifest) {
        const known = new Set((index?.files ?? []).map(file => file.path))
        const cited = new Set()
        for (const page of Array.isArray(manifest.pages) ? manifest.pages : []) {
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
        let probed = 0
        let capped = false
        for (const rel of cited) {
          if (known.has(rel)) continue
          // 绝对路径与上跳路径不是合法引用：不做文件系统探测，按缺失报告。
          if (rel.startsWith('/') || /^[A-Za-z]:\//.test(rel) || rel.split('/').includes('..')) continue
          if (probed >= WIKI_CITATION_CHECK_LIMIT) {
            capped = true
            break
          }
          probed++
          try {
            const stat = await fs.stat(await fs.resolve(rel, { cwd: root }))
            if (stat && stat.type !== 'directory') known.add(rel)
          } catch {
            // 不存在/不可读：保留为缺失引用
          }
        }
        if (capped) {
          for (const rel of cited) known.add(rel)
          warnings.push(`Wiki citation existence check stopped after ${WIKI_CITATION_CHECK_LIMIT} filesystem probes; unverified citations are not reported as broken.`)
        }
        brokenCitations = findBrokenWikiCitations(manifest, known)
        if (brokenCitations.total > 0) {
          warnings.push(`${brokenCitations.total} wiki citation path(s) do not exist; regenerate the wiki or fix the cited paths.`)
        }
      }

      const memories = await listMemory(fs, root, locale)
      const memoryCounts = { pending: 0, accepted: 0, rejected: 0, total: memories.length }
      for (const entry of memories) {
        if (entry.status in memoryCounts) memoryCounts[entry.status]++
      }

      const { plan, source: planSource, error: planError } = await readPlan(fs, root)
      if (planError) warnings.push(`repowiki-plan.json: ${planError}`)

      const git = await readGitInfo(fs, root)
      const moduleDependencies = summarizeModuleRelations(
        index?.files ?? [], index?.edges ?? [], STATUS_MODULE_RELATIONS,
      )
      const { cycles } = findImportCycles(index?.edges ?? [], { limit: STATUS_CYCLE_GROUPS })
      // 文件级 hub：被最多不同文件 import 的目标（改动风险最高的入口）
      const hubs = topDependents(index?.edges ?? [], MAX_HUB_ENTRIES)
      // PageRank 核心文件：把"被核心模块依赖"的间接重要性计入，与纯 fan-in 互补。
      // 无边时不排名（没有结构信号，列出全库文件没有意义）。
      const coreFiles = (index?.edges ?? []).length > 0
        ? computeFileRank(index.edges, { limit: MAX_CORE_FILES }).entries
        : []
      // 导出审计：只审计"所有入边都带具名符号"的文件，其余计入 skippedFiles。
      const unused = index ? unusedExports(index) : null
      // 模块耦合：跨模块 import 的 Ca/Ce 与不稳定性（描述性统计）。
      const coupling = index ? moduleCoupling(index.files ?? [], index.edges ?? []) : null
      // 文档覆盖率的分母是"有资格生成卡片"的文件（plan 的阈值/includeOnly），
      // 否则简单文件会永久拉低分数，健康度失真
      const eligiblePaths = selectCandidates(
        index?.files ?? [], plan, { maxCards: Number.MAX_SAFE_INTEGER },
      ).candidates
      const coverage = documentationCoverage(index?.files ?? [], cardsMap, eligiblePaths)
      const health = index
        ? assessHealth({
          coverage,
          wiki: { count: wikiPages.length, stale: wikiStale, orphaned: wikiOrphaned },
          cycles,
          hubs,
          warnings,
          skipped: index.stats?.skipped ?? 0,
        })
        : null

      return {
        root,
        assetDir,
        locale,
        localeRequested: requestedLocale,
        localeSource: localeInfo.source,
        availableLocales: localeInfo.available.map(probe => probe.locale),
        index: {
          exists: rawIndex !== null,
          ...(typeof rawIndex?.schemaVersion === 'number' ? { schemaVersion: rawIndex.schemaVersion } : {}),
          compatible: index !== null,
          files: index?.stats?.files ?? 0,
          symbols: index?.stats?.symbols ?? 0,
          modules: Array.isArray(index?.modules) ? index.modules.length : 0,
          ...(index?.stats?.languages ? { languages: index.stats.languages } : {}),
          ...(index?.stats?.skipped ? { skipped: index.stats.skipped } : {}),
          generatedAt: typeof index?.generatedAt === 'string' ? index.generatedAt : '',
        },
        ...(git ? { git } : {}),
        ...(lastExtract ? { lastExtract } : {}),
        cards: {
          count: cardsMap.size,
          stale: staleCards,
          orphaned: orphanedCards,
        },
        coverage,
        ...(health ? { health } : {}),
        wiki: {
          count: wikiPages.length,
          manifest: manifest !== null,
          stale: wikiStale,
          orphaned: wikiOrphaned,
        },
        ...(brokenCitations ? { brokenCitations } : {}),
        memory: memoryCounts,
        plan: { source: planSource, ...(planError ? { error: planError } : {}) },
        lock: { pending: pendingLocks() },
        moduleDependencies,
        ...(coupling ? { moduleCoupling: coupling } : {}),
        cycles,
        topDependents: hubs,
        coreFiles,
        ...(unused ? { unusedExports: unused } : {}),
        warnings,
        durationMs: Date.now() - startedAt,
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Knowledge base status',
      kind: 'search',
      rawInput: { root: args.root ?? '(current)', locale: args.locale ?? 'auto' },
    }),
  }
}
