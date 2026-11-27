// @ts-check
/**
 * 进程内资产锁（O5）：同一资产根上的写操作串行化。
 *
 * 背景：phase-16 独立代码评审的 O5 指出，8 个工具共享同一份 ctx.fs 资产树，
 * 宿主一旦并发调用工具（并行工具调用、或多会话落在同一目录），读-改-写
 * 之间会交错：两次 repowiki-index 并发会各自读旧索引再互相覆盖；memory
 * 的 accept/reject 并发会丢掉一次状态写。评审当时按“单会话顺序调用”的
 * 假设接受（v0.32.0）；本模块把该假设从约定升级为机制（v0.43.0，决策见
 * ADR-0005）。
 *
 * 语义：
 * - 互斥维度是解析出的资产根绝对路径；同根写操作严格按到达顺序排队，
 *   不同根互不阻塞（多仓库并行不受影响）。
 * - 读侧（repowiki-cards 检索、repowiki-export 快照）不加锁，保持只读
 *   路径即时；其并发可见性与既有的 O3 快照语义一致。
 * - 错误隔离：链尾吞错，前一位持有者抛错不会污染后续等待者；错误仍原样
 *   透传给调用方。
 * - 队列排空后清理 Map 条目，避免随历史资产根无界增长。
 *
 * 边界（见 ADR-0005 已知限制）：仅覆盖本插件进程内的并发；不跨进程、
 * 不替代 fs 层的原子性；排队中的工具不感知取消信号（锁释放后其函数体
 * 仍会执行，长跑工具依赖自身已有的逐项 abort 检查）。
 */

import { resolveAssetRoot } from './assets.js'

/** key -> 永不 reject 的链尾 Promise（队列为空时条目被清理）。 */
const chains = new Map()

/**
 * 按 key 串行执行 fn；对同一 key 的并发调用按到达顺序排队。
 * @param {string} key - 互斥维度（资产根绝对路径）。
 * @param {() => (Promise<T> | T)} fn - 临界区函数（可为 async）。
 * @returns {Promise<T>} fn 的返回值；fn 抛错原样透传给调用方。
 * @template T
 */
export function withLock(key, fn) {
  const prev = chains.get(key) ?? Promise.resolve()
  const run = (async () => {
    await prev
    return fn()
  })()
  // 链尾吞错：后续等待者只看到“前序已结束”，不会被旧失败带偏；
  // run 本身保持原始 settle 结果，调用方照常拿到自己的错误。
  const tail = run.then(() => {}, () => {})
  tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key)
  })
  chains.set(key, tail)
  return run
}

/**
 * 解析资产根后在根上加锁执行 fn。
 *
 * root 解析（向上查找 .dsh-repowiki/）本身是只读的，不加锁；互斥从解析
 * 结果返回之后开始。定位对象随 fn 传入，避免调用方再解析一次。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} startDir - 定位起点（args.root 或会话 cwd）。
 * @param {(loc: {root: string, assetDir: string, created: boolean}) => (Promise<T> | T)} fn - 临界区。
 * @returns {Promise<T>} fn 的返回值。
 * @template T
 */
export async function withAssetRootLock(fs, startDir, fn) {
  const loc = await resolveAssetRoot(fs, startDir)
  return withLock(loc.root, () => fn(loc))
}

/**
 * 诊断/测试用：当前仍持有或仍有等待者的资产根数量。
 * @returns {number} chains 条目数。
 */
export function pendingLocks() {
  return chains.size
}
