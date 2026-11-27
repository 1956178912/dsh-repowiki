// @ts-check
/**
 * 架构基线（ratchet）快照与比较（纯函数，无 IO）。
 *
 * 背景：循环依赖、跨层违规、坏相对导入、重复代码与高复杂度函数都是
 * "存量问题永远存在"的指标。若 CI 要求一次清零，团队只能关掉检查；
 * 业界做法（ESLint baseline、detekt baseline、ArchUnit freeze）是先冻结
 * 当前事实，之后只拦截**新增**退化——即 ratchet（棘轮）。
 *
 * 本模块把索引与源码推导出的可复现事实压成一份基线：
 * - 身份型信号（循环组、分层违规的层对计数、坏相对导入）按签名比较：
 *   基线里没有的签名 = 新问题；消失的签名 = 可收紧项。
 * - 上限型信号（重复块数、高复杂度函数数、最大复杂度）与架构分量分按
 *   数值比较：高于基线 = 退化；低于基线 = 可收紧项。
 *
 * 所有输出都排序去重，同一输入必定得到同一基线（可安全提交到 Git，
 * diff 只反映真实变化）。本模块不读写文件，CLI 在 scripts/verify-arch.mjs。
 */

import { evaluateLayers } from './layers.js'
import { findImportCycles } from './cycles.js'
import { findUnresolvedImports } from './unresolved.js'
import { findDuplicates, DUPLICATE_WINDOW_LINES } from './duplicates.js'
import { computeComplexity, COMPLEXITY_THRESHOLD } from './complexity.js'
import { assessHealth } from './health.js'
import { topDependents, MAX_HUB_ENTRIES } from './references.js'
import { ARCH_BASELINE_SCHEMA_VERSION } from './schema.js'

/** 基线里保留的循环组上限（超出时标记 truncation，比较仍然可用）。 */
export const MAX_BASELINE_CYCLES = 200

/** 基线里保留的坏相对导入上限。 */
export const MAX_BASELINE_UNRESOLVED = 200

/** 基线里保留的分层违规层对上限。 */
export const MAX_BASELINE_LAYER_PAIRS = 100

/**
 * 架构基线快照的结构（与 arch-baseline.json 的字段一一对应）。
 * @typedef {object} ArchitectureSnapshot
 * @property {number} schemaVersion - 基线 schema 版本。
 * @property {{duplicateMinLines:number, complexityThreshold:number}} [config] - 生成时的分析阈值。
 * @property {{files:number, edges:number, symbols:number}} [totals] - 索引规模（参考信息）。
 * @property {Array<string[]>} cycles - 循环组成员（已排序）。
 * @property {Array<{from:string, to:string, count:number}>} layerViolations - 跨层违规层对计数。
 * @property {Array<{path:string, specifier:string}>} unresolvedImports - 未解析的相对导入。
 * @property {{duplicateBlocks:number, highComplexity:number, maxComplexity:number}|null} [ceilings]
 *   上限型信号（null 表示基线未记录，比较时跳过）。
 * @property {number|null} [architectureScore] - 架构分量分（null 表示不比较）。
 * @property {{cycles:boolean, unresolvedImports:boolean}} [truncated] - 生成时是否截断。
 */

/** 拼接签名用的分隔符（文件名/层名中不会出现）。 */
const KEY_SEP = '\u0000'

/**
 * 把计数类输入归一为非负整数。
 * @param {unknown} value - 原始值。
 * @returns {number} 非负整数（非法值按 0）。
 */
function countOf(value) {
  return Number.isInteger(value) && /** @type {number} */ (value) >= 0
    ? /** @type {number} */ (value)
    : 0
}

/**
 * 把分值钳制到 [0, 100]。
 * @param {number} value - 原始分值。
 * @returns {number} 钳制结果。
 */
function clampScore(value) {
  return Math.min(100, Math.max(0, Math.round(value)))
}

