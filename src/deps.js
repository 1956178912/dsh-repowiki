/**
 * 模块依赖边提取（纯函数）。
 *
 * 从源码提取 import/require/from-import 语句，产出"specifier + 行号 +
 * 具名符号"的引用记录。indexer 再把相对 specifier 解析为实际文件路径，
 * 形成符号级交叉引用边（方案 §5-3：变更传导分两级，符号级引用数据在
 * 索引期用 AST/导入表生成）。
 */

import { scriptBlockText } from './sfc.js'
import {
  shellScan, juliaScan, nimScan, ocamlScan, haskellScan, erlangScan, solidityScan,
  clojureScan, hclScan, groovyScan, powershellScan, fortranScan, perlScan, pascalScan,
  nixScan, vbnetScan, tclScan, fsharpScan, adaScan, verilogScan, objcScan,
} from './symbols.js'

/**
 * 一条模块引用记录。
 * @typedef {Object} ImportInfo
 * @property {string} specifier - 源码中的原始模块说明符（如 './foo'、'react'、'.pkg.mod'）。
 * @property {number} line - 语句所在行（1-based）。
 * @property {'import'|'export-from'|'require'|'mod'|'reexport'|'part'} kind - 引用形态
 *   （`mod` 仅 Rust：`mod foo;` 模块声明；`reexport` 仅 Rust `pub use`；
 *   `part` 仅 Dart：`part 'x.dart';` 把 part 文件并入当前库）。
 * @property {boolean} relative - 是否作为本地文件边的候选（JS/Python 为
 *   相对路径语义；Go/Rust/Java 中表示"需尝试本地解析"，解析失败即忽略）。
 * @property {string[]} imported - 具名导入符号列表（用于符号级引用边）。
 * @property {Array<{from:string, to:string}>} [aliases] - 导入/再导出别名：
 *   `from` 为目标符号原名，`to` 为本地绑定名或 barrel 导出名（JS/Rust/
 *   Python 再导出与导入、C#/Kotlin 导入别名）。
 * @property {string[]} [hidden] - 星号导入的排除名（仅 Dart `hide`）：
 *   这些符号不参与潜在引用归因。
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
 * 从一条 JS/TS import/export 语句提取具名导入符号列表。
 * @param {string} line - 源码语句（可跨行）。
 * @returns {string[]} 去重后的导入符号名（含 as 别名的原名；`* as x` 记为 '*'）。
 */
function jsImportedNames(line) {
  const names = new Set()
  const cleanLine = line.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')
  // import { a, b as c } from '...' —— 只取 from 之前的花括号段
  const brace = /\{(?<body>[^}]*)\}/.exec(cleanLine)
  if (brace) {
    for (const part of brace.groups.body.split(',')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      // 去掉 type 修饰（TS `import type { T }`）与 as 别名
      const cleaned = trimmed.replace(/^type\s+/, '').replace(/\s+as\s+[\w$]+$/, '')
      if (cleaned) names.add(cleaned)
    }
  } else if (/\*\s+as\s+[\w$]+/.test(cleanLine)) {
    names.add('*')
  }
  return [...names]
}

/**
 * 从 `import { a as b }` / `export { a as b } from` 提取花括号内的
 * 别名映射（原名 → 本地/导出名）。无别名、`*` 与注释内容不产生条目。
 * @param {string} line - 源码语句（可跨行）。
 * @returns {Array<{from:string, to:string}>} 别名映射。
 */
function jsBraceAliases(line) {
  const cleanLine = line.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')
  const brace = /\{(?<body>[^}]*)\}/.exec(cleanLine)
  if (!brace) return []
  const out = []
  for (const part of brace.groups.body.split(',')) {
    const trimmed = part.trim().replace(/^type\s+/, '')
    if (!trimmed) continue
    const m = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(trimmed)
    if (m && m[1] !== m[2]) out.push({ from: m[1], to: m[2] })
  }
  return out
}

/** 默认导入的临时符号前缀；索引器解析为真实导出名后不会留在索引里。 */
export const JS_DEFAULT_PREFIX = 'default:'

/**
 * 从 import 子句提取默认导入的本地绑定名。
 * 支持 `Foo`、`Foo, { a }`、`Foo, * as ns` 与 `type Foo`；无默认导入返回空串。
 * @param {string} clause - `import` 与 `from` 之间的文本。
 * @returns {string} 本地绑定名；无默认导入时为空串。
 */
function jsDefaultLocalName(clause) {
  const text = String(clause ?? '').trim().replace(/^type\s+/, '')
  if (!text || text.startsWith('{') || text.startsWith('*')) return ''
  const head = text.split(',')[0].trim()
  return /^[A-Za-z_$][\w$]*$/.test(head) ? head : ''
}

/**
 * 提取 JS/TS 的 import / export-from / require 引用。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractJsImports(lines) {
  const result = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    let statementEnd = i
    // 常见的格式化多行具名导入/导出：import {\n a,\n b\n} from './x'。
    // 只拼接以 { 结束的静态语句头，保留起始行号；避免把动态 import 或任意
    // 后续代码吞进来。100 行上限保证畸形文件也有界。
    if (/^\s*(?:import|export)\b/.test(line) && /\{\s*$/.test(line)) {
      const end = Math.min(lines.length, i + 100)
      for (let j = i + 1; j < end; j++) {
        line += `\n${lines[j]}`
        statementEnd = j
        if (/\bfrom\s*['"][^'"]+['"]/.test(line) || /;/.test(lines[j])) break
      }
    }
    // import ... from 'mod' / import 'mod' / import type ... from 'mod'
    const im = /^\s*import\s+(?:type\s+)?(?<clause>[^;]*?)\s*from\s*['"](?<mod>[^'"]+)['"]/.exec(line)
    if (im) {
      const mod = im.groups.mod
      const imported = jsImportedNames(im.groups.clause.startsWith('{') ? line : im.groups.clause)
      const defaultLocal = jsDefaultLocalName(im.groups.clause)
      if (defaultLocal) imported.unshift(`${JS_DEFAULT_PREFIX}${defaultLocal}`)
      const aliases = jsBraceAliases(line)
      result.push({
        specifier: mod,
        line: i + 1,
        kind: 'import',
        relative: isJsRelative(mod),
        imported,
        ...(aliases.length > 0 ? { aliases } : {}),
      })
      i = statementEnd
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
    // export { x } from 'mod' / export * from 'mod' / export * as ns from 'mod'
    const em = /^\s*export\s+(?:(?:type\s+)?\{[^}]*\}|\*)\s*(?:as\s+[\w$]+\s*)?from\s*['"](?<mod>[^'"]+)['"]/.exec(line)
    if (em) {
      // `export * from` 再导出目标文件的全部符号；`export * as ns from`
      // 只导出一个命名空间对象（ns 是 barrel 自身的新绑定），不展开目标
      // 符号，因此不记通配符（避免下游具名导入误归到目标文件）。
      const starNamespace = /^\s*export\s+\*\s+as\s+[\w$]+\s+from\b/.test(line)
      const reexportAll = !starNamespace && /^\s*export\s+\*\s*from\b/.test(line)
      const aliases = reexportAll || starNamespace ? [] : jsBraceAliases(line)
      result.push({
        specifier: em.groups.mod,
        line: i + 1,
        kind: 'export-from',
        relative: isJsRelative(em.groups.mod),
        imported: starNamespace ? [] : (reexportAll ? ['*'] : jsImportedNames(line)),
        ...(aliases.length > 0 ? { aliases } : {}),
      })
      i = statementEnd
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
      const imported = []
      const aliases = []
      for (const raw of fm.groups.names.split(',')) {
        const part = raw.trim().replace(/\s+#.*$/, '')
        if (!part || part.startsWith('#')) continue
        if (part === '*') {
          imported.push('*')
          continue
        }
        const m = /^([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?$/.exec(part)
        if (!m) continue
        imported.push(m[1])
        if (m[2] && m[2] !== m[1]) aliases.push({ from: m[1], to: m[2] })
      }
      result.push({
        specifier: mod,
        line: i + 1,
        kind: 'import',
        // 以点开头的相对 import（from . import x / from ..pkg import y）
        relative: mod.startsWith('.'),
        imported,
        ...(aliases.length > 0 ? { aliases } : {}),
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
 * 提取 Go 的 import（单条与括号分组，支持别名/点/空白导入）。
 * Go 的 import 路径是包路径而非文件路径；是否本地由 indexer 按 go.mod
 * 的 module 前缀判定（此处 relative 标记为"候选"）。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractGoImports(lines) {
  const result = []
  let inBlock = false
  /**
   * 登记一条 import 行。
   * @param {string} text - 去掉首尾空白的行。
   * @param {number} line - 行号（1-based）。
   * @returns {void}
   */
  const push = (text, line) => {
    const m = /^(?:(?<alias>[\w.]+)\s+)?["`](?<mod>[^"`]+)["`]/.exec(text)
    if (!m) return
    const mod = m.groups.mod
    const segments = mod.split('/')
    const localName = segments[segments.length - 1] || ''
    const alias = m.groups.alias
    // Go 导入语义：`_` 仅触发包初始化（无符号引用）；`.` 把包内导出符号
    // 带入当前作用域（按 `*` 潜在引用处理）；普通别名记录包名近似原名 →
    // 本地名，供词法使用点扫描。
    let imported = localName ? [localName] : []
    if (alias === '_') imported = []
    else if (alias === '.') imported = ['*']
    const aliases = alias && alias !== '_' && alias !== '.' && localName && alias !== localName
      ? [{ from: localName, to: alias }]
      : []
    result.push({
      specifier: mod,
      line,
      kind: 'import',
      // 候选本地包；indexer 按 go.mod module 前缀过滤
      relative: true,
      imported,
      ...(aliases.length > 0 ? { aliases } : {}),
    })
  }
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('//')) continue
    if (!inBlock && /^import\s*\(\s*$/.test(trimmed)) {
      inBlock = true
      continue
    }
    if (inBlock) {
      if (trimmed === ')') { inBlock = false; continue }
      push(trimmed, i + 1)
      continue
    }
    if (/^import\s/.test(trimmed)) push(trimmed.replace(/^import\s+/, ''), i + 1)
  }
  return result
}

