/**
 * 客户端模块冒烟测试（切片 1）。
 *
 * 不依赖真实 React/浏览器：自写最小 hooks/createElement stub 挂载页面，
 * 用 fake remote.workspaceFiles 模拟 .dsh-repowiki/ 资产，验证：
 * - 模块按 window.__ModuleLoader__ 约定注册、inject 声明含 remote 命名空间；
 * - apply 注册侧栏/主页面两个 slot，main 注入 face 提供 files；
 * - 选中工作区后能读到 index.json + 卡片并渲染统计/网格/未生成条目；
 * - 索引缺失时走"尚未生成"分支而非失败。
 */

import test from 'node:test'
import assert from 'node:assert/strict'

let captured = null
globalThis.window = {
  __ModuleLoader__: { load: (mod) => { captured = mod } },
}
globalThis.document = {
  hidden: false,
  addEventListener() {},
  removeEventListener() {},
}
await import('../client.js')

/* ── 最小 React stub：createElement + 常用 hooks ── */

/**
 * 制造一套独立 hooks 状态（每个测试一套）。
 * @returns {object} hooks 接口（含 mount/root）。
 */
function makeHooks() {
  const states = []
  const effects = []
  const memos = []
  let cursor = 0
  let component = null
  let props = null
  let root = null
  let pending = false

  function scheduleRender() {
    if (pending) return
    pending = true
    queueMicrotask(() => { pending = false; render() })
  }

  function render() {
    cursor = 0
    root = component(props)
    return root
  }

  return {
    mount(comp, p) { component = comp; props = p; render() },
    get root() { return root },
    useState(initial) {
      const i = cursor++
      if (!Object.hasOwn(states, i)) {
        states[i] = { value: typeof initial === 'function' ? initial() : initial }
      }
      return [
        states[i].value,
        (v) => {
          states[i].value = typeof v === 'function' ? v(states[i].value) : v
          scheduleRender()
        },
      ]
    },
    useEffect(fn, deps) {
      const i = cursor++
      const prev = effects[i]
      if (!prev || !deps || deps.some((d, k) => !Object.is(d, prev.deps?.[k]))) {
        if (prev?.cleanup) prev.cleanup()
        const cleanup = fn()
        effects[i] = {
          deps: deps ? deps.slice() : undefined,
          cleanup: typeof cleanup === 'function' ? cleanup : undefined,
        }
      }
    },
    useMemo(fn, deps) {
      const i = cursor++
      const prev = memos[i]
      if (!prev || !deps || deps.some((d, k) => !Object.is(d, prev.deps?.[k]))) {
        memos[i] = { value: fn(), deps: deps ? deps.slice() : undefined }
      }
      return memos[i].value
    },
    useCallback(fn, deps) {
      const i = cursor++
      const prev = memos[i]
      if (!prev || !deps || deps.some((d, k) => !Object.is(d, prev.deps?.[k]))) {
        memos[i] = { value: fn, deps: deps ? deps.slice() : undefined }
      }
      return memos[i].value
    },
    useRef(initial) {
      const i = cursor++
      if (!Object.hasOwn(states, i)) states[i] = { value: { current: initial } }
      return states[i].value
    },
  }
}

function createElement(type, props, ...children) {
  // 函数型组件：内联渲染（CardTile/CardRow/DetailPane 均不使用 hooks）
  if (typeof type === 'function') {
    return type({ ...(props || {}), children })
  }
  return {
    type,
    props: props || {},
    children: children.flat().filter(c => c !== null && c !== undefined && c !== false && c !== ''),
  }
}

/**
 * 深度收集虚拟树中的文本（children 字符串）。
 * @param {object|string|number} node - 虚拟节点。
 * @param {string[]} out - 收集输出。
 * @returns {string[]} 文本数组。
 */
function collectTexts(node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    node.forEach(c => collectTexts(c, out))
    return out
  }
  if (node && Array.isArray(node.children)) {
    node.children.forEach(c => collectTexts(c, out))
  }
  return out
}

