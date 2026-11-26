/**
 * dsh-repowiki 客户端模块（Phase B：UI 触发）。
 *
 * 形态遵循官方 UI 插件约定（dsh-doc ui-plugin.md + ui-schedule 实现）：
 * - window.__ModuleLoader__.load 注册懒工厂，id 等于包名；
 * - React 来自浏览器模块表（require('react')），无重复安装；
 * - inject 声明客户端服务（slots/locale/uiWorkspace）；
 * - 注册随 ctx.effect 生命周期回收（generator effect 形态）。
 *
 * 注入点（官方已分配空间的 seat，见 docs/adr/0004）：
 * - sidebar.panellist：侧栏"自动化任务"同级的 Repo Wiki 入口图标；
 * - main（key=repowiki）：与任务页并列的独立页面。
 *
 * 选择单位是**工作区**（ctx.workspaces 的 WorkspaceView 列表），不是裸
 * 目录：生成动作经 startSession(workspaceId, {prompt}) 在所选工作区开
 * 会话，工具的 root 默认即会话 cwd。
 *
 * 图标自绘 SVG：practices 规则禁止 require dsh-client-ui-primitives
 * （该包不保证稳定），artwork 允许使用自有颜色。
 */

/** 客户端文案命名空间（与 bundle 的 locale/*.json 的 meta 无关）。 */
const NS = 'repowiki.ui'

/** 侧栏面板键（main slot 的 key，框架据此把侧栏点击导航到页面）。 */
const PANEL_KEY = 'repowiki'

/** 客户端文案（中英）。 */
const DICTS = {
  zh: {
    panel: 'Repo Wiki',
    title: 'Repo Wiki',
    subtitle: '为工作区生成符号索引、知识卡片与 Wiki',
    workspace: '工作区',
    pickHint: '选择要生成知识库的工作区',
    empty: '暂无工作区。请先在侧栏添加工作区。',
    actionIndex: '生成索引',
    actionExtract: '生成知识卡片',
    actionGenerate: '生成 Wiki',
    actionAll: '一键生成全部',
    note: '生成在所选工作区的新会话中执行（模型调用 repowiki-* 工具）；产物写入该工作区目录的 .dsh-repowiki/，随 Git 共享。',
    needWorkspace: '请先选择工作区。',
    failed: '发起失败，请重试。',
    busy: '已在新会话中开始，可在会话中查看进度。',
  },
  en: {
    panel: 'Repo wiki',
    title: 'Repo wiki',
    subtitle: 'Generate a symbol index, knowledge cards, and a wiki for a workspace',
    workspace: 'Workspace',
    pickHint: 'Choose the workspace to build the knowledge base for',
    empty: 'No workspaces yet. Add one from the sidebar first.',
    actionIndex: 'Build index',
    actionExtract: 'Extract cards',
    actionGenerate: 'Generate wiki',
    actionAll: 'Generate everything',
    note: 'Generation runs in a new session of the chosen workspace (the model calls the repowiki-* tools); artifacts land in that workspace .dsh-repowiki/ directory and travel with Git.',
    needWorkspace: 'Pick a workspace first.',
    failed: 'Failed to start, please retry.',
    busy: 'Started in a new session; follow progress there.',
  },
}