/**
 * 渲染循环组成员（最多 3 个 + 折叠计数）用于人类可读消息。
 * @param {string[]} files - 组成员（已排序）。
 * @returns {string} `a ↔ b (+2)` 形式的文本。
 */
function cycleLabel(files) {
  const shown = files.slice(0, 3).join(' ↔ ')
  return files.length > 3 ? `${shown} (+${files.length - 3})` : shown
}

/**
 * 按 from/to 排序层对（稳定输出）。
 * @param {{from:string, to:string, count:number}} a - 层对。
 * @param {{from:string, to:string, count:number}} b - 层对。
 * @returns {number} 排序值。
 */
function comparePairs(a, b) {
  return a.from.localeCompare(b.from) || a.to.localeCompare(b.to)
}

/**
 * 由**已经算好的架构事实**生成基线快照（status 与 CLI 共用，避免两套口径）。
 *
 * `repowiki-status` 为了展示已经计算过循环/分层/坏导入/重复/复杂度，这里
 * 不再重算，只做归一化与评分；`snapshotArchitecture` 则在 CLI 侧先算事实
 * 再调用本函数。两条路径对同一索引必须给出逐字段相同的结果。
 * @param {object} facts - 架构事实。
 * @param {Array} [facts.files] - 索引文件条目（用于规模统计）。
 * @param {number} [facts.edges] - 依赖边数量（用于规模统计）。
 * @param {{total?:number, pairs?:Array<{from:string,to:string,count:number}>, violations?:Array}} [facts.layerReport]
 *   - `evaluateLayers` 的结果；优先使用精确的 `pairs`。
 * @param {Array<{files:string[], size:number}>} [facts.cycles] - 循环组（`findImportCycles` 输出）。
 * @param {{details?:Array, total?:number}} [facts.unresolved] - `findUnresolvedImports` 输出。
 * @param {{total?:number}} [facts.duplicates] - `findDuplicates` 输出。
 * @param {{high?:Array, highTotal?:number, max?:number}} [facts.complexity] - `computeComplexity` 输出。
 * @param {Array<{path:string, dependents:number}>} [facts.hubs] - fan-in 排名。
 * @param {{duplicateMinLines:number, complexityThreshold:number}} facts.config - 生效阈值。
 * @param {{cycles?:boolean, unresolvedImports?:boolean}} [facts.truncated] - 输入是否被截断。
 * @returns {ArchitectureSnapshot} 基线快照。
 */
