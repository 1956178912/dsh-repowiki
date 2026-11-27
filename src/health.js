// @ts-check
/**
 * 知识库健康度：文档覆盖率与加权健康分（纯函数，无 IO）。
 *
 * 业界仓库知识产品通常给出一个可比较的健康分（CodeScene 的 code health、
 * GitHub 的 community health 同理），但分数必须能解释、可复现、口径固定，
 * 否则只是装饰。本模块的四个分量都由已有事实推导：
 *
 * - 文档覆盖（40%）：达到卡片复杂度阈值的文件中，有多少已有卡片；
 *   分母是"有资格生成卡片"的文件，而不是全部文件——简单文件本就不该
 *   为凑数生成卡片（见 src/config.js 的 selectCandidates）。
 * - Wiki（25%）：是否生成过页面、陈旧与孤儿比例，以及引用完整性
 *   （缺失路径、行号越界、内容漂移；未覆盖引用作为提示项，不扣分）；
 *   引用缺陷只扣 Wiki 分量，不改变权重。
 * - 架构（20%）：文件级 import 环数量、最高 fan-in 入口的集中度、分层
 *   规则违规数、跨文件重复块数与高复杂度函数数。
 * - 卫生（15%）：索引告警与被跳过文件。
 *
 * 分数越低越应先处理 `issues` 中列出的前几条；分量分与权重同时输出，
 * 调用方可自行复算或只取需要的部分。
 */

/** 健康分权重（总和 100）。 */
export const HEALTH_WEIGHTS = Object.freeze({
  documentation: 40,
  wiki: 25,
  architecture: 20,
  hygiene: 15,
})

/** 健康等级阈值（含下界）。 */
export const HEALTH_GRADES = Object.freeze([
  { grade: 'A', min: 85 },
  { grade: 'B', min: 70 },
  { grade: 'C', min: 55 },
  { grade: 'D', min: 0 },
])

/**
 * 把数值钳制到 [min, max]。
 * @param {number} value - 原始值。
 * @param {number} min - 下界。
 * @param {number} max - 上界。
 * @returns {number} 钳制结果。
 */
function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

/**
 * 由总分映射等级。
 * @param {number} score - 0–100。
 * @returns {'A'|'B'|'C'|'D'} 等级。
 */
export function healthGrade(score) {
  const level = HEALTH_GRADES.find(item => score >= item.min)
  return /** @type {'A'|'B'|'C'|'D'} */ (level?.grade ?? 'D')
}

/**
 * 计算文档覆盖率：分母只统计"有资格生成卡片"的文件（默认全部）。
 * @param {Array<{path:string, module?:string, digest?:string}>} [files] - 索引文件条目。
 * @param {Map<string, {meta?:{sourceDigest?:string}, path?:string}>} [cardsMap] - 源路径 → 卡片。
 * @param {string[]} [eligiblePaths] - 有资格生成卡片的路径；省略时表示全部文件。
 * @returns {{eligible:number, documented:number, fresh:number, stale:number, percent:number,
 *   gaps:Array<{module:string, eligible:number, documented:number}>}}
 *   覆盖率与缺口（缺口按缺失数降序、模块路径升序，最多 5 条）。
 */
export function documentationCoverage(files = [], cardsMap = new Map(), eligiblePaths) {
  const eligibleSet = Array.isArray(eligiblePaths) ? new Set(eligiblePaths) : null
  const byModule = new Map()
  let eligible = 0
  let documented = 0
  let fresh = 0
  let stale = 0
  for (const file of files) {
    if (!file || typeof file.path !== 'string') continue
    if (eligibleSet && !eligibleSet.has(file.path)) continue
    eligible++
    const module = typeof file.module === 'string' && file.module ? file.module : '.'
    let bucket = byModule.get(module)
    if (!bucket) {
      bucket = { module, eligible: 0, documented: 0 }
      byModule.set(module, bucket)
    }
    bucket.eligible++
    const card = cardsMap.get(file.path)
    if (!card) continue
    documented++
    bucket.documented++
    if (card.meta?.sourceDigest === file.digest) fresh++
    else stale++
  }
  const percent = eligible === 0 ? 100 : Math.round((documented / eligible) * 100)
  const gaps = [...byModule.values()]
    .filter(bucket => bucket.eligible > bucket.documented)
    .sort((a, b) => (b.eligible - b.documented) - (a.eligible - a.documented)
      || a.module.localeCompare(b.module))
    .slice(0, 5)
  return { eligible, documented, fresh, stale, percent, gaps }
}

