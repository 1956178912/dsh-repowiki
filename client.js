/**
 * dsh-repowiki 客户端模块（切片 1 + 切片 3：Repo Wiki 面板）。
 *
 * 形态遵循官方 UI 插件约定（dsh-doc ui-plugin.md + practices.md）：
 * - window.__ModuleLoader__.load 注册懒工厂，id 等于包名；
 * - React 来自浏览器模块表（require('react')），无重复安装；
 * - inject 声明客户端服务（slots/locale/uiWorkspace/workspaces/remote）；
 * - 注册随 ctx.effect 生命周期回收（generator effect 形态）；
 * - 主题一律用官方 --dsw-* 令牌（--dsw-alias-* 颜色/语义：label-primary/
 *   secondary 文字、label-on-color 反色、bg-layer-1/2 背景、border-l2 边框、
 *   state-business/done/error 状态色；--dsw-radius-sm/md/xs 圆角）并带字面量
 *   回退。令牌名已经静态实证：dsh-client-ui-theme 的 design-platform.css
 *   定义全部 264 个 alias 令牌（含深色 body[data-ds-dark-theme] 重定义），
 *   base.css 定义 radius 尺寸令牌，主前端壳 CSS 使用 var(--dsw-*) 348+ 处
 *   （v0.13.1 修正：此前 color-* 令牌名不存在，深色模式失效；v0.21.0 补
 *   实证并将状态点蓝色改为 state-done-primary 紫色，与灰色未生成点拉开
 *   色相；v0.28.0 圆角改用 --dsw-radius-* 令牌，与官方管理页行模式对齐）；
 * - 控件自绘（不 require dsh-client-ui-primitives，该包不保证稳定）。
 *
 * 注入点（官方已分配空间的 seat，见 docs/adr/0004）：
 * - sidebar.panellist：侧栏"自动化任务"同级的 Repo Wiki 入口图标；
 * - main（key=repowiki）：与任务页并列的独立页面。
 *
 * 数据通道（ui-plan 切片 1）：
 * - 选中工作区经 WorkspaceView.sessionIds 取任一会话 id（冷会话亦可授权），
 *   再经 ctx.remote.workspaceFiles.read/list 读取该工作区 .dsh-repowiki/：
 *   index.json（统计与候选文件）、knowledge/<locale>/*.md（卡片）、
 *   wiki/<locale>/*.md（文档计数）。
 * - read 按页返回（默认上限 5000 行/页），调用方负责翻页拼接至 eof。
 * - 错误为 RemoteError（如 workspace-file/not-found），面板区分"尚未生成"
 *   与"读取失败"，不向前端抛堆栈。
 *
 * 更新检测（ui-plan 切片 3）：卡片 frontmatter 的 sourceDigest 与索引
 * digest 不一致 → staleSet，驱动统计行的"待更新"提示与筛选页签。
 * Wiki 页签（切片 3）：列出 wiki/<locale>/ 页面并以**排版文字**呈现
 * （零依赖 Markdown 渲染器见下方 renderMarkdown：标题/列表/代码围栏/
 * 引用/加粗/行内代码/链接；frontmatter 跳过）。**
 * 生成动作用 v0.3.0 已验证的 startSession(workspaceId, ...)（见
 * docs/checkpoints/phase-ui2.md 对 ui-plan startSession(undefined) 提案的
 * 取舍）：面板选择哪个工作区，生成就落在哪个工作区的新会话。
 */

/** 客户端文案命名空间（与 bundle 的 locale/*.json 的 meta 无关）。 */
const NS = 'repowiki.ui'

/** 侧栏面板键（main slot 的 key，框架据此把侧栏点击导航到页面）。 */
const PANEL_KEY = 'repowiki'

/** 工作区内的资产目录（相对工作区根）。 */
const ASSET_DIR = '.dsh-repowiki'

/** 单页行数上限（Host 配置 maxLines 的默认值，超过会被拒）。 */
const READ_PAGE_LINES = 5000

/** 单文件最多读取页数（防巨型文件无限翻页；超出按截断处理）。 */
const READ_MAX_PAGES = 12

/** 并发读取卡片的最大请求数（避免一次性打出大量 Remote 调用）。 */
const CARD_CONCURRENCY = 6

/** 总览模式并发统计的工作区数（每工作区 3 次 Remote 调用，限流）。 */
const OVERVIEW_CONCURRENCY = 3

/** 客户端文案（中英）。 */
const DICTS = {
  zh: {
    panel: 'Repo Wiki',
    title: 'Repo Wiki',
    subtitle: '为工作区生成符号索引、知识卡片与 Wiki',
    workspace: '工作区',
    pickHint: '选择要生成知识库的工作区',
    modeOverview: '总览',
    modeSingle: '单库',
    empty: '暂无工作区。请先在侧栏添加工作区。',
    actionIndex: '生成索引',
    actionExtract: '生成知识卡片',
    actionGenerate: '生成 Wiki',
    actionAll: '一键生成全部',
    note: '生成在所选工作区的新会话中执行（模型调用 repowiki-* 工具）；产物写入该工作区目录的 .dsh-repowiki/，随 Git 共享。',
    needWorkspace: '请先选择工作区。',
    failed: '发起失败，请重试。',
    actionFailed: '操作失败',
    busy: '已在新会话中开始，可在会话中查看进度。',
    reload: '刷新',
    loading: '正在读取工作区知识库 …',
    noSession: '该工作区暂无会话。请先在该工作区打开一次会话（或生成一次），面板才能读取其文件。',
    noAsset: '该工作区尚未生成知识库。用上方按钮生成索引与卡片。',
    loadFailed: '读取失败：{code}',
    retry: '重试',
    filterAll: '全部',
    filterGenerated: '已生成',
    filterPending: '未生成',
    searchPlaceholder: '搜索标题 / 路径 / 标签 …',
    viewGrid: '网格视图',
    viewList: '列表视图',
    statFiles: '文件 {n}',
    statSymbols: '符号 {n}',
    statCards: '卡片 {n}',
    statDocs: '文档 {n}',
    updated: '最近更新：{when}',
    never: '尚未生成卡片',
    pending: '未生成',
    pendingHint: '该文件尚未生成知识卡片。',
    emptySearch: '没有匹配“{q}”的结果。',
    emptyCards: '暂无知识卡片，用上方按钮生成。',
    emptyGenerated: '还没有已生成的卡片。',
    emptyDone: '所有索引文件都已生成卡片。',
    emptyStale: '没有需要更新的卡片。',
    staleFilter: '待更新',
    staleHint: '{n} 张卡片待更新（源文件已变化）',
    viewCards: '卡片',
    viewWiki: 'Wiki',
    viewMemory: '记忆',
    wikiBack: '返回 Wiki 列表',
    wikiEmpty: '尚未生成 Wiki 页面。',
    memoryEmpty: '尚无会话记忆。用 repowiki-memory 工具沉淀本会话知识。',
    detailClose: '关闭详情',
    detailSymbols: '符号数 {n}',
    detailGeneratedAt: '生成于 {when}',
    detailSummary: '摘要',
    detailTags: '标签',
  },
  en: {
    panel: 'Repo wiki',
    title: 'Repo wiki',
    subtitle: 'Generate a symbol index, knowledge cards, and a wiki for a workspace',
    workspace: 'Workspace',
    pickHint: 'Choose the workspace to build the knowledge base for',
    modeOverview: 'Overview',
    modeSingle: 'Workspace',
    empty: 'No workspaces yet. Add one from the sidebar first.',
    actionIndex: 'Build index',
    actionExtract: 'Extract cards',
    actionGenerate: 'Generate wiki',
    actionAll: 'Generate everything',
    note: 'Generation runs in a new session of the chosen workspace (the model calls the repowiki-* tools); artifacts land in that workspace .dsh-repowiki/ directory and travel with Git.',
    needWorkspace: 'Pick a workspace first.',
    failed: 'Failed to start, please retry.',
    actionFailed: 'Action failed',
    busy: 'Started in a new session; follow progress there.',
    reload: 'Reload',
    loading: 'Reading the workspace knowledge base …',
    noSession: 'This workspace has no session yet. Open one in this workspace first (or run a generation) so the panel can read its files.',
    noAsset: 'No knowledge base generated for this workspace yet. Use the buttons above to build the index and cards.',
    loadFailed: 'Read failed: {code}',
    retry: 'Retry',
    filterAll: 'All',
    filterGenerated: 'Generated',
    filterPending: 'Pending',
    searchPlaceholder: 'Search title / path / tags …',
    viewGrid: 'Grid view',
    viewList: 'List view',
    statFiles: 'Files {n}',
    statSymbols: 'Symbols {n}',
    statCards: 'Cards {n}',
    statDocs: 'Docs {n}',
    updated: 'Last updated: {when}',
    never: 'No cards generated yet',
    pending: 'Pending',
    pendingHint: 'No knowledge card generated for this file yet.',
    emptySearch: 'No results matching "{q}".',
    emptyCards: 'No knowledge cards yet — generate them with the buttons above.',
    emptyGenerated: 'No generated cards yet.',
    emptyDone: 'Every indexed file has a card.',
    emptyStale: 'No cards need updating.',
    staleFilter: 'Stale',
    staleHint: '{n} card(s) need an update (source changed)',
    viewCards: 'Cards',
    viewWiki: 'Wiki',
    viewMemory: 'Memory',
    wikiBack: 'Back to the wiki list',
    wikiEmpty: 'No wiki pages generated yet.',
    memoryEmpty: 'No session memory yet. Use the repowiki-memory tool to persist knowledge from this session.',
    detailClose: 'Close details',
    detailSymbols: 'Symbols {n}',
    detailGeneratedAt: 'Generated {when}',
    detailSummary: 'Summary',
    detailTags: 'Tags',
  },
}