window.__ModuleLoader__.load({
  id: 'dsh-repowiki',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect } = React

    /**
     * 侧栏入口图标（装饰性占据者：点击导航由框架按 PANEL_KEY 关联）。
     * @param {object} props - 侧栏图标份额（size 等）。
     * @returns {object} SVG 元素。
     */
    function RepoWikiIcon({ size }) {
      const edge = typeof size === 'number' ? size : 18
      return h('svg', {
        viewBox: '0 0 96 96', width: edge, height: edge,
        'aria-hidden': true,
        style: { display: 'block', pointerEvents: 'none' },
      },
        h('rect', { x: 8, y: 20, width: 80, height: 60, rx: 10, fill: '#2563eb' }),
        h('path', {
          d: 'M16 32c10-6 22-6 32 0 10-6 22-6 32 0v40c-10-6-22-6-32 0-10-6-22-6-32 0z',
          fill: '#ffffff',
        }),
        h('circle', { cx: 34, cy: 48, r: 5, fill: '#93c5fd' }),
        h('circle', { cx: 62, cy: 48, r: 5, fill: '#93c5fd' }),
        h('path', { d: 'M37 62h22', stroke: '#2563eb', 'stroke-width': 4, 'stroke-dasharray': '6 5' }),
      )
    }

    /**
     * Repo Wiki 主页面。
     * props 由 main slot 的 inject face 提供：t（文案）、workspaces
     * （{items, subscribe}，订阅工作区列表）、startSession、notice。
     * @param {object} props - 页面注入。
     * @returns {object} 页面元素。
     */
    function RepoWikiPage(props) {
      const { t, workspaces, startSession, notice } = props
      const [items, setItems] = useState(() => workspaces.list.getSnapshot().items)
      const [selected, setSelected] = useState('')
      const [message, setMessage] = useState('')

      // 订阅工作区列表变更（增删/重命名时下拉同步）
      useEffect(() => workspaces.list.subscribe(() => {
        setItems(workspaces.list.getSnapshot().items)
      }), [workspaces])

      /** 当前选中的 workspaceId（列表变化时清掉失效选择）。 */
      const current = items.some(w => w.workspaceId === selected) ? selected : ''

      /**
       * 在所选工作区开新会话发起生成任务。
       * @param {'index'|'extract'|'generate'|'all'} kind - 动作种类。
       */
      const run = (kind) => {
        if (!current) {
          setMessage(t('needWorkspace'))
          return
        }
        const workspace = items.find(w => w.workspaceId === current)
        const prompt = buildPrompt(kind, workspace)
        try {
          startSession(current, { prompt, whenDraftExists: 'append' })
          setMessage(t('busy'))
        } catch (err) {
          setMessage(`${t('failed')} (${err?.message ?? 'start error'})`)
        }
      }

      const buttonStyle = {
        padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
        border: '1px solid var(--dsw-alias-color-border, #d1d5db)',
        background: 'var(--dsw-alias-color-surface, #ffffff)',
        color: 'var(--dsw-alias-color-text, #111827)',
        fontSize: 14,
      }
      const primaryStyle = {
        ...buttonStyle,
        background: 'var(--dsw-alias-color-primary, #2563eb)',
        borderColor: 'transparent',
        color: '#ffffff',
      }
      const inputStyle = {
        flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 14,
        border: '1px solid var(--dsw-alias-color-border, #d1d5db)',
        background: 'var(--dsw-alias-color-surface, #ffffff)',
        color: 'var(--dsw-alias-color-text, #111827)',
      }

      return h('div', {
        style: { padding: '24px 28px', maxWidth: 720, margin: '0 auto' },
        'aria-label': t('title'),
      },
        h('h1', { style: { margin: '0 0 4px', fontSize: 22 } }, t('title')),
        h('p', { style: { margin: '0 0 20px', color: 'var(--dsw-alias-color-muted, #6b7280)' } }, t('subtitle')),
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 } },
          h('label', { htmlFor: 'repowiki-workspace', style: { fontSize: 14 } }, t('workspace')),
          items.length === 0
            ? h('span', { style: { ...inputStyle, display: 'inline-flex', alignItems: 'center', color: 'var(--dsw-alias-color-muted, #6b7280)' } }, t('empty'))
            : h('select', {
                id: 'repowiki-workspace', value: current, inputMode: 'none',
                style: inputStyle,
                onChange: (e) => setSelected(e.target.value),
                'aria-label': t('pickHint'),
              },
                h('option', { value: '' }, t('pickHint')),
                ...items.map(w => h('option', { key: w.workspaceId, value: w.workspaceId },
                  `${w.title || w.path} — ${w.path}`)),
              ),
        ),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 } },
          h('button', { type: 'button', style: primaryStyle, onClick: () => run('all') }, t('actionAll')),
          h('button', { type: 'button', style: buttonStyle, onClick: () => run('index') }, t('actionIndex')),
          h('button', { type: 'button', style: buttonStyle, onClick: () => run('extract') }, t('actionExtract')),
          h('button', { type: 'button', style: buttonStyle, onClick: () => run('generate') }, t('actionGenerate')),
        ),
        h('p', { style: { margin: '0 0 8px', fontSize: 13, color: 'var(--dsw-alias-color-muted, #6b7280)' } }, t('note')),
        message && h('p', {
          role: 'status',
          style: { margin: 0, fontSize: 14, color: 'var(--dsw-alias-color-text, #111827)' },
        }, message),
        notice,
      )
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace', 'workspaces'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'repowiki: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.effect(function* () {
          yield ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_KEY,
            order: 20,
            locale: NS,
            label: () => t('panel'),
          }, RepoWikiIcon))
          yield ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: PANEL_KEY,
            locale: NS,
            inject: () => ({
              t,
              workspaces: ctx.workspaces,
              startSession: (workspaceId, opts) => ctx.uiWorkspace.startSession(workspaceId, opts),
            }),
          }, RepoWikiPage))
        })
      },
    }
  },
})

/**
 * 构造发给新会话的执行 prompt。
 * 会话 cwd 即所选工作区目录，工具默认锚定它（不显式传 root）。
 * @param {'index'|'extract'|'generate'|'all'} kind - 动作种类。
 * @param {{path:string, title:string}} workspace - 所选工作区。
 * @returns {string} prompt 文本。
 */
function buildPrompt(kind, workspace) {
  const steps = {
    index: ['调用 repowiki-index 工具重建符号索引'],
    extract: ['先调用 repowiki-index 建索引（若索引已存在可直接跳过）', '再调用 repowiki-extract 生成知识卡片'],
    generate: ['调用 repowiki-generate 工具，把已有知识卡片凝练为 Wiki 页面'],
    all: ['调用 repowiki-index 重建符号索引', '调用 repowiki-extract 生成知识卡片', '调用 repowiki-generate 把卡片凝练为 Wiki 页面'],
  }[kind]
  return [
    `请对当前工作区项目（${workspace.title || workspace.path}）执行仓库知识库生成，步骤：`,
    ...steps.map((s, i) => `${i + 1}. ${s}（工具默认作用于当前会话目录；上一步完成后再进行下一步）`),
    `完成后向我报告每一步的结果（文件数/符号数/卡片数/页面数）。`,
  ].join('\n')
}
