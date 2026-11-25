/**
 * 模块依赖边提取（纯函数）。
 *
 * 从源码提取 import/require/from-import 语句，产出"specifier + 行号 +
 * 具名符号"的引用记录。indexer 再把相对 specifier 解析为实际文件路径，
 * 形成符号级交叉引用边（方案 §5-3：变更传导分两级，符号级引用数据在
 * 索引期用 AST/导入表生成）。
 */

/**
 * 一条模块引用记录。
 * @typedef {Object} ImportInfo
 * @property {string} specifier - 源码中的原始模块说明符（如 './foo'、'react'、'.pkg.mod'）。
 * @property {number} line - 语句所在行（1-based）。
 * @property {'import'|'export-from'|'require'} kind - 引用形态。
 * @property {boolean} relative - 是否相对引用（决定能否解析为本地文件边）。
 * @property {string[]} imported - 具名导入符号列表（用于符号级引用边）。
 */

/**
 * 判断 JS/TS specifier 是否为相对路径。
 * @param {string} specifier - 模块说明符。
 * @returns {boolean} 以 ./ 或 ../ 开头即为相对。
 */
function isJsRelative(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../')
}

/**
 * 从一行 JS/TS 提取具名导入符号列表。
 * @param {string} line - 源码行。
 * @returns {string[]} 去重后的导入符号名（含 as 别名的原名；`* as x` 记为 '*'）。
 */
function jsImportedNames(line) {
  const names = new Set()
  // import { a, b as c } from '...' —— 只取 from 之前的花括号段
  const brace = /\{(?<body>[^}]*)\}/.exec(line)
  if (brace) {
    for (const part of brace.groups.body.split(',')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      // 去掉 type 修饰（TS `import type { T }`）与 as 别名
      const cleaned = trimmed.replace(/^type\s+/, '').replace(/\s+as\s+[\w$]+$/, '')
      if (cleaned) names.add(cleaned)
    }
  } else if (/\*\s+as\s+[\w$]+/.test(line)) {
    names.add('*')
  }
  return [...names]
}

/**
 * 提取 JS/TS 的 import / export-from / require 引用。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractJsImports(lines) {
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // import ... from 'mod' / import 'mod' / import type ... from 'mod'
    const im = /^\s*import\s+(?:type\s+)?(?<clause>[^;]*?)\s*from\s*['"](?<mod>[^'"]+)['"]/.exec(line)
    if (im) {
      const mod = im.groups.mod
      result.push({
        specifier: mod,
        line: i + 1,
        kind: 'import',
        relative: isJsRelative(mod),
        imported: jsImportedNames(im.groups.clause.startsWith('{') ? line : im.groups.clause),
      })
      continue
    }
    // 副作用 import：import 'mod'
    const sm = /^\s*import\s*['"](?<mod>[^'"]+)['"]/.exec(line)
    if (sm) {
      result.push({
        specifier: sm.groups.mod,
        line: i + 1,
        kind: 'import',
        relative: isJsRelative(sm.groups.mod),
        imported: [],
      })
      continue
    }
    // export { x } from 'mod' / export * from 'mod'
    const em = /^\s*export\s+(?:(?:type\s+)?\{[^}]*\}|\*)\s*(?:as\s+[\w$]+\s*)?from\s*['"](?<mod>[^'"]+)['"]/.exec(line)
    if (em) {
      result.push({
        specifier: em.groups.mod,
        line: i + 1,
        kind: 'export-from',
        relative: isJsRelative(em.groups.mod),
        imported: jsImportedNames(line),
      })
      continue
    }
    // require('mod') 与动态 import('mod')：逐字符正则捕获字符串字面量
    for (const re of [/\brequire\s*\(\s*['"](?<mod>[^'"]+)['"]\s*\)/g, /\bimport\s*\(\s*['"](?<mod>[^'"]+)['"]\s*\)/g]) {
      let m
      while ((m = re.exec(line)) !== null) {
        result.push({
          specifier: m.groups.mod,
          line: i + 1,
          kind: 'require',
          relative: isJsRelative(m.groups.mod),
          imported: [],
        })
      }
    }
  }
  return result
}

/**
 * 提取 Python 的 import / from-import 引用。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractPythonImports(lines) {
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    // from .pkg.mod import a, b as c
    const fm = /^from\s+(?<mod>[.\w]+)\s+import\s+(?<names>.+)$/.exec(trimmed)
    if (fm) {
      const mod = fm.groups.mod
      const imported = fm.groups.names
        .split(',')
        .map(s => s.trim().replace(/\s+as\s+\w+$/, '').replace(/^\*/, ''))
        .filter(s => s && !s.startsWith('#'))
      result.push({
        specifier: mod,
        line: i + 1,
        kind: 'import',
        // 以点开头的相对 import（from . import x / from ..pkg import y）
        relative: mod.startsWith('.'),
        imported,
      })
      continue
    }
    // import a.b.c as d
    const im = /^import\s+(?<mod>[\w.]+)/.exec(trimmed)
    if (im) {
      result.push({
        specifier: im.groups.mod,
        line: i + 1,
        kind: 'import',
        relative: false,
        imported: [],
      })
    }
  }
  return result
}

/**
 * 从源码提取模块引用（纯函数入口）。
 * @param {string} code - 源码文本。
 * @param {string} lang - 语言标识。
 * @returns {ImportInfo[]} 引用记录；不支持的语言返回空数组。
 */
export function extractImports(code, lang) {
  if (typeof code !== 'string' || code.length === 0) return []
  const lines = code.replace(/\r\n?/g, '\n').split('\n')
  if (lang === 'python') return extractPythonImports(lines)
  if (lang === 'javascript' || lang === 'typescript') return extractJsImports(lines)
  return []
}
