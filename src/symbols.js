/**
 * 零依赖符号提取器（ADR-0001）。
 *
 * 设计目标：为 JS/TS/Python 提取"符号表"级信息（名称、种类、行范围、
 * 是否导出），供 index.json 建立符号级检索与交叉引用。不做完整 AST：
 * 采用"行级关键字匹配 + 括号/缩进块匹配"的轻量解析，覆盖语言主流
 * 定义形态；无法 parse 的边缘语法安静跳过，绝不产出错误符号。
 *
 * 纯函数：输入代码字符串与语言，输出符号数组，无任何副作用，便于
 * 直接做单元测试。
 */

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
    const indent = m.groups.indent
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
      // 若上一个类仍开启且本行缩进不更深，则其块已结束
      if (currentClass && indent <= currentClass.indent) currentClass = null
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
 * 从源码提取符号（纯函数入口）。
 * @param {string} code - 源码文本。
 * @param {string} lang - 语言标识（见 schema.js 的 EXTENSION_LANGS）。
 * @returns {SymbolInfo[]} 符号列表；不支持的语言返回空数组。
 */
export function extractSymbols(code, lang) {
  if (typeof code !== 'string' || code.length === 0) return []
  const lines = toLines(code)
  if (lang === 'python') return extractPython(lines)
  if (lang === 'javascript' || lang === 'typescript') return extractJsLike(lines)
  return []
}
