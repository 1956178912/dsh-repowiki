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
 * @param {object} fs - ctx.fs 服务。
 * @param {string} srcAbs - 源目录绝对路径。
 * @param {string} dstAbs - 目标目录绝对路径。
 * @returns {Promise<{files:number, dirs:number, skipped:number}>} 复制计数。
 */
export async function copyTree(fs, srcAbs, dstAbs) {
  const counts = { files: 0, dirs: 0, skipped: 0 }

  /**
   * 单层遍历复制。
   * @param {string} srcDir - 源目录绝对路径。
   * @param {string} dstDir - 目标目录绝对路径。
   */
  const walk = async (srcDir, dstDir) => {
    let entries
    try {
      const target = await fs.resolve(srcDir)
      entries = await fs.listDir(target)
    } catch {
      counts.skipped++
      return // 不可读目录跳过，不阻断整体复制
    }
    for (const entry of entries) {
      if (entry.type === 'directory') {
        counts.dirs++
        await walk(entry.target.displayPath, path.posix.join(dstDir, entry.name))
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
        } catch {
          counts.skipped++ // 单文件失败（不可读/越界写）不阻断
        }
      }
    }
  }

  await walk(srcAbs, dstAbs)
  return counts
}

/**
 * 判断目录是否存在且非空（导入导出的覆盖保护判定依据）。
 * @param {object} fs - ctx.fs 服务。
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
