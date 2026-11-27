/**
 * Git 元数据读取测试：普通仓库 / packed-refs / detached / worktree / 非仓库。
 * 全部通过 fake fs 读取真实临时文件，不执行 git 命令。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { readGitInfo } from '../src/git.js'

/** 固定提交哈希（40 位 sha1 形态）。 */
const SHA = 'a'.repeat(40)

/**
 * 建临时目录并写入 fixture。
 * @param {Record<string,string>} files - 相对路径 → 内容。
 * @returns {string} 目录绝对路径。
 */
function makeDir(files) {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-git-'))
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    nodefs.mkdirSync(path.dirname(abs), { recursive: true })
    nodefs.writeFileSync(abs, text)
  }
  return dir
}

test('普通仓库：HEAD 指向 refs/heads/main，读取松散引用', async () => {
  const dir = makeDir({
    '.git/HEAD': 'ref: refs/heads/main\n',
    '.git/refs/heads/main': `${SHA}\n`,
  })
  const info = await readGitInfo(makeFakeFs(dir), dir)
  assert.deepEqual(info, { branch: 'main', commit: SHA, shortCommit: 'aaaaaaa' })
})

test('packed-refs：松散引用缺失/损坏时回退打包引用', async () => {
  const dir = makeDir({
    '.git/HEAD': 'ref: refs/heads/release/1.0\n',
    // 松散引用存在但不是哈希：必须继续查 packed-refs
    '.git/refs/heads/release/1.0': 'not-a-hash\n',
    '.git/packed-refs': [
      '# pack-refs with: peeled fully-peeled sorted',
      `${SHA} refs/heads/release/1.0`,
      `^${'b'.repeat(40)}`,
    ].join('\n'),
  })
  const info = await readGitInfo(makeFakeFs(dir), dir)
  assert.equal(info.branch, 'release/1.0')
  assert.equal(info.commit, SHA)
})

test('文件系统异常：stat 抛错 / 非文件目录类型 / resolve 抛错均安静降级', async () => {
  const throwingStat = {
    async resolve(p) { return { displayPath: p } },
    async stat() { throw new Error('stat failed') },
  }
  assert.equal(await readGitInfo(throwingStat, '/tmp/demo'), null)

  const oddType = {
    async resolve(p) { return { displayPath: p } },
    async stat() { return { type: 'other' } },
  }
  assert.equal(await readGitInfo(oddType, '/tmp/demo'), null)

  const throwingResolve = {
    async resolve() { throw new Error('resolve failed') },
  }
  assert.equal(await readGitInfo(throwingResolve, '/tmp/demo'), null)
})

test('detached HEAD：HEAD 直接是提交哈希，分支为空', async () => {
  const dir = makeDir({ '.git/HEAD': `${SHA}\n` })
  const info = await readGitInfo(makeFakeFs(dir), dir)
  assert.equal(info.branch, '')
  assert.equal(info.commit, SHA)
  assert.equal(info.shortCommit, SHA.slice(0, 7))
})

test('worktree：.git 为 gitdir 指针，引用经 commondir 解析', async () => {
  const dir = makeDir({
    '.git': 'gitdir: ./repo/.git/worktrees/wt\n',
    'repo/.git/worktrees/wt/HEAD': 'ref: refs/heads/wt-branch\n',
    'repo/.git/worktrees/wt/commondir': '../..\n',
    'repo/.git/packed-refs': `${SHA} refs/heads/wt-branch\n`,
  })
  const info = await readGitInfo(makeFakeFs(dir), dir)
  assert.equal(info.branch, 'wt-branch')
  assert.equal(info.commit, SHA)
})

test('非仓库 / HEAD 损坏 / 引用缺失：安静返回 null', async () => {
  const plain = makeDir({ 'a.ts': 'export const a = 1\n' })
  assert.equal(await readGitInfo(makeFakeFs(plain), plain), null, '无 .git')

  const broken = makeDir({ '.git/HEAD': 'not-a-ref\n' })
  assert.equal(await readGitInfo(makeFakeFs(broken), broken), null, '无法识别的 HEAD')

  const dangling = makeDir({ '.git/HEAD': 'ref: refs/heads/gone\n' })
  assert.equal(await readGitInfo(makeFakeFs(dangling), dangling), null, '引用无对应文件')

  const badPointer = makeDir({ '.git': 'no gitdir line\n' })
  assert.equal(await readGitInfo(makeFakeFs(badPointer), badPointer), null, '.git 指针文件无 gitdir')
})
