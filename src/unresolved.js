// @ts-check
/**
 * 未解析相对导入检测（纯函数）。
 *
 * 索引保留每条 import 记录（specifier/行号/relative），边表保留成功解析
 * 的文件级依赖。对"以 `.` 开头的相对导入"而言，解析失败通常意味着坏
 * 路径、目标被排除或目标不是受支持的源码扩展名——这些是值得修复的
 * 信号。外部包（`react`、`serde`）不以 `.` 开头，不在本报告范围内。
 */

/** 明细条数上限（总数始终精确）。 */
export const MAX_UNRESOLVED_DETAILS = 50

/**
 * 找出未解析的相对导入。
 * @param {Array<{path:string, imports?:Array<{specifier:string, line:number, relative?:boolean}>}>} files
 *   索引文件条目。
 * @param {Array<{from:string, line?:number}>} edges - 已解析的依赖边。
 * @param {{limit?:number}} [opts] - 明细上限。
 * @returns {{total:number, checked:number, details:Array<{path:string, line:number, specifier:string}>}}
 *   统计结果：`checked` 为参与判定的相对导入数，`details` 有界。
 */
export function findUnresolvedImports(files, edges, opts = {}) {
  const limit = Number.isInteger(opts.limit) && opts.limit > 0
    ? opts.limit
    : MAX_UNRESOLVED_DETAILS
  /** @type {Set<string>} 已解析的「文件 + 行号」。 */
  const resolved = new Set()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || !Number.isInteger(edge.line)) continue
    resolved.add(`${edge.from}\u0000${edge.line}`)
  }
  const details = []
  let total = 0
  let checked = 0
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || !Array.isArray(file.imports)) continue
    for (const item of file.imports) {
      if (!item || typeof item.specifier !== 'string') continue
      if (item.relative !== true || !item.specifier.startsWith('.')) continue
      checked++
      if (!Number.isInteger(item.line)) continue
      if (resolved.has(`${file.path}\u0000${item.line}`)) continue
      total++
      if (details.length < limit) {
        details.push({ path: file.path, line: item.line, specifier: item.specifier })
      }
    }
  }
  return { total, checked, details }
}
