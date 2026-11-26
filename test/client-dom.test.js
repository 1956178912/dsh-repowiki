/**
 * 客户端 DOM 集成回归（真实 React + jsdom + 真实事件）。
 *
 * 动机：stub 测试直接调用 props.onClick，绕过了浏览器事件链。用户曾
 * 报告"点击卡片无反应"——要验证 onClick 的事件级接线（React 合成事件
 * 根委托、target 命中、handler 调用），必须用真实 React 把组件渲染进
 * 真实 DOM，再派发真实 click/change 事件。这是唯一能在无 GUI 环境下
 * 复现"用户点击"的手段。
 *
 * 依赖为 devOnly（react/react-dom/jsdom，均 MIT）：插件运行时仍零 npm
 * 依赖，client.js 运行期使用宿主 React；测试侧只是需要同一 API 面。
 * 语料 fixture 与 stub 测试共享（test/lib/corpus-fixture.mjs）。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { makeCorpusWf } from './lib/corpus-fixture.mjs'

/* jsdom 全局：须在导入 client.js 前就绪（client.js 顶层注册 ModuleLoader） */
let captured = null
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true })
globalThis.window = dom.window
globalThis.window.__ModuleLoader__ = { load: (mod) => { captured = mod } }
globalThis.document = dom.window.document
// React act() 环境声明（消除 testing environment 警告）
globalThis.IS_REACT_ACT_ENVIRONMENT = true
await import('../client.js')

const wf = makeCorpusWf()
const workspaces = {
  list: {
    getSnapshot: () => ({
      items: [{
        workspaceId: 'w1', path: '/repo', title: '本仓库',
        sessionIds: ['s1'], createdAt: '', updatedAt: '',
      }],
    }),
    subscribe: () => () => {},
  },
}

/** 桩上下文：推进 generator effect 完成两个 slot 注入，取 main 组件。 */
function pageComponentOf(mod) {
  const effectResults = []
  const injected = []
  const ctx = {
    effect: (fn) => { effectResults.push(fn()) },
    locale: { register: () => {}, bind: () => (key) => key },
    slots: {
      inject: (owner, thunk) => { injected.push([owner, thunk]) },
      register: (opts, component) => ({ ...opts, component }),
    },
    workspaces: undefined,
    uiWorkspace: { startSession: () => {} },
    remote: { workspaceFiles: wf },
  }
  mod.apply(ctx)
  const gen = effectResults[1]
  gen.next()
  gen.next()
  const [, thunk] = injected[1]
  return thunk().component
}

const Page = pageComponentOf(
  captured.factory((name) => {
    if (name !== 'react') throw new Error(`意外 require: ${name}`)
    return React
  }),
)

/** 挂载页面并选中工作区（真实 change 事件），等待语料装载完成。
 *  每次挂载用全新 container（重复对同一 container createRoot 会告警）。
 *  @param {{workspaces?:object, wrapRead?:(read:Function)=>Function, select?:string|false}} [opts]
 *    workspaces 覆盖默认单工作区列表；wrapRead 包装 read 实现 per-session 行为；
 *    select 为 false 时停留在初始视图（总览），默认 'w1'。 */
async function mountLoaded(opts = {}) {
  const wf = makeCorpusWf()
  if (opts.wrapRead) wf.read = opts.wrapRead(wf.read.bind(wf))
  const workspaces = opts.workspaces ?? {
    list: {
      getSnapshot: () => ({
        items: [{
          workspaceId: 'w1', path: '/repo', title: '本仓库',
          sessionIds: ['s1'], createdAt: '', updatedAt: '',
        }],
      }),
      subscribe: () => () => {},
    },
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(Page, {
      t: (key) => key, tt: (key) => key,
      workspaces, startSession: () => {}, files: wf, notice: null,
    }))
  })
  // 真实 change 事件触发工作区选择（React 合成事件根委托）；
  // select 为 false 时停留在初始视图（总览模式）
  const select = container.querySelector('#repowiki-workspace')
  assert.ok(select, '应渲染工作区下拉')
  const selectValue = opts.select ?? 'w1'
  if (selectValue !== false) {
    await act(async () => {
      select.value = selectValue
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    })
  }
  await act(async () => { await new Promise((r) => setTimeout(r, 150)) })
  return { container, root }
}

/** 卡片瓦片（排除带 aria-label 的非条目按钮）。 */
const cardTilesOf = (container) => [...container.querySelectorAll('button[aria-label]')]
  .filter((b) => !['reload', 'viewGrid', 'viewList'].includes(b.getAttribute('aria-label')))

test('DOM 集成：真实 React 渲染 + 真实 change 事件装载语料', async () => {
  const { container } = await mountLoaded()
  const text = container.textContent
  assert.ok(text.includes('statFiles'), 'DOM 中应渲染文件统计')
  assert.ok(text.includes('statCards'), 'DOM 中应渲染卡片统计')
  assert.ok(cardTilesOf(container).length > 0, 'DOM 中应渲染卡片瓦片按钮')
})

test('DOM 集成：真实 click 事件打开卡片详情（用户动作的端到端复现）', async () => {
  const { container } = await mountLoaded()
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
  const { container } = await mountLoaded()
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
  await act(async () => { await new Promise((r) => setTimeout(r, 150)) })

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
