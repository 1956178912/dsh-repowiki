#!/usr/bin/env node
// @ts-check
/**
 * 架构基线门禁（本地/CI 工具，非运行时依赖）。
 *
 * 读取 `.dsh-repowiki/index.json`、`repowiki-plan.json`（分层规则）与有界
 * 源码，生成与 `repowiki-status` 同口径的架构事实（循环组、跨层违规、
 * 坏相对导入、重复块、高复杂度函数、架构分量分），再与
 * `.dsh-repowiki/arch-baseline.json` 比较：
 *
 * - 新增循环组 / 新增跨层层对或计数上升 / 新增坏相对导入；
 * - 重复块、高复杂度函数数、最大复杂度高于基线；
 * - 架构分量分低于基线；
 *
 * 任一命中即失败（ratchet：只拦新增退化，不要求清零存量）。
 * 修复后跑 `--update` 收紧基线；基线本身随 Git 提交，diff 可审阅。
 *
 * 用法：
 *   node scripts/verify-arch.mjs [--root <dir>] [--update] [--require] [--json]
 *
 * 退出码：
 *   0 = 通过（无基线时默认只告警，`--require` 下失败）
 *   1 = 检出新增退化 / 基线不可用
 *   2 = 参数或读取错误（缺少索引等）
 */

import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { snapshotArchitecture, normalizeBaseline, compareArchitecture } from '../src/arch-baseline.js'
import { readPlan } from '../src/config.js'
import { ARCH_BASELINE_FILE, ASSET_DIR } from '../src/schema.js'
import { projectRelativePath } from '../src/util.js'

const INDEX_FILE = 'index.json'

/** 源码读取并发上限（与 status 的源码分析一致）。 */
const READ_CONCURRENCY = 8

/** 非索引常量占位（避免 magic string 散落）。 */
const BASELINE_REL = `${ASSET_DIR}/${ARCH_BASELINE_FILE}`

const USAGE = [
  'Usage: node scripts/verify-arch.mjs [options]',
  '',
  '  --root <dir>   Project root (default: current directory)',
  '  --update       Write .dsh-repowiki/arch-baseline.json from current facts',
  '  --require      Fail when no architecture baseline exists (for CI)',
  '  --json         Machine-readable output',
  '  --help         Show this help',
  '',
  'Exit codes: 0 pass, 1 regression or unusable baseline, 2 usage/read error.',
].join('\n')

/**
 * 解析命令行参数。
 * @param {string[]} argv - 参数（不含 node 与脚本名）。
 * @returns {{root:string, update:boolean, require:boolean, json:boolean, help:boolean}}
 *   解析结果。
 */
export function parseArgs(argv) {
  const args = { root: process.cwd(), update: false, require: false, json: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--update') { args.update = true; continue }
    if (arg === '--check') continue
    if (arg === '--require') { args.require = true; continue }
    if (arg === '--json') { args.json = true; continue }
    if (arg === '--help' || arg === '-h') { args.help = true; continue }
    if (arg === '--root') {
      const value = argv[++i]
      if (!value) throw new Error('--root requires a directory')
      args.root = path.resolve(value)
      continue
    }
    throw new Error(`unknown argument: ${arg}`)
  }
  return args
}

/**
 * `ctx.fs` 的最小 Node 适配器（只覆盖 readPlan 用到的 resolve/stat/readText）。
 * @returns {any} 适配器对象。
 */
function createNodeFs() {
  return {
    /**
     * 解析相对路径。
     * @param {string} target - 相对路径。
     * @param {{cwd?:string}} [opts] - 基准目录。
     * @returns {Promise<string>} 绝对路径。
     */
    resolve: async (target, opts) => path.resolve(opts?.cwd ?? process.cwd(), target),
    /**
     * 探测路径类型。
     * @param {string} target - 绝对路径。
     * @returns {Promise<{type:string}|undefined>} 类型；不存在返回 undefined。
     */
    stat: async (target) => {
      try {
        const info = await stat(target)
        if (info.isDirectory()) return { type: 'directory' }
        if (info.isFile()) return { type: 'file' }
        return { type: 'other' }
      } catch {
        return undefined
      }
    },
    /**
     * 读取文本。
     * @param {string} target - 绝对路径。
     * @returns {Promise<string>} 内容。
     */
    readText: async (target) => readFile(target, 'utf8'),
  }
}

