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
    stats: { files: 5, symbols: 3, edges: 5, durationMs: 1, capped: false, reused: 0 },
    stack: { technologies: [], projectName: 'demo', projectVersion: '1.0.0' },
    files: [
      { path: 'a.js', lang: 'javascript', sizeBytes: 10, lines: 10, digest: 'dig-a', symbols: [{ name: 'x' }, { name: 'y' }], imports: [] },
      { path: 'b.js', lang: 'javascript', sizeBytes: 10, lines: 3, digest: 'dig-b', symbols: [], imports: [] },
      { path: 'c.js', lang: 'javascript', sizeBytes: 10, lines: 5, digest: 'dig-c', symbols: [{ name: 'z' }], imports: [] },
      { path: 'd.js', lang: 'javascript', sizeBytes: 10, lines: 2, digest: 'dig-d', symbols: [], imports: [] },
      { path: 'e.js', lang: 'javascript', sizeBytes: 10, lines: 4, digest: 'dig-e', symbols: [], imports: [] },
    ],
    // v5 边：详情应显示行号级反向引用与出边（a.js ↔ c.js 构成双向依赖；
    // c.js → d.js 提供正向 2 跳链；e.js → c.js 提供反向 2 跳影响面）
    edges: [
      { from: 'b.js', to: 'a.js', kind: 'import', line: 7, symbols: ['x'] },
      { from: 'a.js', to: 'c.js', kind: 'import', line: 3, symbols: ['z'] },
      { from: 'c.js', to: 'a.js', kind: 'import', line: 9, symbols: ['y'] },
      { from: 'c.js', to: 'd.js', kind: 'import', line: 12, symbols: [] },
      { from: 'e.js', to: 'c.js', kind: 'import', line: 2, symbols: [] },
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
    'BodyMarkerOnly 仅出现在卡片正文，用于验证全文检索',
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
    // 知识清单：面板读 lastRun 展示"最近一次抽取"快照
    '.dsh-repowiki/knowledge/zh/_index.json': JSON.stringify({
      schemaVersion: 2,
      generatedAt: '2026-11-26T08:00:00.000Z',
      modules: [],
      lastRun: {
        generatedAt: '2026-11-26T08:00:00.000Z',
        extracted: 2, skippedExisting: 0, skippedManual: 0, skippedSimple: 0,
        orphaned: 0, failed: 0, retried: 1, capped: false,
        concurrency: 1, attempts: 2, durationMs: 1200,
      },
    }),
    '.dsh-repowiki/wiki/zh/overview.md': wikiPage('概览', '这是概览正文。'),
    '.dsh-repowiki/wiki/zh/core.md': wikiPage('核心模块', '核心正文。'),
    '.dsh-repowiki/wiki/zh/_index.json': JSON.stringify({
      schemaVersion: 3,
      pages: [
        {
          slug: 'overview', path: 'wiki/zh/overview.md', title: '概览', order: 0,
          sources: ['a.js#L1-L3', 'a.js#L5', 'a.js#L7', 'a.js#L9', 'a.js#L11'],
          // 五个章节引用同一文件：验证 chip 上限（4）与溢出提示
          sections: [
            { heading: 'A 章节', sources: ['a.js#L1-L3'] },
            { heading: 'B 章节', sources: ['a.js#L5'] },
            { heading: 'C 章节', sources: ['a.js#L7'] },
            { heading: 'D 章节', sources: ['a.js#L9'] },
            { heading: 'E 章节', sources: ['a.js#L11'] },
          ],
          // #L11 越界，生成时无法记录指纹 → 覆盖率 4/5，用于验证未覆盖徽章
          citationDigests: {
            'a.js#L1-L3': 'aaaaaaaaaaaa',
            'a.js#L5': 'bbbbbbbbbbbb',
            'a.js#L7': 'cccccccccccc',
            'a.js#L9': 'dddddddddddd',
          },
          citationMisses: { 'a.js#L11': 'range' },
          generatedAt: '2026-11-26T08:00:00.000Z',
        },
        {
          slug: 'core', path: 'wiki/zh/core.md', title: '核心模块', order: 1,
          sources: [], sections: [], generatedAt: '2026-11-26T08:00:00.000Z',
        },
      ],
    }),
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
    async read(sessionId, rel, range, _signal) {
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
  assert.ok(!findNode(hooks.root, (n) => n.type === 'select' && n.props['aria-label'] === 'filterLang'),
    '单语言索引不渲染语言筛选')
  // 抽取快照：lastRun 渲染到统计行（t 桩返回 key，占位符由真实 locale 插值）
  const snapshot = findNode(hooks.root, (n) => n.type === 'span'
    && collectTexts(n).some(s => s === 'lastExtract'))
  assert.ok(snapshot, '应渲染最近一次抽取快照')
  assert.equal(snapshot.props.style, undefined, '无失败时不应使用错误色')
  assert.equal(snapshot.props.title, '2026-11-26T08:00:00.000Z', '快照应带生成时间 tooltip')

  // 状态点配色回归：已生成用 state-done-primary（紫），未生成用 border-l2（灰）
  // —— 官方 design-platform.css 定义了两个令牌的明/暗双值（见 docs/adr/0004），
  // 紫与灰的色相差距刻意大于旧蓝-灰组合（用户反馈"灰蓝难区分"）。
  const doneDot = findNode(hooks.root, (n) => n.type === 'span'
    && n.props.style && String(n.props.style.background).includes('state-done-primary'))
  const emptyDot = findNode(hooks.root, (n) => n.type === 'span'
    && n.props.style && String(n.props.style.background).includes('border-l2'))
  assert.ok(doneDot, '已生成卡片的状态点应使用 state-done-primary 令牌')
  assert.ok(emptyDot, '未生成条目的状态点应使用 border-l2 令牌')
})

