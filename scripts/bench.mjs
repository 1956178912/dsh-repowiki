/**
 * 性能基准（dev-only）：生成合成仓库，测量 buildIndex 耗时与 RSS。
 * 用法：npm run bench -- 2000
 */

import * as nodefs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { makeFakeFs } from '../test/fake-fs.mjs'
import { buildIndex } from '../src/indexer.js'

/**
 * 生成合成仓库。
 * @param {number} count - 文件数。
 * @returns {string} 临时目录。
 */
function makeSyntheticRepo(count) {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-bench-'))
  for (let i = 0; i < count; i++) {
    const sub = `src/mod${i % 20}`
    nodefs.mkdirSync(path.join(dir, sub), { recursive: true })
    const body = [
      `import { helper${(i + 1) % count} } from '../mod${(i + 1) % 20}/f${(i + 1) % count}'`,
      `export function fn${i}(input: number) { return input + ${i} }`,
      `export class C${i} { method() { return ${i} } }`,
      `export const value${i} = ${i}`,
    ].join('\n')
    nodefs.writeFileSync(path.join(dir, sub, `f${i}.ts`), `${body}\n`)
  }
  return dir
}

/**
 * 直接入口。
 * @returns {Promise<void>}
 */
async function main() {
  const count = Math.max(1, Number(process.argv[2] ?? 1000) || 1000)
  const readConcurrency = Math.max(1, Number(process.argv[3] ?? 8) || 8)
  const dir = makeSyntheticRepo(count)
  try {
    const fs = makeFakeFs(dir)
    const started = process.hrtime.bigint()
    const doc = await buildIndex(fs, dir, { readConcurrency })
    const ms = Number(process.hrtime.bigint() - started) / 1e6
    const rss = Math.round(process.memoryUsage().rss / 1024 / 1024)
    console.log(`readConcurrency: ${readConcurrency}`)
    console.log('| files | symbols | edges | duration (ms) | RSS (MiB) |')
    console.log('|---|---|---|---|---|')
    console.log(`| ${doc.stats.files} | ${doc.stats.symbols} | ${doc.stats.edges} | ${ms.toFixed(0)} | ${rss} |`)
  } finally {
    nodefs.rmSync(dir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
