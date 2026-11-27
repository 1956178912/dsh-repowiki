// @ts-check
/**
 * 单文件组件（Vue SFC / Svelte）的脚本块提取（纯函数）。
 *
 * 索引器只理解行级脚本语法：把 `<script>` / `<script setup>` /
 * `<script context="module">` 块内的内容按原行号保留，其余行替换为空行，
 * 再交给 JS/TS 的符号与 import 提取器。行号因此与源文件一致，卡片与
 * 引用可直接定位。
 *
 * 语义边界：只读脚本块；`<template>` / `<style>` 中的绑定与组件使用
 * 不产生符号或依赖边（它们不是 import）。注释里的 `<script>` 不做特殊
 * 处理（SFC 顶层罕见，误判只影响该行）。
 */

/**
 * 提取单文件组件的脚本块内容，保持行号对齐。
 * @param {string} code - `.vue` / `.svelte` 源文本。
 * @returns {string} 仅含脚本块内容的文本（块外为空行）。
 */
export function scriptBlockText(code) {
  if (typeof code !== 'string' || code.length === 0) return ''
  const lines = code.replace(/\r\n?/g, '\n').split('\n')
  /** @type {string[]} */
  const out = []
  let inScript = false
  for (const line of lines) {
    if (!inScript) {
      const open = /<script\b[^>]*>/i.exec(line)
      if (!open) {
        out.push('') // 块外（含 template/style）不参与脚本解析
        continue
      }
      inScript = true
      const rest = line.slice(open.index + open[0].length)
      const close = /<\/script>/i.exec(rest)
      if (close) {
        out.push(rest.slice(0, close.index))
        inScript = false
      } else {
        out.push(rest)
      }
      continue
    }
    const close = /<\/script>/i.exec(line)
    if (close) {
      out.push(line.slice(0, close.index))
      inScript = false
    } else {
      out.push(line)
    }
  }
  return out.join('\n')
}
