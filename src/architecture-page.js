// @ts-check
/**
 * 确定性架构总览 Wiki 页（无模型调用，纯函数）。
 *
 * 生成器除模块页与主题页外，额外产出一页"架构总览"：它把索引与源码
 * 推导出的架构事实（分层、循环、fan-in、PageRank、重复块、复杂度热点、
 * 坏相对导入、架构基线）写成带引用的 Markdown。与主题页不同，本页
 * 不经过任何模型：内容完全由输入决定，同一索引/阈值必然生成同一页，
 * 因此可以稳定地随增量生成刷新，并接受 `verify:wiki` 的引用校验。
 *
 * 引用（sources）只包含索引内路径，行号范围来自索引中的符号行号；
 * 页面被标记 `deterministic: true`，生成侧据此放宽引用白名单到全部
 * 索引文件（主题页仍只允许 prompt 内的卡片路径）。
 */

import { evaluateLayers } from './layers.js'
import { findImportCycles } from './cycles.js'
import { findUnresolvedImports } from './unresolved.js'
import { findDuplicates, DUPLICATE_WINDOW_LINES } from './duplicates.js'
import { computeComplexity, COMPLEXITY_THRESHOLD } from './complexity.js'
import { topDependents } from './references.js'
import { computeFileRank } from './graph-rank.js'
import { architectureFactsSnapshot, normalizeBaseline, compareArchitecture } from './arch-baseline.js'

/** 架构总览页的固定 slug（清单/面板按 slug 解析）。 */
export const ARCHITECTURE_SLUG = 'architecture'

/** 页面内各节保留的最大条目数（页面是摘要，不替代 status 全量输出）。 */
const MAX_PAGE_CYCLES = 10
const MAX_PAGE_DUPLICATES = 10
const MAX_PAGE_COMPLEXITY = 10
const MAX_PAGE_UNRESOLVED = 10
const MAX_PAGE_VIOLATION_ROWS = 10
const MAX_PAGE_HUBS = 5
const MAX_PAGE_CORE_FILES = 5

/** 单页引用的去重上限（避免页面/指纹计算放大 IO）。 */
const MAX_PAGE_SOURCES = 40

/** 每节引用的明细条数上限。 */
const MAX_SECTION_SOURCES = 8

/**
 * 去重并截断引用列表（保持首次出现顺序）。
 * @param {Array<string|undefined>} values - 候选引用。
 * @param {number} [limit] - 上限（默认整页上限）。
 * @returns {string[]} 规范化引用。
 */
function uniqueSources(values, limit = MAX_PAGE_SOURCES) {
  const seen = new Set()
  const out = []
  for (const value of values) {
    if (typeof value !== 'string' || value === '' || seen.has(value)) continue
    seen.add(value)
    out.push(value)
    if (out.length >= limit) break
  }
  return out
}

/**
 * 统计语言分布（优先使用索引 stats，其次从文件条目推导）。
 * @param {any} index - 索引。
 * @returns {Array<[string, number]>} `[语言, 文件数]`，按数量降序、名称升序。
 */