test('大索引：超过 6 万行仍能完整读取（JSON 分页预算放宽）', async () => {
  // 索引随仓库规模增长；旧上限 12 页 × 5000 行会把大 index.json 截断成坏 JSON
  const bigIndex = {
    schemaVersion: 5,
    generatedAt: '2026-11-26T08:00:00.000Z',
    stats: { files: 1, symbols: 1 },
    stack: { technologies: [] },
    files: [{ path: 'a.js', lang: 'javascript', digest: 'dig-a', symbols: [{ name: 'x' }], imports: [] }],
    edges: [],
    // 未知字段仅用于把文件撑过旧页数上限；面板应完整读取并忽略它
    padding: Array.from({ length: 22000 }, (_, i) => ({ i })),
  }
  const text = JSON.stringify(bigIndex, null, 2)
  assert.ok(text.split('\n').length > 60000, 'fixture 需超过旧上限（6 万行）')

  const hooks = await mountReadyPage({ '.dsh-repowiki/index.json': text })
  await flush()
  const texts = collectTexts(hooks.root)
  assert.ok(texts.some(s => s.includes('statFiles')), '大索引应进入就绪状态')
  assert.ok(!texts.some(s => s.includes('loadFailed')), '分页截断不应被当作读取失败')
})

test('抽取快照：失败数 > 0 用错误色提示；清单缺失时不渲染', async () => {
  const failedRun = JSON.stringify({
    schemaVersion: 2,
    modules: [],
    lastRun: { generatedAt: '2026-11-26T09:00:00.000Z', extracted: 1, failed: 2, retried: 0 },
  })
  const hooks = await mountReadyPage({ '.dsh-repowiki/knowledge/zh/_index.json': failedRun })
  const warn = findNode(hooks.root, (n) => n.type === 'span' && n.props.role === 'status'
    && String(n.props.style?.color ?? '').includes('state-error-primary')
    && collectTexts(n).some(s => s === 'lastExtract'))
  assert.ok(warn, '失败快照应以错误色渲染并带 status 角色')

  // 清单缺失：不渲染快照（不把"没有记录"误报为失败）
  const noManifest = await mountReadyPage({ '.dsh-repowiki/knowledge/zh/_index.json': undefined })
  assert.ok(!collectTexts(noManifest.root).some(s => s.includes('lastExtract')),
    '无知识清单时不应渲染抽取快照')
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

test('只有索引、knowledge 目录缺失时按空卡片渲染（不报读取失败）', async () => {
  // 回归：只跑过 repowiki-index 的库此前会在枚举卡片目录时抛错，
  // 整页变成 loadFailed；knowledge/ 或其 locale 目录缺失都应视为空集。
  for (const brokenRel of ['.dsh-repowiki/knowledge', '.dsh-repowiki/knowledge/zh']) {
    const { wf, workspaces, startSession } = makeFakeRemotes()
    const originalList = wf.list.bind(wf)
    wf.list = async (sessionId, rel) => {
      if (rel === brokenRel) {
        return { ok: false, error: { code: 'workspace-file/not-found', message: 'not found' } }
      }
      return originalList(sessionId, rel)
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
      startSession,
      files: wf,
      notice: null,
    })
    await flush()
    const select = findNode(hooks.root, (n) => n.type === 'select' && n.props.id === 'repowiki-workspace')
    select.props.onChange({ target: { value: 'w1' } })
    await flush()

    const texts = collectTexts(hooks.root)
    assert.ok(texts.some(s => s.includes('statFiles')), `${brokenRel} 缺失时应进入就绪状态并渲染统计`)
    assert.ok(!texts.some(s => s.includes('loadFailed')), `${brokenRel} 缺失不应被当作读取失败`)
    assert.ok(!texts.some(s => s === 'lastExtract'), `${brokenRel} 缺失时不渲染抽取快照`)
    assert.ok(texts.some(s => s.includes('b.js')), '索引文件仍以未生成条目呈现')
  }
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

/**
 * 挂载页面（未选工作区），返回 hooks。
 * @param {object} [overrides] - 覆盖工作区文件内容（键为相对路径）。
 * @returns {object} hooks。
 */
function mountPage(overrides = {}) {
  const { wf, workspaces, startSession } = makeFakeRemotes(overrides)
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

/**
 * 挂载页面并选中工作区 w1，等待数据就绪。
 * @param {object} [overrides] - 覆盖工作区文件内容。
 * @returns {Promise<object>} hooks。
 */
async function mountReadyPage(overrides = {}) {
  const hooks = mountPage(overrides)
  const select = findNode(hooks.root, (n) => n.type === 'select' && n.props.id === 'repowiki-workspace')
  select.props.onChange({ target: { value: 'w1' } })
  await flush()
  return hooks
}

test('语言筛选：多语言索引可按语言过滤卡片列表', async () => {
  const mixed = {
    schemaVersion: 5,
    generatedAt: '2026-11-26T08:00:00.000Z',
    stats: { files: 3, symbols: 3 },
    stack: { technologies: [] },
    files: [
      { path: 'a.js', lang: 'javascript', digest: 'dig-a', symbols: [{ name: 'x' }], imports: [] },
      { path: 'd.py', lang: 'python', digest: 'dig-d', symbols: [{ name: 'main' }], imports: [] },
      { path: 'e.cpp', lang: 'cpp', digest: 'dig-e', symbols: [{ name: 'run' }], imports: [] },
    ],
    edges: [],
  }
  const hooks = await mountReadyPage({ '.dsh-repowiki/index.json': JSON.stringify(mixed) })
  const select = findNode(hooks.root, (n) => n.type === 'select' && n.props['aria-label'] === 'filterLang')
  assert.ok(select, '多语言索引应渲染语言筛选')
  assert.equal(select.children.length, 4, '全部语言 + 三种语言选项')
  const optionText = collectTexts(select).join('|')
  assert.ok(optionText.includes('JavaScript (1)'), '语言 id 显示为可读名')
  assert.ok(optionText.includes('Python (1)'))
  assert.ok(optionText.includes('C++ (1)'), 'C/C++ 使用展示名而非原始 id')
  const distText = collectTexts(hooks.root).join('|')
  assert.ok(distText.includes('langDistribution'), '单库视图展示语言分布')
  assert.ok(distText.includes('C++ 1'), '分布使用可读语言名与文件数')

  select.props.onChange({ target: { value: 'python' } })
  await flush()
  const texts = collectTexts(hooks.root)
  assert.ok(texts.some(s => s.includes('d.py')), '筛选后保留 Python 文件')
  assert.ok(!texts.some(s => s.includes('a.js')), '其他语言文件被过滤')
})

test('面板搜索可命中索引符号名（无需卡片文本）', async () => {
  const hooks = await mountReadyPage()
  const search = findNode(hooks.root, (n) => n.type === 'input'
    && n.props['aria-label'] === 'searchPlaceholder')
  assert.ok(search, '应渲染搜索框')

  // c.js 的符号是 z；标题/标签/摘要/路径都不含 z，只有符号名能命中
  search.props.onChange({ target: { value: 'z' } })
  await flush()
  const texts = collectTexts(hooks.root)
  assert.ok(texts.some(s => s.includes('C 卡片')), '按符号名命中文件')
  assert.ok(!texts.some(s => s.includes('A 卡片')), '未命中的文件被排除')
})

test('面板搜索可命中卡片正文（标题/摘要之外的内容）', async () => {
  const hooks = await mountReadyPage()
  const search = findNode(hooks.root, (n) => n.type === 'input'
    && n.props['aria-label'] === 'searchPlaceholder')
  assert.ok(search, '应渲染搜索框')

  // BodyMarkerOnly 只在 A 卡片正文中，标题/摘要/标签/符号/路径均不含
  search.props.onChange({ target: { value: 'bodymarkeronly' } })
  await flush()
  const texts = collectTexts(hooks.root)
  assert.ok(texts.some(s => s.includes('A 卡片')), '按正文命中卡片')
  assert.ok(!texts.some(s => s.includes('C 卡片')), '正文未命中的卡片被排除')
})

test('卡片详情可切换依赖深度（2 跳显示传递依赖与间接依赖方，重开重置）', async () => {
  const hooks = await mountReadyPage()
  const tile = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === 'A 卡片')
  assert.ok(tile, '卡片可打开')
  tile.props.onClick()
  await flush()
  const direct = collectTexts(hooks.root)
  assert.ok(!direct.some(s => s.includes('d.js:L12')), '默认只展示直接依赖')
  assert.ok(!direct.some(s => s.includes('e.js:L2')), '默认只展示直接依赖方')
  assert.ok(direct.some(s => s.includes('b.js:L7')), '直接依赖方以文件级列表展示')
  assert.ok(direct.some(s => s.includes('detailDependents')), '详情渲染依赖方区块标题')

  const depthTwo = findNode(hooks.root, (n) => n.type === 'button'
    && n.props['aria-label'] === 'importDepthOption'
    && n.children?.[0] === '2')
  assert.ok(depthTwo, '详情应渲染深度切换按钮')
  depthTwo.props.onClick()
  await flush()
  const after = collectTexts(hooks.root)
  assert.ok(after.some(s => s === '⇢ '), '传递依赖用 ⇢ 标记')
  assert.ok(after.some(s => s.includes('d.js:L12')), '2 跳命中 d.js')
  assert.ok(after.some(s => s === '⇠ '), '间接依赖方用 ⇠ 标记')
  assert.ok(after.some(s => s.includes('e.js:L2')), '2 跳命中间接依赖方 e.js')
  assert.ok(after.some(s => s.includes(' hops)')), '标注跳数')

  // 关闭后重新打开：深度回到 1，不沿用上一条详情的选择
  const closeBtn = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === 'detailClose')
  assert.ok(closeBtn, '详情有关闭按钮')
  closeBtn.props.onClick()
  await flush()
  const reopened = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === 'A 卡片')
  reopened.props.onClick()
  await flush()
  const reset = collectTexts(hooks.root)
  assert.ok(!reset.some(s => s.includes('d.js:L12')), '重新打开重置为直接依赖')
  assert.ok(!reset.some(s => s.includes('e.js:L2')), '重新打开重置为直接依赖方')
})

test('单库视图展示高风险入口（fan-in 前三，按不同依赖方计数）', async () => {
  const hooks = await mountReadyPage()
  const texts = collectTexts(hooks.root)
  assert.ok(texts.includes('hubLabel'), '渲染 hub 行标签')
  assert.ok(texts.includes('a.js (2)'), 'a.js 被 b、c 两个文件依赖')
  assert.ok(texts.includes('c.js (2)'), 'c.js 被 a、e 两个文件依赖')
  assert.ok(texts.includes('d.js (1)'), 'd.js 被 c 依赖（第三名）')
  assert.ok(!texts.some(s => s.startsWith('b.js (')), '无依赖方的文件不进入列表')

  // chip 可点击：打开对应文件的卡片详情（C 卡片存在）
  const hubChip = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === 'c.js (2)')
  assert.ok(hubChip, 'hub chip 渲染为可点击按钮')
  hubChip.props.onClick()
  await flush()
  const region = findNode(hooks.root, (n) => n.props?.role === 'region')
  assert.ok(region, '点击 hub 后打开详情')
  assert.equal(region.props['aria-label'], 'C 卡片', '详情对应 hub 文件')
  // c.js 属于 a.js ↔ c.js 二文件环：详情展示组大小与代表性路径
  const regionTexts = collectTexts(region)
  assert.ok(regionTexts.some(s => s.includes('⟲')), '详情展示循环摘要徽章')
  assert.ok(regionTexts.some(s => s.includes('→')), '详情展示代表性环路径')
  assert.ok(regionTexts.some(s => s.includes('a.js')), '路径包含环内其他文件')

  // 环内其他文件为可点击链接：点击跳到该文件详情
  const cycleLink = findNode(region, (n) => n.type === 'button' && n.props['aria-label'] === 'openFile')
  assert.ok(cycleLink, '环内其他文件渲染为可点击链接')
  cycleLink.props.onClick()
  await flush()
  const nextRegion = findNode(hooks.root, (n) => n.props?.role === 'region')
  assert.equal(nextRegion.props['aria-label'], 'A 卡片', '点击环内文件跳转到其详情')

  // 无依赖边时不渲染该行
  const empty = await mountReadyPage({
    '.dsh-repowiki/index.json': JSON.stringify({
      schemaVersion: 5, generatedAt: '2026-11-26T08:00:00.000Z',
      stats: { files: 1, symbols: 1 }, stack: { technologies: [] },
      files: [{ path: 'a.js', lang: 'javascript', digest: 'dig-a', symbols: [], imports: [] }],
      edges: [],
    }),
  })
  assert.ok(!collectTexts(empty.root).includes('hubLabel'), '无依赖边时隐藏 hub 行')
})

