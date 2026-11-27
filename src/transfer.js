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
import { digestText, writeTextVerified } from './util.js'

/**
 * 资产目录里允许复制的文本扩展名（资产本身只含 md/json；其余文件
 * 计入 skipped，避免把二进制或临时垃圾带进快照）。
 */
const TEXT_EXTENSIONS = new Set(['.md', '.json'])

/** 快照清单文件名（位于快照根，导入时跳过，不进入资产目录）。 */
export const SNAPSHOT_MANIFEST = '_snapshot.json'

/** 快照清单 schemaVersion。 */
export const SNAPSHOT_SCHEMA_VERSION = 1

/** 校验快照时最多比对的文件数（覆盖 5000 文件仓库的卡片 + Wiki；防止异常清单放大 IO）。 */
const MAX_SNAPSHOT_VERIFY = 20_000

/** 快照校验的并发读取上限（远程工作区按 RTT 累积，串行会明显变慢）。 */
const SNAPSHOT_VERIFY_CONCURRENCY = 8

/**
 * 递归复制目录树（仅文本资产文件）。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} srcAbs - 源目录绝对路径。
 * @param {string} dstAbs - 目标目录绝对路径。
 * @param {{signal?:AbortSignal, exclude?:Set<string>}} [opts] - 协作式取消信号与
 *   按文件名跳过的条目（导入时用于跳过快照清单本身）。
 * @returns {Promise<{files:number, dirs:number, skipped:number, failed:Array,
 *   entries:Array<{path:string, digest:string}>, aborted:boolean}>} 复制计数；
 *   entries 为复制成功的文件及其内容指纹（相对目标根，供快照清单/校验）。
 * failed 为失败明细（path+reason，最多 20 条），满 20 条后只累计 skipped
 * 不再收集明细——用户不必猜"N skipped"到底是哪些文件、为什么。
 */