window.__ModuleLoader__.load({
  id: 'dsh-repowiki',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useCallback, useRef } = React

    /**
     * 侧栏入口图标（装饰性占据者：点击导航由框架按 PANEL_KEY 关联）。
     * @param {object} props - 侧栏图标份额（size 等）。
     * @returns {object} SVG 元素。
     */
    function RepoWikiIcon({ size }) {
      const edge = typeof size === 'number' ? size : 18
      // 与官方产品图标集同款处理：currentColor 描边、无背景 tile，
      // 颜色随侧栏按钮文字色在明暗主题自适应（见 docs/checkpoints/phase-13-icons.md）
      return h('svg', {
        viewBox: '0 0 24 24', width: edge, height: edge, fill: 'none',
        stroke: 'currentColor', 'stroke-width': 1.7,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'aria-hidden': true,
        style: { display: 'block', pointerEvents: 'none' },
      },
        // 打开的书本：两页 + 书脊
        h('path', {
          d: 'M4 6.8C6.6 5.2 9.4 5.2 12 6.8c2.6-1.6 5.4-1.6 8 0V18c-2.6-1.6-5.4-1.6-8 0-2.6-1.6-5.4-1.6-8 0z',
        }),
        h('path', { d: 'M12 6.8V18' }),
        // 页面上的符号行：符号级检索
        h('path', { d: 'M6.6 10.2h3.2M14.2 10.2h3.2M6.6 13.4h3.2M14.2 13.4h3.2' }),
      )
    }

    /* ── 数据层：workspaceFiles 远程读取（全部相对工作区根） ── */

    /**
     * 解包 RemoteResult：成功取出 .value；失败（ok:false）按 error.code
     * 抛错，由调用方 catch 后转为面板错误码。
     * @param {{ok:boolean, value?:*, error?:{code:string, message?:string}}|null} result - 远程调用结果。
     * @param {string} fallback - 结构异常时的兜底错误码。
     * @returns {*} 业务值。
     */
    function unwrapRemote(result, fallback) {
      if (result && result.ok === true) return result.value
      if (result && result.ok === false && result.error) {
        const code = typeof result.error.code === 'string' ? result.error.code : fallback
        throw { code, message: result.error.message ?? code }
      }
      throw { code: fallback, message: fallback }
    }

    /**
     * 读取一个文本文件，翻页拼接至 eof（或达页数上限按截断返回）。
     * @param {object} wf - remote.workspaceFiles 命名空间。
     * @param {string} sessionId - 授权会话 id（工作区成员会话）。
     * @param {string} rel - 相对工作区根的路径。
     * @param {AbortSignal} signal - 取消信号。
     * @returns {Promise<string>} 文件文本。
     */
    async function readFileText(wf, sessionId, rel, signal) {
      const parts = []
      let offset = 1
      for (let page = 0; page < READ_MAX_PAGES; page++) {
        const res = unwrapRemote(await wf.read(sessionId, rel, { offset, limit: READ_PAGE_LINES }, signal), 'workspace-file/bad-read')
        if (!res || typeof res.text !== 'string') throw { code: 'workspace-file/bad-read', message: 'bad read result' }
        parts.push(res.text)
        if (res.eof || !res.lines) break
        offset += res.lines
      }
      return parts.join('\n')
    }

    /**
     * 读取并解析 JSON 文件。
     * @param {object} wf - remote.workspaceFiles 命名空间。
     * @param {string} sessionId - 授权会话 id。
     * @param {string} rel - 相对路径。
     * @param {AbortSignal} signal - 取消信号。
     * @returns {Promise<object>} 解析后的对象。
     */
    async function readJson(wf, sessionId, rel, signal) {
      return JSON.parse(await readFileText(wf, sessionId, rel, signal))
    }

    /**
     * 列出目录的直接子项。
     * @param {object} wf - remote.workspaceFiles 命名空间。
     * @param {string} sessionId - 授权会话 id。
     * @param {string} rel - 相对路径（空串表示工作区根）。
     * @param {AbortSignal} signal - 取消信号。
     * @returns {Promise<object[]>} WorkspaceDirectoryEntry 数组（name/type/size?）。
     */
    async function listChildren(wf, sessionId, rel, signal) {
      const res = unwrapRemote(await wf.list(sessionId, rel, signal), 'workspace-file/bad-list')
      if (!res || !Array.isArray(res.entries)) throw { code: 'workspace-file/bad-list', message: 'bad list result' }
      return res.entries
    }

    /**
     * 计资产目录某子目录（knowledge/wiki）在首个 locale 子目录下的
     * Markdown 文件数；目录缺失或不可读返回 0（总览统计不阻断于坏目录）。
     * @param {object} wf - remote.workspaceFiles 命名空间。
     * @param {string} sessionId - 授权会话 id。
     * @param {string} dir - 相对工作区根的目录（如 .dsh-repowiki/knowledge）。
     * @param {AbortSignal} signal - 取消信号。
     * @returns {Promise<number>} Markdown 文件数。
     */
    async function countDirMd(wf, sessionId, dir, signal) {
      try {
        const subs = await listChildren(wf, sessionId, dir, signal)
        const localeDir = subs.find(e => e.type === 'directory')?.name
        if (!localeDir) return 0
        const files = await listChildren(wf, sessionId, `${dir}/${localeDir}`, signal)
        return files.filter(e => e.type === 'file' && e.name.endsWith('.md')).length
      } catch {
        return 0
      }
    }

    /**
     * 装载单个工作区的知识库统计（总览模式每行一调）。
     * @param {object} wf - remote.workspaceFiles 命名空间。
     * @param {string} sessionId - 该工作区的授权会话 id（sessionIds[0]）。
     * @param {AbortSignal} signal - 取消信号。
     * @returns {Promise<{status:string, files:number, symbols:number, cards:number, docs:number, updatedAt:string}>}
     *   status 为 'ready'（有索引）/ 'no-asset'（无索引）。
     */
    async function loadWorkspaceStats(wf, sessionId, signal) {
      let idx = null
      try {
        idx = await readJson(wf, sessionId, `${ASSET_DIR}/index.json`, signal)
      } catch (err) {
        // 索引缺失按"尚未生成"呈现，不当作失败
        const code = remoteErrorCode(err)
        if (code !== 'workspace-file/not-found') throw err
      }
      if (!idx || !Array.isArray(idx.files)) {
        return { status: 'no-asset', files: 0, symbols: 0, cards: 0, docs: 0, updatedAt: '' }
      }
      const [cards, docs] = await Promise.all([
        countDirMd(wf, sessionId, `${ASSET_DIR}/knowledge`, signal),
        countDirMd(wf, sessionId, `${ASSET_DIR}/wiki`, signal),
      ])
      return {
        status: 'ready',
        files: idx.stats?.files ?? idx.files.length,
        symbols: idx.stats?.symbols ?? idx.files.reduce((a, f) => a + (Array.isArray(f.symbols) ? f.symbols.length : 0), 0),
        cards,
        docs,
        updatedAt: typeof idx.generatedAt === 'string' ? idx.generatedAt : '',
      }
    }

    /**
     * 解析卡片的 JSON frontmatter 与正文（与 src/knowledge.js parseCard 同构）。
     * @param {string} text - 卡片文件内容。
     * @returns {{meta:object, body:string}|null} 失败返回 null。
     */
    function parseCardText(text) {
      const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)
      if (!m) return null
      try {
        const meta = JSON.parse(m[1])
        if (typeof meta !== 'object' || meta === null) return null
        return { meta, body: m[2] }
      } catch {
        return null
      }
    }

    /**
     * 从卡片正文取"概要 / Summary"节首段（与 knowledge.js cardSummaryFromBody 同构）。
     * @param {string} body - frontmatter 之后的正文。
     * @returns {string} 概要文本（缺失返回空串）。
     */
    function summaryFromBody(body) {
      const m = /## 概要 \/ Summary\n\n([\s\S]*?)(?=\n## )/.exec(body)
      return m ? m[1].trim().split('\n')[0] : ''
    }

    /**
     * 受限并发映射（避免对卡片目录一次性打出过多 Remote 调用）。
     * @param {Array} items - 待处理项。
     * @param {number} limit - 并发上限。
     * @param {(item:*, index:number)=>Promise<*>} fn - 映射函数。
     * @returns {Promise<Array>} 结果数组（保持原顺序）。
     */
    async function mapLimit(items, limit, fn) {
      const out = new Array(items.length)
      let cursor = 0
      const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
          const index = cursor++
          out[index] = await fn(items[index], index)
        }
      })
      await Promise.all(workers)
      return out
    }

    /**
     * 装载某 locale 的卡片清单（优先匹配 UI locale，否则取第一个子目录）。
     * @param {object} wf - remote.workspaceFiles 命名空间。
     * @param {string} sessionId - 授权会话 id。
     * @param {string} locale - 面板 locale（zh/en）。
     * @param {AbortSignal} signal - 取消信号。
     * @returns {Promise<{locale:string, cards:object[]}>} 卡片数组。
     */
    async function loadCards(wf, sessionId, locale, signal) {
      const knowledgeDir = `${ASSET_DIR}/knowledge`
      const subs = await listChildren(wf, sessionId, knowledgeDir, signal)
      const locales = subs.filter(e => e.type === 'directory').map(e => e.name).sort()
      const chosen = locales.includes(locale) ? locale : locales[0]
      if (!chosen) return { locale: '', cards: [] }
      const entries = await listChildren(wf, sessionId, `${knowledgeDir}/${chosen}`, signal)
      const cardFiles = entries.filter(e => e.type === 'file' && e.name.endsWith('.md'))
      const cards = await mapLimit(cardFiles, CARD_CONCURRENCY, async (entry) => {
        try {
          const text = await readFileText(wf, sessionId, `${knowledgeDir}/${chosen}/${entry.name}`, signal)
          const parsed = parseCardText(text)
          if (!parsed || typeof parsed.meta.path !== 'string') return null
          return {
            file: `knowledge/${chosen}/${entry.name}`,
            path: parsed.meta.path,
            title: typeof parsed.meta.title === 'string' ? parsed.meta.title : entry.name,
            tags: Array.isArray(parsed.meta.tags) ? parsed.meta.tags.slice(0, 4) : [],
            generatedAt: typeof parsed.meta.generatedAt === 'string' ? parsed.meta.generatedAt : '',
            sourceDigest: typeof parsed.meta.sourceDigest === 'string' ? parsed.meta.sourceDigest : '',
            summary: summaryFromBody(parsed.body),
            body: parsed.body,
          }
        } catch {
          // 单张坏卡不阻断整批枚举
          return null
        }
      })
      return { locale: chosen, cards: cards.filter(Boolean) }
    }

    /**
     * 装载某 locale 的 Wiki 页面清单（切片 3：面板内浏览；正文一并读取，
     * 面板直接以原文呈现，Markdown 渲染留待后续）。
     * @param {object} wf - remote.workspaceFiles 命名空间。
     * @param {string} sessionId - 授权会话 id。
     * @param {string} locale - 面板 locale。
     * @param {AbortSignal} signal - 取消信号。
     * @returns {Promise<object[]>} 页面对象（file/title/generatedAt/text）。
     */
    async function loadWikiEntries(wf, sessionId, locale, signal) {
      const wikiDir = `${ASSET_DIR}/wiki`
      let subs
      try {
        subs = await listChildren(wf, sessionId, wikiDir, signal)
      } catch {
        return []
      }
      const locales = subs.filter(e => e.type === 'directory').map(e => e.name).sort()
      const chosen = locales.includes(locale) ? locale : locales[0]
      if (!chosen) return []
      let entries
      try {
        entries = await listChildren(wf, sessionId, `${wikiDir}/${chosen}`, signal)
      } catch {
        return []
      }
      const pages = entries.filter(e => e.type === 'file' && e.name.endsWith('.md'))
      const list = await mapLimit(pages, CARD_CONCURRENCY, async (entry) => {
        try {
          const text = await readFileText(wf, sessionId, `${wikiDir}/${chosen}/${entry.name}`, signal)
          let title = entry.name.replace(/\.md$/, '')
          let generatedAt = ''
          const m = /^---\n([\s\S]*?)\n---\n/.exec(text)
          if (m) {
            try {
              const meta = JSON.parse(m[1])
              if (typeof meta.title === 'string') title = meta.title
              if (typeof meta.generatedAt === 'string') generatedAt = meta.generatedAt
            } catch {
              // 坏 frontmatter 时退化为文件名作标题
            }
          }
          return { file: `wiki/${chosen}/${entry.name}`, title, generatedAt, text }
        } catch {
          return null
        }
      })
      return list.filter(Boolean)
    }

    /**
     * 装载某 locale 的会话记忆条目（Phase 4 面板视图：第三页签）。
     * @param {object} wf - remote.workspaceFiles 命名空间。
     * @param {string} sessionId - 授权会话 id。
     * @param {string} locale - 面板 locale。
     * @param {AbortSignal} signal - 取消信号。
     * @returns {Promise<object[]>} 条目（file/slug/title/status/tags/createdAt/text）。
     */
    async function loadMemoryEntries(wf, sessionId, locale, signal) {
      const memoryDir = `${ASSET_DIR}/memory`
      let subs
      try {
        subs = await listChildren(wf, sessionId, memoryDir, signal)
      } catch {
        return []
      }
      const locales = subs.filter(e => e.type === 'directory').map(e => e.name).sort()
      const chosen = locales.includes(locale) ? locale : locales[0]
      if (!chosen) return []
      let entries
      try {
        entries = await listChildren(wf, sessionId, `${memoryDir}/${chosen}`, signal)
      } catch {
        return []
      }
      const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.md'))
      const list = await mapLimit(files, CARD_CONCURRENCY, async (entry) => {
        try {
          const text = await readFileText(wf, sessionId, `${memoryDir}/${chosen}/${entry.name}`, signal)
          const parsed = parseCardText(text)
          if (!parsed) return null
          return {
            file: `memory/${chosen}/${entry.name}`,
            slug: entry.name.replace(/\.md$/, ''),
            title: typeof parsed.meta.title === 'string' ? parsed.meta.title : entry.name,
            status: typeof parsed.meta.status === 'string' ? parsed.meta.status : 'pending',
            tags: Array.isArray(parsed.meta.tags) ? parsed.meta.tags : [],
            createdAt: typeof parsed.meta.createdAt === 'string' ? parsed.meta.createdAt : '',
            text,
          }
        } catch {
          return null
        }
      })
      return list.filter(Boolean)
    }

    /* ── 页面 ── */

    /**
     * Repo Wiki 主页面（切片 1：单工作区面板）。
     * props 由 main slot 的 inject face 提供：t（文案）、workspaces
     * （{items, subscribe}）、startSession、files（remote.workspaceFiles）、notice。
     * @param {object} props - 页面注入。
     * @returns {object} 页面元素。
     */
    function RepoWikiPage(props) {
      const { t, workspaces, startSession, files, notice } = props
      const [items, setItems] = useState(() => workspaces.list.getSnapshot().items)
      const [selected, setSelected] = useState('')
      const [status, setStatus] = useState('idle')
      const [errorCode, setErrorCode] = useState('')
      const [index, setIndex] = useState(null)
      const [cards, setCards] = useState([])
      const [docs, setDocs] = useState(0)
      const [wikis, setWikis] = useState([])
      const [memories, setMemories] = useState([])
      const [tab, setTab] = useState('cards')
      const [wikiSelected, setWikiSelected] = useState(null)
      const [memorySelected, setMemorySelected] = useState(null)
      const [filter, setFilter] = useState('all')
      const [query, setQuery] = useState('')
      const [view, setView] = useState('grid')
      const [detail, setDetail] = useState(null)
      // 打开详情前的焦点元素；关闭详情时归还焦点（无障碍：详情打开聚焦其内控件，
      // 关闭后回到触发它的瓦片，键盘用户不必重新定位）
      const prevFocusRef = useRef(null)
      const openDetail = (row) => {
        // 鸭子类型判断（不依赖全局 HTMLElement，测试环境可能未导出该类）
        const active = typeof document !== 'undefined' ? document.activeElement : null
        if (active && typeof active.focus === 'function') prevFocusRef.current = active
        setDetail(row)
      }
      const closeDetail = () => {
        setDetail(null)
        prevFocusRef.current?.focus?.()
        prevFocusRef.current = null
      }
      const [overview, setOverview] = useState(true)
      const [overviewRows, setOverviewRows] = useState([])
      const [overviewStatus, setOverviewStatus] = useState('idle')
      // 总览刷新节拍：页面重新可见时 +1，驱动总览 effect 重取各工作区统计
      const [overviewTick, setOverviewTick] = useState(0)
      const [message, setMessage] = useState('')
      const latestRequest = useRef(0)

      // 订阅工作区列表变更（增删/重命名时下拉同步）
      useEffect(() => workspaces.list.subscribe(() => {
        setItems(workspaces.list.getSnapshot().items)
      }), [workspaces])

      /** 当前选中的 workspaceId（列表变化时清掉失效选择）。 */
      const current = items.some(w => w.workspaceId === selected) ? selected : ''

      /** 带插值兜底的文案函数（替换 {key} 占位）。 */
      const tt = useCallback((key, params) => {
        const text = t(key)
        if (!params) return text
        return text.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''))
      }, [t])

      /**
       * 装载所选工作区的知识库数据（index + 卡片 + 文档计数）。
       * @param {AbortSignal} signal - 取消信号。
       */
      const load = useCallback(async (signal) => {
        const workspace = items.find(w => w.workspaceId === selected)
        const sessionId = workspace?.sessionIds?.[0]
        if (!sessionId) {
          setStatus('no-session')
          setIndex(null)
          setCards([])
          setDocs(0)
          setWikis([])
          setMemories([])
          return
        }
        const requestId = ++latestRequest.current
        setStatus('loading')
        setErrorCode('')
        try {
          const wf = files
          if (!wf || typeof wf.read !== 'function' || typeof wf.list !== 'function') {
            throw new Error('workspace-file/unavailable')
          }
          let parsedIndex = null
          try {
            parsedIndex = await readJson(wf, sessionId, `${ASSET_DIR}/index.json`, signal)
          } catch (err) {
            // 索引缺失按"尚未生成"呈现，不当作失败
            const code = remoteErrorCode(err)
            if (code !== 'workspace-file/not-found') throw err
          }
          if (signal.aborted || requestId !== latestRequest.current) return
          if (!parsedIndex || !Array.isArray(parsedIndex.files)) {
            setStatus('no-asset')
            setIndex(null)
            setCards([])
            setDocs(0)
            setWikis([])
            setMemories([])
            return
          }
          const { cards: loaded } = await loadCards(wf, sessionId, localeName(t), signal)
          const wikiPages = await loadWikiEntries(wf, sessionId, localeName(t), signal)
          if (signal.aborted || requestId !== latestRequest.current) return
          setIndex(parsedIndex)
          setCards(loaded)
          setDocs(wikiPages.length)
          setWikis(wikiPages)
          setMemories(await loadMemoryEntries(wf, sessionId, localeName(t), signal))
          setStatus('ready')
        } catch (err) {
          if (signal.aborted || requestId !== latestRequest.current) return
          setErrorCode(remoteErrorCode(err))
          setStatus('error')
        }
      }, [files, items, selected, t])

      // 选中工作区变化时装载（可取消）
      useEffect(() => {
        if (!current) {
          setStatus('idle')
          setIndex(null)
          setCards([])
          setDocs(0)
          setWikis([])
          setMemories([])
          return
        }
        const ac = new AbortController()
        load(ac.signal)
        return () => ac.abort()
      }, [load, current])

      // 总览模式：并发统计各工作区（切片 2——每行一个工作区，点击下钻单库）
      useEffect(() => {
        if (!overview || items.length === 0) {
          setOverviewRows([])
          setOverviewStatus('idle')
          return
        }
        const ac = new AbortController()
        const requestId = ++latestRequest.current
        setOverviewStatus('loading')
        ;(async () => {
          try {
            const rows = await mapLimit(items, OVERVIEW_CONCURRENCY, async (ws) => {
              const sessionId = ws.sessionIds?.[0]
              const base = {
                workspaceId: ws.workspaceId, title: ws.title || ws.path, path: ws.path,
                files: 0, symbols: 0, cards: 0, docs: 0, updatedAt: '',
              }
              if (!sessionId) return { ...base, status: 'no-session' }
              try {
                return { ...base, ...await loadWorkspaceStats(files, sessionId, ac.signal) }
              } catch (err) {
                return { ...base, status: 'error', errorCode: remoteErrorCode(err) }
              }
            })
            if (ac.signal.aborted || requestId !== latestRequest.current) return
            setOverviewRows(rows)
            setOverviewStatus('ready')
          } catch {
            if (!ac.signal.aborted && requestId === latestRequest.current) {
              setOverviewStatus('error')
            }
          }
        })()
        return () => ac.abort()
      }, [overview, items, files, overviewTick])

      // 回到页面时刷新一次（会话里生成完成后切回可见结果）；总览模式同样刷新
      useEffect(() => {
        const onVisibility = () => {
          if (document.hidden) return
          if (current) {
            const ac = new AbortController()
            load(ac.signal)
          }
          if (overview) setOverviewTick((n) => n + 1)
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () => document.removeEventListener('visibilitychange', onVisibility)
      }, [load, current, overview])

      // Escape 关闭详情（卡片详情与记忆详情共用）
      useEffect(() => {
        if (!detail && !memorySelected) return
        const onKey = (e) => {
          if (e.key !== 'Escape') return
          if (detail) closeDetail()
          if (memorySelected) setMemorySelected(null)
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [detail, memorySelected])

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

      /**
       * 事件处理器兜底包装：React 错误边界不捕获事件处理器（onClick/onChange）
       * 抛错——事件期异常只会进控制台，用户端表现为"点击无反应"。guard 把
       * 同步抛错与异步拒绝都转为可读消息行（role=status），让失败模式可见。
       * @param {string} label - 诊断用的处理器标识（写入消息正文）。
       * @param {Function} fn - 原处理器。
       * @returns {Function} 包装后的处理器。
       */
      const guard = (label, fn) => (e) => {
        try {
          const result = fn(e)
          if (result && typeof result.catch === 'function') {
            result.catch((err) => setMessage(`${t('actionFailed')} (${label}): ${err?.message ?? err}`))
          }
          return result
        } catch (err) {
          setMessage(`${t('actionFailed')} (${label}): ${err?.message ?? err}`)
        }
      }

      /* 派生视图数据 */
      const cardByPath = useMemo(() => new Map(cards.map(c => [c.path, c])), [cards])
      const rows = useMemo(() => (index?.files ?? []).map((f) => ({
        path: f.path,
        lang: f.lang,
        symbols: Array.isArray(f.symbols) ? f.symbols.length : 0,
        card: cardByPath.get(f.path) || null,
      })), [index, cardByPath])
      /** 待更新卡片：卡片记录的 sourceDigest 与索引 digest 不一致（切片 3 更新检测） */
      const staleSet = useMemo(() => {
        const digestByPath = new Map((index?.files ?? []).map(f => [f.path, f.digest]))
        const stale = new Set()
        for (const card of cards) {
          const digest = digestByPath.get(card.path)
          if (digest !== undefined && digest !== card.sourceDigest) stale.add(card.path)
        }
        return stale
      }, [index, cards])
      const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        return rows.filter((r) => {
          if (filter === 'generated' && !r.card) return false
          if (filter === 'pending' && r.card) return false
          if (filter === 'stale' && !(r.card && staleSet.has(r.path))) return false
          if (!q) return true
          const hay = [r.path, r.card?.title, r.card?.summary, ...(r.card?.tags ?? [])]
            .join('\u0001').toLowerCase()
          return hay.includes(q)
        })
      }, [rows, filter, query])
      const pendingCount = useMemo(() => rows.filter(r => !r.card).length, [rows])
      const latestUpdate = useMemo(() => cards
        .map(c => c.generatedAt)
        .filter(Boolean)
        .sort()
        .pop() || '', [cards])

      /* 样式（主题令牌 + 字面量回退） */
      const buttonStyle = {
        padding: '8px 14px', borderRadius: 'var(--dsw-radius-sm, 8px)', cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l2, #d1d5db)',
        background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
        color: 'var(--dsw-alias-label-primary, #111827)',
        fontSize: 14,
      }
      const primaryStyle = {
        ...buttonStyle,
        background: 'var(--dsw-alias-state-business-primary, #2563eb)',
        // 与 buttonStyle 的 border 同为简写形态（避免 shorthand/longhand 混用导致重渲染时的样式警告）
        border: '1px solid transparent',
        // 官方"彩色底上的文字"令牌（深色模式按钮底变浅时亦有对应重定义，保证对比度）
        color: 'var(--dsw-alias-label-on-color, #ffffff)',
      }
      const inputStyle = {
        flex: 1, padding: '8px 10px', borderRadius: 'var(--dsw-radius-sm, 8px)', fontSize: 14,
        border: '1px solid var(--dsw-alias-border-l2, #d1d5db)',
        background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
        color: 'var(--dsw-alias-label-primary, #111827)',
      }
      const muted = { color: 'var(--dsw-alias-label-secondary, #6b7280)' }
      const cardChip = {
        border: '1px solid var(--dsw-alias-border-l2, #d1d5db)',
        borderRadius: 'var(--dsw-radius-md, 12px)', padding: 14, cursor: 'pointer',
        background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
      }

      /** 筛选切换按钮（带计数与 aria-pressed）。 */
      const filterButton = (value, label, count) => h('button', {
        type: 'button',
        'aria-pressed': filter === value,
        onClick: guard('filter', () => setFilter(value)),
        style: filter === value ? primaryStyle : buttonStyle,
      }, `${label}${count > 0 ? ` ${count}` : ''}`)

      return h(ErrorBoundary, null, h('div', {
        style: { padding: '24px 28px', maxWidth: 960, margin: '0 auto' },
        'aria-label': t('title'),
      },
        h('h1', { style: { margin: '0 0 4px', fontSize: 22 } }, t('title')),
        h('p', { style: { margin: '0 0 20px', ...muted } }, t('subtitle')),

        // 头部行：工作区下拉 + 模式切换 + 刷新
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 } },
          h('label', { htmlFor: 'repowiki-workspace', style: { fontSize: 14 } }, t('workspace')),
          items.length === 0
            ? h('span', { style: { ...inputStyle, display: 'inline-flex', alignItems: 'center', ...muted } }, t('empty'))
            : h('select', {
                id: 'repowiki-workspace', value: current, inputMode: 'none',
                style: inputStyle,
                onChange: guard('pick-workspace', (e) => {
                  setSelected(e.target.value)
                  setOverview(false)
                }),
                'aria-label': t('pickHint'),
              },
                h('option', { value: '' }, t('pickHint')),
                ...items.map(w => h('option', { key: w.workspaceId, value: w.workspaceId },
                  `${w.title || w.path} — ${w.path}`)),
              ),
          h('button', {
            type: 'button', 'aria-pressed': overview,
            style: overview ? primaryStyle : buttonStyle,
            onClick: guard('mode-overview', () => setOverview(true)),
          }, t('modeOverview')),
          h('button', {
            type: 'button', 'aria-pressed': !overview,
            style: !overview ? primaryStyle : buttonStyle,
            onClick: guard('mode-single', () => setOverview(false)),
          }, t('modeSingle')),
          h('button', {
            type: 'button', style: buttonStyle, onClick: guard('reload', () => {
              if (current) {
                const ac = new AbortController()
                load(ac.signal)
              } else {
                setOverviewRows([])
                setOverviewStatus('idle')
              }
            }),
            'aria-label': t('reload'),
          }, t('reload')),
        ),

        // 生成动作（单库模式才需要选定工作区）
        !overview && h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 } },
          h('button', { type: 'button', style: primaryStyle, onClick: guard('generate-all', () => run('all')) }, t('actionAll')),
          h('button', { type: 'button', style: buttonStyle, onClick: guard('generate-index', () => run('index')) }, t('actionIndex')),
          h('button', { type: 'button', style: buttonStyle, onClick: guard('generate-extract', () => run('extract')) }, t('actionExtract')),
          h('button', { type: 'button', style: buttonStyle, onClick: guard('generate-wiki', () => run('generate')) }, t('actionGenerate')),
        ),
        !overview && h('p', { style: { margin: '0 0 16px', fontSize: 13, ...muted } }, t('note')),

        // 统计行（仅在单库模式、数据就绪时渲染）
        !overview && status === 'ready' && index && h('div', {
          style: { display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12, fontSize: 13, ...muted },
        },
          h('span', null, tt('statFiles', { n: index.stats?.files ?? rows.length })),
          h('span', null, tt('statSymbols', { n: index.stats?.symbols ?? rows.reduce((a, r) => a + r.symbols, 0) })),
          h('span', null, tt('statCards', { n: cards.length })),
          h('span', null, tt('statDocs', { n: docs })),
          h('span', null, latestUpdate
            ? tt('updated', { when: latestUpdate.slice(0, 10) })
            : t('never')),
          staleSet.size > 0 && h('span', {
            style: { color: 'var(--dsw-alias-state-error-primary, #dc2626)' },
            role: 'status',
          }, tt('staleHint', { n: staleSet.size })),
        ),

        // 状态分支（单库模式）
        !overview && status === 'idle' && h('p', { role: 'status', style: { ...muted } }, t('pickHint')),
        !overview && status === 'no-session' && h('p', { role: 'status', style: { ...muted } }, t('noSession')),
        !overview && status === 'no-asset' && h('p', { role: 'status', style: { ...muted } }, t('noAsset')),
        !overview && status === 'loading' && h('p', { role: 'status', style: { ...muted } }, t('loading')),
        !overview && status === 'error' && h('div', { role: 'alert' },
          h('p', { style: { margin: '0 0 8px', color: 'var(--dsw-alias-state-error-primary, #dc2626)' } },
            tt('loadFailed', { code: errorCode })),
          h('button', {
            type: 'button', style: buttonStyle,
            onClick: () => {
              if (!current) return
              const ac = new AbortController()
              load(ac.signal)
            },
          }, t('retry')),
        ),

        // 主区：卡片/Wiki 双页签 + 筛选 + 搜索 + 视图切换 + 列表（单库模式）
        !overview && status === 'ready' && h('div', null,
          h('div', { style: { display: 'flex', gap: 8, marginBottom: 12 } },
            h('button', {
              type: 'button', 'aria-pressed': tab === 'cards',
              style: tab === 'cards' ? primaryStyle : buttonStyle,
              onClick: guard('tab-cards', () => setTab('cards')),
            }, t('viewCards')),
            h('button', {
              type: 'button', 'aria-pressed': tab === 'wiki',
              style: tab === 'wiki' ? primaryStyle : buttonStyle,
              onClick: guard('tab-wiki', () => setTab('wiki')),
            }, `${t('viewWiki')} ${wikis.length}`),
            h('button', {
              type: 'button', 'aria-pressed': tab === 'memory',
              style: tab === 'memory' ? primaryStyle : buttonStyle,
              onClick: guard('tab-memory', () => setTab('memory')),
            }, `${t('viewMemory')} ${memories.length}`),
          ),
          tab === 'cards' && h('div', null,
            h('div', {
              style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
            },
              filterButton('all', t('filterAll'), rows.length),
              filterButton('generated', t('filterGenerated'), rows.length - pendingCount),
              filterButton('pending', t('filterPending'), pendingCount),
              filterButton('stale', t('staleFilter'), staleSet.size),
            h('input', {
              type: 'search', style: { ...inputStyle, maxWidth: 280 },
              placeholder: t('searchPlaceholder'),
              value: query,
              onChange: (e) => setQuery(e.target.value),
              'aria-label': t('searchPlaceholder'),
            }),
            h('button', {
              type: 'button', style: view === 'grid' ? primaryStyle : buttonStyle,
              onClick: guard('view-grid', () => setView('grid')), 'aria-pressed': view === 'grid',
              'aria-label': t('viewGrid'),
            }, t('viewGrid')),
            h('button', {
              type: 'button', style: view === 'list' ? primaryStyle : buttonStyle,
              onClick: guard('view-list', () => setView('list')), 'aria-pressed': view === 'list',
              'aria-label': t('viewList'),
            }, t('viewList')),
          ),
          filtered.length === 0
            ? h('p', { style: { ...muted }, role: 'status' },
                query
                  ? tt('emptySearch', { q: query })
                  : t({
                      all: 'emptyCards',
                      generated: 'emptyGenerated',
                      pending: 'emptyDone',
                      stale: 'emptyStale',
                    }[filter]))
            : (view === 'grid'
                ? h('div', {
                    style: {
                      display: 'grid', gap: 12,
                      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                    },
                  },
                  ...filtered.map((r) => h(CardTile, {
                    key: r.path, row: r, t, tt, onOpen: guard('open-card', () => openDetail(r)),
                  })),
                )
                : h('div', null,
                  ...filtered.map((r) => h(CardRow, {
                    key: r.path, row: r, t, tt, onOpen: guard('open-card', () => openDetail(r)),
                  })),
                )),
          // 内联详情列（切片 1 不开新页面；Escape 或按钮关闭）
          detail && h(DetailPane, {
            row: detail, t, tt, onClose: guard('close-detail', () => closeDetail()),
          }),
          ),
          // Wiki 页签：页面列表与单页原文浏览（切片 3）
          tab === 'wiki' && h(WikiPanel, {
            entries: wikis,
            selected: wikiSelected,
            onSelect: guard('open-wiki', (entry) => setWikiSelected(entry)),
            onClose: guard('close-wiki', () => setWikiSelected(null)),
            t, tt,
          }),
          // 记忆页签：条目列表（状态徽章）与单条原文浏览（Phase 4）
          tab === 'memory' && h(MemoryPanel, {
            entries: memories,
            selected: memorySelected,
            onSelect: guard('open-memory', (entry) => setMemorySelected(entry)),
            onClose: guard('close-memory', () => setMemorySelected(null)),
            t, tt,
          }),
        ),
        // 总览模式：每行一个工作区的生成状态（切片 2）
        overview && h(OverviewPanel, {
          rows: overviewRows, status: overviewStatus, t, tt,
          onOpen: guard('open-workspace', (workspaceId) => {
            setSelected(workspaceId)
            setOverview(false)
          }),
        }),

        message && h('p', {
          role: 'status',
          style: { margin: '12px 0 0', fontSize: 14, color: 'var(--dsw-alias-label-primary, #111827)' },
        }, message),
        notice,
      ),
      )
    }

    /**
     * 工作区总览面板（切片 2）：列出各工作区的知识库状态，
     * 点击行下钻到单库视图。每行统计来自该工作区自己的会话 scope
     * （sessionIds[0]），与单库视图同一数据通道。
     * @param {object} props - { rows, status, t, tt, onOpen }。
     * @returns {object} 面板元素。
     */
    function OverviewPanel({ rows, status, t, tt, onOpen }) {
      if (status === 'loading' || status === 'idle') {
        return h('p', { role: 'status', style: { ...mutedStyle() } }, t('loading'))
      }
      if (rows.length === 0) {
        return h('p', { role: 'status', style: { ...mutedStyle() } }, t('empty'))
      }
      /** 行内状态文案（对齐单库视图的状态词汇）。 */
      const statusText = (row) => {
        if (row.status === 'ready') return null
        if (row.status === 'no-session') return t('noSession')
        if (row.status === 'no-asset') return t('noAsset')
        return tt('loadFailed', { code: row.errorCode ?? 'unknown' })
      }
      return h('div', null,
        ...rows.map((row) => h('button', {
          key: row.workspaceId,
          type: 'button',
          onClick: () => onOpen(row.workspaceId),
          style: {
            ...cardChipStyle(),
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            width: '100%', marginBottom: 8, padding: '10px 14px', textAlign: 'left',
          },
          'aria-label': `${t('modeSingle')}: ${row.title}`,
        },
          statusDot(row.status === 'ready'),
          h('span', {
            style: { flex: 1, minWidth: 120, fontSize: 14, fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: 'var(--dsw-alias-label-primary, #111827)' },
          }, row.title),
          h('span', {
            style: { fontSize: 12, flex: 'none', overflow: 'hidden', maxWidth: 260,
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: 'var(--dsw-alias-label-secondary, #6b7280)' },
          }, row.path),
          row.status === 'ready'
            ? h('span', {
                style: { display: 'flex', gap: 10, flex: 'none', flexWrap: 'wrap',
                  fontSize: 12, color: 'var(--dsw-alias-label-secondary, #6b7280)' },
              },
              h('span', null, tt('statFiles', { n: row.files })),
              h('span', null, tt('statSymbols', { n: row.symbols })),
              h('span', null, tt('statCards', { n: row.cards })),
              h('span', null, tt('statDocs', { n: row.docs })),
              row.updatedAt
                ? h('span', null, tt('updated', { when: row.updatedAt.slice(0, 10) }))
                : h('span', null, t('never')),
            )
            : h('span', {
                style: { fontSize: 12, flex: 'none', color: 'var(--dsw-alias-label-secondary, #6b7280)' },
              }, statusText(row)),
        )),
      )
    }

    /**
     * 页面级错误边界：子树渲染抛错时展示可读错误文案而非空白 slot
     * （ui-plugin.md："a throwing component blanks your slot entry"）。
     * 不吞错——componentDidCatch 往 console 打印，便于现场诊断。
     */
    class ErrorBoundary extends React.Component {
      /**
       * @param {object} props - 子元素。
       */
      constructor(props) {
        super(props)
        this.state = { error: '' }
      }

      /**
       * 渲染期错误转为状态（class field 形态兼容宿主 React 版本）。
       * @param {Error} error - 捕获的错误。
       * @returns {{error:string}} 新状态。
       */
      static getDerivedStateFromError(error) {
        return { error: error?.message ?? String(error) }
      }

      /**
       * 错误同时打到 console（slot entry crash 的诊断位置）。
       * @param {Error} error - 捕获的错误。
       */
      componentDidCatch(error) {
        console.error('repowiki: RepoWikiPanel error:', error)
      }

      render() {
        if (this.state.error) {
          return h('p', {
            role: 'alert',
            style: {
              padding: 16, fontSize: 13, margin: 16,
              color: 'var(--dsw-alias-state-error-primary, #dc2626)',
            },
          }, `Repo wiki panel error: ${this.state.error}`)
        }
        return this.props.children
      }
    }

    /** 状态点：已生成（done 紫）/未生成（灰）。取官方语义令牌而非蓝色的
     *  business-primary——灰蓝两色在 8px 尺寸下难以区分（用户反馈），紫色
     *  与灰色色相差距大，明暗模式各有对应定义。 */
    function statusDot(filled) {
      return h('span', {
        'aria-hidden': true,
        style: {
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          marginRight: 6, flex: 'none',
          background: filled
            ? 'var(--dsw-alias-state-done-primary, #7c3aed)'
            : 'var(--dsw-alias-border-l2, #d1d5db)',
        },
      })
    }

    /** 卡片瓦片（网格视图）。 */
    function CardTile({ row, t, tt, onOpen }) {
      const { card } = row
      return h('button', {
        type: 'button', onClick: onOpen,
        style: { ...cardChipStyle(), textAlign: 'left' },
        'aria-label': card ? card.title : `${row.path} (${t('pending')})`,
      },
        h('div', {
          style: { display: 'flex', alignItems: 'center', gap: 2, marginBottom: 6 },
        },
          statusDot(Boolean(card)),
          h('span', {
            style: { fontSize: 14, fontWeight: 600, flex: 1, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: 'var(--dsw-alias-label-primary, #111827)' },
          }, card ? card.title : row.path),
        ),
        h('div', {
          style: { fontSize: 12, marginBottom: 8, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--dsw-alias-label-secondary, #6b7280)' },
        },
          card ? card.summary || card.path : tt('pendingHint')),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
          card && card.tags.length > 0
            ? card.tags.map((tag) => h('span', { key: tag, style: tagStyle() }, tag))
            : h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #6b7280)' } },
                `${row.lang || ''} · ${tt('detailSymbols', { n: row.symbols })}`),
        ),
      )
    }

    /** 卡片行（列表视图）。 */
    function CardRow({ row, t, tt, onOpen }) {
      const { card } = row
      return h('button', {
        type: 'button', onClick: onOpen,
        style: {
          ...cardChipStyle(),
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          marginBottom: 8, padding: '8px 14px', textAlign: 'left',
        },
        'aria-label': card ? card.title : `${row.path} (${t('pending')})`,
      },
        statusDot(Boolean(card)),
        h('span', {
          style: { flex: 1, fontSize: 13, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--dsw-alias-label-primary, #111827)' },
        }, card ? `${card.title} · ${row.path}` : row.path),
        h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #6b7280)', flex: 'none' } },
          tt('detailSymbols', { n: row.symbols })),
        h('span', {
          style: { fontSize: 12, flex: 'none', color: 'var(--dsw-alias-label-secondary, #6b7280)' },
        }, card ? card.generatedAt.slice(0, 10) : t('pending')),
      )
    }

    /** 详情列（选中条目的元数据与摘要）。打开时聚焦关闭按钮，便于键盘用户直接操作。 */
    function DetailPane({ row, t, tt, onClose }) {
      const { card } = row
      const closeRef = useRef(null)
      useEffect(() => { closeRef.current?.focus?.() }, [])
      return h('div', {
        role: 'region', 'aria-label': card ? card.title : row.path,
        style: {
          marginTop: 12, padding: 16, borderRadius: 'var(--dsw-radius-md, 12px)',
          border: '1px solid var(--dsw-alias-border-l2, #d1d5db)',
          background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
          h('div', { style: { flex: 1, minWidth: 0 } },
            h('div', {
              style: { fontSize: 15, fontWeight: 600,
                color: 'var(--dsw-alias-label-primary, #111827)' },
            }, card ? card.title : row.path),
            h('div', {
              style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #6b7280)' },
            }, row.path),
          ),
          h('button', {
            ref: closeRef,
            type: 'button', onClick: onClose, style: chipButtonStyle(),
            'aria-label': t('detailClose'),
          }, '×'),
        ),
        card
          ? h('div', null,
              h('div', {
                style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
              },
                ...card.tags.map((tag) => h('span', { key: tag, style: tagStyle() }, tag)),
                h('span', {
                  style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #6b7280)' },
                }, tt('detailGeneratedAt', { when: card.generatedAt.slice(0, 10) || '—' })),
                h('span', {
                  style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #6b7280)' },
                }, tt('detailSymbols', { n: row.symbols })),
              ),
              h('div', {
                style: { fontSize: 13, fontWeight: 600, marginBottom: 6,
                  color: 'var(--dsw-alias-label-primary, #111827)' },
              }, t('detailSummary')),
              ...(card.body
                ? renderMarkdown(card.body.replace(/^\s*#[^\n]*\n+/, ''))
                : [h('p', {
                    style: { margin: 0, fontSize: 13, lineHeight: 1.6,
                      whiteSpace: 'pre-wrap', color: 'var(--dsw-alias-label-primary, #111827)' },
                  }, card.summary || t('never'))]),
            )
          : h('p', { style: { fontSize: 13, ...mutedStyle() } }, t('pendingHint')),
      )
    }

    /** Wiki 面板：页面列表与单页原文浏览（切片 3，无 Markdown 渲染器，暂以原文呈现）。 */
    function WikiPanel({ entries, selected, onSelect, onClose, t }) {
      if (selected) {
        return h('div', null,
          h('div', {
            style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
          },
            h('button', {
              type: 'button', style: chipButtonStyle(), onClick: onClose,
              'aria-label': t('wikiBack'),
            }, '←'),
            h('h2', {
              style: { margin: 0, fontSize: 16, color: 'var(--dsw-alias-label-primary, #111827)' },
            }, selected.title),
          ),
          // 原文 Markdown 渲染为排版文字（frontmatter 由渲染器跳过）
          h('div', { style: { maxHeight: 560, overflow: 'auto' } }, ...renderMarkdown(selected.text)),
        )
      }
      if (entries.length === 0) {
        return h('p', { style: { ...mutedStyle() } }, t('wikiEmpty'))
      }
      return h('div', null,
        ...entries.map((entry) => h('button', {
          key: entry.file,
          type: 'button',
          onClick: () => onSelect(entry),
          style: {
            ...cardChipStyle(),
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            marginBottom: 8, padding: '8px 14px', textAlign: 'left',
          },
          'aria-label': entry.title,
        },
          h('span', {
            style: { flex: 1, fontSize: 13, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: 'var(--dsw-alias-label-primary, #111827)' },
          }, entry.title),
          h('span', {
            style: { fontSize: 12, flex: 'none', color: 'var(--dsw-alias-label-secondary, #6b7280)' },
          }, entry.generatedAt.slice(0, 10) || '—'),
        )),
      )
    }

    /** 记忆面板：条目列表（状态徽章）与单条原文浏览（Phase 4 面板视图）。 */
    function MemoryPanel({ entries, selected, onSelect, onClose, t }) {
      if (selected) {
        return h('div', null,
          h('div', {
            style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
          },
            h('button', {
              type: 'button', style: chipButtonStyle(), onClick: onClose,
              'aria-label': t('wikiBack'),
            }, '←'),
            h('h2', {
              style: { margin: 0, fontSize: 16, color: 'var(--dsw-alias-label-primary, #111827)' },
            }, selected.title),
            h('span', {
              style: { ...statusPillStyle(selected.status), flex: 'none' },
            }, selected.status),
          ),
          // 原文 Markdown 渲染为排版文字（frontmatter 由渲染器跳过）
          h('div', { style: { maxHeight: 560, overflow: 'auto' } }, ...renderMarkdown(selected.text)),
        )
      }
      if (entries.length === 0) {
        return h('p', { style: { ...mutedStyle() } }, t('memoryEmpty'))
      }
      return h('div', null,
        ...entries.map((entry) => h('button', {
          key: entry.file,
          type: 'button',
          onClick: () => onSelect(entry),
          style: {
            ...cardChipStyle(),
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            marginBottom: 8, padding: '8px 14px', textAlign: 'left',
          },
          'aria-label': entry.title,
        },
          h('span', {
            style: { ...statusPillStyle(entry.status), flex: 'none' },
          }, entry.status),
          h('span', {
            style: { flex: 1, fontSize: 13, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: 'var(--dsw-alias-label-primary, #111827)' },
          }, entry.title),
          h('span', {
            style: { fontSize: 12, flex: 'none', color: 'var(--dsw-alias-label-secondary, #6b7280)' },
          }, entry.createdAt.slice(0, 10) || '—'),
        )),
      )
    }

    /** 记忆状态徽章样式（按 accepted/pending/rejected 取色）。 */
    function statusPillStyle(status) {
      const color = status === 'accepted'
        ? 'var(--dsw-alias-state-business-primary, #2563eb)'
        : status === 'rejected'
          ? 'var(--dsw-alias-state-error-primary, #dc2626)'
          : 'var(--dsw-alias-label-secondary, #6b7280)'
      return {
        fontSize: 11, padding: '2px 8px', borderRadius: 999,
        border: `1px solid ${color}`, color,
      }
    }

    /**
     * 极简 Markdown 渲染器（零依赖：practices 禁止引入第三方前端包，
     * 手写解析器复用宿主 React）。支持：frontmatter 跳过、#~/##~/### 标题、
     * 代码围栏、无序/有序列表、引用、分隔线、加粗、行内代码、链接。
     * 不支持表格/图片/嵌套列表（资产文本不含这些形态）。
     * @param {string} md - Markdown 文本。
     * @returns {Array} React 元素数组。
     */
    function renderMarkdown(md) {
      const lines = md.split('\n')
      const blocks = []
      let i = 0
      let key = 0
      const headingStyle = (level) => ({
        margin: level === 1 ? '0 0 10px' : '14px 0 6px',
        fontSize: level === 1 ? 18 : level === 2 ? 15 : 14,
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary, #111827)',
      })
      const paragraphStyle = { margin: '0 0 10px', fontSize: 13, lineHeight: 1.6 }
      while (i < lines.length) {
        const line = lines[i]
        // frontmatter（首行 --- 到下一个 ---）跳过不渲染
        if (line === '---' && i === 0) {
          const end = lines.indexOf('---', 1)
          if (end > 0) { i = end + 1; continue }
        }
        // 代码围栏
        if (line.startsWith('```')) {
          const codeLines = []
          i++
          while (i < lines.length && !lines[i].startsWith('```')) {
            codeLines.push(lines[i]); i++
          }
          i++ // 闭合围栏
          blocks.push(h('pre', {
            key: key++,
            style: {
              padding: 12, borderRadius: 'var(--dsw-radius-sm, 8px)', fontSize: 12, lineHeight: 1.5,
              overflow: 'auto', margin: '0 0 10px',
              background: 'var(--dsw-alias-bg-layer-2, #f3f4f6)',
              border: '1px solid var(--dsw-alias-border-l2, #d1d5db)',
            },
          }, codeLines.join('\n')))
          continue
        }
        // 标题（# ~ ###）
        const heading = /^(#{1,3})\s+(.*)$/.exec(line)
        if (heading) {
          const level = heading[1].length
          blocks.push(h(`h${level + 1}`, { key: key++, style: headingStyle(level) },
            ...inlineText(heading[2])))
          i++
          continue
        }
        // 分隔线（独占一行的 ---）
        if (/^-{3,}$/.test(line)) {
          blocks.push(h('hr', {
            key: key++,
            style: { border: 0, margin: '12px 0', borderTop: '1px solid var(--dsw-alias-border-l2, #d1d5db)' },
          }))
          i++
          continue
        }
        // 引用
        if (line.startsWith('> ')) {
          const quoteLines = []
          while (i < lines.length && lines[i].startsWith('> ')) {
            quoteLines.push(lines[i].slice(2)); i++
          }
          blocks.push(h('blockquote', {
            key: key++,
            style: {
              margin: '0 0 10px', padding: '6px 12px',
              borderLeft: `3px solid var(--dsw-alias-border-l2, #d1d5db)`,
              color: 'var(--dsw-alias-label-secondary, #6b7280)', fontSize: 13,
            },
          }, ...quoteLines.map((t, k) => h('div', { key: k }, ...inlineText(t)))))
          continue
        }
        // 无序列表
        if (/^[-*]\s+/.test(line)) {
          const items = []
          while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
            items.push(lines[i].replace(/^[-*]\s+/, '')); i++
          }
          blocks.push(h('ul', {
            key: key++, style: { margin: '0 0 10px', paddingLeft: 20, fontSize: 13, lineHeight: 1.6 },
          }, ...items.map((t, k) => h('li', { key: k }, ...inlineText(t)))))
          continue
        }
        // 有序列表
        if (/^\d+\.\s+/.test(line)) {
          const items = []
          while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
            items.push(lines[i].replace(/^\d+\.\s+/, '')); i++
          }
          blocks.push(h('ol', {
            key: key++, style: { margin: '0 0 10px', paddingLeft: 20, fontSize: 13, lineHeight: 1.6 },
          }, ...items.map((t, k) => h('li', { key: k }, ...inlineText(t)))))
          continue
        }
        // 空行
        if (line.trim() === '') { i++; continue }
        // 段落：连继行直到空行或块级起始
        const paraLines = []
        while (i < lines.length && lines[i].trim() !== ''
          && !/^(#{1,3}\s|```|-{3,}$|>\s|[-*]\s|\d+\.\s)/.test(lines[i])) {
          paraLines.push(lines[i]); i++
        }
        blocks.push(h('p', { key: key++, style: paragraphStyle },
          ...inlineText(paraLines.join(' '))))
      }
      return blocks
    }

    /**
     * 行内 Markdown：**加粗**、`代码`、[文本](链接) → h 数组。
     * @param {string} text - 行内文本。
     * @returns {Array} 字符串与元素混合数组。
     */
    function inlineText(text) {
      const tokens = []
      let rest = text
      let key = 0
      while (rest.length > 0) {
        const link = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest)
        const bold = /\*\*([^*]+)\*\*/.exec(rest)
        const code = /`([^`]+)`/.exec(rest)
        const candidates = [
          link ? {
            index: link.index, end: link.index + link[0].length,
            node: h('a', {
              key: key++, href: link[2], target: '_blank', rel: 'noreferrer noopener',
              style: { color: 'var(--dsw-alias-state-business-primary, #2563eb)' },
            }, link[1]),
          } : null,
          bold ? {
            index: bold.index, end: bold.index + bold[0].length,
            node: h('strong', { key: key++ }, bold[1]),
          } : null,
          code ? {
            index: code.index, end: code.index + code[0].length,
            node: h('code', {
              key: key++,
              style: {
                fontSize: 12, padding: '1px 4px', borderRadius: 'var(--dsw-radius-xs, 4px)',
                background: 'var(--dsw-alias-bg-layer-2, #f3f4f6)',
              },
            }, code[1]),
          } : null,
        ].filter(Boolean).sort((a, b) => a.index - b.index)
        if (candidates.length === 0) {
          tokens.push(rest)
          break
        }
        const next = candidates[0]
        if (next.index > 0) tokens.push(rest.slice(0, next.index))
        tokens.push(next.node)
        rest = rest.slice(next.end)
      }
      return tokens
    }

    /** 卡片瓦片/行共用外框样式。 */
    function cardChipStyle() {
      return {
        border: '1px solid var(--dsw-alias-border-l2, #d1d5db)',
        borderRadius: 'var(--dsw-radius-md, 12px)',
        background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
        cursor: 'pointer',
      }
    }

    /** 标签徽章样式。 */
    function tagStyle() {
      return {
        fontSize: 11, padding: '2px 8px', borderRadius: 999, flex: 'none',
        border: '1px solid var(--dsw-alias-border-l2, #d1d5db)',
        color: 'var(--dsw-alias-label-secondary, #6b7280)',
      }
    }

    /** 小号按钮样式（详情关闭等）。 */
    function chipButtonStyle() {
      return {
        width: 28, height: 28, borderRadius: 'var(--dsw-radius-sm, 8px)', flex: 'none', cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l2, #d1d5db)',
        background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
        color: 'var(--dsw-alias-label-primary, #111827)', fontSize: 16, lineHeight: 1,
      }
    }

    /** 次要文字样式（工具函数处复用）。 */
    function mutedStyle() {
      return { color: 'var(--dsw-alias-label-secondary, #6b7280)' }
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace', 'workspaces', 'remote', 'remote.workspaceFiles'],
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
              files: ctx.remote?.workspaceFiles,
            }),
          }, RepoWikiPage))
        })
      },
    }
  },
})

/**
 * 从 RemoteError（或普通错误）提取错误码。
 * @param {Error} err - 捕获的错误。
 * @returns {string} 错误码（缺失返回 unknown）。
 */
function remoteErrorCode(err) {
  return err?.code || err?.details?.code || (err?.message?.startsWith('workspace-file/') ? err.message : 'unknown')
}

/**
 * 从绑定的文案函数推断 UI locale（复用 t('never') 的语言兜底不可行时，
 * 回退 zh——卡片资产以中英两种子目录存在时优先匹配）。
 * @param {(key:string)=>string} t - 绑定的文案函数。
 * @returns {'zh'|'en'} locale 名。
 */
function localeName(t) {
  return t('reload') === '刷新' ? 'zh' : 'en'
}

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