test('单库视图展示 PageRank 核心文件（间接重要性，可点击打开详情）', async () => {
  const hooks = await mountReadyPage()
  const texts = collectTexts(hooks.root)
  assert.ok(texts.includes('coreLabel'), '渲染核心文件行标签')
  assert.ok(texts.some(s => s === 'c.js (0.363)'), 'c.js 排名最高（双向环 + 两个上游）')
  assert.ok(texts.some(s => s === 'a.js (0.280)'), 'a.js 次之')
  assert.ok(texts.some(s => s === 'd.js (0.222)'), 'd.js 第三')

  const chip = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === 'c.js (0.363)')
  assert.ok(chip, '核心文件 chip 为可点击按钮')
  chip.props.onClick()
  await flush()
  const region = findNode(hooks.root, (n) => n.props?.role === 'region')
  assert.equal(region.props['aria-label'], 'C 卡片', '点击核心文件打开对应详情')

  const empty = await mountReadyPage({
    '.dsh-repowiki/index.json': JSON.stringify({
      schemaVersion: 5, generatedAt: '2026-11-26T08:00:00.000Z',
      stats: { files: 1, symbols: 1 }, stack: { technologies: [] },
      files: [{ path: 'a.js', lang: 'javascript', digest: 'dig-a', symbols: [], imports: [] }],
      edges: [],
    }),
  })
  assert.ok(!collectTexts(empty.root).includes('coreLabel'), '无依赖边时隐藏核心文件行')
})

