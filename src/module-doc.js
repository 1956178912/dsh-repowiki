// @ts-check
/**
 * 模块级 Wiki 页（确定性、零 LLM）：把同一模块下的文件卡片聚合为一页。
 *
 * 形态对齐 Qoder Repo Wiki 的“模块文档”价值，但不引入其五类卡与 YAML：
 * 页面包含模块组成、关键符号（索引行号）、注意事项（卡片陷阱）以及
 * 依赖模块 / 被依赖模块（import 边的出边与入边方向）。输出直接喂给
 * renderWikiMarkdown。
 */

import { moduleOf } from './modules.js'

/** 关键符号上限。 */
const MAX_KEY_SYMBOLS = 12

/** 注意事项上限。 */
const MAX_PITFALLS = 12

/** 相关模块上限。 */
const MAX_RELATED = 8

/** 高风险入口（fan-in）上限。 */
const MAX_HUBS = 3

/**
 * 从卡片正文提取“陷阱 / Pitfalls”列表。
 * @param {string} body - 卡片正文（frontmatter 之后）。
 * @returns {string[]} 非空条目。
 */
function pitfallsFromBody(body) {
  const match = /## 陷阱 \/ Pitfalls\n\n([\s\S]*?)(?=\n## |$)/.exec(String(body ?? ''))
  if (!match) return []
  return match[1]
    .split('\n')
    .filter(line => /^[-*]\s+/.test(line))
    .map(line => line.replace(/^[-*]\s+/, '').trim())
    .filter(text => text && text !== '(none)')
}

/**
 * 依据 import 边计算模块的出边（依赖）、入边（被依赖）与双向关系。
 * 同一对模块之间的边数分别按方向累计，排序后各自截断；双向关系基于
 * 完整计数判断（不受截断影响），用于标注模块级循环。
 * @param {string} modulePath - 当前模块。
 * @param {Array<{path:string}>} files - 索引文件。
 * @param {Array<{from:string,to:string}>} edges - 依赖边。
 * @returns {{outbound: Array<[string, number]>, inbound: Array<[string, number]>, mutual: string[]}}
 *   出边、入边的 [模块, 边数] 列表（均降序）与双向依赖模块（升序）。
 */
function moduleRelations(modulePath, files, edges) {
  const inModule = new Set(files.filter(f => moduleOf(f.path) === modulePath).map(f => f.path))
  const out = new Map()
  const inbound = new Map()
  for (const edge of edges) {
    const fromIn = inModule.has(edge.from)
    const toIn = inModule.has(edge.to)
    if (fromIn === toIn) continue
    const other = fromIn ? moduleOf(edge.to) : moduleOf(edge.from)
    if (other === modulePath) continue
    const target = fromIn ? out : inbound
    target.set(other, (target.get(other) ?? 0) + 1)
  }
  /**
   * 排序并截断单向关系。
   * @param {Map<string, number>} counts - 模块 → 边数。
   * @returns {Array<[string, number]>} 降序列表。
   */
  const ranked = (counts) => [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, MAX_RELATED)
  const mutual = [...out.keys()].filter(path => inbound.has(path)).sort()
  return { outbound: ranked(out), inbound: ranked(inbound), mutual }
}

/**
 * 模块内文件的高风险入口：按不同依赖方文件数（fan-in）排名。
 * 只统计目标在模块内的边，依赖方可来自任意模块；同一文件重复 import
 * 只计一次，自引用忽略，并列按路径升序。
 * @param {string} modulePath - 当前模块。
 * @param {Array<{path:string}>} files - 索引文件。
 * @param {Array<{from:string,to:string}>} edges - 依赖边。
 * @returns {Array<{path:string, dependents:number}>} 前三名（无入边时为空）。
 */
function moduleHubs(modulePath, files, edges) {
  const inModule = new Set(files.filter(f => moduleOf(f.path) === modulePath).map(f => f.path))
  /** @type {Map<string, Set<string>>} */
  const byTo = new Map()
  for (const edge of edges) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
    if (edge.from === edge.to) continue
    if (!inModule.has(edge.to)) continue
    let set = byTo.get(edge.to)
    if (!set) {
      set = new Set()
      byTo.set(edge.to, set)
    }
    set.add(edge.from)
  }
  return [...byTo.entries()]
    .map(([path, froms]) => ({ path, dependents: froms.size }))
    .sort((a, b) => b.dependents - a.dependents || a.path.localeCompare(b.path))
    .slice(0, MAX_HUBS)
}

