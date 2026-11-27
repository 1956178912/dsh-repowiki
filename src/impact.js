// @ts-check
/**
 * 变更影响面分析（纯函数）。
 *
 * 输入是"准备改哪些文件"，输出是静态 import 图上能确定的后果：
 * 直接/传递依赖方、涉入的循环组、fan-in 集中度、会因此失效的卡片与
 * Wiki 引用，以及一个可解释的风险分层。
 *
 * 语义边界（必须在输出中如实传达）：这是**静态 import 图**，不是运行时
 * 调用图；动态加载、反射、配置驱动的使用不会出现。风险分是启发式排序，
 * 不是"改了一定会坏"的保证。
 */

import { findImportCycles } from './cycles.js'
import { buildWikiReferenceIndex, wikiReferencesFor } from './wiki-references.js'
import { collectAffectedTests } from './test-files.js'
import { reexportImportSites, wildcardImportedNamesByFile } from './reexports.js'

/** 单次返回的传递依赖方上限。 */
export const MAX_IMPACT_ENTRIES = 100

/** 传递影响面的最大跳数。 */
export const MAX_IMPACT_DEPTH = 3

/** 影响面里返回的循环组上限。 */
export const MAX_IMPACT_CYCLES = 10

/** 每组循环展示的文件数（完整规模由 size 给出）。 */
export const MAX_IMPACT_CYCLE_FILES = 30

/** 单次返回的受影响卡片/Wiki 引用上限。 */
export const MAX_IMPACT_DOCS = 50

/**
 * 索引边。
 * @typedef {{from:string, to:string, kind?:string, line?:number, symbols?:string[],
 *   aliases?:Array<{from:string, to:string}>}} IndexEdge
 */

/**
 * 索引文件条目（本模块只读取这几个字段）。
 * @typedef {{path:string, lang?:string, digest?:string,
 *   symbols?:Array<{name?:string, kind?:string, line?:number}>}} IndexFile
 */

/**
 * 索引文档（readIndex 的返回值子集）。
 * @typedef {{files?:IndexFile[], edges?:IndexEdge[]}} IndexDoc
 */

/**
 * 归一输入路径：去空白、反斜杠转正斜杠、去 leading `./`、折叠重复斜杠。
 * @param {unknown} value - 原始路径。
 * @returns {string} 归一化路径（可能为空）。
 */
export function normalizeImpactPath(value) {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '')
}

/**
 * 把绝对路径转为相对项目根的路径；相对路径按同一归一规则返回。
 * 与 normalizeImpactPath 的区别：先判定绝对路径再剥离根前缀，避免
 * `/repo/src/a.ts` 在归一阶段丢掉开头的 `/` 而永远匹配不上根。
 * @param {unknown} value - 原始路径。
 * @param {string} root - 项目根绝对路径。
 * @returns {string} 相对路径。
 */