test('卡片行标记循环依赖成员（SCC 口径，非成员不标记）', async () => {
  const hooks = await mountReadyPage()
  const texts = collectTexts(hooks.root)
  assert.equal(texts.filter(s => s === '⟲').length, 2, 'a.js ↔ c.js 两个成员各一个徽章')
  const badge = findNode(hooks.root, (n) => typeof n.props?.['aria-label'] === 'string'
    && n.props['aria-label'].startsWith('cycleBadgeHint'))
  assert.ok(badge, '徽章带可访问名（走文案字典）')
  assert.ok(badge.props.title.includes('cycleBadgeRoute'), '短环 tooltip 附代表性路径（文案字典 key）')
})

test('统计行：索引跳过文件数 > 0 时展示，否则隐藏', async () => {
  const withSkipped = {
    schemaVersion: 5,
    generatedAt: '2026-11-26T08:00:00.000Z',
    stats: { files: 1, symbols: 1, skipped: 2 },
    stack: { technologies: [] },
    files: [{ path: 'a.js', lang: 'javascript', digest: 'dig-a', symbols: [{ name: 'x' }], imports: [] }],
    edges: [],
  }
  const hooks = await mountReadyPage({ '.dsh-repowiki/index.json': JSON.stringify(withSkipped) })
  const texts = collectTexts(hooks.root)
  assert.ok(texts.some(s => s.includes('statSkipped')), '跳过数 > 0 时展示统计')
  const skippedNode = findNode(hooks.root, (n) => n.props?.title === 'statSkippedHint')
  assert.ok(skippedNode, 'title 走文案字典而非硬编码英文')

  const plain = await mountReadyPage()
  assert.ok(!collectTexts(plain.root).some(s => s.includes('statSkipped')), '无跳过时不展示')
})

