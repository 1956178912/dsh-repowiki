// @ts-check
/**
 * 词法级符号使用点扫描（纯函数）。
 *
 * index.json 的依赖边只证明"某文件导入了某符号"，并未说明符号在依赖方
 * 的哪里被使用。本模块按标识符边界在源码中定位出现位置，给变更分析提供
 * 比 import 行更强的证据。语义边界必须如实保留：这是**词法出现**，不是
 * 解析后的调用点——同名但不同实体、字符串与行尾注释中的文本无法区分，
 * 调用方仍需自行确认。行首注释行与已知的 import/定义行会被排除，以压低
 * 明显噪声而不假装精确。
 */

import { reexportImportSites, starExportedNamesByFile } from './reexports.js'

/** 单次影响面分析返回的使用点条目上限。 */
export const MAX_USAGE_ENTRIES = 100

/** 单次分析最多读取的依赖方文件数（按路径排序后的前 N 个）。 */
export const MAX_USAGE_FILES = 20

/** 每个符号在单个依赖方文件中最多返回的使用点。 */
export const MAX_USAGES_PER_SYMBOL = 10

/** 单行展示文本上限（超出截断并加省略号）。 */
const MAX_LINE_CHARS = 200

/**
 * 行首视为注释的标记（JS/TS、Python/Ruby/Shell、C 块注释、SQL/Lua、HTML）。
 * 只跳过整行注释；行尾注释与字符串内容不处理（宁可多报，不猜语义）。
 */
const COMMENT_PREFIXES = ['//', '#', '/*', '*', '--', '<!--']

/**
 * import 语句块的起始行形态。多行具名导入（JS/TS、Python、Go）的续行只
 * 含符号列表，不属于使用点；只靠 edge.line 无法排除续行，因此按块的
 * 括号平衡跳过整个语句。`export const x = {...}` 不匹配（不是导入）。
 */