/**
 * 按顶层逗号切分 Rust use 分组体（忽略嵌套花括号中的逗号）。
 * @param {string} body - 花括号内的文本。
 * @returns {string[]} 顶层条目。
 */
function splitRustUseBody(body) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of body) {
    if (ch === '{') depth++
    else if (ch === '}') depth--
    if (ch === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

/**
 * 展开 Rust use 树为完整路径列表（支持嵌套分组与 as 别名）。
 * @param {string} prefix - 当前路径前缀（如 'crate::lexer'）。
 * @param {string} body - 当前层条目文本（可含嵌套 `{}`）。
 * @returns {{path:string, name:string}[]} 叶子路径与导入名。
 */
function expandRustUse(prefix, body) {
  const out = []
  for (const part of splitRustUseBody(body)) {
    const braceAt = part.indexOf('{')
    if (braceAt === -1) {
      const [rawPath, alias] = part.split(/\s+as\s+/)
      const pathPart = rawPath.trim()
      if (!pathPart) continue
      // `use a::b::{self}` 等价于 `use a::b;`：路径去掉 ::self，
      // 导入名是模块名（与普通模块导入一致，供使用点扫描模块名）
      if (pathPart === 'self') {
        if (!prefix) continue
        const local = (prefix.split('::').pop() ?? '').trim()
        if (!local) continue
        const aliasName = (alias ?? local).trim()
        out.push({
          path: prefix,
          name: /^[A-Za-z_]\w*$/.test(aliasName) ? aliasName : local,
          local,
        })
        continue
      }
      const path = prefix ? `${prefix}::${pathPart}` : pathPart
      const local = (pathPart.split('::').pop() ?? '').trim()
      const leaf = (alias ?? local).trim()
      const empty = leaf === 'self' || leaf === 'super'
      out.push({ path, name: empty ? '' : leaf, local: empty ? '' : local })
      continue
    }
    const head = part.slice(0, braceAt).replace(/::$/, '').trim()
    const inner = part.slice(braceAt + 1, part.lastIndexOf('}'))
    const nextPrefix = head ? (prefix ? `${prefix}::${head}` : head) : prefix
    out.push(...expandRustUse(nextPrefix, inner))
  }
  return out
}

/**
 * 提取 Rust 的 mod 声明与 use 引用。
 * - `mod foo;` 记为 kind='mod'，indexer 按文件所在模块目录解析；
 * - `use crate::a::b::C;` / `use super::x;` / `use self::y;` 标记为候选，
 *   由 indexer 从 crate 根/当前模块目录做启发式解析；
 * - 嵌套分组（`use crate::{a, b::{C, D}}`）展开为多条叶子路径；
 * - 外部 crate 的 use 也会尝试解析，失败即不计边（不影响正确性）。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractRustImports(lines) {
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('//')) continue
    // mod foo; / pub mod foo;
    const mm = /^(?:pub(?:\([^)]*\))?\s+)?mod\s+(?<name>[A-Za-z_]\w*)\s*;/.exec(trimmed)
    if (mm) {
      result.push({
        specifier: mm.groups.name,
        line: i + 1,
        kind: 'mod',
        relative: true,
        imported: [],
      })
      continue
    }
    // use path::to::Item; / pub use path::{A, B};
    const um = /^(?<pub>pub(?:\([^)]*\))?\s+)?use\s+(?<path>[^;]+);/.exec(trimmed)
    if (!um) continue
    // `pub use` 是显式再导出（引用/使用点/影响面可沿链归到定义文件）
    const kind = um.groups.pub ? 'reexport' : 'import'
    const raw = um.groups.path.trim()
    const braceAt = raw.indexOf('{')
    if (braceAt === -1) {
      const [rawPath, alias] = raw.split(/\s+as\s+/)
      let specifier = rawPath.trim()
      if (!specifier) continue
      // `pub use crate::core::*;`：通配符不进入路径，符号记为 `*`
      const star = specifier.endsWith('::*')
      if (star) specifier = specifier.slice(0, -3)
      const local = (specifier.split('::').pop() ?? '').trim()
      const leaf = (alias ?? local).trim()
      const valid = /^[A-Za-z_]\w*$/.test(leaf) && leaf !== 'self' && leaf !== 'super'
      const validLocal = /^[A-Za-z_]\w*$/.test(local) && local !== 'self' && local !== 'super'
      // 统一记录目标原名；`as` 本地名进入 aliases（引用归到原名，使用点按本地名扫描）
      const imported = star ? ['*'] : (validLocal ? [local] : [])
      const aliases = valid && validLocal && local !== leaf ? [{ from: local, to: leaf }] : []
      result.push({
        specifier,
        line: i + 1,
        kind,
        relative: true,
        imported,
        ...(aliases.length > 0 ? { aliases } : {}),
      })
      continue
    }
    const prefix = raw.slice(0, braceAt).replace(/::$/, '').trim()
    const body = raw.slice(braceAt + 1, raw.lastIndexOf('}'))
    for (const leaf of expandRustUse(prefix, body)) {
      const star = leaf.name === '*'
      const valid = /^[A-Za-z_]\w*$/.test(leaf.name)
      const validLocal = /^[A-Za-z_]\w*$/.test(leaf.local)
      const imported = star ? ['*'] : (validLocal ? [leaf.local] : [])
      const aliases = valid && validLocal && leaf.local !== leaf.name
        ? [{ from: leaf.local, to: leaf.name }]
        : []
      result.push({
        specifier: star ? leaf.path.replace(/::\*$/, '') : leaf.path,
        line: i + 1,
        kind,
        relative: true,
        imported,
        ...(aliases.length > 0 ? { aliases } : {}),
      })
    }
  }
  return result
}

/**
 * 提取 Java 的 import（含 static 与通配符）。
 * Java 的包路径是全局命名，是否本地由 indexer 用已索引文件的包路径后缀匹配。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractJavaImports(lines) {
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*import\s+(?<static>static\s+)?(?<spec>[\w$.*]+)\s*;/.exec(lines[i])
    if (!m) continue
    const spec = m.groups.spec
    const segments = spec.split('.')
    const last = segments[segments.length - 1] || ''
    let specifier = spec
    let imported = []
    if (m.groups.static) {
      // `import static a.b.C.member;`：依赖边指向类文件，符号归到成员名
      // （方法/字段），比归到类名更精确；`import static a.b.C.*;` 把类的
      // 全部静态成员带入作用域，按潜在通配引用处理。
      specifier = segments.slice(0, -1).join('.')
      if (last === '*') imported = ['*']
      else if (/^[A-Za-z_$][\w$]*$/.test(last)) imported = [last]
    } else if (last !== '*') {
      // 普通导入：取最后一个大写段作为类型名（通配导入保持空符号）
      const typeName = [...segments].reverse().find(s => /^[A-Z][\w$]*$/.test(s))
      if (typeName) imported = [typeName]
    }
    result.push({
      specifier,
      line: i + 1,
      kind: 'import',
      relative: true,
      imported,
    })
  }
  return result
}

/**
 * 提取 C# 的 using 指令（含 global / static / 别名）。
 *
 * 语义约定：
 * - `using static System.Math;` 把 Math 的全部静态成员带入作用域，
 *   与 Java/Groovy 的静态通配一致，按 `*` 潜在引用记账（不臆造成员名）；
 *   依赖边仍指向 Math 的类文件。
 * - `using Alias = App.Models.User;` 引用归到原名，别名进入 aliases，
 *   词法使用点按本地名扫描（与 JS/Rust 导入别名同一约定）。
 * - `global::` 限定符只影响名称解析，提取前剥离，避免整条指令丢失。
 * - `using (var x = …)` / `using var x = …` 是资源语句而非指令，不匹配。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractCSharpImports(lines) {
  const result = []
  for (let i = 0; i < lines.length; i++) {
    // `global::System.Math` 与 `System.Math` 指向同一实体，剥离限定符后统一解析
    const code = lines[i].replace(/\bglobal\s*::\s*/g, '')
    const m = /^\s*(?:global\s+)?using\s+(?:(?<static>static)\s+)?(?:(?<alias>[A-Za-z_]\w*)\s*=\s*)?(?<path>[\w.]+)\s*;/.exec(code)
    if (!m) continue
    const specifier = m.groups.path
    const segments = specifier.split('.')
    const original = segments[segments.length - 1]
    const alias = m.groups.alias
    const aliases = alias && original && alias !== original
      ? [{ from: original, to: alias }]
      : []
    // 静态导入是成员导入：符号级证据只能是"该类型的静态成员之一"
    const imported = m.groups.static ? ['*'] : (original ? [original] : [])
    result.push({
      specifier,
      line: i + 1,
      kind: 'import',
      relative: true,
      imported,
      ...(aliases.length > 0 ? { aliases } : {}),
    })
  }
  return result
}