test('统计行：索引告警数展示并在悬停中列出前几条', async () => {
  const warned = {
    schemaVersion: 5,
    generatedAt: '2026-11-26T08:00:00.000Z',
    stats: { files: 1, symbols: 1 },
    stack: { technologies: [] },
    files: [{ path: 'a.js', lang: 'javascript', digest: 'dig-a', symbols: [{ name: 'x' }], imports: [] }],
    edges: [],
    warnings: [
      'other/use.go imports pkg/internal/secret/s.go, but internal packages under pkg/internal are only importable within pkg/',
      'second warning',
      'third warning',
      'fourth warning',
    ],
  }
  const hooks = await mountReadyPage({ '.dsh-repowiki/index.json': JSON.stringify(warned) })
  const texts = collectTexts(hooks.root)
  assert.ok(texts.includes('statWarnings'), '告警数 > 0 时展示统计')
  const node = findNode(hooks.root, (n) => n.type === 'button'
    && typeof n.props?.title === 'string' && n.props.title.includes('only importable within'))
  assert.ok(node, '悬停提示列出告警原文')
  assert.ok(node.props.title.includes('… +1'), '超过 3 条时提示剩余数量')
  assert.ok(node.props.title.split('\n').length === 5, '悬停 3 条明细 + 计数 + 展开提示')
  assert.equal(node.props['aria-expanded'], false, '默认收起')

  // 点击展开全部明细（tooltip 之外的第四条也可见）
  node.props.onClick()
  await flush()
  const list = findNode(hooks.root, (n) => n.type === 'ul' && n.props?.id === 'repowiki-index-warnings')
  assert.ok(list, '展开后渲染告警列表')
  const listTexts = collectTexts(list)
  assert.equal(listTexts.length, 4, '全部告警逐条展示')
  assert.ok(listTexts.includes('fourth warning'), 'tooltip 之外的告警也可见')
  const expanded = findNode(hooks.root, (n) => n.type === 'button'
    && n.props?.['aria-controls'] === 'repowiki-index-warnings')
  assert.equal(expanded.props['aria-expanded'], true)

  // 再次点击收起
  expanded.props.onClick()
  await flush()
  assert.ok(!findNode(hooks.root, (n) => n.type === 'ul' && n.props?.id === 'repowiki-index-warnings'),
    '再次点击收起列表')

  const plain = await mountReadyPage()
  assert.ok(!collectTexts(plain.root).includes('statWarnings'), '无告警时不展示')
})

