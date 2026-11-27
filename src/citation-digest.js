// @ts-check
/**
 * Wiki 引用内容指纹（纯函数）。
 *
 * 生成 Wiki 时把被引用行范围的内容摘要写入清单；状态工具在后续读取时
 * 重新计算并比较，用于发现"文件还在、行号仍有效，但被引用代码已经变化"
 * 的文档漂移。行号语义与索引一致：空文件 0 行，结尾换行不额外产生一行。
 */

import { digestText } from './util.js'

/**
 * 截取 1-based 闭区间的源码行；非法范围返回 null。
 * @param {string} text - 文件全文。
 * @param {number} start - 起始行（1-based）。
 * @param {number} [end] - 结束行（默认与 start 相同）。
 * @returns {string|null} 截取内容（不含末尾换行）；非法范围返回 null。
 */
export function citationLineSlice(text, start, end = start) {
  const source = String(text ?? '')
  if (source === '') return null
  if (!Number.isInteger(start) || start < 1) return null
  const finish = Number.isInteger(end) ? end : start
  if (finish < start) return null
  const lines = source.split('\n')
  // 与 countSourceLines 对齐：结尾换行不额外算一行
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  if (start > lines.length || finish > lines.length) return null
  return lines.slice(start - 1, finish).join('\n')
}

/**
 * 计算引用的内容指纹：带行号时截取范围，无行号时使用全文；非法范围返回 null。
 * @param {string} text - 文件全文。
 * @param {number} [start] - 起始行；省略表示整文件引用。
 * @param {number} [end] - 结束行。
 * @returns {string|null} sha256-12 指纹；非法范围返回 null。
 */
export function citationDigest(text, start, end) {
  const source = String(text ?? '')
  if (Number.isInteger(start)) {
    const slice = citationLineSlice(source, start, end)
    return slice === null ? null : digestText(slice)
  }
  return digestText(source)
}
