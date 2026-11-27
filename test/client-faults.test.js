/**
 * 客户端故障注入回归（真实 React + jsdom）。
 *
 * 正常路径由 client-dom.test.js 覆盖；本套件注入故障验证降级链：
 * - **错误边界正向验证**（v0.14.0 的兜底此前从未在真实 React 下被
 *   触发验证过——若类组件签名错误则形同虚设）：注入渲染期抛错的
 *   notice 元素，断言内联错误文案出现 + console.error 带 repowiki:
 *   前缀打到现场诊断位置；
 * - 装载失败 → error 状态 + 可读错误码 + 重试按钮不崩；
 * - 单库视图的 no-session / no-asset 分支；
 * - unwrapRemote 结构异常回退（坏卡片不阻断整批枚举）；
 * - 总览行的工作区级失败（非 not-found 的错误码）；
 * - 列表视图（CardRow 渲染路径）。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { loadClient, mountLoaded, act, React } from './lib/dom-harness.mjs'

const { Page } = await loadClient()

/** 带 {code} 占位的 loadFailed 文案（验证错误码插值，其余 key 直通）。 */
const tWithCode = (key) => key === 'loadFailed' ? 'loadFailed {code}' : key

test('故障注入：渲染期抛错被错误边界捕获为内联文案（不空白 slot）', async () => {
  // 诊断现场依赖：componentDidCatch 以 repowiki: 前缀打 console
  const logs = []
  const originalError = console.error
  console.error = (...args) => { logs.push(args.map(String).join(' ')) }
  try {
    // notice 槽位注入抛错元素（page 的 notice 子树在 ErrorBoundary 内）
    function Broken() {
      throw new Error('render boom')
    }
    const { container } = await mountLoaded({ Page, notice: React.createElement(Broken), select: false })
    assert.ok(container.textContent.includes('Repo wiki panel error: render boom'),
      '应渲染内联错误文案而非空白 slot')
    assert.ok(logs.some((s) => s.includes('repowiki:') && s.includes('render boom')),
      'componentDidCatch 应以 repowiki: 前缀打到 console')
  } finally {
    console.error = originalError
  }
})

test('故障注入：装载失败渲染错误码与重试按钮（重试不崩）', async () => {
  const { container } = await mountLoaded({
    Page,
    t: tWithCode,
    wrapRead: () => async () => ({
      ok: false, error: { code: 'workspace-file/bad-read', message: 'boom' },
    }),
  })
  // 装载完成后应处于 error 状态（非 not-found 的真失败）
  await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
  const text = container.textContent
  assert.ok(text.includes('loadFailed'), '应渲染读取失败文案')
  assert.ok(text.includes('bad-read'), '应透传错误码')

  const retry = [...container.querySelectorAll('button')].find((b) => b.textContent === 'retry')
  assert.ok(retry, '应渲染重试按钮')
  await act(async () => {
    retry.click()
    await new Promise((r) => setTimeout(r, 50))
  })
  assert.ok(container.textContent.includes('loadFailed'), '重试后仍为失败态（注入持续失败）')
})

test('故障注入：无会话工作区走 no-session 分支', async () => {
  const workspaces = {
    list: {
      getSnapshot: () => ({
        items: [{ workspaceId: 'wn', path: '/tmp/wn', title: '无会话', sessionIds: [], createdAt: '', updatedAt: '' }],
      }),
      subscribe: () => () => {},
    },
  }
  const { container } = await mountLoaded({ Page, select: 'wn', workspaces })
  assert.ok(container.textContent.includes('noSession'), '单库视图应渲染无会话提示')
})

test('故障注入：索引缺失走 no-asset 分支（不当失败）', async () => {
  const { container } = await mountLoaded({
    Page,
    wrapRead: (read) => async (sessionId, rel, range, signal) => {
      if (rel === '.dsh-repowiki/index.json') {
        return { ok: false, error: { code: 'workspace-file/not-found', message: 'nf' } }
      }
      return read(sessionId, rel, range, signal)
    },
  })
  assert.ok(container.textContent.includes('noAsset'), '应渲染"尚未生成"而非失败')
  assert.ok(!container.textContent.includes('loadFailed'), 'not-found 不应计为读取失败')
})