/**
 * 在虚拟树里找第一个满足断言的节点。
 * @param {object} node - 根节点。
 * @param {(node:object)=>boolean} pred - 判定函数。
 * @returns {object|null} 匹配节点。
 */
function findNode(node, pred) {
  if (!node || typeof node !== 'object') return null
  if (pred(node)) return node
  for (const child of node.children ?? []) {
    const hit = findNode(child, pred)
    if (hit) return hit
  }
  return null
}

/** 等待微任务与定时器排空（异步数据装载完成）。 */
const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

/* ── fake remote.workspaceFiles：模拟工作区文件系统 ── */

/**
 * 造一套 fake workspaceFiles（含 index.json / 一张卡片 / 一个 wiki 页）。
 * @param {object} overrides - 覆盖文件内容（键为相对路径）。
 * @returns {object} {wf, workspaces, startSession} 桩。
 */
function makeFakeRemotes(overrides = {}) {
  const index = {
    schemaVersion: 2,
    generatedAt: '2026-11-26T08:00:00.000Z',
    stats: { files: 3, symbols: 3, edges: 0, durationMs: 1, capped: false, reused: 0 },
    stack: { technologies: [], projectName: 'demo', projectVersion: '1.0.0' },
    files: [
      { path: 'a.js', lang: 'javascript', sizeBytes: 10, digest: 'dig-a', symbols: [{ name: 'x' }, { name: 'y' }], imports: [] },
      { path: 'b.js', lang: 'javascript', sizeBytes: 10, digest: 'dig-b', symbols: [], imports: [] },
      { path: 'c.js', lang: 'javascript', sizeBytes: 10, digest: 'dig-c', symbols: [{ name: 'z' }], imports: [] },
    ],
  }
  const cardA = [
    '---',
    JSON.stringify({
      schemaVersion: 1, path: 'a.js', lang: 'javascript', locale: 'zh',
      title: 'A 卡片', tags: ['demo'], manuallyEdited: false,
      sourceDigest: 'dig-a', generatedAt: '2026-11-26T07:00:00.000Z',
    }, null, 2),
    '---',
    '# A 卡片',
    '',
    '> a.js',
    '',
    '## 概要 / Summary',
    '',
    'A 的概要文本',
    '',
    '## 职责 / Purpose',
    '',
    '职责正文',
    '',
  ].join('\n')
  // c.js 的卡片：记录的 sourceDigest 与索引不一致 → 待更新
  const cardC = [
    '---',
    JSON.stringify({
      schemaVersion: 1, path: 'c.js', lang: 'javascript', locale: 'zh',
      title: 'C 卡片', tags: ['stale'], manuallyEdited: false,
      sourceDigest: 'stale-digest', generatedAt: '2026-11-26T06:00:00.000Z',
    }, null, 2),
    '---',
    '# C 卡片',
    '',
    '## 概要 / Summary',
    '',
    'C 的概要文本',
    '',
  ].join('\n')
  const wikiPage = (title, body) => [
    '---',
    JSON.stringify({ schemaVersion: 1, title, slug: title, locale: 'zh',
      generatedAt: '2026-11-26T08:00:00.000Z' }, null, 2),
    '---',
    `# ${title}`,
    '',
    body,
    '',
  ].join('\n')
  const files = {
    '.dsh-repowiki/index.json': JSON.stringify(index),
    '.dsh-repowiki/knowledge/zh/a.md': cardA,
    '.dsh-repowiki/knowledge/zh/c.md': cardC,
    '.dsh-repowiki/wiki/zh/overview.md': wikiPage('概览', '这是概览正文。'),
    '.dsh-repowiki/wiki/zh/core.md': wikiPage('核心模块', '核心正文。'),
    ...overrides,
  }
  const dirs = {
    '.dsh-repowiki': ['.dsh-repowiki/knowledge', '.dsh-repowiki/wiki', '.dsh-repowiki/index.json'],
    '.dsh-repowiki/knowledge': ['.dsh-repowiki/knowledge/zh'],
    '.dsh-repowiki/knowledge/zh': ['.dsh-repowiki/knowledge/zh/a.md', '.dsh-repowiki/knowledge/zh/c.md'],
    '.dsh-repowiki/wiki': ['.dsh-repowiki/wiki/zh'],
    '.dsh-repowiki/wiki/zh': ['.dsh-repowiki/wiki/zh/overview.md', '.dsh-repowiki/wiki/zh/core.md'],
  }
  const entriesOf = (rel) => (dirs[rel] ?? []).map((p) => {
    const name = p.split('/').pop()
    return { name, type: files[p] ? 'file' : 'directory', size: files[p] ? files[p].length : undefined }
  })

  const wf = {
    async read(sessionId, rel, range, signal) {
      const text = files[rel]
      if (text === undefined) {
        throw Object.assign(new Error(`not found: ${rel}`), { code: 'workspace-file/not-found' })
      }
      const lines = text.split('\n')
      const offset = range?.offset ?? 1
      const limit = range?.limit ?? 5000
      const slice = lines.slice(offset - 1, offset - 1 + limit)
      return {
        absolutePath: `/ws/${rel}`, version: 'v1', offset,
        text: slice.join('\n'), lines: slice.length,
        eof: offset - 1 + slice.length >= lines.length,
      }
    },
    async list(sessionId, rel) {
      return { path: rel, entries: entriesOf(rel), truncated: false }
    },
  }
  const workspaces = {
    list: {
      getSnapshot: () => ({
        items: [{
          workspaceId: 'w1', path: '/tmp/ws1', title: 'ws1',
          sessionIds: ['s1'], createdAt: '', updatedAt: '',
        }],
      }),
      subscribe: () => () => {},
    },
  }
  return { wf, workspaces, startSession: () => {} }
}