function relativeToRoot(value, root) {
  const cleaned = String(value ?? '').trim().replace(/\\/g, '/').replace(/\/+/g, '/')
  const absolute = cleaned.startsWith('/') || /^[A-Za-z]:\//.test(cleaned)
  if (!absolute) return cleaned.replace(/^\.\//, '')
  const normalizedRoot = String(root ?? '').trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
  if (normalizedRoot && cleaned.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) {
    return cleaned.slice(normalizedRoot.length + 1)
  }
  // 根之外或根不匹配：去掉 leading slash，仍可能通过后缀命中（保守）
  return cleaned.replace(/^\/+/, '')
}

/**
 * 把调用方给出的变更路径匹配到索引文件。
 *
 * 匹配顺序：精确相对路径 → 大小写不敏感精确 → `/<输入>` 后缀 →
 * 唯一 basename。多候选进入 `ambiguous` 而**不猜**；无候选进入
 * `unmatched`。输入可以是绝对路径（按 root 剥离前缀）。
 * @param {IndexDoc} index - readIndex 的索引文档。
 * @param {string[]} inputs - 变更路径列表。
 * @param {string} [root] - 项目根（绝对路径）。
 * @returns {{matched:string[], unmatched:string[], ambiguous:Array<{query:string, candidates:string[]}>}}
 *   匹配结果。
 */
export function matchChangedPaths(index, inputs, root = '') {
  const files = (index?.files ?? [])
    .map(file => file?.path)
    .filter(path => typeof path === 'string' && path.length > 0)
  const fileSet = new Set(files)
  const lowerToPath = new Map(files.map(path => [path.toLowerCase(), path]))
  const matched = new Set()
  const unmatched = []
  const ambiguous = []
  for (const raw of inputs) {
    const relative = relativeToRoot(raw, root)
    if (!relative) {
      unmatched.push(String(raw))
      continue
    }
    if (fileSet.has(relative)) {
      matched.add(relative)
      continue
    }
    const lower = relative.toLowerCase()
    if (lowerToPath.has(lower)) {
      matched.add(lowerToPath.get(lower))
      continue
    }
    const suffix = `/${relative}`
    const bySuffix = files.filter(path => path.toLowerCase().endsWith(suffix.toLowerCase()))
    if (bySuffix.length === 1) {
      matched.add(bySuffix[0])
      continue
    }
    if (bySuffix.length > 1) {
      ambiguous.push({ query: String(raw), candidates: bySuffix.sort().slice(0, 10) })
      continue
    }
    const base = relative.slice(relative.lastIndexOf('/') + 1)
    const byBase = files.filter(path => path.toLowerCase() === base.toLowerCase()
      || path.toLowerCase().endsWith(`/${base.toLowerCase()}`))
    if (byBase.length === 1) {
      matched.add(byBase[0])
      continue
    }
    if (byBase.length > 1) {
      ambiguous.push({ query: String(raw), candidates: byBase.sort().slice(0, 10) })
      continue
    }
    unmatched.push(String(raw))
  }
  return { matched: [...matched].sort(), unmatched, ambiguous }
}

/**
 * 直接依赖方的符号聚合（同一引用方多次 import 同一目标时取并集）。
 * @param {IndexEdge[]} edges - 依赖边。
 * @param {Set<string>} targets - 变更文件集合。
 * @returns {Map<string, string[]>} 引用方 → 从变更文件导入的具名符号。
 */
function directSymbols(edges, targets) {
  /** @type {Map<string, Set<string>>} */
  const out = new Map()
  for (const edge of edges) {
    if (!edge || !targets.has(edge.to) || edge.from === edge.to) continue
    const symbols = (Array.isArray(edge.symbols) ? edge.symbols : [])
      .filter(name => typeof name === 'string' && name.length > 0)
    if (symbols.length === 0) continue
    let set = out.get(edge.from)
    if (!set) {
      set = new Set()
      out.set(edge.from, set)
    }
    for (const symbol of symbols) set.add(symbol)
  }
  /** @type {Map<string, string[]>} */
  const sorted = new Map()
  for (const [path, set] of out) sorted.set(path, [...set].sort())
  return sorted
}

/**
 * 在反向 import 图上做多源 BFS，求变更文件的传递依赖方。
 * 同一文件按最小跳数只记一次；超出 limit 仍继续计数，保证
 * `truncated` 与 `total` 如实（截断只影响返回明细，不影响统计）。
 * @param {IndexEdge[]} [edges] - 依赖边。
 * @param {string[]} [changed] - 变更文件（索引内相对路径）。
 * @param {number} [depth] - 最大跳数（1–MAX_IMPACT_DEPTH）。
 * @param {number} [limit] - 返回明细上限（1–MAX_IMPACT_ENTRIES）。
 * @returns {{impacted:Array<{path:string, depth:number, symbols:string[]}>, total:number,
 *   direct:number, truncated:boolean, tests:Array<{path:string, depth:number}>,
 *   testsTruncated:boolean}} 依赖方、总数、直接数、截断标记与受影响测试。
 */
export function computeImpact(edges = [], changed = [], depth = 2, limit = MAX_IMPACT_DOCS) {
  const maxDepth = Number.isInteger(depth)
    ? Math.min(MAX_IMPACT_DEPTH, Math.max(1, depth))
    : 2
  const maxResults = Number.isInteger(limit)
    ? Math.min(MAX_IMPACT_ENTRIES, Math.max(1, limit))
    : MAX_IMPACT_DOCS
  /** @type {Map<string, IndexEdge[]>} */
  const byTo = new Map()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.from === edge.to) continue
    const list = byTo.get(edge.to)
    if (list) list.push(edge)
    else byTo.set(edge.to, [edge])
  }
  const changedSet = new Set(changed)
  const symbolsByFrom = directSymbols(edges, changedSet)
  const seen = new Set(changed)
  /** @type {Array<{path:string, depth:number}>} */
  const queue = changed.map(path => ({ path, depth: 0 }))
  /** @type {Array<{path:string, depth:number, symbols:string[]}>} */
  const impacted = []
  /** @type {Array<{path:string, depth:number}>} */
  const testEntries = []
  let total = 0
  let direct = 0
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]
    if (current.depth >= maxDepth) continue
    for (const edge of byTo.get(current.path) ?? []) {
      if (seen.has(edge.from)) continue
      seen.add(edge.from)
      total++
      const nextDepth = current.depth + 1
      if (nextDepth === 1) direct++
      testEntries.push({ path: edge.from, depth: nextDepth })
      if (impacted.length < maxResults) {
        impacted.push({
          path: edge.from,
          depth: nextDepth,
          symbols: nextDepth === 1 ? (symbolsByFrom.get(edge.from) ?? []) : [],
        })
      }
      queue.push({ path: edge.from, depth: nextDepth })
    }
  }
  impacted.sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path))
  const tests = collectAffectedTests(testEntries)
  return {
    impacted, total, direct, truncated: total > impacted.length,
    tests: tests.tests, testsTruncated: tests.truncated,
  }
}

