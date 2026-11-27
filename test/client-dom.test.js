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

const { dom, Page } = await loadClient()

/** 卡片瓦片（排除带 aria-label 的非条目按钮）。 */
const cardTilesOf = (container) => [...container.querySelectorAll('button[aria-label]')]
  .filter((b) => !['reload', 'viewGrid', 'viewList'].includes(b.getAttribute('aria-label')))

test('DOM 集成：真实 React 渲染 + 真实 change 事件装载语料', async () => {
  const { container } = await mountLoaded({ Page })
  const text = container.textContent
  assert.ok(text.includes('statFiles'), 'DOM 中应渲染文件统计')
  assert.ok(text.includes('statCards'), 'DOM 中应渲染卡片统计')
  assert.ok(cardTilesOf(container).length > 0, 'DOM 中应渲染卡片瓦片按钮')
  // 页面根须自管滚动（宿主 mainPanel 为 overflow:hidden 的 flex 列；
  // 缺此声明内容超出即被裁掉、无法滑动——用户反馈的“无法滑动”根因）
  const root = container.querySelector('[aria-label="title"]')
  assert.ok(root, '应渲染带 aria-label 的页面根')
  const st = root.style
  assert.equal(st.height, '100%', '页面根应 height:100%')
  assert.equal(st.overflowY, 'auto', '页面根应 overflow-y:auto')
  assert.equal(st.overflowX, 'hidden', '页面根应 overflow-x:hidden')
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
  const closeBtn = region.querySelector('button[aria-label]')
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