export async function copyTree(fs, srcAbs, dstAbs, opts = {}) {
  const counts = { files: 0, dirs: 0, skipped: 0, failed: [], entries: [], aborted: false }
  const signal = opts.signal
  const excludeNames = opts.exclude instanceof Set ? opts.exclude : new Set()
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
   * @param {string} relDir - 相对快照根的 POSIX 目录（根为空）。
   * @param {number} depth - 当前深度。
   */
  const walk = async (srcDir, dstDir, relDir = '', depth = 0) => {
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
      if (excludeNames.has(entry.name)) continue
      if (entry.type === 'directory') {
        counts.dirs++
        await walk(
          entry.target.displayPath,
          path.posix.join(dstDir, entry.name),
          path.posix.join(relDir, entry.name),
          depth + 1,
        )
      } else if (entry.type === 'file') {
        const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
        if (!TEXT_EXTENSIONS.has(ext)) {
          counts.skipped++
          continue
        }
        try {
          const text = await fs.readText(entry.target)
          const outTarget = await fs.resolve(path.posix.join(dstDir, entry.name))
          // 写后回读校验：快照是备份/迁移载体，后端截断或写坏必须当场
          // 记为失败，而不是等导入时才发现内容不一致。
          await writeTextVerified(fs, outTarget, text)
          counts.files++
          counts.entries.push({
            path: path.posix.join(relDir, entry.name),
            digest: digestText(text, 16),
          })
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
 * 写入快照清单（覆盖或新建）。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} dirAbs - 快照根目录绝对路径。
 * @param {Array<{path:string, digest:string}>} entries - copyTree 复制的文件。
 * @param {{partial?:boolean}} [opts] - partial 表示导出取消或有复制失败。
 * @returns {Promise<object>} 写入的清单对象。
 */
export async function writeSnapshotManifest(fs, dirAbs, entries, opts = {}) {
  const files = [...entries]
    .map(item => ({ path: item.path, digest: item.digest }))
    .sort((a, b) => a.path.localeCompare(b.path))
  const manifest = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    count: files.length,
    partial: opts.partial === true,
    files,
  }
  const target = await fs.resolve(SNAPSHOT_MANIFEST, { cwd: dirAbs })
  await writeTextVerified(fs, target, JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

/**
 * 读取快照清单；缺失/损坏分开报告（损坏不抛错）。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} dirAbs - 快照根目录绝对路径。
 * @returns {Promise<{exists:boolean, value:object|null, error:string}>} 读取结果。
 */
export async function readSnapshotManifest(fs, dirAbs) {
  try {
    const target = await fs.resolve(SNAPSHOT_MANIFEST, { cwd: dirAbs })
    const text = await fs.readText(target)
    try {
      return { exists: true, value: JSON.parse(text), error: '' }
    } catch (err) {
      return { exists: true, value: null, error: err?.message ?? 'invalid JSON' }
    }
  } catch (err) {
    const missing = err?.code === 'ENOENT' || /not found/i.test(err?.message ?? '')
    return { exists: !missing, value: null, error: missing ? '' : (err?.message ?? String(err)) }
  }
}

/**
 * 校验快照清单与实际文件的一致性（只读；默认上限 20000 个文件、8 路并发）。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} dirAbs - 快照根目录绝对路径。
 * @param {object} manifest - readSnapshotManifest 的 value。
 * @param {{limit?:number}} [opts] - 覆盖比对上限（仅测试/特殊场景使用）。
 * @returns {Promise<{verified:boolean, checked:number, mismatched:number,
 *   missing:number, unreadable:number, invalid:number, capped:boolean,
 *   partial:boolean, mismatchedPaths:string[], missingPaths:string[]}>} 校验结果。
 */
export async function verifySnapshot(fs, dirAbs, manifest, opts = {}) {
  const limit = Number.isInteger(opts.limit) && opts.limit > 0
    ? opts.limit
    : MAX_SNAPSHOT_VERIFY
  const result = {
    verified: false,
    checked: 0,
    mismatched: 0,
    missing: 0,
    unreadable: 0,
    invalid: 0,
    capped: false,
    partial: manifest?.partial === true,
    mismatchedPaths: [],
    missingPaths: [],
  }
  const files = Array.isArray(manifest?.files) ? manifest.files : []
  const safe = []
  const seen = new Set()
  for (const item of files) {
    if (!item || typeof item.path !== 'string' || typeof item.digest !== 'string') {
      result.invalid++
      continue
    }
    const rel = item.path.replace(/\\/g, '/')
    if (!rel || rel.startsWith('/') || rel.split('/').includes('..') || seen.has(rel)) {
      result.invalid++
      continue
    }
    seen.add(rel)
    safe.push({ path: rel, digest: item.digest })
  }
  // 有界并发：结果写入固定槽位，聚合仍按清单顺序，输出可复现。
  const candidates = safe.slice(0, limit)
  result.capped = safe.length > limit
  /** @type {Array<'ok'|'mismatched'|'missing'|'unreadable'>} */
  const outcomes = new Array(candidates.length)
  let cursor = 0
  const worker = async () => {
    while (true) {
      const index = cursor++
      if (index >= candidates.length) return
      const item = candidates[index]
      let text
      try {
        const target = await fs.resolve(item.path, { cwd: dirAbs })
        text = await fs.readText(target)
      } catch (err) {
        outcomes[index] = (err?.code === 'ENOENT' || /not found/i.test(err?.message ?? ''))
          ? 'missing'
          : 'unreadable'
        continue
      }
      outcomes[index] = digestText(text, 16) === item.digest ? 'ok' : 'mismatched'
    }
  }
  await Promise.all(Array.from(
    { length: Math.max(1, Math.min(SNAPSHOT_VERIFY_CONCURRENCY, candidates.length)) },
    () => worker(),
  ))
  for (let index = 0; index < outcomes.length; index++) {
    const outcome = outcomes[index]
    const item = candidates[index]
    if (outcome === 'missing') {
      result.missing++
      if (result.missingPaths.length < 5) result.missingPaths.push(item.path)
      continue
    }
    if (outcome === 'unreadable') {
      result.unreadable++
      continue
    }
    result.checked++
    if (outcome === 'mismatched') {
      result.mismatched++
      if (result.mismatchedPaths.length < 5) result.mismatchedPaths.push(item.path)
    }
  }
  result.verified = !result.capped && !result.partial
    && result.invalid === 0 && result.missing === 0
    && result.unreadable === 0 && result.mismatched === 0
  return result
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