export function architectureFactsSnapshot(facts) {
  const files = Array.isArray(facts.files) ? facts.files : []
  const cycles = (Array.isArray(facts.cycles) ? facts.cycles : [])
    .map(cycle => {
      const members = [...new Set((cycle.files ?? []).filter(name => typeof name === 'string' && name !== ''))]
      return members.sort()
    })
    .filter(members => members.length >= 2)
    .sort((a, b) => a.join(KEY_SEP).localeCompare(b.join(KEY_SEP)))
  const layerViolations = (Array.isArray(facts.layerReport?.pairs)
    ? facts.layerReport.pairs
    : pairCountsFrom(facts.layerReport?.violations))
    .map(pair => ({ from: pair.from, to: pair.to, count: countOf(pair.count) }))
    .sort(comparePairs)
    .slice(0, MAX_BASELINE_LAYER_PAIRS)
  const unresolvedMap = new Map()
  for (const detail of Array.isArray(facts.unresolved?.details) ? facts.unresolved.details : []) {
    if (!detail || typeof detail.path !== 'string' || typeof detail.specifier !== 'string') continue
    unresolvedMap.set(`${detail.path}${KEY_SEP}${detail.specifier}`, {
      path: detail.path,
      specifier: detail.specifier,
    })
  }
  const unresolvedImports = [...unresolvedMap.values()]
    .sort((a, b) => a.path.localeCompare(b.path) || a.specifier.localeCompare(b.specifier))
    .slice(0, MAX_BASELINE_UNRESOLVED)
  const duplicateBlocks = countOf(facts.duplicates?.total)
  const highComplexity = Number.isInteger(facts.complexity?.highTotal)
    ? countOf(facts.complexity?.highTotal)
    : (Array.isArray(facts.complexity?.high) ? facts.complexity.high.length : 0)
  const maxComplexity = countOf(facts.complexity?.max)
  const hubs = Array.isArray(facts.hubs) ? facts.hubs : []
  // 只取架构分量：文档/Wiki 资产状态与架构门禁无关，避免基线随资产生成漂移
  const health = assessHealth({
    coverage: { eligible: 0, documented: 0, fresh: 0, stale: 0, percent: 100 },
    wiki: { count: 0, stale: 0, orphaned: 0 },
    cycles: cycles.map(members => ({ files: members, size: members.length })),
    hubs,
    layers: { total: countOf(facts.layerReport?.total) },
    duplicates: { total: duplicateBlocks },
    complexity: { high: highComplexity },
    warnings: [],
    skipped: 0,
  })
  const architectureScore = clampScore(
    health.components.find(component => component.key === 'architecture')?.score ?? 100,
  )
  let symbols = 0
  for (const file of files) {
    if (Array.isArray(file?.symbols)) symbols += file.symbols.length
  }
  return {
    schemaVersion: ARCH_BASELINE_SCHEMA_VERSION,
    config: {
      duplicateMinLines: countOf(facts.config?.duplicateMinLines),
      complexityThreshold: countOf(facts.config?.complexityThreshold),
    },
    totals: {
      files: files.length,
      edges: Number.isInteger(facts.edges) ? countOf(facts.edges) : 0,
      symbols,
    },
    cycles,
    layerViolations,
    unresolvedImports,
    ceilings: {
      duplicateBlocks,
      highComplexity,
      maxComplexity,
    },
    architectureScore,
    truncated: {
      cycles: facts.truncated?.cycles === true,
      unresolvedImports: facts.truncated?.unresolvedImports === true,
    },
  }
}

/**
 * 从违规明细聚合层对计数（仅在调用方没有提供 `pairs` 时兜底）。
 * @param {Array<{fromLayer:string, toLayer:string}>} [violations] - 违规明细。
 * @returns {Array<{from:string, to:string, count:number}>} 层对计数（未排序）。
 */
function pairCountsFrom(violations) {
  const pairCounts = new Map()
  for (const violation of Array.isArray(violations) ? violations : []) {
    if (!violation || typeof violation.fromLayer !== 'string' || typeof violation.toLayer !== 'string') continue
    const key = `${violation.fromLayer}${KEY_SEP}${violation.toLayer}`
    const bucket = pairCounts.get(key)
    if (bucket) bucket.count++
    else pairCounts.set(key, { from: violation.fromLayer, to: violation.toLayer, count: 1 })
  }
  return [...pairCounts.values()]
}

/**
 * 从索引与源码生成架构基线快照（CLI 入口；status 走 `architectureFactsSnapshot`）。
 * @param {object} input - 输入事实。
 * @param {{files?:Array, edges?:Array}} [input.index] - 索引内容（files/edges）。
 * @param {Array<{name:string, paths:string[], mayDependOn:string[]}>} [input.layers]
 *   - 已归一化的分层配置（repowiki-plan.json 的 layers）。
 * @param {Array<{path:string, text:string}>} [input.sources] - 已读取的源码
 *   （重复代码与复杂度的输入；调用方负责有界读取）。
 * @param {{duplicateMinLines?:number, complexityThreshold?:number}} [input.opts]
 *   - 与 status 一致的分析阈值。
 * @returns {ArchitectureSnapshot} 基线快照（含 schemaVersion，可直接序列化为 JSON）。
 */
