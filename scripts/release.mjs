/**
 * 本地发布：校验 → 跑测试 → bump 版本 → 本地 commit/tag（不 push）。
 * 用法：npm run release -- patch|minor|major
 *
 * 约定：CHANGELOG 的版本条目须先提交；脚本只负责版本号、commit 与 tag，
 * 不生成 CHANGELOG 文本、不添加任何署名 trailer。
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'

/**
 * 计算下一个版本号。
 * @param {string} version - 当前版本（x.y.z）。
 * @param {'patch'|'minor'|'major'} type - 升级类型。
 * @returns {string} 新版本。
 */
export function bumpVersion(version, type) {
  const parts = String(version).split('.').map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isInteger(n) || n < 0)) {
    throw new Error(`invalid version: ${version}`)
  }
  const [major, minor, patch] = parts
  if (type === 'major') return `${major + 1}.0.0`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`
  throw new Error(`invalid release type: ${type} (use patch|minor|major)`)
}

/**
 * 执行 git 命令并返回 stdout。
 * @param {string[]} args - 参数。
 * @returns {string} 输出。
 */
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

/**
 * 直接入口。
 * @returns {void}
 */
function main() {
  const type = process.argv[2]
  if (!['patch', 'minor', 'major'].includes(type)) {
    console.error('usage: npm run release -- patch|minor|major')
    process.exit(1)
  }
  const status = git(['status', '--porcelain'])
  if (status) {
    console.error('release: working tree is not clean; commit or stash changes first')
    process.exit(1)
  }
  const here = path.dirname(fileURLToPath(import.meta.url))
  const root = path.resolve(here, '..')
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const next = bumpVersion(pkg.version, type)
  const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  if (!changelog.includes(`## [${next}]`)) {
    console.error(`release: CHANGELOG.md is missing a "## [${next}]" entry; write it and commit first`)
    process.exit(1)
  }

  execFileSync('npm', ['test'], { cwd: root, stdio: 'inherit' })
  execFileSync('npm', ['version', type, '--no-git-tag-version'], { cwd: root, stdio: 'inherit' })
  git(['commit', '-am', `chore(release): v${next}`])
  git(['tag', `v${next}`])
  console.log(`release: v${next} committed and tagged locally (not pushed).`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
