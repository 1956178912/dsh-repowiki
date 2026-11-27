// @ts-check
/**
 * 单文件组件（Vue SFC / Svelte / Astro）的脚本块提取（纯函数）。
 *
 * 索引器只理解行级脚本语法：把 `<script>` / `<script setup>` /
 * `<script context="module">` 块内的内容按原行号保留，其余行替换为空行，
 * 再交给 JS/TS 的符号与 import 提取器。行号因此与源文件一致，卡片与
 * 引用可直接定位。Astro 另外把顶部 `--- … ---` frontmatter 视为脚本区。
 *
 * 语义边界：只读脚本块；`<template>` / `<style>` / Astro 模板中的绑定与
 * 组件使用不产生符号或依赖边（它们不是 import）。注释里的 `<script>` 不做
 * 特殊处理（SFC 顶层罕见，误判只影响该行）。
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

/**
 * 提取 Astro 组件的脚本区（frontmatter 与 `<script>` 块），保持行号对齐。
 *
 * frontmatter 是文件开头首个非空行 `---` 到下一个独立 `---` 之间的
 * TS/JS；未闭合时按到文件尾处理（保守，不会把模板误当脚本）。模板与
 * `<style>` 不产生符号或依赖边。
 * @param {string} code - `.astro` 源文本。
 * @returns {string} 仅含 frontmatter 与 `<script>` 块内容的文本（其余为空行）。
 */
export function astroBlockText(code) {
  if (typeof code !== 'string' || code.length === 0) return ''
  const lines = code.replace(/\r\n?/g, '\n').split('\n')
  /** @type {string[]} */
  const out = lines.map(() => '')
  let frontStart = -1
  let frontEnd = -1
  let first = 0
  while (first < lines.length && lines[first].trim() === '') first++
  if (lines[first]?.trim() === '---') {
    frontStart = first
    for (let i = first + 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        frontEnd = i
        break
      }
      out[i] = lines[i]
    }
    if (frontEnd < 0) frontEnd = lines.length // 未闭合：保守延伸到文件尾
  }
  let inScript = false
  for (let i = 0; i < lines.length; i++) {
    // frontmatter 区域已经按脚本处理，避免字符串里的 <script> 干扰
    if (i >= frontStart && i <= frontEnd) continue
    if (!inScript) {
      const open = /<script\b[^>]*>/i.exec(lines[i])
      if (!open) continue
      inScript = true
      const rest = lines[i].slice(open.index + open[0].length)
      const close = /<\/script>/i.exec(rest)
      if (close) {
        out[i] = rest.slice(0, close.index)
        inScript = false
      } else {
        out[i] = rest
      }
      continue
    }
    const close = /<\/script>/i.exec(lines[i])
    if (close) {
      out[i] = lines[i].slice(0, close.index)
      inScript = false
    } else {
      out[i] = lines[i]
    }
  }
  return out.join('\n')
}