export function snapshotArchitecture(input = {}) {
  const files = Array.isArray(input.index?.files) ? input.index.files : []
  const edges = Array.isArray(input.index?.edges) ? input.index.edges : []
  const layers = Array.isArray(input.layers) ? input.layers : []
  const sources = Array.isArray(input.sources) ? input.sources : []
  const windowLines = Number.isInteger(input.opts?.duplicateMinLines)
    ? /** @type {number} */ (input.opts?.duplicateMinLines)
    : DUPLICATE_WINDOW_LINES
  const threshold = Number.isInteger(input.opts?.complexityThreshold)
    ? /** @type {number} */ (input.opts?.complexityThreshold)
    : COMPLEXITY_THRESHOLD

  const layerReport = layers.length > 0 ? evaluateLayers(layers, edges, files) : null
  const cycleResult = findImportCycles(edges, { limit: MAX_BASELINE_CYCLES })
  const unresolvedResult = findUnresolvedImports(files, edges, { limit: MAX_BASELINE_UNRESOLVED })
  const duplicates = sources.length >= 2
    ? findDuplicates(sources, { windowLines })
    : { total: 0 }
  const complexity = sources.length > 0
    ? computeComplexity(files, sources, { threshold })
    : { total: 0, high: [], highTotal: 0, max: 0 }
  return architectureFactsSnapshot({
    files,
    edges: edges.length,
    layerReport,
    cycles: cycleResult.cycles,
    unresolved: unresolvedResult,
    duplicates,
    complexity,
    hubs: topDependents(edges, MAX_HUB_ENTRIES),
    config: { duplicateMinLines: windowLines, complexityThreshold: threshold },
    truncated: {
      cycles: cycleResult.truncated === true,
      unresolvedImports: unresolvedResult.total > unresolvedResult.details.length,
    },
  })
}

/**
 * 归一化磁盘上读到的基线：丢弃畸形条目、去重、排序、钳制计数。
 *
 * 基线随 Git 传播，与索引一样属于不可信输入：手工编辑或旧版本字段都可能
 * 让比较逻辑读到非数组/非字符串。这里不抛错，而是返回可比较的干净对象
 * 与人类可读的问题列表（调用方决定告警还是失败）。
 * @param {unknown} raw - JSON.parse 的结果。
 * @returns {{baseline:ArchitectureSnapshot|null, problems:string[]}} 归一结果与问题描述。
 */
