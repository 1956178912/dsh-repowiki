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
import { INDEX_REL_PATH, SUPPORTED_LOCALES, ASSET_DIR, INDEX_PARSER_VERSION, ARCH_BASELINE_FILE } from './schema.js'
import { resolveContentLocale } from './locale.js'
import { summarizeModuleRelations } from './modules.js'
import { findImportCycles } from './cycles.js'
import { topDependents, MAX_HUB_ENTRIES } from './references.js'
import { computeFileRank, MAX_CORE_FILES } from './graph-rank.js'
import { findBrokenWikiCitations, findCitationRangeIssues, normalizeWikiSource } from './wiki-references.js'
import { checkCitationDrift, summarizeCitationCoverage, citationCoveragePages } from './citation-drift.js'
import { wikiGraphText } from './wiki-graph.js'
import { unusedExports } from './unused-exports.js'
import { moduleCoupling } from './coupling.js'
import { evaluateLayers } from './layers.js'
import { findDuplicates, MAX_DUPLICATE_FILES } from './duplicates.js'
import { computeComplexity } from './complexity.js'
import { findUnresolvedImports, MAX_UNRESOLVED_DETAILS } from './unresolved.js'
import {
  architectureFactsSnapshot, normalizeBaseline, compareArchitecture,
  MAX_BASELINE_CYCLES, MAX_BASELINE_UNRESOLVED,
} from './arch-baseline.js'
import { digestText, cwdOf } from './util.js'
import { getLocale } from './spawn.js'
import { readGitInfo } from './git.js'

/** 状态报告里展示的模块依赖热点条数上限。 */
const STATUS_MODULE_RELATIONS = 10

/** 重复代码检测的并发读取数。 */
const DUPLICATE_READ_CONCURRENCY = 8

/**
 * 并发读取重复检测与复杂度统计所需的源码（数量上限由调用方截断，
 * 行数上限由各分析器兜底）。
 * @param {FsService} fs - ctx.fs。
 * @param {string} root - 项目根。
 * @param {Array<{path:string}>} files - 索引文件（已按路径排序）。
 * @param {number} [limit] - 最多读取的文件数（默认 MAX_DUPLICATE_FILES）。
 * @returns {Promise<Array<{path:string, text:string}>>} 读取成功的源码，按路径排序。
 */
async function readStatusSources(fs, root, files, limit = MAX_DUPLICATE_FILES) {
  const targets = files.slice(0, Math.max(1, limit))
  const sources = []
  let cursor = 0
  const worker = async () => {
    while (cursor < targets.length) {
      const file = targets[cursor++]
      if (!file || typeof file.path !== 'string') continue
      try {
        const text = await fs.readText(await fs.resolve(file.path, { cwd: root }))
        sources.push({ path: file.path, text })
      } catch {
        // 不可读文件跳过，不阻断诊断
      }
    }
  }
  await Promise.all(Array.from({ length: DUPLICATE_READ_CONCURRENCY }, worker))
  sources.sort((a, b) => a.path.localeCompare(b.path))
  return sources
}

/**
 * 把当前架构事实与架构基线比较（只读；缺失基线不是错误）。
 * @param {FsService} fs - ctx.fs。
 * @param {string} root - 项目根。
 * @param {object} facts - `architectureFactsSnapshot` 的输入事实。
 * @returns {Promise<{info:object, warnings:string[]}>} 对照结果与告警。
 */
async function compareWithBaseline(fs, root, facts) {
  const read = await readArchBaseline(fs, root)
  if (!read.exists) return { info: { exists: false }, warnings: [] }
  let raw
  try {
    raw = JSON.parse(read.text ?? '')
  } catch {
    return {
      info: { exists: true, ok: false, error: 'invalid JSON' },
      warnings: [`${ASSET_DIR}/${ARCH_BASELINE_FILE} is not valid JSON; run verify:arch --update.`],
    }
  }
  const { baseline, problems } = normalizeBaseline(raw)
  const baselineWarnings = problems.map(
    message => `${ASSET_DIR}/${ARCH_BASELINE_FILE}: ${message}`,
  )
  if (!baseline) {
    return {
      info: { exists: true, ok: false, error: problems[0] ?? 'unusable baseline' },
      warnings: baselineWarnings,
    }
  }
  const comparison = compareArchitecture(baseline, architectureFactsSnapshot(facts))
  if (comparison.regressions.length > 0) {
    baselineWarnings.push(
      `${comparison.regressions.length} architecture regression(s) vs ${ASSET_DIR}/${ARCH_BASELINE_FILE}; run verify:arch for details.`,
    )
  }
  return {
    info: {
      exists: true,
      schemaVersion: baseline.schemaVersion,
      ok: comparison.ok,
      regressionTotal: comparison.regressions.length,
      improvements: comparison.improvements.length,
      regressions: comparison.regressions.slice(0, 10).map(item => ({
        kind: item.kind,
        message: item.message,
      })),
    },
    warnings: baselineWarnings,
  }
}

/** 状态报告里展示的循环依赖组数上限。 */
const STATUS_CYCLE_GROUPS = 10

/**
 * 读取架构基线文件（缺失/坏 JSON 分开报告；不抛错）。
 * @param {FsService} fs - ctx.fs。
 * @param {string} root - 项目根。
 * @returns {Promise<{exists:boolean, text:string|null, error:string}>} 读取结果。
 */
async function readArchBaseline(fs, root) {
  const rel = `${ASSET_DIR}/${ARCH_BASELINE_FILE}`
  try {
    return { exists: true, text: await fs.readText(await fs.resolve(rel, { cwd: root })), error: '' }
  } catch {
    // 与索引读取一致：不可读按缺失处理，不阻断诊断
    return { exists: false, text: null, error: '' }
  }
}

