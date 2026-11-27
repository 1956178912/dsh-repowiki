// @ts-check
/**
 * .gitignore 子集匹配（零依赖，索引遍历用）。
 *
 * 支持：
 * - 注释 `#` 与空行；
 * - `!` 否定（按顺序 last-match-wins）；
 * - `/` 锚定（相对所在 .gitignore 目录）；
 * - 目录尾 `/`（只匹配目录，遍历时直接剪枝）；
 * - `*`、`?`、`**` 通配；
 * - 嵌套 `.gitignore` / `.repowikiignore`：规则只作用于其所在目录子树，
 *   更深目录的规则后置生效（与 Git 的层级优先级一致）。
 *
 * 不支持（有意，文档化）：全局 excludes、反斜杠转义、字符类 `[a-z]`
 * （按字面处理）。需要更复杂规则时用 plan 的 exclude。
 */

/** 正则元字符转义（保留我们自行展开的通配符）。 */
const RE_META = /[.+^${}()|[\]\\]/g

/**
 * @typedef {{pattern:string, negated:boolean, dirOnly:boolean, anchored:boolean,
 *   base:string}} IgnoreRule 规则（base 为规则所在目录，根为空串）。
 */

/**
 * 把 glob 片段转成正则源码。
 * @param {string} glob - 已去锚定/尾斜杠的模式。
 * @returns {string} 正则源码。
 */
function globToRegex(glob) {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `**/` 匹配零或多级目录；`/**` 匹配任意剩余路径
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?'
          i += 2
        } else {
          out += '.*'
          i += 1
        }
      } else {
        out += '[^/]*'
      }
    } else if (ch === '?') {
      out += '[^/]'
    } else {
      out += ch.replace(RE_META, '\\$&')
    }
  }
  return out
}

/**
 * 把一行文本解析为忽略规则。
 * @param {string} text - .gitignore 文本。
 * @param {string} [base] - 规则所在目录（相对项目根的 POSIX 路径；根为空）。
 * @returns {IgnoreRule[]} 规则。
 */
export function parseIgnore(text, base = '') {
  const scope = String(base).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const rules = []
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    let pattern = line
    const negated = pattern.startsWith('!')
    if (negated) pattern = pattern.slice(1).trim()
    if (!pattern) continue
    const dirOnly = pattern.endsWith('/')
    if (dirOnly) pattern = pattern.slice(0, -1)
    const anchored = pattern.startsWith('/')
    if (anchored) pattern = pattern.slice(1)
    if (!pattern) continue
    rules.push({ pattern, negated, dirOnly, anchored, base: scope })
  }
  return rules
}

/**
 * 某条规则是否命中路径。
 * @param {IgnoreRule} rule - 单条规则。
 * @param {string} relPath - 相对仓库根的 POSIX 路径。
 * @param {boolean} isDir - 是否目录。
 * @returns {boolean} 命中。
 */
function ruleMatches(rule, relPath, isDir) {
  // 嵌套规则只作用于所在目录的内容（不含该目录自身），模式相对该目录。
  let target = relPath
  if (rule.base) {
    const prefix = `${rule.base}/`
    if (!relPath.startsWith(prefix)) return false
    target = relPath.slice(prefix.length)
  }
  if (rule.dirOnly && !isDir) {
    // 目录规则对文件生效的唯一方式：文件的某个祖先目录命中
    const innerRule = { ...rule, dirOnly: false, base: '' }
    const parts = target.split('/')
    parts.pop()
    let ancestor = ''
    for (const part of parts) {
      ancestor = ancestor ? `${ancestor}/${part}` : part
      if (ruleMatches(innerRule, ancestor, true)) return true
    }
    return false
  }
  const hasSlash = rule.pattern.includes('/')
  if (rule.anchored || hasSlash) {
    return new RegExp(`^${globToRegex(rule.pattern)}$`).test(target)
  }
  // 无斜杠：匹配任意一段（文件名或目录名）
  const segments = target.split('/')
  return segments.some(segment => new RegExp(`^${globToRegex(rule.pattern)}$`).test(segment))
}

/**
 * 判断路径是否被忽略（last-match-wins）。
 * @param {string} relPath - 相对仓库根 POSIX 路径。
 * @param {boolean} isDir - 是否目录。
 * @param {IgnoreRule[]} rules - parseIgnore 结果（按文件顺序拼接）。
 * @returns {boolean} 忽略时为 true。
 */
export function isIgnored(relPath, isDir, rules) {
  let ignored = false
  for (const rule of rules) {
    if (!ruleMatches(rule, relPath, isDir)) continue
    ignored = !rule.negated
  }
  return ignored
}

/**
 * 读取仓库根的 .gitignore 与 .repowikiignore。
 * 读取失败不阻断索引：返回 warnings 供工具结果透出。
 * @param {FsService} fs - ctx.fs 服务。
 * @param {string} root - 仓库根绝对路径。
 * @returns {Promise<{rules:IgnoreRule[], warnings:string[]}>} 规则与告警。
 */
/**
 * 读取某个目录的 .gitignore/.repowikiignore（根与嵌套目录共用）。
 * @param {any} fs - ctx.fs 服务。
 * @param {string} root - 规则所在目录（绝对路径或 fs 可解析的路径）。
 * @param {string} [base] - 目录相对项目根的 POSIX 路径（根为空）。
 * @returns {Promise<{rules:IgnoreRule[], warnings:string[]}>} 规则与告警。
 */
export async function loadIgnoreRules(fs, root, base = '') {
  const rules = []
  const warnings = []
  for (const name of ['.gitignore', '.repowikiignore']) {
    try {
      const target = await fs.resolve(name, { cwd: root })
      const info = await fs.stat(target)
      if (info?.type !== 'file') continue
      const text = await fs.readText(target)
      rules.push(...parseIgnore(text, base))
    } catch (err) {
      // 不存在是常态；其它错误记录告警但不阻断
      if (err && err.code && err.code !== 'ENOENT' && !/not found/i.test(err.message ?? '')) {
        warnings.push(`${name}: ${err.message ?? 'unreadable'}`)
      }
    }
  }
  return { rules, warnings }
}
