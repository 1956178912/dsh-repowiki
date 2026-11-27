/**
 * Git 元数据读取（只读、零子进程、零依赖）。
 *
 * 设计目标：在不执行 `git` 命令的前提下，为索引提供"这份知识库对应哪个
 * 分支/提交"的溯源信息。只解析 `.git/HEAD` 与引用文件，覆盖：
 * - 普通仓库（.git 目录）；
 * - worktree / submodule（.git 为 `gitdir: <path>` 文件）；
 * - 松散引用与 packed-refs（含 commondir 回退）；
 * - detached HEAD（HEAD 直接是提交哈希）。
 *
 * 任何一步失败都返回 null：Git 元数据是增强信息，缺失不应阻断索引。
 */

import * as path from 'node:path'

/** 提交哈希形态（sha1 40 位 / sha256 64 位）。 */
const HASH_PATTERN = /^[0-9a-f]{40,64}$/i

/**
 * 读取文本文件；不存在/不可读返回 null。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} absPath - 绝对路径。
 * @returns {Promise<string|null>} 文件内容。
 */
async function readIfExists(fs, absPath) {
  try {
    return await fs.readText(await fs.resolve(absPath))
  } catch {
    return null
  }
}

/**
 * 在 gitDir（及其 commondir）中解析引用为提交哈希。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} gitDir - git 元数据目录绝对路径。
 * @param {string} ref - 形如 `refs/heads/main`。
 * @returns {Promise<string|null>} 提交哈希。
 */
async function readRef(fs, gitDir, ref) {
  const direct = await readIfExists(fs, path.join(gitDir, ...ref.split('/')))
  if (direct && HASH_PATTERN.test(direct.trim())) return direct.trim()

  // worktree 的引用常驻在 commondir 指向的主仓库目录
  const dirs = [gitDir]
  const commonDir = await readIfExists(fs, path.join(gitDir, 'commondir'))
  if (commonDir?.trim()) dirs.push(path.resolve(gitDir, commonDir.trim()))

  for (const dir of dirs) {
    const packed = await readIfExists(fs, path.join(dir, 'packed-refs'))
    if (!packed) continue
    for (const raw of packed.split('\n')) {
      const line = raw.trim()
      if (line === '' || line.startsWith('#') || line.startsWith('^')) continue
      const [hash, name] = line.split(/\s+/)
      if (name === ref && HASH_PATTERN.test(hash)) return hash
    }
  }
  return null
}

/**
 * 读取项目根的 Git 元数据。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 项目根绝对路径。
 * @returns {Promise<{branch:string, commit:string, shortCommit:string}|null>}
 *   分支名（detached 时为空串）、完整提交哈希与 7 位短哈希；非 Git 仓库返回 null。
 */
export async function readGitInfo(fs, root) {
  try {
    const dotGit = path.join(root, '.git')
    let gitDir = dotGit
    let stat
    try {
      stat = await fs.stat(await fs.resolve(dotGit))
    } catch {
      return null
    }
    if (!stat) return null
    if (stat.type === 'file') {
      const pointer = await readIfExists(fs, dotGit)
      const m = /^gitdir:\s*(?<dir>.+)$/m.exec(pointer ?? '')
      if (!m) return null
      gitDir = path.resolve(root, m.groups.dir.trim())
    } else if (stat.type !== 'directory') {
      return null
    }

    const head = await readIfExists(fs, path.join(gitDir, 'HEAD'))
    if (!head) return null
    const trimmed = head.trim()
    let branch = ''
    let commit = ''
    const refMatch = /^ref:\s*(?<ref>.+)$/.exec(trimmed)
    if (refMatch) {
      const ref = refMatch.groups.ref.trim()
      branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref
      commit = (await readRef(fs, gitDir, ref)) ?? ''
    } else if (HASH_PATTERN.test(trimmed)) {
      // detached HEAD：没有分支名
      commit = trimmed
    }
    if (!commit) return null
    return { branch, commit, shortCommit: commit.slice(0, 7) }
  } catch {
    return null
  }
}
