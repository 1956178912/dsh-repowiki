/**
 * 覆盖率门禁：运行 node:test 覆盖率并解析汇总，低于阈值即失败。
 * 零依赖（node:child_process + node:fs）。
 */

import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'

/** 覆盖率阈值（行 / 分支 / 函数）。 */
export const THRESHOLDS = Object.freeze({ lines: 95, branches: 85, functions: 85 })

/**
 * 解析 node:test 覆盖率汇总行。
 * @param {string} output - 合并后的 stdout/stderr。
 * @returns {{lines:number, branches:number, functions:number}|null} 汇总；未找到返回 null。
 */
export function parseCoverage(output) {
  const match = /all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/.exec(String(output))
  if (!match) return null
  return {
    lines: Number(match[1]),
    branches: Number(match[2]),
    functions: Number(match[3]),
  }
}

/**
 * 判定汇总是否达标。
 * @param {{lines:number, branches:number, functions:number}} summary - 覆盖率。
 * @param {object} [thresholds] - 阈值。
 * @returns {string[]} 未达标项描述（空数组表示通过）。
 */
export function checkThresholds(summary, thresholds = THRESHOLDS) {
  const failures = []
  for (const key of ['lines', 'branches', 'functions']) {
    if (summary[key] < thresholds[key]) {
      failures.push(`${key} ${summary[key]}% < ${thresholds[key]}%`)
    }
  }
  return failures
}

/**
 * 直接入口：运行测试并校验。
 * @returns {void}
 */
function main() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const tests = readdirSync(path.join(here, '..', 'test'))
    .filter(name => name.endsWith('.test.js'))
    .map(name => path.join(here, '..', 'test', name))
  const result = spawnSync(process.execPath, ['--test', '--experimental-test-coverage', ...tests], {
    encoding: 'utf8',
  })
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const failed = result.status !== 0
  const summary = parseCoverage(output)
  if (!summary) {
    console.error('coverage: could not find the "all files" summary row')
    process.exit(1)
  }
  console.log(`coverage: lines ${summary.lines}%, branches ${summary.branches}%, functions ${summary.functions}%`)
  const failures = checkThresholds(summary)
  if (failures.length > 0 || failed) {
    for (const failure of failures) console.error(`coverage gate failed: ${failure}`)
    if (failed) console.error('coverage gate failed: test run exited non-zero')
    process.exit(1)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