/**
 * 读取并净化索引：路径一律经 `projectRelativePath`（索引随 Git 传播，
 * 内容不可信；坏条目丢弃并计数，不中断门禁）。
 * @param {string} root - 项目根。
 * @returns {Promise<{exists:boolean, error:string, files:Array, edges:Array,
 *   schemaVersion?:number, droppedFiles:number, droppedEdges:number}>} 读取结果。
 */
async function loadIndex(root) {
  let text
  try {
    text = await readFile(path.join(root, ASSET_DIR, INDEX_FILE), 'utf8')
  } catch (err) {
    const code = err?.code
    if (code === 'ENOENT') return { exists: false, error: '', files: [], edges: [], droppedFiles: 0, droppedEdges: 0 }
    return {
      exists: false,
      error: err?.message ?? String(err),
      files: [],
      edges: [],
      droppedFiles: 0,
      droppedEdges: 0,
    }
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return {
      exists: true,
      error: `index.json is not valid JSON: ${err?.message ?? err}`,
      files: [],
      edges: [],
      droppedFiles: 0,
      droppedEdges: 0,
    }
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.files)) {
    return {
      exists: true,
      error: 'index.json is not a valid index',
      files: [],
      edges: [],
      droppedFiles: 0,
      droppedEdges: 0,
    }
  }
  const files = []
  let droppedFiles = 0
  for (const entry of parsed.files) {
    const rel = projectRelativePath(entry?.path)
    if (!rel) { droppedFiles++; continue }
    files.push({ ...entry, path: rel })
  }
  const edges = []
  let droppedEdges = 0
  for (const edge of Array.isArray(parsed.edges) ? parsed.edges : []) {
    const from = projectRelativePath(edge?.from)
    const to = projectRelativePath(edge?.to)
    if (!from || !to) { droppedEdges++; continue }
    edges.push({ ...edge, from, to })
  }
  return {
    exists: true,
    error: '',
    files,
    edges,
    ...(typeof parsed.schemaVersion === 'number' ? { schemaVersion: parsed.schemaVersion } : {}),
    droppedFiles,
    droppedEdges,
  }
}

/**
 * 有界并发读取源码（重复代码与复杂度的输入）。
 * @param {string} root - 项目根。
 * @param {Array<{path:string}>} files - 已净化的索引文件条目。
 * @param {number} limit - 最多读取的文件数。
 * @returns {Promise<Array<{path:string, text:string}>>} 按路径排序的源码。
 */
async function readSources(root, files, limit) {
  const targets = files.slice(0, Math.max(0, limit))
  const sources = []
  let cursor = 0
  const worker = async () => {
    while (cursor < targets.length) {
      const file = targets[cursor++]
      try {
        sources.push({ path: file.path, text: await readFile(path.join(root, file.path), 'utf8') })
      } catch {
        // 不可读文件跳过（不影响其余事实）
      }
    }
  }
  await Promise.all(Array.from({ length: READ_CONCURRENCY }, worker))
  sources.sort((a, b) => a.path.localeCompare(b.path))
  return sources
}

/**
 * 发现索引里的语言数量（仅用于报告）。
 * @param {Array<{lang?:string}>} files - 索引文件条目。
 * @returns {number} 去重后的语言数。
 */
function countLanguages(files) {
  const langs = new Set()
  for (const file of files) {
    if (typeof file?.lang === 'string' && file.lang) langs.add(file.lang)
  }
  return langs.size
}

/**
 * 执行架构基线校验或更新。
 * @param {{root?:string, update?:boolean, requireBaseline?:boolean}} [options] - 选项。
 * @returns {Promise<object>} 结构化结果（含 exitCode）。
 */