export function normalizeBaseline(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { baseline: null, problems: ['architecture baseline is not a JSON object'] }
  }
  const record = /** @type {Record<string, any>} */ (raw)
  const version = Number.isInteger(record.schemaVersion) ? record.schemaVersion : 0
  if (version !== ARCH_BASELINE_SCHEMA_VERSION) {
    return {
      baseline: null,
      problems: [
        `unsupported architecture baseline schemaVersion ${version || '(missing)'}; expected ${ARCH_BASELINE_SCHEMA_VERSION} (run verify:arch --update)`,
      ],
    }
  }
  const problems = []
  const cycles = []
  const seenCycles = new Set()
  let droppedCycles = 0
  for (const item of Array.isArray(record.cycles) ? record.cycles : []) {
    if (!Array.isArray(item)) { droppedCycles++; continue }
    const members = [...new Set(item.filter(value => typeof value === 'string' && value !== ''))].sort()
    if (members.length < 2) { droppedCycles++; continue }
    const key = members.join(KEY_SEP)
    if (seenCycles.has(key)) continue
    seenCycles.add(key)
    cycles.push(members)
  }
  if (droppedCycles > 0) problems.push(`ignored ${droppedCycles} malformed cycle entr${droppedCycles === 1 ? 'y' : 'ies'}`)

  const pairMap = new Map()
  let droppedPairs = 0
  for (const item of Array.isArray(record.layerViolations) ? record.layerViolations : []) {
    if (!item || typeof item.from !== 'string' || item.from === ''
      || typeof item.to !== 'string' || item.to === '') {
      droppedPairs++
      continue
    }
    const count = Number.isInteger(item.count) && item.count > 0 ? item.count : 1
    const key = `${item.from}${KEY_SEP}${item.to}`
    const existing = pairMap.get(key)
    pairMap.set(key, {
      from: item.from,
      to: item.to,
      count: existing ? Math.max(existing.count, count) : count,
    })
  }
  if (droppedPairs > 0) problems.push(`ignored ${droppedPairs} malformed layer violation entr${droppedPairs === 1 ? 'y' : 'ies'}`)

  const unresolvedMap = new Map()
  let droppedUnresolved = 0
  for (const item of Array.isArray(record.unresolvedImports) ? record.unresolvedImports : []) {
    if (!item || typeof item.path !== 'string' || item.path === ''
      || typeof item.specifier !== 'string' || item.specifier === '') {
      droppedUnresolved++
      continue
    }
    unresolvedMap.set(`${item.path}${KEY_SEP}${item.specifier}`, {
      path: item.path,
      specifier: item.specifier,
    })
  }
  if (droppedUnresolved > 0) {
    problems.push(`ignored ${droppedUnresolved} malformed unresolved import entr${droppedUnresolved === 1 ? 'y' : 'ies'}`)
  }

  const rawCeilings = record.ceilings
  let ceilings = null
  if (rawCeilings && typeof rawCeilings === 'object' && !Array.isArray(rawCeilings)) {
    ceilings = {
      duplicateBlocks: countOf(rawCeilings.duplicateBlocks),
      highComplexity: countOf(rawCeilings.highComplexity),
      maxComplexity: countOf(rawCeilings.maxComplexity),
    }
  } else {
    problems.push('baseline has no ceilings; ceiling ratchet disabled')
  }

  let architectureScore = null
  if (Number.isInteger(record.architectureScore)) {
    architectureScore = clampScore(record.architectureScore)
  } else {
    problems.push('baseline has no architectureScore; score ratchet disabled')
  }

  const totals = {
    files: countOf(record.totals?.files),
    edges: countOf(record.totals?.edges),
    symbols: countOf(record.totals?.symbols),
  }
  const config = {
    duplicateMinLines: countOf(record.config?.duplicateMinLines),
    complexityThreshold: countOf(record.config?.complexityThreshold),
  }

  return {
    baseline: {
      schemaVersion: version,
      config,
      totals,
      cycles: cycles
        .sort((a, b) => a.join(KEY_SEP).localeCompare(b.join(KEY_SEP)))
        .slice(0, MAX_BASELINE_CYCLES),
      layerViolations: [...pairMap.values()].sort(comparePairs).slice(0, MAX_BASELINE_LAYER_PAIRS),
      unresolvedImports: [...unresolvedMap.values()]
        .sort((a, b) => a.path.localeCompare(b.path) || a.specifier.localeCompare(b.specifier))
        .slice(0, MAX_BASELINE_UNRESOLVED),
      ceilings,
      architectureScore,
      truncated: {
        cycles: record.truncated?.cycles === true,
        unresolvedImports: record.truncated?.unresolvedImports === true,
      },
    },
    problems,
  }
}

/**
 * 比较当前快照与基线，得出新增退化（失败项）与可收紧项。
 * @param {ArchitectureSnapshot} baseline - 归一化后的基线。
 * @param {ArchitectureSnapshot} current - `snapshotArchitecture` 的输出。
 * @returns {{ok:boolean, regressions:Array<{kind:string, key:string, message:string}>,
 *   improvements:Array<{kind:string, key:string, message:string}>}} 比较结果。
 */