/**
 * 渲染架构基线对照结果。
 * @param {{exists:boolean, ok?:boolean, error?:string, regressionTotal?:number,
 *   improvements?:number, regressions?:Array<{message:string}>}} info - 基线对照。
 * @returns {string} 单行文本。
 */
function formatArchBaseline(info) {
  if (!info?.exists) return 'missing (run verify:arch --update to freeze current findings)'
  if (typeof info.error === 'string' && info.error) return `unusable (${info.error})`
  if (typeof info.ok !== 'boolean') return 'unusable'
  if (info.ok) {
    const fixed = info.improvements ?? 0
    return fixed > 0
      ? `OK — ${fixed} fixed finding(s); run verify:arch --update to tighten`
      : 'OK (no new regressions)'
  }
  const total = info.regressionTotal ?? 0
  const example = info.regressions?.[0]?.message
  return `${total} new regression(s)${example ? ` — e.g. ${example}` : ''}`
}

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

/**
 * 渲染行号越界摘要：示例页面 + 首个越界引用 + 未检查数量。
 * @param {{total:number, unchecked:number, truncated:boolean,
 *   pages:Array<{title:string, issues:Array<{path:string,start:number,end:number,lines:number}>}>}} info
 *   越界统计。
 * @returns {string} 单行文本。
 */