/** 冒烟所需的桩上下文：记录 effect/generator 与 slot 注入。 */
function makeStubCtx(wf) {
  const effectResults = []
  const injected = []
  return {
    internal: { effectResults, injected },
    effect: (fn) => { effectResults.push(fn()) },
    locale: {
      register: () => {},
      bind: () => (key) => key,
    },
    slots: {
      inject: (owner, thunk) => { injected.push([owner, thunk]) },
      register: (opts, component) => ({ ...opts, component }),
    },
    workspaces: undefined,
    uiWorkspace: { startSession: () => {} },
    remote: { workspaceFiles: wf },
  }
}

test('客户端模块按 ModuleLoader 约定注册并声明 remote 依赖', () => {
  assert.ok(captured, 'window.__ModuleLoader__.load 未被调用')
  assert.strictEqual(captured.id, 'dsh-repowiki')
  const hooks = makeHooks()
  const mod = captured.factory((name) => {
    if (name === 'react') {
      return {
        createElement,
        useState: hooks.useState,
        useEffect: hooks.useEffect,
        useMemo: hooks.useMemo,
        useCallback: hooks.useCallback,
        useRef: hooks.useRef,
      }
    }
    throw new Error(`意外 require: ${name}`)
  })
  assert.ok(mod.inject.includes('remote'))
  assert.ok(mod.inject.includes('remote.workspaceFiles'))
  assert.strictEqual(typeof mod.apply, 'function')
})