/**
 * 把符号变更请求解析到索引中的定义。
 * 支持 `name`（在全部变更文件中查找）与 `path#name`（限定文件）。只接受
 * 精确符号名；未定义或路径无法唯一匹配时列入 unmatched，不回退为文件级
 * 猜测。这样"只改一个函数"不会被放大成"改了整个文件"。
 * @param {IndexDoc} index - 索引文档。
 * @param {string[]} changed - 已匹配的变更文件。
 * @param {string[]} inputs - 符号请求。
 * @param {string} [root] - 项目根（用于限定的绝对路径）。
 * @returns {{resolved:Array<{path:string, name:string, kind:string, line:number}>,
 *   unmatched:string[]}} 已解析定义与未命中请求。
 */
export function resolveSymbolChanges(index, changed = [], inputs = [], root = '') {
  const changedSet = new Set(changed)
  const byPath = new Map((index.files ?? []).map(file => [file.path, file]))
  /** @type {Map<string, {path:string, name:string, kind:string, line:number}>} */
  const resolved = new Map()
  const unmatched = []
  for (const raw of inputs) {
    const input = String(raw ?? '').trim()
    if (!input) continue
    const hash = input.lastIndexOf('#')
    const qualifier = hash > 0 ? input.slice(0, hash).trim() : ''
    const name = (hash > 0 ? input.slice(hash + 1) : input).trim()
    if (!name) {
      unmatched.push(input)
      continue
    }
    let paths = changed
    if (qualifier) {
      const match = matchChangedPaths(index, [qualifier], root)
      paths = match.matched.filter(path => changedSet.has(path))
    }
    let found = false
    for (const path of paths) {
      const file = byPath.get(path)
      const symbols = Array.isArray(file?.symbols) ? file.symbols : []
      for (const symbol of symbols) {
        if (!symbol || symbol.name !== name) continue
        const key = `${path}\u0000${name}`
        resolved.set(key, {
          path,
          name,
          kind: typeof symbol.kind === 'string' ? symbol.kind : '',
          line: Number.isInteger(symbol.line) && symbol.line > 0 ? symbol.line : 0,
        })
        found = true
      }
    }
    if (!found) unmatched.push(input)
  }
  return {
    resolved: [...resolved.values()].sort((a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name)),
    unmatched,
  }
}

/**
 * 符号级影响面：直接依赖方必须导入至少一个变更符号；传递层再从这些
 * 直接依赖方沿反向文件图展开（保守上界，因为无法证明下游使用了哪个
 * 中间符号）。返回的 references 是具名 import 证据，不是运行时调用点。
 * 提供索引文件条目时，经由 `export * from`/同名具名再导出 barrel 导入
 * 该符号的文件也算直接影响（而不是只能落到下一跳）。
 * @param {IndexEdge[]} [edges] - 依赖边。
 * @param {Array<{path:string, name:string}>} [resolved] - 已解析的符号定义。
 * @param {number} [depth] - 最大跳数（1–3）。
 * @param {number} [limit] - 明细上限。
 * @param {IndexFile[]} [files] - 索引文件条目（用于解析再导出链）。
 * @returns {{impacted:Array<{path:string, depth:number, symbols:string[]}>,
 *   references:Array<{path:string, line:number, symbols:string[]}>,
 *   total:number, direct:number, truncated:boolean,
 *   tests:Array<{path:string, depth:number}>, testsTruncated:boolean}}
 *   精确直接影响与保守传递影响、受影响测试。
 */
