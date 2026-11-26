#!/usr/bin/env node
/**
 * 宿主主题令牌自检（本地开发工具，非运行时依赖）。
 *
 * 动机：client.js 使用 --dsw-alias-* 官方令牌，这些令牌属宿主私有 API，
 * 升级后可能被改名或删除。本脚本直接解析本机 app.asar，提取官方 CSS 中
 * 的令牌定义，核对 client.js 引用的每一个令牌都存在且带深色变体。
 *
 * 用法：
 *   node scripts/verify-host-tokens.mjs            # 人类可读报告
 *   node scripts/verify-host-tokens.mjs --json     # 机器可读（CI 集成用）
 *
 * 退出码：
 *   0 = 全部令牌存在且带深色重定义
 *   1 = 有令牌缺失或无深色变体（需同步 client.js）
 *   3 = 跳过（本机找不到 app.asar，如 CI 环境）
 *
 * 可用 DSH_APP_ASAR=/path/to/app.asar 指定非默认安装位置。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT = path.join(__dirname, '..', 'client.js')

// 各平台常见的 app.asar 位置（找不到即跳过）
const CANDIDATES = [
  process.env.DSH_APP_ASAR,
  '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar',
  '/Applications/DeepSeek.app/Contents/Resources/app.asar',
  '/opt/deepseek-harness/resources/app.asar',
  '/usr/lib/deepseek-harness/resources/app.asar',
  'C:\\Program Files\\DeepSeek Harness\\resources\\app.asar',
  'C:\\Program Files (x86)\\DeepSeek Harness\\resources\\app.asar',
].filter(Boolean)

/** 读取 asar 头并返回 { base, files: [{path,size,offset}] }；失败抛错。 */
export function readAsarIndex(p) {
  const fd = fs.openSync(p, 'r')
  const sizeBuf = Buffer.alloc(8)
  fs.readSync(fd, sizeBuf, 0, 8, 0)
  const headerSize = sizeBuf.readUInt32LE(4)
  const hb = Buffer.alloc(headerSize)
  fs.readSync(fd, hb, 0, headerSize, 8)
  const s = hb.toString('utf8')
  const header = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1))
  const files = []
  const walk = (node, prefix) => {
    for (const [k, v] of Object.entries(node.files || {})) {
      const fp = (prefix ? prefix + '/' : '') + k
      if (v.files) walk(v, fp)
      else files.push({ path: fp, size: v.size, offset: Number(v.offset) })
    }
  }
  walk(header, '')
  return { base: 8 + headerSize, files }
}

/** 提取 asar 内一个文件的内容。 */
export function readAsarFile(p, meta, base) {
  const fd = fs.openSync(p, 'r')
  const buf = Buffer.alloc(meta.size)
  fs.readSync(fd, buf, 0, meta.size, base + Number(meta.offset))
  fs.closeSync(fd)
  return buf.toString('utf8')
}

/** 从 client.js 收集实际引用的 --dsw-* 令牌名（自维护，无需手工清单）。 */
function collectClientTokens() {
  const src = fs.readFileSync(CLIENT, 'utf8')
  const names = new Set()
  // 令牌须以逗号/括号/空白收尾，避免把文档注释里的 var(--dsw-alias-*) 通配写法误当令牌
  for (const m of src.matchAll(/var\(\s*(--dsw-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?=[,)\s])/g)) names.add(m[1])
  return [...names].sort()
}

/** 定位本机 app.asar（找不到返回 null，供测试复用）。 */
export function findAsarPath() {
  return CANDIDATES.find((p) => { try { return fs.statSync(p).isFile() } catch { return false } }) || null
}

function main() {
  const asarPath = findAsarPath()
  const asJson = process.argv.includes('--json')
  if (!asarPath) {
    if (asJson) console.log(JSON.stringify({ status: 'skip', reason: '本机未找到 app.asar' }))
    else console.log('跳过：本机未找到 app.asar（CI 环境属正常；本机自检请确认 DSH 安装路径或设 DSH_APP_ASAR）')
    return 3
  }

  const { base, files } = readAsarIndex(asarPath)
  // 官方令牌定义源：主题包 src/styles（design-platform.css 的 264 个 alias
  // 令牌 + base.css 的 radius 等尺寸令牌）
  const themeCss = files.filter((f) => /dsh-client-ui-theme\/src\/styles\/.*\.css$/.test(f.path))
  const allDefs = new Map() // 令牌名 -> 定义次数
  const darkSelector = 'body[data-ds-dark-theme]'
  let darkSeen = false
  for (const f of themeCss) {
    const text = readAsarFile(asarPath, f, base)
    for (const m of text.matchAll(/(--dsw-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\s*:/g)) {
      allDefs.set(m[1], (allDefs.get(m[1]) || 0) + 1)
    }
    if (text.includes(darkSelector)) darkSeen = true
  }
  const tokens = collectClientTokens()
  const missing = tokens.filter((t) => !allDefs.has(t))
  // 两类规则：--dsw-alias-* 为颜色/语义令牌，需 ≥2 处定义（浅色 + 深色重定义）；
  // 其余 --dsw-*（如 --dsw-radius-*）为主题无关尺寸令牌，存在即可。
  const isAlias = (t) => t.startsWith('--dsw-alias-')
  const noDark = tokens.filter((t) => isAlias(t) && (allDefs.get(t) || 0) < 2)
  const flatTokens = tokens.filter((t) => !isAlias(t))

  if (asJson) {
    console.log(JSON.stringify({
      status: missing.length === 0 && noDark.length === 0 ? 'pass' : 'fail',
      asar: asarPath, cssFiles: themeCss.length, clientTokens: tokens,
      missing, noDark, darkSelectorSeen: darkSeen,
    }, null, 1))
  } else {
    console.log(`宿主：${asarPath}`)
    console.log(`主题 CSS：${themeCss.length} 个（dsh-client-ui-theme/src/styles）`)
    console.log(`深色选择器 ${darkSelector}：${darkSeen ? '存在' : '未发现'}`)
    console.log(`client.js 引用令牌 ${tokens.length} 个（alias 颜色类 ${tokens.filter(isAlias).length} + 尺寸类 ${flatTokens.length}）`)
    for (const t of tokens) {
      const n = allDefs.get(t) || 0
      const mark = n === 0 ? '✖ 缺失'
        : (isAlias(t) && n < 2) ? '△ 无深色变体' : '✓'
      console.log(`  ${mark}  ${t}（${n} 处定义）`)
    }
    if (missing.length) console.log(`\n缺失令牌：${missing.join(', ')}`)
    if (noDark.length) console.log(`无深色变体：${noDark.join(', ')}`)
    if (!darkSeen) console.log('\n警告：未发现深色选择器，深色适配前提存疑')
    console.log(missing.length === 0 && noDark.length === 0
      ? '\n结论：全部令牌存在；alias 令牌带深色重定义 ✓'
      : '\n结论：存在令牌漂移，需同步 client.js ✗')
  }
  return missing.length === 0 && noDark.length === 0 ? 0 : 1
}

// 仅作为脚本直接运行时执行（被测试 import 时不副作用退出——否则会在
// 测试进程里 process.exit，本地假通过、CI 整文件失败）
const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntry) {
  try {
    process.exit(main())
  } catch (e) {
    console.error(`verify-host-tokens 失败：${e && e.message}`)
    process.exit(1)
  }
}
