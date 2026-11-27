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

/** 单文件最多读取页数（Markdown 等：超出按截断处理）。 */
const READ_MAX_PAGES = 12

/**
 * JSON 资产（index/清单）的页数上限。索引随仓库规模增长，5000 文件上限下
 * index.json 可达数十万行；12 页（6 万行）会在大型仓库上截断成坏 JSON。
 */
const READ_MAX_PAGES_JSON = 120

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
    searchPlaceholder: '搜索标题 / 路径 / 标签 / 符号 / 正文 …',
    viewGrid: '网格视图',
    viewList: '列表视图',
    groupBy: '按模块分组',
    groupRoot: '根目录',
    statFiles: '文件 {n}',
    statSymbols: '符号 {n}',
    statCards: '卡片 {n}',
    statDocs: '文档 {n}',
    statLangs: '语言 {n}',
    statSkipped: '跳过文件 {n}',
    statSkippedHint: '索引时跳过的源文件（不可读或超过单文件上限）',
    statWarnings: '索引告警 {n}',
    statWarningsHint: '索引阶段发现的告警（如 Go internal 越界导入、跳过文件）',
    warningsDetails: '索引告警明细',
    warningsToggleHint: '点击展开全部告警',
    hubLabel: '高风险入口',
    hubHint: '被最多文件依赖（改动影响面最大）',
    coreLabel: '核心文件',
    coreHint: '按静态 import 图 PageRank 排名（计入间接重要性，与 fan-in 互补）',
    cycleBadgeHint: '参与 {n} 个文件的循环依赖',
    cycleBadgeRoute: '（如 {route}）',
    openFile: '打开 {path}',
    filterLang: '语言筛选',
    allLangs: '全部语言',
    langDistribution: '语言分布',
    langsMore: '另有 {n} 种',
    gitBranch: '分支 {name}',
    lastExtract: '上次抽取 {n} 张 · 失败 {failed} · 重试 {retried}',
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
    sortBy: '排序',
    sortPath: '按路径',
    sortTitle: '按标题',
    sortUpdated: '按更新时间',
    tagsLabel: '标签',
    clearTag: '清除标签',
    loadMore: '加载更多（剩余 {n}）',
    showing: '已显示 {shown} / {total}',
    wikiSearch: '搜索 Wiki 页面 …',
    wikiGeneral: '页面',
    wikiOrphan: '未入清单',
    wikiRangeBadge: '越界 {n}',
    wikiRangeHint: '{n} 处引用超出索引记录的文件行数',
    wikiIssueSummary: '引用问题：{outOfRange} 处行号越界 · {unchecked} 处未检查',
    wikiCoverageBadge: '未覆盖 {n}',
    wikiCoverageHint: '{n} 处引用没有内容指纹（{reasons}），无法做漂移检查',
    wikiCoverageSummary: '引用指纹：{tracked}/{total} 已记录 · {untracked} 未覆盖（{reasons}）',
    wikiCoverageLegacy: '引用指纹：清单无指纹记录（{total} 处引用）',
    wikiFailedSummary: '上次生成失败 {n} 页',
    wikiFailedHint: '失败页：{pages}',
    wikiMissingSummary: '清单中 {n} 页在磁盘缺失',
    wikiMissingHint: '缺失页：{pages}',
    wikiStaleCards: 'Wiki 落后于当前输入：生成后卡片或依赖图已变化，请重新生成',
    wikiStaleMemory: 'Wiki 落后于已采信记忆：生成后记忆已变化，请重新生成',
    wikiInvalidSummary: '清单中 {n} 页路径非法或与文件位置不符',
    wikiInvalidHint: '非法页：{pages}',
    wikiDuplicateSummary: '{n} 处重复页面 slug 或清单路径',
    wikiDuplicateHint: '重复项：{pages}',
    wikiOnlyUntracked: '仅看未覆盖（{n}）',
    wikiNoMatches: '没有符合条件的页面。',
    wikiReasonUnreadable: '不可读 {n}',
    wikiReasonRange: '行号非法 {n}',
    wikiReasonCap: '读取上限 {n}',
    wikiReasonUnknown: '原因未知 {n}',
    copyPath: '复制路径',
    copied: '已复制',
    copyFailed: '复制失败（剪贴板不可用）',
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
    detailReferences: '被引用（import 级）',
    detailImports: '依赖文件（import 级）',
    detailDependents: '依赖本文件（import 级）',
    detailImportsMore: '另有 {n} 个',
    importDepthLabel: '依赖展开深度',
    importDepthOption: '{n} 跳',
    detailWikiCitations: '被 Wiki 引用',
    detailRefsMore: '另有 {n} 条',
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
    searchPlaceholder: 'Search title / path / tags / symbols / content …',
    viewGrid: 'Grid view',
    viewList: 'List view',
    groupBy: 'Group by module',
    groupRoot: 'Root',
    statFiles: 'Files {n}',
    statSymbols: 'Symbols {n}',
    statCards: 'Cards {n}',
    statDocs: 'Docs {n}',
    statLangs: 'Languages {n}',
    statSkipped: 'Skipped {n}',
    statSkippedHint: 'Source files skipped during indexing (unreadable or above the per-file size limit).',
    statWarnings: 'Index warnings {n}',
    statWarningsHint: 'Warnings raised while indexing (e.g. Go internal visibility violations, skipped files)',
    warningsDetails: 'Index warnings',
    warningsToggleHint: 'Click to expand all warnings',
    hubLabel: 'High-fan-in files',
    hubHint: 'Most imported files (largest change impact)',
    coreLabel: 'Core files',
    coreHint: 'Ranked by PageRank over static imports (weights indirect importance, complementing fan-in)',
    cycleBadgeHint: 'Part of a {n}-file import cycle',
    cycleBadgeRoute: ' (e.g. {route})',
    openFile: 'Open {path}',
    filterLang: 'Filter by language',
    allLangs: 'All languages',
    langDistribution: 'Languages',
    langsMore: '+{n} more',
    gitBranch: 'Branch {name}',
    lastExtract: 'Last extract: {n} card(s) · {failed} failed · {retried} retried',
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
    sortBy: 'Sort',
    sortPath: 'By path',
    sortTitle: 'By title',
    sortUpdated: 'By update time',
    tagsLabel: 'Tags',
    clearTag: 'Clear tag',
    loadMore: 'Load more ({n} left)',
    showing: 'Showing {shown} / {total}',
    wikiSearch: 'Search wiki pages …',
    wikiGeneral: 'Pages',
    wikiOrphan: 'Not in manifest',
    wikiRangeBadge: 'Out of range {n}',
    wikiRangeHint: '{n} citation(s) exceed the indexed line count',
    wikiIssueSummary: 'Citation issues: {outOfRange} out-of-range · {unchecked} unchecked',
    wikiCoverageBadge: 'Untracked {n}',
    wikiCoverageHint: '{n} citation(s) have no content digest ({reasons}); drift checks cannot cover them',
    wikiCoverageSummary: 'Citation digests: {tracked}/{total} tracked · {untracked} untracked ({reasons})',
    wikiCoverageLegacy: 'Citation digests: manifest has no digests ({total} citations)',
    wikiFailedSummary: '{n} page(s) failed in the last generation',
    wikiFailedHint: 'Failed pages: {pages}',
    wikiMissingSummary: '{n} manifest page(s) missing from disk',
    wikiMissingHint: 'Missing pages: {pages}',
    wikiStaleCards: 'Wiki is behind the current inputs: cards or the dependency graph changed after generation, run repowiki-generate',
    wikiStaleMemory: 'Wiki is behind the accepted memory: memory changed after generation, run repowiki-generate',
    wikiInvalidSummary: '{n} manifest page path(s) are invalid or do not match their file',
    wikiInvalidHint: 'Invalid pages: {pages}',
    wikiDuplicateSummary: '{n} duplicate page slug(s) or manifest path(s)',
    wikiDuplicateHint: 'Duplicates: {pages}',
    wikiOnlyUntracked: 'Only untracked ({n})',
    wikiNoMatches: 'No matching pages.',
    wikiReasonUnreadable: 'unreadable {n}',
    wikiReasonRange: 'invalid range {n}',
    wikiReasonCap: 'read cap {n}',
    wikiReasonUnknown: 'unknown {n}',
    copyPath: 'Copy path',
    copied: 'Copied',
    copyFailed: 'Copy failed (clipboard unavailable)',
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
    detailReferences: 'Referenced by (import-level)',
    detailImports: 'Imports (import-level)',
    detailDependents: 'Dependents (import-level)',
    detailImportsMore: '+{n} more',
    importDepthLabel: 'Import depth',
    importDepthOption: '{n} hop(s)',
    detailWikiCitations: 'Cited by wiki',
    detailRefsMore: '+{n} more',
    detailTags: 'Tags',
  },
}

/** 索引语言 id → 面板展示名（id 保持英文小写用于筛选值）。 */
const LANGUAGE_LABELS = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  vue: 'Vue',
  svelte: 'Svelte',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  csharp: 'C#',
  kotlin: 'Kotlin',
  php: 'PHP',
  ruby: 'Ruby',
  swift: 'Swift',
  scala: 'Scala',
  dart: 'Dart',
  elixir: 'Elixir',
  lua: 'Lua',
  zig: 'Zig',
  gleam: 'Gleam',
  shell: 'Shell',
  r: 'R',
  julia: 'Julia',
  nim: 'Nim',
  ocaml: 'OCaml',
  haskell: 'Haskell',
  erlang: 'Erlang',
  solidity: 'Solidity',
  clojure: 'Clojure',
  hcl: 'HCL',
  groovy: 'Groovy',
  c: 'C',
  cpp: 'C++',
}

/**
 * 取语言的展示名；未知语言原样返回（不隐藏新语言）。
 * @param {string} lang - 索引语言 id。
 * @returns {string} 展示名。
 */
function languageLabel(lang) {
  return LANGUAGE_LABELS[lang] ?? lang
}