export function computeSymbolImpact(edges = [], resolved = [], depth = 2, limit = MAX_IMPACT_DOCS, files = []) {
  const maxDepth = Number.isInteger(depth) ? Math.min(MAX_IMPACT_DEPTH, Math.max(1, depth)) : 2
  const maxResults = Number.isInteger(limit) ? Math.min(MAX_IMPACT_ENTRIES, Math.max(1, limit)) : MAX_IMPACT_DOCS
  /** @type {Map<string, Set<string>>} */
  const selected = new Map()
  for (const symbol of resolved) {
    let names = selected.get(symbol.path)
    if (!names) {
      names = new Set()
      selected.set(symbol.path, names)
    }
    names.add(symbol.name)
  }
  /** @type {Map<string, Set<string>>} */
  const directSymbolsByPath = new Map()
  /** @type {Map<string, {path:string, line:number, symbols:Set<string>}>} */
  const referenceSites = new Map()
  // Rust/Go 通配导入只触达公开模块级项：私有项/方法不算受影响的导入
  const wildcardImports = wildcardImportedNamesByFile(files)
  /** @type {Map<string, IndexEdge[]>} */
  const byTo = new Map()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string' || edge.from === edge.to) continue
    const list = byTo.get(edge.to)
    if (list) list.push(edge)
    else byTo.set(edge.to, [edge])
    const names = selected.get(edge.to)
    if (!names) continue
    const edgeSymbols = (Array.isArray(edge.symbols) ? edge.symbols : [])
      .filter(name => typeof name === 'string')
    // 命名空间导入/`export *` 通配符：目标文件里被选中的符号都可能受影响；
    // Rust/Go 通配只触达公开模块级项，私有项/方法不进入影响面
    const wildcardVisible = wildcardImports.get(edge.to)
    const imported = edgeSymbols.includes('*')
      ? [...names].filter(name => !wildcardVisible || edgeSymbols.includes(name) || wildcardVisible.has(name))
      : edgeSymbols.filter(name => names.has(name))
    if (imported.length === 0) continue
    let direct = directSymbolsByPath.get(edge.from)
    if (!direct) {
      direct = new Set()
      directSymbolsByPath.set(edge.from, direct)
    }
    for (const name of imported) direct.add(name)
    const line = Number.isInteger(edge.line) && edge.line > 0 ? edge.line : 0
    const key = `${edge.from}\u0000${line}`
    let site = referenceSites.get(key)
    if (!site) {
      site = { path: edge.from, line, symbols: new Set() }
      referenceSites.set(key, site)
    }
    for (const name of imported) site.symbols.add(name)
  }
  // 再导出链：经 barrel 导入的文件与中间 barrel 也算直接受影响
  if (files.length > 0) {
    for (const [targetPath, names] of selected) {
      for (const name of names) {
        for (const site of reexportImportSites(edges, files, targetPath, name, { includeReexports: true })) {
          let direct = directSymbolsByPath.get(site.path)
          if (!direct) {
            direct = new Set()
            directSymbolsByPath.set(site.path, direct)
          }
          direct.add(name)
          const line = site.line ?? 0
          const key = `${site.path}\u0000${line}`
          let refSite = referenceSites.get(key)
          if (!refSite) {
            refSite = { path: site.path, line, symbols: new Set() }
            referenceSites.set(key, refSite)
          }
          refSite.symbols.add(name)
        }
      }
    }
  }
  const references = [...referenceSites.values()]
    .map(site => ({ path: site.path, line: site.line, symbols: [...site.symbols].sort() }))
    .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
  const seen = new Set(selected.keys())
  /** @type {Array<{path:string, depth:number}>} */
  const queue = []
  /** @type {Array<{path:string, depth:number, symbols:string[]}>} */
  const impacted = []
  /** @type {Array<{path:string, depth:number}>} */
  const testEntries = []
  let total = 0
  for (const path of [...directSymbolsByPath.keys()].sort()) {
    seen.add(path)
    total++
    testEntries.push({ path, depth: 1 })
    if (impacted.length < maxResults) {
      impacted.push({ path, depth: 1, symbols: [...(directSymbolsByPath.get(path) ?? [])].sort() })
    }
    queue.push({ path, depth: 1 })
  }
  const direct = total
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]
    if (current.depth >= maxDepth) continue
    for (const edge of byTo.get(current.path) ?? []) {
      if (seen.has(edge.from)) continue
      seen.add(edge.from)
      total++
      const nextDepth = current.depth + 1
      testEntries.push({ path: edge.from, depth: nextDepth })
      if (impacted.length < maxResults) impacted.push({ path: edge.from, depth: nextDepth, symbols: [] })
      queue.push({ path: edge.from, depth: nextDepth })
    }
  }
  impacted.sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path))
  const tests = collectAffectedTests(testEntries)
  return {
    impacted, references, total, direct, truncated: total > impacted.length,
    tests: tests.tests, testsTruncated: tests.truncated,
  }
}

