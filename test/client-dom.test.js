/**
 * 客户端 DOM 集成回归（真实 React + jsdom + 真实事件，正常路径）。
 *
 * 动机：stub 测试直接调用 props.onClick，绕过了浏览器事件链。用户曾
 * 报告"点击卡片无反应"——要验证 onClick 的事件级接线（React 合成事件
 * 根委托、target 命中、handler 调用），必须用真实 React 把组件渲染进
 * 真实 DOM，再派发真实 click/change 事件。这是唯一能在无 GUI 环境下
 * 复现"用户点击"的手段。
 *
 * 故障注入路径见 test/client-faults.test.js；挂载机制共享自
 * test/lib/dom-harness.mjs；语料 fixture 共享自 corpus-fixture。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { loadClient, mountLoaded, act } from './lib/dom-harness.mjs'
import { makeCorpusWf } from './lib/corpus-fixture.mjs'

const { dom, Page } = await loadClient()

/** 卡片瓦片（排除带 aria-label 的非条目按钮与 hub chip 形态 `path (N)`）。 */
const cardTilesOf = (container) => [...container.querySelectorAll('button[aria-label]')]
  .filter((b) => !['reload', 'viewGrid', 'viewList'].includes(b.getAttribute('aria-label'))
    && !/ \(\d+\)$/.test(b.getAttribute('aria-label')))

test('DOM 集成：真实 React 渲染 + 真实 change 事件装载语料', async () => {
  const { container } = await mountLoaded({ Page })
  const text = container.textContent
  assert.ok(text.includes('statFiles'), 'DOM 中应渲染文件统计')
  assert.ok(text.includes('statCards'), 'DOM 中应渲染卡片统计')
  assert.ok(cardTilesOf(container).length > 0, 'DOM 中应渲染卡片瓦片按钮')
  // 页面根须自管滚动（宿主 mainPanel 为 overflow:hidden 的 flex 列；
  // 缺此声明内容超出即被裁掉、无法滑动——用户反馈的“无法滑动”根因）
  const root = container.querySelector('[aria-label="title"]')
  assert.ok(root, '应渲染带 aria-label 的页面根（外层滚动器）')
  const st = root.style
  assert.equal(st.height, '100%', '外层应 height:100%')
  assert.equal(st.overflowY, 'auto', '外层应 overflow-y:auto')
  assert.equal(st.overflowX, 'hidden', '外层应 overflow-x:hidden')
  assert.equal(st.scrollbarGutter, 'stable', '外层应 scrollbar-gutter:stable')
  assert.ok(st.background.includes('dsw-alias-bg-base'), '页面应自绘底色 bg-base')
  // 内层 960 内容列：顶部留白走官方顶条令牌
  const column = root.firstElementChild
  assert.ok(column, '应存在内层内容列')
  assert.equal(column.style.maxWidth, '960px', '内容列 max-width:960px')
  assert.ok(column.style.paddingTop.includes('dsh-frame-top-clearance'),
    'macOS 顶条留白应走官方 --dsh-frame-top-clearance 令牌')
})

test('DOM 集成：真实 click 事件打开卡片详情（用户动作的端到端复现）', async () => {
  const { container } = await mountLoaded({ Page })
  const tiles = cardTilesOf(container)
  // 先验证至少存在一张已生成卡片（aria-label 为卡片标题，非 pending 形态）
  const generated = tiles.filter((b) => !b.getAttribute('aria-label').includes('(pending)'))
  assert.ok(generated.length > 0, '真实语料下应存在已生成卡片的瓦片')

  let clicked = 0
  for (const tile of generated) {
    await act(async () => {
      tile.click() // 真实 DOM click（React 合成事件根委托）
      await new Promise((r) => setTimeout(r, 30))
    })
    const region = container.querySelector('[role="region"]')
    assert.ok(region, '点击后 DOM 中应出现详情区域')
    clicked++
  }
  console.log(`DOM 集成回归：真实 click 打开 ${clicked} 张已生成卡片详情`)

  // 已生成卡片详情应包含 renderMarkdown 产出的标题（正文章节，非 frontmatter）
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
  const region = container.querySelector('[role="region"]')
  const regionText = region?.textContent ?? ''
  assert.ok(!regionText.includes('"schemaVersion"'), '详情不应残留 frontmatter JSON')
})

