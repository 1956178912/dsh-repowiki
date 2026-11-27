/**
 * 零依赖符号提取器（ADR-0001）。
 *
 * 设计目标：为 JS/TS/Python/Go/Rust/Java 提取"符号表"级信息（名称、
 * 种类、行范围、是否导出），供 index.json 建立符号级检索与交叉引用。
 * 不做完整 AST：采用"行级关键字匹配 + 括号/缩进块匹配"的轻量解析，
 * 覆盖语言主流定义形态；无法 parse 的边缘语法安静跳过，绝不产出错误符号。
 * 多行签名、宏展开等边缘形态按已知限制跳过（见 docs/compatibility.md）。
 *
 * 纯函数：输入代码字符串与语言，输出符号数组，无任何副作用，便于
 * 直接做单元测试。
 */

import { scriptBlockText } from './sfc.js'

/**
 * 单个提取出的符号。
 * @typedef {Object} SymbolInfo
 * @property {string} name - 符号名称。
 * @property {'function'|'class'|'method'|'variable'|'interface'|'type'} kind - 符号种类。
 * @property {number} line - 定义起始行（1-based）。
 * @property {number} endLine - 定义块结束行（1-based，保守取下一个同级定义前一行的最小值）。
 * @property {boolean} exported - 是否被 export（用于检索优先级与生成摘要）。
 * @property {string} [parent] - 所属类名（仅 method）。
 */

/** Dart 顶层/成员声明关键字（禁止被误识别为函数名）。 */
const DART_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'assert', 'throw',
  'await', 'yield', 'super', 'this', 'import', 'export', 'library', 'part',
  'class', 'mixin', 'enum', 'extension', 'typedef', 'const', 'final', 'var',
  'late', 'static', 'external', 'factory', 'operator', 'get', 'set',
])

/**
 * 计算一行 Dart 的花括号增量（字符串/行注释感知；多行块注释不展开）。
 * @param {string} line - 源码行。
 * @returns {number} `{` 为正、`}` 为负的净值。
 */
function dartBraceDelta(line) {
  let depth = 0
  let quote = null
  let escape = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '/' && line[i + 1] === '/') break
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') depth--
  }
  return depth
}

/**
 * 判断一行 Dart 是否是可调用的声明（函数/方法/构造器），排除字段初始化。
 * @param {string} line - 源码行。
 * @param {RegExp} re - 声明正则（第 1 个分组为名称）。
 * @returns {RegExpExecArray|null} 匹配结果。
 */
function matchDartCallable(line, re) {
  const paren = line.indexOf('(')
  if (paren < 0) return null
  const prefix = line.slice(0, paren)
  // 字段初始化 `final x = foo(` 不是声明；箭头函数/表达式体也在此排除
  if (prefix.includes('=')) return null
  const match = re.exec(line)
  if (!match) return null
  return DART_KEYWORDS.has(match[1]) ? null : match
}

/**
 * 提取 Dart 符号（class/mixin/enum/extension/typedef、顶层函数/变量、成员方法）。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表（按行序）。
 */
function extractDart(lines) {
  const symbols = []
  const typeRe = /^(?:(?:abstract|base|final|sealed|interface|mixin|augment)\s+)*class\s+([A-Za-z_$][\w$]*)/
  const mixinRe = /^(?:(?:base|abstract)\s+)?mixin\s+(?!class\b)([A-Za-z_$][\w$]*)/
  const enumRe = /^(?:(?:base|final|interface)\s+)?enum\s+([A-Za-z_$][\w$]*)/
  const extensionRe = /^extension\s+(?!type\b|on\b)([A-Za-z_$][\w$]*)/
  const extensionTypeRe = /^extension\s+type\s+([A-Za-z_$][\w$]*)/
  const typedefRe = /^typedef\s+([A-Za-z_$][\w$]*)/
  // 成员必须有返回类型（构造器另行匹配），避免把枚举常量调用 red(1) 误判为方法
  const memberRe = /^(?:(?:static|external|abstract|covariant)\s+)*(?:[A-Za-z_$][\w$<>?,[\].]*\s+)+(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/
  const memberGetterRe = /^(?:(?:static|external|abstract|covariant)\s+)*(?:[A-Za-z_$][\w$<>?,[\].]*\s+)+get\s+([A-Za-z_$][\w$]*)\b/
  // 顶层函数允许省略返回类型（Dart 允许 main() {}），但仍排除字段初始化
  const topFnRe = /^(?:(?:external|static)\s+)*(?:[A-Za-z_$][\w$<>?,[\].]*\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/
  const topGetterRe = /^(?:external\s+)?(?:[A-Za-z_$][\w$<>?,[\].]*\s+)+get\s+([A-Za-z_$][\w$]*)\b/
  const varRe = /^(?:late\s+)?(?:final|const|var)\s+(?:[A-Za-z_$][\w$<>?,[\].]*\s+)?([A-Za-z_$][\w$]*)\s*(?:=|;)/
  const typedVarRe = /^(?:[A-Za-z_$][\w$<>?,[\].]*\s+)+([A-Za-z_$][\w$]*)\s*(?:=|;)/

  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
      depth += dartBraceDelta(raw)
      continue
    }
    const atTop = depth === 0
    if (atTop) {
      const typeMatch = typeRe.exec(line) ?? mixinRe.exec(line)
        ?? enumRe.exec(line) ?? extensionRe.exec(line) ?? extensionTypeRe.exec(line)
      if (typeMatch) {
        const name = typeMatch[1]
        const endLine = findBlockEnd(lines, i)
        symbols.push({
          name,
          kind: 'class',
          line: i + 1,
          endLine,
          exported: !name.startsWith('_'),
        })
        // 类体成员：只看直接位于类型体内的一层（方法体内部不扫描）
        let memberDepth = 0
        for (let j = i + 1; j < Math.min(endLine, lines.length); j++) {
          const memberLine = lines[j].trim()
          if (memberDepth === 0 && memberLine && !memberLine.startsWith('//')
            && !memberLine.startsWith('*')) {
            const ctorRe = new RegExp(`^(?:const\\s+|factory\\s+)*(${name})(?:\\.([A-Za-z_$][\\w$]*))?\\s*\\(`)
            const ctor = matchDartCallable(memberLine, ctorRe)
            if (ctor) {
              const ctorName = ctor[2] ? `${name}.${ctor[2]}` : name
              symbols.push({
                name: ctorName,
                kind: 'method',
                line: j + 1,
                endLine: memberLine.includes('{') ? findBlockEnd(lines, j) : j + 1,
                exported: !ctorName.includes('._'),
                parent: name,
              })
            } else {
              const method = matchDartCallable(memberLine, memberRe)
              const getter = method ? null : memberGetterRe.exec(memberLine)
              if (method || getter) {
                const name = method ? method[1] : getter[1]
                symbols.push({
                  name,
                  kind: 'method',
                  line: j + 1,
                  endLine: memberLine.includes('{') ? findBlockEnd(lines, j) : j + 1,
                  exported: !name.startsWith('_'),
                  parent: typeMatch[1],
                })
              }
            }
          }
          memberDepth += dartBraceDelta(lines[j])
          if (memberDepth < 0) break
        }
        depth += dartBraceDelta(raw)
        continue
      }
      const typeDef = typedefRe.exec(line)
      if (typeDef) {
        symbols.push({
          name: typeDef[1],
          kind: 'type',
          line: i + 1,
          endLine: i + 1,
          exported: !typeDef[1].startsWith('_'),
        })
        depth += dartBraceDelta(raw)
        continue
      }
      const fn = matchDartCallable(line, topFnRe)
      if (fn) {
        symbols.push({
          name: fn[1],
          kind: 'function',
          line: i + 1,
          endLine: line.includes('{') ? findBlockEnd(lines, i) : i + 1,
          exported: !fn[1].startsWith('_'),
        })
        depth += dartBraceDelta(raw)
        continue
      }
      const getter = topGetterRe.exec(line)
      if (getter) {
        symbols.push({
          name: getter[1],
          kind: 'function',
          line: i + 1,
          endLine: line.includes('{') ? findBlockEnd(lines, i) : i + 1,
          exported: !getter[1].startsWith('_'),
        })
        depth += dartBraceDelta(raw)
        continue
      }
      const variable = varRe.exec(line) ?? typedVarRe.exec(line)
      if (variable && !DART_KEYWORDS.has(variable[1])) {
        symbols.push({
          name: variable[1],
          kind: 'variable',
          line: i + 1,
          endLine: i + 1,
          exported: !variable[1].startsWith('_'),
        })
        depth += dartBraceDelta(raw)
        continue
      }
    }
    depth += dartBraceDelta(raw)
  }
  return symbols
}

/** JS/TS 中的保留/控制流关键字——禁止被误识别为方法名。 */
const JS_METHOD_BLACKLIST = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'do', 'else', 'try',
  'throw', 'new', 'delete', 'typeof', 'instanceof', 'in', 'of', 'await',
  'yield', 'spread', 'super', 'this', 'function', 'class', 'get', 'set',
  'static', 'async', 'export', 'import', 'default', 'extends', 'implements',
])

/** JS/TS 声明修饰符（可出现在方法名之前）。 */
const JS_METHOD_PREFIXES = /^(?:(?:static|async|get|set|public|private|protected|readonly|override|abstract|declare|generator)\s+)+/

/** 代码行统一为 LF 并按行切分（块匹配的基准）。 */
function toLines(code) {
  return code.replace(/\r\n?/g, '\n').split('\n')
}

/**
 * 计算 JS/TS 花括号块的结束行：从 startLine 的 `{` 开始计数，
 * 直到括号配平。配不齐（字符串/模板字面量里的括号误差）时退化为
 * 文件尾，保证总能给出一个保守可用的 endLine。
 * @param {string[]} lines - 全部代码行。
 * @param {number} startIdx - 块起始行索引（0-based，含 `{`）。
 * @returns {number} 块结束行（1-based）。
 */
function findBlockEnd(lines, startIdx) {
  let depth = 0
  let started = false
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    // 仅统计块内括号；粗略跳过行注释，避免注释中的括号干扰配平
    const cleaned = line.replace(/\/\/.*$/, '')
    for (const ch of cleaned) {
      if (ch === '{') { depth++; started = true }
      else if (ch === '}') { depth-- }
    }
    if (started && depth <= 0) return i + 1
  }
  return lines.length
}

/**
 * 从一行中提取"简单标识符"，用于 export 名称收集。
 * @param {string} line - 源码行。
 * @returns {RegExpExecArray|null} 匹配结果。
 */
function matchDeclare(line) {
  return /^(?<indent>\s*)(?<modifiers>(?:(?:export|default|declare|abstract|async|static|readonly|public|private|protected|override)\s+)*)(?<rest>.*)$/.exec(line)
}

/**
 * 提取 JS/TS 符号。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表（按行序）。
 */
