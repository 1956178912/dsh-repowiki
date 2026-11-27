/**
 * 项目级配置读取（repowiki-plan.json，随 Git 共享）。
 *
 * 配置分层的既定分工（方案 §5.5）：
 * - 项目级（本文件）：覆盖模块、排除、深度、预算上限——随仓库走；
 * - 工具参数：运行时覆盖，优先级最高；
 * - profile 级（插件 Config）：阶段模型映射——Phase 2 首版不做
 *   （模型一律继承会话默认，见 ADR-0003）。
 *
 * 缺失字段以代码默认值兜底；文件损坏（非 JSON）时整体回退默认值
 * 并由调用方报告，不阻断提取。
 */

import * as path from 'node:path'
import {
  ASSET_DIR, PLAN_FILE, MAX_CARDS_PER_RUN_DEFAULT,
  CARD_COMPLEXITY_THRESHOLD, DEFAULT_RESULT_LIMIT,
  EXTRACT_CONCURRENCY_DEFAULT, MAX_EXTRACT_CONCURRENCY,
  EXTRACT_ATTEMPTS_DEFAULT, MAX_EXTRACT_ATTEMPTS,
} from './schema.js'
import { normalizeLayers } from './layers.js'
import { COMPLEXITY_THRESHOLD } from './complexity.js'
import { DUPLICATE_WINDOW_LINES, MAX_DUPLICATE_FILES } from './duplicates.js'

/**
 * 配置对象（全部可选，缺省即默认值）。
 * @typedef {Object} RepoPlan
 * @property {string[]} [exclude] - 追加排除的目录名（叠加内置排除表）。
 * @property {string[]} [includeOnly] - 只覆盖这些路径前缀（为空=全部）。
 * @property {number} [maxCardsPerRun] - 单次提取卡片上限。
 * @property {number} [cardComplexityThreshold] - 卡片复杂度阈值（最少符号数）。
 * @property {string[]} [locales] - 生成的语言（首版只用第一个；预留给多语言）。
 * @property {number} [maxResultLimit] - 检索结果上限。
 * @property {number} [concurrency] - 卡片提取并发子代理数（1–4）。
 * @property {number} [attempts] - 单文件提取最大尝试次数（1–3，含首次）。
 * @property {Array<{name:string, paths:string[], mayDependOn:string[]}>} [layers]
 *   - 架构分层规则：路径前缀归属与允许的跨层依赖。
 * @property {number} [complexityThreshold] - 高复杂度函数阈值（1–100）。
 * @property {number} [duplicateMinLines] - 重复块最小行数（4–50）。
 * @property {number} [maxStatusSourceFiles] - status 源码分析最多读取的文件数（20–500）。
 */

/** 默认配置。 */
export const DEFAULT_PLAN = Object.freeze({
  exclude: [],
  includeOnly: [],
  maxCardsPerRun: MAX_CARDS_PER_RUN_DEFAULT,
  cardComplexityThreshold: CARD_COMPLEXITY_THRESHOLD,
  locales: [],
  maxResultLimit: DEFAULT_RESULT_LIMIT,
  concurrency: EXTRACT_CONCURRENCY_DEFAULT,
  attempts: EXTRACT_ATTEMPTS_DEFAULT,
  layers: [],
  complexityThreshold: COMPLEXITY_THRESHOLD,
  duplicateMinLines: DUPLICATE_WINDOW_LINES,
  maxStatusSourceFiles: MAX_DUPLICATE_FILES,
})

/**
 * 归一提取并发数：非整数回退默认，结果钳制到 [1, MAX_EXTRACT_CONCURRENCY]。
 * @param {unknown} value - 原始值（plan 或工具参数）。
 * @param {number} [fallback] - 回退值。
 * @returns {number} 合法并发数。
 */
export function normalizeConcurrency(value, fallback = EXTRACT_CONCURRENCY_DEFAULT) {
  const n = typeof value === 'number' && Number.isInteger(value) ? value : fallback
  return Math.min(MAX_EXTRACT_CONCURRENCY, Math.max(1, n))
}

/**
 * 归一提取尝试次数：非整数回退默认，结果钳制到 [1, MAX_EXTRACT_ATTEMPTS]。
 * @param {unknown} value - 原始值（plan 或工具参数）。
 * @param {number} [fallback] - 回退值。
 * @returns {number} 合法尝试次数。
 */
export function normalizeAttempts(value, fallback = EXTRACT_ATTEMPTS_DEFAULT) {
  const n = typeof value === 'number' && Number.isInteger(value) ? value : fallback
  return Math.min(MAX_EXTRACT_ATTEMPTS, Math.max(1, n))
}

/**
 * 读取并合并项目级配置。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 资产根。
 * @returns {Promise<{plan:RepoPlan, source:'file'|'default'|'broken', error?:string}>}
 */