/**
 * 构造模块级页面集合。
 * @param {object} input - 输入。
 * @param {Array<{path:string, parent:string}>} input.modules - index.modules（含无卡片模块）。
 * @param {Array<{path:string, title:string, summary:string, body:string}>} input.cardDocs - 卡片文档（含正文）。
 * @param {Array<{path:string, symbols?:Array}>} input.files - 索引文件（含符号行号）。
 * @param {Array<{from:string,to:string}>} input.edges - 依赖边。
 * @param {string} [input.projectName] - 根模块标题。
 * @param {string} input.locale - zh/en。
 * @returns {Array<object>} 页面对象（含 module/order，供清单使用）。
 */
export function buildModulePages({ modules, cardDocs, files, edges, projectName, locale }) {
  const zh = locale === 'zh'
  const byModule = new Map()
  for (const card of cardDocs) {
    const key = moduleOf(card.path)
    if (!byModule.has(key)) byModule.set(key, [])
    byModule.get(key).push(card)
  }

  const pages = []
  for (const module of modules) {
    const cards = byModule.get(module.path)
    if (!cards || cards.length === 0) continue
    const sorted = [...cards].sort((a, b) => a.path.localeCompare(b.path))
    const moduleFiles = files.filter(f => moduleOf(f.path) === module.path)
    const symbols = moduleFiles
      .flatMap(file => (Array.isArray(file.symbols) ? file.symbols : []).map(sym => ({ ...sym, file: file.path })))
      .filter(sym => typeof sym.line === 'number')
      .sort((a, b) => (a.line - b.line) || String(a.name).localeCompare(String(b.name)))
      .slice(0, MAX_KEY_SYMBOLS)
    const pitfalls = [...new Set(sorted.flatMap(card => pitfallsFromBody(card.body)))].slice(0, MAX_PITFALLS)
    const relations = moduleRelations(module.path, files, edges)
    const title = module.path === '.' ? (projectName || (zh ? '根目录' : 'Root')) : module.path
    const sections = [
      {
        heading: zh ? '模块组成' : 'Composition',
        body: sorted
          .map(card => `- \`${card.path}\` — ${card.title}${card.summary ? `${zh ? '：' : ': '}${card.summary}` : ''}`)
          .join('\n'),
        sources: sorted.map(card => card.path),
      },
    ]
    if (symbols.length > 0) {
      sections.push({
        heading: zh ? '关键符号' : 'Key symbols',
        body: symbols.map((sym) => {
          const range = sym.endLine && sym.endLine > sym.line ? `, L${sym.line}-L${sym.endLine}` : `, L${sym.line}`
          return `- \`${sym.name}\` (${sym.kind}${range}) — \`${sym.file}\``
        }).join('\n'),
        sources: [...new Set(symbols.map(sym => sym.file))],
      })
    }
    if (pitfalls.length > 0) {
      sections.push({
        heading: zh ? '注意事项' : 'Pitfalls',
        body: pitfalls.map(text => `- ${text}`).join('\n'),
        sources: [],
      })
    }
    if (relations.outbound.length > 0) {
      sections.push({
        heading: zh ? '依赖模块' : 'Depends on',
        body: relations.outbound
          .map(([path, count]) => `- \`${path}\` (${count} ${zh ? '条依赖边' : 'import edge(s)'})`)
          .join('\n'),
        sources: [],
      })
    }
    if (relations.inbound.length > 0) {
      sections.push({
        heading: zh ? '被依赖模块' : 'Depended on by',
        body: relations.inbound
          .map(([path, count]) => `- \`${path}\` (${count} ${zh ? '条依赖边' : 'import edge(s)'})`)
          .join('\n'),
        sources: [],
      })
    }
    if (relations.mutual.length > 0) {
      sections.push({
        heading: zh ? '循环依赖' : 'Circular dependencies',
        body: relations.mutual
          .map(path => `- \`${path}\` (${zh ? '双向 import 边' : 'imports both ways'})`)
          .join('\n'),
        sources: [],
      })
    }
    // 模块内高风险入口：被最多文件依赖，改动影响面最大
    const hubs = moduleHubs(module.path, files, edges)
    if (hubs.length > 0) {
      sections.push({
        heading: zh ? '高风险入口' : 'High-fan-in files',
        body: hubs
          .map(hub => `- \`${hub.path}\` (${hub.dependents} ${zh ? '个依赖方文件' : 'importer file(s)'})`)
          .join('\n'),
        sources: hubs.map(hub => hub.path),
      })
    }

    pages.push({
      title,
      slug: `modules/${module.path === '.' ? 'root' : module.path}`,
      overview: zh
        ? `${sorted.length} 个文件卡片归入模块 \`${module.path}\`；本页由插件确定性聚合，无模型调用。`
        : `${sorted.length} file card(s) belong to module \`${module.path}\`; this page is aggregated deterministically without model calls.`,
      sections,
      mermaid: '',
      module: module.path,
      order: pages.length,
    })
  }
  return pages
}