/**
 * 提取 Kotlin 的 import（含通配符与 as 别名）。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractKotlinImports(lines) {
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*import\s+(?<path>[\w.]+(?:\.\*)?)\s*(?:as\s+(?<alias>[A-Za-z_]\w*))?\s*$/.exec(lines[i])
    if (!m) continue
    const specifier = m.groups.path
    const last = specifier.split('.').pop()
    const named = Boolean(last && last !== '*')
    // `import a.b.C as D`：引用归到 C，本地名 D 进入 aliases 供使用点扫描
    const alias = m.groups.alias
    const aliases = named && alias && alias !== last ? [{ from: last, to: alias }] : []
    result.push({
      specifier,
      line: i + 1,
      kind: 'import',
      relative: true,
      imported: named ? [last] : [],
      ...(aliases.length > 0 ? { aliases } : {}),
    })
  }
  return result
}

/**
 * 提取 PHP 的 use（含分组、function/const、别名）与字面量 require/include。
 * 命名空间反斜杠统一归一为点号，供点分路径索引匹配。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractPhpImports(lines) {
  const result = []
  /**
   * 登记一条导入：引用归到原名，`as` 本地别名写入 aliases。
   * @param {string} specifier - 点分说明符。
   * @param {string} original - 原名（叶子标识符）。
   * @param {string|undefined} alias - `as` 后的本地名。
   * @param {number} line - 行号。
   * @returns {void}
   */
  const pushEntry = (specifier, original, alias, line) => {
    if (!original) return
    const aliases = alias && alias !== original ? [{ from: original, to: alias }] : []
    result.push({
      specifier,
      line,
      kind: 'import',
      relative: true,
      imported: [original],
      ...(aliases.length > 0 ? { aliases } : {}),
    })
  }
  /**
   * 登记一条 use 叶子。
   * @param {string} prefix - 命名空间前缀（点分，可为空）。
   * @param {string} leaf - 叶子名（可含 `as` 别名）。
   * @param {number} line - 行号。
   * @returns {void}
   */
  const push = (prefix, leaf, line) => {
    // 分组 use 内可混写 `function f` / `const C`，修饰词不是名字的一部分
    const trimmed = leaf.trim().replace(/^(?:function|const)\s+/i, '')
    const m = /^(?<name>[\\\w]+)\s*(?:as\s+(?<alias>\w+))?$/.exec(trimmed)
    if (!m) return
    const original = m.groups.name.replace(/^\\+/, '')
    if (!original) return
    const specifier = (prefix ? `${prefix}.` : '') + original.replace(/\\/g, '.')
    pushEntry(specifier, original.split('\\').pop(), m.groups.alias, line)
  }
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('#')) continue
    // 字面量 require/include（支持 __DIR__ . '/path' 与 ./../ 相对路径）
    const rm = /^(?:require|require_once|include|include_once)\s*\(?\s*(?<dir>__DIR__\s*\.\s*)?['"](?<path>[^'"]+)['"]/.exec(trimmed)
    if (rm) {
      let specifier = rm.groups.path
      const hasDir = Boolean(rm.groups.dir)
      if (hasDir) specifier = specifier.startsWith('/') ? `.${specifier}` : `./${specifier}`
      const relative = hasDir || specifier.startsWith('.')
      result.push({
        specifier,
        line: i + 1,
        kind: 'require',
        relative,
        imported: [],
      })
      continue
    }
    const um = /^use\s+(?:(?:function|const)\s+)?(?<path>[\\\w.]+)(?<group>\\?\{[^}]*\})?\s*(?:as\s+(?<alias>\w+))?\s*;/.exec(trimmed)
    if (!um) continue
    const rawPath = um.groups.path.replace(/^\\+/, '')
    if (um.groups.group) {
      const prefix = rawPath.replace(/\\+$/, '').replace(/\\/g, '.')
      for (const leaf of um.groups.group.replace(/^\\?\{|\}$/g, '').split(',')) push(prefix, leaf, i + 1)
    } else {
      const dotted = rawPath.replace(/\\/g, '.')
      pushEntry(dotted, dotted.split('.').pop(), um.groups.alias, i + 1)
    }
  }
  return result
}

/**
 * 提取 Ruby 的 require / require_relative / load。
 * require_relative 与 `./`/`../` 前缀按本地文件解析；其余 require 视为 gem/加载路径。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractRubyImports(lines) {
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const m = /^(?<kind>require_relative|require|load)\s*\(?\s*['"](?<mod>[^'"]+)['"]/.exec(trimmed)
    if (!m) continue
    const mod = m.groups.mod
    result.push({
      specifier: mod,
      line: i + 1,
      kind: 'require',
      relative: m.groups.kind === 'require_relative' || mod.startsWith('.'),
      imported: [],
    })
  }
  return result
}

/**
 * 提取 Swift 的 import（含 @testable 与子模块导入）。
 * Swift 的 import 是模块级语义，这里标记为"本地候选"：indexer 按
 * `Sources/<Target>/` 约定把首段模块名解析到目标代表文件；
 * 外部模块（Foundation 等）解析失败即不计边。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractSwiftImports(lines) {
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(?:@testable\s+)?import\s+(?:(?:typealias|struct|class|enum|protocol|func|var|let|operator)\s+)?(?<path>[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/.exec(lines[i])
    if (!m) continue
    result.push({
      specifier: m.groups.path,
      line: i + 1,
      kind: 'import',
      relative: true,
      imported: [],
    })
  }
  return result
}

/**
 * 展开一条 Scala import 声明为叶子路径（支持分组、重命名与 `._`/`.*` 通配）。
 * 重命名（Scala 2 `C => D`、Scala 3 `C as D`）保留原名 `name`，本地名在
 * `alias`；`=> _`/`as _` 表示隐藏该名，不登记。
 * @param {string} raw - import 后的文本（已去分号与注释）。
 * @returns {{path:string, name:string, alias?:string}[]} 叶子路径、导入名
 *   （通配为空串）与可选本地别名。
 */