function languageCounts(index) {
  const fromStats = index?.stats?.languages
  const counts = new Map()
  if (fromStats && typeof fromStats === 'object' && !Array.isArray(fromStats)) {
    for (const [lang, count] of Object.entries(fromStats)) {
      if (typeof lang === 'string' && Number.isInteger(count) && count > 0) counts.set(lang, count)
    }
  }
  if (counts.size === 0) {
    for (const file of index?.files ?? []) {
      if (typeof file?.lang !== 'string' || !file.lang) continue
      counts.set(file.lang, (counts.get(file.lang) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
}

/**
 * 解释架构基线：缺失/不可用/无退化/有退化。
 * @param {unknown} raw - `.dsh-repowiki/arch-baseline.json` 的 JSON。
 * @param {import('./arch-baseline.js').ArchitectureSnapshot} snapshot - 当前架构事实快照。
 * @param {string} [readError] - 读取/解析失败原因（非空即不可用）。
 * @returns {{state:'missing'|'unusable'|'ok'|'regressed', error?:string,
 *   improvements?:number, regressions?:Array<{kind:string, message:string}>}}
 *   基线状态。
 */
function resolveBaseline(raw, snapshot, readError = '') {
  if (readError) return { state: 'unusable', error: readError }
  if (raw === null || raw === undefined) return { state: 'missing' }
  const { baseline, problems } = normalizeBaseline(raw)
  if (!baseline) return { state: 'unusable', error: problems[0] ?? 'invalid baseline' }
  const comparison = compareArchitecture(baseline, snapshot)
  return {
    state: comparison.ok ? 'ok' : 'regressed',
    improvements: comparison.improvements.length,
    regressions: comparison.regressions.slice(0, MAX_PAGE_VIOLATION_ROWS),
  }
}

/**
 * 架构页输入。
 * @typedef {object} ArchitecturePageInput
 * @property {any} [index] - 索引（files/edges/modules/stats）。
 * @property {any} [plan] - 项目 plan（阈值与分层规则）。
 * @property {Array<{path:string, text:string}>} [sources] - 已读取的源码。
 * @property {unknown} [baselineRaw] - 架构基线 JSON（缺失为 null）。
 * @property {string} [baselineError] - 基线读取/解析失败原因。
 * @property {string} [locale] - zh/en。
 */

/**
 * 构造架构总览页。
 * @param {ArchitecturePageInput} [input] - 输入。
 * @returns {object} 页面对象（与 generate 的页面结构一致）。
 */
export function buildArchitecturePage(input = {}) {
  const index = input.index ?? {}
  const files = Array.isArray(index.files) ? index.files : []
  const edges = Array.isArray(index.edges) ? index.edges : []
  const modules = Array.isArray(index.modules) ? index.modules : []
  const plan = input.plan ?? {}
  const layers = Array.isArray(plan.layers) ? plan.layers : []
  const sources = Array.isArray(input.sources) ? input.sources : []
  const zh = input.locale === 'zh'
  const windowLines = Number.isInteger(plan.duplicateMinLines)
    ? /** @type {number} */ (plan.duplicateMinLines)
    : DUPLICATE_WINDOW_LINES
  const threshold = Number.isInteger(plan.complexityThreshold)
    ? /** @type {number} */ (plan.complexityThreshold)
    : COMPLEXITY_THRESHOLD

  const layerReport = layers.length > 0 ? evaluateLayers(layers, edges, files) : null
  const cycleResult = findImportCycles(edges, { limit: MAX_PAGE_CYCLES, filesPerCycle: 6 })
  const unresolved = findUnresolvedImports(files, edges, { limit: MAX_PAGE_UNRESOLVED })
  const duplicates = sources.length >= 2
    ? findDuplicates(sources, { windowLines })
    : { total: 0, windowLines, filesScanned: 0, filesSkipped: 0, groups: [] }
  const complexity = sources.length > 0
    ? computeComplexity(files, sources, { threshold })
    : null
  const hubs = topDependents(edges, MAX_PAGE_HUBS)
  const coreFiles = edges.length > 0
    ? computeFileRank(edges, { limit: MAX_PAGE_CORE_FILES }).entries
    : []
  const snapshot = architectureFactsSnapshot({
    files,
    edges: edges.length,
    layerReport,
    cycles: cycleResult.cycles,
    unresolved,
    duplicates,
    complexity,
    hubs,
    config: { duplicateMinLines: windowLines, complexityThreshold: threshold },
    truncated: {
      cycles: cycleResult.truncated,
      unresolvedImports: unresolved.total > unresolved.details.length,
    },
  })
  const baseline = resolveBaseline(input.baselineRaw, snapshot, input.baselineError)

  const sections = []
  const symbolCount = files.reduce(
    (sum, file) => sum + (Array.isArray(file?.symbols) ? file.symbols.length : 0), 0,
  )
  const languages = languageCounts(index)
  const overview = [
    `- **${zh ? '文件' : 'Files'}**: ${files.length} · **${zh ? '符号' : 'Symbols'}**: ${symbolCount} · **${zh ? '依赖边' : 'Import edges'}**: ${edges.length} · **${zh ? '模块' : 'Modules'}**: ${modules.length}`,
    languages.length > 0
      ? `- **${zh ? '语言分布' : 'Languages'}**: ${languages.map(([lang, count]) => `${lang} (${count})`).join(', ')}`
      : '',
    `- **${zh ? '架构分（健康分分量）' : 'Architecture score (health component)'}**: ${snapshot.architectureScore}/100`,
  ].filter(Boolean).join('\n')
  sections.push({ heading: zh ? '总览' : 'Overview', body: overview, sources: [] })

  if (layerReport) {
    const lines = [
      `| ${zh ? '层' : 'Layer'} | ${zh ? '路径' : 'Paths'} | ${zh ? '文件数' : 'Files'} | ${zh ? '允许依赖' : 'May depend on'} |`,
      '|---|---|---|---|',
      ...layerReport.layers.map(layer => `| \`${layer.name}\` | ${layer.paths.map(path => `\`${path}\``).join(', ')} | ${layer.files} | ${layer.mayDependOn.length > 0 ? layer.mayDependOn.map(name => `\`${name}\``).join(', ') : '—'} |`),
    ]
    if (layerReport.pairs.length > 0) {
      lines.push('', `**${zh ? '跨层违规' : 'Cross-layer violations'}**`, '')
      lines.push(...layerReport.pairs.map(pair => `- \`${pair.from}\` → \`${pair.to}\`: ${pair.count} ${zh ? '条依赖边' : 'edge(s)'}`))
      const examples = (layerReport.violations ?? []).slice(0, MAX_PAGE_VIOLATION_ROWS)
      if (examples.length > 0) {
        lines.push('', ...examples.map(violation => `- \`${violation.from}\` → \`${violation.to}\`${violation.line > 0 ? ` (L${violation.line})` : ''}`))
      }
    } else {
      lines.push('', zh ? '未发现跨层违规。' : 'No cross-layer violations were found.')
    }
    sections.push({
      heading: zh ? '架构分层' : 'Architecture layers',
      body: lines.join('\n'),
      sources: uniqueSources(
        (layerReport.violations ?? []).flatMap(violation => [violation.from, violation.to]),
        MAX_SECTION_SOURCES,
      ),
    })
  }

  if (cycleResult.cycles.length > 0) {
    const body = cycleResult.cycles.map((cycle) => {
      const shown = cycle.files.slice(0, 3).join(' ↔ ')
      const hidden = cycle.size - Math.min(cycle.files.length, 3)
      const route = Array.isArray(cycle.sample) && cycle.sample.length > 2
        ? ` — e.g. ${cycle.sample.join(' → ')}`
        : ''
      return `- \`${shown}\`${hidden > 0 ? ` (+${hidden})` : ''}${route}`
    }).join('\n')
    sections.push({
      heading: zh ? '循环依赖' : 'Import cycles',
      body,
      sources: uniqueSources(cycleResult.cycles.flatMap(cycle => cycle.files.slice(0, 3)), MAX_SECTION_SOURCES),
    })
  }

  if (hubs.length > 0 || coreFiles.length > 0) {
    const lines = []
    if (hubs.length > 0) {
      lines.push(`**${zh ? '高风险入口（fan-in）' : 'High-fan-in files'}**`, '')
      lines.push(...hubs.map(hub => `- \`${hub.path}\` — ${hub.dependents} ${zh ? '个依赖方文件' : 'importer file(s)'}`))
    }
    if (coreFiles.length > 0) {
      if (lines.length > 0) lines.push('')
      lines.push(`**${zh ? '核心文件（PageRank）' : 'Core files (PageRank)'}**`, '')
      lines.push(...coreFiles.map(entry => `- \`${entry.path}\` — ${entry.score.toFixed(4)}`))
    }
    sections.push({
      heading: zh ? '关键入口' : 'Key entry points',
      body: lines.join('\n'),
      sources: uniqueSources([...hubs.map(hub => hub.path), ...coreFiles.map(entry => entry.path)], MAX_SECTION_SOURCES),
    })
  }

  if (duplicates.total > 0) {
    const lines = duplicates.groups.slice(0, MAX_PAGE_DUPLICATES).map((group) => {
      const places = group.occurrences
        .map(occurrence => `\`${occurrence.path}:${occurrence.start}-${occurrence.end}\``)
        .join(' ↔ ')
      return `- ${group.lines} ${zh ? '行' : 'line(s)'}: ${places}`
    })
    sections.push({
      heading: zh ? '重复代码候选' : 'Duplicate code candidates',
      body: lines.join('\n'),
      sources: uniqueSources(
        duplicates.groups.flatMap(group => group.occurrences.map(occurrence => occurrence.path)),
        MAX_SECTION_SOURCES,
      ),
    })
  }

  if (complexity && complexity.high.length > 0) {
    const lines = complexity.high.slice(0, MAX_PAGE_COMPLEXITY).map((entry) => {
      const range = entry.endLine > entry.line ? `#L${entry.line}-L${entry.endLine}` : `#L${entry.line}`
      return `- \`${entry.name}\` in \`${entry.path}${range}\` — ${entry.complexity}`
    })
    sections.push({
      heading: zh ? '复杂度热点' : 'Complexity hotspots',
      body: lines.join('\n'),
      sources: uniqueSources(
        complexity.high.slice(0, MAX_PAGE_COMPLEXITY).map((entry) => (
          entry.endLine > entry.line
            ? `${entry.path}#L${entry.line}-L${entry.endLine}`
            : `${entry.path}#L${entry.line}`
        )),
        MAX_SECTION_SOURCES,
      ),
    })
  }

  if (unresolved.total > 0) {
    const lines = unresolved.details.slice(0, MAX_PAGE_UNRESOLVED).map(detail => (
      `- \`${detail.path}#L${detail.line}\` → \`${detail.specifier}\``
    ))
    sections.push({
      heading: zh ? '未解析的相对导入' : 'Unresolved relative imports',
      body: lines.join('\n'),
      sources: uniqueSources(
        unresolved.details.slice(0, MAX_PAGE_UNRESOLVED).map(detail => `${detail.path}#L${detail.line}`),
        MAX_SECTION_SOURCES,
      ),
    })
  }

  const baselineLines = []
  if (baseline.state === 'missing') {
    baselineLines.push(zh
      ? '尚未记录架构基线；运行 `verify:arch --update` 可冻结当前已知问题，之后只拦截新增退化。'
      : 'No architecture baseline is recorded; run `verify:arch --update` to freeze current findings so only new regressions fail.')
  } else if (baseline.state === 'unusable') {
    baselineLines.push(zh
      ? `基线不可用（${baseline.error}）；重新运行 \`verify:arch --update\`。`
      : `The baseline cannot be used (${baseline.error}); run \`verify:arch --update\` again.`)
  } else if (baseline.state === 'ok') {
    baselineLines.push(baseline.improvements > 0
      ? (zh
        ? `未检出新增退化；${baseline.improvements} 项已修复，可运行 \`verify:arch --update\` 收紧基线。`
        : `No new regressions; ${baseline.improvements} finding(s) have been fixed and the baseline can be tightened with \`verify:arch --update\`.`)
      : (zh ? '未检出新增退化。' : 'No new regressions were detected.'))
  } else {
    baselineLines.push(zh
      ? `检出 ${baseline.regressions.length} 项新增退化：`
      : `${baseline.regressions.length} new regression(s) were detected:`)
    baselineLines.push('', ...baseline.regressions.map(item => `- ${item.message}`))
  }
  sections.push({
    heading: zh ? '架构基线' : 'Architecture baseline',
    body: baselineLines.join('\n'),
    sources: [],
  })

  const title = zh ? '架构总览' : 'Architecture overview'
  return {
    title,
    slug: ARCHITECTURE_SLUG,
    overview: zh
      ? '本页由插件根据索引与源码确定性生成，无模型调用；数字口径与 `repowiki-status`、`verify:arch` 一致。'
      : 'This page is generated deterministically from the index and sources without model calls; its numbers use the same definitions as `repowiki-status` and `verify:arch`.',
    sections,
    mermaid: '',
    module: '',
    deterministic: true,
    order: 0,
  }
}