export async function readPlan(fs, root) {
  // 先判存在性：文件不存在是正常情况（default）；存在但坏才是 broken。
  let exists = false
  try {
    const target = await fs.resolve(path.posix.join(ASSET_DIR, PLAN_FILE), { cwd: root })
    exists = (await fs.stat(target))?.type === 'file'
  } catch {
    // 不存在/不可读：按默认配置处理
  }
  if (!exists) {
    return { plan: { ...DEFAULT_PLAN }, source: 'default' }
  }
  try {
    const target = await fs.resolve(path.posix.join(ASSET_DIR, PLAN_FILE), { cwd: root })
    const text = await fs.readText(target)
    const parsed = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { plan: { ...DEFAULT_PLAN }, source: 'broken', error: 'plan file is not a JSON object' }
    }
    const plan = {
      exclude: arrayOfStrings(parsed.exclude),
      includeOnly: arrayOfStrings(parsed.includeOnly),
      maxCardsPerRun: nonNegativeInt(parsed.maxCardsPerRun, DEFAULT_PLAN.maxCardsPerRun),
      cardComplexityThreshold: nonNegativeInt(parsed.cardComplexityThreshold, DEFAULT_PLAN.cardComplexityThreshold),
      locales: arrayOfStrings(parsed.locales),
      maxResultLimit: nonNegativeInt(parsed.maxResultLimit, DEFAULT_PLAN.maxResultLimit),
      concurrency: normalizeConcurrency(parsed.concurrency, DEFAULT_PLAN.concurrency),
      attempts: normalizeAttempts(parsed.attempts, DEFAULT_PLAN.attempts),
      layers: normalizeLayers(parsed.layers),
      complexityThreshold: clampInt(parsed.complexityThreshold, DEFAULT_PLAN.complexityThreshold, 1, 100),
      duplicateMinLines: clampInt(parsed.duplicateMinLines, DEFAULT_PLAN.duplicateMinLines, 4, 50),
      maxStatusSourceFiles: clampInt(parsed.maxStatusSourceFiles, DEFAULT_PLAN.maxStatusSourceFiles, 20, 500),
    }
    return { plan, source: 'file' }
  } catch (err) {
    return { plan: { ...DEFAULT_PLAN }, source: 'broken', error: err?.message ?? 'plan file unreadable' }
  }
}

/**
 * 过滤出"受配置与参数管辖"的候选文件清单。
 * @param {readonly {path:string, symbols:unknown[]}[]} files - 索引中的文件清单。
 * @param {RepoPlan} plan - 项目级配置。
 * @param {{paths?:string[], threshold?:number, maxCards?:number}} overrides - 工具参数覆盖。
 * @returns {{candidates:string[], skippedSimple:string[], capped:boolean}} 候选与统计。
 */
export function selectCandidates(files, plan, overrides) {
  const threshold = overrides.threshold ?? plan.cardComplexityThreshold
  const maxCards = overrides.maxCards ?? plan.maxCardsPerRun
  const only = overrides.paths?.length ? overrides.paths.map(normalizePrefix) : []
  const includeOnly = plan.includeOnly.map(normalizePrefix)
  const candidates = []
  const skippedSimple = []
  for (const file of files) {
    const rel = file.path
    if (only.length > 0 && !only.some(p => rel.startsWith(p))) continue
    if (includeOnly.length > 0 && !includeOnly.some(p => rel.startsWith(p))) continue
    const symbols = Array.isArray(file.symbols) ? file.symbols : []
    if (symbols.length < threshold) {
      skippedSimple.push(rel)
      continue
    }
    candidates.push(rel)
  }
  const capped = candidates.length > maxCards
  return {
    candidates: capped ? candidates.slice(0, maxCards) : candidates,
    skippedSimple,
    capped,
  }
}

/**
 * 归一化路径前缀：正斜杠、无 leading ./。
 * @param {string} p - 前缀。
 * @returns {string} 归一化结果。
 */
function normalizePrefix(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
}

/**
 * 断言数组为字符串数组，否则返回空数组。
 * @param {unknown} v - 值。
 * @returns {string[]} 字符串数组。
 */
function arrayOfStrings(v) {
  return Array.isArray(v) && v.every(x => typeof x === 'string') ? v : []
}

/**
 * 非负整数或默认值。
 * @param {unknown} v - 值。
 * @param {number} fallback - 默认值。
 * @returns {number} 结果。
 */
function nonNegativeInt(v, fallback) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : fallback
}

/**
 * 整数钳制到 [min, max]；非法值回退默认。
 * @param {unknown} v - 值。
 * @param {number} fallback - 默认值。
 * @param {number} min - 下界。
 * @param {number} max - 上界。
 * @returns {number} 结果。
 */
function clampInt(v, fallback, min, max) {
  if (typeof v !== 'number' || !Number.isInteger(v)) return fallback
  return Math.min(max, Math.max(min, v))
}
