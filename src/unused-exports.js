// @ts-check
/**
 * 未被内部引用的导出（保守检测，纯函数）。
 *
 * 只回答"导出符号没有任何具名 import 证据"，不宣称死代码：公共 API、
 * 入口文件、默认导出、动态导入与测试专用导出都可能是合法的。为了不把
 * "无法判断"当成"未使用"，只审计满足以下条件的文件：
 * - 至少有一条入边；
 * - 所有入边都带具名符号（默认导入、副作用导入、C/Go 等无符号级导入
 *   信息的引用会让该文件整体跳过）。
 * 无入边的文件（可能是入口或被外部消费）同样跳过，并计入 skippedFiles。
 */

/** 返回的文件数上限。 */
export const MAX_UNUSED_FILES = 10

/** 每个文件返回的符号数上限。 */
export const MAX_UNUSED_SYMBOLS_PER_FILE = 10

/**
 * 索引文件条目（本模块只读取 path 与 symbols）。
 * @typedef {{path:string, symbols?:Array<{name?:string, kind?:string, line?:number, exported?:boolean}>}} UnusedIndexFile
 */

/**
 * 索引边（本模块只读取 from/to/symbols）。
 * @typedef {{from:string, to:string, symbols?:string[]}} UnusedIndexEdge
 */

/**
 * 计算未被内部具名导入的导出符号。
 * @param {{files?:UnusedIndexFile[], edges?:UnusedIndexEdge[]}} index - 索引文档。
 * @param {{maxFiles?:number, maxSymbolsPerFile?:number}} [options] - 明细上限。
 * @returns {{total:number, exportedTotal:number, skippedFiles:number,
 *   files:Array<{path:string, symbols:Array<{name:string, kind:string, line:number}>}>,
 *   truncated:boolean}} 统计与有界明细。
 */
export function unusedExports(index, options = {}) {
  const maxFiles = Number.isInteger(options.maxFiles) && options.maxFiles > 0
    ? Math.floor(options.maxFiles)
    : MAX_UNUSED_FILES
  const maxSymbols = Number.isInteger(options.maxSymbolsPerFile) && options.maxSymbolsPerFile > 0
    ? Math.floor(options.maxSymbolsPerFile)
    : MAX_UNUSED_SYMBOLS_PER_FILE
  /** @type {Map<string, {named:Set<string>, unnamed:boolean}>} */
  const inbound = new Map()
  for (const edge of Array.isArray(index?.edges) ? index.edges : []) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.from === edge.to) continue
    let entry = inbound.get(edge.to)
    if (!entry) {
      entry = { named: new Set(), unnamed: false }
      inbound.set(edge.to, entry)
    }
    const names = (Array.isArray(edge.symbols) ? edge.symbols : [])
      .filter(name => typeof name === 'string' && name.length > 0)
    if (names.length === 0) entry.unnamed = true
    for (const name of names) entry.named.add(name)
  }

  let total = 0
  let exportedTotal = 0
  let skippedFiles = 0
  /** @type {Array<{path:string, symbols:Array<{name:string, kind:string, line:number}>, hidden:number}>} */
  const files = []
  const sortedFiles = [...(Array.isArray(index?.files) ? index.files : [])]
    .filter(file => file && typeof file.path === 'string')
    .sort((a, b) => a.path.localeCompare(b.path))
  for (const file of sortedFiles) {
    const exported = (file.symbols ?? []).filter(symbol => symbol
      && symbol.exported === true
      && typeof symbol.name === 'string'
      && symbol.name.length > 0
      && symbol.name !== 'default')
    if (exported.length === 0) continue
    const entry = inbound.get(file.path)
    if (!entry || entry.unnamed) {
      skippedFiles++
      continue
    }
    exportedTotal += exported.length
    const unused = exported
      .filter(symbol => !entry.named.has(symbol.name))
      .map(symbol => ({
        name: symbol.name,
        kind: typeof symbol.kind === 'string' ? symbol.kind : '',
        line: Number.isInteger(symbol.line) && symbol.line > 0 ? symbol.line : 0,
      }))
      .sort((a, b) => a.line - b.line || a.name.localeCompare(b.name))
    if (unused.length === 0) continue
    total += unused.length
    files.push({
      path: file.path,
      symbols: unused.slice(0, maxSymbols),
      hidden: Math.max(0, unused.length - maxSymbols),
    })
  }
  return {
    total,
    exportedTotal,
    skippedFiles,
    files: files.slice(0, maxFiles),
    truncated: files.length > maxFiles || files.some(file => file.hidden > 0),
  }
}
