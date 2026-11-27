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
 * @param {{skipLines?:Iterable<number>, limit?:number}} [options] - 需排除的
 *   行号（1 起）与返回上限。
 * @returns {{usages:Array<{line:number, text:string}>, truncated:boolean}}
 *   使用点与截断标记。
 */
export function findSymbolUsages(source, symbolName, options = {}) {
  const name = String(symbolName ?? '')
  if (!name) return { usages: [], truncated: false }
  const limit = Number.isInteger(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : MAX_USAGES_PER_SYMBOL
  const skip = new Set()
  for (const line of options.skipLines ?? []) {
    if (Number.isInteger(line) && line > 0) skip.add(line)
  }
  // 通用标识符字符集：JS/PHP 的 `$`、Python/Go/Rust 的 `_` 均覆盖。
  const pattern = new RegExp(`(^|[^A-Za-z0-9_$])${escapeRegExp(name)}($|[^A-Za-z0-9_$])`)
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
    if (skip.has(number) || line.trim() === '' || isCommentLine(line)) continue
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
 * 引用同文件其他符号的边不属于本符号的使用者。自引用忽略。
 * @param {Array<{from:string, to:string, line?:number, symbols?:string[]}>} edges
 *   index.json 的依赖边。
 * @param {{path:string, name:string}} symbol - 已解析的符号定义。
 * @returns {Array<{path:string, importLines:number[]}>} 按路径排序的依赖方。
 */
export function usageImporters(edges = [], symbol) {
  if (!symbol || typeof symbol.path !== 'string' || typeof symbol.name !== 'string') return []
  /** @type {Map<string, Set<number>>} */
  const byPath = new Map()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.to !== symbol.path || edge.from === symbol.path) continue
    const names = Array.isArray(edge.symbols) ? edge.symbols : []
    if (!names.includes(symbol.name)) continue
    let lines = byPath.get(edge.from)
    if (!lines) {
      lines = new Set()
      byPath.set(edge.from, lines)
    }
    if (Number.isInteger(edge.line) && edge.line > 0) lines.add(edge.line)
  }
  return [...byPath.entries()]
    .map(([path, lines]) => ({ path, importLines: [...lines].sort((a, b) => a - b) }))
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
