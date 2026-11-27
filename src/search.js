// @ts-check
/**
 * 零依赖词法检索（BM25）：卡片 / Wiki / 记忆的正文排序检索。
 *
 * 与符号检索（精确/子串）互补：符号回答“定义在哪”，本模块回答
 * “文档里哪段讲了这件事”。中文按单字 + 二元组切分，拉丁按词切分；
 * 标题权重 3、摘要/标签 2、正文 1。无 embedding、无运行时依赖。
 */

/** BM25 参数（行业常用默认值）。 */
const K1 = 1.2
const B = 0.75

/** 摘要片段长度上限（字符）。 */
const SNIPPET_CHARS = 160

/**
 * @typedef {{title:string, summary?:string, tags?:string[], body?:string}} SearchDoc
 */

/**
 * 把文本切成检索 token。
 * 拉丁：小写词 `[a-z0-9_]+`；CJK：单字 + 相邻二元组（提升中文召回）。
 * @param {string} text - 原始文本。
 * @returns {string[]} token 列表（保留重复，供词频统计）。
 */
export function tokenize(text) {
  const out = []
  const source = String(text ?? '').toLowerCase()
  const re = /[a-z0-9_]+|[\u3400-\u9fff]+/g
  let match
  while ((match = re.exec(source)) !== null) {
    const piece = match[0]
    if (/^[a-z0-9_]+$/.test(piece)) {
      out.push(piece)
      continue
    }
    for (let i = 0; i < piece.length; i++) {
      out.push(piece[i])
      if (i + 1 < piece.length) out.push(piece.slice(i, i + 2))
    }
  }
  return out
}

/**
 * 计算单文档的加权词频与长度。
 * @param {SearchDoc} doc - { title, summary?, tags?, body? }。
 * @returns {{tf:Map<string, number>, length:number}} 词频与加权长度。
 */
function weigh(doc) {
  const tf = new Map()
  /**
   * 累加一个字段。
   * @param {string} text - 字段文本。
   * @param {number} weight - 字段权重。
   */
  const add = (text, weight) => {
    for (const token of tokenize(text)) tf.set(token, (tf.get(token) ?? 0) + weight)
  }
  add(doc.title ?? '', 3)
  add(doc.summary ?? '', 2)
  add(Array.isArray(doc.tags) ? doc.tags.join(' ') : '', 2)
  add(doc.body ?? '', 1)
  let length = 0
  for (const value of tf.values()) length += value
  return { tf, length }
}

/**
 * 为命中词生成摘要片段（取正文/摘要中最早出现的位置）。
 * @param {SearchDoc} doc - 文档。
 * @param {string[]} tokens - 查询 token。
 * @returns {string} 片段（可能为空）。
 */
function makeSnippet(doc, tokens) {
  const haystack = String(doc.body ?? doc.summary ?? '').replace(/\s+/g, ' ').trim()
  if (!haystack) return ''
  let at = -1
  for (const token of tokens) {
    const found = haystack.toLowerCase().indexOf(token)
    if (found !== -1 && (at === -1 || found < at)) at = found
  }
  if (at === -1) return haystack.slice(0, SNIPPET_CHARS)
  const start = Math.max(0, at - 40)
  const text = haystack.slice(start, start + SNIPPET_CHARS)
  return `${start > 0 ? '…' : ''}${text}${start + SNIPPET_CHARS < haystack.length ? '…' : ''}`
}

/**
 * 对文档集合做 BM25 排序。
 * @param {Array<{id:string, type:string, path?:string, title:string, summary?:string, tags?:string[], body?:string}>} docs
 *   文档集合。
 * @param {string} query - 查询文本。
 * @param {{limit?:number, offset?:number}} [opts] - 结果上限（默认 50）与分页偏移（默认 0）。
 * @returns {{results:Array<object>, total:number, truncated:boolean}} 排序结果。
 */
export function rankDocuments(docs, query, opts = {}) {
  const limit = Math.max(1, Math.floor(opts.limit ?? 50))
  const offset = Number.isInteger(opts.offset) && opts.offset > 0 ? opts.offset : 0
  const queryTokens = [...new Set(tokenize(query))]
  if (queryTokens.length === 0 || docs.length === 0) {
    return { results: [], total: 0, truncated: false }
  }

  const prepared = docs.map((doc) => ({ doc, ...weigh(doc) }))
  const avgLength = prepared.reduce((sum, item) => sum + item.length, 0) / prepared.length || 1
  const df = new Map()
  for (const token of queryTokens) {
    let count = 0
    for (const item of prepared) if (item.tf.has(token)) count++
    df.set(token, count)
  }

  const scored = []
  for (const item of prepared) {
    let score = 0
    for (const token of queryTokens) {
      const freq = item.tf.get(token) ?? 0
      if (freq === 0) continue
      const docFreq = df.get(token) ?? 0
      const idf = Math.log(1 + (prepared.length - docFreq + 0.5) / (docFreq + 0.5))
      score += idf * ((freq * (K1 + 1)) / (freq + K1 * (1 - B + B * (item.length / avgLength))))
    }
    if (score <= 0) continue
    scored.push({
      id: item.doc.id,
      type: item.doc.type,
      path: item.doc.path ?? '',
      title: item.doc.title,
      score: Math.round(score * 1000) / 1000,
      snippet: makeSnippet(item.doc, queryTokens),
    })
  }

  scored.sort((a, b) => (b.score - a.score)
    || String(a.path).localeCompare(String(b.path))
    || String(a.title).localeCompare(String(b.title)))
  return {
    results: scored.slice(offset, offset + limit),
    total: scored.length,
    truncated: scored.length > offset + limit,
  }
}