function expandScalaImport(raw) {
  const asMatch = /^(?<path>[\w.$]+)\s+as\s+(?<alias>\w+)$/.exec(raw)
  if (asMatch) {
    const name = asMatch.groups.path.split('.').pop() ?? ''
    return [{
      path: asMatch.groups.path,
      name: /^[A-Za-z_$][\w$]*$/.test(name) ? name : '',
      alias: asMatch.groups.alias,
    }]
  }

  const braceAt = raw.indexOf('{')
  if (braceAt === -1) {
    if (raw.endsWith('._') || raw.endsWith('.*')) {
      const pkg = raw.slice(0, -2)
      return pkg ? [{ path: pkg, name: '' }] : []
    }
    const name = raw.split('.').pop() ?? ''
    return [{ path: raw, name: /^[A-Za-z_$][\w$]*$/.test(name) ? name : '' }]
  }

  const prefix = raw.slice(0, braceAt).replace(/\.$/, '').trim()
  const body = raw.slice(braceAt + 1, raw.lastIndexOf('}'))
  const out = []
  for (const part of body.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const rename = /^(?<orig>[\w$]+)\s*(?:=>|\bas\b)\s*(?<alias>[\w$]+)$/.exec(trimmed)
    if (rename) {
      if (rename.groups.alias === '_') continue // `C => _` 隐藏该名
      out.push({
        path: `${prefix}.${rename.groups.orig}`,
        name: rename.groups.orig,
        alias: rename.groups.alias,
      })
      continue
    }
    if (trimmed === '_' || trimmed === '*') {
      out.push({ path: prefix, name: '' })
      continue
    }
    out.push({ path: `${prefix}.${trimmed}`, name: trimmed.split('.').pop() || '' })
  }
  return out
}

/**
 * 提取 Scala 的 import（含分组、重命名与通配）。
 * 路径为全局命名空间，是否本地由 indexer 的点分索引后缀匹配决定。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractScalaImports(lines) {
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*import\s+(?<spec>[^\s;].*?)\s*;?\s*$/.exec(lines[i])
    if (!m) continue
    const raw = m.groups.spec.replace(/\/\/.*$/, '').trim()
    if (!raw) continue
    for (const leaf of expandScalaImport(raw)) {
      const aliases = leaf.alias && leaf.name && leaf.alias !== leaf.name
        ? [{ from: leaf.name, to: leaf.alias }]
        : []
      result.push({
        specifier: leaf.path,
        line: i + 1,
        kind: 'import',
        relative: true,
        imported: leaf.name ? [leaf.name] : [],
        ...(aliases.length > 0 ? { aliases } : {}),
      })
    }
  }
  return result
}

/**
 * 提取 C/C++ 的 `#include`：引号形式标记为相对（先查文件目录），
 * 尖括号形式标记为非相对（只经 include 根查找，系统头自然不命中）。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractCppImports(lines) {
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*#\s*include\s*(?:<(?<angle>[^>]+)>|"(?<quote>[^"]+)")/.exec(lines[i])
    if (!m) continue
    const specifier = m.groups.quote ?? m.groups.angle
    result.push({
      specifier,
      line: i + 1,
      kind: 'import',
      relative: m.groups.quote !== undefined,
      imported: [],
    })
  }
  return result
}

/**
 * 去除 Lua 注释（`--` 行注释与 `--[[ ... ]]` 块注释），保留行数。
 * 只服务 import 提取：短字符串内的 `--` 可能被误截断，属已知轻量限制。
 * @param {string[]} lines - 源码行。
 * @returns {string[]} 去注释后的行。
 */
function stripLuaComments(lines) {
  const out = []
  let inBlock = false
  for (const raw of lines) {
    let line = ''
    let index = 0
    while (index < raw.length) {
      if (inBlock) {
        const close = raw.indexOf(']]', index)
        if (close < 0) break
        inBlock = false
        index = close + 2
        continue
      }
      if (raw.startsWith('--[[', index)) { inBlock = true; index += 4; continue }
      if (raw.startsWith('--', index)) break
      line += raw[index]
      index++
    }
    out.push(line)
  }
  return out
}

/**
 * 提取 Lua 的 `require("mod")` / `require 'mod'` 引用。
 * specifier 保持原样（点分模块名由解析层换算为路径）；外部模块不建边
 * 由解析层决定。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractLuaImports(lines) {
  const result = []
  const codeLines = stripLuaComments(lines)
  for (let i = 0; i < codeLines.length; i++) {
    const re = /require\s*\(?\s*(['"])([^'"]+)\1/g
    let match
    while ((match = re.exec(codeLines[i])) !== null) {
      result.push({
        specifier: match[2],
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
 * 掩码一行 Zig 代码：注释截断、多行字符串截断，字符串/字符字面量内容
 * 替换为空格（保留引号与列位置），用于在代码区定位 `@import`。
 * @param {string} raw - 源码行。
 * @returns {{masked:string, original:string}} 掩码行与原行。
 */
function maskZigLine(raw) {
  let masked = ''
  let quote = null
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (quote) {
      if (ch === '\\') { masked += '  '; i++; continue }
      if (ch === quote) { quote = null; masked += ch; continue }
      masked += ' '
      continue
    }
    if (ch === '/' && raw[i + 1] === '/') break
    if (ch === '\\' && raw[i + 1] === '\\') break
    if (ch === '"' || ch === "'") { quote = ch; masked += ch; continue }
    masked += ch
  }
  return { masked, original: raw }
}

/**
 * 提取 Zig 的 `@import("x.zig")` 引用。
 * `@cImport`/`@cInclude` 是 C 头文件桥接，不指向索引内文件，不提取。
 * specifier 保持原样（相对当前文件的路径由解析层换算）。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractZigImports(lines) {
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const { masked, original } = maskZigLine(lines[i])
    const re = /@import\s*\(\s*/g
    let match
    while ((match = re.exec(masked)) !== null) {
      const lit = /^"((?:[^"\\]|\\.)*)"/.exec(original.slice(match.index + match[0].length))
      if (!lit) continue
      const specifier = lit[1].replace(/\\(["\\])/g, '$1')
      result.push({
        specifier,
        line: i + 1,
        kind: 'import',
        relative: specifier.endsWith('.zig'),
        imported: [],
      })
    }
  }
  return result
}

/**
 * 去除 Gleam 行注释（`//`；字符串内的 `//` 不截断）。
 * @param {string} line - 源码行。
 * @returns {string} 去注释后的行。
 */
function stripGleamComment(line) {
  let inString = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inString) {
      if (ch === '\\') { i++; continue }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '/' && line[i + 1] === '/') return line.slice(0, i)
  }
  return line
}

/**
 * 提取 Gleam 的 `import package/module` 引用。
 * 支持 `as` 别名与 `.{type Foo, Bar as B}` 未限定导入；模块路径原样
 * 保留，由解析层按 `src/`/`test/` 源根换算为 `.gleam` 文件。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractGleamImports(lines) {
  const result = []
  const re = /^\s*import\s+([a-z][\w]*(?:\/[\w]+)*)(?:\s+as\s+[\w]+)?(?:\s*\.\{([^}]*)\})?/
  for (let i = 0; i < lines.length; i++) {
    let code = stripGleamComment(lines[i])
    if (!/^\s*import\b/.test(code)) continue
    // 未限定导入列表常被格式化到多行：拼接到闭合 `}`（上限 50 行），
    // 起始行号保持不变；后续行不以 import 开头，不会被重复匹配。
    if (code.includes('.{') && !code.includes('}')) {
      const end = Math.min(lines.length, i + 50)
      for (let j = i + 1; j < end; j++) {
        code += ` ${stripGleamComment(lines[j])}`
        if (code.includes('}')) break
      }
    }
    const m = re.exec(code)
    if (!m) continue
    const imported = new Set()
    if (m[2]) {
      for (const part of m[2].split(',')) {
        const name = part.trim().replace(/^type\s+/, '').replace(/\s+as\s+[\w]+$/, '')
        if (name) imported.add(name)
      }
    }
    result.push({
      specifier: m[1],
      line: i + 1,
      kind: 'import',
      relative: true,
      imported: [...imported],
    })
  }
  return result
}

/**
 * 提取 Shell 的 `source` / `.` 引用。
 * 只接受可静态确定的路径：含变量、命令替换、通配符或花括号展开的参数
 * 无法在索引期求值，直接跳过（不猜测）；heredoc/字符串内的伪命令由
 * `shellScan` 屏蔽。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractShellImports(lines) {
  const result = []
  const rows = shellScan(lines)
  const re = /(?:^|[;&|]\s*|\b(?:then|do)\s+)(?:source|\.)\s+/g
  for (let i = 0; i < rows.length; i++) {
    const { code, masked } = rows[i]
    re.lastIndex = 0
    let m
    while ((m = re.exec(masked)) !== null) {
      const rest = code.slice(m.index + m[0].length)
      const arg = /^(?:"([^"]*)"|'([^']*)'|([^\s;|&)]+))/.exec(rest)
      if (!arg) continue
      const specifier = arg[1] ?? arg[2] ?? arg[3] ?? ''
      if (specifier === '' || specifier.startsWith('-')) continue
      if (/[$`*?[\]{}]/.test(specifier)) continue
      result.push({
        specifier,
        line: i + 1,
        kind: 'import',
        relative: true,
        imported: [],
      })
    }
  }
  return result
}

/**
 * 扫描一行 R 代码：返回保留字符串内容的 `code` 与字符串内容替换为空格的
 * `masked`（两者列位置对齐），`#` 注释截断。
 * @param {string} raw - 源码行。
 * @returns {{code:string, masked:string}} 代码行与掩码行。
 */
