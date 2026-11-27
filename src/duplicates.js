// @ts-check
/**
 * 重复代码检测（纯函数）。
 *
 * 对每个文件的归一化行序列生成固定窗口指纹（默认 8 行），同一窗口在
 * 多个文件中出现即为重复候选；相邻窗口合并为更长的重复块。只做行级
 * 指纹，不做语义等价判断——它是"值得人工复核的重复线索"，不是精确
 * 克隆检测。
 */

/** 重复块的默认窗口行数。 */
export const DUPLICATE_WINDOW_LINES = 8

/** 返回的重复块组数上限。 */
export const MAX_DUPLICATE_GROUPS = 20

/** 每组返回的位置数上限。 */
export const MAX_DUPLICATE_OCCURRENCES = 5

/** 参与检测的文件数上限。 */
export const MAX_DUPLICATE_FILES = 150

/** 单文件参与检测的行数上限（超出则跳过该文件）。 */
export const MAX_DUPLICATE_LINES_PER_FILE = 400

/**
 * 归一化一行：去首尾空白、把连续空白压缩为单个空格。
 * @param {unknown} line - 原始行。
 * @returns {string} 归一化行。
 */
export function normalizeDuplicateLine(line) {
  return String(line ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * FNV-1a 32 位哈希（零依赖，确定性）。
 * @param {string} text - 待哈希文本。
 * @returns {number} 无符号 32 位哈希。
 */
function hashString(text) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/**
 * 检测跨文件重复行窗口。
 * @param {Array<{path:string, text:string}>} sources - 文件路径与源码文本。
 * @param {{windowLines?:number, maxGroups?:number, maxOccurrences?:number,
 *   maxFiles?:number, maxLinesPerFile?:number}} [opts] - 可选上限覆盖。
 * @returns {{total:number, windowLines:number, filesScanned:number, filesSkipped:number,
 *   groups:Array<{lines:number, occurrences:Array<{path:string, start:number, end:number}>}>}}
 *   检测结果：`total` 为合并后的重复块组数（精确），`groups` 有界。
 */
export function findDuplicates(sources, opts = {}) {
  const windowLines = Number.isInteger(opts.windowLines) && opts.windowLines > 0
    ? opts.windowLines
    : DUPLICATE_WINDOW_LINES
  const maxGroups = Number.isInteger(opts.maxGroups) && opts.maxGroups > 0
    ? opts.maxGroups
    : MAX_DUPLICATE_GROUPS
  const maxOccurrences = Number.isInteger(opts.maxOccurrences) && opts.maxOccurrences > 0
    ? opts.maxOccurrences
    : MAX_DUPLICATE_OCCURRENCES
  const maxFiles = Number.isInteger(opts.maxFiles) && opts.maxFiles > 0
    ? opts.maxFiles
    : MAX_DUPLICATE_FILES
  const maxLinesPerFile = Number.isInteger(opts.maxLinesPerFile) && opts.maxLinesPerFile > 0
    ? opts.maxLinesPerFile
    : MAX_DUPLICATE_LINES_PER_FILE

  /** @type {Map<number, Map<string, number[]>>} 哈希 → 文件 → 窗口起始行（0-based）。 */
  const byHash = new Map()
  let filesScanned = 0
  let filesSkipped = 0

  for (const source of sources) {
    if (typeof source?.path !== 'string' || typeof source?.text !== 'string') continue
    if (filesScanned >= maxFiles) {
      filesSkipped++
      continue
    }
    const lines = source.text.replace(/\r\n?/g, '\n').split('\n')
    if (lines.length > maxLinesPerFile) {
      filesSkipped++
      continue
    }
    const normalized = lines.map(normalizeDuplicateLine)
    filesScanned++
    if (normalized.length < windowLines) continue
    for (let start = 0; start + windowLines <= normalized.length; start++) {
      let buffer = ''
      let blank = true
      for (let offset = 0; offset < windowLines; offset++) {
        const line = normalized[start + offset]
        if (line !== '') blank = false
        buffer += line + '\n'
      }
      if (blank) continue
      const hash = hashString(buffer)
      let byPath = byHash.get(hash)
      if (!byPath) {
        byPath = new Map()
        byHash.set(hash, byPath)
      }
      let starts = byPath.get(source.path)
      if (!starts) {
        starts = []
        byPath.set(source.path, starts)
      }
      starts.push(start)
    }
  }

  // 每个哈希取每个文件的最小起始位置，并按路径排序作为该窗口的代表。
  /** @type {Array<{entries:Array<{path:string, start:number}>}>} */
  const records = []
  for (const byPath of byHash.values()) {
    if (byPath.size < 2) continue
    const entries = [...byPath.entries()]
      .map(([path, starts]) => ({ path, start: starts[0] }))
      .sort((a, b) => a.path.localeCompare(b.path) || a.start - b.start)
    records.push({ entries })
  }
  records.sort((a, b) => {
    const first = a.entries[0].path.localeCompare(b.entries[0].path)
    if (first !== 0) return first
    const start = a.entries[0].start - b.entries[0].start
    if (start !== 0) return start
    return a.entries[1].path.localeCompare(b.entries[1].path)
  })

  // 相邻窗口（同一文件集合、每个文件起点都恰好 +1）合并为一个重复块。
  /** @type {Array<{signature:string, entries:Array<{path:string, start:number}>, windows:number}>} */
  const merged = []
  for (const record of records) {
    const signature = record.entries.map(entry => entry.path).join('|')
    const last = merged[merged.length - 1]
    const continues = last
      && last.signature === signature
      && record.entries.every((entry, index) => entry.start === last.entries[index].start + last.windows)
    if (continues) {
      last.windows++
    } else {
      merged.push({ signature, entries: record.entries, windows: 1 })
    }
  }

  /** @type {Array<{lines:number, occurrences:Array<{path:string, start:number, end:number}>}>} */
  const groups = []
  for (const group of merged) {
    const lines = group.windows + windowLines - 1
    groups.push({
      lines,
      occurrences: group.entries.slice(0, maxOccurrences).map(entry => ({
        path: entry.path,
        start: entry.start + 1,
        end: entry.start + lines,
      })),
    })
  }
  return {
    total: merged.length,
    windowLines,
    filesScanned,
    filesSkipped,
    groups: groups.slice(0, maxGroups),
  }
}