test('apply 注册侧栏与主页面，main 注入 face 提供 files', () => {
  const { wf } = makeFakeRemotes()
  const ctx = makeStubCtx(wf)
  const hooks = makeHooks()
  const mod = captured.factory((name) => {
    if (name !== 'react') throw new Error(`意外 require: ${name}`)
    return {
      createElement,
      useState: hooks.useState,
      useEffect: hooks.useEffect,
      useMemo: hooks.useMemo,
      useCallback: hooks.useCallback,
      useRef: hooks.useRef,
    }
  })
  mod.apply(ctx)
  // 第二个 effect 是 generator：手动推进两步完成侧栏与主页面的注入
  const gen = ctx.internal.effectResults[1]
  assert.ok(gen && typeof gen.next === 'function', 'apply 的第二个 effect 应为 generator 形态')
  gen.next()
  gen.next()
  const injected = ctx.internal.injected
  assert.strictEqual(injected.length, 2)
  assert.strictEqual(injected[0][0], 'sidebar.panellist')
  assert.strictEqual(injected[1][0], 'main')

  const sidebarReg = injected[0][1]()
  assert.strictEqual(sidebarReg.id, 'repowiki')
  assert.strictEqual(sidebarReg.component.name, 'RepoWikiIcon')

  const mainReg = injected[1][1]()
  assert.strictEqual(mainReg.key, 'repowiki')
  assert.strictEqual(mainReg.component.name, 'RepoWikiPage')
  const face = mainReg.inject()
  assert.strictEqual(face.files, wf, 'main face 应注入 remote.workspaceFiles')
})
test('挂载页面：选中工作区后渲染统计、已生成卡片与未生成条目', async () => {
  const { wf, workspaces, startSession } = makeFakeRemotes()
  const hooks = makeHooks()
  const mod = captured.factory((name) => {
    if (name !== 'react') throw new Error(`意外 require: ${name}`)
    return {
      createElement,
      useState: hooks.useState,
      useEffect: hooks.useEffect,
      useMemo: hooks.useMemo,
      useCallback: hooks.useCallback,
      useRef: hooks.useRef,
    }
  })
  mod.apply(makeStubCtx(wf))
  // 直接挂载页面组件（等价于 slot 渲染）
  hooks.mount(RepoWikiPageOf(mod), {
    t: (key) => key,
    workspaces,
    startSession,
    files: wf,
    notice: null,
  })
  await flush()

  // 模拟用户选择工作区 w1
  const select = findNode(hooks.root, (n) => n.type === 'select' && n.props.id === 'repowiki-workspace')
  assert.ok(select, '应渲染工作区下拉')
  select.props.onChange({ target: { value: 'w1' } })
  await flush()

  const texts = collectTexts(hooks.root)
  assert.ok(texts.some(s => s.includes('statFiles')), '应渲染文件统计')
  assert.ok(texts.some(s => s.includes('statCards')), '应渲染卡片统计')
  assert.ok(texts.some(s => s.includes('A 卡片')), '应渲染已生成卡片标题')
  assert.ok(texts.some(s => s.includes('A 的概要文本')), '应渲染卡片摘要')
  assert.ok(texts.some(s => s.includes('b.js')), '应渲染未生成条目')
})

test('索引缺失时走"尚未生成"分支而非失败', async () => {
  const { wf, workspaces, startSession } = makeFakeRemotes()
  const hooks = makeHooks()
  const mod = captured.factory((name) => {
    if (name !== 'react') throw new Error(`意外 require: ${name}`)
    return {
      createElement,
      useState: hooks.useState,
      useEffect: hooks.useEffect,
      useMemo: hooks.useMemo,
      useCallback: hooks.useCallback,
      useRef: hooks.useRef,
    }
  })
  mod.apply(makeStubCtx(wf))
  // 包装 read 让 index.json 抛 not-found（保留其余文件）
  const originalRead = wf.read.bind(wf)
  wf.read = async (sessionId, rel, range, signal) => {
    if (rel === '.dsh-repowiki/index.json') {
      throw Object.assign(new Error('not found'), { code: 'workspace-file/not-found' })
    }
    return originalRead(sessionId, rel, range, signal)
  }
  hooks.mount(RepoWikiPageOf(mod), {
    t: (key) => key,
    workspaces,
    startSession,
    files: wf,
    notice: null,
  })
  await flush()
  const select = findNode(hooks.root, (n) => n.type === 'select' && n.props.id === 'repowiki-workspace')
  select.props.onChange({ target: { value: 'w1' } })
  await flush()

  const texts = collectTexts(hooks.root)
  assert.ok(texts.some(s => s.includes('noAsset')), '索引缺失应渲染"尚未生成"提示')
  assert.ok(!texts.some(s => s.includes('loadFailed')), '不应把 not-found 当作读取失败')
})