test('详情依赖与依赖方列表中的文件可点击跳转', async () => {
  const hooks = await mountReadyPage()
  const tile = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === 'A 卡片')
  assert.ok(tile, '卡片可打开')
  tile.props.onClick()
  await flush()

  const findLink = (text) => findNode(hooks.root, (n) => n.type === 'button'
    && n.props['aria-label'] === 'openFile'
    && n.children?.[0]?.children?.[0] === text)
  const importLink = findLink('c.js:L3')
  assert.ok(importLink, '出边条目渲染为链接（保留行号）')
  const dependentLink = findLink('b.js:L7')
  assert.ok(dependentLink, '依赖方条目渲染为链接')

  importLink.props.onClick()
  await flush()
  const region = findNode(hooks.root, (n) => n.props?.role === 'region')
  assert.equal(region.props['aria-label'], 'C 卡片', '点击出边文件打开其详情')
})

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

test('空结果文案按上下文区分（不再误用 pendingHint）', async () => {
  const hooks = await mountReadyPage()
  const search = findNode(hooks.root, (n) => n.type === 'input'
    && n.props['aria-label'] === 'searchPlaceholder')
  assert.ok(search, '应渲染搜索框')

  // 搜索无匹配 → 空文案应是 emptySearch，而非"尚未生成卡片"这类误导文案
  search.props.onChange({ target: { value: 'zzz-无匹配' } })
  await flush()
  const texts = collectTexts(hooks.root)
  assert.ok(texts.some((s) => s.includes('emptySearch')), '空搜索应渲染 emptySearch 文案')
  assert.ok(!texts.some((s) => s.trim() === 'pendingHint'), '空结果不得误用 pendingHint')

  // 清空查询后回到正常列表
  search.props.onChange({ target: { value: '' } })
  await flush()
  const back = collectTexts(hooks.root)
  assert.ok(back.some((s) => s.includes('A 卡片')), '清空搜索后应恢复卡片列表')
})

