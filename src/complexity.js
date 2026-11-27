// @ts-check
/**
 * 函数级圈复杂度估算（纯函数）。
 *
 * 在索引给出的符号范围内按行统计分支关键字（行首 `if`/`for`/`while`/
 * `case`/`catch`/`when`/`elif`/`elseif`/`except`/`match` 等）与逻辑运算符
 * （`&&`/`||`）出现次数，复杂度 = 1 + 分支数。它是轻量启发式：注释与
 * 字符串内的关键字未做屏蔽，因此用于"找出值得复核的长分支函数"，而
 * 不是精确的 McCabe 值。
 */

/** 报告的高复杂度函数下限。 */
export const COMPLEXITY_THRESHOLD = 15

/** 高复杂度函数明细上限。 */
export const MAX_COMPLEXITY_ENTRIES = 10

/** 单文件参与统计的函数上限。 */
const MAX_FUNCTIONS_PER_FILE = 200

/** 参与统计的函数总数上限。 */
const MAX_FUNCTIONS_TOTAL = 2000

/** 行首分支关键字（大小写不敏感）。 */
const BRANCH_KEYWORD_RE = /^(?:if|for|while|case|catch|when|elif|elseif|except|match|reswitch)\b/i

/**
 * 统计一段源码内的分支数。
 * @param {string[]} lines - 源码行。
 * @param {number} startLine - 起始行（1-based，含）。
 * @param {number} endLine - 结束行（1-based，含）。
 * @returns {number} 分支计数。
 */
function countBranches(lines, startLine, endLine) {
  let branches = 0
  const start = Math.max(0, startLine - 1)
  const end = Math.min(lines.length - 1, endLine - 1)
  for (let index = start; index <= end; index++) {
    const line = lines[index]
    if (line === undefined) continue
    if (BRANCH_KEYWORD_RE.test(line.trim())) branches++
    // 逻辑运算符按出现次数计（同一行的短路组合也增加路径）
    for (let cursor = 0; cursor + 1 < line.length; cursor++) {
      const pair = line.slice(cursor, cursor + 2)
      if (pair === '&&' || pair === '||') branches++
    }
  }
  return branches
}

/**
 * 计算函数级复杂度。
 * @param {Array<{path:string, symbols?:Array}>} files - 索引文件条目。
 * @param {Array<{path:string, text:string}>} sources - 已读取的源码。
 * @param {{threshold?:number, limit?:number}} [opts] - 阈值与明细上限。
 * @returns {{total:number, threshold:number, average:number, max:number, highTotal:number,
 *   high:Array<{path:string, name:string, line:number, endLine:number, complexity:number}>}}
 *   统计结果：`total` 为参与统计的函数数，`highTotal` 为达到阈值的精确函数数，
 *   `high` 为有界明细。
 */
export function computeComplexity(files, sources, opts = {}) {
  const threshold = Number.isInteger(opts.threshold) && opts.threshold > 0
    ? opts.threshold
    : COMPLEXITY_THRESHOLD
  const limit = Number.isInteger(opts.limit) && opts.limit > 0
    ? opts.limit
    : MAX_COMPLEXITY_ENTRIES
  const textByPath = new Map()
  for (const source of sources) {
    if (typeof source?.path === 'string' && typeof source?.text === 'string') {
      textByPath.set(source.path, source.text)
    }
  }
  /** @type {Array<{path:string, name:string, line:number, endLine:number, complexity:number}>} */
  const high = []
  let total = 0
  let sum = 0
  let max = 0
  for (const file of files) {
    if (typeof file?.path !== 'string') continue
    const text = textByPath.get(file.path)
    if (text === undefined) continue
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
    const functions = (Array.isArray(file.symbols) ? file.symbols : [])
      .filter(symbol => symbol
        && (symbol.kind === 'function' || symbol.kind === 'method')
        && Number.isInteger(symbol.line) && Number.isInteger(symbol.endLine)
        && symbol.endLine >= symbol.line)
      .slice(0, MAX_FUNCTIONS_PER_FILE)
    for (const symbol of functions) {
      if (total >= MAX_FUNCTIONS_TOTAL) break
      const complexity = 1 + countBranches(lines, symbol.line, symbol.endLine)
      total++
      sum += complexity
      if (complexity > max) max = complexity
      if (complexity >= threshold) {
        high.push({
          path: file.path,
          name: String(symbol.name ?? ''),
          line: symbol.line,
          endLine: symbol.endLine,
          complexity,
        })
      }
    }
    if (total >= MAX_FUNCTIONS_TOTAL) break
  }
  high.sort((a, b) => b.complexity - a.complexity
    || a.path.localeCompare(b.path)
    || a.line - b.line)
  return {
    total,
    threshold,
    average: total > 0 ? Math.round((sum / total) * 100) / 100 : 0,
    max,
    // 明细有界，但调用方（健康分、架构基线）需要精确计数
    highTotal: high.length,
    high: high.slice(0, limit),
  }
}