/**
 * 归一化引用完整性计数：缺省/非法值按 0，避免负分或 NaN。
 * @param {{broken?:number, outOfRange?:number, drift?:number, untracked?:number,
 *   unchecked?:number}} [citations] 引用问题计数。
 * @returns {{broken:number, outOfRange:number, drift:number, untracked:number,
 *   unchecked:number}} 规范化结果。
 */
function citationCounts(citations) {
  const pick = value => (Number.isInteger(value) && value > 0 ? value : 0)
  return {
    broken: pick(citations?.broken),
    outOfRange: pick(citations?.outOfRange),
    drift: pick(citations?.drift),
    untracked: pick(citations?.untracked),
    unchecked: pick(citations?.unchecked),
  }
}

/**
 * 评估知识库健康度。
 * @param {object} input - 已由调用方读取的事实快照。
 * @param {{eligible:number, documented:number, fresh:number, stale:number, percent:number}} input.coverage
 *   文档覆盖率。
 * @param {{count:number, stale:number, orphaned:number, missing?:number,
 *   failed?:number, invalid?:number}} input.wiki - Wiki 页面统计；
 *   `missing` 为清单登记但磁盘缺失，`failed` 为上次生成写失败，
 *   `invalid` 为路径非法/与文件位置不符（调用方应排除已计入 missing 的）。
 * @param {{broken?:number, outOfRange?:number, drift?:number, untracked?:number,
 *   unchecked?:number}} [input.citations]
 *   引用完整性问题计数（缺失路径/行号越界/内容漂移/未覆盖/未验证）；前 3 类扣 Wiki 分量。
 * @param {Array<{files:string[], size:number}>} [input.cycles] - 文件级循环组。
 * @param {Array<{path:string, dependents:number}>} [input.hubs] - fan-in 排名。
 * @param {{total?:number}} [input.layers] - 分层违规计数（plan 声明层时）。
 * @param {{total?:number}} [input.duplicates] - 跨文件重复块计数。
 * @param {{high?:number}} [input.complexity] - 高复杂度函数计数。
 * @param {string[]} [input.warnings] - 索引/环境告警。
 * @param {number} [input.skipped] - 索引跳过文件数。
 * @returns {{score:number, grade:'A'|'B'|'C'|'D',
 *   components:Array<{key:string, score:number, weight:number, detail:string}>,
 *   issues:string[]}}
 *   健康分、等级、可解释分量与前四条待办。
 */