export function compareArchitecture(baseline, current) {
  /** @type {Array<{kind:string, key:string, message:string}>} */
  const regressions = []
  /** @type {Array<{kind:string, key:string, message:string}>} */
  const improvements = []

  const baseCycles = new Map(
    (baseline.cycles ?? []).map(members => [members.join(KEY_SEP), members]),
  )
  const currentCycles = new Map(
    (current.cycles ?? []).map(members => [members.join(KEY_SEP), members]),
  )
  for (const [key, members] of currentCycles) {
    if (baseCycles.has(key)) continue
    regressions.push({
      kind: 'cycle',
      key,
      message: `new import cycle group: ${cycleLabel(members)}`,
    })
  }
  for (const [key, members] of baseCycles) {
    if (currentCycles.has(key)) continue
    improvements.push({
      kind: 'cycle',
      key,
      message: `import cycle group resolved: ${cycleLabel(members)}`,
    })
  }

  const basePairs = new Map(
    (baseline.layerViolations ?? []).map(pair => [`${pair.from}${KEY_SEP}${pair.to}`, pair]),
  )
  const currentPairs = new Map(
    (current.layerViolations ?? []).map(pair => [`${pair.from}${KEY_SEP}${pair.to}`, pair]),
  )
  for (const [key, pair] of currentPairs) {
    const before = basePairs.get(key)
    if (!before) {
      regressions.push({
        kind: 'layer',
        key,
        message: `new cross-layer import: ${pair.from} → ${pair.to} (${pair.count} edge${pair.count === 1 ? '' : 's'})`,
      })
      continue
    }
    if (pair.count > before.count) {
      regressions.push({
        kind: 'layer',
        key,
        message: `cross-layer imports ${pair.from} → ${pair.to} increased from ${before.count} to ${pair.count}`,
      })
    } else if (pair.count < before.count) {
      improvements.push({
        kind: 'layer',
        key,
        message: `cross-layer imports ${pair.from} → ${pair.to} decreased from ${before.count} to ${pair.count}`,
      })
    }
  }
  for (const [key, pair] of basePairs) {
    if (currentPairs.has(key)) continue
    improvements.push({
      kind: 'layer',
      key,
      message: `cross-layer imports ${pair.from} → ${pair.to} resolved (was ${pair.count})`,
    })
  }

  const baseUnresolved = new Map(
    (baseline.unresolvedImports ?? []).map(item => [`${item.path}${KEY_SEP}${item.specifier}`, item]),
  )
  const currentUnresolved = new Map(
    (current.unresolvedImports ?? []).map(item => [`${item.path}${KEY_SEP}${item.specifier}`, item]),
  )
  for (const [key, item] of currentUnresolved) {
    if (baseUnresolved.has(key)) continue
    regressions.push({
      kind: 'unresolved',
      key,
      message: `new unresolved import: ${item.path} → ${item.specifier}`,
    })
  }
  for (const [key, item] of baseUnresolved) {
    if (currentUnresolved.has(key)) continue
    improvements.push({
      kind: 'unresolved',
      key,
      message: `unresolved import fixed: ${item.path} → ${item.specifier}`,
    })
  }

  if (baseline.ceilings && current.ceilings) {
    const ceilingLabels = {
      duplicateBlocks: 'duplicate code blocks',
      highComplexity: 'high-complexity functions',
      maxComplexity: 'max function complexity',
    }
    for (const key of /** @type {const} */ (['duplicateBlocks', 'highComplexity', 'maxComplexity'])) {
      const before = countOf(baseline.ceilings[key])
      const now = countOf(current.ceilings[key])
      if (now > before) {
        regressions.push({
          kind: 'ceiling',
          key,
          message: `${ceilingLabels[key]} increased from ${before} to ${now}`,
        })
      } else if (now < before) {
        improvements.push({
          kind: 'ceiling',
          key,
          message: `${ceilingLabels[key]} decreased from ${before} to ${now}`,
        })
      }
    }
  }

  if (Number.isInteger(baseline.architectureScore) && Number.isInteger(current.architectureScore)) {
    const before = baseline.architectureScore
    const now = current.architectureScore
    if (now < before) {
      regressions.push({
        kind: 'score',
        key: 'architectureScore',
        message: `architecture score dropped from ${before} to ${now}`,
      })
    } else if (now > before) {
      improvements.push({
        kind: 'score',
        key: 'architectureScore',
        message: `architecture score improved from ${before} to ${now}`,
      })
    }
  }

  return { ok: regressions.length === 0, regressions, improvements }
}
