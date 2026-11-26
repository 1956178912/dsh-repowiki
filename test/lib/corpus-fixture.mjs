/**
 * 真实语料 fixture 共享装载器。
 *
 * 语料来源：本仓库自身 .dsh-repowiki/ 的一次生成产出，原样固化在
 * test/fixtures/repo-corpus/（.dsh-repowiki/ 本身被 gitignore，见仓库
 * .gitignore 说明；fixture 纳入版本控制保证 CI 确定性）。
 *
 * 提供给两类测试复用：
 * - client-real-corpus.test.js（stub React 逻辑回归）；
 * - client-dom.test.js（真实 React + jsdom 的 DOM 事件集成回归）。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const FIXTURE_ROOT = path.join(REPO_ROOT, 'test', 'fixtures', 'repo-corpus')

/** fake remote 的路径前缀（客户端按 .dsh-repowiki/ 相对工作区根读取）。 */
const KEY_PREFIX = '.dsh-repowiki/'

/**
 * 装载真实语料 fixture（.md/.json）为 flat 映射 + 目录集合。
 * @returns {{files:object, dirs:Set<string>}} 键均带 .dsh-repowiki/ 前缀。
 */
export function loadCorpusFixture() {
  const files = {}
  const dirs = new Set()
  const walk = (abs, rel) => {
    for (const name of fs.readdirSync(abs)) {
      const childAbs = path.join(abs, name)
      const childRel = rel ? `${rel}/${name}` : name
      if (fs.statSync(childAbs).isDirectory()) {
        dirs.add(KEY_PREFIX + childRel)
        walk(childAbs, childRel)
      } else if (name.endsWith('.md') || name.endsWith('.json')) {
        files[KEY_PREFIX + childRel] = fs.readFileSync(childAbs, 'utf8')
      }
    }
  }
  walk(FIXTURE_ROOT, '')
  return { files, dirs }
}

/**
 * 列出某目录的直接子项（文件 + 目录），契约同真实 remote。
 * @param {object} files - loadCorpusFixture 的文件映射。
 * @param {Set<string>} dirs - loadCorpusFixture 的目录集合。
 * @param {string} rel - 相对工作区根的目录键。
 * @returns {object[]} 条目数组（name/type/size?）。
 */
export function entriesOf(files, dirs, rel) {
  const names = new Set()
  for (const d of dirs) {
    if (d.startsWith(`${rel}/`)) names.add(d.slice(rel.length + 1).split('/')[0])
  }
  for (const f of Object.keys(files)) {
    if (f.startsWith(`${rel}/`)) names.add(f.slice(rel.length + 1).split('/')[0])
  }
  return [...names].map((name) => {
    const child = `${rel}/${name}`
    return files[child] !== undefined
      ? { name, type: 'file', size: files[child].length }
      : { name, type: 'directory' }
  })
}

/**
 * 构造 fake remote.workspaceFiles：内容来自真实语料 fixture，
 * 契约对齐 RemoteResult（成功 .value / 失败 {ok:false,error}），
 * read 按页返回（同真实后端的分页语义）。
 * @returns {object} wf 桩。
 */
export function makeCorpusWf() {
  const { files, dirs } = loadCorpusFixture()
  return {
    async read(sessionId, rel, range, signal) {
      const text = files[rel]
      if (text === undefined) {
        return { ok: false, error: { code: 'workspace-file/not-found', message: `not found: ${rel}`, details: { path: rel } } }
      }
      const lines = text.split('\n')
      const offset = range?.offset ?? 1
      const limit = range?.limit ?? 5000
      const slice = lines.slice(offset - 1, offset - 1 + limit)
      return {
        ok: true,
        value: {
          text: slice.join('\n'), lines: slice.length, offset,
          eof: offset - 1 + slice.length >= lines.length,
        },
      }
    },
    async list(sessionId, rel, signal) {
      if (rel === '.dsh-repowiki' || dirs.has(rel)) {
        return { ok: true, value: { path: rel, entries: entriesOf(files, dirs, rel), truncated: false } }
      }
      return { ok: false, error: { code: 'workspace-file/not-found', message: `not found: ${rel}` } }
    },
  }
}