test('Wiki 页面的 mermaid 围栏渲染为 SVG（不支持的类型降级为代码块）', async () => {
  const page = [
    '---',
    JSON.stringify({
      schemaVersion: 1, slug: 'core', title: '核心模块', locale: 'zh',
      sources: [], generatedAt: '2026-11-26T08:00:00.000Z',
    }, null, 2),
    '---',
    '# 核心模块',
    '',
    '```mermaid',
    'flowchart TD',
    '  A[入口 main] --> B{需要缓存?}',
    '  B -->|是| C[(Redis)]',
    '  B -->|否| D[数据库]',
    '  A -.-> D',
    '```',
    '',
    '```mermaid',
    'graph LR',
    '  X((开始)) --- Y[结束]',
    '```',
    '',
    '```mermaid',
    'sequenceDiagram',
    '  A->>B: hi',
    '```',
  ].join('\n')
  const hooks = await mountReadyPage({ '.dsh-repowiki/wiki/zh/core.md': page })
  const wikiTab = findNode(hooks.root, (n) => n.type === 'button'
    && typeof n.children?.[0] === 'string' && n.children[0].startsWith('viewWiki'))
  assert.ok(wikiTab, '应渲染 Wiki 页签')
  wikiTab.props.onClick()
  await flush()
  const entry = findNode(hooks.root, (n) => n.type === 'button'
    && n.children?.some(c => Array.isArray(c?.children) && c.children.includes('核心模块')))
  assert.ok(entry, '可打开核心模块页面')
  entry.props.onClick()
  await flush()

  const svgs = []
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'svg') svgs.push(node)
    for (const child of node.children ?? []) visit(child)
  }
  visit(hooks.root)
  assert.equal(svgs.length, 2, '两个可识别的 flowchart 渲染为 SVG')
  assert.equal(svgs[0].props['aria-label'], 'Mermaid diagram')
  const firstTexts = collectTexts(svgs[0])
  for (const label of ['入口 main', '需要缓存?', 'Redis', '数据库']) {
    assert.ok(firstTexts.includes(label), `节点标签渲染：${label}`)
  }
  assert.ok(firstTexts.includes('是') && firstTexts.includes('否'), '边标签渲染')
  assert.ok(!collectTexts(hooks.root).some(s => s.includes('flowchart TD')), '已渲染的图不显示源码')
  const secondTexts = collectTexts(svgs[1])
  assert.ok(secondTexts.includes('开始') && secondTexts.includes('结束'), 'LR 图与圆形节点')
  assert.ok(collectTexts(hooks.root).some(s => s.includes('sequenceDiagram')), '不支持的图类型降级为代码块')
})

test('Wiki 页面的 mermaid subgraph 渲染为分组虚线框', async () => {
  const page = [
    '---',
    JSON.stringify({
      schemaVersion: 1, slug: 'core', title: '核心模块', locale: 'zh',
      sources: [], generatedAt: '2026-11-26T08:00:00.000Z',
    }, null, 2),
    '---',
    '# 核心模块',
    '',
    '```mermaid',
    'flowchart TD',
    '  subgraph core[核心层]',
    '    A[入口] --> B[服务]',
    '  end',
    '  subgraph data[数据层]',
    '    C[(数据库)]',
    '  end',
    '  B --> C',
    '```',
  ].join('\n')
  const hooks = await mountReadyPage({ '.dsh-repowiki/wiki/zh/core.md': page })
  const wikiTab = findNode(hooks.root, (n) => n.type === 'button'
    && typeof n.children?.[0] === 'string' && n.children[0].startsWith('viewWiki'))
  assert.ok(wikiTab, '应渲染 Wiki 页签')
  wikiTab.props.onClick()
  await flush()
  const entry = findNode(hooks.root, (n) => n.type === 'button'
    && n.children?.some(c => Array.isArray(c?.children) && c.children.includes('核心模块')))
  assert.ok(entry, '可打开核心模块页面')
  entry.props.onClick()
  await flush()

  const svg = findNode(hooks.root, (n) => n.type === 'svg')
  assert.ok(svg, 'mermaid 图渲染为 SVG')
  const texts = collectTexts(svg)
  assert.ok(texts.includes('核心层'), '组名渲染')
  assert.ok(texts.includes('数据层'))
  for (const label of ['入口', '服务', '数据库']) {
    assert.ok(texts.includes(label), `组内/组外节点标签：${label}`)
  }
  const dashed = []
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'rect' && node.props?.strokeDasharray === '4 3') dashed.push(node)
    for (const child of node.children ?? []) visit(child)
  }
  visit(svg)
  assert.equal(dashed.length, 2, '两个分组虚线框')
  assert.equal(dashed[0].props.rx, 8)
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
  assert.ok(listTexts.includes('wikiIssueSummary'), '展示引用问题摘要（概览页 #L11 超出 a.js 的 10 行）')
  assert.ok(listTexts.includes('⚠ 1'), '概览页带行号越界徽章')
  assert.ok(listTexts.includes('wikiCoverageSummary'), '展示引用指纹覆盖率摘要')
  assert.ok(listTexts.includes('◌ 1'), '概览页带未覆盖徽章（#L11 无指纹）')
  const coverageBadge = findNode(hooks.root, n => n.type === 'span' && n.children?.[0] === '◌ 1')
  assert.ok(coverageBadge, '未覆盖徽章存在')
  assert.equal(coverageBadge.props.title, 'wikiCoverageBadge')
  assert.equal(coverageBadge.props['aria-label'], 'wikiCoverageHint', '徽章附带原因提示')

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

