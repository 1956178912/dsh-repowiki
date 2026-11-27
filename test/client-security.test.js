/**
 * 客户端 Markdown 链接安全回归：协议白名单。
 *
 * 威胁模型：Wiki 正文可能来自 LLM 输出或人工卡片编辑，若直接渲染
 * `[x](javascript:...)`，用户点击即可在面板上下文执行脚本。渲染层必须
 * 只产出 http(s)/mailto/页内锚点链接。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { loadClient, mountLoaded, act } from './lib/dom-harness.mjs'
import { makeCorpusWf } from './lib/corpus-fixture.mjs'

const { Page } = await loadClient()

/**
 * 构造一个只注入一页 Wiki 的 fake remote。
 * @param {string} markdown - 页面内容。
 * @returns {object} wf 桩。
 */
function makeWfWithWiki(markdown) {
  const base = makeCorpusWf()
  const rel = '.dsh-repowiki/wiki/zh/link-security.md'
  return {
    async read(sid, path, range, signal) {
      if (path === rel) {
        return { ok: true, value: { text: markdown, lines: markdown.split('\n').length, offset: 1, eof: true } }
      }
      return base.read(sid, path, range, signal)
    },
    async list(sid, path, signal) {
      const result = await base.list(sid, path, signal)
      if (result.ok && path === '.dsh-repowiki/wiki/zh') {
        result.value.entries = [...result.value.entries,
          { name: 'link-security.md', type: 'file', size: markdown.length }]
      }
      return result
    },
  }
}

test('DOM 集成：Markdown 链接协议白名单（危险链接不生成 a[href]）', async () => {
  const markdown = [
    '---', '{"schemaVersion":1,"title":"链接安全","slug":"link-security","locale":"zh","generatedAt":"2026-11-27"}',
    '---',
    '# 链接安全',
    '',
    '[安全外链](https://example.com/x)',
    '',
    '[锚点](#section)',
    '',
    '[邮件](mailto:a@b.com)',
    '',
    '[坏1](javascript:alert(1)) [坏2](data:text/html;base64,xx) [坏3](file:///etc/passwd)',
    '',
    '[坏4](//evil.example/x) [坏5](vbscript:msgbox)',
    '',
    '## section',
    '',
    '正文。',
  ].join('\n')

  const { container } = await mountLoaded({ Page, wf: makeWfWithWiki(markdown) })
  const wikiTab = [...container.querySelectorAll('button')]
    .find((b) => b.textContent.startsWith('viewWiki'))
  await act(async () => {
    wikiTab.click()
    await new Promise((r) => setTimeout(r, 30))
  })
  const entry = [...container.querySelectorAll('button[aria-label]')]
    .find((b) => b.getAttribute('aria-label') === '链接安全')
  assert.ok(entry, 'Wiki 列表应含链接安全页面')
  await act(async () => {
    entry.click()
    await new Promise((r) => setTimeout(r, 30))
  })

  const safe = container.querySelector('a[href="https://example.com/x"]')
  assert.ok(safe, 'https 链接应正常渲染')
  assert.equal(safe.getAttribute('target'), '_blank')
  assert.equal(safe.getAttribute('rel'), 'noreferrer noopener')

  const anchor = container.querySelector('a[href="#section"]')
  assert.ok(anchor, '页内锚点应正常渲染')
  assert.equal(anchor.getAttribute('target'), null)

  assert.ok(container.querySelector('a[href^="mailto:"]'), 'mailto 链接应允许')

  for (const prefix of ['javascript:', 'data:', 'file:', 'vbscript:', '//']) {
    assert.equal(container.querySelector(`a[href^="${prefix}"]`), null,
      `${prefix} 链接不得生成 a[href]`)
  }
  assert.ok(container.textContent.includes('坏1'), '危险链接文字仍可作为普通文本阅读')
})
