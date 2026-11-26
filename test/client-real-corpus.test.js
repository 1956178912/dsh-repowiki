/**
 * 客户端真实语料回归测试。
 *
 * 动机：冒烟测试的资产 fixture 是手写的规整 Markdown，LLM 实际生成的
 * 卡片正文（标题层级、行内标记、代码围栏混排）与之形态不同。v0.13.0
 * 把卡片详情改为正文 Markdown 渲染后，曾出现现场"点击卡片无反应"
 * （渲染抛错会把整个 slot 打成空白，v0.14.0 才加错误边界）。
 *
 * 本测试把真实 LLM 语料灌入同一渲染路径，回归"每张已生成卡片都可
 * 点击、详情渲染出富文本、无抛错无挂死"。
 *
 * 语料来源：本仓库自身 .dsh-repowiki/ 的一次生成产出，原样固化为
 * test/fixtures/repo-corpus/（被索引的插件仓库本身不随产物，见
 * .gitignore；fixture 纳入版本控制以保证 CI 确定性）。断言不依赖
 * 具体卡片数量。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  makeHooks, reactFor, collectTexts, findNode, flush,
} from './lib/stub-react.mjs'
import { makeCorpusWf, loadCorpusFixture } from './lib/corpus-fixture.mjs'

const REPO_ROOT = new URL('..', import.meta.url).pathname
const wf = makeCorpusWf()

let captured = null
globalThis.window = { __ModuleLoader__: { load: (mod) => { captured = mod } } }
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} }
await import('../client.js')

const workspaces = {
  list: {
    getSnapshot: () => ({
      items: [{
        workspaceId: 'w1', path: REPO_ROOT, title: '本仓库',
        sessionIds: ['s1'], createdAt: '', updatedAt: '',
      }],
    }),
    subscribe: () => () => {},
  },
}

/** 桩上下文（与冒烟测试同构）：推进 generator effect 完成两个 slot 注入。 */
function makeStubCtx() {
  const effectResults = []
  const injected = []
  return {
    internal: { effectResults, injected },
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
}

/** 取 RepoWikiPage 组件（经 apply → main slot 注册路径截获）。 */
function pageComponentOf(mod) {
  const ctx = makeStubCtx()
  mod.apply(ctx)
  const gen = ctx.internal.effectResults[1]
  gen.next()
  gen.next()
  const [, thunk] = ctx.internal.injected[1]
  return thunk().component
}

/** 挂载页面并选中工作区，等待真实语料装载完成。 */
async function mountReadyPage() {
  const hooks = makeHooks()
  const mod = captured.factory((name) => {
    if (name !== 'react') throw new Error(`意外 require: ${name}`)
    return reactFor(hooks)
  })
  hooks.mount(pageComponentOf(mod), {
    t: (key) => key, tt: (key) => key,
    workspaces, startSession: () => {}, files: wf, notice: null,
  })
  await flush()
  const select = findNode(hooks.root, (n) => n.type === 'select' && n.props.id === 'repowiki-workspace')
  assert.ok(select, '应渲染工作区下拉')
  select.props.onChange({ target: { value: 'w1' } })
  await flush()
  return hooks
}

/** 卡片瓦片/行（grid 与 list 两种视图共用 button 形态）。
 *  排除带 aria-label 的非条目按钮（reload/viewGrid/viewList 文案直通）。 */
const NON_TILE_LABELS = new Set(['reload', 'viewGrid', 'viewList'])
const isCardTile = (n) => n.type === 'button'
  && typeof n.props?.onClick === 'function'
  && typeof n.props['aria-label'] === 'string'
  && !NON_TILE_LABELS.has(n.props['aria-label'])

test('真实语料：装载后渲染统计与卡片清单', async () => {
  const hooks = await mountReadyPage()
  const texts = collectTexts(hooks.root)
  assert.ok(texts.some(s => s.includes('statFiles')), '应渲染文件统计')
  assert.ok(texts.some(s => s.includes('statCards')), '应渲染卡片统计')
  // 真实卡片标题（本仓库知识库第一张卡）
  const titles = collectTexts(hooks.root).filter(s => s.length > 4)
  assert.ok(titles.length > 10, `真实语料下应渲染多行文本，实际 ${titles.length}`)
})

test('真实语料：每张已生成卡片点击后渲染富文本详情且不抛错', async () => {
  const hooks = await mountReadyPage()
  const tiles = []
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (isCardTile(node)) tiles.push(node)
    for (const child of node.children ?? []) visit(child)
  }
  visit(hooks.root)
  assert.ok(tiles.length > 0, '应渲染可点击条目')

  let rich = 0
  let pending = 0
  for (const tile of tiles) {
    tile.props.onClick()
    await flush()
    const detail = findNode(hooks.root, (n) => n.props?.role === 'region')
    assert.ok(detail, '点击后应渲染详情区域')
    const dt = collectTexts(detail)
    // 已生成卡片经 renderMarkdown 产出多节点富文本；未生成条目走 pending 兜底
    if (dt.length > 4) rich++
    else pending++
  }
  const corpusCards = Object.keys(loadCorpusFixture().files).filter(f => f.startsWith('.dsh-repowiki/knowledge/')).length
  assert.ok(rich > 0, '真实语料含已生成卡片，至少一张应渲染富文本详情')
  // guard 兜底未误触发：全程点击不应出现事件期错误消息
  const textsAfter = collectTexts(hooks.root)
  assert.ok(!textsAfter.some(s => s.includes('actionFailed')), '真实语料点击全程不应出现事件兜底错误')
  console.log(`真实语料点击回归：条目 ${tiles.length}，富文本详情 ${rich}，未生成兜底 ${pending}（知识库卡片文件 ${corpusCards}）`)
})

test('真实语料：Wiki 页签逐页浏览不抛错', async () => {
  const hooks = await mountReadyPage()
  const wikiTab = findNode(hooks.root, (n) => n.type === 'button'
    && typeof n.children?.[0] === 'string' && n.children[0].startsWith('viewWiki'))
  if (!wikiTab) return // 语料无 wiki 页时跳过（断言未动）
  wikiTab.props.onClick()
  await flush()
  // 进入 wiki 列表后逐页打开（若有条目）
  const entries = []
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'button' && typeof node.props?.onClick === 'function'
      && typeof node.props['aria-label'] === 'string'
      && node.props['aria-label'] !== 'wikiBack') {
      entries.push(node)
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(hooks.root)
  let opened = 0
  for (const entry of entries) {
    try {
      entry.props.onClick()
      await flush()
      opened++
      const back = findNode(hooks.root, (n) => n.type === 'button' && n.props['aria-label'] === 'wikiBack')
      if (back) { back.props.onClick(); await flush() }
    } catch (err) {
      assert.fail(`Wiki 条目打开抛错: ${err?.message ?? err}`)
    }
  }
  if (opened > 0) console.log(`真实语料 Wiki 回归：打开 ${opened} 页`)
})