test('DOM 集成：详情展示 import 级反向引用（真实语料 edges）', async () => {
  const { container } = await mountLoaded({ Page })
  const schemaTile = cardTilesOf(container).find(b => b.textContent.includes('src/schema.js'))
  assert.ok(schemaTile, '语料应包含 src/schema.js 条目')

  await act(async () => {
    schemaTile.click()
    await new Promise((r) => setTimeout(r, 30))
  })
  const region = container.querySelector('[role="region"]')
  const text = region?.textContent ?? ''
  assert.ok(text.includes('detailReferences'), '详情应展示反向引用标题')
  assert.ok(text.includes('CARD_SCHEMA_VERSION'), '应列出被导入符号')
  assert.ok(text.includes('src/card-schema.js'), '应列出引用方文件')
  assert.ok(!text.includes('"schemaVersion"'), '反引用区不应引入 frontmatter')
})

test('DOM 集成：详情展示 import 级出边（本文件依赖谁）', async () => {
  const { container } = await mountLoaded({ Page })
  const indexerTile = cardTilesOf(container).find(b => b.textContent.includes('src/indexer.js'))
  assert.ok(indexerTile, '语料应包含 src/indexer.js 条目')

  await act(async () => {
    indexerTile.click()
    await new Promise((r) => setTimeout(r, 30))
  })
  const region = container.querySelector('[role="region"]')
  const text = region?.textContent ?? ''
  assert.ok(text.includes('detailImports'), '详情应展示依赖文件标题')
  assert.ok(text.includes('src/symbols.js'), '应列出被依赖文件')
  assert.ok(text.includes('extractSymbols'), '应列出导入符号')
})

