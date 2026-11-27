/**
 * 资产导入导出的文件传输层（Phase 3 §导入导出）。
 *
 * 形态为目录快照拷贝（无压缩、无第三方归档格式）：导出把
 * <root>/.dsh-repowiki/** 原样复制到目标目录；导入把源目录内容
 * 原样复制回 <root>/.dsh-repowiki/。对称、可读、可直接检查，
 * 且完全经 ctx.fs（跨后端一致：local / sandbox / SSH）。
 *
 * 目标路径策略：相对路径相对会话 cwd（落在工作区内最安全）；绝对
 * 路径按后端策略尝试，越界写由 fs 后端拒绝并经错误码上浮（工具层
 * 转成可读提示，不吞错）。
 */

import * as path from 'node:path'

/**
 * 资产目录里允许复制的文本扩展名（资产本身只含 md/json；其余文件
 * 计入 skipped，避免把二进制或临时垃圾带进快照）。
 */
const TEXT_EXTENSIONS = new Set(['.md', '.json'])

/**
 * 递归复制目录树（仅文本资产文件）。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} srcAbs - 源目录绝对路径。
 * @param {string} dstAbs - 目标目录绝对路径。
 * @param {{signal?:AbortSignal}} [opts] - 协作式取消信号。
 * @returns {Promise<{files:number, dirs:number, skipped:number, failed:Array, aborted:boolean}>} 复制计数。
 * failed 为失败明细（path+reason，最多 20 条），满 20 条后只累计 skipped
 * 不再收集明细——用户不必猜"N skipped"到底是哪些文件、为什么。
 */
export async function copyTree(fs, srcAbs, dstAbs, opts = {}) {
  const counts = { files: 0, dirs: 0, skipped: 0, failed: [], aborted: false }
  const signal = opts.signal
  /** 记一条失败明细（有界收集，skipped 同步递增）。 */
  const noteFailed = (item, reason) => {
    counts.skipped++
    if (counts.failed.length < 20) counts.failed.push({ path: item, reason })
  }
  // 目录深度上限（与 indexer 一致）：用户提供的快照可能含超深树或环，
  // 无上限递归会栈溢出
  const MAX_DEPTH = 24

  /**
   * 单层遍历复制。
   * @param {string} srcDir - 源目录绝对路径。
   * @param {string} dstDir - 目标目录绝对路径。
   * @param {number} depth - 当前深度。
   */
  const walk = async (srcDir, dstDir, depth = 0) => {
    if (counts.aborted) return
    if (signal?.aborted) { counts.aborted = true; return }
    if (depth > MAX_DEPTH) { noteFailed(srcDir, `max depth ${MAX_DEPTH} exceeded`); return }
    let entries
    try {
      const target = await fs.resolve(srcDir)
      entries = await fs.listDir(target)
    } catch (err) {
      noteFailed(srcDir, err?.message ?? 'unreadable directory')
      return // 不可读目录跳过，不阻断整体复制
    }
    for (const entry of entries) {
      if (signal?.aborted) { counts.aborted = true; return }
      if (entry.type === 'directory') {
        counts.dirs++
        await walk(entry.target.displayPath, path.posix.join(dstDir, entry.name), depth + 1)
      } else if (entry.type === 'file') {
        const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
        if (!TEXT_EXTENSIONS.has(ext)) {
          counts.skipped++
          continue
        }
        try {
          const text = await fs.readText(entry.target)
          const outTarget = await fs.resolve(path.posix.join(dstDir, entry.name))
          await fs.writeText(outTarget, text)
          counts.files++
        } catch (err) {
          noteFailed(`${dstDir}/${entry.name}`, err?.message ?? 'copy failed') // 不阻断
        }
      }
    }
  }

  await walk(srcAbs, dstAbs)
  return counts
}

/**
 * 判断目录是否存在且非空（导入导出的覆盖保护判定依据）。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} dirAbs - 目录绝对路径。
 * @returns {Promise<boolean>} 存在且非空为 true。
 */
export async function dirHasContent(fs, dirAbs) {
  try {
    const target = await fs.resolve(dirAbs)
    const info = await fs.stat(target)
    if (info?.type !== 'directory') return false
    const entries = await fs.listDir(target)
    return entries.length > 0
  } catch {
    return false
  }
}
