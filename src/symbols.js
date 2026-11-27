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
  if (lang === 'c' || lang === 'cpp') return extractCpp(lines)
  return []
}
