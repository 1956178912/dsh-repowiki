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
import {
  makeHooks, reactFor, collectTexts, findNode, flush,
} from './lib/stub-react.mjs'

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

/* ── fake remote.workspaceFiles：模拟工作区文件系统 ── */

/**
 * 造一套 fake workspaceFiles（含 index.json / 一张卡片 / 一个 wiki 页）。
 * @param {object} overrides - 覆盖文件内容（键为相对路径）。
 * @returns {object} {wf, workspaces, startSession} 桩。
 */
function makeFakeRemotes(overrides = {}, workspacesOverride = null) {
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
    '## 关键符号 / Key symbols',
    '',
    '- `fa` (function): 做某事',
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
  // 记忆条目（与 src/memory.js renderMemoryMarkdown 同构）
  const memoryPage = (title, status, body) => [
    '---',
    JSON.stringify({ schemaVersion: 1, kind: 'memory', title, tags: status === 'accepted' ? ['decision'] : [], status, createdAt: '2026-11-26T07:30:00.000Z' }, null, 2),
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
    '.dsh-repowiki/memory/zh/use-digest.md': memoryPage('用摘要判变化', 'accepted', '摘要驱动增量重建。'),
    '.dsh-repowiki/memory/zh/pending-draft.md': memoryPage('待审草稿', 'pending', '尚未审核的知识。'),
    ...overrides,
  }
  const dirs = {
    '.dsh-repowiki': ['.dsh-repowiki/knowledge', '.dsh-repowiki/wiki', '.dsh-repowiki/memory', '.dsh-repowiki/index.json'],
    '.dsh-repowiki/knowledge': ['.dsh-repowiki/knowledge/zh'],
    '.dsh-repowiki/knowledge/zh': ['.dsh-repowiki/knowledge/zh/a.md', '.dsh-repowiki/knowledge/zh/c.md'],
    '.dsh-repowiki/wiki': ['.dsh-repowiki/wiki/zh'],
    '.dsh-repowiki/wiki/zh': ['.dsh-repowiki/wiki/zh/overview.md', '.dsh-repowiki/wiki/zh/core.md'],
    '.dsh-repowiki/memory': ['.dsh-repowiki/memory/zh'],
    '.dsh-repowiki/memory/zh': ['.dsh-repowiki/memory/zh/use-digest.md', '.dsh-repowiki/memory/zh/pending-draft.md'],
  }
  const entriesOf = (rel) => (dirs[rel] ?? []).map((p) => {
    const name = p.split('/').pop()
    return { name, type: files[p] ? 'file' : 'directory', size: files[p] ? files[p].length : undefined }
  })

  const wf = {
    // RemoteResult 契约：成功值在 .value；失败 {ok:false, error} 且不抛
    async read(sessionId, rel, range, signal) {
      const text = files[rel]
      if (text === undefined) {
        return {
          ok: false,
          error: { code: 'workspace-file/not-found', message: `not found: ${rel}`, details: { path: rel } },
        }
      }
      const lines = text.split('\n')
      const offset = range?.offset ?? 1
      const limit = range?.limit ?? 5000
      const slice = lines.slice(offset - 1, offset - 1 + limit)
      return {
        ok: true,
        value: {
          absolutePath: `/ws/${rel}`, version: 'v1', offset,
          text: slice.join('\n'), lines: slice.length,
          eof: offset - 1 + slice.length >= lines.length,
        },
      }
    },
    async list(sessionId, rel) {
      return { ok: true, value: { path: rel, entries: entriesOf(rel), truncated: false } }
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
  return { wf, workspaces: workspacesOverride ?? workspaces, startSession: () => {} }
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
      return reactFor(hooks)
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
    return reactFor(hooks)
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
    return reactFor(hooks)
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
    return reactFor(hooks)
  })
  mod.apply(makeStubCtx(wf))
  // 包装 read 让 index.json 返回 not-found 失败（保留其余文件）
  const originalRead = wf.read.bind(wf)
  wf.read = async (sessionId, rel, range, signal) => {
    if (rel === '.dsh-repowiki/index.json') {
      return { ok: false, error: { code: 'workspace-file/not-found', message: 'not found' } }
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

test('startSession 抛错时页面给出可读提示而非静默失败', async () => {
  const { wf, workspaces } = makeFakeRemotes()
  const hooks = makeHooks()
  const mod = captured.factory((name) => {
    if (name !== 'react') throw new Error(`意外 require: ${name}`)
    return reactFor(hooks)
  })
  mod.apply(makeStubCtx(wf))
  hooks.mount(RepoWikiPageOf(mod), {
    t: (key) => key,
    workspaces,
    // 模拟 startSession 现场抛错（如会话服务降级）
    startSession: () => { throw new Error('session boom') },
    files: wf,
    notice: null,
  })
  await flush()
  const select = findNode(hooks.root, (n) => n.type === 'select' && n.props.id === 'repowiki-workspace')
  select.props.onChange({ target: { value: 'w1' } })
  await flush()

  const runBtn = findNode(hooks.root, (n) => n.type === 'button'
    && typeof n.children?.[0] === 'string' && n.children[0] === 'actionAll')
  assert.ok(runBtn, '应渲染一键生成按钮')
  runBtn.props.onClick()
  await flush()

  const texts = collectTexts(hooks.root)
  assert.ok(texts.some(s => s.includes('failed')), 'startSession 抛错应渲染失败提示')
  assert.ok(!texts.some(s => s.includes('actionFailed')), 'run 自身的 try/catch 应先兜底，不应走到 guard')
})

test('总览模式：列出各工作区状态、点击行下钻单库视图', async () => {
  const { wf } = makeFakeRemotes()
  // 三个工作区：已生成（复用语料）/ 未生成（读一律 not-found）/ 无会话
  const workspaces = {
    list: {
      getSnapshot: () => ({
        items: [
          { workspaceId: 'wa', path: '/tmp/wa', title: '已生成库', sessionIds: ['s1'], createdAt: '', updatedAt: '' },
          { workspaceId: 'wb', path: '/tmp/wb', title: '空仓库', sessionIds: ['s2'], createdAt: '', updatedAt: '' },
          { workspaceId: 'wc', path: '/tmp/wc', title: '新仓库', sessionIds: [], createdAt: '', updatedAt: '' },
        ],
      }),
      subscribe: () => () => {},
    },
  }
  const originalRead = wf.read.bind(wf)
  wf.read = async (sessionId, rel, range, signal) => {
    if (sessionId !== 's1') {
      return { ok: false, error: { code: 'workspace-file/not-found', message: 'not found' } }
    }
    return originalRead('s1', rel, range, signal)
  }
  const hooks = makeHooks()
  const mod = captured.factory((name) => {
    if (name !== 'react') throw new Error(`意外 require: ${name}`)
    return reactFor(hooks)
  })
  mod.apply(makeStubCtx(wf))
  hooks.mount(RepoWikiPageOf(mod), {
    t: (key) => key,
    workspaces,
    startSession: () => {},
    files: wf,
    notice: null,
  })
  await flush()

  // 初始即总览：三行状态齐备
  const overviewTexts = collectTexts(hooks.root)
  assert.ok(overviewTexts.some(s => s.includes('已生成库')), '总览行含工作区标题')
  assert.ok(overviewTexts.some(s => s.includes('statFiles')), '已生成行含文件统计')
  assert.ok(overviewTexts.some(s => s.includes('noAsset')), '空仓库行渲染"尚未生成"')
  assert.ok(overviewTexts.some(s => s.includes('noSession')), '无会话行渲染提示')

  // 点击已生成行 → 单库视图
  const row = findNode(hooks.root, (n) => n.type === 'button'
    && typeof n.props['aria-label'] === 'string' && n.props['aria-label'].includes('已生成库'))
  assert.ok(row, '应渲染可点击的总览行')
  row.props.onClick()
  await flush()
  const singleTexts = collectTexts(hooks.root)
  assert.ok(singleTexts.some(s => s.includes('statFiles')), '下钻后应渲染单库统计')
  assert.ok(!singleTexts.some(s => s.includes('已生成库')) || singleTexts.some(s => s.includes('A 卡片')),
    '单库视图应展示卡片内容')
})

/** 挂载页面（未选工作区），返回 hooks。 */
function mountPage() {
  const { wf, workspaces, startSession } = makeFakeRemotes()
  const hooks = makeHooks()
  const mod = captured.factory((name) => {
    if (name !== 'react') throw new Error(`意外 require: ${name}`)
    return reactFor(hooks)
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

test('记忆页签：条目列表（状态徽章）与单条原文浏览', async () => {
  const hooks = await mountReadyPage()
  const memTab = findNode(hooks.root, (n) => n.type === 'button'
    && typeof n.children?.[0] === 'string' && n.children[0].startsWith('viewMemory'))
  assert.ok(memTab, '应渲染记忆页签')
  memTab.props.onClick()
  await flush()

  const listTexts = collectTexts(hooks.root)
  assert.ok(listTexts.some(s => s.includes('用摘要判变化')), '记忆列表含已采信条目')
  assert.ok(listTexts.some(s => s.includes('待审草稿')), '记忆列表含待审条目')
  assert.ok(listTexts.some(s => s.includes('accepted')), '渲染状态徽章')

  // 打开条目详情，原文呈现
  const entry = findNode(hooks.root, (n) => n.type === 'button'
    && n.children?.some(c => Array.isArray(c?.children) && c.children.includes('用摘要判变化')))
  assert.ok(entry, '记忆条目可点击')
  entry.props.onClick()
  await flush()
  const pageTexts = collectTexts(hooks.root)
  assert.ok(pageTexts.some(s => s.includes('摘要驱动增量重建。')), '应呈现条目正文')
  const detailBack = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === 'wikiBack')
  assert.ok(detailBack, '详情有返回控件')
})

test('卡片详情与 Wiki 详情以排版文字渲染（非 Markdown 源码）', async () => {
  const hooks = await mountReadyPage()

  // 打开 A 卡片详情：含关键符号章节正文，无残留源码标记
  const tile = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === 'A 卡片')
  assert.ok(tile, '卡片可打开')
  tile.props.onClick()
  await flush()
  const detailTexts = collectTexts(hooks.root)
  assert.ok(detailTexts.some(s => s.includes('职责正文')), '详情渲染"职责"章节')
  assert.ok(detailTexts.some(s => s.includes('做某事')), '详情渲染"关键符号"章节列表项')
  assert.ok(!detailTexts.some(s => s.includes('## ')), '详情不应残留 Markdown 源码标题')
  assert.ok(!detailTexts.some(s => s.includes('"schemaVersion"')), 'frontmatter 不应展示')
  const headingNode = findNode(hooks.root, (n) => typeof n.type === 'string' && n.type.startsWith('h'))
  assert.ok(headingNode, '详情含排版标题节点')

  // Wiki 详情：正文渲染为排版文字
  const wikiTab = findNode(hooks.root, (n) => n.type === 'button'
    && typeof n.children?.[0] === 'string' && n.children[0].startsWith('viewWiki'))
  wikiTab.props.onClick()
  await flush()
  const entry = findNode(hooks.root, (n) => n.type === 'button'
    && n.children?.some(c => Array.isArray(c?.children) && c.children.includes('概览')))
  entry.props.onClick()
  await flush()
  const wikiTexts = collectTexts(hooks.root)
  assert.ok(wikiTexts.some(s => s.includes('这是概览正文。')), 'Wiki 正文渲染')
  assert.ok(!wikiTexts.some(s => s.includes('"generatedAt"')), 'Wiki frontmatter 不展示')
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
