/**
 * 仓库密钥扫描（零依赖）：扫描 git 跟踪的文本文件，发现常见密钥模式即失败。
 * 只做高置信度模式，避免把示例占位符当作真实泄露。
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'

/** 高置信度密钥模式（label + 正则）。 */
export const SECRET_PATTERNS = [
  { label: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { label: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { label: 'openai-key', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { label: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
]

/** 跳过的路径（锁文件/测试夹具/构建产物）。 */
const SKIP_PREFIXES = [
  'node_modules/',
  'package-lock.json',
  'test/fixtures/',
  '.dsh-repowiki/',
  '.trae/',
]

/**
 * 扫描一段文本。
 * @param {string} text - 文本。
 * @returns {string[]} 命中的模式标签。
 */
export function scanText(text) {
  const hits = []
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.re.test(text)) hits.push(pattern.label)
  }
  return hits
}

/**
 * 粗略判断二进制文件（含 NUL 字节）。
 * @param {Buffer} buffer - 文件内容。
 * @returns {boolean} 二进制。
 */
function looksBinary(buffer) {
  const sample = buffer.subarray(0, 4096)
  return sample.includes(0)
}

/**
 * 直接入口：扫描 git 跟踪文件。
 * @returns {void}
 */
function main() {
  const listed = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  const files = listed.split('\0').filter(Boolean)
  const findings = []
  for (const rel of files) {
    if (SKIP_PREFIXES.some(prefix => rel === prefix || rel.startsWith(prefix))) continue
    try {
      if (statSync(rel).size > 1024 * 1024) continue
      const buffer = readFileSync(rel)
      if (looksBinary(buffer)) continue
      for (const label of scanText(buffer.toString('utf8'))) {
        findings.push(`${rel}: ${label}`)
      }
    } catch {
      // 已删除/不可读的跟踪文件跳过
    }
  }
  if (findings.length > 0) {
    console.error('secret scan failed:')
    for (const finding of findings) console.error(`  ${finding}`)
    process.exit(1)
  }
  console.log(`secret scan: ${files.length} tracked file(s) clean`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