window.__ModuleLoader__.load({
  id: 'dsh-repowiki',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } = React

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
     * 读取一个文本文件，翻页拼接至 eof（或达页数上限）。
     * @param {object} wf - remote.workspaceFiles 命名空间。
     * @param {string} sessionId - 授权会话 id（工作区成员会话）。
     * @param {string} rel - 相对工作区根的路径。
     * @param {AbortSignal} signal - 取消信号。
     * @param {{maxPages?:number, failOnTruncate?:boolean}} [opts] - 页数上限与
     *   截断处理（JSON 资产要求完整，截断即报 too-large 而非产出坏 JSON）。
     * @returns {Promise<string>} 文件文本。
     */
    async function readFileText(wf, sessionId, rel, signal, opts = {}) {
      const maxPages = opts.maxPages ?? READ_MAX_PAGES
      const parts = []
      let offset = 1
      let eof = false
      for (let page = 0; page < maxPages; page++) {
        const res = unwrapRemote(await wf.read(sessionId, rel, { offset, limit: READ_PAGE_LINES }, signal), 'workspace-file/bad-read')
        if (!res || typeof res.text !== 'string') throw { code: 'workspace-file/bad-read', message: 'bad read result' }
        parts.push(res.text)
        if (res.eof || !res.lines) { eof = true; break }
        offset += res.lines
      }
      if (!eof && opts.failOnTruncate) {
        throw { code: 'workspace-file/too-large', message: `file exceeds ${maxPages} pages` }
      }
      return parts.join('\n')
    }

    /**
     * 读取并解析 JSON 文件（使用更大的页数预算；截断时明确报 too-large）。
     * @param {object} wf - remote.workspaceFiles 命名空间。
     * @param {string} sessionId - 授权会话 id。
     * @param {string} rel - 相对路径。
     * @param {AbortSignal} signal - 取消信号。
     * @returns {Promise<object>} 解析后的对象。
     */
    async function readJson(wf, sessionId, rel, signal) {
      const text = await readFileText(wf, sessionId, rel, signal, {
        maxPages: READ_MAX_PAGES_JSON,
        failOnTruncate: true,
      })
      return JSON.parse(text)
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
        return { status: 'no-asset', files: 0, symbols: 0, cards: 0, docs: 0, languages: 0, branch: '', updatedAt: '' }
      }
      const [cards, docs] = await Promise.all([
        countDirMd(wf, sessionId, `${ASSET_DIR}/knowledge`, signal),
        countDirMd(wf, sessionId, `${ASSET_DIR}/wiki`, signal),
      ])
      const languageCount = idx.stats?.languages && typeof idx.stats.languages === 'object'
        ? Object.keys(idx.stats.languages).length
        : new Set(idx.files.map(f => f.lang).filter(Boolean)).size
      return {
        status: 'ready',
        files: idx.stats?.files ?? idx.files.length,
        symbols: idx.stats?.symbols ?? idx.files.reduce((a, f) => a + (Array.isArray(f.symbols) ? f.symbols.length : 0), 0),
        cards,
        docs,
        languages: languageCount,
        branch: typeof idx.git?.branch === 'string' ? idx.git.branch : '',
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
     * 从文件路径推导模块路径（与 src/modules.js moduleOf 同构，深度上限 2）。
     * 旧索引（无 module 字段）与测试语料也据此分组。
     * @param {string} relPath - 相对仓库根的路径。
     * @returns {string} 模块路径（根目录文件为 '.'）。
     */
    function moduleFromPath(relPath) {
      const dirs = String(relPath).split('/').slice(0, -1).filter(Boolean).slice(0, 2)
      return dirs.length > 0 ? dirs.join('/') : '.'
    }

    /**
     * 为详情行收集 import 级反向引用（目标文件 → 符号 → 引用方）。
     * 与 src/references.js 同语义：跳过自引用与无符号的副作用导入。
     * @param {object|null} index - 工作区 index.json。
     * @param {string} path - 当前文件的相对路径。
     * @returns {Array<{symbol:string, froms:Array<{path:string, line?:number}>}>}
     *   按符号名排序的引用列表（v5 索引带 import 行号）。
     */
    function referencesForPath(index, path) {
      const bySymbol = new Map()
      for (const edge of index?.edges ?? []) {
        if (!edge || edge.to !== path || edge.from === path) continue
        const line = Number.isInteger(edge.line) && edge.line > 0 ? edge.line : undefined
        const siteKey = `${edge.from}\u0000${line ?? 0}`
        for (const name of Array.isArray(edge.symbols) ? edge.symbols : []) {
          if (typeof name !== 'string' || name.length === 0) continue
          if (!bySymbol.has(name)) bySymbol.set(name, new Map())
          bySymbol.get(name).set(siteKey, { path: edge.from, ...(line ? { line } : {}) })
        }
      }
      return [...bySymbol.entries()]
        .map(([symbol, sites]) => ({
          symbol,
          froms: [...sites.values()].sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0)),
        }))
        .sort((a, b) => a.symbol.localeCompare(b.symbol))
    }

    /**
     * 引用位置格式化：`path:L12`，旧索引只有路径。
     * @param {{path:string, line?:number}} site - 引用位置。
     * @returns {string} 可读位置。
     */
    function formatReferenceSite(site) {
      return typeof site?.line === 'number' && site.line > 0 ? `${site.path}:L${site.line}` : site?.path ?? ''
    }

    /**
     * 为详情行收集 import 级出边（本文件依赖谁），支持传递深度。
     * 与 src/references.js 的 importsFor 同语义：跳过自引用，副作用导入
     * 保留（符号为空）；depth 2-3 按 BFS 展开，最小跳数优先、去重、
     * 起点不作为自身依赖。`mutual` 标记目标文件也直接引用本文件。
     * @param {object|null} index - 工作区 index.json。
     * @param {string} path - 当前文件的相对路径。
     * @param {number} [depth] - 展开跳数（1-3，默认 1）。
     * @returns {Array<{path:string, line?:number, symbols:string[], depth:number, mutual:boolean}>}
     *   按 BFS 到达顺序排列的出边列表（旧索引无 edges 时为空）。
     */
    function importsForPath(index, path, depth = 1) {
      const maxDepth = Math.min(3, Math.max(1, Number.isFinite(depth) ? Math.floor(depth) : 1))
      const edges = Array.isArray(index?.edges) ? index.edges : []
      const reverse = new Set()
      /** @type {Map<string, object[]>} */
      const byFrom = new Map()
      for (const edge of edges) {
        if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
        if (edge.from === edge.to) continue // 自引用不是依赖
        if (edge.to === path) reverse.add(edge.from)
        const list = byFrom.get(edge.from)
        if (list) list.push(edge)
        else byFrom.set(edge.from, [edge])
      }
      const out = []
      const seen = new Set([path])
      const queue = [{ path, depth: 0 }]
      let head = 0
      while (head < queue.length) {
        const { path: current, depth: currentDepth } = queue[head++]
        if (currentDepth >= maxDepth) continue
        for (const edge of byFrom.get(current) ?? []) {
          if (seen.has(edge.to)) continue
          seen.add(edge.to)
          const line = Number.isInteger(edge.line) && edge.line > 0 ? edge.line : undefined
          out.push({
            path: edge.to,
            ...(line ? { line } : {}),
            symbols: (Array.isArray(edge.symbols) ? edge.symbols : [])
              .filter(name => typeof name === 'string' && name.length > 0),
            depth: currentDepth + 1,
            mutual: reverse.has(edge.to),
          })
          queue.push({ path: edge.to, depth: currentDepth + 1 })
        }
      }
      return out
    }

    /**
     * 为详情行收集 import 级依赖方（谁依赖本文件），支持传递深度。
     * 与 src/references.js 的 dependentsFor 同语义：跳过自引用，副作用
     * 导入保留；depth 2-3 按反向 BFS 展开，最小跳数优先、去重、起点不
     * 作为自身依赖方。`mutual` 标记该依赖方也被本文件直接依赖。
     * @param {object|null} index - 工作区 index.json。
     * @param {string} path - 当前文件的相对路径。
     * @param {number} [depth] - 展开跳数（1-3，默认 1）。
     * @returns {Array<{path:string, line?:number, symbols:string[], depth:number, mutual:boolean}>}
     *   按 BFS 到达顺序排列的依赖方列表（旧索引无 edges 时为空）。
     */
    function dependentsForPath(index, path, depth = 1) {
      const maxDepth = Math.min(3, Math.max(1, Number.isFinite(depth) ? Math.floor(depth) : 1))
      const edges = Array.isArray(index?.edges) ? index.edges : []
      const forward = new Set()
      /** @type {Map<string, object[]>} */
      const byTo = new Map()
      for (const edge of edges) {
        if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
        if (edge.from === edge.to) continue // 自引用不是依赖
        if (edge.from === path) forward.add(edge.to)
        const list = byTo.get(edge.to)
        if (list) list.push(edge)
        else byTo.set(edge.to, [edge])
      }
      const out = []
      const seen = new Set([path])
      const queue = [{ path, depth: 0 }]
      let head = 0
      while (head < queue.length) {
        const { path: current, depth: currentDepth } = queue[head++]
        if (currentDepth >= maxDepth) continue
        for (const edge of byTo.get(current) ?? []) {
          if (seen.has(edge.from)) continue
          seen.add(edge.from)
          const line = Number.isInteger(edge.line) && edge.line > 0 ? edge.line : undefined
          out.push({
            path: edge.from,
            ...(line ? { line } : {}),
            symbols: (Array.isArray(edge.symbols) ? edge.symbols : [])
              .filter(name => typeof name === 'string' && name.length > 0),
            depth: currentDepth + 1,
            mutual: forward.has(edge.from),
          })
          queue.push({ path: edge.from, depth: currentDepth + 1 })
        }
      }
      return out
    }

    /**
     * 单库视图的高风险入口：被最多不同文件 import 的目标（fan-in 前三）。
     * 与 src/references.js 的 topDependents 同口径：同一文件重复 import
     * 只计一次，自引用忽略，并列按路径升序。
     * @param {object|null} index - 工作区 index.json。
     * @param {number} [limit] - 返回条目上限（默认 3）。
     * @returns {Array<{path:string, dependents:number}>} 按依赖方数量降序。
     */
    function topDependentsFor(index, limit = 3) {
      /** @type {Map<string, Set<string>>} */
      const byTo = new Map()
      for (const edge of Array.isArray(index?.edges) ? index.edges : []) {
        if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
        if (edge.from === edge.to) continue
        let set = byTo.get(edge.to)
        if (!set) {
          set = new Set()
          byTo.set(edge.to, set)
        }
        set.add(edge.from)
      }
      return [...byTo.entries()]
        .map(([path, froms]) => ({ path, dependents: froms.size }))
        .sort((a, b) => b.dependents - a.dependents || a.path.localeCompare(b.path))
        .slice(0, Math.max(1, Math.floor(limit)))
    }

    /**
     * 单库视图的核心文件：静态 import 图上的 PageRank（前三）。
     * 与 src/graph-rank.js 同参数（阻尼 0.85、收敛阈值 1e-6、迭代上限 50、
     * 边去重、忽略自引用、dangling 权重均分），只统计出现在依赖边里的文件；
     * 同分按路径升序，保证渲染稳定。
     * @param {object|null} index - 工作区 index.json。
     * @param {number} [limit] - 返回条目上限（默认 3）。
     * @returns {Array<{path:string, score:number}>} 按分数降序。
     */
    function coreFilesFor(index, limit = 3) {
      /** @type {Map<string, Set<string>>} */
      const out = new Map()
      const nodes = new Set()
      for (const edge of Array.isArray(index?.edges) ? index.edges : []) {
        if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
        if (edge.from === edge.to) continue
        nodes.add(edge.from)
        nodes.add(edge.to)
        let targets = out.get(edge.from)
        if (!targets) {
          targets = new Set()
          out.set(edge.from, targets)
        }
        targets.add(edge.to)
      }
      const paths = [...nodes].sort()
      if (paths.length === 0) return []
      const total = paths.length
      const damping = 0.85
      /** @type {Map<string, number>} */
      let rank = new Map(paths.map(path => [path, 1 / total]))
      for (let iteration = 0; iteration < 50; iteration++) {
        let dangling = 0
        for (const path of paths) {
          if (!(out.get(path)?.size)) dangling += rank.get(path) ?? 0
        }
        const base = (1 - damping) / total + (damping * dangling) / total
        /** @type {Map<string, number>} */
        const next = new Map(paths.map(path => [path, base]))
        for (const [from, targets] of out) {
          const weight = (rank.get(from) ?? 0) / targets.size
          for (const to of targets) next.set(to, (next.get(to) ?? 0) + damping * weight)
        }
        let delta = 0
        for (const path of paths) delta += Math.abs((next.get(path) ?? 0) - (rank.get(path) ?? 0))
        rank = next
        if (delta < 1e-6) break
      }
      return paths
        .map(path => ({ path, score: Math.round((rank.get(path) ?? 0) * 1e6) / 1e6 }))
        .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
        .slice(0, Math.max(1, Math.floor(limit)))
    }

    /**
     * 在强连通分量内找一条从 start 出发回到 start 的最短环（与
     * src/cycles.js 同语义：BFS 后枚举回边、取最短、并列按路径字典序）。
     * 环长超过 12 个节点时返回空数组（徽章 tooltip 保持简洁）。
     * @param {string} start - 组内字典序最小的文件。
     * @param {Map<string, string[]>} graph - 全图邻接表。
     * @param {Set<string>} members - 当前分量成员。
     * @returns {string[]} 环路径（首尾均为 start）；无短环时为空。
     */
    function shortestCycleFrom(start, graph, members) {
      /** @type {Map<string, string|null>} */
      const parent = new Map([[start, null]])
      const queue = [start]
      for (let head = 0; head < queue.length; head++) {
        const current = queue[head]
        for (const next of graph.get(current) ?? []) {
          if (next === start || !members.has(next) || parent.has(next)) continue
          parent.set(next, current)
          queue.push(next)
        }
      }
      /** @type {string[]|null} */
      let best = null
      for (const member of members) {
        if (member === start || !parent.has(member)) continue
        if (!(graph.get(member) ?? []).includes(start)) continue
        const path = []
        let cursor = member
        while (cursor !== null) {
          path.push(cursor)
          cursor = parent.get(cursor) ?? null
        }
        path.reverse()
        const candidate = [...path, start]
        if (!best
          || candidate.length < best.length
          || (candidate.length === best.length && candidate.join('\u0000') < best.join('\u0000'))) {
          best = candidate
        }
      }
      if (!best || best.length > 13) return []
      return best
    }

    /**
     * 文件级循环依赖成员（与 src/cycles.js 同口径的强连通分量）。
     * 前端无法 import src 模块（浏览器 bundle 自包含），故本地实现：
     * 返回文件 → 所在循环组大小与代表性最短环路径（仅 size ≥ 2 的组）。
     * @param {object|null} index - 工作区 index.json。
     * @returns {Map<string, {size:number, sample:string[]}>} 文件 → 循环组信息。
     */
    function cycleInfoFor(index) {
      /** @type {Map<string, Set<string>>} */
      const edgesByFrom = new Map()
      for (const edge of Array.isArray(index?.edges) ? index.edges : []) {
        if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue
        if (edge.from === edge.to) continue // 自引用不是跨文件循环
        if (!edgesByFrom.has(edge.from)) edgesByFrom.set(edge.from, new Set())
        if (!edgesByFrom.has(edge.to)) edgesByFrom.set(edge.to, new Set())
        edgesByFrom.get(edge.from).add(edge.to)
      }
      /** @type {Map<string, string[]>} */
      const graph = new Map()
      for (const [node, targets] of edgesByFrom) graph.set(node, [...targets].sort())

      const discovery = new Map()
      const lowLink = new Map()
      const onStack = new Set()
      const stack = []
      const infos = new Map()
      let nextDiscovery = 0
      for (const start of [...graph.keys()].sort()) {
        if (discovery.has(start)) continue
        discovery.set(start, nextDiscovery)
        lowLink.set(start, nextDiscovery)
        nextDiscovery++
        stack.push(start)
        onStack.add(start)
        const frames = [{ node: start, index: 0 }]
        while (frames.length > 0) {
          const frame = frames[frames.length - 1]
          const children = graph.get(frame.node) ?? []
          if (frame.index < children.length) {
            const child = children[frame.index++]
            if (!discovery.has(child)) {
              discovery.set(child, nextDiscovery)
              lowLink.set(child, nextDiscovery)
              nextDiscovery++
              stack.push(child)
              onStack.add(child)
              frames.push({ node: child, index: 0 })
            } else if (onStack.has(child)) {
              lowLink.set(frame.node, Math.min(lowLink.get(frame.node) ?? 0, discovery.get(child) ?? 0))
            }
            continue
          }
          frames.pop()
          if (frames.length > 0) {
            const parent = frames[frames.length - 1].node
            lowLink.set(parent, Math.min(lowLink.get(parent) ?? 0, lowLink.get(frame.node) ?? 0))
          }
          if (lowLink.get(frame.node) === discovery.get(frame.node)) {
            const group = []
            for (;;) {
              const member = stack.pop()
              if (member === undefined) break // 防御性退出
              onStack.delete(member)
              group.push(member)
              if (member === frame.node) break
            }
            if (group.length > 1) {
              group.sort()
              const sample = shortestCycleFrom(group[0], graph, new Set(group))
              for (const member of group) infos.set(member, { size: group.length, sample })
            }
          }
        }
      }
      return infos
    }

    /**
     * 描述循环成员徽章（可访问名与悬停提示）。
     * 短环（≤3 个文件）附具体路径，便于定位断链位置；长环只给组大小。
     * @param {number} size - 所在循环组大小。
     * @param {string[]} [sample] - 代表性最短环路径（首尾同文件）。
     * @param {Function} tt - 插值文案函数。
     * @returns {string} 文案。
     */
    function cycleBadgeHint(size, sample, tt) {
      const base = tt('cycleBadgeHint', { n: size })
      return Array.isArray(sample) && sample.length > 2 && sample.length <= 4
        ? `${base}${tt('cycleBadgeRoute', { route: sample.join(' → ') })}`
        : base
    }

    /**
     * 归一 Wiki 引用值（剥离 `#Lx-Ly` 片段）。
     * @param {unknown} source - 清单中的引用值。
     * @returns {string} 源文件相对路径。
     */
    function normalizeWikiSource(source) {
      return typeof source === 'string' ? source.trim().split('#')[0].trim() : ''
    }

    /**
     * 查某源文件被哪些 Wiki 页面/章节引用。
     * @param {object[]} entries - 已应用清单的 Wiki 页面。
     * @param {string} path - 当前源文件相对路径。
     * @returns {Array<{slug:string,title:string,sections:string[]}>} 页面与引用章节。
     */
    function wikiCitationsForPath(entries, path) {
      const out = []
      for (const wiki of entries ?? []) {
        const sections = []
        for (const section of Array.isArray(wiki.sections) ? wiki.sections : []) {
          const cited = (Array.isArray(section?.sources) ? section.sources : [])
            .some(source => normalizeWikiSource(source) === path)
          if (cited && typeof section.heading === 'string' && section.heading) sections.push(section.heading)
        }
        const pageLevel = (Array.isArray(wiki.sources) ? wiki.sources : [])
          .some(source => normalizeWikiSource(source) === path)
        if (pageLevel || sections.length > 0) {
          out.push({
            slug: typeof wiki.slug === 'string' ? wiki.slug : '',
            title: wiki.title,
            sections: [...new Set(sections)].sort(),
          })
        }
      }
      return out.sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug))
    }

    /**
     * 章节锚点（与 src/render.js anchorOf 同构，供目录链接跳转）。
     * @param {string} heading - 章节标题。
     * @param {Map<string, number>} seen - 已用锚点计数。
     * @returns {string} 锚点。
     */
    function anchorOf(heading, seen) {
      const base = String(heading)
        .trim()
        .toLowerCase()
        .replace(/[`*_~[\]()#]/g, '')
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section'
      const count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      return count === 0 ? base : `${base}-${count}`
    }

    /**
     * 客户端检索切词（与 src/search.js tokenize 同规则：拉丁词 + CJK 单字/二元组）。
     * @param {string} text - 文本。
     * @returns {string[]} token。
     */
    /**
     * 查询侧分词（与 src/search.js tokenizeQuery 同构）：CJK 连续段长度
     * ≥2 时只取双字组，避免单字误召回；单字段仍保留单字。
     * @param {string} text - 查询文本。
     * @returns {string[]} token 列表。
     */
    function tokenizeClient(text) {
      const out = []
      const re = /[a-z0-9_]+|[\u3400-\u9fff]+/g
      let match
      while ((match = re.exec(String(text ?? '').toLowerCase())) !== null) {
        const piece = match[0]
        if (/^[a-z0-9_]+$/.test(piece)) {
          out.push(piece)
          continue
        }
        if (piece.length === 1) {
          out.push(piece)
          continue
        }
        for (let i = 0; i + 1 < piece.length; i++) out.push(piece.slice(i, i + 2))
      }
      return out
    }

    /**
     * 卡片行相关性打分（标题 3 / 符号名 2 / 标签 2 / 摘要 1 / 正文 1 / 路径 1）。
     * 符号名来自索引，未生成卡片的文件也能被符号检索命中；正文覆盖"职责/
     * 关键符号/陷阱"等卡片详细内容。
     * @param {object} row - 卡片行。
     * @param {string[]} tokens - 查询 token。
     * @returns {number} 分数（0 表示不匹配）。
     */
    function scoreCard(row, tokens) {
      // 短字段在构建时统一小写；symbolText/bodyText 已在 rows 中预算小写
      const fields = [
        [String(row.card?.title ?? '').toLowerCase(), 3],
        [row.symbolText ?? '', 2],
        [String((row.card?.tags ?? []).join(' ')).toLowerCase(), 2],
        [String(row.card?.summary ?? '').toLowerCase(), 1],
        [row.bodyText ?? '', 1],
        [String(row.path ?? '').toLowerCase(), 1],
      ]
      let score = 0
      for (const token of tokens) {
        for (const [text, weight] of fields) {
          if (text.includes(token)) score += weight
        }
      }
      return score
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
     * 判断资产目录内是否存在 Markdown（可含有限深度子目录）。
     * 面板选 locale 时以"有内容"为准：空 `knowledge/en/` 不应压过有卡片的
     * `knowledge/zh/`，否则面板会显示空集。
     * @param {object} wf - remote.workspaceFiles 命名空间。
     * @param {string} sessionId - 授权会话 id。
     * @param {string} rel - 资产目录。
     * @param {number} depth - 当前深度。
     * @param {number} maxDepth - 允许的子目录深度。
     * @param {AbortSignal} signal - 取消信号。
     * @returns {Promise<boolean>} 是否至少有一个 .md。
     */
    async function hasMarkdownAsset(wf, sessionId, rel, depth, maxDepth, signal) {
      let entries
      try {
        entries = await listChildren(wf, sessionId, rel, signal)
      } catch {
        return false
      }
      for (const entry of entries) {
        if (entry.type === 'file' && entry.name.endsWith('.md')) return true
        if (entry.type === 'directory' && depth < maxDepth
          && await hasMarkdownAsset(wf, sessionId, `${rel}/${entry.name}`, depth + 1, maxDepth, signal)) {
          return true
        }
      }
      return false
    }

    /**
     * 在候选 locale 中选实际有资产的一个：优先 UI locale，其次按名称排序；
     * 全为空时退回首选（渲染层据此显示空态而非错误）。
     * @param {object} wf - remote.workspaceFiles 命名空间。
     * @param {string} sessionId - 授权会话 id。
     * @param {string} baseDir - 资产根（knowledge/wiki/memory）。
     * @param {string[]} locales - 已排序的候选子目录。
     * @param {string} locale - 面板 locale。
     * @param {number} maxDepth - 允许的子目录深度（Wiki 的 modules/ 为 1）。
     * @param {AbortSignal} signal - 取消信号。
     * @returns {Promise<string>} 选中的 locale（无候选时为空串）。
     */
    async function chooseAssetLocale(wf, sessionId, baseDir, locales, locale, maxDepth, signal) {
      if (!locales.length) return ''
      const ordered = locales.includes(locale)
        ? [locale, ...locales.filter((name) => name !== locale)]
        : locales
      for (const candidate of ordered) {
        if (await hasMarkdownAsset(wf, sessionId, `${baseDir}/${candidate}`, 0, maxDepth, signal)) {
          return candidate
        }
      }
      return ordered[0]
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
      let subs
      try {
        subs = await listChildren(wf, sessionId, knowledgeDir, signal)
      } catch {
        // 只生成了索引（还没有 knowledge/）属于正常空集，不是读取失败
        return { locale: '', cards: [] }
      }
      const locales = subs.filter(e => e.type === 'directory').map(e => e.name).sort()
      const chosen = await chooseAssetLocale(wf, sessionId, knowledgeDir, locales, locale, 0, signal)
      if (!chosen) return { locale: '', cards: [] }
      let entries
      try {
        entries = await listChildren(wf, sessionId, `${knowledgeDir}/${chosen}`, signal)
      } catch {
        // 目录在两次调用之间被删除/移走：按空集呈现，避免整页失败
        return { locale: '', cards: [] }
      }
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
     * @returns {Promise<{locale:string, entries:object[]}>} 选定 locale 与页面对象
     *   （file/title/generatedAt/text；嵌套 modules/ 目录也会递归枚举）。
     */
    async function loadWikiEntries(wf, sessionId, locale, signal) {
      const wikiDir = `${ASSET_DIR}/wiki`
      let subs
      try {
        subs = await listChildren(wf, sessionId, wikiDir, signal)
      } catch {
        return { locale: '', entries: [] }
      }
      const locales = subs.filter(e => e.type === 'directory').map(e => e.name).sort()
      const chosen = await chooseAssetLocale(wf, sessionId, wikiDir, locales, locale, 1, signal)
      if (!chosen) return { locale: '', entries: [] }

      /**
       * 递归枚举某目录下的 Markdown 页面（深度上限 3，支持 modules/）。
       * @param {string} rel - 相对工作区的目录。
       * @param {number} depth - 当前深度。
       * @returns {Promise<object[]>} 页面对象。
       */
      const collect = async (rel, depth) => {
        if (depth > 3) return []
        let entries
        try {
          entries = await listChildren(wf, sessionId, rel, signal)
        } catch {
          return []
        }
        const out = []
        for (const entry of entries) {
          const childRel = `${rel}/${entry.name}`
          if (entry.type === 'directory') {
            out.push(...await collect(childRel, depth + 1))
            continue
          }
          if (!entry.name.endsWith('.md')) continue
          try {
            const text = await readFileText(wf, sessionId, childRel, signal)
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
            out.push({ file: childRel.replace(`${ASSET_DIR}/`, ''), title, generatedAt, text })
          } catch {
            // 单页不可读不阻断整批
          }
        }
        return out
      }

      const list = await collect(`${wikiDir}/${chosen}`, 0)
      return { locale: chosen, entries: list }
    }

    /**
     * 读取 Wiki 清单（缺失/损坏返回 null，面板降级为文件枚举）。
     * @param {object} wf - remote.workspaceFiles 命名空间。
     * @param {string} sessionId - 授权会话 id。
     * @param {string} locale - 选定 locale。
     * @param {AbortSignal} signal - 取消信号。
     * @returns {Promise<object|null>} 清单文档。
     */
    async function readWikiManifest(wf, sessionId, locale, signal) {
      if (!locale) return null
      try {
        return await readJson(wf, sessionId, `${ASSET_DIR}/wiki/${locale}/_index.json`, signal)
      } catch {
        return null
      }
    }

    /**
     * 读取知识清单（`knowledge/<locale>/_index.json`），取最近一次抽取快照。
     * @param {object} wf - remote.workspaceFiles 命名空间。
     * @param {string} sessionId - 授权会话 id。
     * @param {string} locale - 选定 locale。
     * @param {AbortSignal} signal - 取消信号。
     * @returns {Promise<object|null>} 清单文档。
     */
    async function readKnowledgeManifest(wf, sessionId, locale, signal) {
      if (!locale) return null
      try {
        return await readJson(wf, sessionId, `${ASSET_DIR}/knowledge/${locale}/_index.json`, signal)
      } catch {
        return null
      }
    }

    /**
     * 解析 Wiki 引用里的文件与可选行号范围（与 src/wiki-references.js 同形）。
     * @param {unknown} value - 引用值。
     * @returns {{path:string, start?:number, end?:number}|null} 解析结果。
     */
    function parseCitation(value) {
      if (typeof value !== 'string') return null
      const raw = value.trim()
      if (!raw) return null
      const hash = raw.indexOf('#')
      const path = (hash >= 0 ? raw.slice(0, hash) : raw).trim()
      if (!path) return null
      if (hash < 0) return { path }
      const match = /^L(\d+)(?:\s*-\s*L?(\d+))?$/i.exec(raw.slice(hash + 1).trim())
      if (!match) return { path }
      const start = Number(match[1])
      const end = match[2] ? Number(match[2]) : start
      return { path, start, end }
    }

    /**
     * 统计页面清单里的引用问题：索引有行数时可判越界，否则计入未检查。
     * 面板不做文件系统存在性检查（缺失文件由 repowiki-status 负责）。
     * @param {object|null} meta - 清单页面条目。
     * @param {Map<string, number>} lineCounts - 索引内相对路径 → 行数。
     * @returns {{outOfRange:number, unchecked:number}} 计数。
     */
    function citationIssuesFor(meta, lineCounts) {
      // 清单页级 sources 是章节 sources 的并集：必须去重，否则越界/
      // 未检查计数会重复。指纹覆盖率使用同一口径。
      const sources = new Set()
      for (const source of Array.isArray(meta?.sources) ? meta.sources : []) {
        if (typeof source === 'string' && source) sources.add(source)
      }
      for (const section of Array.isArray(meta?.sections) ? meta.sections : []) {
        for (const source of Array.isArray(section?.sources) ? section.sources : []) {
          if (typeof source === 'string' && source) sources.add(source)
        }
      }
      let outOfRange = 0
      let unchecked = 0
      for (const source of sources) {
        const parsed = parseCitation(source)
        if (!parsed || !Number.isInteger(parsed.start)) continue
        const lines = lineCounts.get(parsed.path)
        if (!Number.isInteger(lines)) {
          unchecked++
          continue
        }
        const end = Number.isInteger(parsed.end) ? parsed.end : parsed.start
        if (parsed.start < 1 || end < parsed.start || parsed.start > lines || end > lines) outOfRange++
      }
      return { outOfRange, unchecked }
    }

    /**
     * 汇总页面清单里的引用指纹覆盖率（按页去重）。
     * @param {object|null} meta - 清单页面条目。
     * @returns {{total:number, tracked:number, untracked:number, hasDigests:boolean,
     *   reasons:{unreadable:number, range:number, cap:number, unknown:number}}}
     *   覆盖率；旧清单无指纹时 tracked 为 0。
     */
    function citationCoverageFor(meta) {
      const sources = new Set()
      for (const source of Array.isArray(meta?.sources) ? meta.sources : []) {
        if (typeof source === 'string' && source) sources.add(source)
      }
      for (const section of Array.isArray(meta?.sections) ? meta.sections : []) {
        for (const source of Array.isArray(section?.sources) ? section.sources : []) {
          if (typeof source === 'string' && source) sources.add(source)
        }
      }
      const digests = meta?.citationDigests && typeof meta.citationDigests === 'object'
        ? meta.citationDigests
        : null
      const misses = meta?.citationMisses && typeof meta.citationMisses === 'object'
        ? meta.citationMisses
        : null
      const reasons = { unreadable: 0, range: 0, cap: 0, unknown: 0 }
      let tracked = 0
      for (const source of sources) {
        if (digests && typeof digests[source] === 'string' && digests[source]) {
          tracked++
          continue
        }
        const reason = misses && typeof misses[source] === 'string' ? misses[source] : 'unknown'
        if (reason === 'unreadable' || reason === 'range' || reason === 'cap') reasons[reason]++
        else reasons.unknown++
      }
      return {
        total: sources.size,
        tracked,
        untracked: sources.size - tracked,
        hasDigests: Boolean(digests
          && Object.values(digests).some(value => typeof value === 'string' && value)),
        reasons,
      }
    }

    /**
     * 渲染未覆盖引用原因（本地化）。
     * @param {{unreadable?:number, range?:number, cap?:number, unknown?:number}|undefined} reasons
     *   原因计数。
     * @param {(key:string, params?:object)=>string} tt - 文案函数。
     * @returns {string} 例如 `不可读 1, 行号非法 2`；无计数时为空。
     */
    function formatCoverageReasons(reasons, tt) {
      if (!reasons) return ''
      const parts = []
      if (reasons.unreadable > 0) parts.push(tt('wikiReasonUnreadable', { n: reasons.unreadable }))
      if (reasons.range > 0) parts.push(tt('wikiReasonRange', { n: reasons.range }))
      if (reasons.cap > 0) parts.push(tt('wikiReasonCap', { n: reasons.cap }))
      if (reasons.unknown > 0) parts.push(tt('wikiReasonUnknown', { n: reasons.unknown }))
      return parts.join(', ')
    }

    /**
     * 读取 Wiki 清单并把 order/module/引用问题附加到页面对象；缺失时按标题排序。
     * @param {object[]} entries - loadWikiEntries 的页面。
     * @param {object|null} manifest - wiki/<locale>/_index.json。
     * @param {object|null} [index] - 工作区 index.json（v6 起文件带 lines）。
     * @returns {object[]} 排序后的页面。
     */
    function applyWikiManifest(entries, manifest, index = null) {
      const byPath = new Map((manifest?.pages ?? []).map(page => [page.path, page]))
      /** @type {Map<string, number>} */
      const lineCounts = new Map()
      for (const file of Array.isArray(index?.files) ? index.files : []) {
        if (file && typeof file.path === 'string'
          && Number.isInteger(file.lines) && file.lines >= 0) {
          lineCounts.set(file.path, file.lines)
        }
      }
      return entries
        .map((entry) => {
          const meta = byPath.get(entry.file)
          if (!meta) {
            return {
              ...entry, order: Number.MAX_SAFE_INTEGER, module: '', sources: [], sections: [],
              orphan: Boolean(manifest), outOfRange: 0, unchecked: 0,
              citationCoverage: { total: 0, tracked: 0, untracked: 0, hasDigests: false },
            }
          }
          const issues = citationIssuesFor(meta, lineCounts)
          return {
            ...entry,
            order: typeof meta.order === 'number' ? meta.order : Number.MAX_SAFE_INTEGER,
            module: typeof meta.module === 'string' ? meta.module : '',
            slug: typeof meta.slug === 'string' ? meta.slug : '',
            // 清单 v1 只有页面级 sources；v2 起带章节级 sections（反查用）
            sources: Array.isArray(meta.sources) ? meta.sources : [],
            sections: Array.isArray(meta.sections) ? meta.sections : [],
            orphan: false,
            ...issues,
            citationCoverage: citationCoverageFor(meta),
          }
        })
        .sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title))
    }

    /**
     * 计算 sha256 前缀（浏览器/Node 的 Web Crypto；不可用时返回空串）。
     * @param {string} text - 输入文本。
     * @param {number} [chars=16] - 截取位数。
     * @returns {Promise<string>} 十六进制前缀；不可用或失败时为空串。
     */
    async function digestHex(text, chars = 16) {
      const subtle = globalThis.crypto?.subtle
      const Encoder = globalThis.TextEncoder
      if (!subtle || typeof Encoder === 'undefined') return ''
      try {
        const data = new Encoder().encode(String(text))
        const buffer = await subtle.digest('SHA-256', data)
        return [...new Uint8Array(buffer)]
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('')
          .slice(0, chars)
      } catch {
        return ''
      }
    }

    /**
     * Wiki 结构签名（与 src/wiki-graph.js 逐字节同构）：索引文件集合 +
     * 依赖边。面板不读源码，但能读 index.json，因此配置清单驱动的边变化
     * 也能判定 Wiki 落后。
     * @param {object|null} index - 索引文档。
     * @returns {string} 规范化文本。
     */
    function wikiGraphTextClient(index) {
      const files = (Array.isArray(index?.files) ? index.files : [])
        .map(file => (typeof file?.path === 'string' ? file.path : ''))
        .filter(Boolean)
        .sort()
      const edges = (Array.isArray(index?.edges) ? index.edges : [])
        .filter(edge => typeof edge?.from === 'string' && typeof edge?.to === 'string')
        .map(edge => `${edge.from}>${edge.to}`)
        .sort()
      return `files:\n${files.join('\n')}\nedges:\n${edges.join('\n')}`
    }

    /**
     * 计算卡片集合的输入指纹（与 repowiki-generate 的 inputDigest 同口径）。
     * @param {object[]} cards - 面板已加载的卡片（path/sourceDigest）。
     * @returns {Promise<string>} sha256-16；Web Crypto 不可用时为空串。
     */
    async function cardsInputDigest(cards) {
      const byPath = new Map()
      for (const card of cards) {
        if (typeof card?.path === 'string' && card.path) byPath.set(card.path, card)
      }
      return digestHex(
        [...byPath.entries()]
          .map(([cardPath, card]) => `${cardPath}:${card.sourceDigest ?? ''}`)
          .sort()
          .join('\n'),
      )
    }

    /**
     * Wiki 输入是否落后：卡片指纹或结构指纹任一不匹配即落后；
     * 两者都无法核对时返回 null（不展示提示）。
     * @param {object|null} manifest - Wiki 清单。
     * @param {string} cardDigest - 当前卡片指纹（空串表示不可用）。
     * @param {string} graphDigest - 当前结构指纹（空串表示不可用）。
     * @returns {boolean|null} 落后/不落后/无法判定。
     */
    function wikiInputsStale(manifest, cardDigest, graphDigest) {
      if (!manifest || typeof manifest !== 'object') return null
      let checked = false
      if (typeof manifest.inputDigest === 'string' && manifest.inputDigest && cardDigest) {
        checked = true
        if (cardDigest !== manifest.inputDigest) return true
      }
      if (typeof manifest.graphDigest === 'string' && manifest.graphDigest && graphDigest) {
        checked = true
        if (graphDigest !== manifest.graphDigest) return true
      }
      return checked ? false : null
    }

    /**
     * 计算已采信记忆集合的指纹（与 repowiki-generate 的 memoryDigest 同口径）。
     * @param {object[]} memories - 面板已加载记忆（slug/status/body）。
     * @returns {Promise<string>} sha256-16；Web Crypto 不可用时为空串。
     */
    async function memoriesInputDigest(memories) {
      const entries = memories
        .filter(memory => memory?.status === 'accepted')
        .map(memory => `${memory.slug ?? ''}:${memory.body ?? ''}`)
        .sort()
      return digestHex(entries.join('\n'))
    }

    /**
     * 汇总清单级诊断：上次生成失败页与磁盘缺失页（面板不读源码）。
     * @param {object[]} entries - 已加载的页面（file 为相对资产根路径，含 slug）。
     * @param {object|null} manifest - wiki/<locale>/_index.json。
     * @param {string} locale - 当前 locale。
     * @returns {{failedTotal:number, failedPages:string[], missingTotal:number,
     *   missingPages:string[], invalidTotal:number, invalidPages:string[]}}
     *   失败页/缺失页/非法路径的总数与示例（各 ≤5）。
     */
    function wikiDiagnostics(entries, manifest, locale) {
      const failedPages = (Array.isArray(manifest?.failed) ? manifest.failed : [])
        .map(item => (typeof item?.slug === 'string' ? item.slug : ''))
        .filter(Boolean)
      const failedTotal = Number.isInteger(manifest?.failedTotal)
        ? manifest.failedTotal
        : failedPages.length
      const present = new Set(entries.map(entry => entry.file))
      const diskBySlug = new Map(entries.map(entry => [entry.slug, entry]))
      const invalidPages = []
      const invalidRels = new Set()
      for (const page of Array.isArray(manifest?.pages) ? manifest.pages : []) {
        const slug = typeof page?.slug === 'string' ? page.slug : ''
        const rel = typeof page?.path === 'string' ? page.path.replace(/\\/g, '/') : ''
        if (!slug || !rel) continue
        if (rel.startsWith('/') || rel.split('/').includes('..')
          || !locale || !rel.startsWith(`wiki/${locale}/`) || !rel.endsWith('.md')) {
          invalidPages.push(slug)
          invalidRels.add(rel)
          continue
        }
        const disk = diskBySlug.get(slug)
        if (disk && disk.file !== rel) {
          invalidPages.push(slug)
          invalidRels.add(rel)
        }
      }
      const missingPages = (Array.isArray(manifest?.pages) ? manifest.pages : [])
        .map(page => (typeof page?.path === 'string' ? page.path : ''))
        .filter(path => path && !present.has(path) && !invalidRels.has(path))
      // 重复页：磁盘两个文件同 slug，或清单重复 slug/路径。与门禁同口径，
      // 但只使用已加载的文件列表，不读源码。
      const rawManifestSlugs = (Array.isArray(manifest?.pages) ? manifest.pages : [])
        .map(page => (typeof page?.slug === 'string' ? page.slug : ''))
        .filter(Boolean)
      const duplicateManifestSlugs = [...new Set(
        rawManifestSlugs.filter((slug, index) => rawManifestSlugs.indexOf(slug) !== index),
      )]
      const rawManifestPaths = (Array.isArray(manifest?.pages) ? manifest.pages : [])
        .map(page => (typeof page?.path === 'string' ? page.path.replace(/\\/g, '/') : ''))
        .filter(Boolean)
      const duplicateManifestPaths = [...new Set(
        rawManifestPaths.filter(rel => rawManifestPaths.indexOf(rel) !== rawManifestPaths.lastIndexOf(rel)),
      )]
      const diskSlugCounts = new Map()
      for (const entry of entries) {
        diskSlugCounts.set(entry.slug, (diskSlugCounts.get(entry.slug) ?? 0) + 1)
      }
      const duplicateDiskSlugs = [...diskSlugCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([slug]) => slug)
      const duplicateSlugs = [...new Set([...duplicateDiskSlugs, ...duplicateManifestSlugs])].sort()
      return {
        failedTotal,
        failedPages: failedPages.slice(0, 5),
        missingTotal: missingPages.length,
        missingPages: missingPages.slice(0, 5),
        invalidTotal: invalidPages.length,
        invalidPages: invalidPages.slice(0, 5),
        duplicateTotal: duplicateSlugs.length + duplicateManifestPaths.length,
        duplicateSlugs: duplicateSlugs.slice(0, 5),
        duplicatePaths: duplicateManifestPaths.slice(0, 5),
      }
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
      const chosen = await chooseAssetLocale(wf, sessionId, memoryDir, locales, locale, 0, signal)
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
            // generate 的记忆指纹口径：去掉一级标题后 trim
            body: parsed.body.replace(/^\s*#[^\n]*\n+/, '').trim(),
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
      const [wikiMeta, setWikiMeta] = useState(null)
      const [memories, setMemories] = useState([])
      const [lastExtract, setLastExtract] = useState(null)
      const [tab, setTab] = useState('cards')
      const [wikiSelected, setWikiSelected] = useState(null)
      // 深链目标章节（来自详情引用）；空串表示页面顶部
      const [wikiTargetSection, setWikiTargetSection] = useState('')
      const [memorySelected, setMemorySelected] = useState(null)
      const [filter, setFilter] = useState('all')
      const [query, setQuery] = useState('')
      const [view, setView] = useState('grid')
      const [group, setGroup] = useState(false)
      const [sortBy, setSortBy] = useState('path')
      const [tagFilter, setTagFilter] = useState('')
      const [langFilter, setLangFilter] = useState('')
      const [wikiQuery, setWikiQuery] = useState('')
      const [visibleCount, setVisibleCount] = useState(120)
      const searchRef = useRef(null)
      const deferredQuery = useDeferredValue(query)
      const [detail, setDetail] = useState(null)
      // 详情"依赖文件"区块的展开深度（1 = 直接依赖；2-3 = 传递依赖）
      const [importDepth, setImportDepth] = useState(1)
      /** 索引告警明细是否展开（统计行计数按钮切换）。 */
      const [warningsOpen, setWarningsOpen] = useState(false)
      // 焦点管理（详情类视图通用，无障碍）：打开前记录当前焦点，关闭时归还。
      // 注意：卡片详情为内联面板（列表不卸载，直接归还触发瓦片）；记忆/Wiki
      // 详情是整面板切换（触发条目被卸载），归还前须检查节点是否仍挂载，
      // 失联回退到对应页签按钮，避免 focus() 打在分离节点上。
      const prevFocusRef = useRef(null)
      const memoryTabRef = useRef(null)
      const wikiTabRef = useRef(null)
      const openWithFocus = (setter) => (value) => {
        // 鸭子类型判断（不依赖全局 HTMLElement，测试环境可能未导出该类）
        const active = typeof document !== 'undefined' ? document.activeElement : null
        if (active && typeof active.focus === 'function') prevFocusRef.current = active
        setter(value)
      }
      const closeWithFocus = (setter, fallbackRef) => () => {
        setter(null)
        const prev = prevFocusRef.current
        prevFocusRef.current = null
        if (prev?.isConnected) prev.focus?.()
        else fallbackRef?.current?.focus?.()
      }
      // 卡片详情 / 记忆详情 / Wiki 页面详情共用同一焦点归还通道
      const openDetail = (value) => {
        setImportDepth(1) // 新详情从直接依赖开始，避免沿用上一条的深度
        openWithFocus(setDetail)(value)
      }
      const closeDetail = closeWithFocus(setDetail)
      const openMemory = openWithFocus(setMemorySelected)
      const closeMemory = closeWithFocus(setMemorySelected, memoryTabRef)
      const openWiki = openWithFocus(setWikiSelected)
      /**
       * 打开 Wiki 页面并可携带目标章节（空串=页面顶部）。
       * @param {object} entry - Wiki 页面。
       * @param {string} [section] - 目标章节标题。
       * @returns {void}
       */
      const openWikiEntry = (entry, section = '') => {
        setWikiTargetSection(section)
        openWiki(entry)
      }
      const closeWiki = closeWithFocus(setWikiSelected, wikiTabRef)
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
          setWikiMeta(null)
          setMemories([])
          setLastExtract(null)
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
            setWikiMeta(null)
            setMemories([])
            setLastExtract(null)
            return
          }
          const { cards: loaded, locale: cardLocale } = await loadCards(wf, sessionId, localeName(t), signal)
          const wikiResult = await loadWikiEntries(wf, sessionId, localeName(t), signal)
          const manifest = await readWikiManifest(wf, sessionId, wikiResult.locale, signal)
          const wikiPages = applyWikiManifest(wikiResult.entries, manifest, parsedIndex)
          // 知识清单与卡片同目录：用卡片实际落地的 locale 读，避免面板 locale
          // 与产物 locale 不一致时漏读快照
          const knowledgeManifest = await readKnowledgeManifest(wf, sessionId, cardLocale, signal)
          if (signal.aborted || requestId !== latestRequest.current) return
          setIndex(parsedIndex)
          setCards(loaded)
          setDocs(wikiPages.length)
          setWikis(wikiPages)
          setLastExtract(knowledgeManifest?.lastRun && typeof knowledgeManifest.lastRun === 'object'
            ? knowledgeManifest.lastRun
            : null)
          const memoryEntries = await loadMemoryEntries(wf, sessionId, localeName(t), signal)
          if (signal.aborted || requestId !== latestRequest.current) return
          const [cardDigest, graphDigest, memoryDigest] = await Promise.all([
            cardsInputDigest(loaded),
            digestHex(wikiGraphTextClient(parsedIndex)),
            memoriesInputDigest(memoryEntries),
          ])
          setWikiMeta({
            ...wikiDiagnostics(wikiPages, manifest, wikiResult.locale),
            // 卡片或结构（文件集合/依赖边）任一变化都提示落后；旧清单
            // 无 graphDigest 时只看卡片指纹（保持兼容）。
            cardsStale: wikiInputsStale(manifest, cardDigest, graphDigest),
            memoryStale: manifest && typeof manifest.memoryDigest === 'string' && memoryDigest
              ? memoryDigest !== manifest.memoryDigest
              : null,
          })
          setMemories(memoryEntries)
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
          setWikiMeta(null)
          setMemories([])
          setLastExtract(null)
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
          if (memorySelected) closeMemory()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [detail, memorySelected])

      // 快捷键：卡片页按 `/` 聚焦搜索框（输入控件内不拦截）
      useEffect(() => {
        const onKey = (e) => {
          if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
          if (tab !== 'cards') return
          const tag = String(e.target?.tagName ?? '').toLowerCase()
          if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return
          e.preventDefault()
          searchRef.current?.focus?.()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [tab])

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
      const rows = useMemo(() => {
        // 文件级循环成员（SCC）：卡片行显示 ⟲ 徽章，点开详情可看双向边
        const cycleInfos = cycleInfoFor(index)
        return (index?.files ?? []).map((f) => ({
          path: f.path,
          // 模块归属：新索引带 module 字段，旧索引按路径推导（深度 2）
          module: typeof f.module === 'string' && f.module ? f.module : moduleFromPath(f.path),
          lang: f.lang,
          symbols: Array.isArray(f.symbols) ? f.symbols.length : 0,
          // 符号名拼成可检索文本：面板可按符号名定位文件（无需先有卡片）
          symbolText: (Array.isArray(f.symbols) ? f.symbols : [])
            .map(s => (typeof s?.name === 'string' ? s.name : ''))
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
          // 卡片正文预算小写副本：全文检索不重复 toLowerCase（正文可达数 KB）
          bodyText: String(cardByPath.get(f.path)?.body ?? '').toLowerCase(),
          cycleSize: cycleInfos.get(f.path)?.size ?? 0,
          cycleSample: cycleInfos.get(f.path)?.sample ?? [],
          card: cardByPath.get(f.path) || null,
        }))
      }, [index, cardByPath])
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
        const q = deferredQuery.trim()
        const tokens = tokenizeClient(q)
        const matched = []
        for (const row of rows) {
          if (filter === 'generated' && !row.card) continue
          if (filter === 'pending' && row.card) continue
          if (filter === 'stale' && !(row.card && staleSet.has(row.path))) continue
          if (langFilter && row.lang !== langFilter) continue
          if (tagFilter && !(row.card?.tags ?? []).includes(tagFilter)) continue
          if (tokens.length > 0) {
            const score = scoreCard(row, tokens)
            if (score <= 0) continue
            matched.push([row, score])
          } else {
            matched.push([row, 0])
          }
        }
        matched.sort((a, b) => {
          if (tokens.length > 0 && b[1] !== a[1]) return b[1] - a[1]
          if (sortBy === 'title') {
            return (a[0].card?.title ?? a[0].path).localeCompare(b[0].card?.title ?? b[0].path)
          }
          if (sortBy === 'updated') {
            return (b[0].card?.generatedAt ?? '').localeCompare(a[0].card?.generatedAt ?? '')
          }
          return a[0].path.localeCompare(b[0].path)
        })
        return matched.map(([row]) => row)
      }, [rows, filter, deferredQuery, tagFilter, langFilter, sortBy, staleSet])
      const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])
      const topTags = useMemo(() => {
        const counts = new Map()
        for (const card of cards) {
          for (const tag of card.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
        }
        return [...counts.entries()]
          .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
          .slice(0, 12)
          .map(([tag]) => tag)
      }, [cards])
      /** 索引中出现过的语言（按文件数降序），驱动语言筛选下拉。 */
      const langOptions = useMemo(() => {
        const counts = new Map()
        for (const row of rows) {
          if (typeof row.lang !== 'string' || row.lang === '') continue
          counts.set(row.lang, (counts.get(row.lang) ?? 0) + 1)
        }
        return [...counts.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      }, [rows])
      // 切换工作区后语言可能不存在：清掉失效筛选，避免列表空转
      useEffect(() => {
        if (langFilter && !langOptions.some(([lang]) => lang === langFilter)) setLangFilter('')
      }, [langOptions, langFilter])
      // 筛选/排序/搜索变化时回到第一页，避免“加载更多”状态错位
      useEffect(() => {
        setVisibleCount(120)
      }, [filter, deferredQuery, tagFilter, langFilter, sortBy, group, tab])
      const pendingCount = useMemo(() => rows.filter(r => !r.card).length, [rows])
      /** 按模块分组的过滤结果（分组开关开启时使用；根目录最前）。 */
      const grouped = useMemo(() => {
        if (!group) return null
        const byModule = new Map()
        for (const row of visible) {
          const key = row.module || '.'
          if (!byModule.has(key)) byModule.set(key, [])
          byModule.get(key).push(row)
        }
        return [...byModule.entries()].sort((a, b) => {
          if (a[0] === '.') return -1
          if (b[0] === '.') return 1
          return a[0].localeCompare(b[0])
        })
      }, [visible, group])
      const latestUpdate = useMemo(() => cards
        .map(c => c.generatedAt)
        .filter(Boolean)
        .sort()
        .pop() || '', [cards])
      /** 语言数：优先索引的语言分布，旧索引回退到文件行推导。 */
      const languageCount = useMemo(() => {
        const counts = index?.stats?.languages
        if (counts && typeof counts === 'object') return Object.keys(counts).length
        return new Set(rows.map(r => r.lang).filter(Boolean)).size
      }, [index, rows])
      /** 语言分布（按文件数降序）：优先索引 stats，旧索引回退到文件行。 */
      const languageDistribution = useMemo(() => {
        const counts = index?.stats?.languages
        let entries
        if (counts && typeof counts === 'object') {
          entries = Object.entries(counts).filter(([, n]) => typeof n === 'number' && n > 0)
        } else {
          const fallback = new Map()
          for (const row of rows) {
            if (typeof row.lang !== 'string' || row.lang === '') continue
            fallback.set(row.lang, (fallback.get(row.lang) ?? 0) + 1)
          }
          entries = [...fallback.entries()]
        }
        return entries.sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      }, [index, rows])
      /** 行索引：hub chip 点击时定位到对应卡片行（rows 每文件唯一）。 */
      const rowByPath = useMemo(() => new Map(rows.map(r => [r.path, r])), [rows])
      /** 单库视图的高风险入口（fan-in 前三，与状态工具同口径）。 */
      const hubs = useMemo(() => topDependentsFor(index, 3), [index])
      /** 单库视图的核心文件（PageRank 前三，与 src/graph-rank.js 同口径）。 */
      const coreFiles = useMemo(() => coreFilesFor(index, 3), [index])
      /** 索引期告警（Go internal 越界、跳过文件等），统计行计数 + 悬停明细。 */
      const indexWarnings = useMemo(
        () => (Array.isArray(index?.warnings) ? index.warnings.filter(w => typeof w === 'string' && w) : []),
        [index],
      )
      /** Git 分支标识（detached 或非仓库为空；旧索引无 git 字段）。 */
      const gitBranch = typeof index?.git?.branch === 'string' ? index.git.branch : ''
      /** 详情行的 import 级反向引用（旧索引无 edges 时为空）。 */
      const detailReferences = useMemo(
        () => (detail ? referencesForPath(index, detail.path) : []),
        [detail, index],
      )
      /** 详情行的 import 级出边（本文件依赖谁；depth 可展开传递依赖）。 */
      const detailImports = useMemo(
        () => (detail ? importsForPath(index, detail.path, importDepth) : []),
        [detail, index, importDepth],
      )
      /** 详情行的依赖方（文件级，反向影响面），与出边共用同一展开深度。 */
      const detailDependents = useMemo(
        () => (detail ? dependentsForPath(index, detail.path, importDepth) : []),
        [detail, index, importDepth],
      )
      /** 详情行的 Wiki 引用反查（清单 v1 页面级 / v2 章节级）。 */
      const detailWikiCitations = useMemo(
        () => (detail ? wikiCitationsForPath(wikis, detail.path) : []),
        [detail, wikis],
      )
      /**
       * 从详情跳转到被引用的 Wiki 页面：按 slug/标题匹配当前工作区的页面。
       * @param {{slug?:string, title:string}} citation - 反查结果。
       * @returns {void}
       */
      const openWikiCitation = (citation) => {
        const entry = wikis.find(w => (citation.slug && w.slug === citation.slug) || w.title === citation.title)
        if (!entry) return
        setTab('wiki')
        openWikiEntry(entry, citation.sections?.[0] ?? '')
      }

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

      /** 筛选切换按钮（带计数与 aria-pressed）。 */
      const filterButton = (value, label, count) => h('button', {
        type: 'button',
        'aria-pressed': filter === value,
        onClick: guard('filter', () => setFilter(value)),
        style: filter === value ? primaryStyle : buttonStyle,
      }, `${label}${count > 0 ? ` ${count}` : ''}`)

      /** 卡片列表（网格/列表两种视图；分组与非分组共用）。 */
      const renderCards = (list) => (view === 'grid'
        ? h('div', {
            style: {
              display: 'grid', gap: 12,
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            },
          },
          ...list.map(r => h(CardTile, {
            key: r.path, row: r, t, tt, onOpen: guard('open-card', () => openDetail(r)),
          })),
        )
        : h('div', null,
          ...list.map(r => h(CardRow, {
            key: r.path, row: r, t, tt, onOpen: guard('open-card', () => openDetail(r)),
          })),
        ))

      return h(ErrorBoundary, null, h('div', {
        // 外层（滚动器）：宿主 mainPanel 为 overflow:hidden 的 flex 列——
        // 页面须自管滚动。参照 TaskManagerPage 的两层结构：滚动器全宽
        // （滚动条贴视口边，scrollbar-gutter 防出现时布局抖动），内容列
        // 居中在内部。页面自绘底色与基础排版（官方参照页同款）。
        style: {
          height: '100%', width: '100%', minWidth: 0, minHeight: 0,
          boxSizing: 'border-box',
          overflowY: 'auto', overflowX: 'hidden',
          scrollbarGutter: 'stable',
          background: 'var(--dsw-alias-bg-base, transparent)',
          fontSize: 14, lineHeight: 1.6,
          color: 'var(--dsw-alias-label-primary, inherit)',
        },
        'aria-label': t('title'),
      },
        h('div', {
          // 内层（960 内容列）：顶部留白 = 28px + macOS 窗口条高度令牌；
          // 内边距响应式 clamp 与官方参照页一致（窄屏自然收窄）
          style: {
            maxWidth: 960, margin: '0 auto',
            paddingTop: 'calc(28px + var(--dsh-frame-top-clearance, 0px))',
            paddingRight: 'clamp(24px, 4vw, 48px)',
            paddingBottom: '48px',
            paddingLeft: 'clamp(24px, 4vw, 48px)',
          },
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
          languageCount > 0 ? h('span', null, tt('statLangs', { n: languageCount })) : null,
          (index.stats?.skipped ?? 0) > 0
            ? h('span', {
              title: t('statSkippedHint'),
            }, tt('statSkipped', { n: index.stats.skipped }))
            : null,
          indexWarnings.length > 0
            ? h('button', {
              type: 'button',
              'aria-expanded': warningsOpen,
              'aria-controls': 'repowiki-index-warnings',
              title: `${indexWarnings.slice(0, 3).join('\n')}${indexWarnings.length > 3 ? `\n… +${indexWarnings.length - 3}` : ''}\n${t('warningsToggleHint')}`,
              onClick: guard('toggle-warnings', () => setWarningsOpen(v => !v)),
              style: {
                background: 'transparent', border: 'none', padding: 0, margin: 0,
                font: 'inherit', color: 'inherit', cursor: 'pointer',
                textDecoration: 'underline', textUnderlineOffset: 2,
              },
            }, tt('statWarnings', { n: indexWarnings.length }))
            : null,
          gitBranch ? h('span', null, tt('gitBranch', { name: gitBranch })) : null,
          // 最近一次抽取快照（knowledge/<locale>/_index.json 的 lastRun）：
          // 失败数 > 0 用错误色提示，便于不打开会话就发现问题
          lastExtract && h('span', {
            title: typeof lastExtract.generatedAt === 'string' ? lastExtract.generatedAt : undefined,
            role: lastExtract.failed > 0 ? 'status' : undefined,
            style: lastExtract.failed > 0
              ? { color: 'var(--dsw-alias-state-error-primary, #dc2626)' }
              : undefined,
          }, tt('lastExtract', {
            n: lastExtract.extracted ?? 0,
            failed: lastExtract.failed ?? 0,
            retried: lastExtract.retried ?? 0,
          })),
          h('span', null, latestUpdate
            ? tt('updated', { when: latestUpdate.slice(0, 10) })
            : t('never')),
          staleSet.size > 0 && h('span', {
            style: { color: 'var(--dsw-alias-state-error-primary, #dc2626)' },
            role: 'status',
          }, tt('staleHint', { n: staleSet.size })),
        ),

        // 索引告警明细：点击计数展开全部（tooltip 只列前三条）
        !overview && status === 'ready' && index && warningsOpen && indexWarnings.length > 0 && h('ul', {
          id: 'repowiki-index-warnings',
          'aria-label': t('warningsDetails'),
          style: { margin: '0 0 12px', paddingLeft: 20, fontSize: 12, lineHeight: 1.7, ...muted },
        },
          ...indexWarnings.map((warning, index) => h('li', { key: `${index}-${warning}` }, warning))),

        // 语言分布：多语言时按文件数展示（可读语言名，最多 8 个 + 溢出计数）
        !overview && status === 'ready' && index && languageDistribution.length > 1 && h('div', {
          'aria-label': t('langDistribution'),
          style: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 },
        },
          h('span', { style: { fontSize: 12, ...muted } }, t('langDistribution')),
          ...languageDistribution.slice(0, 8).map(([lang, count]) => h('span', {
            key: lang,
            style: {
              fontSize: 11.5, lineHeight: '18px', padding: '1px 8px',
              borderRadius: 'var(--dsw-radius-sm, 6px)',
              border: '1px solid var(--dsw-alias-border-l2, #e5e7eb)',
              color: 'var(--dsw-alias-label-secondary, #6b7280)',
            },
          }, `${languageLabel(lang)} ${count}`)),
          languageDistribution.length > 8 && h('span', { style: { fontSize: 11.5, ...muted } },
            tt('langsMore', { n: languageDistribution.length - 8 })),
        ),

        // 高风险入口：被最多文件依赖的文件（改动影响面最大，与状态工具同口径）
        !overview && status === 'ready' && index && hubs.length > 0 && h('div', {
          'aria-label': t('hubLabel'),
          title: t('hubHint'),
          style: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 },
        },
          h('span', { style: { fontSize: 12, ...muted } }, t('hubLabel')),
          ...hubs.map(hub => h('button', {
            key: hub.path,
            type: 'button',
            onClick: guard('open-hub', () => {
              const row = rowByPath.get(hub.path)
              if (row) openDetail(row)
            }),
            'aria-label': `${hub.path} (${hub.dependents})`,
            title: hub.path,
            style: {
              fontSize: 11.5, lineHeight: '18px', padding: '1px 8px',
              borderRadius: 'var(--dsw-radius-sm, 6px)',
              border: '1px solid var(--dsw-alias-border-l2, #e5e7eb)',
              background: 'transparent', fontFamily: 'inherit', cursor: 'pointer',
              color: 'var(--dsw-alias-label-secondary, #6b7280)',
            },
          }, `${hub.path} (${hub.dependents})`)),
        ),

        // 核心文件：静态 import 图 PageRank 前三（计入间接重要性，与 fan-in 互补）
        !overview && status === 'ready' && index && coreFiles.length > 0 && h('div', {
          'aria-label': t('coreLabel'),
          title: t('coreHint'),
          style: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 },
        },
          h('span', { style: { fontSize: 12, ...muted } }, t('coreLabel')),
          ...coreFiles.map((entry) => {
            const label = `${entry.path} (${entry.score.toFixed(3)})`
            return h('button', {
              key: entry.path,
              type: 'button',
              onClick: guard('open-core', () => {
                const row = rowByPath.get(entry.path)
                if (row) openDetail(row)
              }),
              'aria-label': label,
              title: `${entry.path} — PageRank ${entry.score.toFixed(3)}`,
              style: {
                fontSize: 11.5, lineHeight: '18px', padding: '1px 8px',
                borderRadius: 'var(--dsw-radius-sm, 6px)',
                border: '1px solid var(--dsw-alias-border-l2, #e5e7eb)',
                background: 'transparent', fontFamily: 'inherit', cursor: 'pointer',
                color: 'var(--dsw-alias-label-secondary, #6b7280)',
              },
            }, label)
          }),
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
          h('div', { role: 'tablist', 'aria-label': t('title'), style: { display: 'flex', gap: 8, marginBottom: 12 } },
            h('button', {
              type: 'button', role: 'tab', 'aria-selected': tab === 'cards', 'aria-pressed': tab === 'cards',
              style: tab === 'cards' ? primaryStyle : buttonStyle,
              onClick: guard('tab-cards', () => setTab('cards')),
            }, t('viewCards')),
            h('button', {
              ref: wikiTabRef,
              type: 'button', role: 'tab', 'aria-selected': tab === 'wiki', 'aria-pressed': tab === 'wiki',
              style: tab === 'wiki' ? primaryStyle : buttonStyle,
              onClick: guard('tab-wiki', () => setTab('wiki')),
            }, `${t('viewWiki')} ${wikis.length}`),
            h('button', {
              ref: memoryTabRef,
              type: 'button', role: 'tab', 'aria-selected': tab === 'memory', 'aria-pressed': tab === 'memory',
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
              ref: searchRef,
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
            h('button', {
              type: 'button', style: group ? primaryStyle : buttonStyle,
              onClick: guard('group-cards', () => setGroup(v => !v)), 'aria-pressed': group,
            }, t('groupBy')),
            h('select', {
              value: sortBy,
              onChange: guard('sort-cards', (e) => setSortBy(e.target.value)),
              style: { ...inputStyle, maxWidth: 170 },
              'aria-label': t('sortBy'),
            },
              h('option', { value: 'path' }, t('sortPath')),
              h('option', { value: 'title' }, t('sortTitle')),
              h('option', { value: 'updated' }, t('sortUpdated')),
            ),
            // 语言筛选：索引里只有一种语言时不占位
            langOptions.length > 1 && h('select', {
              value: langFilter,
              onChange: guard('filter-lang', (e) => setLangFilter(e.target.value)),
              style: { ...inputStyle, maxWidth: 170 },
              'aria-label': t('filterLang'),
            },
              h('option', { value: '' }, t('allLangs')),
              ...langOptions.map(([lang, count]) => h('option', { key: lang, value: lang }, `${languageLabel(lang)} (${count})`)),
            ),
          ),
          topTags.length > 0 && h('div', {
            style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
          },
            h('span', { style: { fontSize: 12, ...muted } }, t('tagsLabel')),
            ...topTags.map(tag => h('button', {
              key: tag,
              type: 'button',
              'aria-pressed': tagFilter === tag,
              onClick: guard('filter-tag', () => setTagFilter(tagFilter === tag ? '' : tag)),
              style: tagChipStyle(tagFilter === tag),
            }, tag)),
            tagFilter && h('button', {
              type: 'button',
              onClick: guard('clear-tag', () => setTagFilter('')),
              style: tagChipStyle(false),
            }, t('clearTag')),
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
            : (grouped
                ? h('div', null,
                  ...grouped.map(([modulePath, list]) => h('section', {
                    key: modulePath, style: { marginBottom: 16 },
                  },
                    h('h3', {
                      style: {
                        margin: '0 0 8px', fontSize: 14, fontWeight: 600,
                        color: 'var(--dsw-alias-label-primary, #111827)',
                      },
                    }, modulePath === '.' ? t('groupRoot') : modulePath),
                    renderCards(list))))
                : renderCards(visible)),
          filtered.length > 0 && h('div', {
            style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 12, ...muted },
          },
            h('span', null, tt('showing', { shown: visible.length, total: filtered.length })),
            filtered.length > visible.length && h('button', {
              type: 'button', style: buttonStyle,
              onClick: guard('load-more', () => setVisibleCount(n => n + 120)),
            }, tt('loadMore', { n: filtered.length - visible.length })),
          ),
          // 内联详情列（切片 1 不开新页面；Escape 或按钮关闭）
          detail && h(DetailPane, {
            row: detail, references: detailReferences, imports: detailImports,
            dependents: detailDependents,
            importDepth, onImportDepth: setImportDepth,
            wikiCitations: detailWikiCitations,
            onOpenWiki: guard('open-wiki-citation', openWikiCitation),
            onOpenFile: guard('open-file', (path) => {
              const row = rowByPath.get(path)
              if (row) openDetail(row)
            }),
            t, tt, onClose: guard('close-detail', () => closeDetail()),
          }),
          ),
          // Wiki 页签：页面列表与单页原文浏览（切片 3）
          tab === 'wiki' && h(WikiPanel, {
            entries: wikis,
            meta: wikiMeta,
            selected: wikiSelected,
            query: wikiQuery,
            targetSection: wikiTargetSection,
            onQuery: setWikiQuery,
            onSelect: guard('open-wiki', (entry) => openWikiEntry(entry)),
            onClose: guard('close-wiki', () => { setWikiTargetSection(''); closeWiki() }),
            t, tt,
          }),
          // 记忆页签：条目列表（状态徽章）与单条原文浏览（Phase 4）
          tab === 'memory' && h(MemoryPanel, {
            entries: memories,
            selected: memorySelected,
            onSelect: guard('open-memory', (entry) => openMemory(entry)),
            onClose: guard('close-memory', () => closeMemory()),
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
          role: 'status', 'aria-live': 'polite',
          style: { margin: '12px 0 0', fontSize: 14, color: 'var(--dsw-alias-label-primary, #111827)' },
        }, message),
        notice,
        ),
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
        return h('p', { role: 'status', style: { padding: '48px 20px', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #6b7280)', fontSize: '14px', lineHeight: '1.6' } }, t('loading'))
      }
      if (rows.length === 0) {
        return h('p', { role: 'status', style: { padding: '48px 20px', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #6b7280)', fontSize: '14px', lineHeight: '1.6' } }, t('empty'))
      }
      /** 行内状态文案（对齐单库视图的状态词汇）。 */
      const statusText = (row) => {
        if (row.status === 'ready') return null
        if (row.status === 'no-session') return t('noSession')
        if (row.status === 'no-asset') return t('noAsset')
        return tt('loadFailed', { code: row.errorCode ?? 'unknown' })
      }
      return h('div', null,
        ...rows.map((row, i) => h('button', {
          key: row.workspaceId,
          type: 'button',
          onClick: () => onOpen(row.workspaceId),
          // 官方管理列表行模式（PluginManagerPage .row，practices.md 指定的
          // 参照）：无卡片边框、0.5px 发丝分隔（末行无）、padding 12px 2px、
          // 标题 13.5px/500、次行等宽字体
          style: {
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            width: '100%', padding: '12px 2px', textAlign: 'left',
            background: 'transparent', border: 'none', borderRadius: 0, cursor: 'pointer',
            ...(i < rows.length - 1
              ? { borderBottom: '0.5px solid var(--dsw-alias-border-l2, #d1d5db)' }
              : {}),
          },
          'aria-label': `${t('modeSingle')}: ${row.title}`,
        },
          statusDot(row.status === 'ready'),
          h('span', {
            style: { flex: 1, minWidth: 120, fontSize: 13.5, fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: 'var(--dsw-alias-label-primary, #111827)' },
          }, row.title),
          h('span', {
            style: {
              fontSize: 11.5, lineHeight: '16px', flex: 'none',
              overflow: 'hidden', maxWidth: 260, textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              // 官方 rowModule 同款：等宽字体 + tertiary（--dsw-font-mono 无
              // CSS 定义，官方页亦只靠其回退链，故直接用回退链）
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: 'var(--dsw-alias-label-tertiary, #6b7280)',
            },
          }, row.path),
          row.status === 'ready'
            ? h('span', {
                style: { display: 'flex', gap: 16, flex: 'none', flexWrap: 'wrap',
                  fontSize: 11.5, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary, #6b7280)' },
              },
              h('span', null, tt('statFiles', { n: row.files })),
              h('span', null, tt('statSymbols', { n: row.symbols })),
              h('span', null, tt('statCards', { n: row.cards })),
              h('span', null, tt('statDocs', { n: row.docs })),
              row.languages > 0 ? h('span', null, tt('statLangs', { n: row.languages })) : null,
              row.branch ? h('span', null, tt('gitBranch', { name: row.branch })) : null,
              row.updatedAt
                ? h('span', null, tt('updated', { when: row.updatedAt.slice(0, 10) }))
                : h('span', null, t('never')),
            )
            : h('span', {
                style: { fontSize: 11.5, lineHeight: 16, flex: 'none', color: 'var(--dsw-alias-label-tertiary, #6b7280)' },
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
          row.cycleSize > 0 && h('span', {
            role: 'img',
            'aria-label': cycleBadgeHint(row.cycleSize, row.cycleSample, tt),
            title: cycleBadgeHint(row.cycleSize, row.cycleSample, tt),
            style: { flex: 'none', fontSize: 12, lineHeight: '16px',
              color: 'var(--dsw-alias-state-error-primary, #dc2626)' },
          }, '⟲'),
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
                `${languageLabel(row.lang || '')} · ${tt('detailSymbols', { n: row.symbols })}`),
        ),
      )
    }

    /** 卡片行（列表视图）。优化后移除卡片风格，采用紧凑列表样式。 */
    function CardRow({ row, t, tt, onOpen }) {
      const { card } = row
      return h('button', {
        type: 'button', onClick: onOpen,
        style: {
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          padding: '8px 12px', textAlign: 'left',
          background: 'transparent', border: 'none', borderRadius: 0, cursor: 'pointer',
          borderBottom: '0.5px solid var(--dsw-alias-border-l2, #f3f4f6)',
          transition: 'background 150ms ease',
        },
        'aria-label': card ? card.title : `${row.path} (${t('pending')})`,
      },
        statusDot(Boolean(card)),
        h('span', {
          style: { flex: 1, fontSize: 13.5, fontWeight: 500, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--dsw-alias-label-primary, #111827)' },
        }, card ? `${card.title} · ${row.path}` : row.path),
        row.cycleSize > 0 && h('span', {
          role: 'img',
          'aria-label': cycleBadgeHint(row.cycleSize, row.cycleSample, tt),
          title: cycleBadgeHint(row.cycleSize, row.cycleSample, tt),
          style: { flex: 'none', fontSize: 12, lineHeight: '16px',
            color: 'var(--dsw-alias-state-error-primary, #dc2626)' },
        }, '⟲'),
        h('span', { style: { fontSize: 11.5, lineHeight: 16, flex: 'none', color: 'var(--dsw-alias-label-tertiary, #6b7280)' } },
          tt('detailSymbols', { n: row.symbols })),
        h('span', {
          style: { fontSize: 11.5, lineHeight: 16, flex: 'none', color: 'var(--dsw-alias-label-tertiary, #6b7280)' },
        }, card ? card.generatedAt.slice(0, 10) : t('pending')),
      )
    }

    /** 详情列（选中条目的元数据、摘要、出边与反向引用）。打开时聚焦关闭按钮，便于键盘用户直接操作。 */
    function DetailPane({ row, references = [], imports = [], dependents = [], importDepth = 1, onImportDepth, wikiCitations = [], onOpenWiki, onOpenFile, t, tt, onClose }) {
      const { card } = row
      const closeRef = useRef(null)
      const detailRef = useRef(null)
      const [copyState, setCopyState] = useState('')
      useEffect(() => { closeRef.current?.focus?.() }, [])
      /**
       * 复制源文件相对路径；剪贴板不可用时显示可读失败行。
       */
      const copyPath = async () => {
        try {
          if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            throw new Error('clipboard unavailable')
          }
          await navigator.clipboard.writeText(row.path)
          setCopyState('copied')
        } catch {
          setCopyState('failed')
        }
      }
      // 当新卡片打开时，自动滚动到详情面板，让用户能看到完整内容
      useEffect(() => {
        const el = detailRef.current
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, [row])
      /**
       * 依赖方向条目的文件链接（点击打开该文件详情）。
       * @param {{path:string, line?:number}} entry - 出边/依赖方条目。
       * @returns {object} 按钮元素（内含等宽路径文本）。
       */
      const fileLink = (entry) => h('button', {
        type: 'button',
        onClick: () => onOpenFile?.(entry.path),
        'aria-label': tt('openFile', { path: entry.path }),
        style: {
          background: 'transparent', border: 'none', padding: 0, margin: 0,
          font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left',
        },
      }, h('code', {
        style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          color: 'var(--dsw-alias-label-primary, #111827)' },
      }, formatReferenceSite(entry)))
      /**
       * 依赖方向条目的后缀（符号与跳数）：直接边只列符号，传递边标注 hops。
       * @param {{symbols:string[], depth:number}} entry - 出边/依赖方条目。
       * @returns {string} 形如 ` (sym, 2 hops)`，无信息时为空串。
       */
      const edgeDetail = (entry) => entry.depth > 1
        ? ` (${entry.symbols.length > 0 ? `${entry.symbols.join(', ')}, ` : ''}${entry.depth} hops)`
        : (entry.symbols.length > 0 ? ` (${entry.symbols.join(', ')})` : '')
      return h('div', {
        ref: detailRef,
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
            type: 'button', onClick: copyPath,
            style: { ...chipButtonStyle(), width: 'auto', padding: '0 10px', fontSize: 12 },
            'aria-label': t('copyPath'),
          }, copyState === 'copied' ? t('copied') : t('copyPath')),
          h('button', {
            ref: closeRef,
            type: 'button', onClick: onClose, style: chipButtonStyle(),
            'aria-label': t('detailClose'),
          }, '×'),
        ),
        copyState === 'failed' && h('p', {
          role: 'status', style: { fontSize: 12, margin: '0 0 8px', ...mutedStyle() },
        }, t('copyFailed')),
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
        // 循环依赖摘要：组大小 + 代表性环路径（短环）；其他文件可点击跳转
        row.cycleSize > 0 && h('div', {
          style: { marginTop: 12, fontSize: 12.5, lineHeight: 1.7,
            color: 'var(--dsw-alias-state-error-primary, #dc2626)' },
        },
          `⟲ ${tt('cycleBadgeHint', { n: row.cycleSize })}`,
          ...(Array.isArray(row.cycleSample) && row.cycleSample.length > 2 && row.cycleSample.length <= 4
            ? [
              h('span', { key: 'cycle-sep' }, ' · '),
              ...row.cycleSample.flatMap((member, index) => {
                const nodes = []
                if (index > 0) nodes.push(h('span', { key: `arrow${index}` }, ' → '))
                nodes.push(member === row.path
                  ? h('span', { key: `self${index}` }, member)
                  : h('button', {
                    key: `member${index}`,
                    type: 'button',
                    onClick: () => onOpenFile?.(member),
                    'aria-label': tt('openFile', { path: member }),
                    style: {
                      background: 'transparent', border: 'none', padding: 0, margin: 0,
                      font: 'inherit', color: 'inherit', cursor: 'pointer',
                      textDecoration: 'underline', textUnderlineOffset: 2,
                    },
                  }, member))
                return nodes
              }),
            ]
            : [])),
        // 依赖方向深度：同时控制出边（依赖谁）与依赖方（谁依赖我）的展开
        (imports.length > 0 || dependents.length > 0) && h('div', {
          style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 },
        },
          h('div', {
            style: { fontSize: 12.5, color: 'var(--dsw-alias-label-secondary, #6b7280)' },
          }, t('importDepthLabel')),
          h('div', {
            role: 'group',
            'aria-label': t('importDepthLabel'),
            style: { display: 'flex', gap: 4 },
          },
            ...[1, 2, 3].map(level => h('button', {
              key: level,
              type: 'button',
              'aria-pressed': importDepth === level,
              'aria-label': tt('importDepthOption', { n: level }),
              onClick: () => onImportDepth?.(level),
              style: {
                ...chipButtonStyle(), padding: '0 7px', fontSize: 11,
                ...(importDepth === level
                  ? {
                    borderColor: 'var(--dsw-alias-state-business-primary, #2563eb)',
                    color: 'var(--dsw-alias-state-business-primary, #2563eb)',
                  }
                  : {}),
              },
            }, String(level)))),
        ),
        imports.length > 0 && h('div', { style: { marginTop: 10 } },
          h('div', {
            style: { fontSize: 13, fontWeight: 600, marginBottom: 6,
              color: 'var(--dsw-alias-label-primary, #111827)' },
          }, t('detailImports')),
          ...imports.slice(0, 8).map((entry, i) => h('div', {
            key: `${entry.path}\u0000${entry.line ?? 0}\u0000${i}`,
            style: { fontSize: 12.5, lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary, #6b7280)' },
          },
            `${entry.depth > 1 ? '⇢' : (entry.mutual ? '↔' : '→')} `,
            fileLink(entry),
            edgeDetail(entry),
          )),
          imports.length > 8 && h('div', {
            style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6b7280)' },
          }, tt('detailImportsMore', { n: imports.length - 8 })),
        ),
        // 依赖方（文件级反向影响面）：谁 import 了本文件，可展开间接依赖方
        dependents.length > 0 && h('div', { style: { marginTop: 14 } },
          h('div', {
            style: { fontSize: 13, fontWeight: 600, marginBottom: 6,
              color: 'var(--dsw-alias-label-primary, #111827)' },
          }, t('detailDependents')),
          ...dependents.slice(0, 8).map((entry, i) => h('div', {
            key: `${entry.path}\u0000${entry.line ?? 0}\u0000${i}`,
            style: { fontSize: 12.5, lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary, #6b7280)' },
          },
            `${entry.depth > 1 ? '⇠' : (entry.mutual ? '↔' : '←')} `,
            fileLink(entry),
            edgeDetail(entry),
          )),
          dependents.length > 8 && h('div', {
            style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6b7280)' },
          }, tt('detailImportsMore', { n: dependents.length - 8 })),
        ),
        references.length > 0 && h('div', { style: { marginTop: 14 } },
          h('div', {
            style: { fontSize: 13, fontWeight: 600, marginBottom: 6,
              color: 'var(--dsw-alias-label-primary, #111827)' },
          }, t('detailReferences')),
          ...references.slice(0, 8).map(ref => h('div', {
            key: ref.symbol,
            style: { fontSize: 12.5, lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary, #6b7280)' },
          },
            h('code', {
              style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: 'var(--dsw-alias-label-primary, #111827)' },
            }, ref.symbol),
            ` ← ${ref.froms.map(formatReferenceSite).join(', ')}`,
          )),
          references.length > 8 && h('div', {
            style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6b7280)' },
          }, tt('detailRefsMore', { n: references.length - 8 })),
        ),
        wikiCitations.length > 0 && h('div', { style: { marginTop: 14 } },
          h('div', {
            style: { fontSize: 13, fontWeight: 600, marginBottom: 6,
              color: 'var(--dsw-alias-label-primary, #111827)' },
          }, t('detailWikiCitations')),
          ...wikiCitations.slice(0, 6).map(citation => h('div', {
            key: `${citation.slug}\u0000${citation.title}`,
            style: {
              display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 6,
              fontSize: 12.5, lineHeight: 1.7,
            },
          },
            h('button', {
              type: 'button',
              onClick: () => onOpenWiki?.(citation),
              'aria-label': citation.title,
              style: {
                background: 'transparent', border: 'none', padding: 0, font: 'inherit',
                cursor: 'pointer', textAlign: 'left', textDecoration: 'underline',
                color: 'var(--dsw-alias-state-business-primary, #2563eb)',
              },
            }, citation.title),
            // 章节 chips：多章节引用可逐节跳转（页面标题按钮仍跳到首节）
            ...citation.sections.slice(0, 4).map(section => h('button', {
              key: section,
              type: 'button',
              title: section,
              onClick: () => onOpenWiki?.({ ...citation, sections: [section] }),
              'aria-label': `${citation.title} · ${section}`,
              style: {
                font: 'inherit', fontSize: 12, padding: '1px 8px', borderRadius: 999,
                border: '1px solid var(--dsw-alias-border-l2, #d1d5db)',
                background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
                color: 'var(--dsw-alias-label-secondary, #6b7280)', cursor: 'pointer',
              },
            }, section)),
            citation.sections.length > 4 && h('span', {
              style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6b7280)' },
            }, tt('detailRefsMore', { n: citation.sections.length - 4 })),
          )),
          wikiCitations.length > 6 && h('div', {
            style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6b7280)' },
          }, tt('detailRefsMore', { n: wikiCitations.length - 6 })),
        ),
      )
    }

    /** Wiki 面板：页面列表与单页原文浏览；打开页面时聚焦返回按钮。 */
    function WikiPanel({ entries, meta, selected, query, targetSection = '', onQuery, onSelect, onClose, t, tt }) {
      const [onlyUntracked, setOnlyUntracked] = useState(false)
      const backRef = useRef(null)
      useEffect(() => { if (selected) backRef.current?.focus?.() }, [selected])
      // 深链：页面渲染后滚动到目标章节（锚点 id 与 renderMarkdown 的标题锚一致）
      useEffect(() => {
        if (!selected || !targetSection) return
        const id = anchorOf(targetSection, new Map())
        const el = typeof document !== 'undefined' ? document.getElementById?.(id) : null
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, [selected, targetSection])
      if (selected) {
        return h('div', null,
          h('div', {
            style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
          },
            h('button', {
              ref: backRef,
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
      // 清单级诊断：上次生成失败页与磁盘缺失页（数据只来自清单与目录列表）
      const diagnostics = h('div', null,
        meta && meta.cardsStale === true && h('p', {
          role: 'status',
          style: { ...mutedStyle(), fontSize: 12, margin: '0 0 12px', color: 'var(--dsw-alias-state-error-primary, #dc2626)' },
        }, t('wikiStaleCards')),
        meta && meta.memoryStale === true && h('p', {
          role: 'status',
          style: { ...mutedStyle(), fontSize: 12, margin: '0 0 12px', color: 'var(--dsw-alias-state-error-primary, #dc2626)' },
        }, t('wikiStaleMemory')),
        meta && meta.failedTotal > 0 && h('p', {
          role: 'status',
          title: meta.failedPages.length > 0
            ? tt('wikiFailedHint', { pages: meta.failedPages.join(', ') })
            : undefined,
          style: { ...mutedStyle(), fontSize: 12, margin: '0 0 12px', color: 'var(--dsw-alias-state-error-primary, #dc2626)' },
        }, tt('wikiFailedSummary', { n: meta.failedTotal })),
        meta && meta.missingTotal > 0 && h('p', {
          role: 'status',
          title: meta.missingPages.length > 0
            ? tt('wikiMissingHint', { pages: meta.missingPages.join(', ') })
            : undefined,
          style: { ...mutedStyle(), fontSize: 12, margin: '0 0 12px', color: 'var(--dsw-alias-state-error-primary, #dc2626)' },
        }, tt('wikiMissingSummary', { n: meta.missingTotal })),
        meta && meta.invalidTotal > 0 && h('p', {
          role: 'status',
          title: meta.invalidPages.length > 0
            ? tt('wikiInvalidHint', { pages: meta.invalidPages.join(', ') })
            : undefined,
          style: { ...mutedStyle(), fontSize: 12, margin: '0 0 12px', color: 'var(--dsw-alias-state-error-primary, #dc2626)' },
        }, tt('wikiInvalidSummary', { n: meta.invalidTotal })),
        meta && meta.duplicateTotal > 0 && h('p', {
          role: 'status',
          title: [...meta.duplicateSlugs, ...meta.duplicatePaths].length > 0
            ? tt('wikiDuplicateHint', { pages: [...meta.duplicateSlugs, ...meta.duplicatePaths].join(', ') })
            : undefined,
          style: { ...mutedStyle(), fontSize: 12, margin: '0 0 12px', color: 'var(--dsw-alias-state-error-primary, #dc2626)' },
        }, tt('wikiDuplicateSummary', { n: meta.duplicateTotal })),
      )
      if (entries.length === 0) {
        return h('div', null,
          diagnostics,
          h('p', { style: { padding: '48px 20px', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #6b7280)', fontSize: '14px', lineHeight: '1.6' } }, t('wikiEmpty')),
        )
      }
      const q = query.trim().toLowerCase()
      const untrackedPages = entries.filter(entry => (entry.citationCoverage?.untracked ?? 0) > 0)
      const filtered = entries.filter(entry => {
        if (onlyUntracked && (entry.citationCoverage?.untracked ?? 0) <= 0) return false
        if (!q) return true
        return `${entry.title}\n${entry.file}`.toLowerCase().includes(q)
      })
      const groups = new Map()
      for (const entry of filtered) {
        const key = entry.module || t('wikiGeneral')
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(entry)
      }
      const showModule = entries.some(entry => entry.module)
      const outOfRange = entries.reduce((sum, entry) => sum + (entry.outOfRange ?? 0), 0)
      const unchecked = entries.reduce((sum, entry) => sum + (entry.unchecked ?? 0), 0)
      // 指纹覆盖率：数据只来自清单；旧清单无指纹时给出降级说明，不逐页打扰
      const coverage = entries.reduce((acc, entry) => {
        const item = entry.citationCoverage
        if (!item) return acc
        acc.total += item.total
        acc.tracked += item.tracked
        acc.untracked += item.untracked
        acc.hasDigests = acc.hasDigests || item.hasDigests
        for (const key of ['unreadable', 'range', 'cap', 'unknown']) {
          acc.reasons[key] += item.reasons?.[key] ?? 0
        }
        return acc
      }, {
        total: 0,
        tracked: 0,
        untracked: 0,
        hasDigests: false,
        reasons: { unreadable: 0, range: 0, cap: 0, unknown: 0 },
      })
      const coverageReasons = formatCoverageReasons(coverage.reasons, tt)
      return h('div', null,
        h('div', {
          style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
        },
          h('input', {
            type: 'search',
            value: query,
            onChange: (e) => onQuery(e.target.value),
            placeholder: t('wikiSearch'),
            'aria-label': t('wikiSearch'),
            style: {
              flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '8px 10px',
              borderRadius: 'var(--dsw-radius-sm, 8px)', fontSize: 13,
              border: '1px solid var(--dsw-alias-border-l2, #d1d5db)',
              background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
              color: 'var(--dsw-alias-label-primary, #111827)',
            },
          }),
          untrackedPages.length > 0 && h('button', {
            type: 'button',
            'aria-pressed': onlyUntracked,
            'aria-label': tt('wikiOnlyUntracked', { n: untrackedPages.length }),
            onClick: () => setOnlyUntracked(value => !value),
            style: {
              ...chipButtonStyle(), width: 'auto', padding: '0 10px', fontSize: 12,
              whiteSpace: 'nowrap',
              ...(onlyUntracked
                ? {
                  borderColor: 'var(--dsw-alias-state-business-primary, #2563eb)',
                  color: 'var(--dsw-alias-state-business-primary, #2563eb)',
                }
                : {}),
            },
          }, tt('wikiOnlyUntracked', { n: untrackedPages.length })),
        ),
        diagnostics,
        // 引用完整性摘要：行号越界（索引有行数时可判）与未检查计数
        (outOfRange > 0 || unchecked > 0) && h('p', {
          role: 'status',
          style: { ...mutedStyle(), fontSize: 12, margin: '0 0 12px' },
        }, tt('wikiIssueSummary', { outOfRange, unchecked })),
        coverage.total > 0 && (!coverage.hasDigests || coverage.untracked > 0) && h('p', {
          role: 'status',
          style: { ...mutedStyle(), fontSize: 12, margin: '0 0 12px' },
        }, coverage.hasDigests
          ? tt('wikiCoverageSummary', { ...coverage, reasons: coverageReasons })
          : tt('wikiCoverageLegacy', { total: coverage.total })),
        filtered.length === 0
          ? h('p', { style: { ...mutedStyle(), fontSize: 13 }, role: 'status' }, t('wikiNoMatches'))
          : [...groups.entries()].map(([module, list]) => h('div', { key: module, style: { marginBottom: 12 } },
            showModule && h('h3', {
              style: {
                margin: '0 0 8px', fontSize: 13, fontWeight: 600,
                color: 'var(--dsw-alias-label-secondary, #6b7280)',
              },
            }, module),
            ...list.map(entry => h('button', {
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
              coverage.hasDigests && entry.citationCoverage?.untracked > 0 && h('span', {
                style: { fontSize: 11, flex: 'none', color: 'var(--dsw-alias-label-tertiary, #6b7280)' },
                title: tt('wikiCoverageBadge', { n: entry.citationCoverage.untracked }),
                'aria-label': tt('wikiCoverageHint', {
                  n: entry.citationCoverage.untracked,
                  reasons: formatCoverageReasons(entry.citationCoverage.reasons, tt),
                }),
              }, `◌ ${entry.citationCoverage.untracked}`),
              entry.outOfRange > 0 && h('span', {
                style: { fontSize: 11, flex: 'none', color: 'var(--dsw-alias-state-error-primary, #dc2626)' },
                title: tt('wikiRangeHint', { n: entry.outOfRange }),
                'aria-label': tt('wikiRangeHint', { n: entry.outOfRange }),
              }, `⚠ ${entry.outOfRange}`),
              entry.orphan && h('span', {
                style: { fontSize: 11, flex: 'none', color: 'var(--dsw-alias-state-error-primary, #dc2626)' },
              }, t('wikiOrphan')),
              h('span', {
                style: { fontSize: 12, flex: 'none', color: 'var(--dsw-alias-label-secondary, #6b7280)' },
              }, entry.generatedAt.slice(0, 10) || '—'),
            )),
          )),
      )
    }

    /** 记忆面板：条目列表（状态徽章）与单条原文浏览；打开条目时聚焦返回按钮。 */
    function MemoryPanel({ entries, selected, onSelect, onClose, t }) {
      const backRef = useRef(null)
      useEffect(() => { if (selected) backRef.current?.focus?.() }, [selected])
      if (selected) {
        return h('div', null,
          h('div', {
            style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
          },
            h('button', {
              ref: backRef,
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
        return h('p', { style: { padding: '48px 20px', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #6b7280)', fontSize: '14px', lineHeight: '1.6' } }, t('memoryEmpty'))
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
     * 极简 mermaid flowchart 渲染（零依赖，纯 SVG）。
     * 只支持生成 prompt 约定出的常见子集：`flowchart|graph TD|TB|LR`、
     * 节点 `id[label]` / `id(label)` / `id{label}` / `id((label))`（含
     * `[[..]]`、`{{..}}`）、边 `-->` / `---` / `==>` / `-.->`（可带
     * `|label|`），以及 `subgraph 名称` … `end` 分组（渲染为虚线框 +
     * 组名）。`%%` 注释与 classDef/style 等指令行跳过；其他图类型
     * （sequenceDiagram 等）返回 null，由调用方降级为代码块。
     * 布局为确定性分层：TD 按最长路径分层、层内按出现顺序排列；LR 交换
     * 轴。环回边反向连接，环不会无限展开（迭代上限 12 层）。
     * @param {string} source - mermaid 源码（围栏内文本）。
     * @param {number} key - React key。
     * @returns {object|null} SVG 元素；无法识别时 null。
     */
    function renderMermaidDiagram(source, key) {
      const ARROWS = ['-.->', '==>', '-->', '---']
      const lines = String(source ?? '').split('\n').map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('%%'))
      const header = lines.length > 0 ? /^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)?/i.exec(lines[0]) : null
      if (!header) return null
      const dir = /^(?:LR|RL)$/i.test(header[1] ?? '') ? 'LR' : 'TD'
      const DIRECTIVE = /^(?:subgraph|end\b|classDef\b|class\s|style\s|linkStyle\b|click\s|direction\s)/
      /** @type {Map<string, {label:string, shape:string}>} */
      const nodes = new Map()
      /**
       * 解析一个节点引用（id + 可选形状/标签）。
       * @param {string} raw - 原文片段。
       * @returns {{id:string, label:string, shape:string}|null} 节点；无法识别时 null。
       */
      const parseNode = (raw) => {
        const text = String(raw ?? '').trim()
        const m = /^([A-Za-z0-9_]+)\s*(.*)$/.exec(text)
        if (!m) return null
        const id = m[1]
        const rest = (m[2] ?? '').trim()
        let shape = 'rect'
        let label = id
        /**
         * 尝试剥离一层形状括号。
         * @param {string} open - 起始标记。
         * @param {string} close - 结束标记。
         * @param {string} name - 形状名。
         * @returns {boolean} 是否匹配。
         */
        const wrap = (open, close, name) => {
          if (!rest.startsWith(open) || !rest.endsWith(close) || rest.length <= open.length + close.length - 1) return false
          shape = name
          label = rest.slice(open.length, rest.length - close.length).trim()
          return true
        }
        wrap('((', '))', 'circle') || wrap('[(', ')]', 'round') || wrap('[[', ']]', 'rect')
          || wrap('{{', '}}', 'diamond') || wrap('[', ']', 'rect')
          || wrap('(', ')', 'round') || wrap('{', '}', 'diamond')
        label = label.replace(/^["']+|["']+$/g, '')
        return { id, label: label || id, shape }
      }
      /** @type {Array<{from:string, to:string, label:string}>} */
      const edges = []
      /** @type {Map<string, string[]>} subgraph 组名 → 成员节点（按出现顺序）。 */
      const groups = new Map()
      let currentGroup = null
      /**
       * 把新声明的节点登记到当前 subgraph（已在别的组时保持原归属）。
       * @param {string} id - 节点 id。
       * @returns {void}
       */
      const joinGroup = (id) => {
        if (!currentGroup) return
        const members = groups.get(currentGroup)
        if (members && !members.includes(id)) members.push(id)
      }
      for (const line of lines.slice(1)) {
        const sub = /^subgraph\s+(.+)$/i.exec(line)
        if (sub) {
          const raw = sub[1].trim()
          const bracket = /\[(.*)\]$/.exec(raw)
          const name = (bracket ? bracket[1] : raw).replace(/^["']+|["']+$/g, '').trim() || 'group'
          currentGroup = name
          if (!groups.has(name)) groups.set(name, [])
          continue
        }
        if (/^end$/i.test(line)) {
          currentGroup = null
          continue
        }
        if (DIRECTIVE.test(line)) continue
        // 找最早的箭头（多字符箭头优先于其前缀 ---）
        let arrowAt = -1
        let arrow = ''
        for (const candidate of ARROWS) {
          const at = line.indexOf(candidate)
          if (at >= 0 && (arrowAt < 0 || at < arrowAt)) {
            arrowAt = at
            arrow = candidate
          }
        }
        if (arrowAt < 0) {
          const node = parseNode(line)
          if (node) {
            const known = nodes.has(node.id)
            if (!known) nodes.set(node.id, { label: node.label, shape: node.shape })
            if (!known) joinGroup(node.id)
          }
          continue
        }
        const left = parseNode(line.slice(0, arrowAt))
        let rightText = line.slice(arrowAt + arrow.length).trim()
        let edgeLabel = ''
        if (rightText.startsWith('|')) {
          const close = rightText.indexOf('|', 1)
          if (close > 0) {
            edgeLabel = rightText.slice(1, close).trim()
            rightText = rightText.slice(close + 1).trim()
          }
        }
        const right = parseNode(rightText)
        if (!left || !right) continue
        for (const node of [left, right]) {
          const known = nodes.get(node.id)
          // 后出现的显式标签覆盖默认 id 标签；纯引用不覆盖已有形状
          if (!known || node.label !== node.id) nodes.set(node.id, { label: node.label, shape: node.shape })
          if (!known) joinGroup(node.id)
        }
        edges.push({ from: left.id, to: right.id, label: edgeLabel })
      }
      if (nodes.size === 0) return null

      // 分层：迭代松弛求最长路径（环在 12 次内收敛/截断）
      const ids = [...nodes.keys()]
      const layer = new Map(ids.map(id => [id, 0]))
      const maxIter = Math.min(ids.length + 1, 12)
      for (let iter = 0; iter < maxIter; iter++) {
        let changed = false
        for (const edge of edges) {
          const want = (layer.get(edge.from) ?? 0) + 1
          if (want > (layer.get(edge.to) ?? 0)) {
            layer.set(edge.to, want)
            changed = true
          }
        }
        if (!changed) break
      }

      const NODE_H = 30
      /**
       * 估算节点宽度（中文按 12px、其余按 7px 计）。
       * @param {string} label - 节点标签。
       * @returns {number} 像素宽度（58–240）。
       */
      const measure = (label) => Math.min(240, Math.max(58, Math.round(24
        + [...label].reduce((sum, ch) => sum + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 12 : 7), 0))))
      /** @type {Map<string, {x:number, y:number, w:number, h:number}>} */
      const positions = new Map()
      /** @type {Map<number, string[]>} */
      const layers = new Map()
      for (const id of ids) {
        const level = layer.get(id) ?? 0
        if (!layers.has(level)) layers.set(level, [])
        layers.get(level).push(id)
      }
      const ordered = [...layers.entries()].sort((a, b) => a[0] - b[0])
      let width = 40
      let height = 40
      if (dir === 'TD') {
        let y = 32
        for (const [, members] of ordered) {
          let x = 18
          for (const id of members) {
            const w = measure(nodes.get(id).label)
            positions.set(id, { x, y, w, h: NODE_H })
            x += w + 26
          }
          width = Math.max(width, x - 26 + 18)
          y += NODE_H + 44
        }
        height = Math.max(height, y - 44 + 18)
      } else {
        let x = 32
        for (const [, members] of ordered) {
          const colW = Math.max(...members.map(id => measure(nodes.get(id).label)))
          let y = 18
          for (const id of members) {
            positions.set(id, { x, y, w: colW, h: NODE_H })
            y += NODE_H + 18
          }
          width = Math.max(width, x + colW + 18)
          height = Math.max(height, y - 18 + 18)
          x += colW + 56
        }
      }

      const EDGE_COLOR = 'var(--dsw-alias-border-l2, #9ca3af)'
      const TEXT_COLOR = 'var(--dsw-alias-label-primary, #111827)'
      const MUTED = 'var(--dsw-alias-label-secondary, #6b7280)'
      const BORDER = 'var(--dsw-alias-border-l2, #d1d5db)'
      const BG = 'var(--dsw-alias-bg-layer-1, #ffffff)'
      const BG2 = 'var(--dsw-alias-bg-layer-2, #f9fafb)'
      // subgraph 分组框：包围组内节点（虚线底框 + 组名），先于边/节点绘制
      const groupElements = [...groups.entries()]
        .filter(([, members]) => members.some(id => positions.has(id)))
        .map(([name, members], index) => {
          const rects = members.map(id => positions.get(id)).filter(Boolean)
          const minX = Math.min(...rects.map(r => r.x)) - 12
          const minY = Math.min(...rects.map(r => r.y)) - 24
          const maxX = Math.max(...rects.map(r => r.x + r.w)) + 12
          const maxY = Math.max(...rects.map(r => r.y + r.h)) + 12
          return h('g', { key: `g${index}` },
            h('rect', {
              x: minX, y: minY, width: maxX - minX, height: maxY - minY,
              rx: 8, fill: BG2, stroke: BORDER, strokeWidth: 1, strokeDasharray: '4 3',
            }),
            h('text', {
              x: minX + 8, y: minY + 14, fontSize: 10, fill: MUTED,
            }, name))
        })
      const edgeElements = edges.map((edge, index) => {
        const from = positions.get(edge.from)
        const to = positions.get(edge.to)
        if (!from || !to) return null
        let x1
        let y1
        let x2
        let y2
        if (dir === 'TD') {
          x1 = from.x + from.w / 2
          y1 = from.y + from.h
          x2 = to.x + to.w / 2
          y2 = to.y
          // 目标在源上方（环回）：改从顶边连到底边，避免线穿过节点
          if (y2 < y1) {
            y1 = from.y
            y2 = to.y + to.h
          }
        } else {
          x1 = from.x + from.w
          y1 = from.y + from.h / 2
          x2 = to.x
          y2 = to.y + to.h / 2
          if (x2 < x1) {
            x1 = from.x
            x2 = to.x + to.w
          }
        }
        const children = [h('line', {
          key: 'l', x1, y1, x2, y2,
          stroke: EDGE_COLOR, strokeWidth: 1.2,
          markerEnd: 'url(#repowiki-mermaid-arrow)',
        })]
        if (edge.label) {
          children.push(h('text', {
            key: 't',
            x: (x1 + x2) / 2 + 4, y: (y1 + y2) / 2 - 4,
            fontSize: 10, fill: MUTED, textAnchor: 'middle',
          }, edge.label))
        }
        return h('g', { key: `e${index}` }, ...children)
      }).filter(Boolean)
      const nodeElements = ids.map((id) => {
        const pos = positions.get(id)
        const node = nodes.get(id)
        const cx = pos.x + pos.w / 2
        const cy = pos.y + pos.h / 2
        let shape
        if (node.shape === 'diamond') {
          shape = h('polygon', {
            points: `${cx},${pos.y} ${pos.x + pos.w},${cy} ${cx},${pos.y + pos.h} ${pos.x},${cy}`,
            fill: BG, stroke: BORDER, strokeWidth: 1.2,
          })
        } else if (node.shape === 'circle') {
          shape = h('ellipse', {
            cx, cy, rx: pos.w / 2, ry: pos.h / 2,
            fill: BG, stroke: BORDER, strokeWidth: 1.2,
          })
        } else {
          shape = h('rect', {
            x: pos.x, y: pos.y, width: pos.w, height: pos.h,
            rx: node.shape === 'round' ? pos.h / 2 : 6,
            fill: BG, stroke: BORDER, strokeWidth: 1.2,
          })
        }
        return h('g', { key: `n${id}` }, shape, h('text', {
          x: cx, y: cy + 4, fontSize: 12, fill: TEXT_COLOR, textAnchor: 'middle',
        }, node.label))
      })
      return h('svg', {
        key,
        viewBox: `0 0 ${Math.round(width)} ${Math.round(height)}`,
        width: '100%',
        role: 'img',
        'aria-label': 'Mermaid diagram',
        style: { display: 'block', maxWidth: '100%', height: 'auto', margin: '0 0 10px' },
      },
        h('defs', { key: 'defs' }, h('marker', {
          id: 'repowiki-mermaid-arrow',
          viewBox: '0 0 10 10', refX: 9, refY: 5,
          markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse',
        }, h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: EDGE_COLOR }))),
        ...groupElements,
        ...edgeElements,
        ...nodeElements,
      )
    }

    /**
     * 判断一行是否为 GFM 表格分隔行（`| --- | :--: |`）。
     * @param {string} line - 行文本。
     * @returns {boolean} 是则为 true。
     */
    function isTableDelimiter(line) {
      return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)
    }

    /**
     * 拆分表格行：支持 `\|` 转义与首尾竖线。
     * @param {string} row - 行文本。
     * @returns {string[]} 单元格文本。
     */
    function splitTableRow(row) {
      const trimmed = row.trim()
      const cells = []
      let current = ''
      for (let index = 0; index < trimmed.length; index++) {
        const char = trimmed[index]
        if (char === '\\' && trimmed[index + 1] === '|') { current += '|'; index++; continue }
        if (char === '|') { cells.push(current.trim()); current = ''; continue }
        current += char
      }
      cells.push(current.trim())
      if (trimmed.startsWith('|') && cells[0] === '') cells.shift()
      if (trimmed.endsWith('|') && cells[cells.length - 1] === '') cells.pop()
      return cells
    }

    /**
     * 表格单元格对齐方式。
     * @param {string} cell - 分隔行单元格。
     * @returns {'left'|'center'|'right'} 对齐方式。
     */
    function tableAlignment(cell) {
      const left = cell.startsWith(':')
      const right = cell.endsWith(':')
      if (left && right) return 'center'
      return right ? 'right' : 'left'
    }

    /**
     * 解析连续的（可缩进）列表行并构建嵌套树。
     * 支持 `-`/`*` 与 `N.`；缩进按两个空格为一层（制表符按两空格计）。
     * @param {string[]} lines - 全文行。
     * @param {number} start - 起始行索引。
     * @returns {{items:Array<{ordered:boolean, text:string, children:Array}>, next:number}}
     *   顶层条目树与下一行索引。
     */
    function parseListTree(lines, start) {
      const entries = []
      let next = start
      while (next < lines.length) {
        const match = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[next])
        if (!match) break
        entries.push({
          indent: match[1].replace(/\t/g, '  ').length,
          ordered: /^\d/.test(match[2]),
          text: match[3],
        })
        next++
      }
      const items = []
      const baseIndent = entries.length > 0 ? entries[0].indent : 0
      const stack = [{ indent: baseIndent - 1, children: items }]
      for (const entry of entries) {
        while (stack.length > 1 && entry.indent <= stack[stack.length - 1].indent) stack.pop()
        const node = { ordered: entry.ordered, text: entry.text, children: [] }
        stack[stack.length - 1].children.push(node)
        stack.push(node)
      }
      return { items, next }
    }

    /**
     * 渲染嵌套列表树；相邻同类型条目合并为一个 ul/ol。
     * @param {Array<{ordered:boolean, text:string, children:Array}>} items - 条目。
     * @param {number} depth - 嵌套深度（0 为顶层）。
     * @param {() => number} nextKey - React key 生成器。
     * @returns {Array} React 元素数组。
     */
    function renderListTree(items, depth, nextKey) {
      const groups = []
      for (const item of items) {
        const kind = item.ordered ? 'ol' : 'ul'
        const last = groups[groups.length - 1]
        if (last && last.kind === kind) last.items.push(item)
        else groups.push({ kind, items: [item] })
      }
      return groups.map(group => h(group.kind, {
        key: nextKey(),
        style: {
          margin: depth === 0 ? '0 0 10px' : '4px 0 0',
          paddingLeft: 20,
          fontSize: 13,
          lineHeight: 1.6,
        },
      }, ...group.items.map((item) => {
        const children = [...inlineText(item.text)]
        if (item.children.length > 0) children.push(...renderListTree(item.children, depth + 1, nextKey))
        return h('li', { key: nextKey() }, ...children)
      })))
    }

    /**
     * 极简 Markdown 渲染器（零依赖：practices 禁止引入第三方前端包，
     * 手写解析器复用宿主 React）。支持：frontmatter 跳过、#~/##~/### 标题、
     * 代码围栏、无序/有序列表（含两级以上缩进嵌套）、引用、分隔线、GFM
     * 表格（含对齐与 `\|` 转义）、加粗、行内代码、链接。
     * 不支持图片与 HTML 内嵌（资产文本不含这些形态）。
     * @param {string} md - Markdown 文本。
     * @returns {Array} React 元素数组。
     */
    function renderMarkdown(md) {
      const lines = md.split('\n')
      const blocks = []
      // 标题锚点计数：与目录链接（#锚点）一致，重名标题追加序号
      const headingAnchors = new Map()
      let i = 0
      let key = 0
      const headingStyle = (level) => ({
        margin: level === 1 ? '0 0 10px' : '14px 0 6px',
        fontSize: level === 1 ? 18 : level === 2 ? 15 : level === 3 ? 14 : 13,
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
        // 代码围栏：mermaid 尝试画成 SVG，其余（或无法识别）保持原文
        if (line.startsWith('```')) {
          const fenceLang = line.slice(3).trim().toLowerCase()
          const codeLines = []
          i++
          while (i < lines.length && !lines[i].startsWith('```')) {
            codeLines.push(lines[i]); i++
          }
          i++ // 闭合围栏
          if (fenceLang === 'mermaid') {
            const diagram = renderMermaidDiagram(codeLines.join('\n'), key)
            if (diagram) {
              key++
              blocks.push(diagram)
              continue
            }
          }
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
        // 标题（# ~ ######）：带锚点 id，供自动目录链接页内跳转
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
          const level = heading[1].length
          const id = anchorOf(heading[2], headingAnchors)
          // 页面 h1 由外层容器承担：Markdown 的 # 映射为 h2，最深到 h6
          blocks.push(h(`h${Math.min(level + 1, 6)}`, { key: key++, id, style: headingStyle(level) },
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
        // 无序/有序列表（可缩进嵌套）：按缩进构建树后递归渲染
        if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
          const parsed = parseListTree(lines, i)
          blocks.push(...renderListTree(parsed.items, 0, () => key++))
          i = parsed.next
          continue
        }
        // GFM 表格：表头行 + 分隔行（| --- | :--: |），单元格参与行内格式
        if (line.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
          const headers = splitTableRow(line)
          const aligns = splitTableRow(lines[i + 1]).map(tableAlignment)
          if (headers.length > 0 && headers.length === aligns.length) {
            i += 2
            const rows = []
            while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')
              && !/^(#{1,6}\s|```|>\s|\s*([-*]|\d+\.)\s)/.test(lines[i])) {
              rows.push(splitTableRow(lines[i]))
              i++
            }
            const cellStyle = align => ({
              border: '1px solid var(--dsw-alias-border-l2, #d1d5db)',
              padding: '4px 8px',
              textAlign: align,
            })
            blocks.push(h('div', {
              key: key++, style: { overflowX: 'auto', margin: '0 0 10px' },
            }, h('table', {
              style: { borderCollapse: 'collapse', fontSize: 12, lineHeight: 1.5 },
            },
            h('thead', null, h('tr', null, ...headers.map((text, column) => h('th', {
              key: column,
              scope: 'col',
              style: {
                ...cellStyle(aligns[column]),
                background: 'var(--dsw-alias-bg-layer-2, #f3f4f6)',
                fontWeight: 600,
              },
            }, ...inlineText(text))))),
            rows.length > 0 ? h('tbody', null, ...rows.map((cells, row) => h('tr', { key: row },
              ...headers.map((_, column) => h('td', {
                key: column, style: cellStyle(aligns[column]),
              }, ...inlineText(cells[column] ?? '')))))) : null)))
            continue
          }
        }
        // 空行
        if (line.trim() === '') { i++; continue }
        // 段落：连继行直到空行或块级起始
        const paraLines = []
        while (i < lines.length && lines[i].trim() !== ''
          && !/^(#{1,6}\s|```|-{3,}$|>\s|[-*]\s|\d+\.\s|\s*([-*]|\d+\.)\s)/.test(lines[i])) {
          paraLines.push(lines[i]); i++
        }
        blocks.push(h('p', { key: key++, style: paragraphStyle },
          ...inlineText(paraLines.join(' '))))
      }
      return blocks
    }

    /**
     * 安全链接白名单（防 Markdown 链接协议注入）。
     * 仅允许页内锚点、http(s) 与 mailto；javascript:/data:/vbscript:/file:
     * 与协议相对 URL 一律拒绝（渲染为普通文本）。
     * @param {string} raw - 原始 href。
     * @returns {string|null} 可安全渲染的 href；危险返回 null。
     */
    function safeHref(raw) {
      const href = String(raw).trim()
      // 控制字符检测是安全白名单的一部分（URL 走私/换行注入）
      // eslint-disable-next-line no-control-regex
      if (!href || /[\u0000-\u001f\u007f]/.test(href)) return null
      if (href.startsWith('#')) return href
      if (/^https?:\/\//i.test(href)) return href
      if (/^mailto:/i.test(href)) return href
      return null
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
        const href = link ? safeHref(link[2]) : null
        const candidates = [
          link && href ? {
            index: link.index, end: link.index + link[0].length,
            node: h('a', {
              key: key++, href,
              // 页内目录锚点不开新标签；外部链接保持 noopener
              ...(href.startsWith('#') ? {} : { target: '_blank', rel: 'noreferrer noopener' }),
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

    /**
     * 可点击标签筛选 chip 样式。
     * @param {boolean} active - 是否选中。
     * @returns {object} 样式。
     */
    function tagChipStyle(active) {
      return {
        fontSize: 12, padding: '2px 10px', borderRadius: 999, cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l2, #d1d5db)',
        background: active
          ? 'var(--dsw-alias-state-business-primary, #2563eb)'
          : 'var(--dsw-alias-bg-layer-1, #ffffff)',
        color: active
          ? 'var(--dsw-alias-label-on-color, #ffffff)'
          : 'var(--dsw-alias-label-secondary, #6b7280)',
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