/**
 * 找出与变更文件相关的循环依赖组。
 * @param {IndexEdge[]} [edges] - 依赖边。
 * @param {string[]} [changed] - 变更文件。
 * @param {{limit?:number, filesPerCycle?:number}} [options] - 组数/每组文件数上限。
 * @returns {{cycles:Array<{files:string[], size:number, truncated:boolean, sample:string[], contains:string[]}>,
 *   truncated:boolean}} 相关循环组与截断标记。
 */
export function cyclesForChanged(edges = [], changed = [], options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : MAX_IMPACT_CYCLES
  const filesPerCycle = Number.isInteger(options.filesPerCycle) && options.filesPerCycle > 0
    ? options.filesPerCycle
    : MAX_IMPACT_CYCLE_FILES
  const changedSet = new Set(changed)
  // 先在完整分量上判定"是否含变更文件"，再截断展示，避免只扫前 30 个成员
  // 或前 N 个组就漏判；SCC 本身是线性成本，输出上限只在最后切片时生效。
  const scan = findImportCycles(edges, {
    limit: Number.MAX_SAFE_INTEGER,
    filesPerCycle: Math.max(filesPerCycle, 500),
  })
  const relevant = scan.cycles.filter(cycle => cycle.files.some(file => changedSet.has(file)))
  const cycles = relevant.slice(0, limit).map(cycle => ({
    files: cycle.files.slice(0, filesPerCycle),
    size: cycle.size,
    truncated: cycle.size > filesPerCycle,
    sample: cycle.sample,
    contains: cycle.files.filter(file => changedSet.has(file)).slice(0, filesPerCycle),
  }))
  return {
    cycles,
    truncated: relevant.length > cycles.length,
  }
}

/**
 * 变更文件自身的直接 fan-in（不同引用方文件数）。
 * @param {IndexEdge[]} [edges] - 依赖边。
 * @param {string[]} [changed] - 变更文件。
 * @param {number} [limit] - 返回上限（默认 10）。
 * @returns {Array<{path:string, dependents:number}>} 按依赖方数降序。
 */
export function hubsForChanged(edges = [], changed = [], limit = 10) {
  const changedSet = new Set(changed)
  /** @type {Map<string, Set<string>>} */
  const byPath = new Map()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.from === edge.to || !changedSet.has(edge.to)) continue
    let set = byPath.get(edge.to)
    if (!set) {
      set = new Set()
      byPath.set(edge.to, set)
    }
    set.add(edge.from)
  }
  return [...byPath.entries()]
    .map(([path, froms]) => ({ path, dependents: froms.size }))
    .sort((a, b) => b.dependents - a.dependents || a.path.localeCompare(b.path))
    .slice(0, Math.max(1, Math.floor(limit)))
}

/**
 * 受变更影响的文档：变更文件已有的卡片（含是否陈旧）与被 Wiki 引用的页面/章节。
 * @param {object} input - 输入。
 * @param {string[]} input.changed - 变更文件。
 * @param {Map<string, {meta?:{title?:string, sourceDigest?:string}, path?:string}>} [input.cardsMap] - 源路径 → 卡片。
 * @param {Map<string, string>} [input.digests] - 源路径 → 索引摘要。
 * @param {object|null} [input.manifest] - Wiki 清单。
 * @param {number} [input.limit] - Wiki 引用上限。
 * @returns {{cards:Array<{path:string, title:string, stale:boolean}>,
 *   wiki:Array<{path:string, slug:string, title:string, sections:string[]}>,
 *   wikiTruncated:boolean}} 文档影响面。
 */