function extractJsLike(lines) {
  const symbols = []
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const m = matchDeclare(raw)
    if (!m) continue
    const rest = m.groups.rest
    const exported = /\bexport\b/.test(m.groups.modifiers) || /^export\s/.test(raw)

    // function 声明（含 async/生成器）
    let fm = /^(?:async\s+)?function\s*\*?\s*(?<name>[A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/.exec(rest)
    if (fm) {
      symbols.push({
        name: fm.groups.name,
        kind: 'function',
        line: i + 1,
        endLine: findBlockEnd(lines, i),
        exported,
      })
      continue
    }

    // class 声明
    const cm = /^(?:abstract\s+)?class\s+(?<name>[A-Za-z_$][\w$]*)/.exec(rest)
    if (cm) {
      const sym = {
        name: cm.groups.name,
        kind: 'class',
        line: i + 1,
        endLine: findBlockEnd(lines, i),
        exported,
        parent: undefined,
      }
      symbols.push(sym)
      // 类方法：在该类块内扫描方法声明形态
      const classEnd = sym.endLine
      for (let j = i + 1; j < classEnd; j++) {
        const mline = lines[j]
        const mm = matchDeclare(mline)
        if (!mm) continue
        let methodRest = mm.groups.rest
        // 剥离方法修饰符
        methodRest = methodRest.replace(JS_METHOD_PREFIXES, '')
        // 形态一：name(...) {  或  name(...): T {  或  name(...) {
        let meth = /^(?<name>[A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::[^={]*)?\{/.exec(methodRest)
        if (!meth) {
          // 形态二：name = (args) => {  /  name = async (args) => {
          meth = /^(?<name>[A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>/.exec(methodRest)
        }
        if (!meth) {
          // 形态三：生成器 *name(...) {
          meth = /^\*(?<name>[A-Za-z_$][\w$]*)\s*\(/.exec(methodRest)
        }
        if (meth && !JS_METHOD_BLACKLIST.has(meth.groups.name)) {
          // 表达式体（无 {）止于本行；块体（含 {）才做括号匹配
          const hasBlock = methodRest.includes('{')
          symbols.push({
            name: meth.groups.name,
            kind: 'method',
            line: j + 1,
            endLine: hasBlock ? Math.min(findBlockEnd(lines, j), classEnd) : j + 1,
            exported: false,
            parent: sym.name,
          })
        }
      }
      continue
    }

    // interface / type 声明（TypeScript）
    const im = /^(?:interface\s+(?<name>[A-Za-z_$][\w$]*))/.exec(rest)
    if (im) {
      symbols.push({
        name: im.groups.name,
        kind: 'interface',
        line: i + 1,
        endLine: findBlockEnd(lines, i),
        exported,
      })
      continue
    }
    const tm = /^type\s+(?<name>[A-Za-z_$][\w$]*)\s*[<=]/.exec(rest)
    if (tm) {
      symbols.push({
        name: tm.groups.name,
        kind: 'type',
        line: i + 1,
        // type 别名可能是单行联合类型，没块则取到行尾（保守取下一行）
        endLine: rest.trim().endsWith('}') ? findBlockEnd(lines, i) : i + 1,
        exported,
      })
      continue
    }

    // 变量声明：仅当右侧是箭头函数或 function 表达式时才视为可索引符号
    const vm = /^(?:const|let|var)\s+(?<name>[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\s*\*?|\([^)]*\)\s*=>|[\w$]+\s*=>)/.exec(rest)
    if (vm) {
      symbols.push({
        name: vm.groups.name,
        kind: 'function',
        line: i + 1,
        endLine: rest.includes('=>') && !rest.includes('function')
          ? (rest.trim().endsWith('{') ? findBlockEnd(lines, i) : i + 1)
          : findBlockEnd(lines, i),
        exported,
      })
      continue
    }

    // 普通导出常量（export const X = 值）：记为 variable，便于检索入口点
    if (exported) {
      const em = /^(?:const|let|var)\s+(?<name>[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/.exec(rest)
      if (em) {
        symbols.push({
          name: em.groups.name,
          kind: 'variable',
          line: i + 1,
          endLine: i + 1,
          exported,
        })
      }
    }
  }
  return symbols
}

/**
 * 提取 Python 符号（def / async def / class，含装饰器归属与缩进块范围）。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractPython(lines) {
  const symbols = []
  /** @type {{name:string, line:number, endLine:number, indent:number}|null} */
  let currentClass = null

  /**
   * 计算第 idx 行的缩进宽度。
   * @param {number} idx - 行索引。
   * @returns {number} 缩进字符数（前导空格数，Tab 按 4 计）。
   */
  const indentOf = (idx) => {
    const l = lines[idx]
    let n = 0
    for (const ch of l) {
      if (ch === ' ') n++
      else if (ch === '\t') n += 4
      else break
    }
    return n
  }

  // 计算"块结束行"：下一个缩进 <= 起始缩进的可执行行之前；否则文件尾
  /**
   * @param {number} startIdx - 块声明的行索引。
   * @param {number} indent - 声明行的缩进。
   * @returns {number} 块结束行（1-based）。
   */
  const blockEnd = (startIdx, indent) => {
    for (let j = startIdx + 1; j < lines.length; j++) {
      const t = lines[j].trim()
      if (t === '' || t.startsWith('#')) continue
      if (indentOf(j) <= indent) return j // 下一个同级或更浅的语句之前
    }
    return lines.length
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    if (trimmed.startsWith('#')) continue

    const indent = indentOf(i)

    // class Name(Base): 或 class Name:
    const cm = /^class\s+(?<name>[A-Za-z_][\w]*)/.exec(trimmed)
    if (cm) {
      const endLine = blockEnd(i, indent)
      currentClass = { name: cm.groups.name, line: i + 1, endLine, indent }
      symbols.push({
        name: cm.groups.name,
        kind: 'class',
        line: i + 1,
        endLine,
        exported: false,
      })
      continue
    }

    // (async )def name(:
    const dm = /^(?:async\s+)?def\s+(?<name>[A-Za-z_][\w]*)\s*\(/.exec(trimmed)
    if (dm) {
      // Python 无 export 语义，exported 恒为 false（装饰器不改变模块可见性）
      const inClass = currentClass && indent > currentClass.indent && i + 1 <= currentClass.endLine
      symbols.push({
        name: dm.groups.name,
        kind: inClass ? 'method' : 'function',
        line: i + 1,
        endLine: blockEnd(i, indent),
        exported: false,
        parent: inClass ? currentClass.name : undefined,
      })
      continue
    }
  }
  return symbols
}

/**
 * Go 接收者名称：`(s *Server)` → `Server`，`(Server)` → `Server`。
 * @param {string} receiver - 括号内的接收者声明。
 * @returns {string|undefined} 类型名；无法识别返回 undefined。
 */
function goReceiverName(receiver) {
  const names = [...receiver.matchAll(/[A-Za-z_]\w*/g)].map(m => m[0])
  if (names.length === 0) return undefined
  // 形如 `s *pkg.Server` 时最后一个标识符是类型名
  return names[names.length - 1]
}

/**
 * 提取 Go 符号：func / 方法（接收者归属）/ type（struct/interface/别名）/
 * 导出常量与变量。导出判定按 Go 约定：首字母大写。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractGo(lines) {
  const symbols = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*')) continue

    // func Name(  /  func (r *Receiver) Name(
    const fm = /^func\s+(?:\((?<recv>[^)]*)\)\s*)?(?<name>[A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\(/.exec(trimmed)
    if (fm) {
      const parent = fm.groups.recv ? goReceiverName(fm.groups.recv) : undefined
      symbols.push({
        name: fm.groups.name,
        kind: parent ? 'method' : 'function',
        line: i + 1,
        endLine: findBlockEnd(lines, i),
        exported: /^[A-Z]/.test(fm.groups.name),
        ...(parent ? { parent } : {}),
      })
      continue
    }

    // type Name struct / interface / 别名 / 函数类型
    const tm = /^type\s+(?<name>[A-Za-z_]\w*)\s+(?<what>struct|interface|=|func|[A-Za-z_]\w*)/.exec(trimmed)
    if (tm) {
      const what = tm.groups.what
      const kind = what === 'struct' ? 'class' : what === 'interface' ? 'interface' : 'type'
      symbols.push({
        name: tm.groups.name,
        kind,
        line: i + 1,
        // 别名/函数类型通常单行；struct/interface 走花括号配平
        endLine: what === 'struct' || what === 'interface' ? findBlockEnd(lines, i) : i + 1,
        exported: /^[A-Z]/.test(tm.groups.name),
      })
      continue
    }

    // 单条 const / var：仅登记导出名（Go 无 export 关键字）
    const vm = /^(?:const|var)\s+(?<name>[A-Za-z_]\w*)\b/.exec(trimmed)
    if (vm && /^[A-Z]/.test(vm.groups.name)) {
      symbols.push({
        name: vm.groups.name,
        kind: 'variable',
        line: i + 1,
        endLine: i + 1,
        exported: true,
      })
      continue
    }

    // 分组 const ( ... ) / var ( ... )：逐个导出名登记
    if (/^(?:const|var)\s*\(\s*$/.test(trimmed)) {
      for (let j = i + 1; j < lines.length; j++) {
        const inner = lines[j].trim()
        if (inner === ')') break
        const gm = /^(?<name>[A-Za-z_]\w*)\b/.exec(inner)
        if (gm && /^[A-Z]/.test(gm.groups.name)) {
          symbols.push({
            name: gm.groups.name,
            kind: 'variable',
            line: j + 1,
            endLine: j + 1,
            exported: true,
          })
        }
      }
    }
  }
  return symbols
}

/**
 * 判断一行 Rust 代码是否带 `pub` 可见性（含 `pub(crate)`）。
 * @param {string} line - 源码行。
 * @returns {boolean} 是否公开。
 */
function rustIsPublic(line) {
  return /(?:^|\s)pub(?:\s|\()/.test(line)
}

/**
 * Rust 方法签名行（impl/trait 块内）。
 * @param {string} line - 源码行。
 * @returns {RegExpExecArray|null} 匹配结果。
 */
function rustFnMatch(line) {
  return /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:const\s+)?fn\s+(?<name>[A-Za-z_]\w*)/.exec(line)
}

/**
 * 提取 Rust 符号：fn / struct / enum / trait / type / const / static，
 * 以及 impl/trait 块内的方法（含 `pub` 可见性）。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractRust(lines) {
  const symbols = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue

    // impl [<...>] [Trait for] Type：块内 fn 记为 method（parent=Type）
    const im = /^(?:pub\s+)?(?:unsafe\s+)?impl(?:\s*<[^>]*>)?\s+(?:[\w:]+(?:\s*<[^>]*>)?\s+for\s+)?(?<type>[A-Za-z_]\w*)/.exec(trimmed)
    if (im) {
      const parent = im.groups.type
      const end = findBlockEnd(lines, i)
      for (let j = i + 1; j < end; j++) {
        const fm = rustFnMatch(lines[j])
        if (!fm) continue
        symbols.push({
          name: fm.groups.name,
          kind: 'method',
          line: j + 1,
          endLine: Math.min(findBlockEnd(lines, j), end),
          exported: rustIsPublic(lines[j]),
          parent,
        })
      }
      i = end - 1
      continue
    }

    // trait Name：interface，并登记默认方法（parent=trait）
    const trm = /^(?:pub\s+)?(?:unsafe\s+)?trait\s+(?<name>[A-Za-z_]\w*)/.exec(trimmed)
    if (trm) {
      const parent = trm.groups.name
      const end = findBlockEnd(lines, i)
      symbols.push({
        name: parent,
        kind: 'interface',
        line: i + 1,
        endLine: end,
        exported: rustIsPublic(trimmed),
      })
      for (let j = i + 1; j < end; j++) {
        const fm = rustFnMatch(lines[j])
        if (!fm) continue
        symbols.push({
          name: fm.groups.name,
          kind: 'method',
          line: j + 1,
          // trait 方法可以只有声明（以 ; 结尾，无方法体）
          endLine: lines[j].includes('{') ? Math.min(findBlockEnd(lines, j), end) : j + 1,
          exported: rustIsPublic(lines[j]),
          parent,
        })
      }
      i = end - 1
      continue
    }

    // 顶层 fn
    const fm = rustFnMatch(trimmed)
    if (fm) {
      symbols.push({
        name: fm.groups.name,
        kind: 'function',
        line: i + 1,
        endLine: findBlockEnd(lines, i),
        exported: rustIsPublic(trimmed),
      })
      continue
    }

    // struct / enum / type
    const sm = /^(?:pub(?:\([^)]*\))?\s+)?(?<what>struct|enum|union|type)\s+(?<name>[A-Za-z_]\w*)/.exec(trimmed)
    if (sm) {
      const what = sm.groups.what
      symbols.push({
        name: sm.groups.name,
        kind: what === 'struct' ? 'class' : 'type',
        line: i + 1,
        // 单元结构体/别名可无块（`struct Foo;` / `type A = B;`），止于本行
        endLine: what === 'type' || !trimmed.includes('{') ? i + 1 : findBlockEnd(lines, i),
        exported: rustIsPublic(trimmed),
      })
      continue
    }

    // const / static
    const cm = /^(?:pub(?:\([^)]*\))?\s+)?(?:const|static)\s+(?<name>[A-Za-z_]\w*)/.exec(trimmed)
    if (cm) {
      symbols.push({
        name: cm.groups.name,
        kind: 'variable',
        line: i + 1,
        endLine: i + 1,
        exported: rustIsPublic(trimmed),
      })
    }
  }
  return symbols
}

/** Java 方法名黑名单（避免把控制流/声明关键字当作方法）。 */
const JAVA_MEMBER_BLACKLIST = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'throw', 'else',
  'case', 'class', 'interface', 'enum', 'record', 'synchronized', 'try', 'do',
])

/**
 * 统计一行代码中的花括号净值（忽略行注释）。
 * @param {string} line - 源码行。
 * @returns {number} `{` 数减去 `}` 数。
 */
function braceDelta(line) {
  const cleaned = line.replace(/\/\/.*$/, '')
  let delta = 0
  for (const ch of cleaned) {
    if (ch === '{') delta++
    else if (ch === '}') delta--
  }
  return delta
}

/**
 * 识别 Java 类/接口块内的一行成员（方法或构造器）。
 * @param {string} line - 源码行。
 * @param {string} className - 所属类型名（构造器识别用）。
 * @returns {{name:string}|null} 成员名；非成员返回 null。
 */
function javaMemberName(line, className) {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('@')) return null
  // 嵌套类型声明不是方法（其成员由外层循环在自身块内处理）
  if (/^(?:(?:public|protected|private|static|final|abstract|sealed|non-sealed|strictfp)\s+)*(?:class|interface|enum|record|@interface)\b/.test(trimmed)) return null
  // 构造器：Name(...) {，可带可见性修饰符
  const ctor = new RegExp(`^(?:(?:public|protected|private)\\s+)?${className.replace(/[$]/g, '\\$&')}\\s*\\([^;]*\\)\\s*(?:throws\\s+[\\w$.,\\s]+)?\\{`)
  if (ctor.test(trimmed)) return { name: className }
  // 方法：修饰符 + 可选泛型 + 返回类型 + 名称 + 参数 + {
  const mm = /^(?:(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp)\s+)*(?:<[^>]+>\s*)?(?:[\w$.[\]<>?, ]+?)\s+(?<name>[A-Za-z_$][\w$]*)\s*\([^;]*\)\s*(?:throws\s+[\w$.,\s]+)?\{/.exec(trimmed)
  if (mm && !JAVA_MEMBER_BLACKLIST.has(mm.groups.name)) return { name: mm.groups.name }
  return null
}

/**
 * 提取 Java 符号：class / interface / enum / record 与方法（含构造器）。
 * 仅扫描类体第一层成员（嵌套类型的成员由其自身声明行独立扫描），
 * 避免把内部类方法错挂到外层类。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractJava(lines) {
  const symbols = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue

    const tm = /^(?:(?:public|protected|private|static|final|abstract|sealed|non-sealed|strictfp)\s+)*(?<kind>class|interface|enum|record|@interface)\s+(?<name>[A-Za-z_$][\w$]*)/.exec(trimmed)
    if (!tm) continue
    const kind = tm.groups.kind === 'interface' || tm.groups.kind === '@interface'
      ? 'interface'
      : tm.groups.kind === 'enum' ? 'type' : 'class'
    const name = tm.groups.name
    const end = findBlockEnd(lines, i)
    symbols.push({
      name,
      kind,
      line: i + 1,
      endLine: end,
      exported: /(?:^|\s)public\s/.test(trimmed),
    })
    // 成员：仅类体第一层（depth==1）；先处理当前行之上的深度变化
    let depth = braceDelta(lines[i])
    for (let j = i + 1; j < end; j++) {
      if (depth === 1) {
        const member = javaMemberName(lines[j], name)
        if (member) {
          symbols.push({
            name: member.name,
            kind: 'method',
            line: j + 1,
            endLine: Math.min(findBlockEnd(lines, j), end),
            exported: /(?:^|\s)public\s/.test(lines[j]),
            parent: name,
          })
        }
      }
      depth += braceDelta(lines[j])
    }
  }
  return symbols
}

/** C# 方法名黑名单（避免把控制流/声明关键字当作方法）。 */
const CS_MEMBER_BLACKLIST = new Set([
  'if', 'for', 'foreach', 'while', 'switch', 'catch', 'return', 'throw', 'new',
  'class', 'interface', 'struct', 'record', 'enum', 'using', 'lock', 'fixed',
])

/**
 * 提取 C# 符号：class/interface/struct/record/enum 与第一层成员方法/构造器。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractCSharp(lines) {
  const symbols = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('#')) continue

    // 类型声明（record class / record struct 也是合法形态）
    const tm = /^(?<mods>(?:(?:public|internal|private|protected|static|sealed|abstract|partial|readonly|unsafe|file|new)\s+)*)(?<kind>class|interface|struct|record|enum)\b(?:\s+(?:class|struct))?\s+(?<name>[A-Za-z_]\w*)/.exec(trimmed)
    if (!tm) continue
    const rawKind = tm.groups.kind
    const kind = rawKind === 'interface' ? 'interface' : rawKind === 'enum' ? 'type' : 'class'
    const name = tm.groups.name
    const end = trimmed.includes('{') ? findBlockEnd(lines, i) : i + 1
    symbols.push({
      name,
      kind,
      line: i + 1,
      endLine: end,
      exported: /(?:^|\s)public\s/.test(trimmed),
    })

    // 第一层成员：方法 / 构造器（嵌套类型的成员由其自身声明行独立处理）
    let depth = braceDelta(lines[i])
    for (let j = i + 1; j < end; j++) {
      if (depth === 1) {
        const member = csharpMemberName(lines[j], name)
        if (member) {
          symbols.push({
            name: member,
            kind: 'method',
            line: j + 1,
            endLine: lines[j].includes('{') ? Math.min(findBlockEnd(lines, j), end) : j + 1,
            exported: /(?:^|\s)public\s/.test(lines[j]),
            parent: name,
          })
        }
      }
      depth += braceDelta(lines[j])
    }
  }
  return symbols
}

/**
 * 识别 C# 类体内一行成员（方法或构造器）。
 * @param {string} line - 源码行。
 * @param {string} className - 所属类型名（构造器识别用）。
 * @returns {string|null} 成员名；非成员返回 null。
 */
function csharpMemberName(line, className) {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('[') || trimmed.startsWith('#')) return null
  const ctor = new RegExp(`^(?:(?:public|private|protected|internal|static)\\s+)*${className}\\s*\\([^;]*\\)\\s*(?::\\s*(?:base|this)\\s*\\([^)]*\\)\\s*)?(?:\\{|=>)`)
  if (ctor.test(trimmed)) return className
  const mm = /^(?:(?:public|private|protected|internal|static|virtual|override|abstract|sealed|async|extern|unsafe|new|partial|readonly|required)\s+)*(?:<[^>]+>\s*)?(?:[\w$.[\]<>?,]+)\s+(?<name>[A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\([^;]*\)\s*(?:where\s+[^{]+)?(?:\{|=>)/.exec(trimmed)
  if (mm && !CS_MEMBER_BLACKLIST.has(mm.groups.name)) return mm.groups.name
  return null
}

/**
 * Kotlin 函数/方法签名行。
 * @param {string} line - 源码行。
 * @returns {RegExpExecArray|null} 匹配结果。
 */
function kotlinFunMatch(line) {
  return /^(?:(?:public|private|protected|internal|open|abstract|final|override|suspend|inline|operator|infix|tailrec|external|expect|actual)\s+)*fun\s+(?:<[^>]+>\s*)?(?:[\w$.<>?]+\.)?(?<name>[A-Za-z_]\w*)\s*\(/.exec(line)
}

/**
 * 提取 Kotlin 符号：class/interface/object/enum class 与 fun/构造器。
 * 方法归属最近的类/对象范围（支持嵌套类型）。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractKotlin(lines) {
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const ranges = []
  for (let i = 0; i < lines.length; i++) {
    while (ranges.length > 0 && ranges[ranges.length - 1].end <= i) ranges.pop()
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('@')) continue

    const tm = /^(?<mods>(?:(?:public|private|protected|internal|open|abstract|sealed|data|enum|annotation|value|inline|fun|companion|expect|actual|external|lateinit|const|override|suspend|operator|infix|tailrec)\s+)*)(?<kind>class|interface|object)\s+(?<name>[A-Za-z_]\w*)/.exec(trimmed)
    if (tm) {
      const kind = tm.groups.kind === 'interface'
        ? 'interface'
        : /\b(?:enum|annotation|value)\b/.test(tm.groups.mods) ? 'type' : 'class'
      const end = trimmed.includes('{') ? findBlockEnd(lines, i) : i + 1
      symbols.push({
        name: tm.groups.name,
        kind,
        line: i + 1,
        endLine: end,
        exported: !/\b(?:private|protected|internal)\b/.test(tm.groups.mods),
      })
      if (trimmed.includes('{')) ranges.push({ name: tm.groups.name, end })
      continue
    }

    const parent = ranges.length > 0 ? ranges[ranges.length - 1].name : undefined
    const fm = kotlinFunMatch(trimmed)
    if (fm) {
      symbols.push({
        name: fm.groups.name,
        kind: parent ? 'method' : 'function',
        line: i + 1,
        endLine: trimmed.includes('{') ? findBlockEnd(lines, i) : i + 1,
        exported: !/\b(?:private|protected|internal)\b/.test(trimmed),
        ...(parent ? { parent } : {}),
      })
      continue
    }
    if (parent && /^(?:(?:public|private|protected|internal)\s+)?constructor\s*\(/.test(trimmed)) {
      symbols.push({
        name: parent,
        kind: 'method',
        line: i + 1,
        endLine: trimmed.includes('{') ? Math.min(findBlockEnd(lines, i), ranges[ranges.length - 1].end) : i + 1,
        exported: !/\b(?:private|protected|internal)\b/.test(trimmed),
        parent,
      })
    }
  }
  return symbols
}

/**
 * 识别 PHP 类体内一行方法声明。
 * @param {string} line - 源码行。
 * @returns {{name:string, exported:boolean}|null} 方法信息。
 */
function phpMethod(line) {
  const trimmed = line.trim()
  const m = /^(?:(?:public|protected|private|static|abstract|final)\s+)*function\s+&?\s*(?<name>[A-Za-z_]\w*)\s*\(/.exec(trimmed)
  if (!m) return null
  return {
    name: m.groups.name,
    exported: !/\b(?:private|protected)\b/.test(trimmed),
  }
}

/**
 * 提取 PHP 符号：class/interface/trait/enum 与方法/顶层函数。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractPhp(lines) {
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const ranges = []
  for (let i = 0; i < lines.length; i++) {
    while (ranges.length > 0 && ranges[ranges.length - 1].end <= i) ranges.pop()
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed === '<?php' || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue

    const tm = /^(?:(?:abstract|final|readonly|public|private|protected|static)\s+)*(?<kind>class|interface|trait|enum)\s+(?<name>[A-Za-z_]\w*)/.exec(trimmed)
    if (tm) {
      const kind = tm.groups.kind === 'interface' ? 'interface' : tm.groups.kind === 'enum' ? 'type' : 'class'
      const end = trimmed.includes('{') ? findBlockEnd(lines, i) : i + 1
      symbols.push({
        name: tm.groups.name,
        kind,
        line: i + 1,
        endLine: end,
        // PHP 无 export 关键字；类默认对自动加载可见
        exported: true,
      })
      if (trimmed.includes('{')) ranges.push({ name: tm.groups.name, end })
      continue
    }

    const parent = ranges.length > 0 ? ranges[ranges.length - 1].name : undefined
    if (parent) {
      const member = phpMethod(trimmed)
      if (member) {
        symbols.push({
          name: member.name,
          kind: 'method',
          line: i + 1,
          endLine: trimmed.includes('{') ? Math.min(findBlockEnd(lines, i), ranges[ranges.length - 1].end) : i + 1,
          exported: member.exported,
          parent,
        })
        continue
      }
    }
    const fm = /^(?:(?:public|protected|private|static|abstract|final)\s+)*function\s+&?\s*(?<name>[A-Za-z_]\w*)\s*\(/.exec(trimmed)
    if (fm) {
      symbols.push({
        name: fm.groups.name,
        kind: 'function',
        line: i + 1,
        endLine: trimmed.includes('{') ? findBlockEnd(lines, i) : i + 1,
        exported: !/\b(?:private|protected)\b/.test(trimmed),
      })
    }
  }
  return symbols
}

/**
 * 去掉 Ruby 行内注释（尊重单/双引号字符串）。
 * 不做完整词法：heredoc 内含 `#` 的少数场景会误裁，属已知限制。
 * @param {string} line - 源码行。
 * @returns {string} 去掉注释后的代码。
 */
function stripRubyComment(line) {
  let quote = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '#') return line.slice(0, i)
  }
  return line
}

/** Ruby 行首出现即开块的关关键字（if/unless/while 等行尾修饰形态不算）。 */
const RUBY_BLOCK_STARTERS = /^(?:def|class|module|case|begin|for|if|unless|while|until)\b/

/**
 * 判断一行 Ruby `def` 是否为表达式体（`def foo = expr`，无 end）。
 * @param {string} line - 源码行。
 * @returns {boolean} 是否表达式体定义。
 */
function isRubyEndlessDef(line) {
  // `=` 前必须有空白：`def foo = 1` 是表达式体，`def foo=(v)` 是 setter
  return /^def\s+(?:(?:self|[A-Z]\w*(?:::[A-Z]\w*)*)\.)?\w+[?!=]?(?:\s*\([^)]*\))?\s+=\s*\S/.test(stripRubyComment(line).trim())
}

/**
 * 标记 Ruby 不参与块配平与符号提取的行：heredoc 内容与 `=begin/=end` 块注释。
 * heredoc 仅识别每行首个起始（一行多个 heredoc 的极少数写法不展开，
 * 见兼容矩阵的已知限制）；起始要求前置 `=`/`(`/`[`/`,` 或行首，避免把
 * `list << ITEM` 这类追加操作误判为 heredoc。
 * @param {string[]} lines - 代码行。
 * @returns {boolean[]} 逐行标记（true = 内容行，跳过）。
 */
function rubyInertLines(lines) {
  const inert = new Array(lines.length).fill(false)
  /** @type {string|null} 当前 heredoc 终止符。 */
  let heredoc = null
  let blockComment = false
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (heredoc !== null) {
      inert[i] = true
      if (raw.trim() === heredoc) heredoc = null
      continue
    }
    if (blockComment) {
      inert[i] = true
      if (/^=end\b/.test(raw.trim())) blockComment = false
      continue
    }
    const trimmed = raw.trim()
    if (/^=begin\b/.test(trimmed)) {
      inert[i] = true
      blockComment = true
      continue
    }
    const open = /(?:^|[=([,])\s*<<[-~]?(['"]?)([A-Za-z_]\w*)\1/.exec(stripRubyComment(raw))
    if (open) heredoc = open[2]
  }
  return inert
}

/**
 * 计算一行 Ruby 代码的块深度增量（`end` 为负，开块关键字为正）。
 * `obj.end` / `::end` 这类方法调用不计；`while ... do` 只计一次；
 * 表达式体 def（无 end）不计开块；heredoc/块注释内容行按 0 计。
 * @param {string} line - 源码行。
 * @param {boolean} [inert] - 该行是否属于 heredoc/块注释内容。
 * @returns {number} 深度增量。
 */
function rubyBlockDelta(line, inert = false) {
  if (inert) return 0
  const code = stripRubyComment(line).trim()
  if (!code) return 0
  let delta = 0
  const ends = code.match(/(?<![.\w:@$])end\b/g)
  if (ends) delta -= ends.length
  if (RUBY_BLOCK_STARTERS.test(code) && !isRubyEndlessDef(code)) delta++
  if (/(?<![.\w:@$])do\b/.test(code) && !/^(?:while|until|for)\b/.test(code)) delta++
  return delta
}

/**
 * 计算 Ruby 块的结束行（以声明行自身的深度增量为起点）。
 * @param {string[]} lines - 代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @param {boolean[]} inert - rubyInertLines 的逐行标记。
 * @returns {number} 块结束行（1-based）。
 */
function rubyBlockEnd(lines, startIdx, inert) {
  let depth = rubyBlockDelta(lines[startIdx], inert[startIdx])
  if (depth <= 0) return startIdx + 1
  for (let i = startIdx + 1; i < lines.length; i++) {
    depth += rubyBlockDelta(lines[i], inert[i])
    if (depth <= 0) return i + 1
  }
  return lines.length
}

/**
 * 提取 Ruby 符号：class / module / def（含 self. 与 ?!= 后缀）/ attr_* / 常量。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractRuby(lines) {
  const symbols = []
  const inert = rubyInertLines(lines)
  /** @type {Array<{name:string, end:number}>} */
  const ranges = []
  for (let i = 0; i < lines.length; i++) {
    while (ranges.length > 0 && ranges[ranges.length - 1].end <= i) ranges.pop()
    // heredoc 内容与 =begin/=end 块注释不产出符号
    if (inert[i]) continue
    const trimmed = stripRubyComment(lines[i]).trim()
    if (trimmed === '' || trimmed === '__END__') continue

    // class Foo / class Foo < Bar / module A::B / class << self（后者不匹配）
    const tm = /^(?<kind>class|module)\s+(?<name>[A-Z]\w*(?:::[A-Z]\w*)*)/.exec(trimmed)
    if (tm) {
      const end = rubyBlockEnd(lines, i, inert)
      const name = tm.groups.name
      symbols.push({
        name,
        // module 更像命名空间容器，记为 type 以区别于 class
        kind: tm.groups.kind === 'module' ? 'type' : 'class',
        line: i + 1,
        endLine: end,
        exported: true,
      })
      if (end > i + 1) ranges.push({ name, end })
      continue
    }

    // attr_reader :a, :b / attr_accessor :x
    const am = /^attr_(?:reader|writer|accessor)\s+(?<names>.+)$/.exec(trimmed)
    if (am) {
      for (const part of am.groups.names.split(',')) {
        const nm = /:([A-Za-z_]\w*[?!=]?)/.exec(part)
        if (nm) {
          symbols.push({
            name: nm[1], kind: 'variable', line: i + 1, endLine: i + 1, exported: true,
          })
        }
      }
      continue
    }

    // def foo / def self.foo / def foo? / def foo=(v)
    const dm = /^def\s+(?:(?:self|[A-Z]\w*(?:::[A-Z]\w*)*)\.)?(?<name>[A-Za-z_]\w*[?!=]?)/.exec(trimmed)
    if (dm) {
      const parent = ranges.length > 0 ? ranges[ranges.length - 1].name : undefined
      const endLine = isRubyEndlessDef(lines[i]) ? i + 1 : rubyBlockEnd(lines, i, inert)
      symbols.push({
        name: dm.groups.name,
        kind: parent ? 'method' : 'function',
        line: i + 1,
        endLine,
        exported: true,
        ...(parent ? { parent } : {}),
      })
      continue
    }

    // 常量（FOO = / FOO ||=）：记为 variable，便于检索入口配置
    const cm = /^(?<name>[A-Z][A-Z0-9_]*)\s*(?:\|\||&&)?=/.exec(trimmed)
    if (cm) {
      symbols.push({
        name: cm.groups.name, kind: 'variable', line: i + 1, endLine: i + 1, exported: true,
      })
    }
  }
  return symbols
}

/** Swift 声明修饰符（含属性包装器与可见性）。 */
const SWIFT_MODIFIERS = '(?:(?:@\\w+(?:\\([^)]*\\))?|public|private|fileprivate|internal|open|final|static|class|override|mutating|nonmutating|required|convenience|indirect|dynamic|lazy|weak|unowned|nonisolated|async|throws|rethrows)\\s+)*'

/**
 * 提取 Swift 符号：class/struct/enum/actor/protocol/extension 与 func/init/typealias。
 * extension 只作为方法归属范围（不重复产出同名类型符号）。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractSwift(lines) {
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const ranges = []
  for (let i = 0; i < lines.length; i++) {
    while (ranges.length > 0 && ranges[ranges.length - 1].end <= i) ranges.pop()
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue

    const tm = new RegExp(`^${SWIFT_MODIFIERS}(?<kind>class|struct|enum|protocol|extension|actor)\\s+(?!(?:func|var|let|subscript|init|typealias)\\b)(?<name>[A-Za-z_]\\w*)`).exec(trimmed)
    if (tm) {
      const end = trimmed.includes('{') ? findBlockEnd(lines, i) : i + 1
      const rawKind = tm.groups.kind
      const name = tm.groups.name
      if (rawKind !== 'extension') {
        const kind = rawKind === 'protocol' ? 'interface' : rawKind === 'enum' ? 'type' : 'class'
        symbols.push({
          name,
          kind,
          line: i + 1,
          endLine: end,
          exported: !/\b(?:private|fileprivate)\b/.test(trimmed),
        })
      }
      if (end > i + 1) ranges.push({ name, end })
      continue
    }

    const am = new RegExp(`^${SWIFT_MODIFIERS}typealias\\s+(?<name>[A-Za-z_]\\w*)`).exec(trimmed)
    if (am) {
      symbols.push({
        name: am.groups.name, kind: 'type', line: i + 1, endLine: i + 1,
        exported: !/\b(?:private|fileprivate)\b/.test(trimmed),
      })
      continue
    }

    const fm = new RegExp(`^${SWIFT_MODIFIERS}func\\s+(?<name>[A-Za-z_]\\w*)`).exec(trimmed)
    if (fm) {
      const parent = ranges.length > 0 ? ranges[ranges.length - 1].name : undefined
      symbols.push({
        name: fm.groups.name,
        kind: parent ? 'method' : 'function',
        line: i + 1,
        endLine: trimmed.includes('{') ? findBlockEnd(lines, i) : i + 1,
        exported: !/\b(?:private|fileprivate)\b/.test(trimmed),
        ...(parent ? { parent } : {}),
      })
      continue
    }

    // 初始化器：init / init? / init!（构造器记为 method，与 Java/Kotlin 一致）
    const im = new RegExp(`^${SWIFT_MODIFIERS}init[?!]?\\s*(?:<[^>]*>)?\\s*\\(`).exec(trimmed)
    if (im) {
      const parent = ranges.length > 0 ? ranges[ranges.length - 1].name : undefined
      if (parent) {
        symbols.push({
          name: 'init',
          kind: 'method',
          line: i + 1,
          endLine: trimmed.includes('{') ? Math.min(findBlockEnd(lines, i), ranges[ranges.length - 1].end) : i + 1,
          exported: !/\b(?:private|fileprivate)\b/.test(trimmed),
          parent,
        })
      }
    }
  }
  return symbols
}

/** Scala 声明修饰符（含 `case class` 的 case 与可见性作用域）。 */
const SCALA_MODIFIERS = '(?:(?:private(?:\\[[^\\]]*\\])?|protected(?:\\[[^\\]]*\\])?|override|final|sealed|abstract|implicit|lazy|inline|opaque|open|case|transparent|infix|erased)\\s+)*'

/**
 * 计算一行 Scala 代码的缩进宽度（Tab 按 4 计）。
 * @param {string} line - 源码行。
 * @returns {number} 缩进字符数。
 */
function scalaIndentOf(line) {
  let n = 0
  for (const ch of line) {
    if (ch === ' ') n++
    else if (ch === '\t') n += 4
    else break
  }
  return n
}

/**
 * 计算 Scala 3 缩进体（无花括号）的结束行：下一个缩进不深于声明行的
 * 可执行行之前；跳过空行与注释。
 * @param {string[]} lines - 代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @returns {number} 块结束行（1-based；无缩进体时返回声明行）。
 */
function scalaIndentBlockEnd(lines, startIdx) {
  const startIndent = scalaIndentOf(lines[startIdx])
  let lastBody = startIdx + 1
  for (let j = startIdx + 1; j < lines.length; j++) {
    const trimmed = lines[j].trim()
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
    if (scalaIndentOf(lines[j]) <= startIndent) return j
    lastBody = j + 1
  }
  return lastBody
}

/**
 * 从 Scala `extension (s: String)` 的接收者列表提取被扩展类型（首参数类型名）。
 * @param {string} recv - 括号内文本。
 * @returns {string} 类型名；无法识别返回 'extension'。
 */
function scalaExtensionType(recv) {
  const m = /:\s*([A-Za-z_][\w.]*)/.exec(recv)
  if (!m) return 'extension'
  const parts = m[1].split('.')
  return parts[parts.length - 1]
}

/**
 * 在 Scala 声明头中寻找跨行结束符：花括号块 `{`、表达式体 `=` 或
 * Scala 3 冒号模板 `:`。跟踪括号深度与字符串状态；只有顶层（参数列表
 * 之外）的符号才算结束符，默认参数里的 `=` 与类型里的 `:` 不会误判。
 * @param {string[]} lines - 代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @returns {{kind:'brace'|'assign'|'colon', index:number, rest?:string}|null}
 *   结束符位置；声明头在 40 行内未闭合返回 null。
 */
function scalaHeaderTerminator(lines, startIdx) {
  let depth = 0
  let inString = false
  let escape = false
  for (let j = startIdx; j < Math.min(lines.length, startIdx + 40); j++) {
    const line = lines[j]
    let brace = -1
    let assign = -1
    let colon = -1
    for (let k = 0; k < line.length; k++) {
      const ch = line[k]
      if (inString) {
        if (escape) escape = false
        else if (ch === '\\') escape = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') { inString = true; continue }
      if (ch === '/' && line[k + 1] === '/') break
      if (ch === '(' || ch === '[') depth++
      else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
      else if (depth === 0 && ch === '{') { brace = k; break }
      else if (depth === 0 && ch === '=') {
        const prev = line[k - 1]
        const next = line[k + 1]
        // 排除 == / != / <= / >= / =>：只认赋值式方法体
        if (prev !== '=' && prev !== '!' && prev !== '<' && prev !== '>'
          && next !== '=' && next !== '>') assign = k
      } else if (depth === 0 && ch === ':') colon = k
    }
    if (brace >= 0) return { kind: 'brace', index: j }
    if (assign >= 0) return { kind: 'assign', index: j, rest: line.slice(assign + 1) }
    if (colon >= 0 && /:\s*$/.test(line)) return { kind: 'colon', index: j }
    // 续行判定：括号未闭合，或行尾仍是声明延续符号
    if (depth > 0) continue
    const trimmed = line.trim()
    if (trimmed === '') break
    if (/[（(,:=]$/.test(trimmed) || /\b(?:extends|with|implements)$/.test(trimmed)) continue
    break
  }
  return null
}

/**
 * 提取 Scala 符号：class / case class / trait / object / enum / given 与 def。
 * object 记为 class（单例容器），trait 记为 interface，enum 记为 type，
 * given 实例记为 variable。支持 Scala 3 缩进语法：类型声明以 `:` 结尾、
 * def 以 `=` 结尾、extension/given 以缩进体书写时，按缩进推导块范围，
 * 使成员归属不再丢失。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractScala(lines) {
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const ranges = []
  for (let i = 0; i < lines.length; i++) {
    while (ranges.length > 0 && ranges[ranges.length - 1].end <= i) ranges.pop()
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue

    const tm = new RegExp(`^${SCALA_MODIFIERS}(?<kind>class|trait|object|enum)\\s+(?<name>[A-Za-z_]\\w*)`).exec(trimmed)
    if (tm) {
      // 花括号块 / Scala 3 冒号模板；声明头可跨行（参数逐行书写）
      const header = scalaHeaderTerminator(lines, i)
      const blockEnd = header?.kind === 'brace'
        ? findBlockEnd(lines, header.index)
        : header?.kind === 'colon' ? scalaIndentBlockEnd(lines, header.index) : i + 1
      const rawKind = tm.groups.kind
      const name = tm.groups.name
      symbols.push({
        name,
        kind: rawKind === 'trait' ? 'interface' : rawKind === 'enum' ? 'type' : 'class',
        line: i + 1,
        endLine: blockEnd,
        exported: !/\b(?:private|protected)\b/.test(trimmed),
      })
      if (blockEnd > i + 1) ranges.push({ name, end: blockEnd })
      continue
    }

    // Scala 3 extension (s: String)：不产出符号，只作为方法归属范围
    const em = new RegExp(`^${SCALA_MODIFIERS}extension\\s*\\((?<recv>[^)]*)\\)`).exec(trimmed)
    if (em) {
      const blockEnd = trimmed.includes('{') ? findBlockEnd(lines, i) : scalaIndentBlockEnd(lines, i)
      if (blockEnd > i + 1) ranges.push({ name: scalaExtensionType(em.groups.recv), end: blockEnd })
      continue
    }

    // Scala 3 given [Name]: Type with / 单行赋值：匿名实例用类型名登记
    const gm = new RegExp(`^${SCALA_MODIFIERS}given\\s+(?:(?<name>[A-Za-z_]\\w*)\\s*:\\s*)?(?<type>[A-Za-z_][\\w.]*)`).exec(trimmed)
    if (gm) {
      const givenName = gm.groups.name || gm.groups.type.split('.').pop()
      const blockEnd = trimmed.includes('{')
        ? findBlockEnd(lines, i)
        : /(?:with|=)\s*$/.test(trimmed) ? scalaIndentBlockEnd(lines, i) : i + 1
      symbols.push({
        name: givenName,
        kind: 'variable',
        line: i + 1,
        endLine: blockEnd,
        exported: !/\b(?:private|protected)\b/.test(trimmed),
      })
      if (blockEnd > i + 1) ranges.push({ name: givenName, end: blockEnd })
      continue
    }

    const fm = new RegExp(`^${SCALA_MODIFIERS}def\\s+(?<name>[A-Za-z_$][\\w$]*)`).exec(trimmed)
    if (fm && fm.groups.name !== 'this') {
      const parent = ranges.length > 0 ? ranges[ranges.length - 1].name : undefined
      // 花括号体 / 表达式体 / Scala 3 缩进体；声明头可跨行
      const header = scalaHeaderTerminator(lines, i)
      let endLine
      if (header?.kind === 'brace') endLine = findBlockEnd(lines, header.index)
      else if (header?.kind === 'assign') {
        endLine = String(header.rest ?? '').trim() === ''
          ? scalaIndentBlockEnd(lines, header.index)
          : header.index + 1
      } else {
        endLine = i + 1
      }
      symbols.push({
        name: fm.groups.name,
        kind: parent ? 'method' : 'function',
        line: i + 1,
        endLine,
        exported: !/\b(?:private|protected)\b/.test(trimmed),
        ...(parent ? { parent } : {}),
      })
    }
  }
  return symbols
}

/** C/C++ 语句与运算符关键字：这些名字出现在 `(` 前时不是函数声明。 */
const CPP_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'new', 'delete',
  'throw', 'else', 'do', 'case', 'goto', 'co_await', 'co_return', 'co_yield',
  'static_assert', 'assert', 'defined', 'typedef', 'using', 'namespace',
  'template', 'operator', 'decltype', 'alignof', 'noexcept',
])

/** C/C++ 函数/方法名（可带函数限定 `Foo::bar`、析构 `~Foo`）。 */
const CPP_NAME = '(?:~?[A-Za-z_]\\w*)(?:::(?:~?[A-Za-z_]\\w*))*'

/**
 * 找出 C/C++ 声明头之后的第一个顶层 `{` 或 `;`。
 * 跟踪括号深度与字符串状态：默认参数里的 `{...}` 不算函数体起点；
 * 跨行参数列表（每行一个参数）也能正确跳到 `)` 之后的函数体。
 * @param {string[]} lines - 代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @returns {{kind:'brace'|'semi', index:number}|null} 终止符位置；
 *   60 行内未找到返回 null（视为无法解析，跳过）。
 */
function cppTerminator(lines, startIdx) {
  let depth = 0
  let inString = false
  let escape = false
  for (let j = startIdx; j < Math.min(lines.length, startIdx + 60); j++) {
    const line = lines[j]
    for (let k = 0; k < line.length; k++) {
      const ch = line[k]
      if (inString) {
        if (escape) escape = false
        else if (ch === '\\') escape = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') { inString = true; continue }
      if (ch === '/' && line[k + 1] === '/') break
      if (ch === '(') depth++
      else if (ch === ')') depth = Math.max(0, depth - 1)
      else if (depth === 0 && ch === '{') return { kind: 'brace', index: j }
      else if (depth === 0 && ch === ';') return { kind: 'semi', index: j }
    }
    // 行末重置字符串状态：未闭合引号不应吞掉后续行
    inString = false
    escape = false
  }
  return null
}

/**
 * 去除 Elixir 行注释（`#`，但 `?#` 字符字面量与字符串内的 `#` 不算）。
 * 只做行级处理：多行 heredoc 内的 `#` 可能被误删，但只影响符号/块检测，
 * 不影响源码内容。
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
 * 计算一行 Elixir 的 do/end 深度增量。
 * 块起始：`do`（排除 `do:` 关键字形式）与 `fn`；块结束：`end`。
 * 单行 `fn -> ... end` 与 `if x, do: y` 的增量为 0。
 * @param {string} line - 源码行。
 * @returns {number} 深度增量。
 */
function elixirBlockDelta(line) {
  const code = stripElixirComment(line)
  if (code.trim() === '') return 0
  const count = (re) => (code.match(re) ?? []).length
  return count(/(?<![\w.:@])fn\b/g)
    + count(/(?<![\w.:@])do\b(?!:)/g)
    - count(/(?<![\w.:@])end\b/g)
}

/**
 * 计算 Elixir 块（defmodule/def…do 或 fn）的结束行（1-based）。
 * 多行函数签名先向后找到 `do` 所在行作为块起点（最多 20 行）；
 * 单行 `do:` 形式直接返回声明行；`scan=false` 用于 defguard/defdelegate
 * 这类永不开启 do 块的声明（否则会把后续模块的 `do` 误当自己的块）。
 * @param {string[]} lines - 代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @param {boolean} [scan] - 是否向后寻找 `do`（默认 true）。
 * @returns {number} 结束行（1-based，含 `end`）。
 */
function elixirBlockEnd(lines, startIdx, scan = true) {
  if (!scan || /\bdo:/.test(stripElixirComment(lines[startIdx]))) return startIdx + 1
  let head = startIdx
  const limit = Math.min(lines.length - 1, startIdx + 20)
  while (head <= limit && !/(?<![\w.:@])do\b(?!:)/.test(stripElixirComment(lines[head]))) head++
  if (head > limit) return startIdx + 1
  let depth = 0
  for (let i = head; i < lines.length; i++) {
    depth += elixirBlockDelta(lines[i])
    if (depth <= 0) return i + 1
  }
  return lines.length
}

/**
 * 提取 Elixir 符号：defmodule（模块/结构体）、def/defp、defmacro(p)、
 * defguard(p)、defdelegate。
 * - 模块内函数记为 method 并带 parent（模块全名）；
 * - `defp` 等私有形式 exported=false；
 * - 多行签名按 `do` 所在行起算块范围；`do:` 单行形式只占一行。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractElixir(lines) {
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const ranges = []
  for (let i = 0; i < lines.length; i++) {
    while (ranges.length > 0 && ranges[ranges.length - 1].end <= i) ranges.pop()
    const code = stripElixirComment(lines[i]).trim()
    if (code === '') continue

    // defmodule MyApp.Accounts.User do
    const mm = /^defmodule\s+([A-Z][\w.]*)\s+do\b/.exec(code)
    if (mm) {
      // 嵌套 `defmodule Inner` 的真实模块名是 `Outer.Inner`（Elixir 语义）
      const outer = ranges.length > 0 ? ranges[ranges.length - 1].name : ''
      const name = outer && !mm[1].startsWith(`${outer}.`) ? `${outer}.${mm[1]}` : mm[1]
      const end = elixirBlockEnd(lines, i)
      symbols.push({
        name, kind: 'class', line: i + 1, endLine: end, exported: true,
      })
      if (end > i + 1) ranges.push({ name, end })
      continue
    }

    // def/defp/defmacro/defmacrop/defguard/defguardp/defdelegate name
    const fm = /^(defp?|defmacro(?:p)?|defguard(?:p)?|defdelegate)\s+([a-z_][\w!?]*)/.exec(code)
    if (fm) {
      const parent = ranges.length > 0 ? ranges[ranges.length - 1].name : undefined
      symbols.push({
        name: fm[2],
        kind: parent ? 'method' : 'function',
        line: i + 1,
        endLine: elixirBlockEnd(lines, i, fm[1] !== 'defguard' && fm[1] !== 'defguardp'
          && fm[1] !== 'defdelegate'),
        exported: fm[1] === 'def' || fm[1] === 'defmacro' || fm[1] === 'defguard'
          || fm[1] === 'defdelegate',
        ...(parent ? { parent } : {}),
      })
    }
  }
  return symbols
}

/**
 * 提取 Lua 的可解析代码行：去掉行注释 `--`，并把 `--[[ ... ]]` 块注释与
 * `[[ ... ]]` 长字符串替换为空（保留行数），避免其中的 `function`/`end`
 * 干扰块配平与符号识别。短字符串内的 `--` 不截断。
 * @param {string[]} lines - 源码行。
 * @returns {string[]} 等长的可解析代码行。
 */
function luaCodeLines(lines) {
  const out = []
  let longForm = 0 // 1 = 块注释，2 = 长字符串
  for (const raw of lines) {
    let code = ''
    let index = 0
    while (index < raw.length) {
      if (longForm !== 0) {
        const close = raw.indexOf(']]', index)
        if (close < 0) break
        longForm = 0
        index = close + 2
        continue
      }
      if (raw.startsWith('--[[', index)) { longForm = 1; index += 4; continue }
      if (raw.startsWith('--', index)) break
      if (raw.startsWith('[[', index)) { longForm = 2; index += 2; continue }
      const ch = raw[index]
      if (ch === '"' || ch === "'") {
        code += ch
        index++
        while (index < raw.length) {
          code += raw[index]
          if (raw[index] === '\\' && index + 1 < raw.length) {
            code += raw[index + 1]
            index += 2
            continue
          }
          if (raw[index] === ch) { index++; break }
          index++
        }
        continue
      }
      code += ch
      index++
    }
    out.push(code)
  }
  return out
}

/**
 * 计算一行 Lua 的块深度增量（function/if/for/while/do/repeat … end/until）。
 * `for`/`while` 自带的 `do` 不重复计数；`elseif` 不开启新块。
 * @param {string} code - 已去注释的代码行。
 * @returns {number} 深度增量。
 */
function luaBlockDelta(code) {
  if (!code.trim()) return 0
  const count = re => (code.match(re) ?? []).length
  const loops = count(/\b(for|while)\b/g)
  const dos = count(/\bdo\b/g)
  return count(/\bfunction\b/g) + count(/\bif\b/g) + loops
    + count(/\brepeat\b/g) + Math.max(0, dos - loops)
    - count(/\buntil\b/g) - count(/\bend\b/g)
}

/**
 * 计算 Lua 函数块的结束行（1-based，含 `end`）。
 * @param {string[]} codeLines - 已去注释的代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @returns {number} 结束行。
 */
function luaBlockEnd(codeLines, startIdx) {
  let depth = luaBlockDelta(codeLines[startIdx])
  if (depth <= 0) return startIdx + 1
  for (let i = startIdx + 1; i < codeLines.length; i++) {
    depth += luaBlockDelta(codeLines[i])
    if (depth <= 0) return i + 1
  }
  return codeLines.length
}

/**
 * 提取 Lua 符号：`function name` / `local function name`、`M.foo = function`
 * 以及模块级变量（`local M = {}`）。`M.foo` / `M:foo` 记为 method 并带
 * parent `M`；`local` 形式标记非导出；函数体内的局部变量不产出符号。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractLua(lines) {
  const codeLines = luaCodeLines(lines)
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const functionRanges = []
  for (let i = 0; i < codeLines.length; i++) {
    while (functionRanges.length > 0 && functionRanges[functionRanges.length - 1].end <= i) {
      functionRanges.pop()
    }
    const code = codeLines[i].trim()
    if (code === '') continue

    const fm = /^(local\s+)?function\s+([A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*)\s*\(/.exec(code)
    if (fm) {
      const raw = fm[2].replace(/:/g, '.')
      const dot = raw.lastIndexOf('.')
      const parent = dot > 0 ? raw.slice(0, dot) : undefined
      const end = luaBlockEnd(codeLines, i)
      symbols.push({
        name: dot > 0 ? raw.slice(dot + 1) : raw,
        kind: parent ? 'method' : 'function',
        line: i + 1,
        endLine: end,
        exported: !fm[1],
        ...(parent ? { parent } : {}),
      })
      if (end > i + 1) functionRanges.push({ name: raw, end })
      continue
    }

    const am = /^(local\s+)?([A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*)\s*=\s*function\b/.exec(code)
    if (am) {
      const raw = am[2].replace(/:/g, '.')
      const dot = raw.lastIndexOf('.')
      const parent = dot > 0 ? raw.slice(0, dot) : undefined
      const end = luaBlockEnd(codeLines, i)
      symbols.push({
        name: dot > 0 ? raw.slice(dot + 1) : raw,
        kind: parent ? 'method' : 'function',
        line: i + 1,
        endLine: end,
        exported: !am[1],
        ...(parent ? { parent } : {}),
      })
      if (end > i + 1) functionRanges.push({ name: raw, end })
      continue
    }

    // 函数体内的局部量不登记，避免每个临时变量都成为符号
    if (functionRanges.length > 0) continue
    const vm = /^(local\s+)?([A-Za-z_]\w*)\s*=(?!=)/.exec(code)
    if (vm) {
      symbols.push({
        name: vm[2], kind: 'variable', line: i + 1, endLine: i + 1, exported: !vm[1],
      })
    }
  }
  return symbols
}

/** Zig 关键字与内建值：禁止被误识别为声明名。 */
const ZIG_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'break', 'continue',
  'defer', 'errdefer', 'try', 'orelse', 'and', 'or', 'not', 'null', 'true',
  'false', 'undefined', 'unreachable', 'fn', 'struct', 'enum', 'union',
  'opaque', 'test', 'comptime', 'inline', 'noinline', 'export', 'extern',
  'threadlocal', 'usingnamespace', 'const', 'var', 'pub', 'async', 'await',
  'suspend', 'resume', 'nosuspend', 'align', 'allowzero', 'volatile', 'packed',
])

/**
 * 提取 Zig 的可解析代码行：去掉 `//`（含 `///`、`//!`）注释，并把
 * 多行字符串行（`\\` 起始）的剩余内容清空。Zig 没有块注释，逐行即可；
 * 字符串/字符字面量内的 `//` 不截断。
 * @param {string[]} lines - 源码行。
 * @returns {string[]} 等长的可解析代码行。
 */
function zigCodeLines(lines) {
  const out = []
  for (const raw of lines) {
    let code = ''
    let quote = null
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (quote) {
        code += ch
        if (ch === '\\' && i + 1 < raw.length) { code += raw[i + 1]; i++; continue }
        if (ch === quote) quote = null
        continue
      }
      if (ch === '/' && raw[i + 1] === '/') break
      // 多行字符串：`\\` 之后到行尾都是内容（不含引号语义）
      if (ch === '\\' && raw[i + 1] === '\\') break
      if (ch === '"' || ch === "'") { quote = ch; code += ch; continue }
      code += ch
    }
    out.push(code)
  }
  return out
}

/**
 * 计算一行 Zig 代码的花括号增量（字符串/字符字面量感知）。
 * @param {string} code - 已去注释的代码行。
 * @returns {number} `{` 为正、`}` 为负的净值。
 */
function zigBraceDelta(code) {
  let delta = 0
  let quote = null
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]
    if (quote) {
      if (ch === '\\') { i++; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '{') delta++
    else if (ch === '}') delta--
  }
  return delta
}

/**
 * 计算 Zig 声明的结束行：块体按花括号配平；在块开始前遇到 `;`
 * （`extern fn` 原型、单行常量）时返回该行。
 * @param {string[]} codeLines - 已去注释的代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @returns {number} 结束行（1-based）。
 */
function zigBlockEnd(codeLines, startIdx) {
  let depth = 0
  let opened = false
  for (let i = startIdx; i < codeLines.length; i++) {
    const line = codeLines[i]
    if (!opened) {
      const semi = line.indexOf(';')
      const brace = line.indexOf('{')
      if (semi >= 0 && (brace < 0 || semi < brace)) return i + 1
    }
    depth += zigBraceDelta(line)
    if (depth > 0) opened = true
    // 单行闭合块（`fn f() void {}` / `const T = struct {};`）
    if (!opened && line.includes('{')) return i + 1
    if (opened && depth <= 0) return i + 1
  }
  return codeLines.length
}

/**
 * 提取 Zig 符号。
 * - 顶层：`const Foo = struct/enum/union/opaque`（含 `extern`/`packed`/
 *   `union(enum)`）、`fn name`、`test "desc"`、`const/var name`；
 * - 容器内（struct/enum/union 体的一层）：成员 `fn` 记 method 并归属容器，
 *   嵌套类型与常量同样登记；函数体与 comptime 块内的局部量不登记；
 * - `pub` 决定导出；`export fn`（C ABI）视为导出；
 * - `@import`/`@cImport`/`@This` 绑定是模块别名而非业务符号，跳过。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractZig(lines) {
  const codeLines = zigCodeLines(lines)
  const symbols = []
  /** @type {Array<{name:string, bodyDepth:number}>} */
  const containers = []
  let depth = 0
  const typeRe = /^(?:pub\s+)?(?:const|var)\s+([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*(?:extern\s+|packed\s+)*(struct|enum|union|opaque)\b/
  const fnRe = /^(?:pub\s+)?(?:(?:export|inline|noinline|threadlocal)\s+|extern\s+(?:"[^"]*"\s+)?)*fn\s+([A-Za-z_]\w*)\s*\(/
  const testRe = /^test\s+"([^"]*)"\s*\{/
  const varRe = /^(?:pub\s+)?(?:threadlocal\s+)?(?:const|var)\s+([A-Za-z_]\w*)\b/
  for (let i = 0; i < codeLines.length; i++) {
    while (containers.length > 0 && depth < containers[containers.length - 1].bodyDepth) {
      containers.pop()
    }
    const line = codeLines[i].trim()
    const container = containers[containers.length - 1]
    const atMember = container !== undefined && depth === container.bodyDepth
    if (line !== '' && (depth === 0 || atMember)) {
      const exported = /^pub\s+/.test(line) || /^export\s+fn\b/.test(line)
      const typeMatch = typeRe.exec(line)
      if (typeMatch) {
        const name = typeMatch[1]
        symbols.push({
          name,
          kind: 'class',
          line: i + 1,
          endLine: zigBlockEnd(codeLines, i),
          exported,
          ...(atMember ? { parent: container.name } : {}),
        })
        containers.push({ name, bodyDepth: depth + 1 })
        depth += zigBraceDelta(codeLines[i])
        continue
      }
      const test = depth === 0 ? testRe.exec(line) : null
      if (test) {
        const name = test[1].trim()
        if (name !== '') {
          symbols.push({
            name,
            kind: 'function',
            line: i + 1,
            endLine: zigBlockEnd(codeLines, i),
            exported: false,
          })
        }
        depth += zigBraceDelta(codeLines[i])
        continue
      }
      const fn = fnRe.exec(line)
      if (fn && !ZIG_KEYWORDS.has(fn[1])) {
        symbols.push({
          name: fn[1],
          kind: atMember ? 'method' : 'function',
          line: i + 1,
          endLine: zigBlockEnd(codeLines, i),
          exported,
          ...(atMember ? { parent: container.name } : {}),
        })
        depth += zigBraceDelta(codeLines[i])
        continue
      }
      // 私有模块别名不是业务符号（每个文件都有 const std = @import("std")）；
      // `pub const x = @import("x.zig")` 是对外再导出，检索/影响面需要看到它
      const isBinding = /=\s*@(?:import|cImport|This)\b/.test(line)
      const reexport = isBinding && exported && /=\s*@import\b/.test(line)
      const variable = varRe.exec(line)
      if (variable && (!isBinding || reexport) && !ZIG_KEYWORDS.has(variable[1])) {
        symbols.push({
          name: variable[1],
          kind: 'variable',
          line: i + 1,
          endLine: i + 1,
          exported,
          ...(atMember ? { parent: container.name } : {}),
        })
        depth += zigBraceDelta(codeLines[i])
        continue
      }
    }
    depth += zigBraceDelta(codeLines[i])
  }
  return symbols
}

/**
 * 提取 Gleam 的可解析代码行：去掉 `//`（含 `////` 文档）注释，并把字符串
 * 字面量内容替换为空格（跨行字符串状态延续到下一行），避免其中的
 * `//`/`{`/`}` 干扰块配平。Gleam 没有块注释。
 * @param {string[]} lines - 源码行。
 * @returns {string[]} 等长的可解析代码行。
 */
function gleamCodeLines(lines) {
  const out = []
  let inString = false
  for (const raw of lines) {
    let code = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (inString) {
        if (ch === '\\') { i++; code += '  '; continue }
        if (ch === '"') { inString = false; code += '"'; continue }
        code += ' '
        continue
      }
      if (ch === '/' && raw[i + 1] === '/') break
      if (ch === '"') { inString = true; code += '"'; continue }
      code += ch
    }
    out.push(code)
  }
  return out
}

/**
 * 计算一行 Gleam 代码的花括号增量（字符串内容已清空）。
 * @param {string} code - 已去注释的代码行。
 * @returns {number} `{` 为正、`}` 为负的净值。
 */
function gleamBraceDelta(code) {
  let delta = 0
  for (const ch of code) {
    if (ch === '{') delta++
    else if (ch === '}') delta--
  }
  return delta
}

/**
 * 计算 Gleam 声明的结束行。函数体/类型体按花括号配平；无块体的类型别名
 * 与 `external` 声明由调用方标记为单行；单行闭合块返回声明行。
 * @param {string[]} codeLines - 已去注释的代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @param {boolean} singleLine - 是否无块体（类型别名 / external）。
 * @returns {number} 结束行（1-based）。
 */
function gleamBlockEnd(codeLines, startIdx, singleLine) {
  if (singleLine) return startIdx + 1
  let depth = 0
  let opened = false
  for (let i = startIdx; i < codeLines.length; i++) {
    depth += gleamBraceDelta(codeLines[i])
    if (depth > 0) opened = true
    if (!opened && codeLines[i].includes('{')) return i + 1
    if (opened && depth <= 0) return i + 1
  }
  return codeLines.length
}

/**
 * 提取 Gleam 符号：`type` / `opaque type` / `external type`（类型体）、
 * `type Name = ...`（别名，kind type）、`fn` / `external fn`、顶层 `const`。
 * Gleam 的类型体不能定义函数，因此只在花括号深度 0 识别顶层声明；
 * 函数体与 `case` 块内的 `let`/`fn` 不登记。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractGleam(lines) {
  const codeLines = gleamCodeLines(lines)
  const symbols = []
  const externalTypeRe = /^(?:pub\s+)?external\s+type\s+([A-Z][\w]*)\b/
  const typeRe = /^(?:pub\s+)?(?:opaque\s+)?type\s+([A-Z][\w]*)\b/
  const externalFnRe = /^(?:pub\s+)?external\s+fn\s+([a-z_][\w]*)\s*\(/
  const fnRe = /^(?:pub\s+)?fn\s+([a-z_][\w]*)\s*\(/
  const constRe = /^(?:pub\s+)?const\s+([a-z_][\w]*)\b/
  let depth = 0
  for (let i = 0; i < codeLines.length; i++) {
    const line = codeLines[i].trim()
    if (depth === 0 && line !== '') {
      const exported = /^pub\s+/.test(line)
      const externalType = externalTypeRe.exec(line)
      if (externalType) {
        symbols.push({
          name: externalType[1],
          kind: 'class',
          line: i + 1,
          endLine: i + 1,
          exported,
        })
        depth += gleamBraceDelta(codeLines[i])
        continue
      }
      const type = typeRe.exec(line)
      if (type) {
        const alias = !line.includes('{')
        symbols.push({
          name: type[1],
          kind: alias ? 'type' : 'class',
          line: i + 1,
          endLine: gleamBlockEnd(codeLines, i, alias),
          exported,
        })
        depth += gleamBraceDelta(codeLines[i])
        continue
      }
      const externalFn = externalFnRe.exec(line)
      if (externalFn) {
        symbols.push({
          name: externalFn[1],
          kind: 'function',
          line: i + 1,
          endLine: i + 1,
          exported,
        })
        depth += gleamBraceDelta(codeLines[i])
        continue
      }
      const fn = fnRe.exec(line)
      if (fn) {
        symbols.push({
          name: fn[1],
          kind: 'function',
          line: i + 1,
          endLine: gleamBlockEnd(codeLines, i, false),
          exported,
        })
        depth += gleamBraceDelta(codeLines[i])
        continue
      }
      const constant = constRe.exec(line)
      if (constant) {
        symbols.push({
          name: constant[1],
          kind: 'variable',
          line: i + 1,
          endLine: i + 1,
          exported,
        })
      }
    }
    depth += gleamBraceDelta(codeLines[i])
  }
  return symbols
}

/**
 * 扫描 Shell 源码行：去除 `#` 注释，屏蔽 heredoc 内容，并分别返回
 * “保留字符串内容的代码行”（依赖提取读取路径）与“字符串内容替换为空格的
 * 掩码行”（符号匹配与花括号配平）。引号状态跨行延续（Shell 字符串可跨行）。
 * heredoc 结束行按 `<<-` 规则允许前导制表符。
 * @param {string[]} lines - 源码行。
 * @returns {Array<{code:string, masked:string}>} 等长的代码行/掩码行。
 */
export function shellScan(lines) {
  const out = []
  let quote = null
  let heredoc = null
  for (const raw of lines) {
    if (heredoc) {
      const candidate = heredoc.stripTabs ? raw.replace(/^\t+/, '') : raw
      if (candidate.trimEnd() === heredoc.delim) heredoc = null
      out.push({ code: '', masked: '' })
      continue
    }
    let code = ''
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (quote) {
        code += ch
        if (ch === '\\' && quote === '"' && i + 1 < raw.length) {
          code += raw[i + 1]
          masked += '  '
          i++
          continue
        }
        if (ch === quote) { quote = null; masked += ch; continue }
        masked += ' '
        continue
      }
      // `#` 仅在行首或空白/分隔符之后才是注释（`${x#p}` 与 `foo#bar` 不是）
      if (ch === '#' && (i === 0 || /\s|;|&|\||\(/.test(raw[i - 1]))) break
      if (ch === '"' || ch === "'") { quote = ch; code += ch; masked += ch; continue }
      if (ch === '<' && raw[i + 1] === '<' && raw[i + 2] !== '<') {
        const m = /^<<(-)?\s*(['"]?)([\w.-]+)\2/.exec(raw.slice(i))
        if (m) {
          heredoc = { delim: m[3], stripTabs: Boolean(m[1]) }
          code += m[0]
          masked += m[0]
          i += m[0].length - 1
          continue
        }
      }
      code += ch
      masked += ch
    }
    out.push({ code, masked })
  }
  return out
}

/**
 * 计算一行 Shell 代码的花括号增量：`${...}` 参数扩展整体跳过，
 * 不参与块配平（否则单个 `${x}` 会让块提前结束）。
 * @param {string} masked - 已屏蔽字符串/注释的代码行。
 * @returns {number} `{` 为正、`}` 为负的净值。
 */
function shellBraceDelta(masked) {
  let delta = 0
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === '$' && masked[i + 1] === '{') {
      let depth = 0
      for (; i < masked.length; i++) {
        if (masked[i] === '{') depth++
        else if (masked[i] === '}') {
          depth--
          if (depth === 0) break
        }
      }
      continue
    }
    if (masked[i] === '{') delta++
    else if (masked[i] === '}') delta--
  }
  return delta
}

/**
 * 计算 Shell 函数块的结束行：按花括号配平；声明行无 `{` 时继续向后
 * 查找（`function foo` 换行写 `{`）。找不到块体时返回声明行。
 * @param {string[]} maskedLines - 掩码代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @returns {number} 结束行（1-based）。
 */
function shellBlockEnd(maskedLines, startIdx) {
  let depth = 0
  let opened = false
  for (let i = startIdx; i < maskedLines.length; i++) {
    depth += shellBraceDelta(maskedLines[i])
    if (depth > 0) opened = true
    if (opened && depth <= 0) return i + 1
  }
  return opened ? maskedLines.length : startIdx + 1
}

/**
 * 提取 Shell 符号：函数定义（`function foo`、`function foo()`、`foo() {`）
 * 与显式公开变量（`export` / `readonly` / `declare` / `typeset` 带赋值）。
 * 只在函数体外的顶层识别；普通赋值与 `local` 不登记，避免脚本临时变量
 * 淹没符号表。Shell 没有可见性关键字，函数与显式声明统一视为导出。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractShell(lines) {
  const rows = shellScan(lines)
  const maskedLines = rows.map(row => row.masked)
  const symbols = []
  const fnRe = /^(?:function\s+)?([A-Za-z_][\w-]*)\s*(?:\(\s*\))?\s*\{/
  const bareFnRe = /^function\s+([A-Za-z_][\w-]*)\s*(?:\(\s*\))?\s*$/
  const exportRe = /^(?:export|readonly)\s+([A-Za-z_]\w*)=/
  const declareRe = /^(?:declare|typeset)\s+(?:-[A-Za-z]+\s+)*([A-Za-z_]\w*)=/
  let depth = 0
  for (let i = 0; i < maskedLines.length; i++) {
    const line = maskedLines[i].trim()
    if (depth === 0 && line !== '') {
      const fn = fnRe.exec(line)
      const bare = fn ? null : bareFnRe.exec(line)
      if (fn || bare) {
        symbols.push({
          name: (fn ?? bare)[1],
          kind: 'function',
          line: i + 1,
          endLine: shellBlockEnd(maskedLines, i),
          exported: true,
        })
        depth += shellBraceDelta(maskedLines[i])
        continue
      }
      const variable = exportRe.exec(line) ?? declareRe.exec(line)
      if (variable) {
        symbols.push({
          name: variable[1],
          kind: 'variable',
          line: i + 1,
          endLine: i + 1,
          exported: true,
        })
      }
    }
    depth += shellBraceDelta(maskedLines[i])
  }
  return symbols
}

/**
 * 提取 R 的可解析代码行：去掉 `#` 注释（字符串内的 `#` 不截断），并把
 * 字符串内容替换为空格。R 字符串不允许跨行（未闭合即语法错误），逐行即可。
 * @param {string[]} lines - 源码行。
 * @returns {string[]} 等长的可解析代码行。
 */
function rCodeLines(lines) {
  const out = []
  for (const raw of lines) {
    let code = ''
    let quote = null
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (quote) {
        if (ch === '\\' && i + 1 < raw.length) { code += '  '; i++; continue }
        if (ch === quote) { quote = null; code += ch; continue }
        code += ' '
        continue
      }
      if (ch === '#') break
      if (ch === '"' || ch === "'") { quote = ch; code += ch; continue }
      code += ch
    }
    out.push(code)
  }
  return out
}

/**
 * 计算一行 R 代码的花括号增量（字符串内容已清空）。
 * @param {string} code - 已去注释的代码行。
 * @returns {number} `{` 为正、`}` 为负的净值。
 */
function rBraceDelta(code) {
  let delta = 0
  for (const ch of code) {
    if (ch === '{') delta++
    else if (ch === '}') delta--
  }
  return delta
}

/**
 * 计算 R 花括号块的结束行（函数体/控制流块）。
 * @param {string[]} codeLines - 已去注释的代码行。
 * @param {number} startIdx - 起始行索引（0-based）。
 * @returns {number} 结束行（1-based）。
 */
function rBlockEnd(codeLines, startIdx) {
  let depth = 0
  let opened = false
  for (let i = startIdx; i < codeLines.length; i++) {
    depth += rBraceDelta(codeLines[i])
    if (depth > 0) opened = true
    if (!opened && codeLines[i].includes('{')) return i + 1
    if (opened && depth <= 0) return i + 1
  }
  return opened ? codeLines.length : startIdx + 1
}

/**
 * 计算 R 函数声明的结束行：先定位参数列表的闭合 `)`，再看其后（或下一
 * 非空行）是否有块体 `{`；没有块体时按单行表达式体返回 `)` 所在行。
 * @param {string[]} codeLines - 已去注释的代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @returns {number} 结束行（1-based）。
 */
function rFunctionEnd(codeLines, startIdx) {
  if (codeLines[startIdx].includes('{')) return rBlockEnd(codeLines, startIdx)
  let depth = 0
  let opened = false
  let closeLine = startIdx
  const limit = Math.min(codeLines.length, startIdx + 50)
  for (let i = startIdx; i < limit; i++) {
    for (const ch of codeLines[i]) {
      if (ch === '(') { depth++; opened = true }
      else if (ch === ')') depth--
    }
    closeLine = i
    if (opened && depth <= 0) break
  }
  if (codeLines[closeLine].includes('{')) return rBlockEnd(codeLines, closeLine)
  let next = closeLine + 1
  while (next < codeLines.length && codeLines[next].trim() === '') next++
  if (next < codeLines.length && codeLines[next].trim().startsWith('{')) {
    return rBlockEnd(codeLines, next)
  }
  return closeLine + 1
}

/**
 * 计算 R 调用（`R6Class(...)` / `setClass(...)`）的圆括号结束行。
 * @param {string[]} codeLines - 已去注释的代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @returns {number} 结束行（1-based）。
 */
function rParenEnd(codeLines, startIdx) {
  let depth = 0
  let opened = false
  for (let i = startIdx; i < codeLines.length; i++) {
    for (const ch of codeLines[i]) {
      if (ch === '(') { depth++; opened = true }
      else if (ch === ')') depth--
    }
    if (opened && depth <= 0) return i + 1
  }
  return opened ? codeLines.length : startIdx + 1
}

/**
 * 提取 R 符号：`name <- function(...)` / `name = function(...)`（含
 * `<<-`）与 `setClass("Name", ...)` / `R6Class("Name", ...)` 类声明。
 * 函数体与类调用内部的嵌套函数不登记；普通赋值不登记（R 脚本顶层
 * 常量数量大，登记会淹没符号表）；`.` 前缀按 R 约定标记非导出。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractR(lines) {
  const codeLines = rCodeLines(lines)
  const symbols = []
  const fnRe = /^([A-Za-z_.][\w.]*)\s*(?:<<-|<-|=)\s*function\s*\(/
  const classRe = /(?:setClass|setRefClass|R6Class)\s*\(\s*["']([A-Za-z_.][\w.]*)["']/
  const genericRe = /setGeneric\s*\(\s*["']([A-Za-z_.][\w.]*)["']/
  const s4MethodRe = /setMethod\s*\(\s*["']([A-Za-z_.][\w.]*)["']\s*,\s*(?:signature\s*\(\s*|c\s*\(\s*)?["']([A-Za-z_.][\w.]*)["']/
  const methodRe = /^([A-Za-z_.][\w.]*)\s*=\s*function\s*\(/
  /** @type {Array<{name:string, end:number}>} 类调用范围 */
  const classRanges = []
  /** @type {number[]} 已登记方法的结束行（跳过方法体内部的赋值） */
  const methodEnds = []
  let depth = 0
  for (let i = 0; i < codeLines.length; i++) {
    while (classRanges.length > 0 && classRanges[classRanges.length - 1].end <= i + 1) {
      classRanges.pop()
    }
    while (methodEnds.length > 0 && methodEnds[methodEnds.length - 1] <= i + 1) {
      methodEnds.pop()
    }
    const line = codeLines[i].trim()
    const inClass = classRanges.length > 0
    if (line !== '' && inClass && methodEnds.length === 0) {
      // R6/S4 类调用体内的方法（`initialize = function...`）：归属类名，
      // 不当作顶层函数；`public = list(` 等非函数赋值不匹配
      const method = methodRe.exec(line)
      if (method) {
        const end = rFunctionEnd(codeLines, i)
        symbols.push({
          name: method[1],
          kind: 'method',
          line: i + 1,
          endLine: end,
          exported: false,
          parent: classRanges[classRanges.length - 1].name,
        })
        if (end > i + 1) methodEnds.push(end)
        depth += rBraceDelta(codeLines[i])
        continue
      }
    }
    if (!inClass && depth === 0 && line !== '') {
      const fn = fnRe.exec(line)
      if (fn) {
        symbols.push({
          name: fn[1],
          kind: 'function',
          line: i + 1,
          endLine: rFunctionEnd(codeLines, i),
          exported: !fn[1].startsWith('.'),
        })
        depth += rBraceDelta(codeLines[i])
        continue
      }
      // 类名在字符串字面量里：codeLines 已清空字符串内容，这里读原始行
      // （注释行 codeLines 为空，不会进入本分支）
      const cls = classRe.exec(lines[i])
      if (cls) {
        const end = rParenEnd(codeLines, i)
        symbols.push({
          name: cls[1],
          kind: 'class',
          line: i + 1,
          endLine: end,
          exported: !cls[1].startsWith('.'),
        })
        classRanges.push({ name: cls[1], end })
        depth += rBraceDelta(codeLines[i])
        continue
      }
      const generic = genericRe.exec(lines[i])
      if (generic) {
        symbols.push({
          name: generic[1],
          kind: 'function',
          line: i + 1,
          endLine: rParenEnd(codeLines, i),
          exported: !generic[1].startsWith('.'),
        })
        depth += rBraceDelta(codeLines[i])
        continue
      }
      const s4Method = s4MethodRe.exec(lines[i])
      if (s4Method) {
        symbols.push({
          name: s4Method[1],
          kind: 'method',
          line: i + 1,
          endLine: rParenEnd(codeLines, i),
          exported: false,
          parent: s4Method[2],
        })
        depth += rBraceDelta(codeLines[i])
        continue
      }
    }
    depth += rBraceDelta(codeLines[i])
  }
  return symbols
}

/**
 * 扫描 Julia 源码行：去除 `#` 行注释与可嵌套的 `#= … =#` 块注释，
 * 并把字符串内容（含跨行 `"` 与三引号 `"""`）替换为空格。返回保留字符串
 * 内容的 `code` 与掩码行 `masked`（列位置对齐），依赖提取读路径用前者。
 * @param {string[]} lines - 源码行。
 * @returns {Array<{code:string, masked:string}>} 代码行/掩码行。
 */
export function juliaScan(lines) {
  const out = []
  let blockDepth = 0
  let quote = null
  for (const raw of lines) {
    let code = ''
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (blockDepth > 0) {
        if (raw.startsWith('#=', i)) { blockDepth++; masked += '  '; i++; continue }
        if (raw.startsWith('=#', i)) { blockDepth--; masked += '  '; i++; continue }
        masked += ' '
        continue
      }
      if (quote === '"""') {
        if (raw.startsWith('"""', i)) {
          quote = null
          code += '"""'
          masked += '   '
          i += 2
          continue
        }
        code += ch
        masked += ' '
        continue
      }
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
      if (raw.startsWith('#=', i)) { blockDepth = 1; masked += '  '; i++; continue }
      if (ch === '#') break
      if (raw.startsWith('"""', i)) {
        quote = '"""'
        code += '"""'
        masked += '   '
        i += 2
        continue
      }
      if (ch === '"' || ch === "'") { quote = ch; code += ch; masked += ch; continue }
      code += ch
      masked += ch
    }
    out.push({ code, masked })
  }
  return out
}

/**
 * 计算一行 Julia 代码的块深度增量。
 * - `function`/`begin`/`let`/`try`/`quote` 与 `do`（行内）都开块；
 * - `struct`/`mutable struct`/`module`/`baremodule`/`macro`/`if`/`for`/
 *   `while` 只在行首开块（`[... for ...]` 推导式不开块）；
 * - `abstract type … end` / `primitive type … end` 为单行，整行不计；
 * - `end` 仅在行首/空白/分号之后计数，`a[end]` 与 `x.end` 不计。
 * @param {string} masked - 已屏蔽字符串/注释的代码行。
 * @returns {number} 深度增量。
 */
function juliaBlockDelta(masked) {
  const trimmed = masked.trim()
  if (trimmed === '') return 0
  if (/^(?:abstract|primitive)\s+type\b/.test(trimmed)) return 0
  let delta = (masked.match(/\b(?:function|begin|let|try|quote)\b/g) ?? []).length
  if (/^(?:\w+(?:\.\w+)*\.)?@\w+\s+(?:(?:mutable\s+)?struct|module|baremodule|if|for|while|macro)\b/.test(trimmed)
    || /^(?:struct|mutable\s+struct|module|baremodule|if|for|while|macro)\b/.test(trimmed)) {
    delta++
  }
  delta += (masked.match(/\bdo\b/g) ?? []).length
  delta -= (masked.match(/(?:^|[\s;])end\b(?!\s*\])/g) ?? []).length
  return delta
}

/**
 * 计算 Julia 块声明的结束行（`function`/`struct`/`module`/`macro`）。
 * @param {string[]} maskedLines - 掩码代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @returns {number} 结束行（1-based）。
 */
function juliaBlockEnd(maskedLines, startIdx) {
  let depth = 0
  let opened = false
  for (let i = startIdx; i < maskedLines.length; i++) {
    depth += juliaBlockDelta(maskedLines[i])
    if (depth > 0) opened = true
    if (opened && depth <= 0) return i + 1
  }
  return opened ? maskedLines.length : startIdx + 1
}

/**
 * 收集 Julia 文件的 `export` 名称与是否含 `module`。
 * `export` 支持逗号分隔与以逗号结尾的续行（上限 20 行）。
 * @param {string[]} maskedLines - 掩码代码行。
 * @returns {{names:Set<string>, hasModule:boolean}} 导出名与模块标记。
 */
function juliaExports(maskedLines) {
  const names = new Set()
  let hasModule = false
  for (let i = 0; i < maskedLines.length; i++) {
    const line = maskedLines[i].trim()
    if (/^(?:module|baremodule)\b/.test(line)) hasModule = true
    const m = /^export\s+(.*)$/.exec(line)
    if (!m) continue
    let rest = m[1]
    let j = i
    const limit = Math.min(maskedLines.length, i + 20)
    while (rest.trimEnd().endsWith(',') && j + 1 < limit) {
      j++
      rest += ` ${maskedLines[j].trim()}`
    }
    for (const part of rest.split(',')) {
      const name = part.trim()
      if (name) names.add(name)
    }
  }
  return { names, hasModule }
}

/**
 * 提取 Julia 符号：`module`/`baremodule`、`struct`/`mutable struct`、
 * `abstract type`/`primitive type`、`function name(...)`（含
 * `Type.method` → method + parent）、短函数 `name(args) = expr`、`macro`
 * 与顶层 `const`。函数/结构体/宏体内部不扫描，嵌套函数不登记；
 * 含 `module` 的文件按 `export` 名称标记导出，无 `module` 的脚本默认可见。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractJulia(lines) {
  const maskedLines = juliaScan(lines).map(row => row.masked)
  const { names: exportedNames, hasModule } = juliaExports(maskedLines)
  const symbols = []
  const fnRe = /^function\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*\(/
  const macroRe = /^macro\s+([A-Za-z_]\w*)\s*\(/
  const structRe = /^(?:\w+(?:\.\w+)*\.)?@\w+\s+(?:mutable\s+)?struct\s+([A-Za-z_]\w*)|^(?:mutable\s+)?struct\s+([A-Za-z_]\w*)/
  const moduleRe = /^(?:baremodule|module)\s+([A-Za-z_]\w*)/
  const abstractRe = /^(?:abstract|primitive)\s+type\s+([A-Za-z_]\w*)/
  const enumRe = /^(?:\w+(?:\.\w+)*\.)?@enum\s+([A-Za-z_]\w*)(?:::[A-Za-z_]\w*)?\s*(.*)$/
  const shortFnRe = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*\([^)]*\)\s*=(?!=)/
  const constRe = /^const\s+([A-Za-z_]\w*)\s*=/
  const isExported = name => (hasModule ? exportedNames.has(name) : true)
  let skipUntil = 0
  for (let i = 0; i < maskedLines.length; i++) {
    if (i < skipUntil) continue
    const line = maskedLines[i].trim()
    if (line === '') continue
    const module = moduleRe.exec(line)
    if (module) {
      symbols.push({
        name: module[1],
        kind: 'class',
        line: i + 1,
        endLine: juliaBlockEnd(maskedLines, i),
        exported: isExported(module[1]),
      })
      continue // module 内部继续扫描
    }
    const fn = fnRe.exec(line)
    if (fn) {
      const raw = fn[1]
      const dot = raw.lastIndexOf('.')
      const parent = dot > 0 ? raw.slice(0, dot) : undefined
      const end = juliaBlockEnd(maskedLines, i)
      symbols.push({
        name: dot > 0 ? raw.slice(dot + 1) : raw,
        kind: parent ? 'method' : 'function',
        line: i + 1,
        endLine: end,
        exported: parent ? false : isExported(raw),
        ...(parent ? { parent } : {}),
      })
      skipUntil = end
      continue
    }
    const macro = macroRe.exec(line)
    if (macro) {
      const end = juliaBlockEnd(maskedLines, i)
      symbols.push({
        name: macro[1],
        kind: 'function',
        line: i + 1,
        endLine: end,
        exported: isExported(macro[1]),
      })
      skipUntil = end
      continue
    }
    const struct = structRe.exec(line)
    if (struct) {
      const name = struct[1] ?? struct[2]
      const end = juliaBlockEnd(maskedLines, i)
      symbols.push({
        name,
        kind: 'class',
        line: i + 1,
        endLine: end,
        exported: isExported(name),
      })
      skipUntil = end
      continue
    }
    const enumDecl = enumRe.exec(line)
    if (enumDecl) {
      const name = enumDecl[1]
      symbols.push({
        name,
        kind: 'class',
        line: i + 1,
        endLine: i + 1,
        exported: isExported(name),
      })
      // 枚举值是类型的成员，按类访问，不作为独立导出
      for (const part of enumDecl[2].trim().split(/\s+/)) {
        const value = /^([A-Za-z_]\w*)/.exec(part)?.[1]
        if (value) {
          symbols.push({
            name: value,
            kind: 'variable',
            line: i + 1,
            endLine: i + 1,
            exported: false,
          })
        }
      }
      continue
    }
    const abstract = abstractRe.exec(line)
    if (abstract) {
      symbols.push({
        name: abstract[1],
        kind: 'class',
        line: i + 1,
        endLine: i + 1,
        exported: isExported(abstract[1]),
      })
      continue
    }
    const shortFn = shortFnRe.exec(line)
    if (shortFn) {
      const raw = shortFn[1]
      const dot = raw.lastIndexOf('.')
      const parent = dot > 0 ? raw.slice(0, dot) : undefined
      symbols.push({
        name: dot > 0 ? raw.slice(dot + 1) : raw,
        kind: parent ? 'method' : 'function',
        line: i + 1,
        endLine: i + 1,
        exported: parent ? false : isExported(raw),
        ...(parent ? { parent } : {}),
      })
      continue
    }
    const constant = constRe.exec(line)
    if (constant) {
      symbols.push({
        name: constant[1],
        kind: 'variable',
        line: i + 1,
        endLine: i + 1,
        exported: isExported(constant[1]),
      })
    }
  }
  return symbols
}

/**
 * 扫描 Nim 源码行：去除 `#` 行注释与可嵌套的 `#[ … ]#` 块注释，并把
 * 字符串内容（`"`、跨行 `"""`）替换为空格。返回 code/masked 双视图。
 * @param {string[]} lines - 源码行。
 * @returns {Array<{code:string, masked:string}>} 代码行/掩码行。
 */
export function nimScan(lines) {
  const out = []
  let blockDepth = 0
  let quote = null
  for (const raw of lines) {
    let code = ''
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (blockDepth > 0) {
        if (raw.startsWith('#[', i)) { blockDepth++; masked += '  '; i++; continue }
        if (raw.startsWith(']#', i)) { blockDepth--; masked += '  '; i++; continue }
        masked += ' '
        continue
      }
      if (quote === '"""') {
        if (raw.startsWith('"""', i)) {
          quote = null
          code += '"""'
          masked += '   '
          i += 2
          continue
        }
        code += ch
        masked += ' '
        continue
      }
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
      if (raw.startsWith('#[', i)) { blockDepth = 1; masked += '  '; i++; continue }
      if (ch === '#') break
      if (raw.startsWith('"""', i)) {
        quote = '"""'
        code += '"""'
        masked += '   '
        i += 2
        continue
      }
      if (ch === '"' || ch === "'") { quote = ch; code += ch; masked += ch; continue }
      code += ch
      masked += ch
    }
    out.push({ code, masked })
  }
  return out
}

/**
 * 计算一行 Nim 代码的缩进宽度（Tab 按 4 计）。
 * @param {string} line - 源码行。
 * @returns {number} 缩进宽度。
 */
function nimIndentOf(line) {
  let width = 0
  for (const ch of line) {
    if (ch === ' ') width++
    else if (ch === '\t') width += 4
    else break
  }
  return width
}

/**
 * 计算 Nim 缩进块的结束行（类型体等）：下一个缩进不大于声明缩进的行之前。
 * @param {string[]} maskedLines - 掩码代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @param {number} indent - 声明行缩进。
 * @returns {number} 结束行（1-based）。
 */
function nimBlockEnd(maskedLines, startIdx, indent) {
  for (let j = startIdx + 1; j < maskedLines.length; j++) {
    if (maskedLines[j].trim() === '') continue
    if (nimIndentOf(maskedLines[j]) <= indent) return j
  }
  return maskedLines.length
}

/**
 * 计算 Nim 例程（proc/func/…）的结束行：先按括号找签名闭合行，再从
 * 签名后按缩进找体结束（多行签名中的参数行不会提前截断）。
 * @param {string[]} maskedLines - 掩码代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @param {number} indent - 声明行缩进。
 * @returns {number} 结束行（1-based）。
 */
function nimProcEnd(maskedLines, startIdx, indent) {
  let depth = 0
  let opened = false
  let sigEnd = startIdx
  const limit = Math.min(maskedLines.length, startIdx + 100)
  for (let j = startIdx; j < limit; j++) {
    for (const ch of maskedLines[j]) {
      if (ch === '(' || ch === '[') { depth++; opened = true }
      else if (ch === ')' || ch === ']') depth--
    }
    sigEnd = j
    if (!opened || depth <= 0) break
  }
  for (let j = sigEnd + 1; j < maskedLines.length; j++) {
    if (maskedLines[j].trim() === '') continue
    if (nimIndentOf(maskedLines[j]) <= indent) return j
  }
  return maskedLines.length
}

/**
 * 提取 Nim 符号：`proc`/`func`/`method`/`iterator`/`template`/`macro`/
 * `converter`、`type Name = …`、顶层 `const`/`let`/`var`。`*` 后缀表示
 * 从模块导出；缩进体（函数体/类型体）内部不扫描，嵌套例程不登记。
 * 只识别缩进 0 的声明（Nim 文件即模块）。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractNim(lines) {
  const maskedLines = nimScan(lines).map(row => row.masked)
  const symbols = []
  const declRe = /^(?:proc|func|method|iterator|template|macro|converter)\s+([A-Za-z_]\w*)(\*?)(?=\s|\(|\[|$)/
  const typeRe = /^type\s+([A-Za-z_]\w*)(\*?)\s*(?:\[[^\]]*\])?\s*=/
  const typeBlockRe = /^type\s*$/
  const typeMemberRe = /^\s+([A-Za-z_]\w*)(\*?)\s*(?:\[[^\]]*\])?\s*=/
  const valueRe = /^(?:const|let|var)\s+([A-Za-z_]\w*)(\*?)\s*=/
  let skipUntil = 0
  for (let i = 0; i < maskedLines.length; i++) {
    if (i < skipUntil) continue
    const rawLine = maskedLines[i]
    const line = rawLine.trim()
    if (line === '') continue
    const indent = nimIndentOf(rawLine)
    if (indent !== 0) continue
    const decl = declRe.exec(line)
    if (decl) {
      const end = nimProcEnd(maskedLines, i, indent)
      symbols.push({
        name: decl[1],
        kind: 'function',
        line: i + 1,
        endLine: end,
        exported: decl[2] === '*',
      })
      skipUntil = end
      continue
    }
    // `type` 单独一行 + 缩进成员：逐成员登记（字段/枚举值不含 `=`，不误判）
    if (typeBlockRe.test(line)) {
      const end = nimBlockEnd(maskedLines, i, indent)
      for (let j = i + 1; j < end; j++) {
        const memberRaw = maskedLines[j]
        if (memberRaw.trim() === '') continue
        const memberIndent = nimIndentOf(memberRaw)
        if (memberIndent <= indent) continue
        const member = typeMemberRe.exec(memberRaw)
        if (!member) continue
        symbols.push({
          name: member[1],
          kind: 'class',
          line: j + 1,
          endLine: nimBlockEnd(maskedLines, j, memberIndent),
          exported: member[2] === '*',
        })
      }
      skipUntil = end
      continue
    }
    const type = typeRe.exec(line)
    if (type) {
      const end = nimBlockEnd(maskedLines, i, indent)
      symbols.push({
        name: type[1],
        kind: 'class',
        line: i + 1,
        endLine: end,
        exported: type[2] === '*',
      })
      skipUntil = end
      continue
    }
    const value = valueRe.exec(line)
    if (value) {
      symbols.push({
        name: value[1],
        kind: 'variable',
        line: i + 1,
        endLine: i + 1,
        exported: value[2] === '*',
      })
    }
  }
  return symbols
}

/**
 * 扫描 OCaml 源码行：注释 `(* … *)`（可嵌套）、字符串内容（`"` 转义）
 * 与原始字符串 `{|…|}`/`{id|…|id}` 替换为空格，保留行数与列位；返回
 * 掩码后的行数组。
 * @param {string[]} lines - 源码行。
 * @returns {string[]} 等长掩码行。
 */
export function ocamlScan(lines) {
  const out = []
  let commentDepth = 0
  let inString = false
  let rawId = null
  for (const raw of lines) {
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      const next = raw[i + 1]
      if (rawId !== null) {
        const token = `|${rawId}}`
        if (raw.startsWith(token, i)) {
          masked += token
          i += token.length - 1
          rawId = null
        } else {
          masked += ' '
        }
        continue
      }
      if (commentDepth > 0) {
        if (ch === '(' && next === '*') { commentDepth++; i++; masked += '  ' }
        else if (ch === '*' && next === ')') { commentDepth--; i++; masked += '  ' }
        else masked += ' '
        continue
      }
      if (inString) {
        if (ch === '\\') { i++; masked += '  ' }
        else if (ch === '"') { inString = false; masked += '"' }
        else masked += ' '
        continue
      }
      if (ch === '(' && next === '*') { commentDepth = 1; i++; masked += '  '; continue }
      if (ch === '{') {
        const open = /^\{([a-z_]*)\|/.exec(raw.slice(i))
        if (open) {
          masked += open[0]
          i += open[0].length - 1
          rawId = open[1]
          continue
        }
      }
      if (ch === '"') { inString = true; masked += '"'; continue }
      masked += ch
    }
    out.push(masked)
  }
  return out
}

/**
 * 计算 OCaml `struct`/`sig`/`object`/`begin` 块的结束行（`end` 配平）。
 * @param {string[]} masked - 掩码代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @returns {number|null} 结束行（1-based）；未打开块或配平失败返回 null。
 */
function ocamlEndLine(masked, startIdx) {
  let depth = 0
  let opened = false
  for (let i = startIdx; i < masked.length; i++) {
    const words = masked[i].match(/\b(?:struct|sig|object|begin|end)\b/g)
    if (!words) continue
    for (const word of words) {
      if (word === 'end') depth--
      else { depth++; opened = true }
    }
    if (opened && depth <= 0) return i + 1
  }
  return null
}

/**
 * 提取 OCaml 符号：顶层 `let`/`let rec`（含 `let%ppx`、属性）、`type`、
 * `module`/`module type`、`class`/`class type`、`exception`、
 * `val`/`external`。只识别缩进 0 的声明，函数/模块/类体内部的嵌套定义
 * 不登记；`_` 前缀视为私有，其余均视为模块可访问（`.mli` 的精确可见性
 * 不跨文件判定）。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractOcaml(lines) {
  const masked = ocamlScan(lines)
  /** @type {Array<{name:string, kind:string, index:number, opensBlock:boolean}>} */
  const decls = []
  /** 上一个声明族（let/type），用于 `and` 续接定义（否则为 null）。 */
  let lastDeclKind = null
  for (let i = 0; i < masked.length; i++) {
    const rawLine = masked[i]
    const line = rawLine.trim()
    if (line === '') continue
    if (rawLine !== rawLine.trimStart()) continue // 只识别缩进 0 的顶层声明
    const letMatch = /^let(?:\[@[^\]]*\])?(?:%[a-z_]\w*)?(?:\s+rec)?\s+([a-z_][\w']*)\b/.exec(line)
    if (letMatch) {
      const name = letMatch[1]
      if (name === '_' || name === 'module' || name === 'open' || name === 'exception'
        || name === 'include' || name === 'class' || name === 'external') continue
      decls.push({ name, kind: 'function', index: i, opensBlock: false })
      lastDeclKind = 'let'
      continue
    }
    // `and` 续接：`let rec f … and g …`（函数）或 `type a = … and b = …`（类型）
    if (lastDeclKind === 'let') {
      const andFn = /^and\s+([a-z_][\w']*)\b/.exec(line)
      if (andFn) {
        decls.push({ name: andFn[1], kind: 'function', index: i, opensBlock: false })
        continue
      }
    }
    if (lastDeclKind === 'type' && line.startsWith('and ')) {
      const eq = line.indexOf('=')
      if (eq > 0) {
        const head = line.slice(0, eq).replace(/\+$/, '').trim()
        const tokens = head.split(/\s+/)
        const name = tokens[tokens.length - 1]
        if (/^[a-z_][\w']*$/.test(name)) {
          decls.push({ name, kind: 'class', index: i, opensBlock: false })
          continue
        }
      }
    }
    const moduleMatch = /^module(?:\s+type)?\s+([A-Z][\w']*)\b/.exec(line)
    if (moduleMatch) {
      decls.push({ name: moduleMatch[1], kind: 'class', index: i, opensBlock: true })
      lastDeclKind = null
      continue
    }
    const classMatch = /^class(?:\s+type)?\s+(?:virtual\s+)?(?:\[[^\]]*\]\s*)?([a-z_][\w']*)\b/.exec(line)
    if (classMatch) {
      decls.push({ name: classMatch[1], kind: 'class', index: i, opensBlock: true })
      lastDeclKind = null
      continue
    }
    const exceptionMatch = /^exception\s+([A-Z][\w']*)\b/.exec(line)
    if (exceptionMatch) {
      decls.push({ name: exceptionMatch[1], kind: 'type', index: i, opensBlock: false })
      lastDeclKind = null
      continue
    }
    const valMatch = /^(?:val|external)\s+(?:\([^)]*\)\s*)?([a-z_][\w']*)\s*:/.exec(line)
    if (valMatch) {
      decls.push({ name: valMatch[1], kind: 'function', index: i, opensBlock: false })
      lastDeclKind = null
      continue
    }
    // `type [params] name =`：取 `=` 左侧最后一个标识符（跳过类型变量/参数）
    if (line.startsWith('type ')) {
      const eq = line.indexOf('=')
      if (eq > 0) {
        const head = line.slice(0, eq).replace(/\+$/, '').trim()
        const tokens = head.split(/\s+/)
        const name = tokens[tokens.length - 1]
        if (/^[a-z_][\w']*$/.test(name)) {
          decls.push({ name, kind: 'class', index: i, opensBlock: false })
          lastDeclKind = 'type'
          continue
        }
      }
    }
    lastDeclKind = null
  }
  const symbols = []
  for (let k = 0; k < decls.length; k++) {
    const decl = decls[k]
    const nextIndex = decls[k + 1]?.index ?? masked.length
    let last = nextIndex - 1
    while (last > decl.index && masked[last].trim() === '') last--
    let endLine = last + 1
    const balanced = decl.opensBlock ? ocamlEndLine(masked, decl.index) : null
    if (balanced !== null && balanced < endLine) endLine = balanced
    symbols.push({
      name: decl.name,
      kind: decl.kind,
      line: decl.index + 1,
      endLine,
      exported: !decl.name.startsWith('_'),
    })
  }
  return symbols
}

/**
 * 扫描 Haskell 源码行：`--` 行注释、可嵌套 `{- … -}` 块注释（含
 * `{-# … #-}` pragma）与字符串/字符字面量替换为空格，保留行数与列位。
 * 类型变量（`'a`）与 Template Haskell 引号不进入字符状态。
 * @param {string[]} lines - 源码行。
 * @returns {string[]} 等长掩码行。
 */
export function haskellScan(lines) {
  const out = []
  let blockDepth = 0
  let inString = false
  let inChar = false
  for (const raw of lines) {
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      const next = raw[i + 1]
      if (blockDepth > 0) {
        if (ch === '{' && next === '-') { blockDepth++; i++; masked += '  ' }
        else if (ch === '-' && next === '}') { blockDepth--; i++; masked += '  ' }
        else masked += ' '
        continue
      }
      if (inString) {
        if (ch === '\\') { i++; masked += '  ' }
        else if (ch === '"') { inString = false; masked += '"' }
        else masked += ' '
        continue
      }
      if (inChar) {
        if (ch === '\\') { i++; masked += '  ' }
        else if (ch === "'") { inChar = false; masked += "'" }
        else masked += ' '
        continue
      }
      if (ch === '{' && next === '-') { blockDepth = 1; i++; masked += '  '; continue }
      if (ch === '-' && next === '-') { masked += ' '.repeat(raw.length - i); break }
      if (ch === '"') { inString = true; masked += '"'; continue }
      if (ch === "'" && (raw[i + 1] === '\\' || raw[i + 2] === "'")) {
        inChar = true
        masked += "'"
        continue
      }
      masked += ch
    }
    out.push(masked)
  }
  return out
}

/**
 * 计算一行 Haskell 代码的缩进宽度（Tab 按 4 计）。
 * @param {string} line - 源码行。
 * @returns {number} 缩进宽度。
 */
function haskellIndentOf(line) {
  let width = 0
  for (const ch of line) {
    if (ch === ' ') width++
    else if (ch === '\t') width += 4
    else break
  }
  return width
}

/**
 * 查找下一个非空行索引。
 * @param {string[]} masked - 掩码代码行。
 * @param {number} start - 起始索引（0-based，不含）。
 * @returns {number} 非空行索引；不存在返回 -1。
 */
function nextNonEmptyLine(masked, start) {
  for (let i = start; i < masked.length; i++) {
    if (masked[i].trim() !== '') return i
  }
  return -1
}

/**
 * 计算 Haskell 缩进块的结束索引：下一个缩进不大于声明缩进的非空行。
 * @param {string[]} masked - 掩码代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @param {number} indent - 声明行缩进。
 * @returns {number} 块结束索引（0-based；无则文件长度）。
 */
function haskellBlockEnd(masked, startIdx, indent) {
  for (let j = startIdx + 1; j < masked.length; j++) {
    if (masked[j].trim() === '') continue
    if (haskellIndentOf(masked[j]) <= indent) return j
  }
  return masked.length
}

/**
 * 解析 Haskell 模块导出列表（`module M (a, B(..), (<+>)) where`），
 * 返回第一层导出的值/类型名；`module X` 重导出忽略，无导出列表返回 null
 * （表示全部公开）。
 * @param {string} masked - 模块声明行起的掩码文本（`where` 前）。
 * @returns {Set<string>|null} 导出名集合；无列表返回 null。
 */
function haskellExportNames(masked) {
  const open = masked.indexOf('(')
  const close = masked.lastIndexOf(')')
  if (open < 0 || close <= open) return null
  const names = new Set()
  /**
   * 登记一个导出项。
   * @param {string} part - 逗号分隔的单项。
   * @returns {void}
   */
  const add = (part) => {
    const text = part.trim()
    if (!text || text.startsWith('module ')) return
    const typeMatch = /^([A-Z][\w']*)\s*(?:\(|$)/.exec(text)
    if (typeMatch) { names.add(typeMatch[1]); return }
    const opMatch = /^\((.*)\)/.exec(text)
    if (opMatch) { names.add(opMatch[1].trim()); return }
    const valMatch = /^([a-z_][\w']*)/.exec(text)
    if (valMatch) names.add(valMatch[1])
  }
  let depth = 0
  let current = ''
  for (const ch of masked.slice(open + 1, close)) {
    if (ch === '(') { depth++; current += ch; continue }
    if (ch === ')') { depth--; current += ch; continue }
    if (ch === ',' && depth === 0) { add(current); current = ''; continue }
    current += ch
  }
  add(current)
  return names
}

/**
 * 读取文件的模块导出列表（模块声明可跨行，最多向后拼接 50 行）。
 * @param {string[]} masked - 掩码代码行。
 * @returns {{name:string|null, exported:Set<string>|null}} 模块名与导出集合。
 */
function haskellModuleHeader(masked) {
  for (let i = 0; i < masked.length; i++) {
    const line = masked[i].trim()
    if (!line.startsWith('module ')) continue
    const name = /^module\s+([A-Z][\w.']*)/.exec(line)?.[1] ?? null
    let block = ''
    const limit = Math.min(masked.length, i + 50)
    for (let j = i; j < limit; j++) {
      block += ` ${masked[j].trim()}`
      if (/\bwhere\b/.test(masked[j])) break
    }
    return { name, exported: name ? haskellExportNames(block) : null }
  }
  return { name: null, exported: null }
}

/**
 * 提取 Haskell 符号：`module`、`data`/`newtype`、`type`（含 `family`）、
 * `class` 与其类方法签名、`pattern`、顶层值签名（`name ::`，含名称与
 * `::` 分行的多行签名）与定义（含中缀操作符定义）。只识别缩进 0 的
 * 顶层声明；`where`/`let` 缩进体与实例方法不登记。
 * 同一名称的签名与定义合并为一个符号（行号取签名，范围覆盖定义）。
 * 模块声明带导出列表时，未列出的顶层符号标记为非导出；类方法跟随其类。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractHaskell(lines) {
  const masked = haskellScan(lines)
  const header = haskellModuleHeader(masked)
  /** @type {Array<{name:string, kind:string, index:number, moduleDecl?:boolean, parent?:string}>} */
  const decls = []
  for (let i = 0; i < masked.length; i++) {
    const rawLine = masked[i]
    const line = rawLine.trim()
    if (line === '') continue
    if (rawLine !== rawLine.trimStart()) continue

    const moduleMatch = /^module\s+([A-Z][\w.']*)/.exec(line)
    if (moduleMatch) {
      decls.push({ name: moduleMatch[1], kind: 'class', index: i, moduleDecl: true })
      continue
    }
    // data/newtype（含 GADT 与 data family；instance 是具体实例，跳过）
    const dataMatch = /^(?:data|newtype)\s+(?:\([^)]*\)\s*=>\s*)?(?:(family)\s+)?(?:(instance)\s+)?([A-Z][\w']*)/.exec(line)
    if (dataMatch && !dataMatch[2]) {
      decls.push({ name: dataMatch[3], kind: 'class', index: i })
      continue
    }
    // type family / type role / type instance
    const typeMatch = /^type\s+(?:(family|role|instance)\s+)?([A-Z][\w']*)/.exec(line)
    if (typeMatch && typeMatch[1] !== 'role' && typeMatch[1] !== 'instance') {
      decls.push({ name: typeMatch[2], kind: 'class', index: i })
      continue
    }
    const classMatch = /^class\s+(?:\([^)]*\)\s*=>\s*)?([A-Z][\w']*)/.exec(line)
    if (classMatch) {
      decls.push({ name: classMatch[1], kind: 'class', index: i })
      // 类方法签名：class 缩进块内、与方法体同层（第一层缩进）的签名行
      const blockEnd = haskellBlockEnd(masked, i, 0)
      let memberIndent = null
      for (let j = i + 1; j < blockEnd; j++) {
        if (masked[j].trim() === '') continue
        if (memberIndent === null) memberIndent = haskellIndentOf(masked[j])
        if (haskellIndentOf(masked[j]) !== memberIndent) continue
        const memberCode = masked[j].trim()
        const sig = /^([a-z_][\w']*)\s*::/.exec(memberCode)
        const opSig = /^\(([!#$%&*+./<=>?@\\^|~:-]+)\)\s*::/.exec(memberCode)
        if (sig || opSig) {
          decls.push({ name: sig ? sig[1] : opSig[1], kind: 'method', index: j, parent: classMatch[1] })
          continue
        }
        // 多行签名：名称单独一行，下一非空行以 `::` 开头
        const bare = /^([a-z_][\w']*)$/.exec(memberCode)
        if (bare) {
          const next = nextNonEmptyLine(masked, j + 1)
          if (next >= 0 && next < blockEnd && /^\s*::/.test(masked[next])) {
            decls.push({ name: bare[1], kind: 'method', index: j, parent: classMatch[1] })
          }
        }
      }
      continue
    }
    const patternMatch = /^pattern\s+([A-Z][\w']*)\s*(?:::|[^=]*=)/.exec(line)
    if (patternMatch) {
      decls.push({ name: patternMatch[1], kind: 'type', index: i })
      continue
    }
    // 操作符签名/定义：(<+>) :: … 或 (<+>) a b = …
    const opMatch = /^\(([!#$%&*+./<=>?@\\^|~:-]+)\)\s*(?:::|[^=]*=(?!=))/.exec(line)
    if (opMatch) {
      decls.push({ name: opMatch[1], kind: 'function', index: i })
      continue
    }
    // 值签名优先于定义（类型里的 `=>` 不能被误判为定义）
    const sigMatch = /^([a-z_][\w']*)\s*::/.exec(line)
    if (sigMatch) {
      decls.push({ name: sigMatch[1], kind: 'function', index: i })
      continue
    }
    // 多行签名：`foo` 单独一行，下一非空行以 `::` 开头
    const bareMatch = /^([a-z_][\w']*)$/.exec(line)
    if (bareMatch) {
      const next = nextNonEmptyLine(masked, i + 1)
      if (next >= 0 && /^\s*::/.test(masked[next])) {
        decls.push({ name: bareMatch[1], kind: 'function', index: i })
      }
      continue
    }
    const defMatch = /^([a-z_][\w']*)\s*([^=]*)=(?!=)/.exec(line)
    if (defMatch) {
      const name = defMatch[1]
      // `a <+> b = …` 是中缀操作符定义：登记操作符名，而不是首操作数
      const op = /^\(?([!#$%&*+./<=>?@\\^|~:-]+)\)?\s/.exec(defMatch[2].trim())
      if (op) {
        decls.push({ name: op[1], kind: 'function', index: i })
        continue
      }
      if (name !== 'type' && name !== 'data' && name !== 'newtype' && name !== 'class'
        && name !== 'module' && name !== 'import' && name !== 'instance' && name !== 'deriving') {
        decls.push({ name, kind: 'function', index: i })
      }
    }
  }
  // 先按声明计算范围，再按作用域+名称合并（签名 + 定义，范围取并集）
  const lastNonEmpty = masked.length === 0 ? 0 : masked.reduce((last, row, index) => (
    row.trim() === '' ? last : index), 0)
  const byKey = new Map()
  for (let k = 0; k < decls.length; k++) {
    const decl = decls[k]
    const nextIndex = decls[k + 1]?.index ?? masked.length
    let last = nextIndex - 1
    while (last > decl.index && masked[last].trim() === '') last--
    const endLine = decl.moduleDecl ? lastNonEmpty + 1 : last + 1
    const key = decl.parent ? `${decl.parent}:${decl.name}` : decl.name
    const existing = byKey.get(key)
    if (existing) {
      existing.endLine = Math.max(existing.endLine, endLine)
    } else {
      const exported = decl.moduleDecl
        ? true
        : header.exported === null
          ? !decl.name.startsWith('_')
          : decl.parent
            ? header.exported.has(decl.parent)
            : header.exported.has(decl.name)
      byKey.set(key, {
        name: decl.name,
        kind: decl.kind,
        line: decl.index + 1,
        endLine,
        exported,
        ...(decl.parent ? { parent: decl.parent } : {}),
      })
    }
  }
  return [...byKey.values()]
}

/**
 * 扫描 Erlang 源码行：`%` 行注释截断，字符串 `"…"` 与引号原子 `'…'`
 * 内容在掩码视图替换为空格（`$x` 字符字面量跳过）；同时返回保留字符串
 * 原文的 code 视图，供 `-include("…")` 等提取使用。
 * @param {string[]} lines - 源码行。
 * @returns {Array<{code:string, masked:string}>} 双视图行。
 */
export function erlangScan(lines) {
  const out = []
  let quote = null
  for (const raw of lines) {
    let code = ''
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (quote) {
        code += ch
        if (ch === '\\') {
          if (i + 1 < raw.length) { code += raw[i + 1]; masked += '  '; i++ }
          else masked += ' '
          continue
        }
        if (ch === quote) { quote = null; masked += ch; continue }
        masked += ' '
        continue
      }
      if (ch === '%') break
      if (ch === '$' && i + 1 < raw.length) {
        code += ch + raw[i + 1]
        masked += ch + raw[i + 1]
        i++
        continue
      }
      if (ch === '"' || ch === "'") { quote = ch; code += ch; masked += ch; continue }
      code += ch
      masked += ch
    }
    out.push({ code, masked })
  }
  return out
}

/**
 * 去掉 Erlang 引号原子的引号。
 * @param {string} atom - 原子文本（可带单引号）。
 * @returns {string} 裸名称。
 */
function erlangAtom(atom) {
  return atom.startsWith("'") && atom.endsWith("'") ? atom.slice(1, -1) : atom
}

/**
 * 计算 Erlang 声明/函数子句的结束行：首个以 `.` 结尾的行（字符串与
 * 注释已屏蔽）；未找到时返回起始行。
 * @param {string[]} masked - 掩码代码行。
 * @param {number} startIdx - 起始行索引（0-based）。
 * @returns {number} 结束行索引（0-based）。
 */
function erlangClauseEnd(masked, startIdx) {
  for (let i = startIdx; i < masked.length; i++) {
    if (masked[i].trim().endsWith('.')) return i
  }
  return startIdx
}

/**
 * 提取 Erlang 符号：`-module`、`-record`、`-type`/`-opaque`、`-define`
 * 宏与顶层函数（含多子句）。只识别缩进 0 的行；函数体内部与匿名函数
 * 不登记。`exported` 由 `-export([f/1, …])` 决定（Erlang 默认私有），
 * `-module` 自身视为公开；同名不同 arity 合并为一个符号。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractErlang(lines) {
  const rows = erlangScan(lines)
  const masked = rows.map(row => row.masked)
  const exportedNames = new Set()
  const text = masked.join('\n')
  for (const m of text.matchAll(/-export\s*\(\s*\[([\s\S]*?)\]\s*\)/g)) {
    for (const item of m[1].matchAll(/([a-z][\w@]*|'[^']*')\s*\/\s*\d+/g)) {
      exportedNames.add(erlangAtom(item[1]))
    }
  }
  /** @type {Array<{name:string, kind:string, index:number, endIndex:number, moduleDecl?:boolean}>} */
  const decls = []
  for (let i = 0; i < masked.length; i++) {
    const rawLine = masked[i]
    const line = rawLine.trim()
    if (line === '') continue
    if (rawLine !== rawLine.trimStart()) continue
    const moduleMatch = /^-module\s*\(\s*([a-z][\w@]*|'[^']*')\s*\)/.exec(line)
    if (moduleMatch) {
      decls.push({ name: erlangAtom(moduleMatch[1]), kind: 'class', index: i, endIndex: erlangClauseEnd(masked, i), moduleDecl: true })
      continue
    }
    const recordMatch = /^-record\s*\(\s*([a-z][\w@]*|'[^']*')\s*,/.exec(line)
    if (recordMatch) {
      decls.push({ name: erlangAtom(recordMatch[1]), kind: 'class', index: i, endIndex: erlangClauseEnd(masked, i) })
      continue
    }
    const typeMatch = /^-(?:type|opaque)\s+([a-z][\w@]*)\s*\(/.exec(line)
    if (typeMatch) {
      decls.push({ name: typeMatch[1], kind: 'type', index: i, endIndex: erlangClauseEnd(masked, i) })
      continue
    }
    const defineMatch = /^-define\s*\(\s*([A-Z_][\w@]*)/.exec(line)
    if (defineMatch) {
      decls.push({ name: defineMatch[1], kind: 'variable', index: i, endIndex: erlangClauseEnd(masked, i) })
      continue
    }
    const fnMatch = /^([a-z][\w@]*|'[^']*')\s*\(/.exec(line)
    if (!fnMatch) continue
    const next = nextNonEmptyLine(masked, i + 1)
    const hasArrow = /->/.test(line) || (next >= 0 && masked[next].trim().startsWith('->'))
    if (!hasArrow) continue
    decls.push({
      name: erlangAtom(fnMatch[1]),
      kind: 'function',
      index: i,
      endIndex: erlangClauseEnd(masked, i),
    })
  }
  const byName = new Map()
  for (const decl of decls) {
    const endLine = decl.endIndex + 1
    const existing = byName.get(decl.name)
    if (existing) {
      existing.endLine = Math.max(existing.endLine, endLine)
      existing.exported = existing.exported || decl.moduleDecl === true || exportedNames.has(decl.name)
    } else {
      byName.set(decl.name, {
        name: decl.name,
        kind: decl.kind,
        line: decl.index + 1,
        endLine,
        exported: decl.moduleDecl === true || exportedNames.has(decl.name),
      })
    }
  }
  return [...byName.values()]
}

/**
 * 扫描 Solidity 源码行：`//` 行注释截断、`/* … *\/` 块注释与字符串内容
 * 在掩码视图替换为空格；同时返回保留字符串原文的 code 视图，供
 * `import "…"` 路径提取使用。
 * @param {string[]} lines - 源码行。
 * @returns {Array<{code:string, masked:string}>} 双视图行。
 */
export function solidityScan(lines) {
  const out = []
  let inBlock = false
  let quote = null
  for (const raw of lines) {
    let code = ''
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      const next = raw[i + 1]
      if (inBlock) {
        if (ch === '*' && next === '/') { inBlock = false; i++; masked += '  ' }
        else masked += ' '
        continue
      }
      if (quote) {
        code += ch
        if (ch === '\\') {
          if (i + 1 < raw.length) { code += raw[i + 1]; masked += '  '; i++ }
          else masked += ' '
          continue
        }
        if (ch === quote) { quote = null; masked += ch; continue }
        masked += ' '
        continue
      }
      if (ch === '/' && next === '/') break
      if (ch === '/' && next === '*') { inBlock = true; i++; masked += '  '; continue }
      if (ch === '"' || ch === "'") { quote = ch; code += ch; masked += ch; continue }
      code += ch
      masked += ch
    }
    out.push({ code, masked })
  }
  return out
}

/**
 * 统计一行的花括号净增量（入参应已屏蔽注释与字符串）。
 * @param {string} line - 掩码行。
 * @returns {number} `{` 为正、`}` 为负的净值。
 */
function braceDeltaOf(line) {
  let delta = 0
  for (const ch of line) {
    if (ch === '{') delta++
    else if (ch === '}') delta--
  }
  return delta
}

/**
 * 计算 Solidity 函数/成员的结束行：有函数体时按花括号配平，接口/抽象
 * 声明（以 `;` 结尾）记为单行。
 * @param {string[]} masked - 掩码代码行。
 * @param {number} startIdx - 声明行索引（0-based）。
 * @param {string} line - 已 trim 的声明行。
 * @returns {number} 结束行（1-based）。
 */
function solidityMemberEnd(masked, startIdx, line) {
  if (!line.includes('{') && line.endsWith(';')) return startIdx + 1
  return findBlockEnd(masked, startIdx)
}

/**
 * 提取 Solidity 符号：`contract`/`library`/`interface`（class）及其中
 * 的 `function`/`constructor`/`receive`/`fallback`/`modifier`（method）、
 * `event`/`error`/`type`（type）、`struct`/`enum`（class）；文件级函数与
 * 类型同样登记。`private`/`internal` 标记非导出；注释与字符串先屏蔽。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractSolidity(lines) {
  const masked = solidityScan(lines).map(row => row.masked)
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const contracts = []
  let depth = 0
  for (let i = 0; i < masked.length; i++) {
    while (contracts.length > 0 && contracts[contracts.length - 1].end <= i + 1) contracts.pop()
    const rawLine = masked[i]
    const line = rawLine.trim()
    if (line === '') { depth += braceDeltaOf(rawLine); continue }
    const parent = contracts.length > 0 ? contracts[contracts.length - 1].name : undefined
    const exported = !/\b(?:private|internal)\b/.test(line)

    if (depth === 0) {
      const typeMatch = /^(?:abstract\s+)?(contract|library|interface)\s+([A-Za-z_$][\w$]*)/.exec(line)
      if (typeMatch) {
        const end = findBlockEnd(masked, i)
        symbols.push({ name: typeMatch[2], kind: 'class', line: i + 1, endLine: end, exported: true })
        contracts.push({ name: typeMatch[2], end })
        depth += braceDeltaOf(rawLine)
        continue
      }
      const fn = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line)
      if (fn) {
        symbols.push({
          name: fn[1], kind: 'function', line: i + 1,
          endLine: solidityMemberEnd(masked, i, line), exported,
        })
        depth += braceDeltaOf(rawLine)
        continue
      }
    } else if (depth === 1 && parent) {
      const fn = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line)
      if (fn) {
        symbols.push({
          name: fn[1], kind: 'method', line: i + 1,
          endLine: solidityMemberEnd(masked, i, line), exported, parent,
        })
        depth += braceDeltaOf(rawLine)
        continue
      }
      const special = /^(constructor|receive|fallback)\s*\(/.exec(line)
      if (special) {
        symbols.push({
          name: special[1], kind: 'method', line: i + 1,
          endLine: solidityMemberEnd(masked, i, line), exported, parent,
        })
        depth += braceDeltaOf(rawLine)
        continue
      }
      const modifier = /^modifier\s+([A-Za-z_$][\w$]*)/.exec(line)
      if (modifier) {
        symbols.push({
          name: modifier[1], kind: 'method', line: i + 1,
          endLine: solidityMemberEnd(masked, i, line), exported, parent,
        })
        depth += braceDeltaOf(rawLine)
        continue
      }
      const event = /^(?:event|error)\s+([A-Za-z_$][\w$]*)/.exec(line)
      if (event) {
        symbols.push({
          name: event[1], kind: 'type', line: i + 1,
          endLine: solidityMemberEnd(masked, i, line), exported, parent,
        })
        depth += braceDeltaOf(rawLine)
        continue
      }
      const struct = /^(?:struct|enum)\s+([A-Za-z_$][\w$]*)/.exec(line)
      if (struct) {
        symbols.push({
          name: struct[1], kind: 'class', line: i + 1,
          endLine: solidityMemberEnd(masked, i, line), exported, parent,
        })
        depth += braceDeltaOf(rawLine)
        continue
      }
      const udvt = /^type\s+([A-Za-z_$][\w$]*)\s+is\s+/.exec(line)
      if (udvt) {
        symbols.push({
          name: udvt[1], kind: 'type', line: i + 1, endLine: i + 1, exported, parent,
        })
        depth += braceDeltaOf(rawLine)
        continue
      }
    }
    depth += braceDeltaOf(rawLine)
  }
  return symbols
}

/**
 * 扫描 Clojure 源码行：`;` 行注释截断，字符串内容替换为空格（保留
 * 引号，避免影响括号配平）。
 * @param {string[]} lines - 源码行。
 * @returns {string[]} 等长掩码行。
 */
export function clojureScan(lines) {
  const out = []
  let inString = false
  for (const raw of lines) {
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (inString) {
        if (ch === '\\') { i++; masked += '  ' }
        else if (ch === '"') { inString = false; masked += '"' }
        else masked += ' '
        continue
      }
      if (ch === ';') break
      if (ch === '"') { inString = true; masked += '"'; continue }
      masked += ch
    }
    out.push(masked)
  }
  return out
}

/**
 * 计算 Clojure 顶层形式的结束行：从起始行的括号开始配平（圆/方/花括号
 * 统一计数），字符串与注释已屏蔽。
 * @param {string[]} masked - 掩码代码行。
 * @param {number} startIdx - 起始行索引（0-based）。
 * @returns {number} 结束行索引（0-based）。
 */
function clojureFormEnd(masked, startIdx) {
  let depth = 0
  let opened = false
  for (let i = startIdx; i < masked.length; i++) {
    for (const ch of masked[i]) {
      if (ch === '(' || ch === '[' || ch === '{') { depth++; opened = true }
      else if (ch === ')' || ch === ']' || ch === '}') depth--
    }
    if (opened && depth <= 0) return i
  }
  return masked.length - 1
}

/**
 * 提取 Clojure 符号：`ns`（class）、`defn`/`defn-`/`defmacro`/`defmulti`/
 * `defmethod`（function）、`def`/`defonce`（variable）、`defrecord`/
 * `deftype`/`defprotocol`/`definterface`（class）。只识别行首 `(` 的
 * 顶层形式；`(comment …)` 整体跳过；`defn-` 与 `^:private` 标记非导出；
 * 形式范围按括号配平。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractClojure(lines) {
  const masked = clojureScan(lines)
  const symbols = []
  const metaPrefix = '(?:\\^(?:\\{[^}]*\\}|[^\\s()\\[\\]{}"]+)\\s+)*'
  const namePattern = `(${metaPrefix}[^\\s()\\[\\]{}"]+)`
  for (let i = 0; i < masked.length; i++) {
    const line = masked[i].trim()
    if (!line.startsWith('(')) continue
    if (/^\(comment\b/.test(line)) {
      i = clojureFormEnd(masked, i)
      continue
    }
    const endLine = clojureFormEnd(masked, i) + 1
    const exported = !/^\((?:defn-|defmacro-)\s/.test(line) && !line.includes('^:private')
    const ns = /^\(ns\s+([A-Za-z][\w.-]*)/.exec(line)
    if (ns) {
      symbols.push({ name: ns[1], kind: 'class', line: i + 1, endLine, exported: true })
      continue
    }
    const fn = new RegExp(`^\\((defn|defn-|defmacro|defmacro-|defmulti|defmethod)\\s+${namePattern}`).exec(line)
    if (fn) {
      symbols.push({ name: fn[2], kind: 'function', line: i + 1, endLine, exported })
      continue
    }
    const value = new RegExp(`^\\((def|defonce)\\s+${namePattern}`).exec(line)
    if (value) {
      symbols.push({ name: value[2], kind: 'variable', line: i + 1, endLine, exported })
      continue
    }
    const type = new RegExp(`^\\((defrecord|deftype|defprotocol|definterface)\\s+(${metaPrefix}[A-Za-z][\\w.-]*)`).exec(line)
    if (type) {
      symbols.push({ name: type[2], kind: 'class', line: i + 1, endLine, exported })
    }
  }
  return symbols
}

/**
 * 扫描 HCL 源码行：`#`/`//` 行注释截断、`/* … *\/` 块注释与字符串内容
 * 在掩码视图替换为空格；code 视图保留字符串原文（供 module source 提取）。
 * @param {string[]} lines - 源码行。
 * @returns {Array<{code:string, masked:string}>} 双视图行。
 */
export function hclScan(lines) {
  const out = []
  let inBlock = false
  let quote = null
  for (const raw of lines) {
    let code = ''
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      const next = raw[i + 1]
      if (inBlock) {
        if (ch === '*' && next === '/') { inBlock = false; i++; masked += '  ' }
        else masked += ' '
        continue
      }
      if (quote) {
        code += ch
        if (ch === '\\') {
          if (i + 1 < raw.length) { code += raw[i + 1]; masked += '  '; i++ }
          else masked += ' '
          continue
        }
        if (ch === quote) { quote = null; masked += ch; continue }
        masked += ' '
        continue
      }
      if (ch === '#' || (ch === '/' && next === '/')) break
      if (ch === '/' && next === '*') { inBlock = true; i++; masked += '  '; continue }
      if (ch === '"') { quote = ch; code += ch; masked += ch; continue }
      code += ch
      masked += ch
    }
    out.push({ code, masked })
  }
  return out
}

/**
 * 提取 HCL/Terraform 符号：`resource`/`data`（`type.name`）、`module`、
 * `provider`、`terraform` 块与 `variable`/`output`/`locals`；块范围按
 * 花括号配平，嵌套块（`lifecycle`、`dynamic` 等）不登记。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractHcl(lines) {
  const rows = hclScan(lines)
  const masked = rows.map(row => row.masked)
  const codeLines = rows.map(row => row.code)
  const symbols = []
  for (let i = 0; i < masked.length; i++) {
    const maskedLine = masked[i].trim()
    if (!maskedLine || !maskedLine.includes('{')) continue
    // 块标签（resource "type" "name"）位于字符串内：用 code 视图提取，
    // 范围仍用掩码视图配平，避免字符串中的花括号干扰
    const line = codeLines[i].trim()
    const block = /^([A-Za-z_]\w*)(?:\s+"([^"]*)")?(?:\s+"([^"]*)")?\s*\{/.exec(line)
    if (!block) continue
    const keyword = block[1]
    const first = block[2]
    const second = block[3]
    let name = null
    let kind = 'class'
    if ((keyword === 'resource' || keyword === 'data') && first && second) {
      name = `${first}.${second}`
    } else if (keyword === 'module' && first) {
      name = first
    } else if (keyword === 'provider' && first) {
      name = first
    } else if (keyword === 'variable' && first) {
      name = first
      kind = 'variable'
    } else if (keyword === 'output' && first) {
      name = first
      kind = 'variable'
    } else if (keyword === 'locals') {
      name = 'locals'
      kind = 'variable'
    } else if (keyword === 'terraform') {
      name = 'terraform'
    }
    if (!name) continue
    symbols.push({
      name,
      kind,
      line: i + 1,
      endLine: findBlockEnd(masked, i),
      exported: true,
    })
  }
  return symbols
}

/**
 * 扫描 Groovy 源码行：`//` 行注释截断、`/* … *\/` 块注释与单/双引号
 * 字符串（含三引号）内容替换为空格。
 * @param {string[]} lines - 源码行。
 * @returns {string[]} 等长掩码行。
 */
export function groovyScan(lines) {
  const out = []
  let inBlock = false
  let quote = null
  for (const raw of lines) {
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      const next = raw[i + 1]
      if (inBlock) {
        if (ch === '*' && next === '/') { inBlock = false; i++; masked += '  ' }
        else masked += ' '
        continue
      }
      if (quote) {
        if (quote.length === 3) {
          if (raw.startsWith(quote, i)) { masked += quote; i += 2; quote = null; continue }
          masked += ' '
          continue
        }
        if (ch === '\\') { i++; masked += '  ' }
        else if (ch === quote) { quote = null; masked += ch }
        else masked += ' '
        continue
      }
      if (ch === '/' && next === '/') break
      if (ch === '/' && next === '*') { inBlock = true; i++; masked += '  '; continue }
      if (ch === '"' || ch === "'") {
        const triple = ch.repeat(3)
        if (raw.startsWith(triple, i)) { quote = triple; masked += triple; i += 2; continue }
        quote = ch
        masked += ch
        continue
      }
      masked += ch
    }
    out.push(masked)
  }
  return out
}

/** Groovy 控制流/调用关键字——禁止被误识别为方法名。 */
const GROOVY_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'switch', 'case', 'catch', 'finally', 'try',
  'return', 'new', 'throw', 'assert', 'println', 'print', 'do', 'def', 'in',
  'synchronized', 'super', 'this',
])

/**
 * 提取 Groovy 符号：`class`/`interface`/`trait`/`enum`（class）与顶层
 * 脚本方法/类内方法（function/method）。只识别顶层类与第一层方法；
 * 方法体内部、闭包赋值与关键字调用不登记；`private`/`protected` 非导出。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractGroovy(lines) {
  const masked = groovyScan(lines)
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const classes = []
  let depth = 0
  for (let i = 0; i < masked.length; i++) {
    while (classes.length > 0 && classes[classes.length - 1].end <= i + 1) classes.pop()
    const line = masked[i].trim()
    if (line === '') { depth += braceDeltaOf(masked[i]); continue }
    const parent = classes.length > 0 ? classes[classes.length - 1].name : undefined
    const exported = !/\b(?:private|protected)\b/.test(line)

    if (depth === 0) {
      const typeMatch = /^(?:(?:public|private|protected|abstract|final|static)\s+)*(?:class|interface|trait|enum)\s+([A-Za-z_$][\w$]*)/.exec(line)
      if (typeMatch) {
        const end = findBlockEnd(masked, i)
        symbols.push({ name: typeMatch[1], kind: 'class', line: i + 1, endLine: end, exported })
        classes.push({ name: typeMatch[1], end })
        depth += braceDeltaOf(masked[i])
        continue
      }
      // 顶层脚本方法（Jenkinsfile/Gradle 风格的 `def name(...)`）
      const scriptFn = /^def\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line)
      if (scriptFn) {
        symbols.push({
          name: scriptFn[1], kind: 'function', line: i + 1,
          endLine: findBlockEnd(masked, i), exported,
        })
        depth += braceDeltaOf(masked[i])
        continue
      }
    } else if (depth === 1 && parent) {
      const fn = /^(?:(?:public|private|protected|static|final|abstract|synchronized|native|def)\s+)*(?:[A-Za-z_$][\w$<>[\],.?]*\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(line)
      if (fn && !GROOVY_KEYWORDS.has(fn[1])) {
        symbols.push({
          name: fn[1], kind: 'method', line: i + 1,
          endLine: findBlockEnd(masked, i), exported, parent,
        })
        depth += braceDeltaOf(masked[i])
        continue
      }
    }
    depth += braceDeltaOf(masked[i])
  }
  return symbols
}

/**
 * 扫描 PowerShell 源码行：`#` 行注释、`<# … #>` 块注释、单/双引号字符串
 * （`` ` `` 转义与 `''` 双写转义）以及 here-string（`@'…'@` / `@"…"@`，
 * 起始标记须在行尾、结束标记须在行首）内容替换为空格。
 *
 * 返回双视图：`masked` 供符号提取配平（字符串/注释全屏蔽）；`code`
 * 保留字符串原文、仅屏蔽注释，供依赖提取读取 `using module` /
 * `Import-Module` / dot-source 的路径。
 * @param {string[]} lines - 源码行。
 * @returns {{code:string[], masked:string[]}} 双视图（行注释后截断）。
 */
export function powershellScan(lines) {
  const codeOut = []
  const maskedOut = []
  let inBlock = false
  let quote = null
  /** @type {string|null} here-string 结束标记（`'@` 或 `"@`）。 */
  let here = null
  for (const raw of lines) {
    if (here) {
      const trimmed = raw.trimStart()
      if (trimmed.startsWith(here) && trimmed.slice(here.length).trim() === '') here = null
      codeOut.push(' '.repeat(raw.length))
      maskedOut.push(' '.repeat(raw.length))
      continue
    }
    let code = ''
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      const next = raw[i + 1]
      if (inBlock) {
        if (ch === '#' && next === '>') { inBlock = false; i++; code += '  '; masked += '  ' }
        else { code += ' '; masked += ' ' }
        continue
      }
      if (quote) {
        if (ch === '`' && quote === '"') { i++; code += raw.slice(i - 1, i + 1); masked += '  ' }
        else if (ch === quote) {
          // PowerShell 单引号字符串用 `''` 表示一个引号
          if (raw[i + 1] === quote) { i++; code += raw.slice(i - 1, i + 1); masked += '  ' }
          else { quote = null; code += ch; masked += ch }
        } else { code += ch; masked += ' ' }
        continue
      }
      if (ch === '@' && (next === "'" || next === '"') && raw.slice(i + 2).trim() === '') {
        here = `${next}@`
        code += ' '.repeat(raw.length - i)
        masked += ' '.repeat(raw.length - i)
        break
      }
      if (ch === '<' && next === '#') { inBlock = true; i++; code += '  '; masked += '  '; continue }
      if (ch === '#') break
      if (ch === "'" || ch === '"') { quote = ch; code += ch; masked += ch; continue }
      code += ch
      masked += ch
    }
    codeOut.push(code)
    maskedOut.push(masked)
  }
  return { code: codeOut, masked: maskedOut }
}

/** PowerShell 控制流/结构性关键字——禁止被误识别为方法名。 */
const POWERSHELL_KEYWORDS = new Set([
  'if', 'elseif', 'else', 'foreach', 'for', 'while', 'do', 'switch', 'try',
  'catch', 'finally', 'function', 'filter', 'class', 'enum', 'return',
  'throw', 'param', 'trap', 'begin', 'process', 'end', 'using', 'workflow',
  'configuration', 'data', 'in', 'and', 'or', 'not',
])

/**
 * 提取 PowerShell 符号：`function`/`filter`/`workflow`/`configuration`
 * 定义（函数名可含 `-`，支持 `global:`/`script:`/`local:`/`private:`
 * 作用域前缀）与顶层 `class`/`enum`；类内第一层方法（含构造器）带
 * `parent`，`hidden` 成员标记非导出。方法体内、属性与调用表达式不登记。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractPowershell(lines) {
  const { masked } = powershellScan(lines)
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const containers = []
  let depth = 0
  for (let i = 0; i < masked.length; i++) {
    while (containers.length > 0 && containers[containers.length - 1].end <= i + 1) containers.pop()
    const line = masked[i].trim()
    if (line === '') { depth += braceDeltaOf(masked[i]); continue }
    const parent = containers.length > 0 ? containers[containers.length - 1].name : undefined

    if (depth === 0) {
      const typeMatch = /^(?:class|enum)\s+([A-Za-z_]\w*)/.exec(line)
      if (typeMatch) {
        const end = findBlockEnd(masked, i)
        symbols.push({
          name: typeMatch[1], kind: 'class', line: i + 1, endLine: end, exported: true,
        })
        containers.push({ name: typeMatch[1], end })
        depth += braceDeltaOf(masked[i])
        continue
      }
      const fn = /^(?:function|filter|workflow|configuration)\s+(?:(global|script|local|private):)?([A-Za-z_][\w-]*)/i.exec(line)
      if (fn) {
        symbols.push({
          name: fn[2], kind: 'function', line: i + 1,
          endLine: findBlockEnd(masked, i),
          exported: (fn[1] ?? '').toLowerCase() !== 'private',
        })
        depth += braceDeltaOf(masked[i])
        continue
      }
    } else if (depth === 1 && parent) {
      const hidden = /^hidden\s+/i.test(line)
      const member = /^(?:hidden\s+)?(?:(?:static|public|protected)\s+)*(?:\[[^\]]*\]\s*)*([A-Za-z_][\w-]*)\s*\(/i.exec(line)
      if (member && !POWERSHELL_KEYWORDS.has(member[1].toLowerCase())) {
        symbols.push({
          name: member[1], kind: 'method', line: i + 1,
          endLine: findBlockEnd(masked, i), exported: !hidden, parent,
        })
        depth += braceDeltaOf(masked[i])
        continue
      }
    }
    depth += braceDeltaOf(masked[i])
  }
  return symbols
}

/**
 * 扫描 Fortran 源码行：`!` 行注释截断、单/双引号字符串（`''`/`""`
 * 双写转义）内容替换为空格。固定格式（`.f`/`.f77`）的列首 `C`/`*`
 * 注释不特殊处理，避免把自由格式的 `C = 1` 赋值误当注释。
 * @param {string[]} lines - 源码行。
 * @returns {string[]} 等长掩码行（行注释后截断）。
 */
export function fortranScan(lines) {
  const out = []
  for (const raw of lines) {
    let masked = ''
    let quote = null
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (quote) {
        if (ch === quote) {
          if (raw[i + 1] === quote) { i++; masked += '  ' }
          else { quote = null; masked += ch }
        } else masked += ' '
        continue
      }
      if (ch === '!') break
      if (ch === "'" || ch === '"') { quote = ch; masked += ch; continue }
      masked += ch
    }
    out.push(masked)
  }
  return out
}

/** Fortran `end` 语句中不关闭程序单元的构造名（`end do`/`end if` 等）。 */
const FORTRAN_NON_UNIT_ENDS = new Set([
  'do', 'if', 'select', 'where', 'forall', 'associate', 'block', 'critical',
  'team', 'enum', 'file',
])

/**
 * 提取 Fortran 符号：`module`/`program`/`subroutine`/`function`（含类型
 * 前缀与 `pure`/`recursive`/`module` 修饰）、派生类型 `type [::] name`
 * 与具名 `interface`。范围按 `end`/`end <unit>` 配平，模块内子程序带
 * `parent` 归属；`use`、声明语句与 `end do`/`end if` 等构造不登记。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractFortran(lines) {
  const masked = fortranScan(lines)
  const symbols = []
  /** @type {Array<{kind:string, name:string, symbol:object}>} */
  const stack = []
  for (let i = 0; i < masked.length; i++) {
    const line = masked[i].trim()
    if (line === '') continue

    const endMatch = /^end\s*([A-Za-z]+)?\b/i.exec(line)
    if (endMatch) {
      const word = (endMatch[1] ?? '').toLowerCase()
      if (word === '' || !FORTRAN_NON_UNIT_ENDS.has(word)) {
        for (let k = stack.length - 1; k >= 0; k--) {
          if (word === '' || stack[k].kind === word) {
            stack[k].symbol.endLine = i + 1
            stack.length = k
            break
          }
        }
      }
      continue
    }

    const parent = stack.length > 0 ? stack[stack.length - 1].name : undefined
    /**
     * 登记符号并按需入栈。
     * @param {string} name - 符号名。
     * @param {string} kind - 符号种类。
     * @param {string} unit - `end` 配对使用的单元关键字。
     * @returns {void}
     */
    const push = (name, kind, unit) => {
      if (!/^[A-Za-z_]\w*$/.test(name)) return
      /** @type {object} */
      const symbol = { name, kind, line: i + 1, endLine: i + 1, exported: true }
      if (parent) symbol.parent = parent
      symbols.push(symbol)
      stack.push({ kind: unit, name, symbol })
    }

    const moduleMatch = /^module\s+([A-Za-z_]\w*)/i.exec(line)
    if (moduleMatch && !/^module\s+(?:procedure|function|subroutine)\b/i.test(line)) {
      push(moduleMatch[1], 'class', 'module')
      continue
    }
    const programMatch = /^program\s+([A-Za-z_]\w*)/i.exec(line)
    if (programMatch) {
      push(programMatch[1], 'function', 'program')
      continue
    }
    const subroutineMatch = /\bsubroutine\s+([A-Za-z_]\w*)/i.exec(line)
    if (subroutineMatch) {
      push(subroutineMatch[1], 'function', 'subroutine')
      continue
    }
    const functionMatch = /\bfunction\s+([A-Za-z_]\w*)/i.exec(line)
    if (functionMatch) {
      push(functionMatch[1], 'function', 'function')
      continue
    }
    const typeWithColons = /^type\s*(?:,[^:]*)?::\s*([A-Za-z_]\w*)/i.exec(line)
    if (typeWithColons) {
      push(typeWithColons[1], 'type', 'type')
      continue
    }
    const typeBare = /^type\s+(?!is\b)([A-Za-z_]\w*)\s*(?:\(|$)/i.exec(line)
    if (typeBare) {
      push(typeBare[1], 'type', 'type')
      continue
    }
    const interfaceMatch = /^interface\s+([A-Za-z_]\w*)/i.exec(line)
    if (interfaceMatch && !/^interface\s+(?:operator|assignment)\b/i.test(line)) {
      push(interfaceMatch[1], 'interface', 'interface')
    }
  }
  return symbols
}

/**
 * 扫描 Perl 源码行：`#` 行注释（`$#array` 除外）、行首 `=pod`…`=cut`
 * POD 块、`<<'EOF'`/`<<"EOF"`/`<<EOF`/`<<~EOF` heredoc 内容与单/双引号
 * 字符串（反斜杠转义）替换为空格。
 *
 * 返回双视图：`masked` 供符号提取配平；`code` 保留字符串原文、仅屏蔽
 * 注释/POD/heredoc，供依赖提取读取 `use parent 'Foo'` 等引号参数。
 * @param {string[]} lines - 源码行。
 * @returns {{code:string[], masked:string[]}} 双视图（行注释后截断）。
 */
export function perlScan(lines) {
  const codeOut = []
  const maskedOut = []
  let inPod = false
  let quote = null
  /** @type {string|null} heredoc 结束标识符。 */
  let heredoc = null
  for (const raw of lines) {
    if (inPod) {
      codeOut.push(' '.repeat(raw.length))
      maskedOut.push(' '.repeat(raw.length))
      if (/^=cut\b/.test(raw)) inPod = false
      continue
    }
    if (heredoc) {
      const done = raw.trim() === heredoc
      codeOut.push(' '.repeat(raw.length))
      maskedOut.push(' '.repeat(raw.length))
      if (done) heredoc = null
      continue
    }
    if (/^=[A-Za-z]/.test(raw)) {
      inPod = true
      codeOut.push(' '.repeat(raw.length))
      maskedOut.push(' '.repeat(raw.length))
      continue
    }
    let code = ''
    let masked = ''
    /** @type {string|null} */
    let heredocTag = null
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      const next = raw[i + 1]
      if (quote) {
        if (ch === '\\') { i++; code += raw.slice(i - 1, i + 1); masked += '  ' }
        else if (ch === quote) { quote = null; code += ch; masked += ch }
        else { code += ch; masked += ' ' }
        continue
      }
      if (ch === '#' && raw[i - 1] !== '$') break
      if (ch === '<' && next === '<' && !heredocTag) {
        const m = /^<<~?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(raw.slice(i))
        if (m) {
          heredocTag = m[2]
          code += raw.slice(i)
          masked += raw.slice(i)
          break
        }
      }
      if (ch === "'" || ch === '"') { quote = ch; code += ch; masked += ch; continue }
      code += ch
      masked += ch
    }
    if (heredocTag) heredoc = heredocTag
    codeOut.push(code)
    maskedOut.push(masked)
  }
  return { code: codeOut, masked: maskedOut }
}

/**
 * 提取 Perl 符号：`package Foo::Bar;`（无块，作用于后续声明直到下一个
 * package）与 `package Foo { … }`（块作用域）登记为 class；`sub name`
 * 登记为 function，包内 sub 为 method 并带 `parent`；`_` 前缀按惯例
 * 标记非导出。注释、POD、heredoc 与引号内容不登记。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractPerl(lines) {
  const { masked } = perlScan(lines)
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const blocks = []
  /** @type {object|null} 当前无块 package 的符号（endLine 后续回填）。 */
  let currentPackage = null
  for (let i = 0; i < masked.length; i++) {
    while (blocks.length > 0 && blocks[blocks.length - 1].end <= i + 1) blocks.pop()
    const line = masked[i].trim()
    if (line === '') continue

    const packageMatch = /^package\s+([A-Za-z_]\w*(?:::\w+)*)\s*(\{)?/.exec(line)
    if (packageMatch) {
      const name = packageMatch[1]
      if (packageMatch[2]) {
        const end = findBlockEnd(masked, i)
        symbols.push({ name, kind: 'class', line: i + 1, endLine: end, exported: true })
        blocks.push({ name, end })
        continue
      }
      if (currentPackage) currentPackage.endLine = i
      const symbol = { name, kind: 'class', line: i + 1, endLine: masked.length, exported: true }
      symbols.push(symbol)
      currentPackage = symbol
      continue
    }

    const subMatch = /^sub\s+([A-Za-z_]\w*)/.exec(line)
    if (subMatch) {
      const name = subMatch[1]
      const parent = blocks.length > 0
        ? blocks[blocks.length - 1].name
        : currentPackage?.name
      /** @type {object} */
      const symbol = {
        name,
        kind: parent ? 'method' : 'function',
        line: i + 1,
        endLine: line.includes('{') ? findBlockEnd(masked, i) : i + 1,
        exported: !name.startsWith('_'),
      }
      if (parent) symbol.parent = parent
      symbols.push(symbol)
    }
  }
  return symbols
}

/**
 * 扫描 Object Pascal 源码行：`//` 行注释、`{ … }`（含 `{$…}` 指令）与
 * `(* … *)` 块注释、单引号字符串（`''` 双写转义）内容替换为空格。
 *
 * 返回双视图：`masked` 供符号提取配平；`code` 保留字符串原文，供
 * `uses Unit in 'path.pas'` 读取路径。
 * @param {string[]} lines - 源码行。
 * @returns {{code:string[], masked:string[]}} 双视图（行注释后截断）。
 */
export function pascalScan(lines) {
  const codeOut = []
  const maskedOut = []
  let inBrace = false
  let inParen = false
  let quote = null
  for (const raw of lines) {
    let code = ''
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      const next = raw[i + 1]
      if (inBrace) {
        code += ' '
        masked += ' '
        if (ch === '}') inBrace = false
        continue
      }
      if (inParen) {
        if (ch === '*' && next === ')') { inParen = false; i++; code += '  '; masked += '  ' }
        else { code += ' '; masked += ' ' }
        continue
      }
      if (quote) {
        if (ch === "'") {
          if (raw[i + 1] === "'") { i++; code += "''"; masked += '  ' }
          else { quote = null; code += ch; masked += ch }
        } else { code += ch; masked += ' ' }
        continue
      }
      if (ch === '/' && next === '/') break
      if (ch === '{') { inBrace = true; code += ' '; masked += ' '; continue }
      if (ch === '(' && next === '*') { inParen = true; i++; code += '  '; masked += '  '; continue }
      if (ch === "'") { quote = ch; code += ch; masked += ch; continue }
      code += ch
      masked += ch
    }
    codeOut.push(code)
    maskedOut.push(masked)
  }
  return { code: codeOut, masked: maskedOut }
}

/**
 * 计算 Pascal 类型声明（class/record/interface）的结束行：按
 * `class`/`record`/`object`/`interface`/`dispinterface` 与 `end` 配平，
 * `class function`/`class procedure`/`class var`/`class property` 与
 * `class of` 不算新块。
 * @param {string[]} lines - 掩码行。
 * @param {number} startIdx - 类型声明起始行（0-based）。
 * @returns {number} 结束行（1-based）。
 */
function pascalTypeEnd(lines, startIdx) {
  let depth = 0
  for (let i = startIdx; i < lines.length; i++) {
    const normalized = lines[i].replace(
      /\bclass\s+(?:function|procedure|var|property|operator|constructor|destructor)\b|\bclass\s+of\b/gi, ' ',
    )
    const tokens = normalized.match(/\b(?:class|record|object|interface|dispinterface|end)\b/gi) ?? []
    for (const token of tokens) {
      if (token.toLowerCase() === 'end') depth--
      else depth++
    }
    if (depth <= 0) return i + 1
  }
  return startIdx + 1
}

/**
 * 计算 Pascal 例程体（`begin … end`）的结束行：从声明行起找到首个
 * `begin`，再按 `begin`/`case`/`try`/`asm` 与 `end` 配平；声明后直接
 * 遇到下一个声明（无 body，interface 段）时止于声明行。
 * @param {string[]} lines - 掩码行。
 * @param {number} startIdx - 声明起始行（0-based）。
 * @returns {number} 结束行（1-based）。
 */
function pascalRoutineEnd(lines, startIdx) {
  let depth = 0
  let started = false
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    if (!started) {
      if (/\bbegin\b/i.test(line)) started = true
      else if (i > startIdx && /^(?:procedure|function|constructor|destructor|property|type|uses|implementation|interface|end\.)\b/i.test(line.trim())) {
        return startIdx + 1
      } else continue
    }
    const tokens = line.match(/\b(?:begin|case|try|asm|end)\b/gi) ?? []
    for (const token of tokens) {
      if (token.toLowerCase() === 'end') depth--
      else depth++
    }
    if (depth <= 0) return i + 1
  }
  return startIdx + 1
}

/**
 * 提取 Object Pascal 符号：`unit`/`program`/`library`（class）、
 * `type X = class/interface/record`（class/interface/type）与
 * `procedure`/`function`/`constructor`/`destructor`（function；类内或
 * `TFoo.Bar` 形式为 method + `parent`）、`property`（variable）。
 * 注释、字符串与条件编译指令不登记。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractPascal(lines) {
  const { masked } = pascalScan(lines)
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const types = []
  for (let i = 0; i < masked.length; i++) {
    while (types.length > 0 && types[types.length - 1].end <= i + 1) types.pop()
    const line = masked[i].trim()
    if (line === '') continue

    const unitMatch = /^(?:unit|program|library)\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/i.exec(line)
    if (unitMatch) {
      symbols.push({
        name: unitMatch[1], kind: 'class', line: i + 1, endLine: masked.length, exported: true,
      })
      continue
    }

    const typeMatch = /^([A-Za-z_]\w*)\s*=\s*(class|interface|record|object|dispinterface)\b/i.exec(line)
    if (typeMatch) {
      const keyword = typeMatch[2].toLowerCase()
      const kind = keyword === 'interface' ? 'interface' : keyword === 'record' ? 'type' : 'class'
      const end = pascalTypeEnd(masked, i)
      const parent = types.length > 0 ? types[types.length - 1].name : undefined
      /** @type {object} */
      const symbol = { name: typeMatch[1], kind, line: i + 1, endLine: end, exported: true }
      if (parent) symbol.parent = parent
      symbols.push(symbol)
      types.push({ name: typeMatch[1], end })
      continue
    }

    const routineMatch = /^(?:class\s+)?(procedure|function|constructor|destructor)\s+(?:[\w.]+\.)?([A-Za-z_]\w*)/i.exec(line)
    if (routineMatch) {
      const qualified = /^(?:class\s+)?(?:procedure|function|constructor|destructor)\s+([\w.]+)/i.exec(line)
      const parts = (qualified?.[1] ?? routineMatch[2]).split('.')
      const parent = parts.length > 1
        ? parts[parts.length - 2]
        : (types.length > 0 ? types[types.length - 1].name : undefined)
      /** @type {object} */
      const symbol = {
        name: routineMatch[2],
        kind: parent ? 'method' : 'function',
        line: i + 1,
        endLine: pascalRoutineEnd(masked, i),
        exported: true,
      }
      if (parent) symbol.parent = parent
      symbols.push(symbol)
      continue
    }

    const propertyMatch = /^property\s+([A-Za-z_]\w*)/i.exec(line)
    if (propertyMatch) {
      const parent = types.length > 0 ? types[types.length - 1].name : undefined
      /** @type {object} */
      const symbol = {
        name: propertyMatch[1], kind: 'variable', line: i + 1, endLine: i + 1, exported: true,
      }
      if (parent) symbol.parent = parent
      symbols.push(symbol)
    }
  }
  return symbols
}

/**
 * 扫描 Nix 源码行：`#` 行注释、`/* … *\/` 块注释、双引号字符串
 * （反斜杠转义）与缩进字符串 `''…''`（`'''`、`''${`、`''\` 转义）
 * 内容替换为空格；路径字面量（`./x`、`<nixpkgs>`）保留。
 * @param {string[]} lines - 源码行。
 * @returns {string[]} 等长掩码行（行注释后截断）。
 */
export function nixScan(lines) {
  const out = []
  let inBlock = false
  let quote = null
  let indent = false
  for (const raw of lines) {
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      const next = raw[i + 1]
      if (inBlock) {
        if (ch === '*' && next === '/') { inBlock = false; i++; masked += '  ' }
        else masked += ' '
        continue
      }
      if (quote) {
        if (ch === '\\') { i++; masked += '  ' }
        else if (ch === '"') { quote = null; masked += ch }
        else masked += ' '
        continue
      }
      if (indent) {
        if (ch === "'" && raw.startsWith("'''", i)) { i += 2; masked += '   '; continue }
        if (ch === "'" && raw.startsWith("''${", i)) { i += 3; masked += '    '; continue }
        if (ch === "'" && next === "'" && raw[i + 2] === '\\') { i += 2; masked += '   '; continue }
        if (ch === "'" && next === "'") { indent = false; i++; masked += "''"; continue }
        masked += ' '
        continue
      }
      if (ch === '#') break
      if (ch === '/' && next === '*') { inBlock = true; i++; masked += '  '; continue }
      if (ch === '"') { quote = ch; masked += ch; continue }
      if (ch === "'" && next === "'") { indent = true; i++; masked += "''"; continue }
      masked += ch
    }
    out.push(masked)
  }
  return out
}

/** Nix 语言关键字——禁止被误识别为绑定名。 */
const NIX_KEYWORDS = new Set([
  'if', 'then', 'else', 'assert', 'with', 'let', 'in', 'inherit', 'rec',
  'or', 'null', 'true', 'false',
])

/**
 * 提取 Nix 绑定符号：属性集/let 内的 `name = value;`、属性路径
 * `a.b.c = value;`；值为属性集（`{`/`rec {`）登记 class 并配平范围，
 * lambda（`x: …` / `{ … }: …`）登记 function，其余登记 variable。
 * 嵌套属性集内的绑定带 `parent`；注释与字符串内文本不登记。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractNix(lines) {
  const masked = nixScan(lines)
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const containers = []
  for (let i = 0; i < masked.length; i++) {
    while (containers.length > 0 && containers[containers.length - 1].end <= i + 1) containers.pop()
    const line = masked[i].trim()
    if (line === '') continue
    const m = /^([A-Za-z_][\w'-]*(?:\.[A-Za-z_][\w'-]*)*)\s*=(?!=)\s*(.*)$/.exec(line)
    if (!m) continue
    const name = m[1]
    if (NIX_KEYWORDS.has(name)) continue
    const value = m[2].trim()
    const parent = containers.length > 0 ? containers[containers.length - 1].name : undefined
    /** @type {string} */
    let kind = 'variable'
    let endLine = i + 1
    const lambda = /^[A-Za-z_][\w'-]*\s*:/.test(value) || /^\{[^}]*\}\s*:/.test(value)
    if (lambda) {
      kind = 'function'
    } else if (/^rec\s*\{/.test(value) || value.startsWith('{')) {
      kind = 'class'
      endLine = findBlockEnd(masked, i)
      containers.push({ name, end: endLine })
    }
    /** @type {object} */
    const symbol = { name, kind, line: i + 1, endLine, exported: true }
    if (parent) symbol.parent = parent
    symbols.push(symbol)
  }
  return symbols
}

/**
 * 扫描 Visual Basic .NET 源码行：`'` 行注释、`REM` 注释行与双引号
 * 字符串（`""` 双写转义）内容替换为空格。
 * @param {string[]} lines - 源码行。
 * @returns {string[]} 等长掩码行（行注释后截断）。
 */
export function vbnetScan(lines) {
  const out = []
  let quote = null
  for (const raw of lines) {
    if (/^\s*REM\b/i.test(raw)) { out.push(' '.repeat(raw.length)); continue }
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (quote) {
        if (ch === '"') {
          if (raw[i + 1] === '"') { i++; masked += '  ' }
          else { quote = null; masked += ch }
        } else masked += ' '
        continue
      }
      if (ch === "'") break
      if (ch === '"') { quote = ch; masked += ch; continue }
      masked += ch
    }
    out.push(masked)
  }
  return out
}

/** VB.NET 修饰符前缀（类型与例程声明共用，可叠加）。 */
const VB_MODIFIERS = '(?:Public|Private|Protected|Friend|Partial|MustInherit|NotInheritable|Shared|ReadOnly|WriteOnly|Default|Overloads|Shadows|Custom|Async|Iterator|Overrides|Overridable|MustOverride|NotOverridable)'

/** 是否标记为非导出（Private/Friend/Protected 任一出现）。 */
function vbnetNonExported(line) {
  return /\b(?:Private|Friend|Protected)\b/i.test(line)
}

/**
 * 计算 VB.NET 类型声明（Class/Module/Structure/Interface/Enum/Namespace）
 * 的结束行：统计类型声明与 `End <type>` 配平。
 * @param {string[]} lines - 掩码行。
 * @param {number} startIdx - 声明起始行（0-based）。
 * @returns {number} 结束行（1-based）。
 */
function vbnetTypeEnd(lines, startIdx) {
  const openRe = new RegExp(`^(?:${VB_MODIFIERS}\\s+)*(?:Class|Module|Structure|Interface|Enum|Namespace)\\b`, 'i')
  const closeRe = /^End\s+(?:Class|Module|Structure|Interface|Enum|Namespace)\b/i
  let depth = 0
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim()
    if (openRe.test(line)) depth++
    if (closeRe.test(line)) depth--
    if (depth <= 0) return i + 1
  }
  return startIdx + 1
}

/**
 * 计算 VB.NET 例程（Sub/Function/Property/Event）的结束行：命中
 * `End <keyword>` 为止；若先遇到下一个声明（接口声明/MustOverride 等
 * 无 body 形式）则止于声明行。
 * @param {string[]} lines - 掩码行。
 * @param {number} startIdx - 声明起始行（0-based）。
 * @param {string} keyword - 声明关键字（原样，用于匹配 End）。
 * @returns {number} 结束行（1-based）。
 */
function vbnetRoutineEnd(lines, startIdx, keyword) {
  const endRe = new RegExp(`^End\\s+${keyword}\\b`, 'i')
  const declRe = new RegExp(`^(?:${VB_MODIFIERS}\\s+)*(?:Sub|Function|Property|Event|Operator|Class|Module|Structure|Interface|Enum|Namespace)\\b`, 'i')
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim()
    if (i > startIdx && declRe.test(line)) return startIdx + 1
    if (endRe.test(line)) return i + 1
  }
  return startIdx + 1
}

/**
 * 提取 Visual Basic .NET 符号：`Namespace`/`Class`/`Module`/`Structure`/
 * `Interface`/`Enum`（class/interface/type）与 `Sub`/`Function`/
 * `Property`/`Event`（function/variable；类内为 method 并带 `parent`）。
 * `Private`/`Friend`/`Protected` 标记非导出；注释与字符串不登记。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractVbnet(lines) {
  const masked = vbnetScan(lines)
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const types = []
  const typeRe = new RegExp(`^(?:${VB_MODIFIERS}\\s+)*(Class|Module|Structure|Interface|Enum|Namespace)\\s+([A-Za-z_]\\w*(?:\\.[A-Za-z_]\\w*)*)`, 'i')
  const routineRe = new RegExp(`^(?:${VB_MODIFIERS}\\s+)*(Sub|Function|Property|Event|Operator)\\s+([A-Za-z_]\\w*)`, 'i')
  for (let i = 0; i < masked.length; i++) {
    while (types.length > 0 && types[types.length - 1].end <= i + 1) types.pop()
    const line = masked[i].trim()
    if (line === '') continue

    const typeMatch = typeRe.exec(line)
    if (typeMatch) {
      const keyword = typeMatch[1].toLowerCase()
      const kind = keyword === 'interface' ? 'interface' : keyword === 'enum' ? 'type' : 'class'
      const end = vbnetTypeEnd(masked, i)
      const parent = types.length > 0 ? types[types.length - 1].name : undefined
      /** @type {object} */
      const symbol = {
        name: typeMatch[2], kind, line: i + 1, endLine: end, exported: !vbnetNonExported(line),
      }
      if (parent) symbol.parent = parent
      symbols.push(symbol)
      types.push({ name: typeMatch[2], end })
      continue
    }

    const routineMatch = routineRe.exec(line)
    if (!routineMatch) continue
    const keyword = routineMatch[1].toLowerCase()
    const parent = types.length > 0 ? types[types.length - 1].name : undefined
    const kind = keyword === 'property' || keyword === 'event'
      ? 'variable'
      : parent ? 'method' : 'function'
    /** @type {object} */
    const symbol = {
      name: routineMatch[2],
      kind,
      line: i + 1,
      endLine: vbnetRoutineEnd(masked, i, routineMatch[1]),
      exported: !vbnetNonExported(line),
    }
    if (parent) symbol.parent = parent
    symbols.push(symbol)
  }
  return symbols
}

/**
 * 扫描 Tcl 源码行：行首 `#` 注释整行屏蔽、命令分隔符 `;` 后的 `#`
 * 注释截断、双引号字符串（反斜杠转义）内容替换为空格；`{…}` 字面量块
 * 保留（Tcl 的 proc/类体本身就在花括号内，需要参与配平）。
 * @param {string[]} lines - 源码行。
 * @returns {string[]} 等长掩码行（行注释后截断）。
 */
export function tclScan(lines) {
  const out = []
  for (const raw of lines) {
    if (/^\s*#/.test(raw)) { out.push(' '.repeat(raw.length)); continue }
    let masked = ''
    let quote = null
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (quote) {
        if (ch === '\\') { i++; masked += '  ' }
        else if (ch === '"') { quote = null; masked += ch }
        else masked += ' '
        continue
      }
      if (ch === '#' && /;\s*$/.test(raw.slice(0, i))) break
      if (ch === '"') { quote = ch; masked += ch; continue }
      masked += ch
    }
    out.push(masked)
  }
  return out
}

/**
 * 计算 Tcl 块（proc/namespace/类体）的结束行：按整行花括号净值配平，
 * 声明行可同时包含参数列表与 body。
 * @param {string[]} lines - 掩码行。
 * @param {number} startIdx - 声明起始行（0-based）。
 * @returns {number} 结束行（1-based）。
 */
function tclBlockEnd(lines, startIdx) {
  let depth = 0
  let started = false
  for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
    }
    if (depth > 0) started = true
    if ((started && depth <= 0) || (!started && i === startIdx && depth === 0)) return i + 1
  }
  return startIdx + 1
}

/**
 * 提取 Tcl 符号：`proc name {args} {…}`（function；命名空间内为 method
 * 并带 `parent`）、`namespace eval Foo {…}` 与 TclOO
 * `oo::class create Foo {…}`（class），以及类体内 `method`/`constructor`/
 * `destructor`（method + `parent`）。注释与字符串内的伪定义不登记。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractTcl(lines) {
  const masked = tclScan(lines)
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const containers = []
  for (let i = 0; i < masked.length; i++) {
    while (containers.length > 0 && containers[containers.length - 1].end <= i + 1) containers.pop()
    const line = masked[i].trim()
    if (line === '') continue
    const parent = containers.length > 0 ? containers[containers.length - 1].name : undefined

    const nsMatch = /^namespace\s+eval\s+(?:::)?([A-Za-z_][\w:]*)\s*\{/.exec(line)
    if (nsMatch) {
      const end = tclBlockEnd(masked, i)
      symbols.push({ name: nsMatch[1], kind: 'class', line: i + 1, endLine: end, exported: true })
      containers.push({ name: nsMatch[1], end })
      continue
    }
    const ooMatch = /^oo::class\s+create\s+([A-Za-z_]\w*)\s*\{/.exec(line)
    if (ooMatch) {
      const end = tclBlockEnd(masked, i)
      /** @type {object} */
      const symbol = { name: ooMatch[1], kind: 'class', line: i + 1, endLine: end, exported: true }
      if (parent) symbol.parent = parent
      symbols.push(symbol)
      containers.push({ name: ooMatch[1], end })
      continue
    }
    const procMatch = /^proc\s+(?:::)?([A-Za-z_][\w:]*)\s*\{/.exec(line)
    if (procMatch) {
      const parts = procMatch[1].split('::')
      const name = parts[parts.length - 1]
      const nsParent = parts.length > 1 ? parts.slice(0, -1).join('::') : parent
      /** @type {object} */
      const symbol = {
        name, kind: nsParent ? 'method' : 'function', line: i + 1,
        endLine: tclBlockEnd(masked, i), exported: true,
      }
      if (nsParent) symbol.parent = nsParent
      symbols.push(symbol)
      continue
    }
    const methodMatch = /^(method|constructor|destructor)\s*(?:([A-Za-z_]\w*)\s*)?\{/.exec(line)
    if (methodMatch && parent && line.startsWith(methodMatch[1])) {
      symbols.push({
        name: methodMatch[2] ?? methodMatch[1],
        kind: 'method',
        line: i + 1,
        endLine: tclBlockEnd(masked, i),
        exported: true,
        parent,
      })
    }
  }
  return symbols
}

/**
 * 扫描 F# 源码行：`//` 行注释、可嵌套 `(* … *)` 块注释、三引号与普通
 * 字符串（反斜杠转义）内容替换为空格；`#if`/`#load` 等预处理指令行忽略。
 * @param {string[]} lines - 源码行。
 * @returns {string[]} 等长掩码行（行注释后截断）。
 */
export function fsharpScan(lines) {
  const out = []
  let blockDepth = 0
  /** @type {string|null} */
  let quote = null
  for (const raw of lines) {
    if (blockDepth === 0 && quote === null && /^\s*#(?:if|else|elif|endif|light|nowarn|load|r|time)\b/i.test(raw)) {
      out.push(' '.repeat(raw.length))
      continue
    }
    let masked = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      const next = raw[i + 1]
      if (blockDepth > 0) {
        if (ch === '(' && next === '*') { blockDepth++; i++; masked += '  ' }
        else if (ch === '*' && next === ')') { blockDepth--; i++; masked += '  ' }
        else masked += ' '
        continue
      }
      if (quote === '"""') {
        if (raw.startsWith('"""', i)) { quote = null; i += 2; masked += '   ' }
        else masked += ' '
        continue
      }
      if (quote === '"') {
        if (ch === '\\') { i++; masked += '  ' }
        else if (ch === '"') { quote = null; masked += ch }
        else masked += ' '
        continue
      }
      if (ch === '/' && next === '/') break
      if (ch === '(' && next === '*') { blockDepth = 1; i++; masked += '  '; continue }
      if (raw.startsWith('"""', i)) { quote = '"""'; i += 2; masked += '   '; continue }
      if (ch === '"') { quote = '"'; masked += ch; continue }
      masked += ch
    }
    out.push(masked)
  }
  return out
}

/**
 * 计算 F# 类型声明的结束行：`class`/`interface` 找配对 `end`，同行闭合
 * 或 record/union 单行止于本行，其余按缩进块。
 * @param {string[]} masked - 掩码行。
 * @param {number} startIdx - 声明起始行（0-based）。
 * @param {number} indent - 声明行缩进。
 * @returns {number} 结束行（1-based）。
 */
function fsharpTypeEnd(masked, startIdx, indent) {
  const line = masked[startIdx]
  if (/\bend\b/.test(line)) return startIdx + 1
  if (/\b(?:class|interface)\b/.test(line)) {
    for (let j = startIdx + 1; j < masked.length; j++) {
      if (/^\s*end\b/.test(masked[j])) return j + 1
    }
  }
  if (/\}\s*$/.test(line)) return startIdx + 1
  const blockEnd = haskellBlockEnd(masked, startIdx, indent)
  return blockEnd > startIdx + 1 ? blockEnd : startIdx + 1
}

/**
 * 提取 F# 符号：`namespace`/`module`（class）、`type`（class/interface/
 * type）、`member`/`abstract member`/`override`（method + `parent`）与
 * 顶层/模块内 `let`（function/variable）。缩进块确定范围；注释与字符串
 * 内的伪声明不登记。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractFsharp(lines) {
  const masked = fsharpScan(lines)
  const symbols = []
  /** @type {Array<{name:string, end:number}>} */
  const containers = []
  for (let i = 0; i < masked.length; i++) {
    while (containers.length > 0 && containers[containers.length - 1].end <= i + 1) containers.pop()
    const rawLine = masked[i]
    const line = rawLine.trim()
    if (line === '') continue
    const indent = haskellIndentOf(rawLine)
    const parent = containers.length > 0 ? containers[containers.length - 1].name : undefined

    const nsMatch = /^namespace\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/.exec(line)
    if (nsMatch) {
      if (indent === 0) containers.length = 0
      const symbol = {
        name: nsMatch[1], kind: 'class', line: i + 1, endLine: masked.length, exported: true,
      }
      symbols.push(symbol)
      containers.push({ name: nsMatch[1], end: masked.length })
      continue
    }

    const moduleMatch = /^module\s+(?:private\s+|internal\s+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*(=)?/.exec(line)
    if (moduleMatch) {
      if (indent === 0 && !moduleMatch[2]) containers.length = 0
      const end = moduleMatch[2] || indent > 0
        ? haskellBlockEnd(masked, i, indent)
        : masked.length
      /** @type {object} */
      const symbol = {
        name: moduleMatch[1], kind: 'class', line: i + 1, endLine: end, exported: true,
      }
      if (parent) symbol.parent = parent
      symbols.push(symbol)
      containers.push({ name: moduleMatch[1], end })
      continue
    }

    const typeMatch = /^type\s+(?:private\s+|internal\s+)?([A-Za-z_]\w*)(?:<[^>]*>)?\s*(?:\([^)]*\))?\s*=/.exec(line)
    if (typeMatch) {
      const keyword = /\binterface\b/.test(line) ? 'interface'
        : /\bclass\b/.test(line) || /^type\s+(?:private\s+|internal\s+)?[A-Za-z_]\w*\s*\(/.test(line)
          ? 'class'
          : 'type'
      const end = fsharpTypeEnd(masked, i, indent)
      /** @type {object} */
      const symbol = {
        name: typeMatch[1], kind: keyword, line: i + 1, endLine: end, exported: true,
      }
      if (parent) symbol.parent = parent
      symbols.push(symbol)
      containers.push({ name: typeMatch[1], end })
      continue
    }

    const memberMatch = /^(?:abstract\s+member|member)\s+(?:(?:private|internal|public|static|override|default|inline)\s+)*(?:[A-Za-z_]\w*\.)?([A-Za-z_]\w*)/.exec(line)
    const overrideMatch = /^(?:override|default)\s+(?:[A-Za-z_]\w*\.)?([A-Za-z_]\w*)\s*\(/.exec(line)
    const memberName = memberMatch?.[1] ?? overrideMatch?.[1]
    if (memberName) {
      const end = haskellBlockEnd(masked, i, indent)
      /** @type {object} */
      const symbol = {
        name: memberName, kind: parent ? 'method' : 'function', line: i + 1,
        endLine: end > i + 1 ? end : i + 1, exported: true,
      }
      if (parent) symbol.parent = parent
      symbols.push(symbol)
      continue
    }

    const letMatch = /^let\s+(?:(?:rec|inline|mutable|private|internal)\s+)*([A-Za-z_]\w*)/.exec(line)
    if (letMatch) {
      const rest = line.slice(line.indexOf(letMatch[1]) + letMatch[1].length)
      const beforeEquals = (rest.split('=')[0] ?? '').replace(/:\s*[^=]*$/, '').trim()
      const kind = beforeEquals !== '' ? 'function' : 'variable'
      const end = haskellBlockEnd(masked, i, indent)
      /** @type {object} */
      const symbol = {
        name: letMatch[1], kind, line: i + 1,
        endLine: end > i + 1 ? end : i + 1, exported: true,
      }
      if (parent) symbol.parent = parent
      symbols.push(symbol)
    }
  }
  return symbols
}

/**
 * 提取 C/C++ 符号：class / struct / union / enum / typedef 与函数、方法、
 * 构造/析构函数。轻量行级解析：
 * - 类型声明要求名称后紧跟 `{`/`:`/`;`/`final`，避免把 `struct Foo x;` 变量误判；
 * - 函数要求有返回类型，或位于类体内且与类同名（构造/析构），避免把宏调用
 *   与普通调用表达式当成定义；
 * - 声明头可跨多行（参数逐行书写），块范围从函数体 `{` 起算；
 * - 原型（`;` 结尾）记为单行符号，类内函数带 `parent`。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表。
 */
function extractCpp(lines) {
  const symbols = []
  /** @type {Array<{name:string, start:number, end:number}>} */
  const typeRanges = []
  // 第一遍：类型声明（函数归属需要先知道类范围）
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*')
      || trimmed.startsWith('/*') || trimmed.startsWith('#')) continue
    // 匿名 typedef（typedef struct { ... } Name;）：别名在闭合 `}` 之后
    if (/^typedef\s+(?:struct|union|enum)\s*\{/.test(trimmed)) {
      const term = cppTerminator(lines, i)
      if (term && term.kind === 'brace') {
        const endLine = findBlockEnd(lines, term.index)
        for (let j = endLine - 1; j < Math.min(lines.length, endLine + 2); j++) {
          const alias = /\}\s*(?<alias>[A-Za-z_]\w*)\s*;/.exec(lines[j])
          if (alias) {
            symbols.push({
              name: alias.groups.alias,
              kind: trimmed.startsWith('typedef enum') ? 'type' : 'class',
              line: i + 1,
              endLine,
              exported: true,
            })
            typeRanges.push({ name: alias.groups.alias, start: i + 1, end: endLine })
            break
          }
        }
      }
      continue
    }
    const tm = /^(?:template\s*<[^>]*>\s*)?(?:(?:typedef|export)\s+)?(?<kind>class|struct|union|enum(?:\s+class)?)\s+(?<name>[A-Za-z_]\w*)\b/.exec(trimmed)
    if (!tm) continue
    const rest = trimmed.slice(tm[0].length)
    // 名称后必须是块/继承/前向声明/结束，`struct Foo x;` 这类变量声明跳过
    if (!/^\s*(?:final\s*)?[:{;,)]/.test(rest) && !/^\s*$/.test(rest)) continue
    const term = cppTerminator(lines, i)
    if (!term || term.kind !== 'brace') continue
    const rawKind = tm.groups.kind
    const name = tm.groups.name
    const endLine = findBlockEnd(lines, term.index)
    symbols.push({
      name,
      kind: rawKind.startsWith('enum') ? 'type' : 'class',
      line: i + 1,
      endLine,
      exported: true,
    })
    typeRanges.push({ name, start: i + 1, end: endLine })
  }
  // 第二遍：函数/方法与类内构造/析构
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*')
      || trimmed.startsWith('/*') || trimmed.startsWith('#')) continue
    // 模板前缀与属性不应影响函数名解析
    const head = trimmed
      .replace(/^template\s*<[^>]*>\s*/, '')
      .replace(/^(?:\[\[[^\]]*\]\]\s*)+/, '')
    // 返回类型/修饰符需以空白或指针符收尾，避免把标识符拆成 pre+name（i|f）
    const fm = new RegExp(`^(?<pre>[A-Za-z_][\\w:<>,*&\\s]*?[\\s*&]+)?(?<name>${CPP_NAME})\\s*\\(`).exec(head)
    if (!fm) continue
    const name = fm.groups.name
    const pre = (fm.groups.pre ?? '').trim()
    const lastSegment = name.split('::').pop()
    const bareName = lastSegment.replace(/^~/, '')
    const parentRange = [...typeRanges].reverse().find(r => r.start < i + 1 && r.end >= i + 1)
    if (CPP_KEYWORDS.has(name) || CPP_KEYWORDS.has(pre.split(/\s+/)[0])) continue
    // 无返回类型：只接受类内构造/析构与类外限定定义（Foo::Foo / Foo::~Foo）
    if (pre === '') {
      const inClassCtor = parentRange && bareName === parentRange.name
      const qualifiedCtor = name.includes('::') && bareName === name.split('::')[0]
      if (!inClassCtor && !qualifiedCtor) continue
    }
    const term = cppTerminator(lines, i)
    if (!term) continue
    const endLine = term.kind === 'brace' ? findBlockEnd(lines, term.index) : term.index + 1
    // 类外定义的限定名给出归属（Foo::bar → Foo）
    const parent = name.includes('::')
      ? name.split('::').slice(0, -1).join('::')
      : parentRange?.name
    symbols.push({
      name: lastSegment,
      kind: parent ? 'method' : 'function',
      line: i + 1,
      endLine,
      // C 没有 export 概念；static 函数视为文件内私有
      exported: !/\bstatic\b/.test(pre),
      ...(parent ? { parent } : {}),
    })
  }
  return symbols
}

/**
 * Ada 的注释/字符串屏蔽（双视图）：`--` 到行尾为注释，双引号字符串
 * （`""` 表示转义引号）置空；字符字面量 `'a'` 不屏蔽，避免破坏
 * `X'Length` 这类属性引用。
 * @param {string[]} lines - 代码行。
 * @returns {{code:string[], masked:string[]}} 原行与等长掩码行。
 */
export function adaScan(lines) {
  const code = []
  const masked = []
  for (const line of lines) {
    let out = ''
    let inString = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inString) {
        if (ch === '"') {
          if (line[i + 1] === '"') { out += '  '; i++; continue }
          inString = false
        }
        out += ' '
        continue
      }
      if (ch === '"') { inString = true; out += ' '; continue }
      if (ch === '-' && line[i + 1] === '-') break
      out += ch
    }
    code.push(line)
    masked.push(out.padEnd(line.length, ' '))
  }
  return { code, masked }
}

/** Ada 保留字（禁止被识别为对象/类型名）。 */
const ADA_KEYWORDS = new Set([
  'abort', 'abs', 'abstract', 'accept', 'access', 'aliased', 'all', 'and', 'array',
  'at', 'begin', 'body', 'case', 'constant', 'declare', 'delay', 'delta', 'digits',
  'do', 'else', 'elsif', 'end', 'entry', 'exception', 'exit', 'for', 'function',
  'generic', 'goto', 'if', 'in', 'interface', 'is', 'limited', 'loop', 'mod', 'new',
  'not', 'null', 'of', 'or', 'others', 'out', 'overriding', 'package', 'pragma',
  'private', 'procedure', 'protected', 'raise', 'range', 'record', 'rem', 'renames',
  'requeue', 'return', 'reverse', 'select', 'separate', 'some', 'subtype', 'synchronized',
  'tagged', 'task', 'terminate', 'then', 'type', 'until', 'use', 'when', 'while', 'with',
])

/**
 * 定位 Ada 声明头的结束行：参数/返回类型可跨行，直到出现 `is` 或 `;`。
 * @param {string[]} masked - 掩码行。
 * @param {number} startIdx - 声明起始行索引（0-based）。
 * @returns {number} 出现 `is`/`;` 的行索引；扫描上限 20 行。
 */
function adaHeaderEnd(masked, startIdx) {
  const limit = Math.min(masked.length, startIdx + 20)
  for (let i = startIdx; i < limit; i++) {
    if (/\bis\b/i.test(masked[i]) || masked[i].includes(';')) return i
  }
  return startIdx
}

/**
 * 定位 `type X is record … end record;` 的结束行。
 * @param {string[]} masked - 掩码行。
 * @param {number} startIdx - 声明起始行索引（0-based）。
 * @returns {number} 含 `end record;` 的行索引（找不到时退回起始行）。
 */
function adaRecordEnd(masked, startIdx) {
  for (let i = startIdx; i < masked.length; i++) {
    if (/^\s*end\s+record\s*;/i.test(masked[i])) return i
  }
  return startIdx
}

/**
 * 最近的包/子程序单元名（用于符号 `parent`）。
 * @param {Array<{kind:string, name?:string}>} stack - 当前块栈。
 * @returns {string|null} 单元名；无单元时 null。
 */
function adaEnclosingUnit(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i]
    if (frame.kind === 'unit' && typeof frame.name === 'string') return frame.name
  }
  return null
}

/**
 * 提取 Ada 符号：package（spec/body，含嵌套与点分子单元）、
 * procedure/function（声明单行、body 按 `end` 收尾）、type/subtype、
 * task/protected type 与包级对象声明。
 *
 * 语义边界：`end if/loop/case/record/select/block` 不关闭单元；
 * 匿名 `declare … begin … end;` 块单独记账，避免其 `end;` 提前关闭外层
 * 子程序；`generic` 形式参数（`type T is private;`、`with procedure P;`）
 * 不登记为符号。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表（按行序）。
 */
function extractAda(lines) {
  const { masked } = adaScan(lines)
  const symbols = []
  /** @type {Array<{kind:'unit'|'declare', unitType?:'package'|'subprogram', name?:string, symbolIndex?:number, private?:boolean}>} */
  const stack = []
  let genericPending = false
  // record 组件不是包级对象；`type T is record … end record;` 期间禁用对象检测
  let recordDepth = 0
  for (let i = 0; i < masked.length; i++) {
    const line = masked[i].trim()
    if (!line) continue

    if (/^declare\b/i.test(line)) {
      stack.push({ kind: 'declare' })
      continue
    }
    if (/^private$/i.test(line)) {
      // 包私有部分：其后的声明仍可见于本单元，但不是公开接口
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].kind === 'unit') { stack[j].private = true; break }
      }
      continue
    }
    if (/^end\b/i.test(line)) {
      // 内层控制结构（if/loop/case/record/select/block）不关闭单元
      if (/^end\s+record\b/i.test(line)) recordDepth = Math.max(0, recordDepth - 1)
      if (/^end\s+(if|loop|case|record|select|block)\b/i.test(line)) continue
      // 裸 `end;` 关闭的是最近的匿名 declare 块（若有），不关闭外层单元
      const named = /^end\s+[A-Za-z]/i.test(line)
      const top = stack[stack.length - 1]
      if (!named && top && top.kind === 'declare') {
        stack.pop()
        continue
      }
      // 命名 end 属于单元；防御性清掉其上方残留的 declare
      while (stack.length > 0 && stack[stack.length - 1].kind === 'declare') stack.pop()
      const frame = stack.pop()
      if (frame && frame.kind === 'unit' && typeof frame.symbolIndex === 'number') {
        symbols[frame.symbolIndex].endLine = i + 1
      }
      continue
    }
    if (/^generic\b/i.test(line)) {
      genericPending = true
      continue
    }
    if (/\brecord\b/i.test(line) && !/\bnull\s+record\b/i.test(line)) recordDepth++

    const pkg = /^package\s+(body\s+)?([A-Za-z][\w.]*)\b/i.exec(line)
    if (pkg) {
      const headerEnd = adaHeaderEnd(masked, i)
      const header = masked.slice(i, headerEnd + 1).join(' ')
      const isBody = Boolean(pkg[1]) || /\bis\b/i.test(header)
      genericPending = false
      if (!isBody || /\brenames\b/i.test(header)) continue
      const parent = adaEnclosingUnit(stack)
      symbols.push({
        name: pkg[2],
        kind: 'class',
        line: i + 1,
        endLine: headerEnd + 1,
        exported: !stack.some(frame => frame.kind === 'unit' && frame.private === true),
        ...(parent ? { parent } : {}),
      })
      stack.push({ kind: 'unit', unitType: 'package', name: pkg[2], symbolIndex: symbols.length - 1 })
      continue
    }

    const sub = /^(?:overriding\s+|not\s+overriding\s+)?(procedure|function)\s+([A-Za-z]\w*)\b/i.exec(line)
    if (sub) {
      const headerEnd = adaHeaderEnd(masked, i)
      const headLine = masked[headerEnd]
      const header = masked.slice(i, headerEnd + 1).join(' ')
      const parent = adaEnclosingUnit(stack)
      const exported = !stack.some(frame => frame.kind === 'unit' && frame.private === true)
      // 表达式函数 `is (…)`、独立体 `is separate` 与 `renames` 没有 end
      const bodyLike = /\bis\b/i.test(headLine)
        && !/\bis\s*(\(|separate\b)/i.test(headLine)
        && !/\brenames\b/i.test(header)
      genericPending = false
      if (bodyLike && /\bend\b/i.test(headLine)) {
        // 单行 body：声明与 end 同一行，无需入栈
        symbols.push({
          name: sub[2], kind: 'function', line: i + 1, endLine: headerEnd + 1,
          exported, ...(parent ? { parent } : {}),
        })
        continue
      }
      symbols.push({
        name: sub[2],
        kind: 'function',
        line: i + 1,
        endLine: headerEnd + 1,
        exported,
        ...(parent ? { parent } : {}),
      })
      if (bodyLike) {
        stack.push({ kind: 'unit', unitType: 'subprogram', name: sub[2], symbolIndex: symbols.length - 1 })
      }
      continue
    }

    if (genericPending) continue

    const typeMatch = /^(?:task|protected)\s+type\s+([A-Za-z]\w*)\b/i.exec(line)
      ?? /^type\s+([A-Za-z]\w*)\b/i.exec(line)
      ?? /^subtype\s+([A-Za-z]\w*)\b/i.exec(line)
    if (typeMatch) {
      const headerEnd = adaHeaderEnd(masked, i)
      const header = masked.slice(i, headerEnd + 1).join(' ')
      const isRecord = /\brecord\b/i.test(header) && !/\bnull\s+record\b/i.test(header)
      const endIdx = isRecord ? adaRecordEnd(masked, headerEnd) : headerEnd
      symbols.push({
        name: typeMatch[1],
        kind: 'type',
        line: i + 1,
        endLine: endIdx + 1,
        exported: !stack.some(frame => frame.kind === 'unit' && frame.private === true),
      })
      continue
    }

    // 包级对象声明（常量/变量）；子程序体与 declare 块内的局部对象不登记
    const innermost = stack[stack.length - 1]
    const packageLevel = !innermost
      || (innermost.kind === 'unit' && innermost.unitType === 'package')
    if (packageLevel && recordDepth === 0) {
      const object = /^([A-Za-z]\w*)\s*:\s*(?:aliased\s+)?(?:constant\s+)?[A-Za-z]/.exec(line)
      if (object && !ADA_KEYWORDS.has(object[1].toLowerCase())) {
        symbols.push({
          name: object[1],
          kind: 'variable',
          line: i + 1,
          endLine: i + 1,
          exported: !stack.some(frame => frame.kind === 'unit' && frame.private === true),
        })
      }
    }
  }
  // 未闭合单元（截断/异常语法）保守延伸到文件尾
  for (const frame of stack) {
    if (frame.kind === 'unit' && typeof frame.symbolIndex === 'number') {
      symbols[frame.symbolIndex].endLine = lines.length
    }
  }
  return symbols
}

/**
 * Verilog/SystemVerilog 的注释/字符串屏蔽（双视图）。
 *
 * `//` 行注释与 `/* … *\/` 块注释在两个视图里都置空；字符串只在 `masked`
 * 视图中置空（保留引号位置），`code` 视图保留字符串内容，供 `` `include ``
 * 提取路径使用。Verilog 的字符串不支持跨行（未闭合的引号按行尾结束），
 * 因此不需要跨行状态。
 * @param {string[]} lines - 代码行。
 * @returns {{code:string[], masked:string[]}} 去注释原行与等长掩码行。
 */
export function verilogScan(lines) {
  const code = []
  const masked = []
  let inBlock = false
  for (const raw of lines) {
    let visible = ''
    let blank = ''
    let inString = false
    let escaped = false
    let i = 0
    while (i < raw.length) {
      const ch = raw[i]
      const next = raw[i + 1]
      if (inBlock) {
        if (ch === '*' && next === '/') {
          visible += '  '
          blank += '  '
          inBlock = false
          i += 2
        } else {
          visible += ' '
          blank += ' '
          i++
        }
        continue
      }
      if (inString) {
        if (escaped) {
          visible += ch
          blank += ' '
          escaped = false
        } else if (ch === '\\') {
          visible += ' '
          blank += ' '
          escaped = true
        } else if (ch === '"') {
          visible += '"'
          blank += '"'
          inString = false
        } else {
          visible += ch
          blank += ' '
        }
        i++
        continue
      }
      if (ch === '/' && next === '/') {
        const padding = raw.length - i
        visible += ' '.repeat(padding)
        blank += ' '.repeat(padding)
        break
      }
      if (ch === '/' && next === '*') {
        visible += '  '
        blank += '  '
        inBlock = true
        i += 2
        continue
      }
      if (ch === '"') {
        inString = true
        visible += '"'
        blank += '"'
        i++
        continue
      }
      visible += ch
      blank += ch
      i++
    }
    code.push(visible)
    masked.push(blank)
  }
  return { code, masked }
}

/** Verilog/SystemVerilog 关键字（禁止被误识别为声明名）。 */
const VERILOG_KEYWORDS = new Set([
  'module', 'endmodule', 'macromodule', 'interface', 'endinterface',
  'package', 'endpackage', 'class', 'endclass', 'program', 'endprogram',
  'function', 'endfunction', 'task', 'endtask', 'typedef', 'parameter',
  'localparam', 'import', 'export', 'input', 'output', 'inout', 'ref',
  'logic', 'bit', 'byte', 'int', 'integer', 'shortint', 'longint', 'real',
  'realtime', 'time', 'string', 'void', 'automatic', 'static', 'virtual',
  'pure', 'extern', 'local', 'protected', 'begin', 'end', 'generate',
  'endgenerate', 'genvar', 'if', 'else', 'for', 'foreach', 'while', 'case',
  'endcase', 'return', 'assign', 'always', 'always_comb', 'always_ff',
  'always_latch', 'initial', 'final',
])

/** 函数/任务声明前的修饰符（可叠加，顺序不限）。 */
const VERILOG_SUB_QUALIFIERS = /^(?:(?:static|automatic|virtual|extern|pure|local|protected)\s+)*/

/** 可承载符号的容器块类型（函数/任务不算容器）。 */
const VERILOG_CONTAINERS = new Set(['module', 'interface', 'package', 'class', 'program'])

/**
 * 定位 Verilog 声明头的结束行：`;` 且圆/方/花括号均已配平。
 * 参数列表、typedef 的 enum/struct 体都可跨行，成员体内的 `;` 不计终结。
 * @param {string[]} masked - 掩码行。
 * @param {number} startIdx - 声明起始行索引（0-based）。
 * @param {number} [maxScan] - 最大扫描行数（默认 60）。
 * @returns {number} 终结行索引；未找到时退回起始行。
 */
function verilogTerminator(masked, startIdx, maxScan = 60) {
  let paren = 0
  let brace = 0
  let bracket = 0
  const limit = Math.min(masked.length, startIdx + maxScan)
  for (let i = startIdx; i < limit; i++) {
    for (const ch of masked[i]) {
      if (ch === '(') paren++
      else if (ch === ')') paren = Math.max(0, paren - 1)
      else if (ch === '{') brace++
      else if (ch === '}') brace = Math.max(0, brace - 1)
      else if (ch === '[') bracket++
      else if (ch === ']') bracket = Math.max(0, bracket - 1)
      else if (ch === ';' && paren === 0 && brace === 0 && bracket === 0) return i
    }
  }
  return startIdx
}

/**
 * 拼接声明头并压缩空白（跨行声明的名称/类型解析基准）。
 * @param {string[]} masked - 掩码行。
 * @param {number} startIdx - 起始行索引。
 * @param {number} endIdx - 终结行索引。
 * @returns {string} 单行声明头。
 */
function verilogHeader(masked, startIdx, endIdx) {
  return masked.slice(startIdx, endIdx + 1).join(' ').replace(/\s+/g, ' ').trim()
}

/** 各类块对应的结束关键字（单行块识别用）。 */
const VERILOG_END_WORDS = {
  module: 'endmodule',
  interface: 'endinterface',
  package: 'endpackage',
  class: 'endclass',
  program: 'endprogram',
  function: 'endfunction',
  task: 'endtask',
}

/**
 * 判断声明头结束行的 `;` 之后是否已在同一行收尾（`module m; endmodule`、
 * `function int f; return 1; endfunction` 这类单行块）。
 * @param {string[]} masked - 掩码行。
 * @param {number} endIdx - 声明头终结行索引。
 * @param {string} type - 块类型。
 * @returns {boolean} 同一行是否出现对应 `end*` 关键字。
 */
function verilogClosesInline(masked, endIdx, type) {
  const line = masked[endIdx] ?? ''
  const semicolon = line.indexOf(';')
  if (semicolon < 0) return false
  const endWord = VERILOG_END_WORDS[type]
  if (!endWord) return false
  return new RegExp(`\\b${endWord}\\b`).test(line.slice(semicolon + 1))
}

/**
 * 从 `function`/`task` 关键字之后的文本解析名称与限定作用域。
 *
 * 支持返回类型（`function automatic int unsigned f(...)`）、无参数形式
 * （`function int f;`）与类外定义（`function void C::f(...)` → name `f`,
 * scope `C`）；构造器 `function new(...)` 保持原名。
 * @param {string} text - 关键字之后的声明头文本（可含结尾 `;`）。
 * @returns {{name:string, scope:string}|null} 解析结果；无法识别时为 null。
 */
function verilogSubName(text) {
  const rest = text.replace(/^\s*(?:(?:automatic|static)\s+)+/, '')
  const paren = rest.indexOf('(')
  const semicolon = rest.indexOf(';')
  let head = rest
  if (paren >= 0 && (semicolon < 0 || paren < semicolon)) head = rest.slice(0, paren)
  else if (semicolon >= 0) head = rest.slice(0, semicolon)
  const m = /([A-Za-z_]\w*(?:\s*::\s*[A-Za-z_]\w*)*)\s*$/.exec(head.trim())
  if (!m) return null
  const parts = m[1].split('::').map(part => part.trim())
  const name = parts[parts.length - 1]
  if (!name || VERILOG_KEYWORDS.has(name)) return null
  return { name, scope: parts.slice(0, -1).join('::') }
}

/**
 * 提取 Verilog/SystemVerilog 符号。
 *
 * 覆盖的声明：
 * - `module` / `interface` / `program` / `package` / `class`（含
 *   `virtual class`、`interface class`）作为容器，分别以对应 `end*`
 *   收尾，嵌套容器带 `parent`；
 * - `function` / `task`（含 `automatic`/`static`/`virtual`/`local` 等
 *   修饰与类外 `C::f` 定义），体内到 `endfunction`/`endtask` 收尾；
 *   `extern`/`pure virtual` 原型只登记声明头，不进入块栈；
 * - `typedef`（含 enum/struct/union 体，别名取最后一个标识符）；
 * - 容器内的 `parameter`/`localparam`（按 `name =` 提取，`localparam`
 *   非导出）与 `` `define `` 宏（variable）。
 *
 * 一个文件可包含多个模块（Verilog 常见写法），全部登记。函数/任务在
 * class/interface 内或带 `C::` 限定名时为 method，其余为 function。
 * @param {string[]} lines - 代码行。
 * @returns {SymbolInfo[]} 符号列表（按行序）。
 */
function extractVerilog(lines) {
  const { masked } = verilogScan(lines)
  const symbols = []
  /** @type {Array<{type:string, name:string, symbolIndex:number, headerEnd:number}>} */
  const stack = []
  // `define 的续行（反斜杠结尾）不参与解析，避免宏体里的关键字产生假符号
  let macroContinuation = false

  /** 关闭栈顶尚未收尾的 function/task 原型（按声明头结束）。 */
  const closePendingSub = () => {
    const top = stack[stack.length - 1]
    if (!top || (top.type !== 'function' && top.type !== 'task')) return
    symbols[top.symbolIndex].endLine = Math.max(symbols[top.symbolIndex].line, top.headerEnd)
    stack.pop()
  }

  /** 最近容器块的名称（class/interface/module/package/program）。 */
  const enclosingContainer = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (VERILOG_CONTAINERS.has(stack[i].type)) return stack[i]
    }
    return null
  }

  /**
   * 登记一个容器或子程序符号。
   * @param {string} type - 块类型（module/interface/package/class/program/function/task）。
   * @param {string} name - 符号名。
   * @param {number} startLine - 起始行（1-based）。
   * @param {number} headerEnd - 声明头结束行（1-based）。
   * @param {string} [parent] - 所属容器名。
   * @param {string} [kind] - 符号种类（默认 class）。
   * @param {boolean} [exported] - 是否导出（默认 true）。
   * @returns {number} 符号在数组中的下标。
   */
  const pushDecl = (type, name, startLine, headerEnd, parent = '', kind = 'class', exported = true) => {
    /** @type {object} */
    const symbol = { name, kind, line: startLine, endLine: headerEnd, exported }
    if (parent) symbol.parent = parent
    symbols.push(symbol)
    return symbols.length - 1
  }

  for (let i = 0; i < masked.length; i++) {
    const rawLine = masked[i]
    const line = rawLine.trim()
    if (line === '') continue
    if (macroContinuation) {
      macroContinuation = rawLine.trimEnd().endsWith('\\')
      continue
    }

    const endMatch = /^end(module|interface|package|class|function|task|program)\b/.exec(line)
    if (endMatch) {
      const want = endMatch[1]
      const sub = want === 'function' || want === 'task'
      for (let j = stack.length - 1; j >= 0; j--) {
        const frame = stack[j]
        const matched = sub ? frame.type === 'function' || frame.type === 'task' : frame.type === want
        if (!matched) continue
        symbols[frame.symbolIndex].endLine = Math.max(symbols[frame.symbolIndex].line, i + 1)
        stack.length = j
        break
      }
      continue
    }

    const moduleMatch = /^(?:macromodule\s+)?module\s+(?:automatic\s+|static\s+)?([A-Za-z_]\w*)\b/.exec(line)
    const classMatch = /^(?:(?:virtual|interface)\s+)?class\s+(?:automatic\s+|static\s+)?([A-Za-z_]\w*)\b/.exec(line)
    const interfaceMatch = /^interface\s+(?!class\b)(?:automatic\s+|static\s+)?([A-Za-z_]\w*)\b/.exec(line)
    const packageMatch = /^package\s+(?:automatic\s+|static\s+)?([A-Za-z_]\w*)\b/.exec(line)
    const programMatch = /^program\s+(?:automatic\s+|static\s+)?([A-Za-z_]\w*)\b/.exec(line)
    const container = moduleMatch ?? classMatch ?? interfaceMatch ?? packageMatch ?? programMatch
    if (container) {
      closePendingSub()
      const type = moduleMatch ? 'module'
        : classMatch ? 'class'
          : interfaceMatch ? 'interface'
            : packageMatch ? 'package' : 'program'
      const endIdx = verilogTerminator(masked, i)
      const headerEnd = endIdx + 1
      const parentFrame = enclosingContainer()
      const outerParent = parentFrame ? parentFrame.name : ''
      const index = pushDecl(
        type,
        container[1],
        i + 1,
        headerEnd,
        outerParent,
        type === 'interface' ? 'interface' : 'class',
      )
      if (!verilogClosesInline(masked, endIdx, type)) {
        stack.push({ type, name: container[1], symbolIndex: index, headerEnd })
      }
      // 声明头内部（`#(...)` 参数、端口列表）不参与后续语句解析
      i = endIdx
      continue
    }

    const qualifierPrefix = VERILOG_SUB_QUALIFIERS.exec(line)?.[0] ?? ''
    const subLine = line.slice(qualifierPrefix.length)
    const subMatch = /^(function|task)\b/.exec(subLine)
    if (subMatch) {
      closePendingSub()
      const keyword = subMatch[1]
      const endIdx = verilogTerminator(masked, i)
      const header = verilogHeader(masked, i, endIdx)
      const headerNoQual = header.replace(VERILOG_SUB_QUALIFIERS, '')
      const parsed = verilogSubName(headerNoQual.slice(keyword.length))
      if (!parsed) continue
      const parentFrame = enclosingContainer()
      const parent = parsed.scope || (parentFrame ? parentFrame.name : '')
      const isMethod = Boolean(parsed.scope)
        || parentFrame?.type === 'class' || parentFrame?.type === 'interface'
      const exported = !/\b(?:local|protected)\b/.test(qualifierPrefix)
      const prototype = /\bextern\b/.test(qualifierPrefix)
        || (/\bpure\b/.test(qualifierPrefix) && /\bvirtual\b/.test(qualifierPrefix))
      const index = pushDecl(
        keyword,
        parsed.name,
        i + 1,
        endIdx + 1,
        parent,
        isMethod ? 'method' : 'function',
        exported,
      )
      if (!prototype && !verilogClosesInline(masked, endIdx, keyword)) {
        stack.push({ type: keyword, name: parsed.name, symbolIndex: index, headerEnd: endIdx + 1 })
      }
      i = endIdx
      continue
    }

    if (/^typedef\b/.test(line)) {
      const endIdx = verilogTerminator(masked, i)
      const header = verilogHeader(masked, i, endIdx).replace(/;\s*$/, '')
      const nameMatch = /([A-Za-z_]\w*)\s*$/.exec(header)
      if (!nameMatch || VERILOG_KEYWORDS.has(nameMatch[1])) continue
      const parentFrame = enclosingContainer()
      pushDecl('typedef', nameMatch[1], i + 1, endIdx + 1, parentFrame ? parentFrame.name : '', 'type')
      i = endIdx
      continue
    }

    const paramMatch = /^(localparam|parameter)\b/.exec(line)
    if (paramMatch) {
      const endIdx = verilogTerminator(masked, i)
      const rest = verilogHeader(masked, i, endIdx).replace(/^(?:localparam|parameter)\b/, '')
      const isTypeParam = /^\s*type\b/.test(rest)
      const parentFrame = enclosingContainer()
      const parent = parentFrame ? parentFrame.name : ''
      const exported = paramMatch[1] === 'parameter'
      const names = /([A-Za-z_]\w*)\s*=(?!=)/g
      let first = true
      let match
      while ((match = names.exec(rest)) !== null) {
        if (VERILOG_KEYWORDS.has(match[1])) continue
        pushDecl('parameter', match[1], i + 1, endIdx + 1, parent, isTypeParam && first ? 'type' : 'variable', exported)
        first = false
      }
      i = endIdx
      continue
    }

    const defineMatch = /^`define\s+([A-Za-z_]\w*)/.exec(line)
    if (defineMatch) {
      pushDecl('define', defineMatch[1], i + 1, i + 1, '', 'variable')
      macroContinuation = rawLine.trimEnd().endsWith('\\')
      continue
    }
  }

  // 未闭合容器/子程序（截断/异常语法）保守延伸到文件尾
  for (const frame of stack) {
    const symbol = symbols[frame.symbolIndex]
    symbol.endLine = Math.max(symbol.endLine, lines.length)
  }
  return symbols
}

/**
 * 从源码提取符号（纯函数入口）。
 * @param {string} code - 源码文本。
 * @param {string} lang - 语言标识（见 schema.js 的 EXTENSION_LANGS）。
 * @returns {SymbolInfo[]} 符号列表；不支持的语言返回空数组。
 */
export function extractSymbols(code, lang) {
  if (typeof code !== 'string' || code.length === 0) return []
  if (lang === 'vue' || lang === 'svelte') return extractJsLike(toLines(scriptBlockText(code)))
  const lines = toLines(code)
  if (lang === 'python') return extractPython(lines)
  if (lang === 'javascript' || lang === 'typescript') return extractJsLike(lines)
  if (lang === 'go') return extractGo(lines)
  if (lang === 'rust') return extractRust(lines)
  if (lang === 'java') return extractJava(lines)
  if (lang === 'csharp') return extractCSharp(lines)
  if (lang === 'kotlin') return extractKotlin(lines)
  if (lang === 'php') return extractPhp(lines)
  if (lang === 'ruby') return extractRuby(lines)
  if (lang === 'swift') return extractSwift(lines)
  if (lang === 'scala') return extractScala(lines)
  if (lang === 'dart') return extractDart(lines)
  if (lang === 'elixir') return extractElixir(lines)
  if (lang === 'lua') return extractLua(lines)
  if (lang === 'zig') return extractZig(lines)
  if (lang === 'gleam') return extractGleam(lines)
  if (lang === 'shell') return extractShell(lines)
  if (lang === 'r') return extractR(lines)
  if (lang === 'julia') return extractJulia(lines)
  if (lang === 'nim') return extractNim(lines)
  if (lang === 'ocaml') return extractOcaml(lines)
  if (lang === 'haskell') return extractHaskell(lines)
  if (lang === 'erlang') return extractErlang(lines)
  if (lang === 'solidity') return extractSolidity(lines)
  if (lang === 'clojure') return extractClojure(lines)
  if (lang === 'hcl') return extractHcl(lines)
  if (lang === 'groovy') return extractGroovy(lines)
  if (lang === 'powershell') return extractPowershell(lines)
  if (lang === 'fortran') return extractFortran(lines)
  if (lang === 'perl') return extractPerl(lines)
  if (lang === 'pascal') return extractPascal(lines)
  if (lang === 'nix') return extractNix(lines)
  if (lang === 'vbnet') return extractVbnet(lines)
  if (lang === 'tcl') return extractTcl(lines)
  if (lang === 'fsharp') return extractFsharp(lines)
  if (lang === 'ada') return extractAda(lines)
  if (lang === 'verilog' || lang === 'systemverilog') return extractVerilog(lines)
  if (lang === 'c' || lang === 'cpp') return extractCpp(lines)
  return []
}
