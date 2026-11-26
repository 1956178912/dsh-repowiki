/**
 * 客户端 DOM 测试共享 harness（真实 React + jsdom）。
 *
 * client-dom.test.js（正常路径）与 client-faults.test.js（故障注入）
 * 共用同一套挂载机制：jsdom 全局初始化、真实 React 挂载 main 组件、
 * 真实 change/click 事件驱动。
 *
 * 真实 React 运行期由宿主提供，测试侧用 devOnly 的 react 包（同一 API
 * 面）；语料 fixture 来自 test/lib/corpus-fixture.mjs。
 */

import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { fileURLToPath } from 'node:url'
import { makeCorpusWf } from './corpus-fixture.mjs'

const CLIENT_PATH = fileURLToPath(new URL('../../client.js', import.meta.url))

let captured = null
let dom = null

/**
 * 初始化 jsdom 全局并加载 client.js，返回 main 组件。
 * 须在每个测试文件顶层调用一次（client.js 顶层注册 ModuleLoader）。
 * @returns {{dom:object, Page:Function}} jsdom 窗口与 RepoWikiPage 组件。
 */
export async function loadClient() {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  globalThis.window = dom.window
  globalThis.window.__ModuleLoader__ = { load: (mod) => { captured = mod } }
  globalThis.document = dom.window.document
  // React act() 环境声明（消除 testing environment 警告）
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  await import(CLIENT_PATH)

  const mod = captured.factory((name) => {
    if (name !== 'react') throw new Error(`意外 require: ${name}`)
    return React
  })
  // 桩上下文：推进 generator effect 完成两个 slot 注入，取 main 组件
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
    remote: { workspaceFiles: makeCorpusWf() },
  }
  mod.apply(ctx)
  const gen = effectResults[1]
  gen.next()
  gen.next()
  const [, thunk] = injected[1]
  return { dom, Page: thunk().component }
}

/**
 * 挂载页面并（默认）选中工作区（真实 change 事件），等待语料装载。
 * 每次挂载用全新 container（重复对同一 container createRoot 会告警）。
 * @param {{Page?:Function, workspaces?:object, wrapRead?:(read:Function)=>Function, wf?:object, select?:string|false, notice?:object}} [opts]
 *   Page 组件（默认 loadClient 捕获）；workspaces 覆盖默认单工作区列表；
 *   wrapRead 包装 read 实现 per-session/故障注入；wf 整体替换 fake remote；
 *   select 为 false 时停留在初始视图（总览），默认 'w1'；notice 注入页面
 *   notice 槽位（用于错误边界故障注入）；t 覆盖文案函数（默认 key 直通，
 *   故障测试可用带 {code} 占位的 loadFailed 验证插值）。
 * @returns {Promise<{container:HTMLElement, root:object}>} 挂载结果。
 */
export async function mountLoaded(opts = {}) {
  const wf = opts.wf ?? makeCorpusWf()
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
  const container = globalThis.document.createElement('div')
  globalThis.document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(opts.Page, {
      t: opts.t ?? ((key) => key), tt: (key) => key,
      workspaces, startSession: () => {}, files: wf, notice: opts.notice ?? null,
    }))
  })
  // 真实 change 事件触发工作区选择（React 合成事件根委托）；
  // select 为 false 时停留在初始视图（总览模式）
  const select = container.querySelector('#repowiki-workspace')
  if (select && opts.select !== false) {
    await act(async () => {
      select.value = opts.select ?? 'w1'
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    })
  }
  await act(async () => { await new Promise((r) => setTimeout(r, opts.waitMs ?? 150)) })
  return { container, root }
}

export { act, React }