test('故障注入：坏卡片（远程结果结构异常）不阻断整批枚举', async () => {
  const { container } = await mountLoaded({
    Page,
    // 对某一张卡片文件返回结构异常结果（unwrapRemote 走回退分支抛错，
    // loadCards 的 try/catch 记 null 跳过，其余卡片照常渲染）
    wrapRead: (read) => async (sessionId, rel, range, signal) => {
      if (rel.endsWith('src-indexer.md')) return null
      return read(sessionId, rel, range, signal)
    },
  })
  const text = container.textContent
  assert.ok(text.includes('statCards'), '装载完成（其余卡片可用）')
  assert.ok(!text.includes('loadFailed'), '单张坏卡不应升级为装载失败')
  const tiles = [...container.querySelectorAll('button[aria-label]')]
    .filter((b) => !['reload', 'viewGrid', 'viewList'].includes(b.getAttribute('aria-label')))
  const generated = tiles.filter((b) => !b.getAttribute('aria-label').includes('(pending)'))
  assert.ok(generated.length > 0, '仍应渲染多张已生成卡片')
})

test('故障注入：总览行的工作区级失败渲染错误码', async () => {
  const workspaces = {
    list: {
      getSnapshot: () => ({
        items: [
          { workspaceId: 'wa', path: '/tmp/wa', title: '正常库', sessionIds: ['s1'], createdAt: '', updatedAt: '' },
          { workspaceId: 'wb', path: '/tmp/wb', title: '失败库', sessionIds: ['s2'], createdAt: '', updatedAt: '' },
        ],
      }),
      subscribe: () => () => {},
    },
  }
  const { container } = await mountLoaded({
    Page,
    select: false,
    t: tWithCode,
    workspaces,
    wrapRead: (read) => async (sessionId, rel, range, signal) => {
      if (sessionId === 's2') {
        return { ok: false, error: { code: 'workspace-file/forbidden', message: 'denied' } }
      }
      return read(sessionId, rel, range, signal)
    },
  })
  const text = container.textContent
  assert.ok(text.includes('正常库'), '正常工作区行应渲染统计')
  assert.ok(text.includes('loadFailed') && text.includes('forbidden'),
    '失败工作区行应渲染错误码（而非静默成功）')
})

test('正常路径补缺：列表视图（CardRow）渲染卡片行', async () => {
  const { container } = await mountLoaded({ Page })
  const listBtn = [...container.querySelectorAll('button')]
    .find((b) => b.getAttribute('aria-label') === 'viewList')
  assert.ok(listBtn, '应渲染列表视图切换')
  await act(async () => { listBtn.click() })
  const generated = [...container.querySelectorAll('button[aria-label]')]
    .filter((b) => !['reload', 'viewGrid', 'viewList'].includes(b.getAttribute('aria-label'))
      && !b.getAttribute('aria-label').includes('(pending)')
      && !/ \(\d+\)$/.test(b.getAttribute('aria-label'))
      && !/ \(\d+\.\d{3}\)$/.test(b.getAttribute('aria-label')))
  assert.ok(generated.length > 0, '列表视图应渲染卡片行')
  // 卡片行形态：标题 · 路径
  const rowText = generated[0].textContent
  assert.ok(rowText.includes('·'), '卡片行应渲染"标题 · 路径"形态')
})

test('故障注入：多页读取翻页拼接（eof:false 时继续取页）', async () => {
  // 让某卡片文件分两页返回（第二页才 eof），验证翻页拼接逻辑
  const { container } = await mountLoaded({
    Page,
    wrapRead: (read) => async (sessionId, rel, range, signal) => {
      const res = await read(sessionId, rel, range, signal)
      if (res?.ok && rel.endsWith('src-indexer.md') && (range?.offset ?? 1) === 1) {
        // 首页谎称未到 eof，强制第二次取页
        return { ok: true, value: { ...res.value, eof: false, lines: res.value.lines } }
      }
      return res
    },
  })
  await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
  const text = container.textContent
  assert.ok(text.includes('statCards'), '多页文件装载完成（翻页拼接生效）')
})
