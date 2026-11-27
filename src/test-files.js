// @ts-check
/**
 * 测试文件识别与受影响测试收集（纯函数）。
 *
 * 用途：影响面分析在依赖方里标出"这些是测试"，让代理优先跑正确的测试，
 * 而不是只看到一串源文件。识别完全基于路径启发式（目录名与常见命名
 * 约定），不读内容、不做构建系统推断；误判时以输出中的说明为准。
 */

/** 单次影响面返回的受影响测试文件上限。 */
export const MAX_AFFECTED_TESTS = 50

/** 视为测试目录的路径段（小写比较；testdata 等夹具目录不算）。 */
const TEST_DIRECTORIES = new Set([
  'test', 'tests', '__tests__', 'spec', 'specs', '__spec__', 'e2e', 'cypress',
])

/**
 * 是否为测试文件（路径启发式）。
 * 命中任一规则即视为测试：测试目录下的文件、`*.test.*` / `*.spec.*`、
 * Python/Ruby/Go 的 `test_*` / `*_test.*` / `*_spec.rb`，以及
 * `FooTest`/`FooTests`/`FooSpec`/`FooIT` 形式的 JVM/C#/Swift 文件。
 * @param {unknown} value - 文件路径。
 * @returns {boolean} 是否为测试文件。
 */
export function isTestPath(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return false
  const path = raw.replace(/\\/g, '/').replace(/^\.\//, '')
  const segments = path.split('/')
  const file = segments[segments.length - 1]
  if (segments.slice(0, -1).some(dir => TEST_DIRECTORIES.has(dir.toLowerCase()))) return true
  if (/\.(?:test|spec)\.[A-Za-z0-9]+$/i.test(file)) return true
  if (/^(?:test_.+|.+_test)\.[A-Za-z0-9]+$/i.test(file)) return true
  if (/_spec\.rb$/i.test(file)) return true
  if (/(?:Test|Tests|Spec|IT)\.(?:java|kt|kts|cs|scala|swift)$/.test(file)) return true
  return false
}

/**
 * 从影响面条目里筛选测试文件：按最小跳数去重，最近优先，同跳数按路径。
 * 上限只影响返回明细，不改变"是否截断"的判断。
 * @param {Array<{path:string, depth:number}>} [entries] - 受影响文件（含跳数）。
 * @param {number} [limit] - 返回上限（默认 MAX_AFFECTED_TESTS）。
 * @returns {{tests:Array<{path:string, depth:number}>, truncated:boolean}}
 *   受影响测试与截断标记。
 */
export function collectAffectedTests(entries = [], limit = MAX_AFFECTED_TESTS) {
  const max = Number.isInteger(limit) && limit > 0 ? Math.floor(limit) : MAX_AFFECTED_TESTS
  /** @type {Map<string, number>} */
  const byPath = new Map()
  for (const entry of entries) {
    if (!entry || typeof entry.path !== 'string' || !isTestPath(entry.path)) continue
    const depth = Number.isInteger(entry.depth) && entry.depth > 0 ? entry.depth : 1
    const current = byPath.get(entry.path)
    if (current === undefined || depth < current) byPath.set(entry.path, depth)
  }
  const all = [...byPath.entries()]
    .map(([path, depth]) => ({ path, depth }))
    .sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path))
  return { tests: all.slice(0, max), truncated: all.length > max }
}
