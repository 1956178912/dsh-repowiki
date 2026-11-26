/**
 * 工具函数：各模块重复的公共逻辑（DRY 抽取）。
 *
 * - cwdOf：原在 8 个工具文件中各写一份（ctx.workingDirectory 可选服务降级）。
 * - toAbsPath：原在 tool-export/tool-import 中各写一份（含 POSIX 分隔符归一）。
 * - encodeFrontmatter/parseFrontmatter：原在 render.js、knowledge.js、
 *   memory.js 三处序列化同构、两处解析同构（均 JSON + --- 分隔，仅
 *   schemaVersion 常量不同）。行为与原实现完全一致。
 */

import * as path from 'node:path'

/**
 * 取当前工作目录（ctx.workingDirectory 为可选服务，缺失时退回 process.cwd）。
 * @param {object} ctx - 插件上下文。
 * @returns {string} 当前目录绝对路径。
 */
export function cwdOf(ctx) {
  const wd = ctx.workingDirectory
  if (wd && typeof wd.get === 'function') {
    try { return wd.get() } catch { /* 降级到 process.cwd */ }
  }
  return process.cwd()
}

/**
 * 把目标路径参数解析为绝对路径（相对路径相对会话 cwd），并归一为
 * POSIX 分隔符（资产相对路径约定一律正斜杠）。
 * @param {string} target - 目标路径参数。
 * @param {string} cwd - 会话当前目录绝对路径。
 * @returns {string} 绝对路径（POSIX 分隔符）。
 */
export function toAbsPath(target, cwd) {
  const trimmed = String(target).trim()
  const abs = path.isAbsolute(trimmed) ? trimmed : path.join(cwd, trimmed)
  return abs.split(path.sep).join('/')
}

/**
 * 把元数据序列化为 frontmatter 块（JSON + --- 分隔；零依赖解析、Git diff 清晰）。
 * @param {object} meta - 元数据。
 * @returns {string} frontmatter 文本（含首尾分隔符行）。
 */
export function encodeFrontmatter(meta) {
  return `---\n${JSON.stringify(meta, null, 2)}\n---\n`
}

/**
 * 解析 JSON frontmatter 与正文（与 encodeFrontmatter 互逆）。
 * @param {string} text - 文件内容（首行须为 ---）。
 * @param {number} [schemaVersion] - 期望的 schemaVersion；提供且不符时返回 null。
 * @returns {{meta:object, body:string}|null} 无 frontmatter / 非 JSON / 版本不符返回 null。
 */
export function parseFrontmatter(text, schemaVersion) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)
  if (!m) return null
  try {
    const meta = JSON.parse(m[1])
    if (typeof meta !== 'object' || meta === null) return null
    if (schemaVersion !== undefined && meta.schemaVersion !== schemaVersion) return null
    return { meta, body: m[2] }
  } catch {
    return null
  }
}