export async function verifyArchitecture(options = {}) {
  const root = path.resolve(options.root ?? process.cwd())
  const update = options.update === true
  const requireBaseline = options.requireBaseline === true
  /** @type {Array<{code:string, severity:'error'|'warning', message:string}>} */
  const problems = []
  const baselinePath = path.join(root, ASSET_DIR, ARCH_BASELINE_FILE)

  const index = await loadIndex(root)
  if (!index.exists || index.error) {
    problems.push({
      code: index.exists ? 'index/invalid' : 'index/missing',
      severity: 'error',
      message: index.error || `${ASSET_DIR}/${INDEX_FILE} is missing (run repowiki-index)`,
    })
    return {
      root,
      ok: false,
      updated: false,
      exitCode: 2,
      baselinePath: BASELINE_REL,
      index: { exists: index.exists, files: 0, edges: 0 },
      baseline: null,
      current: null,
      regressions: [],
      improvements: [],
      problems,
    }
  }
  if (index.droppedFiles > 0 || index.droppedEdges > 0) {
    problems.push({
      code: 'index/untrusted',
      severity: 'warning',
      message: `ignored ${index.droppedFiles} unsafe file path(s) and ${index.droppedEdges} unsafe edge(s) in index.json`,
    })
  }

  const { plan, source: planSource, error: planError } = await readPlan(createNodeFs(), root)
  if (planError) {
    problems.push({ code: 'plan/invalid', severity: 'warning', message: `repowiki-plan.json: ${planError}` })
  }
  const sources = await readSources(root, index.files, plan.maxStatusSourceFiles)
  const current = snapshotArchitecture({
    index: { files: index.files, edges: index.edges },
    layers: plan.layers,
    sources,
    opts: {
      duplicateMinLines: plan.duplicateMinLines,
      complexityThreshold: plan.complexityThreshold,
    },
  })

  let rawBaseline = null
  /** 基线状态：missing（不存在）/ invalid（坏 JSON）/ unusable（版本或结构不可用）/ ok。 */
  let baselineState = 'ok'
  try {
    rawBaseline = JSON.parse(await readFile(baselinePath, 'utf8'))
  } catch (err) {
    if (err?.code === 'ENOENT') baselineState = 'missing'
    else {
      baselineState = 'invalid'
      problems.push({
        code: 'baseline/invalid',
        severity: 'error',
        message: `${BASELINE_REL} is not valid JSON: ${err?.message ?? err}`,
      })
    }
  }
  const normalized = rawBaseline === null
    ? { baseline: null, problems: [] }
    : normalizeBaseline(rawBaseline)
  for (const message of normalized.problems) {
    problems.push({ code: 'baseline/normalized', severity: 'warning', message })
  }
  const baseline = normalized.baseline
  if (baselineState === 'ok' && normalized.baseline === null) baselineState = 'unusable'
  if (baseline?.truncated?.cycles || baseline?.truncated?.unresolvedImports) {
    problems.push({
      code: 'baseline/truncated',
      severity: 'warning',
      message: 'the baseline was written from truncated lists; new cycles/imports beyond the cap cannot be detected',
    })
  }

  const shared = {
    root,
    baselinePath: BASELINE_REL,
    baseline: baseline
      ? { exists: true, schemaVersion: baseline.schemaVersion }
      : { exists: baselineState !== 'missing', schemaVersion: null },
    index: {
      exists: true,
      ...(typeof index.schemaVersion === 'number' ? { schemaVersion: index.schemaVersion } : {}),
      files: index.files.length,
      edges: index.edges.length,
      languages: countLanguages(index.files),
    },
    planSource,
    current,
    problems,
  }

  if (update) {
    try {
      await writeFile(baselinePath, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
    } catch (err) {
      problems.push({
        code: 'baseline/write-failed',
        severity: 'error',
        message: `cannot write ${BASELINE_REL}: ${err?.message ?? err}`,
      })
      return { ...shared, ok: false, updated: false, exitCode: 2, regressions: [], improvements: [] }
    }
    return { ...shared, ok: true, updated: true, exitCode: 0, regressions: [], improvements: [] }
  }

  if (baselineState !== 'ok') {
    if (baselineState === 'missing') {
      problems.push({
        code: 'baseline/missing',
        severity: requireBaseline ? 'error' : 'warning',
        message: `${BASELINE_REL} is missing (run: npm run verify:arch -- --update)`,
      })
    } else if (baselineState === 'unusable') {
      problems.push({
        code: 'baseline/unusable',
        severity: 'error',
        message: `${BASELINE_REL} cannot be used (unsupported schemaVersion or invalid fields); run: npm run verify:arch -- --update`,
      })
    }
    const ok = baselineState === 'missing' && !requireBaseline
    return {
      ...shared,
      baseline: { exists: baselineState !== 'missing', schemaVersion: baseline?.schemaVersion ?? null },
      ok,
      updated: false,
      exitCode: ok ? 0 : 1,
      regressions: [],
      improvements: [],
    }
  }

  const comparison = compareArchitecture(baseline, current)
  return {
    ...shared,
    baseline: { exists: true, schemaVersion: baseline.schemaVersion },
    ok: comparison.ok,
    updated: false,
    exitCode: comparison.ok ? 0 : 1,
    regressions: comparison.regressions,
    improvements: comparison.improvements,
  }
}

/**
 * 渲染人类可读报告。
 * @param {Awaited<ReturnType<typeof verifyArchitecture>>} result - 结果。
 * @returns {string} 文本报告。
 */
export function formatReport(result) {
  const lines = [`Architecture baseline: ${result.root}`]
  const index = result.index
  lines.push(`Index: ${index.files} file(s), ${index.edges} edge(s)${typeof index.languages === 'number' ? `, ${index.languages} language(s)` : ''}`)
  const baselineLabel = result.baseline?.exists
    ? (typeof result.baseline.schemaVersion === 'number' ? `(schema v${result.baseline.schemaVersion})` : '(unusable)')
    : '(missing)'
  lines.push(`Baseline: ${result.baselinePath} ${baselineLabel}`)
  const current = result.current
  if (current) {
    const counts = [
      `${current.cycles.length} cycle group(s)`,
      `${current.layerViolations.reduce((sum, pair) => sum + pair.count, 0)} layer violation(s)`,
      `${current.unresolvedImports.length} unresolved import(s)`,
      `${current.ceilings.duplicateBlocks} duplicate block(s)`,
      `${current.ceilings.highComplexity} high-complexity function(s)`,
      `max complexity ${current.ceilings.maxComplexity}`,
      `architecture score ${current.architectureScore}`,
    ]
    lines.push(`Current: ${counts.join(', ')}`)
  }
  if (result.updated) lines.push(`Baseline written: ${result.baselinePath}`)
  if (result.regressions.length > 0) {
    lines.push('Regressions:')
    for (const item of result.regressions) lines.push(`  - ${item.message}`)
  }
  if (result.improvements.length > 0) {
    lines.push(`Tighten the baseline (${result.improvements.length} fixed):`)
    for (const item of result.improvements.slice(0, 5)) lines.push(`  - ${item.message}`)
    if (result.improvements.length > 5) lines.push(`  - … ${result.improvements.length - 5} more`)
    lines.push('  run: npm run verify:arch -- --update')
  }
  for (const problem of result.problems) {
    lines.push(`${problem.severity === 'error' ? '!' : '?'} ${problem.message}`)
  }
  lines.push(result.ok ? 'Result: PASS' : 'Result: FAIL')
  return lines.join('\n')
}

/**
 * CLI 入口。
 * @param {string[]} [argv] - 参数（不含 node 与脚本名）。
 * @returns {Promise<number>} 退出码。
 */
export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (args.help) {
    console.log(USAGE)
    return 0
  }
  const result = await verifyArchitecture({
    root: args.root,
    update: args.update,
    requireBaseline: args.require,
  })
  console.log(args.json ? JSON.stringify(result, null, 2) : formatReport(result))
  return result.exitCode
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().then((code) => {
    process.exitCode = code
  }).catch((err) => {
    console.error(`verify-arch: ${err?.message ?? err}`)
    process.exitCode = 2
  })
}