function rScan(raw) {
  let code = ''
  let masked = ''
  let quote = null
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (quote) {
      code += ch
      if (ch === '\\' && i + 1 < raw.length) {
        code += raw[i + 1]
        masked += '  '
        i++
        continue
      }
      if (ch === quote) { quote = null; masked += ch; continue }
      masked += ' '
      continue
    }
    if (ch === '#') break
    if (ch === '"' || ch === "'") { quote = ch; code += ch; masked += ch; continue }
    code += ch
    masked += ch
  }
  return { code, masked }
}

/**
 * 提取 R 的 `source("path")` / `sys.source("path")` 引用。
 * 路径必须能静态确定（含变量/反引号的参数跳过）；`library()`/`require()`
 * 指向已安装包，不产生本地文件边。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractRImports(lines) {
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const { code, masked } = rScan(lines[i])
    const re = /\b(?:source|sys\.source)\s*\(\s*(?:file\s*=\s*)?/g
    let m
    while ((m = re.exec(masked)) !== null) {
      const arg = /^(["'])([^"']+)\1/.exec(code.slice(m.index + m[0].length))
      if (!arg) continue
      const specifier = arg[2]
      if (/\$|`/.test(specifier)) continue
      result.push({
        specifier,
        line: i + 1,
        kind: 'import',
        relative: true,
        imported: [],
      })
    }
  }
  return result
}

/**
 * 提取 Julia 的 `include("path")` 引用。
 * 路径必须能静态确定（含 `$` 插值/`joinpath` 的动态调用跳过）；字符串、
 * 行注释与 `#= =#` 块注释内的伪 include 由 `juliaScan` 屏蔽。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractJuliaImports(lines) {
  const result = []
  const rows = juliaScan(lines)
  const re = /\binclude\s*\(\s*/g
  for (let i = 0; i < rows.length; i++) {
    const { code, masked } = rows[i]
    re.lastIndex = 0
    let m
    while ((m = re.exec(masked)) !== null) {
      const arg = /^(["'])([^"']+)\1/.exec(code.slice(m.index + m[0].length))
      if (!arg) continue
      const specifier = arg[2]
      if (/\$|`/.test(specifier)) continue
      result.push({
        specifier,
        line: i + 1,
        kind: 'import',
        relative: true,
        imported: [],
      })
    }
  }
  return result
}

/**
 * 提取 Nim 的 `import` / `from … import` / `include` / `export` 引用。
 * 支持逗号分隔的多模块与引号路径（`include "x.nim"`）；`except`/`as`
 * 子句不影响模块名。字符串/块注释内的伪 import 由 `nimScan` 屏蔽。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractNimImports(lines) {
  const result = []
  const rows = nimScan(lines)
  const re = /^\s*(import|from|include|export)\s+(.*)$/
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const m = re.exec(row.masked)
    if (!m) continue
    const offset = m.index + m[0].length - m[2].length
    let rest = row.code.slice(offset).trim()
    const from = /^([A-Za-z_.][\w./]*)\s+import\b/.exec(rest)
    if (from) {
      rest = from[1]
    } else {
      rest = rest.replace(/\b(?:except|as)\b.*$/, '')
    }
    for (const part of rest.split(',')) {
      let specifier = part.trim()
      if (specifier === '') continue
      if ((specifier.startsWith('"') && specifier.endsWith('"'))
        || (specifier.startsWith("'") && specifier.endsWith("'"))) {
        specifier = specifier.slice(1, -1)
      }
      if (!/^[A-Za-z_.][\w./]*$/.test(specifier)) continue
      result.push({
        specifier,
        line: i + 1,
        kind: 'import',
        relative: specifier.startsWith('.'),
        imported: [],
      })
    }
  }
  return result
}

/**
 * 去除 Elixir 行注释（`#`；`?#` 字符字面量与字符串内的 `#` 不算）。
 * @param {string} line - 源码行。
 * @returns {string} 去注释后的行。
 */
function stripElixirComment(line) {
  let quote = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (ch === '\\') { i++; continue }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '#' && line[i - 1] !== '?') return line.slice(0, i)
  }
  return line
}

/**
 * 提取 OCaml 的 `open` / `include` 与模块别名（`module M = Foo`）引用。
 * `open! Foo` 与点分子模块（`open Foo.Bar`）取首段模块名；注释/字符串内
 * 的伪引用由 `ocamlScan` 屏蔽；`module M = struct` 不是引用。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractOcamlImports(lines) {
  const result = []
  const masked = ocamlScan(lines)
  /**
   * 登记一条模块引用。
   * @param {string} specifier - 首段模块名（大写开头）。
   * @param {number} line - 行号（1-based）。
   * @returns {void}
   */
  const push = (specifier, line) => {
    result.push({ specifier, line, kind: 'import', relative: false, imported: [specifier] })
  }
  for (let i = 0; i < masked.length; i++) {
    const code = masked[i].trim()
    if (code === '') continue
    const open = /^(?:open|include)!?\s+([A-Z][\w']*)/.exec(code)
    if (open) {
      push(open[1], i + 1)
      continue
    }
    // module M = Foo / module M = Foo.Bar（右侧首段模块名）
    const alias = /^module\s+[A-Z][\w']*\s*=\s*([A-Z][\w']*)(?:\.(?:[A-Z][\w']*))*\s*$/.exec(code)
    if (alias) push(alias[1], i + 1)
  }
  return result
}

/**
 * 提取 Haskell 的 `import` 引用：`import [qualified] [safe] Module`
 * （含 package import `import "pkg" Module`、`as` 别名与 `hiding` 子句）；
 * 注释/pragma 与字符串内的伪 import 由 `haskellScan` 屏蔽。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractHaskellImports(lines) {
  const result = []
  const masked = haskellScan(lines)
  const re = /^import\s+(?:qualified\s+)?(?:safe\s+)?(?:"[^"]+"\s+)?([A-Z][\w.']*)/
  for (let i = 0; i < masked.length; i++) {
    const code = masked[i].trim()
    const m = re.exec(code)
    if (!m) continue
    result.push({
      specifier: m[1],
      line: i + 1,
      kind: 'import',
      relative: false,
      imported: [],
    })
  }
  return result
}

/**
 * 提取 Erlang 的 `-include("…")` 与 `-include_lib("…")` 引用。
 * 路径字符串保留在 code 视图（掩码视图用于屏蔽注释），`include_lib`
 * 的首段应用名由 indexer 在解析时剥离。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractErlangImports(lines) {
  const result = []
  const rows = erlangScan(lines)
  for (let i = 0; i < rows.length; i++) {
    const code = rows[i].code.trim()
    const inc = /^-include\s*\(\s*"([^"]+)"\s*\)/.exec(code)
    if (inc) {
      result.push({ specifier: inc[1], line: i + 1, kind: 'import', relative: true, imported: [] })
      continue
    }
    const lib = /^-include_lib\s*\(\s*"([^"]+)"\s*\)/.exec(code)
    if (lib) {
      result.push({ specifier: lib[1], line: i + 1, kind: 'import', relative: false, imported: [] })
    }
  }
  return result
}

/**
 * 提取 Solidity 的 `import` 引用：`import "./X.sol";`、
 * `import {A} from "./X.sol";`、`import * as X from "…";`；
 * 注释内的伪 import 由 `solidityScan` 截断。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractSolidityImports(lines) {
  const result = []
  const rows = solidityScan(lines)
  for (let i = 0; i < rows.length; i++) {
    const code = rows[i].code.trim()
    if (code === '') continue
    const m = /^import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/.exec(code)
    if (!m) continue
    const specifier = m[1]
    result.push({
      specifier,
      line: i + 1,
      kind: 'import',
      relative: specifier.startsWith('.'),
      imported: [],
    })
  }
  return result
}

/**
 * 提取 Clojure `ns` 的 `(:require …)` / `(:use …)` 命名空间引用。
 * 从 `:require` 起按括号深度跟踪到闭合，提取 `[ns.name …]` 与裸
 * `ns.name` 形式；字符串/注释内的伪引用由 `clojureScan` 屏蔽。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractClojureImports(lines) {
  const result = []
  const masked = clojureScan(lines)
  let inRequire = false
  let depth = 0
  for (let i = 0; i < masked.length; i++) {
    let line = masked[i]
    if (!inRequire) {
      const idx = line.search(/:(?:require|use)\b/)
      if (idx < 0) continue
      inRequire = true
      depth = 1
      line = line.slice(idx)
    }
    for (const m of line.matchAll(/\[([a-z][\w.-]*)/g)) {
      result.push({
        specifier: m[1],
        line: i + 1,
        kind: 'import',
        relative: false,
        imported: [],
      })
    }
    for (const ch of line) {
      if (ch === '(' || ch === '[' || ch === '{') depth++
      else if (ch === ')' || ch === ']' || ch === '}') depth--
    }
    if (depth <= 0) {
      inRequire = false
      depth = 0
    }
  }
  return result
}

/**
 * 提取 HCL/Terraform 的 `source = "…"` 引用（module 块的本地模块路径
 * 为主要用途）；相对路径由 indexer 解析到模块目录的代表文件。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractHclImports(lines) {
  const result = []
  const rows = hclScan(lines)
  for (let i = 0; i < rows.length; i++) {
    const code = rows[i].code.trim()
    const m = /^source\s*=\s*"([^"]+)"/.exec(code)
    if (!m) continue
    result.push({
      specifier: m[1],
      line: i + 1,
      kind: 'import',
      relative: m[1].startsWith('.'),
      imported: [],
    })
  }
  return result
}

/**
 * 提取 Groovy 的 `import` / `import static` 引用：静态导入去掉末段成员
 * 名，保留类路径；注释/字符串内的伪 import 由 `groovyScan` 屏蔽。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractGroovyImports(lines) {
  const result = []
  const masked = groovyScan(lines)
  /**
   * 登记一条导入。
   * @param {string} specifier - 点分路径。
   * @param {number} line - 行号。
   * @param {string[]} imported - 导入符号（通配为 `*`，包级通配为空）。
   * @param {Array<{from:string, to:string}>} [aliases] - `as` 别名。
   * @returns {void}
   */
  const push = (specifier, line, imported, aliases = []) => {
    if (!specifier) return
    result.push({
      specifier,
      line,
      kind: 'import',
      relative: false,
      imported,
      ...(aliases.length > 0 ? { aliases } : {}),
    })
  }
  for (let i = 0; i < masked.length; i++) {
    const code = masked[i].trim()
    // import static X.Y.*：类的全部静态成员进入作用域 → 潜在通配引用
    const staticStar = /^import\s+static\s+([\w$]+(?:\.[\w$]+)*)\.\*\s*;?$/.exec(code)
    if (staticStar) {
      push(staticStar[1], i + 1, ['*'])
      continue
    }
    const staticImport = /^import\s+static\s+([\w$]+(?:\.[\w$]+)+)/.exec(code)
    if (staticImport) {
      const parts = staticImport[1].split('.')
      push(parts.slice(0, -1).join('.'), i + 1, [parts[parts.length - 1]])
      continue
    }
    // import a.b.*：包级通配不声称具体类型（保持文件级证据）
    const starImport = /^import\s+([\w$]+(?:\.[\w$]+)*)\.\*\s*;?$/.exec(code)
    if (starImport) {
      push(starImport[1], i + 1, [])
      continue
    }
    const m = /^import\s+(?<path>[\w$]+(?:\.[\w$]+)+)\s*(?:as\s+(?<alias>\w+))?/.exec(code)
    if (!m) continue
    const path = m.groups.path
    const original = path.split('.').pop()
    const alias = m.groups.alias
    const aliases = alias && original && alias !== original ? [{ from: original, to: alias }] : []
    push(path, i + 1, original ? [original] : [], aliases)
  }
  return result
}

/**
 * 提取 PowerShell 的 `using module`、`Import-Module` 与 dot-source
 * （`. ./x.ps1`）路径引用：只登记文件/相对路径形式，纯模块名
 * （如 `Pester`）不建边；注释/字符串内的伪语句由 `powershellScan` 屏蔽。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractPowershellImports(lines) {
  const result = []
  const { code } = powershellScan(lines)
  /**
   * 从语句剩余部分取第一个路径 token（去引号）。
   * @param {string} rest - 路径起始的剩余文本。
   * @returns {string} 路径文本。
   */
  const firstToken = (rest) => {
    const quoted = /^(["'])(.+?)\1/.exec(rest.trim())
    if (quoted) return quoted[2]
    return rest.trim().split(/\s+/)[0] ?? ''
  }
  for (let i = 0; i < code.length; i++) {
    const line = code[i].trim()
    /** @type {string|null} */
    let rawPath = null
    const usingModule = /^using\s+module\s+(.+)$/i.exec(line)
    if (usingModule) rawPath = firstToken(usingModule[1])
    if (rawPath === null) {
      const importModule = /^Import-Module\s+(?:-Name\s+)?(.+)$/i.exec(line)
      if (importModule) rawPath = firstToken(importModule[1])
    }
    if (rawPath === null) {
      const dotSource = /^\.\s+(.+)$/.exec(line)
      if (dotSource) rawPath = firstToken(dotSource[1])
    }
    if (rawPath === null) continue
    // 纯模块名（无路径分隔符、无脚本后缀）指向已安装模块，不建边
    if (!rawPath.startsWith('.') && !rawPath.includes('/') && !rawPath.includes('\\')
      && !/\.(?:ps1|psm1|psd1)$/i.test(rawPath)) continue
    result.push({ specifier: rawPath, line: i + 1, kind: 'import', relative: true, imported: [] })
  }
  return result
}

/**
 * 提取 Fortran 的 `use <module>` 引用：支持 `use :: name`、
 * `use name, only: …` 与 `use, non_intrinsic :: name`；
 * `use, intrinsic :: …`（标准库内建模块）不建边。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractFortranImports(lines) {
  const result = []
  const masked = fortranScan(lines)
  for (let i = 0; i < masked.length; i++) {
    const code = masked[i].trim()
    const m = /^use\s*(?:,\s*([A-Za-z_]\w*)\s*)?(?:::)?\s*([A-Za-z_]\w*)/i.exec(code)
    if (!m) continue
    if ((m[1] ?? '').toLowerCase() === 'intrinsic') continue
    result.push({ specifier: m[2], line: i + 1, kind: 'import', relative: false, imported: [] })
  }
  return result
}

/** Perl 编译指示（pragma）与标准库开关——不作为模块依赖记录。 */
const PERL_PRAGMAS = new Set([
  'strict', 'warnings', 'utf8', 'vars', 'lib', 'feature', 'experimental',
  'bytes', 'integer', 'less', 'locale', 'overload', 'overloading', 're',
  'sigtrap', 'subs', 'open', 'bigint', 'bignum', 'bigrat', 'blib',
  'diagnostics', 'constant', 'parent', 'base', 'mro', 'sort', 'autodie',
  'fields', 'if', 'threads', 'attributes', 'charnames', 'version', 'vars',
])

/**
 * 提取 Perl 的 `use`/`require` 引用：
 * - `use Foo::Bar` / `require Foo::Bar` 记录模块名；
 * - `use parent 'Foo::Bar'` / `use base qw(Foo::Bar)` 记录父模块；
 * - `require "./x.pl"` / `require 'Foo/Bar.pm'` 记录路径形式。
 * 版本号、编译指示与注释/POD/heredoc 内的伪语句跳过。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractPerlImports(lines) {
  const result = []
  const { code, masked } = perlScan(lines)
  for (let i = 0; i < masked.length; i++) {
    const line = masked[i].trim()
    if (line === '') continue
    const parentUse = /^(?:use|require)\s+(?:parent|base)\b(.*)$/.exec(line)
    if (parentUse) {
      const args = /^(?:use|require)\s+(?:parent|base)\b(.*)$/.exec(code[i].trim())
      const text = args ? args[1] : ''
      const names = new Set()
      for (const m of text.matchAll(/['"]([A-Za-z_]\w*(?:::\w+)*)['"]/g)) names.add(m[1])
      const qw = /\bqw\s*[({[]([^)}\]]*)[)}\]]/.exec(text)
      if (qw) {
        for (const token of qw[1].split(/\s+/)) {
          if (/^[A-Za-z_]\w*(?:::\w+)*$/.test(token)) names.add(token)
        }
      }
      for (const name of names) {
        result.push({ specifier: name, line: i + 1, kind: 'import', relative: false, imported: [] })
      }
      continue
    }
    const relRequire = /^require\s+(['"])(.+?)\1/.exec(code[i].trim())
    if (relRequire && (relRequire[2].startsWith('.') || relRequire[2].includes('/'))) {
      result.push({ specifier: relRequire[2], line: i + 1, kind: 'require', relative: true, imported: [] })
      continue
    }
    const moduleRef = /^(?:use|require)\s+([A-Za-z_]\w*(?:::\w+)*)/.exec(line)
    if (!moduleRef) continue
    const name = moduleRef[1]
    if (/^v\d/i.test(name) || PERL_PRAGMAS.has(name)) continue
    result.push({ specifier: name, line: i + 1, kind: 'import', relative: false, imported: [] })
  }
  return result
}

/**
 * 提取 Object Pascal 的 `uses` 单元引用：支持跨行列表与
 * `Unit in 'path.pas'` 显式路径（路径形式优先交给 indexer 解析）；
 * 注释/字符串内的伪 uses 由 `pascalScan` 屏蔽。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractPascalImports(lines) {
  const result = []
  const { code, masked } = pascalScan(lines)
  for (let i = 0; i < masked.length; i++) {
    if (!/^uses\b/i.test(masked[i].trim())) continue
    const parts = []
    let j = i
    let terminated = false
    while (j < masked.length) {
      parts.push(code[j])
      if (masked[j].includes(';')) { terminated = true; break }
      j++
    }
    if (!terminated) continue
    const text = parts.join(' ').replace(/^uses\b/i, '')
    const itemRe = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)(?:\s+in\s+(['"])([^'"]*)\2)?/g
    let m
    while ((m = itemRe.exec(text)) !== null) {
      if (m[3]) {
        result.push({ specifier: m[3], line: i + 1, kind: 'import', relative: true, imported: [m[1]] })
      } else if (m[1] && !/^in$/i.test(m[1])) {
        result.push({ specifier: m[1], line: i + 1, kind: 'import', relative: false, imported: [] })
      }
    }
    i = j
  }
  return result
}

/**
 * 提取 Nix 的文件引用：`import ./x.nix`、`callPackage ./pkg.nix` 与
 * `builtins.readFile|readDir|path ./x`；只登记相对路径，`<nixpkgs>`
 * 等搜索路径不建边。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractNixImports(lines) {
  const result = []
  const masked = nixScan(lines)
  const patterns = [
    /\bimport\s+(\.\.?\/[^\s;()]+)/g,
    /\bcallPackage\s+(\.\.?\/[^\s;()]+)/g,
    /\bbuiltins\.(?:readFile|readDir|path)\s+(\.\.?\/[^\s;()]+)/g,
  ]
  for (let i = 0; i < masked.length; i++) {
    const seen = new Set()
    for (const re of patterns) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(masked[i])) !== null) {
        const specifier = m[1].replace(/[),;]+$/, '')
        if (!specifier || seen.has(specifier)) continue
        seen.add(specifier)
        result.push({ specifier, line: i + 1, kind: 'import', relative: true, imported: [] })
      }
    }
  }
  return result
}

/**
 * 提取 Visual Basic .NET 的 `Imports`（含别名）与 `Inherits`/`Implements`
 * 点分引用；注释与字符串内的伪语句由 `vbnetScan` 屏蔽。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractVbnetImports(lines) {
  const result = []
  const masked = vbnetScan(lines)
  for (let i = 0; i < masked.length; i++) {
    const line = masked[i].trim()
    const imports = /^Imports\s+(?:([A-Za-z_]\w*)\s*=\s*)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/i.exec(line)
    if (imports) {
      result.push({
        specifier: imports[2],
        line: i + 1,
        kind: 'import',
        relative: false,
        imported: [imports[2].split('.').pop()],
      })
      continue
    }
    const inherits = /^(?:Inherits|Implements)\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/i.exec(line)
    if (inherits) {
      result.push({
        specifier: inherits[1],
        line: i + 1,
        kind: 'import',
        relative: false,
        imported: [inherits[1].split('.').pop()],
      })
    }
  }
  return result
}

/**
 * 提取 Tcl 的 `source` 脚本引用：只登记相对路径或 `.tcl` 文件；
 * `source [file join …]` 等动态形式与注释/字符串内的伪语句跳过。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractTclImports(lines) {
  const result = []
  const masked = tclScan(lines)
  for (let i = 0; i < masked.length; i++) {
    const m = /^source\s+((?:\.\.?\/)?[^\s;]+\.tcl|\.\.?\/[^\s;]+)/.exec(masked[i].trim())
    if (!m) continue
    const specifier = m[1].replace(/[;]+$/, '')
    result.push({ specifier, line: i + 1, kind: 'require', relative: true, imported: [] })
  }
  return result
}

/**
 * 提取 F# 的 `open` 引用：支持 `open Foo.Bar` 与 `open type Foo.Bar`；
 * 注释与字符串内的伪语句由 `fsharpScan` 屏蔽。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractFsharpImports(lines) {
  const result = []
  const masked = fsharpScan(lines)
  for (let i = 0; i < masked.length; i++) {
    const m = /^open\s+(?:type\s+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/.exec(masked[i].trim())
    if (!m) continue
    result.push({
      specifier: m[1],
      line: i + 1,
      kind: 'import',
      relative: false,
      imported: [m[1].split('.').pop()],
    })
  }
  return result
}

/**
 * 提取 Elixir 的 alias/import/require/use 引用。
 * - `alias MyApp.{Repo, Mailer}` 展开为多条；
 * - `alias Foo, as: Bar` 仍指向 Foo；
 * - `__MODULE__` 前缀、`:atom` 与 `unquote(...)` 等无法静态定位的形式跳过。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractElixirImports(lines) {
  const result = []
  /**
   * 登记一条模块引用。
   * @param {string} specifier - 点分模块名（如 MyApp.Repo）。
   * @param {number} line - 行号。
   * @returns {void}
   */
  const push = (specifier, line) => {
    if (!/^[A-Z][\w.]*$/.test(specifier)) return
    result.push({
      specifier,
      line,
      kind: 'import',
      relative: false,
      imported: [specifier.split('.').pop()],
    })
  }
  for (let i = 0; i < lines.length; i++) {
    const code = stripElixirComment(lines[i]).trim()
    const grouped = /^(alias|import|require|use)\s+([A-Z][\w.]*)\.\{([^}]*)\}/.exec(code)
    if (grouped) {
      for (const part of grouped[3].split(',')) {
        const name = part.trim().replace(/\s+as:\s+\w+$/, '')
        if (name) push(`${grouped[2]}.${name}`, i + 1)
      }
      continue
    }
    const m = /^(alias|import|require|use)\s+([A-Z][\w.]*)/.exec(code)
    if (m) push(m[2], i + 1)
  }
  return result
}

/**
 * 提取 Dart 的 import/export/part 引用。
 *
 * `part 'x.dart';` 不是导入而是"并入当前库"：part 文件内的声明属于主库
 * 命名空间，主库对外导入时可见。这里记为独立形态 `kind: 'part'` 且不
 * 声称符号引用；再导出解析把主库文件视作星号 barrel（见 reexports.js）。
 * `part of 'x.dart';` 是 part 文件内的反向声明，不产生引用边（避免同一
 * 库的主文件/part 文件互指形成伪循环）。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractDartImports(lines) {
  const result = []
  const re = /^\s*(import|export|part)\s+['"]([^'"]+)['"](?<tail>[^;]*)/
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i])
    if (!m) continue
    const specifier = m[2]
    // dart:/package: 是外部或 SDK 引用；相对/裸 .dart 才尝试本地解析
    const relative = !/^[a-z][a-z0-9+.-]*:/i.test(specifier) && specifier.endsWith('.dart')
    const tail = m.groups?.tail ?? ''
    /**
     * 解析逗号分隔的 show/hide 名单。
     * @param {string} keyword - `show` 或 `hide`。
     * @returns {string[]} 名单。
     */
    const combinator = (keyword) => {
      const found = new RegExp(`\\b${keyword}\\s+([^;]+)`).exec(tail)
      if (!found) return []
      return found[1].split(',').map(part => part.trim().replace(/\s+.*$/, '')).filter(Boolean)
    }
    const showNames = combinator('show')
    const hideNames = combinator('hide')
    let imported = []
    let hidden
    if (m[1] === 'part') {
      imported = [] // part 是同一编译单元，不是导入
    } else if (showNames.length > 0) {
      const hiddenSet = new Set(hideNames)
      imported = showNames.filter(name => !hiddenSet.has(name))
    } else if (hideNames.length > 0) {
      if (m[1] === 'import') {
        // `hide` 不改变"可能引用任意符号"的性质，排除名交给引用/使用点侧过滤
        imported = ['*']
        hidden = hideNames
      }
      // export + hide：再导出链不支持排除名，保守不声称（imported 为空）
    } else {
      // 无组合子：整个库进入当前作用域（export 时即星号再导出）
      imported = ['*']
    }
    result.push({
      specifier,
      line: i + 1,
      kind: m[1] === 'part' ? 'part' : (m[1] === 'export' ? 'export-from' : 'import'),
      relative,
      imported,
      ...(hidden && hidden.length > 0 ? { hidden } : {}),
    })
  }
  return result
}

/**
 * 提取 Ada 依赖：`with A, B.C;`、`limited with`、`private with`。
 *
 * `use` 是可见性指令而非导入（合法代码必先 `with`），不建边；generic
 * 形式参数（`with procedure P;`、`with function F ...;`）不是单元依赖，
 * 按首关键字排除。单元名保持原始大小写，解析时统一小写。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractAdaImports(lines) {
  const result = []
  const { masked } = adaScan(lines)
  for (let i = 0; i < masked.length; i++) {
    const m = /^\s*(?:limited\s+|private\s+)?with\s+([^;]+)/i.exec(masked[i])
    if (!m) continue
    for (const part of m[1].split(',')) {
      const name = part.trim()
      if (!name) continue
      if (/^(procedure|function|package|type)\b/i.test(name)) continue
      if (!/^[A-Za-z][\w.]*$/.test(name)) continue
      result.push({ specifier: name, line: i + 1, kind: 'import', relative: false, imported: [] })
    }
  }
  return result
}

/**
 * 提取 Verilog/SystemVerilog 依赖：`` `include "…" ``/`` `include <…> ``
 * 与 SystemVerilog 的 `import pkg::*;` / `import pkg::sym;`。
 *
 * 注释与字符串按 `verilogScan` 屏蔽：注释里的伪 include/import 不产生
 * 引用，而 include 的路径字符串保留在 `code` 视图里。`` `include `` 记为
 * `require`（文件包含；引号形式标记为相对，先查引用方目录，尖括号形式
 * 只经 include 根查找）；`import` 的 specifier 是包名，由索引器按
 * 包/容器名映射解析。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractVerilogImports(lines) {
  const { code } = verilogScan(lines)
  const result = []
  for (let i = 0; i < code.length; i++) {
    const include = /^\s*`include\s*(?:<(?<angle>[^>]+)>|"(?<quote>[^"]+)")/.exec(code[i])
    if (include) {
      result.push({
        specifier: include.groups.quote ?? include.groups.angle,
        line: i + 1,
        kind: 'require',
        relative: include.groups.quote !== undefined,
        imported: [],
      })
      continue
    }
    const imports = /^\s*import\s+(?<body>[^;]+);/.exec(code[i])
    if (!imports) continue
    for (const part of imports.groups.body.split(',')) {
      const m = /^\s*([A-Za-z_]\w*)\s*::\s*(?:\*|([A-Za-z_]\w*))/.exec(part)
      if (!m) continue
      result.push({
        specifier: m[1],
        line: i + 1,
        kind: 'import',
        relative: false,
        imported: m[2] ? [m[2]] : [],
      })
    }
  }
  return result
}

/**
 * 提取 Objective-C 的 `#import` / `#include`：引号形式标记为相对
 * （先查引用文件目录），尖括号形式只经 include 根查找。`@import Module;`
 * 是模块导入而非文件路径，不建边。
 * @param {string[]} lines - 代码行。
 * @returns {ImportInfo[]} 引用记录。
 */
function extractObjcImports(lines) {
  const { code } = objcScan(lines)
  const result = []
  for (let i = 0; i < code.length; i++) {
    const m = /^\s*#\s*(?:import|include)\s*(?:<(?<angle>[^>]+)>|"(?<quote>[^"]+)")/.exec(code[i])
    if (!m) continue
    result.push({
      specifier: m.groups.quote ?? m.groups.angle,
      line: i + 1,
      kind: 'import',
      relative: m.groups.quote !== undefined,
      imported: [],
    })
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
  if (lang === 'vue' || lang === 'svelte') {
    return extractJsImports(scriptBlockText(code).replace(/\r\n?/g, '\n').split('\n'))
  }
  const lines = code.replace(/\r\n?/g, '\n').split('\n')
  if (lang === 'python') return extractPythonImports(lines)
  if (lang === 'javascript' || lang === 'typescript') return extractJsImports(lines)
  if (lang === 'go') return extractGoImports(lines)
  if (lang === 'rust') return extractRustImports(lines)
  if (lang === 'java') return extractJavaImports(lines)
  if (lang === 'csharp') return extractCSharpImports(lines)
  if (lang === 'kotlin') return extractKotlinImports(lines)
  if (lang === 'php') return extractPhpImports(lines)
  if (lang === 'ruby') return extractRubyImports(lines)
  if (lang === 'swift') return extractSwiftImports(lines)
  if (lang === 'scala') return extractScalaImports(lines)
  if (lang === 'dart') return extractDartImports(lines)
  if (lang === 'elixir') return extractElixirImports(lines)
  if (lang === 'lua') return extractLuaImports(lines)
  if (lang === 'zig') return extractZigImports(lines)
  if (lang === 'gleam') return extractGleamImports(lines)
  if (lang === 'shell') return extractShellImports(lines)
  if (lang === 'r') return extractRImports(lines)
  if (lang === 'julia') return extractJuliaImports(lines)
  if (lang === 'nim') return extractNimImports(lines)
  if (lang === 'ocaml') return extractOcamlImports(lines)
  if (lang === 'haskell') return extractHaskellImports(lines)
  if (lang === 'erlang') return extractErlangImports(lines)
  if (lang === 'solidity') return extractSolidityImports(lines)
  if (lang === 'clojure') return extractClojureImports(lines)
  if (lang === 'hcl') return extractHclImports(lines)
  if (lang === 'groovy') return extractGroovyImports(lines)
  if (lang === 'powershell') return extractPowershellImports(lines)
  if (lang === 'fortran') return extractFortranImports(lines)
  if (lang === 'perl') return extractPerlImports(lines)
  if (lang === 'pascal') return extractPascalImports(lines)
  if (lang === 'nix') return extractNixImports(lines)
  if (lang === 'vbnet') return extractVbnetImports(lines)
  if (lang === 'tcl') return extractTclImports(lines)
  if (lang === 'fsharp') return extractFsharpImports(lines)
  if (lang === 'ada') return extractAdaImports(lines)
  if (lang === 'verilog' || lang === 'systemverilog') return extractVerilogImports(lines)
  if (lang === 'objc') return extractObjcImports(lines)
  if (lang === 'c' || lang === 'cpp') return extractCppImports(lines)
  return []
}
