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
import { createHash } from 'node:crypto'
import { DIGEST_CHARS, SUPPORTED_LOCALES } from './schema.js'

/**
 * 计算文本内容指纹（sha256 前 DIGEST_CHARS 位十六进制）。
 * @param {string} text - 文件文本。
 * @param {number} [chars] - 截取位数（默认 DIGEST_CHARS）。
 * @returns {string} 指纹。
 */
export function digestText(text, chars = DIGEST_CHARS) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex').slice(0, chars)
}

/**
 * 取当前工作目录（ctx.workingDirectory 为可选服务，缺失时退回 process.cwd）。
 * @param {PluginContext} ctx - 插件上下文。
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
 * 归一多 locale 参数：过滤不支持的值、去重、保持调用顺序；
 * 为空时回退到单个默认 locale。
 * @param {unknown} value - 工具参数 locales（期望字符串数组）。
 * @param {string} fallback - 回退 locale（通常是 session locale）。
 * @returns {string[]} 至少包含一个受支持 locale 的数组。
 */
export function resolveLocales(value, fallback) {
  const out = []
  const list = Array.isArray(value) ? value : []
  for (const raw of list) {
    if (typeof raw !== 'string') continue
    const locale = raw.trim().toLowerCase()
    if (!SUPPORTED_LOCALES.includes(locale) || out.includes(locale)) continue
    out.push(locale)
  }
  if (out.length === 0) {
    out.push(SUPPORTED_LOCALES.includes(fallback) ? fallback : SUPPORTED_LOCALES[0])
  }
  return out
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
 * 写入文本并回读校验（ctx.fs 无 rename，无法保证真原子；用于发现截断/后端异常）。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {object} target - fs.resolve 返回的目标句柄。
 * @param {string} text - 待写入文本。
 * @returns {Promise<object>} 原样返回目标句柄。
 * @throws {Error} 回读失败或内容不一致时抛出（错误信息含 displayPath）。
 */
export async function writeTextVerified(fs, target, text) {
  await fs.writeText(target, text)
  const label = target?.displayPath ?? target?.targetKey ?? '(unknown)'
  let back
  try {
    back = await fs.readText(target)
  } catch (err) {
    throw new Error(`write verification failed: ${label} (${err?.message ?? 'unreadable'})`, { cause: err })
  }
  if (back !== text) {
    throw new Error(`write verification failed: ${label} (content mismatch)`)
  }
  return target
}

/**
 * 可取消的延时（模型调用重试退避共用）。
 * @param {number} ms - 延时毫秒。
 * @param {AbortSignal} [signal] - 取消信号；中止时立即 resolve。
 * @returns {Promise<void>} 延时结束的 Promise。
 */
export function delayWithSignal(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(); return }
    let done = false
    /**
     * 结束延时并清理监听。
     * @returns {void}
     */
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal?.addEventListener?.('abort', finish, { once: true })
  })
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