function formatCitationRanges(info) {
  const example = info.pages[0]?.issues[0]
  const body = info.total === 0
    ? '(none)'
    : `${info.total} out-of-range${example
      ? ` — e.g. ${info.pages[0].title}: ${example.path}#L${example.start}-L${example.end} (file has ${example.lines} lines)`
      : ''}${info.truncated ? ' (bounded)' : ''}`
  return `${body}${info.unchecked > 0 ? `; ${info.unchecked} unchecked` : ''}`
}

/**
 * 渲染引用内容漂移摘要：无漂移时给出已验证数，有漂移时给示例引用。
 * @param {{total:number, checked:number, unchecked:number, truncated:boolean,
 *   pages:Array<{title:string, issues:Array<{source:string}>}>}} info - 漂移统计。
 * @returns {string} 单行文本。
 */
function formatCitationDrift(info) {
  const example = info.pages[0]?.issues[0]
  const body = info.total === 0
    ? `(none; ${info.checked} verified)`
    : `${info.total} changed${example ? ` — e.g. ${info.pages[0].title}: ${example.source}` : ''}${info.truncated ? ' (bounded)' : ''}`
  return `${body}${info.unchecked > 0 ? `; ${info.unchecked} unchecked` : ''}`
}

/**
 * 渲染未覆盖引用原因摘要（与 generate 文案一致）。
 * @param {{unreadable?:number, range?:number, cap?:number, unknown?:number}|undefined} reasons
 *   原因计数。
 * @returns {string} 例如 `1 unreadable, 2 invalid range`；无计数时为空。
 */
function formatCitationReasons(reasons) {
  if (!reasons) return ''
  const parts = []
  if (reasons.unreadable > 0) parts.push(`${reasons.unreadable} unreadable`)
  if (reasons.range > 0) parts.push(`${reasons.range} invalid range`)
  if (reasons.cap > 0) parts.push(`${reasons.cap} over read cap`)
  if (reasons.unknown > 0) parts.push(`${reasons.unknown} unknown`)
  return parts.join(', ')
}

/**
 * 渲染引用指纹覆盖率行：总数、原因与首个受影响页面示例。
 * @param {{citationCoverage:{total:number, tracked:number, untracked:number,
 *   hasDigests:boolean, reasons:object},
 *   citationCoveragePages?:{pages:Array<{title:string, untracked:number, reasons:object}>}}} value
 *   状态输出。
 * @returns {string} 单行文本。
 */
function formatCitationCoverage(value) {
  const coverage = value.citationCoverage
  const reasonText = formatCitationReasons(coverage.reasons)
  const example = value.citationCoveragePages?.pages?.[0]
  const exampleReasons = example ? formatCitationReasons(example.reasons) : ''
  const exampleText = example
    ? ` — e.g. ${example.title}: ${example.untracked} untracked${exampleReasons ? ` (${exampleReasons})` : ''}`
    : ''
  return `${coverage.tracked}/${coverage.total} tracked${coverage.untracked > 0
    ? `, ${coverage.untracked} untracked${reasonText ? ` (${reasonText})` : ''}`
    : ''}${coverage.hasDigests ? '' : ' (manifest has no digests)'}${exampleText}`
}

/** 工具描述。 */
const DESCRIPTION = [
  'Read-only health report for the .dsh-repowiki knowledge base: index presence and schema',
  'compatibility, card stale/orphan counts, wiki manifest and stale pages, memory review counts,',
  'plan source, the current in-process write-lock queue, and architecture signals (top cross-module',
  'import edges, file-level import cycles, the most imported files by fan-in, and PageRank core files',
  'that weigh indirect importance rather than fan-in alone). Wiki citation integrity is checked',
  'against the index and the filesystem, including #Lx-Ly bounds when the index records line counts',
  'and content-drift digests recorded by manifest v3 with explicit digest coverage and reasons',
  'plus bounded per-page coverage details, recomputed through bounded concurrent reads',
  '(untracked citations cannot be drift-checked); export candidates without named-import',
  'evidence are reported conservatively (files with any unnamed inbound edge are skipped); module',
  'Ca/Ce coupling and instability are reported for cross-module imports; and architecture layers',
  'declared in repowiki-plan.json are checked so cross-layer imports outside mayDependOn are listed',
  'as violations; cross-file duplicate code candidates are reported from bounded line-window',
  'fingerprints, function-level complexity is estimated from symbol ranges (with an exact',
  'high-complexity total), relative imports without a resolved edge are listed as',
  'broken-reference candidates, and the current facts are compared with the architecture',
  'baseline written by verify:arch --update so new cycle/layer/import/duplicate/complexity/score',
  'regressions surface without running CI. Use it to diagnose',
  'why a panel or tool looks out of',
  'date before re-running index/extract/generate. The weighted health score also counts',
  'citation defects (missing paths, out-of-range lines, content drift) against the wiki',
  'component. No model calls, no writes.',
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
              parserVersion: { type: 'integer', description: 'Extractor rule version that produced the cached symbols/imports. A mismatch with the running version means the next rebuild re-parses every file.' },
              compatible: { type: 'boolean' },
              files: { type: 'integer' },
              symbols: { type: 'integer' },
              modules: { type: 'integer' },
              languages: { type: 'object', additionalProperties: { type: 'integer' } },
              skipped: { type: 'integer', description: 'Source files skipped during indexing (unreadable or above the per-file size limit).' },
              untrusted: {
                type: 'object',
                additionalProperties: false,
                description: 'Entries dropped from a tampered index: absolute/escaping file paths and the edges pointing at them.',
                properties: {
                  files: { type: 'integer' },
                  edges: { type: 'integer' },
                },
                required: ['files', 'edges'],
              },
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
              staleReasons: {
                type: 'array',
                items: { type: 'string', enum: ['cards', 'graph', 'memory'] },
                description: 'Why the wiki is stale, using the same values and order as verify:wiki (page input digests, dependency graph, accepted memory). Omitted when fresh.',
              },
              failed: { type: 'integer', description: 'Pages that failed to write during the last generation.' },
              failedPages: { type: 'array', items: { type: 'string' } },
              missing: { type: 'integer', description: 'Manifest pages whose file is missing on disk.' },
              missingPages: { type: 'array', items: { type: 'string' } },
              invalid: { type: 'integer', description: 'Manifest pages whose path is invalid or does not match the file location.' },
              invalidPages: { type: 'array', items: { type: 'string' } },
              duplicate: { type: 'integer', description: 'Duplicate page slugs (on disk or in the manifest) plus duplicate manifest paths.' },
              duplicateSlugs: { type: 'array', items: { type: 'string' } },
              duplicatePaths: { type: 'array', items: { type: 'string' } },
              orphaned: { type: 'integer' },
            },
            required: [
              'count', 'manifest', 'stale', 'failed', 'failedPages',
              'missing', 'missingPages', 'invalid', 'invalidPages',
              'duplicate', 'duplicateSlugs', 'duplicatePaths', 'orphaned',
            ],
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
          citationRangeIssues: {
            type: 'object',
            description: 'Wiki #Lx-Ly citations whose range is invalid or exceeds the indexed file line count. Present only when a manifest exists.',
            additionalProperties: false,
            properties: {
              total: { type: 'integer', description: 'Out-of-range citation occurrences.' },
              unchecked: { type: 'integer', description: 'Ranged citations whose file line count is unknown (non-indexed file or an older index).' },
              pages: {
                type: 'array',
                description: 'Affected pages (up to 10) with up to 10 issues each.',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    slug: { type: 'string' },
                    title: { type: 'string' },
                    issues: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          path: { type: 'string' },
                          start: { type: 'integer' },
                          end: { type: 'integer' },
                          lines: { type: 'integer' },
                        },
                        required: ['path', 'start', 'end', 'lines'],
                      },
                    },
                  },
                  required: ['slug', 'title', 'issues'],
                },
              },
              truncated: { type: 'boolean' },
            },
            required: ['total', 'unchecked', 'pages', 'truncated'],
          },
          citationDrift: {
            type: 'object',
            description: 'Wiki citations whose content digest (recorded by manifest v3) no longer matches the current source. Present only when the manifest carries citation digests.',
            additionalProperties: false,
            properties: {
              total: { type: 'integer', description: 'Citations whose current content digest differs from the recorded one.' },
              checked: { type: 'integer', description: 'Citations whose digest could be verified.' },
              unchecked: { type: 'integer', description: 'Citations that could not be verified (unreadable file, invalid range or the read cap).' },
              pages: {
                type: 'array',
                description: 'Affected pages (up to 10) with up to 10 issues each.',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    slug: { type: 'string' },
                    title: { type: 'string' },
                    issues: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          source: { type: 'string', description: 'Original citation string, e.g. src/a.ts#L3-L9.' },
                          path: { type: 'string' },
                          start: { type: 'integer', description: '0 when the citation has no line range.' },
                          end: { type: 'integer', description: '0 when the citation has no line range.' },
                        },
                        required: ['source', 'path', 'start', 'end'],
                      },
                    },
                  },
                  required: ['slug', 'title', 'issues'],
                },
              },
              truncated: { type: 'boolean' },
            },
            required: ['total', 'checked', 'unchecked', 'pages', 'truncated'],
          },
          citationCoverage: {
            type: 'object',
            description: 'How many manifest citations have content digests and why the rest do not. Untracked citations (unreadable file, invalid line range or generation read cap) cannot be checked for drift; hasDigests is false for legacy manifests.',
            additionalProperties: false,
            properties: {
              total: { type: 'integer' },
              tracked: { type: 'integer' },
              untracked: { type: 'integer' },
              hasDigests: { type: 'boolean' },
              reasons: {
                type: 'object',
                additionalProperties: false,
                description: 'Untracked citation reasons; unknown means the manifest predates reason recording.',
                properties: {
                  unreadable: { type: 'integer' },
                  range: { type: 'integer' },
                  cap: { type: 'integer' },
                  unknown: { type: 'integer' },
                },
                required: ['unreadable', 'range', 'cap', 'unknown'],
              },
            },
            required: ['total', 'tracked', 'untracked', 'hasDigests', 'reasons'],
          },
          citationCoveragePages: {
            type: 'object',
            description: 'Pages with citations lacking content digests (bounded, most affected first), so callers know which pages to regenerate.',
            additionalProperties: false,
            properties: {
              pages: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    slug: { type: 'string' },
                    title: { type: 'string' },
                    total: { type: 'integer' },
                    tracked: { type: 'integer' },
                    untracked: { type: 'integer' },
                    reasons: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        unreadable: { type: 'integer' },
                        range: { type: 'integer' },
                        cap: { type: 'integer' },
                        unknown: { type: 'integer' },
                      },
                      required: ['unreadable', 'range', 'cap', 'unknown'],
                    },
                  },
                  required: ['slug', 'title', 'total', 'tracked', 'untracked', 'reasons'],
                },
              },
              truncated: { type: 'boolean' },
            },
            required: ['pages', 'truncated'],
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
            description: 'Weighted knowledge-base health score with explainable components and top issues. Missing citation paths, out-of-range citation lines and citation content drift lower the wiki component.',
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
          layers: {
            type: 'object',
            description: 'Architecture layer check from plan layers: cross-layer import edges not allowed by mayDependOn. Same-layer edges are always allowed; files outside every layer are ignored. Present only when the plan declares layers and a compatible index exists.',
            additionalProperties: false,
            properties: {
              total: { type: 'integer', description: 'Cross-layer edges violating the rules (exact, even when detail is truncated).' },
              truncated: { type: 'boolean' },
              checkedEdges: { type: 'integer', description: 'Edges whose both ends belong to a declared layer.' },
              unknownRefs: {
                type: 'array',
                description: 'mayDependOn entries naming a layer that is not declared.',
                items: { type: 'string' },
              },
              violations: {
                type: 'array',
                description: 'Violating edges (up to 50 entries).',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    from: { type: 'string' },
                    fromLayer: { type: 'string' },
                    to: { type: 'string' },
                    toLayer: { type: 'string' },
                    line: { type: 'integer', description: 'Import line (0 when the index predates line numbers).' },
                  },
                  required: ['from', 'fromLayer', 'to', 'toLayer', 'line'],
                },
              },
              layers: {
                type: 'array',
                description: 'Declared layers with their path prefixes, allowed dependencies and indexed file counts.',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    paths: { type: 'array', items: { type: 'string' } },
                    mayDependOn: { type: 'array', items: { type: 'string' } },
                    files: { type: 'integer' },
                  },
                  required: ['name', 'paths', 'mayDependOn', 'files'],
                },
              },
              pairs: {
                type: 'array',
                description: 'Exact violating-edge counts per from→to layer pair, sorted by layer names. Unlike violations this is never truncated, so baselines and ratchets compare exact numbers.',
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
            },
            required: ['total', 'truncated', 'checkedEdges', 'unknownRefs', 'violations', 'layers', 'pairs'],
          },
          duplicates: {
            type: 'object',
            description: 'Cross-file duplicate code candidates from normalized line-window fingerprints. Present when at least two indexed files were readable; totals are exact and groups are bounded. A candidate is a review lead, not a semantic clone verdict.',
            additionalProperties: false,
            properties: {
              total: { type: 'integer', description: 'Merged duplicate block groups (exact, even when detail is truncated).' },
              windowLines: { type: 'integer', description: 'Fingerprint window size in lines.' },
              filesScanned: { type: 'integer' },
              filesSkipped: { type: 'integer', description: 'Files skipped by the count or line caps.' },
              groups: {
                type: 'array',
                description: 'Duplicate blocks (up to 20 groups, 5 locations each).',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    lines: { type: 'integer' },
                    occurrences: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          path: { type: 'string' },
                          start: { type: 'integer' },
                          end: { type: 'integer' },
                        },
                        required: ['path', 'start', 'end'],
                      },
                    },
                  },
                  required: ['lines', 'occurrences'],
                },
              },
            },
            required: ['total', 'windowLines', 'filesScanned', 'filesSkipped', 'groups'],
          },
          complexity: {
            type: 'object',
            description: 'Function-level cyclomatic complexity estimate from line-prefixed branch keywords and &&/|| operators inside each indexed symbol range. Comments and strings are not masked, so it is a review heuristic rather than an exact McCabe value. Present when at least one indexed source was readable.',
            additionalProperties: false,
            properties: {
              total: { type: 'integer', description: 'Functions scored.' },
              threshold: { type: 'integer', description: 'Complexity at which a function enters high (default 15).' },
              average: { type: 'number', description: 'Mean complexity (2 decimals).' },
              max: { type: 'integer' },
              highTotal: { type: 'integer', description: 'Functions at or above the threshold (exact, even when the detail list is capped).' },
              high: {
                type: 'array',
                description: 'Functions at or above the threshold (up to 10, highest first).',
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
            },
            required: ['total', 'threshold', 'average', 'max', 'highTotal', 'high'],
          },
          archBaseline: {
            type: 'object',
            description: 'Comparison of the current architecture facts against .dsh-repowiki/arch-baseline.json (written by verify:arch --update). Only new regressions fail; a missing baseline is reported, not treated as an error. Facts use the same architectureFactsSnapshot path as the CI gate.',
            additionalProperties: false,
            properties: {
              exists: { type: 'boolean' },
              schemaVersion: { type: 'integer' },
              ok: { type: 'boolean', description: 'True when no new regression exists. Omitted when the baseline is missing or unusable.' },
              error: { type: 'string', description: 'Why the baseline cannot be compared (invalid JSON or unsupported schemaVersion).' },
              regressionTotal: { type: 'integer', description: 'New regressions (exact, even when the detail list is capped).' },
              improvements: { type: 'integer', description: 'Findings that disappeared or decreased; run verify:arch --update to tighten the baseline.' },
              regressions: {
                type: 'array',
                description: 'Up to 10 new regressions with stable kinds: cycle, layer, unresolved, ceiling, score.',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    kind: { type: 'string', enum: ['cycle', 'layer', 'unresolved', 'ceiling', 'score'] },
                    message: { type: 'string' },
                  },
                  required: ['kind', 'message'],
                },
              },
            },
            required: ['exists'],
          },
          unresolved: {
            type: 'object',
            description: 'Relative imports (specifiers starting with ".") that produced no dependency edge. Usually a wrong path, an excluded target or an unsupported extension; bare package imports are out of scope. Present when a compatible index exists.',
            additionalProperties: false,
            properties: {
              total: { type: 'integer', description: 'Unresolved relative imports (exact).' },
              checked: { type: 'integer', description: 'Relative imports considered.' },
              details: {
                type: 'array',
                description: 'Unresolved entries (up to 50).',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    path: { type: 'string' },
                    line: { type: 'integer' },
                    specifier: { type: 'string' },
                  },
                  required: ['path', 'line', 'specifier'],
                },
              },
            },
            required: ['total', 'checked', 'details'],
          },
          warnings: { type: 'array', items: { type: 'string' } },
          durationMs: { type: 'integer' },
        },
        required: ['root', 'assetDir', 'locale', 'index', 'cards', 'wiki', 'coverage', 'memory', 'plan', 'lock', 'archBaseline', 'warnings', 'durationMs'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `Knowledge base: ${value.root} (${value.locale}${value.localeSource === 'fallback' ? `, fallback from ${value.localeRequested}` : ''})`,
          `Index: ${value.index.exists ? `v${value.index.schemaVersion ?? '?'} ${value.index.compatible ? 'compatible' : 'INCOMPATIBLE'}, ${value.index.files} files / ${value.index.symbols} symbols / ${value.index.modules} modules${value.index.parserVersion !== undefined ? ` / parser v${value.index.parserVersion}` : ''}${value.index.skipped ? ` / ${value.index.skipped} skipped` : ''}${value.index.untrusted ? ` / ${value.index.untrusted.files} untrusted path(s), ${value.index.untrusted.edges} edge(s) dropped` : ''}` : 'missing'}`,
          `Cards: ${value.cards.count} (stale ${value.cards.stale}, orphaned ${value.cards.orphaned})`,
          `Wiki: ${value.wiki.count} page(s), manifest ${value.wiki.manifest ? 'present' : 'missing'}, stale ${value.wiki.stale}${value.wiki.staleReasons ? ` (${value.wiki.staleReasons.join(', ')})` : ''}, failed ${value.wiki.failed}, missing ${value.wiki.missing}, invalid ${value.wiki.invalid}, duplicate ${value.wiki.duplicate}, orphaned ${value.wiki.orphaned}`,
          ...(value.brokenCitations
            ? [`Broken citations: ${value.brokenCitations.total === 0
              ? '(none)'
              : `${value.brokenCitations.total} path(s) in ${value.brokenCitations.pages.length} page(s)${value.brokenCitations.truncated ? ' (bounded)' : ''}${value.brokenCitations.pages.length > 0 ? ` — e.g. ${value.brokenCitations.pages[0].title}: ${value.brokenCitations.pages[0].sources.join(', ')}` : ''}`}`]
            : []),
          ...(value.citationRangeIssues
            ? [`Citation ranges: ${formatCitationRanges(value.citationRangeIssues)}`]
            : []),
          ...(value.citationDrift
            ? [`Citation drift: ${formatCitationDrift(value.citationDrift)}`]
            : []),
          ...(value.citationCoverage && value.citationCoverage.total > 0
            && (!value.citationCoverage.hasDigests || value.citationCoverage.untracked > 0)
            ? [`Citation digests: ${formatCitationCoverage(value)}`]
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
          ...(value.complexity
            ? [`Complexity: ${value.complexity.total} function(s), avg ${value.complexity.average}, max ${value.complexity.max}${value.complexity.highTotal > 0 ? ` — ${value.complexity.highTotal} ≥ ${value.complexity.threshold} (e.g. ${value.complexity.high[0].path}#${value.complexity.high[0].name} ${value.complexity.high[0].complexity})` : ''}`]
            : []),
          ...(value.unresolved
            ? [`Unresolved imports: ${value.unresolved.total === 0
              ? `(none, ${value.unresolved.checked} relative import(s) checked)`
              : `${value.unresolved.total} of ${value.unresolved.checked} relative import(s)${value.unresolved.details.length > 0 ? ` — e.g. ${value.unresolved.details[0].path}:${value.unresolved.details[0].line} ${value.unresolved.details[0].specifier}` : ''}`}`]
            : []),
          ...(value.duplicates
            ? [`Duplicates: ${value.duplicates.total === 0
              ? `(none, ${value.duplicates.filesScanned} file(s) scanned)`
              : `${value.duplicates.total} block(s) of ≥${value.duplicates.windowLines} lines${value.duplicates.groups.length > 0 ? ` — e.g. ${value.duplicates.groups[0].occurrences.map(o => `${o.path}:${o.start}-${o.end}`).join(' ↔ ')}` : ''}`}`]
            : []),
          ...(value.layers
            ? [`Layers: ${value.layers.total === 0
              ? `(none, ${value.layers.checkedEdges} cross-layer edge(s) checked)`
              : `${value.layers.total} violation(s)${value.layers.truncated ? ' (bounded)' : ''} — e.g. ${value.layers.violations[0].fromLayer} → ${value.layers.violations[0].toLayer}: ${value.layers.violations[0].from} → ${value.layers.violations[0].to}`}`]
            : []),
          `Arch baseline: ${formatArchBaseline(value.archBaseline)}`,
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
      if (index?.untrusted) {
        warnings.push(`${index.untrusted.files} index file path(s) and ${index.untrusted.edges} edge(s) were invalid or outside the project and were ignored.`)
      }
      // 解析规则升级后旧索引的符号/导入缓存会在下次重建时全部失效；
      // 提前告警，避免用户以为新语言支持未生效
      if (typeof rawIndex?.parserVersion === 'number' && rawIndex.parserVersion !== INDEX_PARSER_VERSION) {
        warnings.push(`Index was built with parser v${rawIndex.parserVersion}; the running parser is v${INDEX_PARSER_VERSION}, so the next rebuild re-parses every file.`)
      }

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
      // 结构指纹：文件集合 + 依赖边。旧清单缺该字段时跳过（不误报）。
      const currentGraphDigest = digestText(wikiGraphText(index), 16)
      const graphStale = Boolean(manifest && typeof manifest.graphDigest === 'string'
        && manifest.graphDigest && manifest.graphDigest !== currentGraphDigest)
      if (graphStale) {
        warnings.push('Wiki is stale: the indexed file set or dependency graph changed since generation; run repowiki-generate.')
      }
      const manifestSlugs = new Set((manifest?.pages ?? []).map(p => p.slug))
      // 重复页：磁盘上两个文件声明同一 slug，或清单重复登记 slug/路径。
      // 前者会让按 slug 解析的页面被静默覆盖，后者让页面归属依赖顺序。
      const rawManifestSlugList = (manifest?.pages ?? [])
        .map(page => (typeof page?.slug === 'string' ? page.slug : ''))
        .filter(Boolean)
      const duplicateManifestSlugs = [...new Set(
        rawManifestSlugList.filter((slug, index) => rawManifestSlugList.indexOf(slug) !== index),
      )]
      const rawManifestPathList = (manifest?.pages ?? [])
        .map(page => (typeof page?.path === 'string' ? page.path.replace(/\\/g, '/') : ''))
        .filter(Boolean)
      const duplicateManifestPaths = [...new Set(
        rawManifestPathList.filter((rel, index) => rawManifestPathList.indexOf(rel) !== index),
      )]
      const diskSlugCounts = new Map()
      for (const page of wikiPages) {
        diskSlugCounts.set(page.slug, (diskSlugCounts.get(page.slug) ?? 0) + 1)
      }
      const duplicateDiskSlugs = [...diskSlugCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([slug]) => slug)
      const duplicateWikiSlugs = [...new Set([...duplicateDiskSlugs, ...duplicateManifestSlugs])].sort()
      const duplicateWikiTotal = duplicateWikiSlugs.length + duplicateManifestPaths.length
      const wikiOrphaned = manifest ? wikiPages.filter(p => !manifestSlugs.has(p.slug)).length : 0
      const wikiStale = wikiPages.filter(p => p.inputDigest && p.inputDigest !== currentDigest).length
      // 清单登记但磁盘缺失的页面：与 verify:wiki 的 missingPages 同口径。
      const diskSlugs = new Set(wikiPages.map(page => page.slug))
      const missingWikiPages = manifest
        ? [...manifestSlugs].filter(slug => !diskSlugs.has(slug))
        : []
      // 清单路径非法或与实际文件位置不符：与 verify:wiki 的结构校验同口径，
      // 但 status 不探测正文链接，保持只读诊断的轻量。
      // listWikiPages 的 path 相对项目根（含 `.dsh-repowiki/` 前缀），清单
      // path 相对资产根；比较前统一去掉资产前缀，否则每个正常页面都会被
      // 误报为“路径与文件位置不符”。
      const assetPathPrefix = `${ASSET_DIR}/`
      const diskPathBySlug = new Map(wikiPages.map(page => [
        page.slug,
        page.path.startsWith(assetPathPrefix) ? page.path.slice(assetPathPrefix.length) : page.path,
      ]))
      const invalidWikiPages = []
      for (const page of manifest?.pages ?? []) {
        const slug = typeof page?.slug === 'string' ? page.slug : ''
        const rel = typeof page?.path === 'string' ? page.path.replace(/\\/g, '/') : ''
        if (!slug || !rel) continue
        if (rel.startsWith('/') || rel.split('/').includes('..')
          || !rel.startsWith(`wiki/${locale}/`) || !rel.endsWith('.md')) {
          invalidWikiPages.push(slug)
          continue
        }
        if (diskPathBySlug.has(slug) && diskPathBySlug.get(slug) !== rel) invalidWikiPages.push(slug)
      }
      // 上次生成失败页：清单已更新输入指纹，但部分页面没写成功；
      // 只在清单里持久化，不在本次 status 里重新推断。
      const wikiFailed = manifest && Number.isInteger(manifest.failedTotal)
        ? manifest.failedTotal
        : Array.isArray(manifest?.failed) ? manifest.failed.length : 0
      const wikiFailedPages = Array.isArray(manifest?.failed)
        ? manifest.failed
          .map(item => (typeof item?.slug === 'string' ? item.slug : ''))
          .filter(Boolean)
          .slice(0, 10)
        : []
      // 健康分只对“未同时缺页”的非法路径额外扣分，避免同一页面被
      // missing 与 invalid 双扣；invalidPages 可能含重复清单条目，先去重。
      const missingWikiSlugSet = new Set(missingWikiPages)
      const invalidWikiNotMissing = [...new Set(invalidWikiPages)]
        .filter(slug => !missingWikiSlugSet.has(slug)).length
      if (!manifest && wikiPages.length > 0) {
        warnings.push('wiki/_index.json is missing; page ordering/orphan detection is degraded until repowiki-generate runs.')
      }
      // 生成侧还会用已采信记忆指纹做增量短路：记忆变化时提示刷新，
      // 避免用户看到 stale=0 却在下一次 generate 触发重新合成
      let memoryStale = false
      if (manifest && wikiPages.length > 0 && typeof manifest.memoryDigest === 'string') {
        const accepted = await listMemory(fs, root, locale, 'accepted', true)
        const currentMemoryDigest = digestText(
          accepted.map(entry => `${entry.slug}:${(entry.body ?? '').trim()}`).sort().join('\n'),
          16,
        )
        memoryStale = currentMemoryDigest !== manifest.memoryDigest
        if (memoryStale) {
          warnings.push('Accepted memory changed since the wiki was generated; run repowiki-generate to refresh it.')
        }
      }
      // 与 verify:wiki 的 staleReasons 同值域/同顺序：页面输入指纹（卡片）、
      // 依赖图、已采信记忆。页面级 stale 计数为 0 时也可能因图/记忆陈旧，
      // 因此单独输出原因而不是只给计数。
      const wikiStaleReasons = []
      if (wikiStale > 0) wikiStaleReasons.push('cards')
      if (graphStale) wikiStaleReasons.push('graph')
      if (memoryStale) wikiStaleReasons.push('memory')

      // Wiki 引用完整性：清单里的 sources 必须能落到索引文件或磁盘文件。
      // 非索引引用（README 等）用 fs 探测确认；超过探测上限时视为"未验证"，
      // 不冒充缺失。
      let brokenCitations = null
      let citationRanges = null
      let citationDrift = null
      let citationCoverage = null
      let citationCoverageDetails = null
      // 引用告警已由健康分的 Wiki 分量按缺陷类型扣分；从卫生分量的
      // warnings 中排除，避免同一问题被重复计分。
      const citationWarnings = []
      const pushCitationWarning = message => {
        warnings.push(message)
        citationWarnings.push(message)
      }
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
          pushCitationWarning(`Wiki citation existence check stopped after ${WIKI_CITATION_CHECK_LIMIT} filesystem probes; unverified citations are not reported as broken.`)
        }
        brokenCitations = findBrokenWikiCitations(manifest, known)
        if (brokenCitations.total > 0) {
          pushCitationWarning(`${brokenCitations.total} wiki citation path(s) do not exist; regenerate the wiki or fix the cited paths.`)
        }
        // 行号越界：只对已有行数的索引文件判定；非索引/旧索引计入 unchecked。
        /** @type {Map<string, number>} */
        const lineCounts = new Map()
        for (const file of index?.files ?? []) {
          if (file && typeof file.path === 'string'
            && Number.isInteger(file.lines) && file.lines >= 0) {
            lineCounts.set(file.path, file.lines)
          }
        }
        citationRanges = findCitationRangeIssues(manifest, lineCounts, known)
        if (citationRanges.total > 0) {
          pushCitationWarning(`${citationRanges.total} wiki citation line range(s) exceed the cited file length.`)
        }

        // 引用内容漂移：仅清单 v3 起有 citationDigests；旧清单返回 null。
        citationDrift = await checkCitationDrift(manifest, async (rel) => {
          try {
            return await fs.readText(await fs.resolve(rel, { cwd: root }))
          } catch {
            return null
          }
        })
        if (citationDrift && citationDrift.total > 0) {
          pushCitationWarning(`${citationDrift.total} wiki citation(s) changed since the wiki was generated; regenerate to refresh.`)
        }
        // 指纹覆盖率：生成时读取失败的引用不会写入 citationDigests，
        // 如实输出覆盖率并由文本报告提示；缺失路径已有独立告警，
        // 这里不再重复告警，避免同一引用产生多条噪声。
        citationCoverage = summarizeCitationCoverage(manifest)
        citationCoverageDetails = citationCoverage ? citationCoveragePages(manifest) : null
      }

      const memories = await listMemory(fs, root, locale)
      const memoryCounts = { pending: 0, accepted: 0, rejected: 0, total: memories.length }
      for (const entry of memories) {
        if (entry.status in memoryCounts) memoryCounts[entry.status]++
      }

      const { plan, source: planSource, error: planError } = await readPlan(fs, root)
      if (planError) warnings.push(`repowiki-plan.json: ${planError}`)
      // 架构分层：plan 声明层且索引存在时按 import 边检查跨层依赖
      const layerReport = plan.layers.length > 0 && index
        ? evaluateLayers(plan.layers, index.edges ?? [], index.files ?? [])
        : null
      if (layerReport?.unknownRefs.length) {
        warnings.push(`repowiki-plan.json layers: unknown layer reference(s): ${layerReport.unknownRefs.join(', ')}.`)
      }
      if (layerReport && layerReport.total > 0) {
        warnings.push(`${layerReport.total} cross-layer import edge(s) violate the declared layers; see status.layers.`)
      }
      // 未解析相对导入：坏路径/被排除目标的直接信号（不读源码）。基线对照
      // 需要与 verify:arch 相同的明细上限，输出仍按展示上限截断。
      const unresolvedRaw = index
        ? findUnresolvedImports(index.files ?? [], index.edges ?? [], { limit: MAX_BASELINE_UNRESOLVED })
        : null
      const unresolved = unresolvedRaw
        ? { ...unresolvedRaw, details: unresolvedRaw.details.slice(0, MAX_UNRESOLVED_DETAILS) }
        : null
      if (unresolved && unresolved.total > 0) {
        warnings.push(`${unresolved.total} relative import(s) could not be resolved; see status.unresolved.`)
      }
      // 重复代码与复杂度：共用一次有界源码读取（数量上限内）
      const statusSources = index && (index.files ?? []).length > 0
        ? await readStatusSources(fs, root, index.files ?? [], plan.maxStatusSourceFiles)
        : []
      const duplicates = statusSources.length >= 2
        ? findDuplicates(statusSources, { windowLines: plan.duplicateMinLines })
        : null
      if (duplicates && duplicates.total > 0) {
        warnings.push(`${duplicates.total} cross-file duplicate block(s) detected; see status.duplicates.`)
      }
      const complexity = statusSources.length > 0
        ? computeComplexity(index?.files ?? [], statusSources, { threshold: plan.complexityThreshold })
        : null
      if (complexity && complexity.highTotal > 0) {
        warnings.push(`${complexity.highTotal} function(s) reach complexity ≥ ${complexity.threshold}; see status.complexity.`)
      }

      const git = await readGitInfo(fs, root)
      const moduleDependencies = summarizeModuleRelations(
        index?.files ?? [], index?.edges ?? [], STATUS_MODULE_RELATIONS,
      )
      // 循环组保留全量用于基线身份比较，展示仍按既有上限截断
      const cycleResult = findImportCycles(index?.edges ?? [], { limit: MAX_BASELINE_CYCLES })
      const cycles = cycleResult.cycles.slice(0, STATUS_CYCLE_GROUPS)
      // 文件级 hub：被最多不同文件 import 的目标（改动风险最高的入口）
      const hubs = topDependents(index?.edges ?? [], MAX_HUB_ENTRIES)
      // 架构基线对照：与 verify:arch 共用 architectureFactsSnapshot 口径；
      // 告警单独收集，不计入健康分的卫生分量（架构分量已反映事实）
      const baselineComparison = index
        ? await compareWithBaseline(fs, root, {
          files: index.files ?? [],
          edges: (index.edges ?? []).length,
          layerReport,
          cycles: cycleResult.cycles,
          unresolved: unresolvedRaw,
          duplicates: duplicates ?? { total: 0 },
          complexity: complexity ?? { high: [], highTotal: 0, max: 0 },
          hubs,
          config: {
            duplicateMinLines: plan.duplicateMinLines,
            complexityThreshold: plan.complexityThreshold,
          },
          truncated: {
            cycles: cycleResult.truncated === true,
            unresolvedImports: unresolvedRaw
              ? unresolvedRaw.total > unresolvedRaw.details.length
              : false,
          },
        })
        : { info: { exists: false }, warnings: [] }
      const baselineWarnings = baselineComparison.warnings
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
          wiki: {
            count: wikiPages.length,
            stale: wikiStale,
            orphaned: wikiOrphaned,
            missing: missingWikiPages.length,
            failed: wikiFailed,
            invalid: invalidWikiNotMissing,
          },
          citations: {
            broken: brokenCitations?.total ?? 0,
            outOfRange: citationRanges?.total ?? 0,
            drift: citationDrift?.total ?? 0,
            untracked: citationCoverage?.untracked ?? 0,
            unchecked: (citationRanges?.unchecked ?? 0) + (citationDrift?.unchecked ?? 0),
          },
          cycles: cycleResult.cycles,
          hubs,
          layers: layerReport ? { total: layerReport.total } : undefined,
          duplicates: duplicates ? { total: duplicates.total } : undefined,
          complexity: complexity ? { high: complexity.highTotal } : undefined,
          warnings: warnings.filter(message => !citationWarnings.includes(message)),
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
          ...(typeof rawIndex?.parserVersion === 'number' ? { parserVersion: rawIndex.parserVersion } : {}),
          compatible: index !== null,
          files: index?.stats?.files ?? 0,
          symbols: index?.stats?.symbols ?? 0,
          modules: Array.isArray(index?.modules) ? index.modules.length : 0,
          ...(index?.stats?.languages ? { languages: index.stats.languages } : {}),
          ...(index?.stats?.skipped ? { skipped: index.stats.skipped } : {}),
          ...(index?.untrusted
            ? { untrusted: { files: index.untrusted.files, edges: index.untrusted.edges } }
            : {}),
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
        ...(layerReport ? { layers: layerReport } : {}),
        ...(unresolved ? { unresolved } : {}),
        ...(duplicates ? { duplicates } : {}),
        ...(complexity ? { complexity } : {}),
        ...(health ? { health } : {}),
        wiki: {
          count: wikiPages.length,
          manifest: manifest !== null,
          stale: wikiStale,
          ...(wikiStaleReasons.length > 0 ? { staleReasons: wikiStaleReasons } : {}),
          failed: wikiFailed,
          failedPages: wikiFailedPages,
          missing: missingWikiPages.length,
          missingPages: missingWikiPages.slice(0, 10),
          invalid: invalidWikiPages.length,
          invalidPages: invalidWikiPages.slice(0, 10),
          duplicate: duplicateWikiTotal,
          duplicateSlugs: duplicateWikiSlugs.slice(0, 10),
          duplicatePaths: duplicateManifestPaths.slice(0, 10),
          orphaned: wikiOrphaned,
        },
        ...(brokenCitations ? { brokenCitations } : {}),
        ...(citationRanges ? { citationRangeIssues: citationRanges } : {}),
        ...(citationDrift ? { citationDrift } : {}),
        ...(citationCoverage ? { citationCoverage } : {}),
        ...(citationCoverageDetails && citationCoverageDetails.pages.length > 0
          ? { citationCoveragePages: citationCoverageDetails }
          : {}),
        memory: memoryCounts,
        plan: { source: planSource, ...(planError ? { error: planError } : {}) },
        lock: { pending: pendingLocks() },
        moduleDependencies,
        ...(coupling ? { moduleCoupling: coupling } : {}),
        cycles,
        topDependents: hubs,
        coreFiles,
        ...(unused ? { unusedExports: unused } : {}),
        archBaseline: baselineComparison.info,
        warnings: [...warnings, ...baselineWarnings],
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