/** 挂载页面（未选工作区），返回 hooks。 */
function mountPage() {
  const { wf, workspaces, startSession } = makeFakeRemotes()
  const hooks = makeHooks()
  const mod = captured.factory((name) => {
    if (name !== 'react') throw new Error(`意外 require: ${name}`)
    return {
      createElement,
      useState: hooks.useState,
      useEffect: hooks.useEffect,
      useMemo: hooks.useMemo,
      useCallback: hooks.useCallback,
      useRef: hooks.useRef,
    }
  })
  mod.apply(makeStubCtx(wf))
  hooks.mount(RepoWikiPageOf(mod), {
    t: (key) => key,
    workspaces,
    startSession,
    files: wf,
    notice: null,
  })
  return hooks
}

/** 挂载页面并选中工作区 w1，等待数据就绪。 */
async function mountReadyPage() {
  const hooks = mountPage()
  const select = findNode(hooks.root, (n) => n.type === 'select' && n.props.id === 'repowiki-workspace')
  select.props.onChange({ target: { value: 'w1' } })
  await flush()
  return hooks
}

test('待更新检测：digest 不一致的卡片计入提示与待更新筛选', async () => {
  const hooks = await mountReadyPage()
  const texts = collectTexts(hooks.root)
  assert.ok(texts.some(s => s.includes('staleHint')), '应渲染待更新提示')

  // 切换到"待更新"筛选
  const staleBtn = findNode(hooks.root, (n) => n.type === 'button'
    && typeof n.children?.[0] === 'string' && n.children[0].startsWith('staleFilter'))
  assert.ok(staleBtn, '应渲染待更新筛选按钮')
  staleBtn.props.onClick()
  await flush()
  const filtered = collectTexts(hooks.root)
  assert.ok(filtered.some(s => s.includes('C 卡片')), '待更新筛选包含 stale 卡片')
  assert.ok(!filtered.some(s => s.includes('A 卡片')), '待更新筛选排除未变化卡片')
})

test('Wiki 页签：页面列表与单页原文浏览', async () => {
  const hooks = await mountReadyPage()
  const wikiTab = findNode(hooks.root, (n) => n.type === 'button'
    && typeof n.children?.[0] === 'string' && n.children[0].startsWith('viewWiki'))
  assert.ok(wikiTab, '应渲染 Wiki 页签')
  wikiTab.props.onClick()
  await flush()

  const listTexts = collectTexts(hooks.root)
  assert.ok(listTexts.some(s => s.includes('概览')), 'Wiki 列表应含页面标题')
  assert.ok(listTexts.some(s => s.includes('核心模块')), 'Wiki 列表应含第二个页面标题')

  // 打开第一个页面，查看原文
  const entry = findNode(hooks.root, (n) => n.type === 'button'
    && n.children?.some(c => Array.isArray(c?.children) && c.children.includes('概览')))
  assert.ok(entry, 'Wiki 列表项可点击')
  entry.props.onClick()
  await flush()
  const pageTexts = collectTexts(hooks.root)
  assert.ok(pageTexts.some(s => s.includes('这是概览正文。')), '应呈现页面正文')
  const backBtn = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === 'wikiBack')
  assert.ok(backBtn, '应渲染返回列表控件（aria-label）')
})

/**
 * 从模块描述里取出页面组件（经 apply 的 main 注册）。
 * @param {object} mod - factory 返回的模块对象。
 * @returns {function} RepoWikiPage 组件。
 */
function RepoWikiPageOf(mod) {
  const ctx = makeStubCtx({})
  mod.apply(ctx)
  const gen = ctx.internal.effectResults[1]
  gen.next()
  gen.next()
  const [, thunk] = ctx.internal.injected[1]
  return thunk().component
}