test('DOM 集成：详情经 Escape（真实 keydown）关闭、guard 不误触发', async () => {
  const { container } = await mountLoaded({ Page })
  const generated = cardTilesOf(container).filter((b) => !b.getAttribute('aria-label').includes('(pending)'))
  assert.ok(generated.length > 0)
  await act(async () => {
    generated[0].click()
    await new Promise((r) => setTimeout(r, 30))
  })
  assert.ok(container.querySelector('[role="region"]'), '点击后详情存在')
  // 真实 keydown 事件（Escape 由 document 级监听捕获）
  await act(async () => {
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  assert.ok(!container.querySelector('[role="region"]'), 'Escape 后详情应关闭')
  assert.ok(!container.textContent.includes('actionFailed'), '全程不应出现事件兜底错误消息')
})

test('DOM 集成：详情打开聚焦关闭按钮、Escape 关闭后焦点归还触发瓦片', async () => {
  const { container } = await mountLoaded({ Page })
  const generated = cardTilesOf(container).filter((b) => !b.getAttribute('aria-label').includes('(pending)'))
  assert.ok(generated.length > 0)
  // 模拟键盘用户：先聚焦瓦片再打开详情
  const tile = generated[0]
  tile.focus()
  assert.equal(document.activeElement, tile, '前置：瓦片已获焦点')
  await act(async () => {
    tile.click()
    await new Promise((r) => setTimeout(r, 30))
  })
  const region = container.querySelector('[role="region"]')
  assert.ok(region, '详情已打开')
  const closeBtn = region.querySelector('button[aria-label="detailClose"]')
  assert.ok(closeBtn, '详情应含关闭按钮')
  assert.equal(document.activeElement, closeBtn, '详情打开后焦点应落在关闭按钮上')

  await act(async () => {
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  assert.ok(!container.querySelector('[role="region"]'), 'Escape 后详情应关闭')
  assert.equal(document.activeElement, tile, '关闭后焦点应归还触发的瓦片')
})

test('DOM 集成：记忆详情焦点与卡片详情一致（打开聚焦返回钮、Escape 归还）', async () => {
  const { container } = await mountLoaded({ Page })
  // 切到记忆页签（stub locale 返回 key，标签形如 "viewMemory 1"）
  const memoryTab = [...container.querySelectorAll('button[aria-pressed]')]
    .find((b) => b.textContent.startsWith('viewMemory'))
  assert.ok(memoryTab, '应渲染 Memory 页签')
  await act(async () => {
    memoryTab.click()
    await new Promise((r) => setTimeout(r, 30))
  })
  const entry = [...container.querySelectorAll('button[aria-label]')]
    .find((b) => !['reload', 'viewGrid', 'viewList', 'wikiBack'].includes(b.getAttribute('aria-label'))
      && b.textContent.includes('面板状态分支'))
  assert.ok(entry, '记忆列表应渲染语料条目（真实 corpus fixture 的 memory/zh）')
  entry.focus()
  await act(async () => {
    entry.click()
    await new Promise((r) => setTimeout(r, 30))
  })
  const backBtn = container.querySelector('button[aria-label="wikiBack"]')
  assert.ok(backBtn, '记忆详情应含返回按钮')
  assert.equal(document.activeElement, backBtn, '打开后焦点应落在返回按钮上')
  await act(async () => {
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  // 记忆详情为整面板切换：Escape 后触发条目已卸载，焦点按失联回退落到 Memory 页签
  assert.notEqual(document.activeElement, backBtn, 'Escape 后应离开返回按钮')
  assert.ok(document.activeElement?.textContent.startsWith('viewMemory'),
    `Escape 后焦点应回退到 Memory 页签按钮（实际：${document.activeElement?.constructor.name}）`)
  assert.ok(!container.querySelector('button[aria-label="wikiBack"]'), 'Escape 后记忆详情应关闭')
})

test('DOM 集成：总览行真实点击下钻到单库视图（多工作区）', async () => {
  const workspaces = {
    list: {
      getSnapshot: () => ({
        items: [
          { workspaceId: 'wa', path: '/tmp/wa', title: '有库工作区', sessionIds: ['s1'], createdAt: '', updatedAt: '' },
          { workspaceId: 'wb', path: '/tmp/wb', title: '空工作区', sessionIds: ['s2'], createdAt: '', updatedAt: '' },
        ],
      }),
      subscribe: () => () => {},
    },
  }
  const { container } = await mountLoaded({
    Page,
    select: false,
    workspaces,
    // s2 会话的读请求一律 not-found（空工作区）
    wrapRead: (read) => async (sessionId, rel, range, signal) => {
      if (sessionId === 's2') {
        return { ok: false, error: { code: 'workspace-file/not-found', message: 'not found' } }
      }
      return read(sessionId, rel, range, signal)
    },
  })

  const text = container.textContent
  assert.ok(text.includes('有库工作区'), '总览应列出工作区标题')
  assert.ok(text.includes('noAsset'), '空工作区行应渲染"尚未生成"提示')

  // 真实 click 总览行 → 下钻单库
  const row = [...container.querySelectorAll('button[aria-label]')]
    .find((b) => b.getAttribute('aria-label').includes('有库工作区'))
  assert.ok(row, '应渲染总览行按钮')
  await act(async () => {
    row.click()
    await new Promise((r) => setTimeout(r, 150))
  })
  const singleText = container.textContent
  assert.ok(singleText.includes('statFiles'), '下钻后应渲染单库统计')
  const stillOverview = [...container.querySelectorAll('button[aria-label]')]
    .some((b) => b.getAttribute('aria-label').includes('有库工作区'))
  assert.ok(!stillOverview, '总览行应被单库视图取代')
})

test('DOM 集成：按模块分组渲染目录标题（真实 click 切换）', async () => {
  const { container } = await mountLoaded({ Page })
  const groupBtn = [...container.querySelectorAll('button')]
    .find((b) => b.textContent === 'groupBy')
  assert.ok(groupBtn, '应存在按模块分组按钮')

  await act(async () => {
    groupBtn.click()
    await new Promise((r) => setTimeout(r, 30))
  })
  const headings = [...container.querySelectorAll('h3')].map((el) => el.textContent)
  assert.ok(headings.includes('groupRoot'), '应渲染根目录分组标题')
  assert.ok(headings.includes('src'), '应渲染 src 模块分组标题')
  assert.equal(groupBtn.getAttribute('aria-pressed'), 'true')

  await act(async () => {
    groupBtn.click()
    await new Promise((r) => setTimeout(r, 30))
  })
  assert.equal(container.querySelectorAll('h3').length, 0, '关闭分组后不残留分组标题')
})

test('DOM 集成：Wiki 目录锚点页内跳转（不新开标签）', async () => {
  const base = makeCorpusWf()
  const demo = [
    '---', '{"schemaVersion":1,"title":"锚点演示","slug":"anchor-demo","locale":"zh","generatedAt":"2026-11-27"}',
    '---', '# 锚点演示', '', '## 目录', '', '1. [第一节](#第一节)', '', '## 第一节', '', '正文。', '',
  ].join('\n')
  const wf = {
    async read(sid, rel, range, signal) {
      if (rel === '.dsh-repowiki/wiki/zh/anchor-demo.md') {
        return { ok: true, value: { text: demo, lines: demo.split('\n').length, offset: 1, eof: true } }
      }
      return base.read(sid, rel, range, signal)
    },
    async list(sid, rel, signal) {
      const result = await base.list(sid, rel, signal)
      if (result.ok && rel === '.dsh-repowiki/wiki/zh') {
        result.value.entries = [...result.value.entries,
          { name: 'anchor-demo.md', type: 'file', size: demo.length }]
      }
      return result
    },
  }
  const { container } = await mountLoaded({ Page, wf })
  const wikiTab = [...container.querySelectorAll('button')]
    .find((b) => b.textContent.startsWith('viewWiki'))
  await act(async () => {
    wikiTab.click()
    await new Promise((r) => setTimeout(r, 30))
  })
  const entry = [...container.querySelectorAll('button[aria-label]')]
    .find((b) => b.getAttribute('aria-label') === '锚点演示')
  assert.ok(entry, 'Wiki 列表应含锚点演示页面')
  await act(async () => {
    entry.click()
    await new Promise((r) => setTimeout(r, 30))
  })

  assert.ok(container.querySelector('#第一节'), '章节标题应带锚点 id')
  const anchor = container.querySelector('a[href="#第一节"]')
  assert.ok(anchor, '目录链接应指向章节锚点')
  assert.equal(anchor.getAttribute('target'), null, '页内锚点不应新开标签')
})

test('DOM 集成：剪贴板不可用时复制路径显示可读失败行', async () => {
  const { container } = await mountLoaded({ Page })
  const generated = cardTilesOf(container).filter((b) => !b.getAttribute('aria-label').includes('(pending)'))
  assert.ok(generated.length > 0)
  await act(async () => {
    generated[0].click()
    await new Promise((r) => setTimeout(r, 30))
  })
  const copyBtn = [...container.querySelectorAll('button[aria-label]')]
    .find((b) => b.getAttribute('aria-label') === 'copyPath')
  assert.ok(copyBtn, '详情应含复制路径按钮')
  await act(async () => {
    copyBtn.click()
    await new Promise((r) => setTimeout(r, 30))
  })
  assert.ok(container.textContent.includes('copyFailed'), '剪贴板不可用时应显示失败原因')
})

/**
 * 构造含 N 个文件/卡片的合成工作区（用于分页回归）。
 * @param {number} count - 文件数。
 * @returns {object} fake remote.workspaceFiles。
 */
function makeSyntheticWf(count) {
  const files = {}
  const index = {
    schemaVersion: 3, generatedAt: 'now', root: '.',
    stats: { files: count, symbols: 0, edges: 0, modules: 1 },
    stack: { projectName: 'Demo', technologies: [] },
    modules: [{ path: 'src', parent: '.', files: count, symbols: 0 }],
    files: [], edges: [],
  }
  for (let i = 0; i < count; i++) {
    const sourcePath = `src/f${i}.ts`
    index.files.push({
      path: sourcePath, module: 'src', lang: 'typescript', sizeBytes: 0,
      digest: '', symbols: [], imports: [],
    })
    files[`.dsh-repowiki/knowledge/zh/f${i}.md`] = `---\n${JSON.stringify({
      schemaVersion: 1, path: sourcePath, lang: 'typescript', locale: 'zh',
      sourceDigest: '', title: `File ${i}`, tags: [`t${i % 3}`], manuallyEdited: false, generatedAt: 'now',
    })}\n---\n# File ${i}\n`
  }
  files['.dsh-repowiki/index.json'] = JSON.stringify(index)
  const dirs = {
    '.dsh-repowiki': [{ name: 'index.json', type: 'file' }, { name: 'knowledge', type: 'directory' }],
    '.dsh-repowiki/knowledge': [{ name: 'zh', type: 'directory' }],
    '.dsh-repowiki/knowledge/zh': index.files.map((_, i) => ({ name: `f${i}.md`, type: 'file' })),
  }
  return {
    async read(_sid, rel) {
      if (files[rel] === undefined) {
        return { ok: false, error: { code: 'workspace-file/not-found', message: 'not found' } }
      }
      return { ok: true, value: { text: files[rel], lines: files[rel].split('\n').length, offset: 1, eof: true } }
    },
    async list(_sid, rel) {
      if (dirs[rel]) return { ok: true, value: { path: rel, entries: dirs[rel], truncated: false } }
      return { ok: false, error: { code: 'workspace-file/not-found', message: 'not found' } }
    },
  }
}

test('DOM 集成：空 en 资产目录自动回退到有内容的 zh', async () => {
  const index = {
    schemaVersion: 5, generatedAt: '2026-11-26T08:00:00.000Z',
    stats: { files: 1, symbols: 1 },
    stack: { technologies: [] }, modules: [], edges: [],
    files: [{ path: 'src/a.js', module: 'src', lang: 'javascript', digest: 'd', symbols: [{ name: 'a' }], imports: [] }],
  }
  const card = `---\n${JSON.stringify({
    schemaVersion: 1, path: 'src/a.js', lang: 'javascript', locale: 'zh',
    sourceDigest: 'd', title: 'A 卡片', tags: [], manuallyEdited: false, generatedAt: 'now',
  })}\n---\n# A 卡片\n\nA 的概要文本。\n`
  const wiki = `---\n${JSON.stringify({
    schemaVersion: 1, slug: 'overview', title: '概览', locale: 'zh',
    sources: [], sections: [], generatedAt: 'now',
  })}\n---\n# 概览\n\n概览正文。\n`
  const memory = `---\n${JSON.stringify({
    schemaVersion: 1, kind: 'memory', title: '记忆条目', tags: [], status: 'accepted', createdAt: 'now',
  })}\n---\n# 记忆条目\n\n记忆正文。\n`
  const files = {
    '.dsh-repowiki/index.json': JSON.stringify(index),
    '.dsh-repowiki/knowledge/en/_index.json': '{}',
    '.dsh-repowiki/knowledge/zh/a.md': card,
    '.dsh-repowiki/wiki/en/_index.json': JSON.stringify({ schemaVersion: 2, pages: [] }),
    '.dsh-repowiki/wiki/zh/overview.md': wiki,
    '.dsh-repowiki/memory/en/_index.json': '{}',
    '.dsh-repowiki/memory/zh/use-digest.md': memory,
  }
  const dirs = {
    '.dsh-repowiki': [{ name: 'index.json', type: 'file' }, { name: 'knowledge', type: 'directory' },
      { name: 'wiki', type: 'directory' }, { name: 'memory', type: 'directory' }],
    '.dsh-repowiki/knowledge': [{ name: 'en', type: 'directory' }, { name: 'zh', type: 'directory' }],
    '.dsh-repowiki/knowledge/en': [{ name: '_index.json', type: 'file' }],
    '.dsh-repowiki/knowledge/zh': [{ name: 'a.md', type: 'file' }],
    '.dsh-repowiki/wiki': [{ name: 'en', type: 'directory' }, { name: 'zh', type: 'directory' }],
    '.dsh-repowiki/wiki/en': [{ name: '_index.json', type: 'file' }],
    '.dsh-repowiki/wiki/zh': [{ name: 'overview.md', type: 'file' }],
    '.dsh-repowiki/memory': [{ name: 'en', type: 'directory' }, { name: 'zh', type: 'directory' }],
    '.dsh-repowiki/memory/en': [{ name: '_index.json', type: 'file' }],
    '.dsh-repowiki/memory/zh': [{ name: 'use-digest.md', type: 'file' }],
  }
  const wf = {
    async read(_sid, rel) {
      const text = files[rel]
      if (text === undefined) return { ok: false, error: { code: 'workspace-file/not-found', message: 'not found' } }
      return { ok: true, value: { text, lines: text.split('\n').length, offset: 1, eof: true } }
    },
    async list(_sid, rel) {
      if (dirs[rel]) return { ok: true, value: { path: rel, entries: dirs[rel], truncated: false } }
      return { ok: false, error: { code: 'workspace-file/not-found', message: 'not found' } }
    },
  }
  const { container } = await mountLoaded({ Page, wf })
  assert.ok(cardTilesOf(container).some(b => b.textContent.includes('src/a.js')),
    'en 为空时应回退到 zh 并渲染卡片')
  const wikiTab = [...container.querySelectorAll('[role="tab"]')].find(b => b.textContent.startsWith('viewWiki'))
  assert.ok(wikiTab.textContent.includes('1'), 'Wiki 回退后应统计到 zh 页面')
  await act(async () => { wikiTab.click(); await new Promise((r) => setTimeout(r, 30)) })
  assert.ok(container.textContent.includes('概览'), 'Wiki 页签应渲染 zh 页面')
  const memoryTab = [...container.querySelectorAll('[role="tab"]')].find(b => b.textContent.startsWith('viewMemory'))
  assert.ok(memoryTab.textContent.includes('1'), '记忆回退后应统计到 zh 条目')
  await act(async () => { memoryTab.click(); await new Promise((r) => setTimeout(r, 30)) })
  assert.ok(container.textContent.includes('记忆条目'), '记忆页签应渲染 zh 条目')
})

test('DOM 集成：卡片分页初始 120，加载更多追加剩余', async () => {
  const { container } = await mountLoaded({ Page, wf: makeSyntheticWf(130) })
  assert.equal(cardTilesOf(container).length, 120, '初始只渲染 120 张')
  const more = [...container.querySelectorAll('button')]
    .find((b) => b.textContent === 'loadMore')
  assert.ok(more, '应显示加载更多按钮')
  await act(async () => {
    more.click()
    await new Promise((r) => setTimeout(r, 30))
  })
  assert.equal(cardTilesOf(container).length, 130, '加载更多后渲染全部')
  assert.equal([...container.querySelectorAll('button')].some((b) => b.textContent === 'loadMore'), false)
})