const IMPORT_BLOCK_STARTS = [
  /^\s*import\b[^;]*\{/,
  /^\s*export\s*\{/,
  /^\s*import\s*\(/,
  /^\s*from\s+\S+\s+import\s*\(/,
  /^\s*use\b[^;]*\{/,
  /^\s*(?:const|let|var)\s*[{[]/,
  // Python __all__ 声明是导出清单，不是使用点（跨行列表由括号配平跳过）
  /^\s*__all__\s*(?:\+?=|\.(?:append|extend)\s*\()/,
]

/**
 * 转义正则元字符。
 * @param {string} value - 原文。
 * @returns {string} 可用于 RegExp 的字面量。
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 是否为整行注释（去空白后以注释标记开头）。
 * @param {string} line - 源码行。
 * @returns {boolean} 是否跳过。
 */
function isCommentLine(line) {
  const trimmed = line.trimStart()
  return COMMENT_PREFIXES.some(prefix => trimmed.startsWith(prefix))
}

/**
 * 是否为 import 语句块起始行。
 * @param {string} line - 源码行。
 * @returns {boolean} 是否视为导入语句。
 */
function opensImportBlock(line) {
  return IMPORT_BLOCK_STARTS.some(pattern => pattern.test(line))
}

/**
 * 按括号净值更新导入块深度（{、(、[ 增加，}、)、] 减少，下限 0）。
 * @param {string} line - 源码行。
 * @param {number} depth - 进入该行前的深度。
 * @returns {number} 该行结束后的深度；0 表示语句已闭合。
 */
function updateBlockDepth(line, depth) {
  let delta = 0
  for (const char of line) {
    if (char === '{' || char === '(' || char === '[') delta++
    else if (char === '}' || char === ')' || char === ']') delta--
  }
  return Math.max(0, depth + delta)
}

/**
 * 把命中行规整为展示文本：去首尾空白，超长截断。
 * @param {string} line - 源码行。
 * @returns {string} 展示文本。
 */
function displayLine(line) {
  const text = line.trim()
  return text.length <= MAX_LINE_CHARS ? text : `${text.slice(0, MAX_LINE_CHARS - 1)}…`
}

/**
 * 在源码中查找符号的词法使用点。
 *
 * 匹配要求标识符边界（前后不是 `[A-Za-z0-9_$]`），大小写敏感；同一行只记
 * 一次首个命中位置。空行、整行注释与 `skipLines`（import/定义行）跳过。
 * @param {string} source - 源码文本。
 * @param {string} symbolName - 精确符号名。
 * @param {{skipLines?:Iterable<number>, skipRanges?:Array<[number, number]>, limit?:number,
 *   aliasNames?:string[]}} [options] - 需排除的行号/闭区间（1 起）、返回上限
 *   与别名（再导出后导入方使用的本地名）。
 * @returns {{usages:Array<{line:number, text:string}>, truncated:boolean}}
 *   使用点与截断标记。
 */
export function findSymbolUsages(source, symbolName, options = {}) {
  const name = String(symbolName ?? '')
  if (!name) return { usages: [], truncated: false }
  const aliasNames = [...new Set(
    (Array.isArray(options.aliasNames) ? options.aliasNames : [])
      .filter(alias => typeof alias === 'string' && alias && alias !== name),
  )]
  const limit = Number.isInteger(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : MAX_USAGES_PER_SYMBOL
  const skip = new Set()
  for (const line of options.skipLines ?? []) {
    if (Number.isInteger(line) && line > 0) skip.add(line)
  }
  const ranges = []
  for (const range of Array.isArray(options.skipRanges) ? options.skipRanges : []) {
    if (!Array.isArray(range) || range.length !== 2) continue
    const [start, end] = range
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) continue
    ranges.push([start, end])
  }
  // 通用标识符字符集：JS/PHP 的 `$`、Python/Go/Rust 的 `_` 均覆盖。
  const alternatives = [name, ...aliasNames].map(escapeRegExp).join('|')
  const pattern = new RegExp(`(^|[^A-Za-z0-9_$])(?:${alternatives})($|[^A-Za-z0-9_$])`)
  const lines = String(source ?? '').split('\n')
  /** @type {Array<{line:number, text:string}>} */
  const usages = []
  let truncated = false
  let blockDepth = 0
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const number = index + 1
    if (blockDepth > 0) {
      blockDepth = updateBlockDepth(line, blockDepth)
      continue
    }
    if (opensImportBlock(line)) {
      blockDepth = updateBlockDepth(line, 0)
      continue
    }
    if (skip.has(number) || ranges.some(([start, end]) => number >= start && number <= end)) continue
    if (line.trim() === '' || isCommentLine(line)) continue
    if (!pattern.test(line)) continue
    if (usages.length >= limit) {
      truncated = true
      break
    }
    usages.push({ line: number, text: displayLine(line) })
  }
  return { usages, truncated }
}

/**
 * 找出直接具名导入某符号的依赖方文件及其 import 行号。
 *
 * 只接受 `edge.symbols` 明确包含该符号的边：副作用导入（无符号）与
 * 引用同文件其他符号的边不属于本符号的使用者。自引用忽略。提供索引
 * 文件条目时，还会沿 `export * from`/同名具名再导出链把"从 barrel
 * 导入该符号"的文件纳入扫描；barrel 自身的再导出边不算使用点。
 * @param {Array<{from:string, to:string, kind?:string, line?:number, symbols?:string[],
 *   aliases?:Array<{from:string, to:string}>, hidden?:string[]}>} edges
 *   index.json 的依赖边。
 * @param {{path:string, name:string}} symbol - 已解析的符号定义。
 * @param {Array<{path?:string, lang?:string, symbols?:Array<{name?:string, exported?:boolean}>}>} [files]
 *   索引文件条目（用于解析再导出链）。
 * @returns {Array<{path:string, importLines:number[], names?:string[]}>}
 *   按路径排序的依赖方；别名导入时 `names` 为导入方实际使用的名字。
 */
export function usageImporters(edges = [], symbol, files = []) {
  if (!symbol || typeof symbol.path !== 'string' || typeof symbol.name !== 'string') return []
  const pythonFiles = new Set(
    files.filter(file => file && file.path && file.lang === 'python').map(file => file.path),
  )
  const pythonStarVisibility = starExportedNamesByFile(files)
  /** @type {Map<string, {lines:Set<number>, names:Set<string>}>} */
  const byPath = new Map()
  /**
   * 登记一个依赖方、import 行号与别名（导入方实际使用的名字）。
   * @param {string} path - 依赖方文件。
   * @param {number|undefined} line - import 行号。
   * @param {string[]} [names] - 别名导入名（与定义名不同）。
   * @returns {void}
   */
  const addImporter = (path, line, names = []) => {
    let entry = byPath.get(path)
    if (!entry) {
      entry = { lines: new Set(), names: new Set() }
      byPath.set(path, entry)
    }
    if (Number.isInteger(line) && line > 0) entry.lines.add(line)
    for (const name of names) {
      if (typeof name === 'string' && name && name !== symbol.name) entry.names.add(name)
    }
  }
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.to !== symbol.path || edge.from === symbol.path) continue
    const names = Array.isArray(edge.symbols) ? edge.symbols : []
    // `*`（命名空间导入/`export *`）可能引用任意符号：作为潜在导入方参与
    // 词法扫描，是否真的使用由扫描结果决定
    if (!names.includes(symbol.name) && !names.includes('*')) continue
    // Python 星号导入按 __all__/下划线收窄：排除名不算潜在导入方
    if (names.includes('*') && pythonFiles.has(edge.from) && pythonStarVisibility.has(edge.to)
      && !pythonStarVisibility.get(edge.to).has(symbol.name)) continue
    // Dart `hide`：星号导入的排除名不算潜在导入方
    if (names.includes('*') && Array.isArray(edge.hidden) && edge.hidden.includes(symbol.name)) continue
    // 再导出边上的 aliases 是导出名映射，不是导入方本地绑定名
    const reexportEdge = edge.kind === 'export-from' || edge.kind === 'reexport'
    const aliases = reexportEdge
      ? []
      : (Array.isArray(edge.aliases) ? edge.aliases : [])
        .filter(alias => alias && alias.from === symbol.name && typeof alias.to === 'string')
        .map(alias => alias.to)
    addImporter(edge.from, edge.line, aliases)
  }
  if (files.length > 0) {
    for (const site of reexportImportSites(edges, files, symbol.path, symbol.name)) {
      addImporter(site.path, site.line, site.names)
    }
  }
  return [...byPath.entries()]
    .map(([path, entry]) => ({
      path,
      importLines: [...entry.lines].sort((a, b) => a - b),
      ...(entry.names.size > 0 ? { names: [...entry.names].sort() } : {}),
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * 决定本轮实际扫描哪些依赖方文件（按路径排序后截取前 N 个）。
 * @param {Array<{path:string}>} importers - usageImporters 的合并结果。
 * @param {number} [limit] - 文件数上限（默认 MAX_USAGE_FILES）。
 * @returns {{scanned:string[], skipped:number}} 待扫描路径与因上限跳过的数量。
 */
export function selectUsageFiles(importers = [], limit = MAX_USAGE_FILES) {
  const max = Number.isInteger(limit) && limit > 0 ? Math.floor(limit) : MAX_USAGE_FILES
  const paths = [...new Set(importers.map(item => item?.path).filter(path => typeof path === 'string'))]
    .sort((a, b) => a.localeCompare(b))
  return {
    scanned: paths.slice(0, max),
    skipped: Math.max(0, paths.length - max),
  }
}

/** 单次 cards 查询最多扫描的匹配符号数（其余计入 skipped）。 */
export const MAX_USAGE_TARGETS = 5

/**
 * 收集命中符号的词法使用点。
 *
 * 在**直接具名导入方**与**符号定义文件**里定位：依赖边必须显式列出该
 * 符号，副作用导入与引用同文件其他符号的边不算证据；定义文件用于发现
 * 同文件内的局部调用，定义所在行范围通过 `skipRanges` 排除。导入方文件
 * 数、每符号站点数与总站点数均有上限（定义文件不计入导入方上限）；读取
 * 失败的文件逐个披露（unknown，不是未使用），因文件上限未扫描的导入方
 * 计入 `skippedFiles` 并把相关符号标记为 truncated。
 * @param {any} fs - ctx.fs 服务。
 * @param {string} root - 项目根。
 * @param {Array<{from:string, to:string, kind?:string, line?:number, symbols?:string[],
 *   aliases?:Array<{from:string, to:string}>, hidden?:string[]}>} edges - 索引依赖边。
 * @param {Array<{path:string, symbols?:Array<{name:string, line?:number, endLine?:number}>}>} matches
 *   - 定义文件命中（searchIndex 结果或符号锚点）。
 * @param {Array<{path?:string, lang?:string, symbols?:Array<{name?:string, exported?:boolean}>}>} [files]
 *   - 索引文件条目；提供时沿再导出链纳入 barrel 导入方。
 * @returns {Promise<{entries:Array, skipped:number, skippedFiles:number, truncated:boolean}>}
 *   逐符号使用点、目标数缺口、文件数缺口与截断标记。
 */
export async function collectSymbolUsages(fs, root, edges, matches, files = []) {
  /** @type {Array<{path:string, name:string, line?:number, endLine?:number}>} */
  const targets = []
  for (const match of matches) {
    for (const symbol of match.symbols ?? []) {
      if (typeof symbol?.name !== 'string' || symbol.name === '') continue
      targets.push({
        path: match.path,
        name: symbol.name,
        ...(Number.isInteger(symbol.line) ? { line: symbol.line } : {}),
        ...(Number.isInteger(symbol.endLine) ? { endLine: symbol.endLine } : {}),
      })
    }
  }
  const selected = targets.slice(0, MAX_USAGE_TARGETS)
  const skipped = Math.max(0, targets.length - selected.length)
  if (selected.length === 0) return { entries: [], skipped: 0, skippedFiles: 0, truncated: false }

  /** 目标键（定义路径 + 符号名）→ 该定义的直接具名导入方。 */
  const targetKey = target => `${target.path}\u0000${target.name}`
  /** @type {Map<string, Array<{path:string, importLines:number[]}>>} */
  const importersByTarget = new Map()
  /** 文件 → 符号 → 跳过行/闭区间（import 行与定义范围）。 */
  /** @type {Map<string, Map<string, {lines:Set<number>, ranges:Array<[number, number]>, aliases:Set<string>}>>} */
  const scanPlan = new Map()
  /**
   * 登记一次文件扫描；同一文件可同时是定义文件与多个符号的导入方。
   * @param {string} filePath - 待读文件。
   * @param {string} name - 符号名。
   * @param {{lines?:Iterable<number>, range?:[number, number]|null, aliases?:string[]}} [skip]
   *   - 跳过行、定义闭区间与导入方别名。
   * @returns {void}
   */
  const planScan = (filePath, name, skip = {}) => {
    let names = scanPlan.get(filePath)
    if (!names) {
      names = new Map()
      scanPlan.set(filePath, names)
    }
    const entry = names.get(name) ?? { lines: new Set(), ranges: [], aliases: new Set() }
    for (const line of skip.lines ?? []) {
      if (Number.isInteger(line) && line > 0) entry.lines.add(line)
    }
    for (const alias of skip.aliases ?? []) {
      if (typeof alias === 'string' && alias && alias !== name) entry.aliases.add(alias)
    }
    const range = skip.range
    if (Array.isArray(range) && range.length === 2
      && Number.isInteger(range[0]) && Number.isInteger(range[1])
      && range[0] >= 1 && range[1] >= range[0]
      && !entry.ranges.some(([start, end]) => start === range[0] && end === range[1])) {
      entry.ranges.push([range[0], range[1]])
    }
    names.set(name, entry)
  }

  const definitionFiles = new Set(selected.map(target => target.path))
  for (const target of selected) {
    const importers = usageImporters(edges, target, files)
    importersByTarget.set(targetKey(target), importers)
    // 定义文件也扫描（局部调用/同文件使用），定义本身的范围跳过
    planScan(target.path, target.name, {
      range: Number.isInteger(target.line)
        ? [
          target.line,
          Number.isInteger(target.endLine) && target.endLine >= target.line ? target.endLine : target.line,
        ]
        : null,
    })
    for (const importer of importers) {
      planScan(importer.path, target.name, { lines: importer.importLines, aliases: importer.names })
    }
  }
  /** @type {Set<string>} */
  const importerPaths = new Set()
  for (const importers of importersByTarget.values()) {
    for (const importer of importers) importerPaths.add(importer.path)
  }
  const selection = selectUsageFiles([...importerPaths].map(path => ({ path })))
  // 定义文件不计入 20 个导入方文件上限（最多 5 个，单独读取）
  const selectedFiles = new Set([...definitionFiles, ...selection.scanned])
  const skippedFiles = new Set([...importerPaths].filter(path => !selectedFiles.has(path)))
  /** @type {Map<string, Array<{path:string, line:number, text:string}>>} */
  const sitesByName = new Map()
  /** @type {Map<string, Set<string>>} */
  const scannedByName = new Map()
  /** @type {Map<string, string[]>} */
  const unreadableByName = new Map()
  /** @type {Set<string>} */
  const truncatedNames = new Set()
  let budget = MAX_USAGE_ENTRIES

  // 定义文件优先，其次按路径排序的具名导入方
  const scanOrder = [
    ...[...definitionFiles].sort(),
    ...selection.scanned.filter(path => !definitionFiles.has(path)),
  ]
  for (const path of scanOrder) {
    const names = scanPlan.get(path)
    if (!names) continue
    let source
    try {
      source = await fs.readText(await fs.resolve(path, { cwd: root }))
    } catch {
      for (const name of names.keys()) {
        const list = unreadableByName.get(name) ?? []
        list.push(path)
        unreadableByName.set(name, list)
      }
      continue
    }
    for (const [name, skip] of [...names.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const scanned = scannedByName.get(name) ?? new Set()
      scanned.add(path)
      scannedByName.set(name, scanned)
      if (budget <= 0) {
        truncatedNames.add(name)
        continue
      }
      const found = findSymbolUsages(source, name, {
        skipLines: skip.lines,
        skipRanges: skip.ranges,
        aliasNames: [...skip.aliases],
        limit: Math.min(MAX_USAGES_PER_SYMBOL, budget),
      })
      const sites = sitesByName.get(name) ?? []
      for (const site of found.usages) sites.push({ path, ...site })
      sitesByName.set(name, sites)
      budget -= found.usages.length
      if (found.truncated) truncatedNames.add(name)
    }
  }
  for (const target of selected) {
    const importers = importersByTarget.get(targetKey(target)) ?? []
    if (importers.some(importer => skippedFiles.has(importer.path))) truncatedNames.add(target.name)
  }

  const entries = selected.map(target => {
    const seen = new Set()
    const importers = []
    for (const importer of importersByTarget.get(targetKey(target)) ?? []) {
      const lines = Array.isArray(importer.importLines) && importer.importLines.length > 0
        ? importer.importLines
        : [undefined]
      for (const line of lines) {
        const key = `${importer.path}\u0000${line ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        importers.push({
          path: importer.path,
          ...(typeof line === 'number' ? { line } : {}),
        })
      }
    }
    return {
      path: target.path,
      symbol: target.name,
      importers,
      usages: sitesByName.get(target.name) ?? [],
      filesScanned: scannedByName.get(target.name)?.size ?? 0,
      unreadable: [...new Set(unreadableByName.get(target.name) ?? [])].sort(),
      truncated: truncatedNames.has(target.name),
    }
  })
  return { entries, skipped, skippedFiles: selection.skipped, truncated: truncatedNames.size > 0 }
}