export function assessHealth(input) {
  const coverage = input.coverage
  const wiki = input.wiki ?? { count: 0, stale: 0, orphaned: 0 }
  const wikiMissing = Number.isInteger(wiki.missing) && wiki.missing > 0 ? wiki.missing : 0
  const wikiFailed = Number.isInteger(wiki.failed) && wiki.failed > 0 ? wiki.failed : 0
  const wikiInvalid = Number.isInteger(wiki.invalid) && wiki.invalid > 0 ? wiki.invalid : 0
  const citations = citationCounts(input.citations)
  const cycles = Array.isArray(input.cycles) ? input.cycles : []
  const hubs = Array.isArray(input.hubs) ? input.hubs : []
  const warnings = Array.isArray(input.warnings) ? input.warnings : []
  const skipped = Number.isInteger(input.skipped) && input.skipped > 0 ? input.skipped : 0
  /** 取非负计数（缺省/非法值按 0）。 */
  const countOf = (value) => (Number.isInteger(value) && value > 0 ? value : 0)
  const layerViolations = countOf(input.layers?.total)
  const duplicateBlocks = countOf(input.duplicates?.total)
  const highComplexity = countOf(input.complexity?.high)

  const docsScore = coverage.eligible === 0 ? 100 : clamp(coverage.percent)
  // 引用缺陷按严重度扣 Wiki 分量：缺失路径 10 分/条（上限 40），
  // 越界与漂移各 5 分/条（各上限 20），总计最多扣 80，Wiki 仍 ≥20。
  const citationPenalty = Math.min(40, citations.broken * 10)
    + Math.min(20, citations.outOfRange * 5)
    + Math.min(20, citations.drift * 5)
  const citationProblems = citations.broken + citations.outOfRange + citations.drift
  // 缺页与生成失败都计入 Wiki 总页数：清单登记但文件丢失、或上次生成
  // 写失败的页面都属于资产损坏，按 40 分权重扣分（与引用缺失的上限一致）。
  // invalid 是仍在磁盘上的页面但清单路径损坏，按 5 分/条单独扣（上限 20），
  // 避免与 missing 双扣。
  const wikiMissingOrFailed = wikiMissing + wikiFailed
  const wikiTotal = wiki.count + wikiMissingOrFailed
  const wikiScore = wikiTotal === 0
    ? 0
    : clamp(100 - 60 * (wiki.stale / wikiTotal) - 20 * (wiki.orphaned / wikiTotal)
      - 40 * (wikiMissingOrFailed / wikiTotal) - Math.min(20, wikiInvalid * 5)
      - citationPenalty)
  const topHub = hubs[0]?.dependents ?? 0
  const hubPenalty = topHub >= 10 ? 15 : topHub >= 5 ? 8 : 0
  // 分层违规 5 分/条（上限 30）、重复块 3 分/块（上限 20）、高复杂度
  // 函数 2 分/个（上限 20）；与环、hub 共用架构分量的 100 分预算。
  const layerPenalty = Math.min(30, layerViolations * 5)
  const duplicatePenalty = Math.min(20, duplicateBlocks * 3)
  const complexityPenalty = Math.min(20, highComplexity * 2)
  const archScore = clamp(100 - Math.min(60, cycles.length * 10) - hubPenalty
    - layerPenalty - duplicatePenalty - complexityPenalty)
  const hygieneScore = clamp(100 - Math.min(50, warnings.length * 5) - Math.min(30, skipped * 2))

  const score = Math.round(
    (docsScore * HEALTH_WEIGHTS.documentation
      + wikiScore * HEALTH_WEIGHTS.wiki
      + archScore * HEALTH_WEIGHTS.architecture
      + hygieneScore * HEALTH_WEIGHTS.hygiene) / 100,
  )
  const grade = healthGrade(score)

  const issues = []
  const uncovered = Math.max(0, coverage.eligible - coverage.documented)
  if (uncovered > 0) issues.push(`${uncovered} eligible file(s) have no card`)
  if (coverage.stale > 0) issues.push(`${coverage.stale} card(s) are stale`)
  if (citations.broken > 0) issues.push(`${citations.broken} wiki citation path(s) are missing`)
  if (wikiTotal === 0) issues.push('no wiki pages have been generated')
  else if (wikiMissing > 0) issues.push(`${wikiMissing} wiki page(s) are listed in the manifest but missing on disk`)
  else if (wikiFailed > 0) issues.push(`${wikiFailed} wiki page(s) failed to write during the last generation`)
  else if (wiki.stale > 0) issues.push(`${wiki.stale} wiki page(s) are stale`)
  if (wikiInvalid > 0) issues.push(`${wikiInvalid} wiki page path(s) are invalid or do not match their file`)
  if (citations.outOfRange > 0) issues.push(`${citations.outOfRange} wiki citation line range(s) exceed the cited file length`)
  if (citations.drift > 0) issues.push(`${citations.drift} wiki citation(s) changed since generation`)
  if (citations.untracked > 0) issues.push(`${citations.untracked} citation(s) have no content digest`)
  if (cycles.length > 0) issues.push(`${cycles.length} import cycle group(s)`)
  if (layerViolations > 0) issues.push(`${layerViolations} cross-layer import violation(s)`)
  if (duplicateBlocks > 0) issues.push(`${duplicateBlocks} duplicate code block(s)`)
  if (highComplexity > 0) issues.push(`${highComplexity} high-complexity function(s)`)
  if (warnings.length > 0) issues.push(`${warnings.length} index/environment warning(s)`)
  if (skipped > 0) issues.push(`${skipped} file(s) were skipped during indexing`)

  return {
    score,
    grade,
    components: [
      { key: 'documentation', score: Math.round(docsScore), weight: HEALTH_WEIGHTS.documentation, detail: `${coverage.documented}/${coverage.eligible} eligible files documented` },
      { key: 'wiki', score: Math.round(wikiScore), weight: HEALTH_WEIGHTS.wiki, detail: wikiTotal === 0 ? 'no wiki pages' : `${wiki.count} page(s), ${wiki.stale} stale, ${wikiMissing} missing, ${wikiFailed} failed, ${wikiInvalid} invalid, ${wiki.orphaned} orphaned${citationProblems > 0 ? `, ${citationProblems} citation issue(s)` : ''}` },
      { key: 'architecture', score: Math.round(archScore), weight: HEALTH_WEIGHTS.architecture, detail: `${cycles.length} cycle group(s), top fan-in ${topHub}${layerViolations > 0 ? `, ${layerViolations} layer violation(s)` : ''}${duplicateBlocks > 0 ? `, ${duplicateBlocks} duplicate block(s)` : ''}${highComplexity > 0 ? `, ${highComplexity} high-complexity function(s)` : ''}` },
      { key: 'hygiene', score: Math.round(hygieneScore), weight: HEALTH_WEIGHTS.hygiene, detail: `${warnings.length} warning(s), ${skipped} skipped file(s)` },
    ],
    issues: issues.slice(0, 4),
  }
}