export function affectedDocs({ changed = [], cardsMap = new Map(), digests = new Map(), manifest = null, limit = MAX_IMPACT_DOCS }) {
  const cards = []
  for (const path of changed) {
    const card = cardsMap.get(path)
    if (!card) continue
    cards.push({
      path,
      title: typeof card.meta?.title === 'string' ? card.meta.title : path,
      stale: card.meta?.sourceDigest !== digests.get(path),
    })
  }
  const refs = wikiReferencesFor(buildWikiReferenceIndex(manifest), changed, limit)
  return { cards, wiki: refs.wikiReferences, wikiTruncated: refs.truncated }
}

/**
 * 风险分层（启发式，不是保证）。
 *
 * 计分因子全部显式列出，便于调用方复核：
 * 直接依赖方每个 +4（上限 40）；传递依赖方每个 +1（上限 20）；
 * 相关循环组每组 +15（上限 30）；最高 fan-in ≥10 再 +10、≥5 再 +5。
 * 总分 0–100：≥70 critical，≥40 high，≥15 moderate，否则 low。
 * @param {{direct:number, total:number, cycles:number, hubs:Array<{path:string,dependents:number}>}} input
 *   影响面事实。
 * @returns {{score:number, level:'low'|'moderate'|'high'|'critical', factors:string[]}}
 *   风险分、等级与计分因子。
 */
export function assessRisk({ direct = 0, total = 0, cycles = 0, hubs = [] }) {
  const factors = []
  let score = 0
  if (direct > 0) {
    const points = Math.min(40, direct * 4)
    score += points
    factors.push(`${direct} direct dependent(s) (+${points})`)
  }
  const transitive = Math.max(0, total - direct)
  if (transitive > 0) {
    const points = Math.min(20, transitive)
    score += points
    factors.push(`${transitive} transitive dependent(s) (+${points})`)
  }
  if (cycles > 0) {
    const points = Math.min(30, cycles * 15)
    score += points
    factors.push(`${cycles} cycle group(s) touched (+${points})`)
  }
  const topHub = hubs[0]?.dependents ?? 0
  if (topHub >= 5) {
    const points = topHub >= 10 ? 10 : 5
    score += points
    factors.push(`fan-in ${topHub} on ${hubs[0]?.path ?? '?'} (+${points})`)
  }
  score = Math.max(0, Math.min(100, score))
  const level = score >= 70 ? 'critical' : score >= 40 ? 'high' : score >= 15 ? 'moderate' : 'low'
  return { score, level, factors }
}

/**
 * 生成可执行的后续动作（最多 4 条，按风险优先级）。
 * @param {object} input - 事实。
 * @param {{direct:number, total:number}} input.impact - computeImpact 结果（direct/total 足够）。
 * @param {{cycles:Array<{sample:string[]}>}} input.cycles - cyclesForChanged 结果。
 * @param {Array<{path:string,dependents:number}>} input.hubs - 变更文件 fan-in。
 * @param {{cards:Array<{path:string}>, wiki:Array<{path:string}>}} input.docs - 文档影响面。
 * @param {Array<{path:string, depth:number}>} [input.tests] - 受影响测试文件。
 * @returns {string[]} 建议。
 */
export function recommendationsFor({ impact, cycles, hubs, docs, tests = [] }) {
  const out = []
  if (tests.length > 0) {
    const listed = tests.slice(0, 5).map(item => item.path).join(', ')
    out.push(`Run the ${tests.length} affected test file(s) first: ${listed}${tests.length > 5 ? ' …' : ''}.`)
  }
  if (cycles.cycles.length > 0) {
    const route = cycles.cycles[0].sample.length > 2
      ? ` (${cycles.cycles[0].sample.join(' → ')})`
      : ''
    out.push(`Break the import cycle touching the change before editing${route}.`)
  }
  if (impact.direct > 0) {
    out.push(`Run the tests covering the ${impact.direct} direct dependent(s), then the wider suite.`)
  }
  if ((hubs[0]?.dependents ?? 0) >= 5) {
    out.push(`Review all callers of ${hubs[0].path}: it has ${hubs[0].dependents} direct importers (fan-in hub).`)
  }
  if (docs.cards.length > 0 || docs.wiki.length > 0) {
    out.push('After editing, refresh knowledge: repowiki-extract for the changed files, then repowiki-generate for the wiki.')
  }
  if (out.length === 0) {
    out.push('No indexed file imports the change; run the file\'s own tests and add dependents if this is an entry point.')
  }
  return out.slice(0, 4)
}
