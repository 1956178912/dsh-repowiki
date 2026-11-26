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
    subtitle: '为项目生成符号索引、知识卡片与 Wiki',
    project: '项目目录',
    pick: '选择目录…',
    pickHint: '选择要生成知识库的项目根目录',
    actionIndex: '生成索引',
    actionExtract: '生成知识卡片',
    actionGenerate: '生成 Wiki',
    actionAll: '一键生成全部',
    note: '生成任务在新会话中执行（模型调用 repowiki-* 工具）；产物写入项目的 .dsh-repowiki/ 目录，随 Git 共享。',
    needPath: '请先选择项目目录。',
    failed: '发起失败，请重试。',
    busy: '已在新会话中开始，可在会话中查看进度。',
  },
  en: {
    panel: 'Repo wiki',
    title: 'Repo wiki',
    subtitle: 'Generate a symbol index, knowledge cards, and a wiki for a project',
    project: 'Project directory',
    pick: 'Pick directory…',
    pickHint: 'Choose the project root to build the knowledge base for',
    actionIndex: 'Build index',
    actionExtract: 'Extract cards',
    actionGenerate: 'Generate wiki',
    actionAll: 'Generate everything',
    note: 'Generation runs in a new session (the model calls the repowiki-* tools); artifacts land in the project .dsh-repowiki/ directory and travel with Git.',
    needPath: 'Pick a project directory first.',
    failed: 'Failed to start, please retry.',
    busy: 'Started in a new session; follow progress there.',
  },
}

window.__ModuleLoader__.load({
  id: 'dsh-repowiki',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState } = React

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
     * props 由 main slot 的 inject face 提供：t（文案）、pickDirectory、
     * startSession、notice。
     * @param {object} props - 页面注入。
     * @returns {object} 页面元素。
     */
    function RepoWikiPage(props) {
      const { t, pickDirectory, startSession, notice } = props
      const [path, setPath] = useState('')
      const [message, setMessage] = useState('')

      /** 选择项目目录（原生选择器失败时回退提示）。 */
      const onPick = async () => {
        setMessage('')
        try {
          const picked = await pickDirectory()
          if (typeof picked === 'string') setPath(picked)
        } catch (err) {
          setMessage(`${t('failed')} (${err?.message ?? 'picker error'})`)
        }
      }

      /**
       * 在新会话发起生成任务。
       * @param {'index'|'extract'|'generate'|'all'} kind - 动作种类。
       */
      const run = (kind) => {
        if (!path) {
          setMessage(t('needPath'))
          return
        }
        const prompt = buildPrompt(kind, path)
        try {
          startSession(undefined, { prompt, whenDraftExists: 'append' })
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

      return h('div', {
        style: { padding: '24px 28px', maxWidth: 720, margin: '0 auto' },
        'aria-label': t('title'),
      },
        h('h1', { style: { margin: '0 0 4px', fontSize: 22 } }, t('title')),
        h('p', { style: { margin: '0 0 20px', color: 'var(--dsw-alias-color-muted, #6b7280)' } }, t('subtitle')),
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 } },
          h('label', { htmlFor: 'repowiki-path', style: { fontSize: 14 } }, t('project')),
          h('input', {
            id: 'repowiki-path', type: 'text', value: path, readOnly: true,
            placeholder: t('pickHint'),
            style: {
              flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 14,
              border: '1px solid var(--dsw-alias-color-border, #d1d5db)',
              background: 'var(--dsw-alias-color-surface, #ffffff)',
              color: 'var(--dsw-alias-color-text, #111827)',
            },
          }),
          h('button', { type: 'button', style: buttonStyle, onClick: onPick }, t('pick')),
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
      inject: ['slots', 'locale', 'uiWorkspace'],
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
              pickDirectory: () => ctx.uiWorkspace.pickDirectory(),
              startSession: (opts) => ctx.uiWorkspace.startSession(undefined, opts),
            }),
          }, RepoWikiPage))
        })
      },
    }
  },
})

/**
 * 构造发给新会话的执行 prompt（工具 root 参数显式指向所选项目）。
 * @param {'index'|'extract'|'generate'|'all'} kind - 动作种类。
 * @param {string} path - 项目根绝对路径。
 * @returns {string} prompt 文本。
 */
function buildPrompt(kind, path) {
  const root = `root: ${path}`
  const steps = {
    index: ['调用 repowiki-index 工具重建符号索引'],
    extract: ['先调用 repowiki-index 建索引（若索引已存在可直接跳过）', '再调用 repowiki-extract 生成知识卡片'],
    generate: ['调用 repowiki-generate 工具，把已有知识卡片凝练为 Wiki 页面'],
    all: ['调用 repowiki-index 重建符号索引', '调用 repowiki-extract 生成知识卡片', '调用 repowiki-generate 把卡片凝练为 Wiki 页面'],
  }[kind]
  return [
    `请对项目 ${path} 执行仓库知识库生成，步骤：`,
    ...steps.map((s, i) => `${i + 1}. ${s}（工具的 ${root} 参数使用该路径；一代码生成完毕后再进行下一步）`),
    `完成后向我报告每一步的结果（文件数/符号数/卡片数/页面数）。`,
  ].join('\n')
}