test('Wiki 页签：旧清单无指纹时展示覆盖率降级', async () => {
  const legacy = JSON.stringify({
    schemaVersion: 2,
    pages: [{
      slug: 'overview', path: 'wiki/zh/overview.md', title: '概览', order: 0,
      sources: ['a.js'], sections: [], generatedAt: '2026-11-26T08:00:00.000Z',
    }],
  })
  const hooks = await mountReadyPage({ '.dsh-repowiki/wiki/zh/_index.json': legacy })
  const wikiTab = findNode(hooks.root, (n) => n.type === 'button'
    && typeof n.children?.[0] === 'string' && n.children[0].startsWith('viewWiki'))
  assert.ok(wikiTab, '应渲染 Wiki 页签')
  wikiTab.props.onClick()
  await flush()

  const listTexts = collectTexts(hooks.root)
  assert.ok(listTexts.includes('wikiCoverageLegacy'), '旧清单提示无指纹记录')
  assert.ok(!listTexts.some(text => text.startsWith('◌')), '旧清单不逐页渲染未覆盖徽章')
})

test('Wiki 引用可点击跳转到对应页面', async () => {
  const hooks = await mountReadyPage()
  const tile = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === 'A 卡片')
  assert.ok(tile, '卡片可打开')
  tile.props.onClick()
  await flush()

  const originalGetElementById = globalThis.document.getElementById
  let scrolledTo = ''
  globalThis.document.getElementById = (id) => ({ scrollIntoView: () => { scrolledTo = id } })
  try {
    const citation = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === '概览')
    assert.ok(citation, 'Wiki 引用应渲染为可点击按钮')
    citation.props.onClick()
    await flush()
  } finally {
    if (originalGetElementById) globalThis.document.getElementById = originalGetElementById
    else delete globalThis.document.getElementById
  }

  const texts = collectTexts(hooks.root)
  assert.ok(texts.some(s => s.includes('这是概览正文。')), '跳转后应展示被引用的 Wiki 页面正文')
  assert.equal(scrolledTo, 'a-章节', '应滚动到引用章节的锚点')
  const backBtn = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === 'wikiBack')
  assert.ok(backBtn, '跳转后应渲染 Wiki 返回控件')
})

test('Wiki 章节 chip 可跳转到任意被引用章节', async () => {
  const hooks = await mountReadyPage()
  const tile = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === 'A 卡片')
  tile.props.onClick()
  await flush()

  // 多章节引用：每个章节一个 chip，aria-label 带页面上下文
  const chip = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === '概览 · B 章节')
  assert.ok(chip, '应渲染章节 chip')
  assert.ok(findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === '概览 · A 章节'),
    '首章节 chip 同样可点击')
  assert.ok(!findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === '概览 · E 章节'),
    '章节 chip 有上限（第 5 个不渲染）')
  assert.ok(collectTexts(hooks.root).some(s => s === 'detailRefsMore'), '溢出章节显示 +N 提示')

  const originalGetElementById = globalThis.document.getElementById
  let scrolledTo = ''
  globalThis.document.getElementById = (id) => ({ scrollIntoView: () => { scrolledTo = id } })
  try {
    chip.props.onClick()
    await flush()
  } finally {
    if (originalGetElementById) globalThis.document.getElementById = originalGetElementById
    else delete globalThis.document.getElementById
  }

  assert.equal(scrolledTo, 'b-章节', 'chip 跳转到自身章节而非首个章节')
  const texts = collectTexts(hooks.root)
  assert.ok(texts.some(s => s.includes('这是概览正文。')), '跳转后仍展示页面正文')
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
  assert.ok(detailTexts.some(s => s.includes('detailReferences')), '详情应展示反向引用标题')
  assert.ok(detailTexts.some(s => s.includes('← b.js:L7')), '反向引用应带 import 行号')
  assert.ok(detailTexts.some(s => s.includes('detailImports')), '详情应展示依赖文件标题')
  assert.ok(detailTexts.some(s => s === '↔ '), '双向依赖用 ↔ 标记')
  assert.ok(detailTexts.some(s => s.includes('c.js:L3')), '出边应带 import 行号')
  assert.ok(detailTexts.some(s => s.includes(' (z)')), '出边应列出导入符号')
  assert.ok(detailTexts.some(s => s.includes('detailWikiCitations')), '详情应展示 Wiki 引用标题')
  assert.ok(detailTexts.some(s => s === 'A 章节'), '章节 chip 渲染 A 章节')
  assert.ok(detailTexts.some(s => s === 'B 章节'), '章节 chip 渲染 B 章节')
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
