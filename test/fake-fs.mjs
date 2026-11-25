/**
 * 测试用最小 ctx.fs 实现。
 *
 * 形态对齐官方 FileSystem 契约（resolve 返回 {targetKey, displayPath}
 * 的不透明 target；stat/readText/writeText/listDir 行为一致），介质用
 * 本机 node fs + 临时目录，使索引链路在真实文件系统语义下被验证。
 */

import * as nodefs from 'node:fs'
import * as path from 'node:path'

/**
 * 构造一个 fake fs，介质根为 rootDir。
 * @param {string} rootDir - 介质根目录（测试临时目录）。
 * @returns {object} 形如 ctx.fs 的对象。
 */
export function makeFakeFs(rootDir) {
  const resolve = async (p, opts = {}) => {
    const cwd = opts.cwd ?? rootDir
    const abs = path.isAbsolute(p) ? path.resolve(p) : path.resolve(cwd, p)
    return { targetKey: abs, displayPath: abs }
  }
  return {
    resolve,
    async stat(target) {
      try {
        const s = nodefs.statSync(target.displayPath)
        return { version: 'v1', type: s.isDirectory() ? 'directory' : 'file', size: s.size }
      } catch {
        return undefined
      }
    },
    async readText(target) {
      return nodefs.readFileSync(target.displayPath, 'utf8')
    },
    async writeText(target, content) {
      nodefs.mkdirSync(path.dirname(target.displayPath), { recursive: true })
      const existed = nodefs.existsSync(target.displayPath)
      nodefs.writeFileSync(target.displayPath, content)
      return {
        operation: existed ? 'update' : 'create',
        version: 'v2',
        before: existed ? nodefs.readFileSync(target.displayPath, 'utf8') : null,
        after: content,
      }
    },
    async listDir(target) {
      const entries = nodefs.readdirSync(target.displayPath, { withFileTypes: true })
      return entries
        .map(d => {
          const abs = path.join(target.displayPath, d.name)
          return {
            name: d.name,
            type: d.isDirectory() ? 'directory' : 'file',
            target: { targetKey: abs, displayPath: abs },
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    },
  }
}
