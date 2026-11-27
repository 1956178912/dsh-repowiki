/**
 * repowiki-extract 工具：为项目文件生成知识卡片。
 *
 * 数据流（方案 §6.3）：读索引 → 复杂度筛选 → 逐文件派发 spawn 子代理
 * （outputSchema 约束输出）→ 渲染统一 Markdown → 写
 * knowledge/{locale}/。完全由配方驱动：子代理只返回结构化 JSON，
 * 文件格式由插件渲染。
 */

import {
  MAX_SOURCE_CHARS, MAX_CARDS_PER_RUN_DEFAULT,
} from './schema.js'
import {
  resolveAssetRoot, readIndex,
} from './assets.js'
import {
  readPlan, selectCandidates, normalizeConcurrency, normalizeAttempts,
} from './config.js'
import { cardOutputSchema } from './card-schema.js'
import { extractPrompt } from './prompts.js'
import { renderCardMarkdown, isUsableCard } from './render.js'
import { withLock } from './lock.js'
import { buildModules, moduleOf, parentModule, sortModules } from './modules.js'
import {
  readExistingCards, readCardFor, writeCard, cardSlug, writeKnowledgeIndex,
} from './knowledge.js'
import { runSubagent, getLocale } from './spawn.js'
import { cwdOf, resolveLocales, delayWithSignal } from './util.js'

/** 失败重试的指数退避基数与上限（毫秒）。 */
const RETRY_BASE_MS = 200
const RETRY_MAX_MS = 1000

/** 工具描述。 */
const DESCRIPTION = [
  'Generate knowledge cards for repository files into .dsh-repowiki/knowledge/<locale>/,',
  'one Markdown card per file (purpose, key symbols, pitfalls, related modules). Each file is',
  'extracted by a fresh subagent that inherits this session model; requires an existing index',
  '(run repowiki-index first). Existing cards are skipped when their recorded source digest',
  'still matches the file; a changed file refreshes its card. Manually edited cards',
  '(frontmatter manuallyEdited=true) are never auto-refreshed without force=true.',
  'force=true re-extracts regardless. Cards whose source file no longer exists are',
  'reported as orphaned. Deterministic filtering (symbol-count threshold) skips trivial',
  'files; extraction itself is model work. Set locales (e.g. ["zh","en"]) to process',
  'several languages in one run; extraction runs once per locale, so model cost multiplies.',
  'Set concurrency (1-4, default from the plan) to dispatch several file extractions in',
  'parallel; card writes remain serialized per asset root. Failed attempts (thrown errors',
  'or unusable model output) retry with exponential backoff up to the attempts limit.',
].join(' ')

/**
 * 构造 repowiki-extract 工具定义。
 * @param {PluginContext} ctx - 插件上下文。
 * @returns {object} ToolDefinition。
 */
export function repowikiExtractTool(ctx) {
  return {
    name: 'repowiki-extract',
    description: DESCRIPTION,
    parameters: {
      root: {
        type: 'string',
        description: 'Optional project root. Defaults to the current directory; the asset root is found by walking up for .dsh-repowiki.',
      },
      paths: {
        type: 'array',
        description: 'Restrict extraction to these path prefixes, e.g. ["src/"]. Empty extracts the whole project.',
        items: { type: 'string' },
      },
      locale: {
        type: 'string',
        enum: ['zh', 'en'],
        description: 'Card language. Defaults to the session environment language.',
      },
      locales: {
        type: 'array',
        items: { type: 'string', enum: ['zh', 'en'] },
        description: 'Generate cards for several locales in one run (e.g. ["zh","en"]). Extraction runs once per locale, so model cost multiplies. Defaults to [locale].',
      },
      force: {
        type: 'boolean',
        description: 'Re-extract files that already have cards (by default they are skipped).',
      },
      maxCards: {
        type: 'integer',
        description: `Max cards to extract in this run; the rest are left for later runs. Defaults to the plan file or ${MAX_CARDS_PER_RUN_DEFAULT}.`,
      },
      concurrency: {
        type: 'integer',
        description: 'Parallel file extractions (1-4). Defaults to the plan value or 1. Higher values speed up large runs but amplify model rate-limit and cost risk; card writes stay serialized.',
      },
      attempts: {
        type: 'integer',
        description: 'Max attempts per file (1-3, including the first). Thrown errors and unusable model output retry with exponential backoff; explicit model skips do not retry. Defaults to the plan value or 2.',
      },
      threshold: {
        type: 'integer',
        description: 'Minimum symbol count for a file to deserve a card (trivial files are skipped). Defaults to the plan value (3).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string' },
          cardsDir: { type: 'string' },
          locale: { type: 'string' },
          locales: { type: 'array', items: { type: 'string' }, description: 'All locales processed in this run; the top-level counters mirror the first one.' },
          concurrency: { type: 'integer', description: 'Effective parallel extraction count for this run (1-4).' },
          attempts: { type: 'integer', description: 'Effective max attempts per file (1-3).' },
          retried: { type: 'integer', description: 'Number of retry attempts performed in this run.' },
          byLocale: {
            type: 'array',
            description: 'Per-locale extraction counters when multiple locales were requested.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                locale: { type: 'string' },
                cardsDir: { type: 'string' },
                extracted: { type: 'integer' },
                skippedExisting: { type: 'integer' },
                skippedManual: { type: 'integer' },
                skippedSimple: { type: 'integer' },
                orphaned: { type: 'integer' },
                retried: { type: 'integer', description: 'Retry attempts performed for this locale.' },
                failed: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { path: { type: 'string' }, reason: { type: 'string' } }, required: ['path', 'reason'] } },
                knowledgeIndex: { type: 'string' },
              },
              required: ['locale', 'extracted', 'skippedExisting', 'skippedManual', 'skippedSimple', 'orphaned', 'failed'],
            },
          },
          extracted: { type: 'integer' },
          skippedExisting: { type: 'integer' },
          skippedManual: { type: 'integer' },
          skippedSimple: { type: 'integer' },
          orphaned: { type: 'integer' },
          failed: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { path: { type: 'string' }, reason: { type: 'string' } }, required: ['path', 'reason'] } },
          capped: { type: 'boolean' },
          planSource: { type: 'string' },
          knowledgeIndex: { type: 'string', description: 'Relative path of the knowledge manifest (module → cards) written for this locale.' },
          durationMs: { type: 'integer' },
          hint: { type: 'string', description: 'Present when the tool degrades instead of performing the action; explains the precondition or failure.' },
        },
        required: ['root', 'cardsDir', 'locale', 'extracted', 'skippedExisting', 'skippedManual', 'skippedSimple', 'orphaned', 'failed', 'capped', 'durationMs'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `Extracted ${value.extracted} card(s) to ${value.cardsDir} (${value.locale}) in ${value.durationMs}ms${value.concurrency > 1 ? ` with concurrency ${value.concurrency}` : ''}${value.retried > 0 ? `, ${value.retried} retry attempt(s)` : ''}.`,
          `Skipped: ${value.skippedExisting} unchanged, ${value.skippedManual} manually edited, ${value.skippedSimple} trivial.`,
          value.orphaned > 0 ? `Orphaned cards (source file gone): ${value.orphaned}.` : '',
          value.failed.length > 0 ? `Failed: ${value.failed.map(f => `${f.path} (${f.reason})`).join('; ')}` : 'No failures.',
          value.capped ? 'Capped: more files remain for later runs.' : '',
          Array.isArray(value.byLocale) && value.byLocale.length > 1
            ? `Per locale: ${value.byLocale.map(r => `${r.locale} ${r.extracted} extracted / ${r.skippedExisting} unchanged / ${r.skippedManual} manual / ${r.skippedSimple} trivial${r.failed.length ? ` / ${r.failed.length} failed` : ''}`).join('; ')}`
            : '',
        ].filter(Boolean).join('\n'),
      }],
    },
    // 每张卡都是一次 LLM 调用；给足协作式预算
    timeoutMs: 600_000,
    async execute(args, exec) {
      const fs = ctx.fs
      if (!fs) throw new Error('repowiki-extract requires the ctx.fs capability')
      const startedAt = Date.now()
      const fallbackLocale = typeof args.locale === 'string' ? args.locale : getLocale(ctx)
      const locales = resolveLocales(args.locales, fallbackLocale)

      const startDir = typeof args.root === 'string' && args.root.trim() ? args.root : cwdOf(ctx)
      // 读操作不持锁：LLM 派发期间允许同根其它写工具推进；
      // 只有“写前二次判定 + 写卡”进入临界区（O5 修订，ADR-0005）
      const { root } = await resolveAssetRoot(fs, startDir)
      const index = await readIndex(fs, root)
      if (!index) {
        return {
          root, cardsDir: '', locale: locales[0], locales, byLocale: [],
          extracted: 0, skippedExisting: 0, skippedManual: 0, skippedSimple: 0,
          orphaned: 0, failed: [], capped: false, durationMs: 0,
          // 无索引：render 提示先建索引（覆写 render 文本）
          hint: 'No usable index found. Run repowiki-index first.',
        }
      }

      const { plan, source: planSource, error: planError } = await readPlan(fs, root)
      const { candidates, skippedSimple, capped } = selectCandidates(index.files, plan, {
        paths: Array.isArray(args.paths) ? args.paths : undefined,
        threshold: typeof args.threshold === 'number' ? args.threshold : undefined,
        maxCards: typeof args.maxCards === 'number' ? args.maxCards : undefined,
      })
      // 并发只作用于模型派发；写卡仍逐张进入资产根临界区
      const concurrency = normalizeConcurrency(
        typeof args.concurrency === 'number' ? args.concurrency : plan.concurrency,
      )
      const attempts = normalizeAttempts(
        typeof args.attempts === 'number' ? args.attempts : plan.attempts,
      )
      const fileByPath = new Map(index.files.map(file => [file.path, file]))
      // 项目上下文：技术栈 + 模块路径，约束卡片的 relatedModules 不臆造
      const projectContext = {
        projectName: typeof index.stack?.projectName === 'string' ? index.stack.projectName : '',
        technologies: (Array.isArray(index.stack?.technologies) ? index.stack.technologies : [])
          .map(tech => (typeof tech?.name === 'string' ? tech.name : ''))
          .filter(Boolean)
          .slice(0, 8),
        modules: (Array.isArray(index.modules) ? index.modules : [])
          .map(mod => (typeof mod?.path === 'string' ? mod.path : ''))
          .filter(path => path && path !== '.')
          .slice(0, 20),
      }

      /**
       * 单 locale 抽取：逐候选派发子代理、写前二次判定、写卡片与模块清单。
       * @param {string} locale - 目标语言。
       * @returns {Promise<object>} 与 output.schema.byLocale 项一致的结果。
       */
      const runForLocale = async (locale) => {
        const localeStartedAt = Date.now()
        const existing = args.force ? new Map() : await readExistingCards(fs, root, locale)
        const failed = []
        let extracted = 0
        let skippedExisting = 0
        let skippedManual = 0
        let dispatched = 0
        let retried = 0
        let aborted = false
        let cursor = 0

        /**
         * 有界并发 worker：从共享游标领取候选，LLM 在锁外执行，
         * 写卡片时进入资产根临界区。取消后不再领取新候选。
         * @returns {Promise<void>}
         */
        const worker = async () => {
          while (true) {
            // 协作式取消：停止派发新子代理，避免剩余候选继续产生 LLM 成本
            if (exec.signal?.aborted) { aborted = true; return }
            const position = cursor++
            if (position >= candidates.length) return
            const rel = candidates[position]
            const file = fileByPath.get(rel)
            const prior = existing.get(rel)
            if (prior && cardIsFresh(file, prior)) {
              skippedExisting++
              continue
            }
            // 人工修订保护：manuallyEdited=true 的卡片不被自动刷新覆盖（Phase 3
            // §人工修订；force=true 时 existing 为空 Map，保护不生效）
            if (prior && cardIsProtected(prior)) {
              skippedManual++
              continue
            }
            // 空 slug（纯非 ASCII 文件名）会互相覆盖卡片文件，直接记失败不写盘
            if (!cardSlug(rel)) {
              failed.push({ path: rel, reason: 'path cannot be slugified to a stable card file name' })
              continue
            }
            const seq = ++dispatched
            try {
              let source = ''
              try {
                const target = await fs.resolve(rel, { cwd: root })
                source = await fs.readText(target)
              } catch {
                failed.push({ path: rel, reason: 'source unreadable' })
                continue
              }
              const truncated = source.length > MAX_SOURCE_CHARS
              if (truncated) source = source.slice(0, MAX_SOURCE_CHARS)
              const prompt = extractPrompt(
                { path: rel, lang: file.lang, symbols: file.symbols, source, truncated },
                locale,
                projectContext,
              )
              // 单文件有界重试：抛错/坏输出按指数退避重试；明确 skip 不重试
              let card = null
              let lastReason = ''
              for (let attempt = 1; attempt <= attempts; attempt++) {
                if (exec.signal?.aborted) { aborted = true; break }
                try {
                  const result = await runSubagent(ctx, {
                    prompt,
                    outputSchema: cardOutputSchema(),
                    agent: exec.agent,
                    signal: exec.signal,
                    label: 'repowiki-extract',
                    name: `rw-extract-${locale}-${seq}-${attempt}`,
                  })
                  const structured = result?.structured
                  if (isUsableCard(structured)) {
                    card = structured
                    break
                  }
                  lastReason = result?.diagnostic || `subagent ended (${result?.stopReason ?? 'unknown'}) without a usable card`
                  if (structured?.skip === true) break
                } catch (err) {
                  lastReason = err?.message ?? 'unknown error'
                }
                if (attempt < attempts) {
                  retried++
                  await delayWithSignal(
                    Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempt - 1)),
                    exec.signal,
                  )
                }
              }
              if (!card) {
                // 取消不是文件失败：不计入 failed
                if (aborted || exec.signal?.aborted) { aborted = true; continue }
                failed.push({ path: rel, reason: lastReason || 'no usable card after retries' })
                continue
              }
              const md = renderCardMarkdown(card, {
                path: rel, lang: file.lang, locale, generatedAt: new Date().toISOString(),
                sourceDigest: file.digest,
                // 索引里的符号行号：给卡片关键符号补充可定位的 Lx-Ly
                symbols: file.symbols,
              })
              // 写前二次判定：LLM 期间可能已有并发写者或人工修订；force 时跳过保护
              const outcome = await withLock(root, async () => {
                const current = args.force ? null : await readCardFor(fs, root, rel, locale)
                if (current && cardIsFresh(file, current)) return 'fresh'
                if (current && cardIsProtected(current)) return 'protected'
                await writeCard(fs, root, rel, locale, md)
                return 'written'
              })
              if (outcome === 'written') extracted++
              else if (outcome === 'fresh') skippedExisting++
              else skippedManual++
            } catch (err) {
              failed.push({ path: rel, reason: err?.message ?? 'unknown error' })
            }
          }
        }
        const workerCount = Math.min(concurrency, candidates.length)
        await Promise.all(Array.from({ length: workerCount }, () => worker()))
        // 并发完成顺序不稳定：失败清单按路径排序，保证工具输出可复现
        failed.sort((a, b) => a.path.localeCompare(b.path))

        // 知识库清单（模块 → 卡片 + 最近一次运行统计）：读取与写入在同一临界区
        let knowledgeIndex = ''
        let currentCards = existing
        let orphaned = 0
        try {
          knowledgeIndex = await withLock(root, async () => {
            currentCards = await readExistingCards(fs, root, locale)
            // 孤儿卡片：源文件已不在索引中（删除/重命名后残留），只报告不删除
            orphaned = countOrphaned(currentCards, index.files)
            const byModule = new Map(buildModules(index.files).map(m => [m.path, { ...m, cards: [] }]))
            for (const relPath of currentCards.keys()) {
              const modulePath = moduleOf(relPath)
              if (!byModule.has(modulePath)) {
                byModule.set(modulePath, {
                  path: modulePath, parent: parentModule(modulePath), files: 0, symbols: 0, cards: [],
                })
              }
              const slug = cardSlug(relPath)
              if (slug) byModule.get(modulePath).cards.push(slug)
            }
            const modules = sortModules([...byModule.values()])
              .map(m => ({ ...m, cards: m.cards.sort() }))
            const generatedAt = new Date().toISOString()
            return writeKnowledgeIndex(fs, root, locale, {
              schemaVersion: 2,
              locale,
              generatedAt,
              modules,
              // 最近一次抽取快照：供 repowiki-status 诊断（不替代卡片事实）
              lastRun: {
                generatedAt,
                extracted,
                skippedExisting,
                skippedManual,
                skippedSimple: skippedSimple.length,
                orphaned,
                failed: failed.length,
                retried,
                capped,
                concurrency,
                attempts,
                durationMs: Date.now() - localeStartedAt,
              },
            })
          })
        } catch (err) {
          failed.push({ path: '_index.json', reason: err?.message ?? 'unknown error' })
        }
        if (aborted) {
          abortMessage = `Cancelled during ${locale}: ${candidates.length - dispatched} candidate(s) left unprocessed.`
        }
        return {
          locale,
          cardsDir: `${root}/.dsh-repowiki/knowledge/${locale}`,
          extracted,
          skippedExisting,
          skippedManual,
          skippedSimple: skippedSimple.length,
          orphaned,
          retried,
          failed,
          ...(knowledgeIndex ? { knowledgeIndex } : {}),
        }
      }

      let abortMessage = ''
      const byLocale = []
      for (const locale of locales) {
        if (exec.signal?.aborted) {
          abortMessage = abortMessage || 'Cancelled: no further locale was processed.'
          break
        }
        byLocale.push(await runForLocale(locale))
      }
      const primary = byLocale[0] ?? {
        locale: locales[0], cardsDir: '', extracted: 0, skippedExisting: 0,
        skippedManual: 0, skippedSimple: 0, orphaned: 0, failed: [],
      }
      return {
        root,
        cardsDir: primary.cardsDir,
        locale: primary.locale,
        locales,
        byLocale,
        extracted: primary.extracted,
        skippedExisting: primary.skippedExisting,
        skippedManual: primary.skippedManual,
        skippedSimple: primary.skippedSimple,
        orphaned: primary.orphaned,
        failed: primary.failed,
        capped,
        concurrency,
        attempts,
        retried: byLocale.reduce((total, entry) => total + (entry.retried ?? 0), 0),
        planSource: planError ? 'broken' : planSource,
        ...(primary.knowledgeIndex ? { knowledgeIndex: primary.knowledgeIndex } : {}),
        durationMs: Date.now() - startedAt,
        ...(abortMessage ? { hint: abortMessage } : {}),
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Extract knowledge cards',
      kind: 'execute',
      rawInput: { root: args.root ?? '(current)', locale: args.locale ?? 'auto', paths: args.paths ?? [], concurrency: args.concurrency ?? 'plan', attempts: args.attempts ?? 'plan' },
    }),
  }
}

/**
 * 判断已有卡片是否仍然新鲜（源文件未变化）。
 * 判定依据：index.json 中文件条目的 digest 与卡片 frontmatter 记录的
 * sourceDigest 一致。老卡（无 sourceDigest）或源已变化都视为需重提取。
 * @param {{digest?:string}|undefined} fileMeta - index.json 的文件条目。
 * @param {{meta?:{sourceDigest?:string}}|undefined} prior - 已有卡片（readExistingCards 的值形态）。
 * @returns {boolean} 卡片可跳过重提取时为 true。
 */
export function cardIsFresh(fileMeta, prior) {
  return Boolean(fileMeta?.digest && prior?.meta?.sourceDigest === fileMeta.digest)
}

/**
 * 判断卡片是否受人工修订保护（frontmatter manuallyEdited=true）。
 * 受保护的卡片即使源文件已变化也不会被 extract 自动刷新覆盖——人工修订
 * 的内容优先于自动再生（Phase 3 §人工修订）。force=true 走全新提取路径，
 * 保护不生效。
 * @param {{meta?:{manuallyEdited?:boolean}}|undefined} prior - 已有卡片。
 * @returns {boolean} 受保护时为 true。
 */
export function cardIsProtected(prior) {
  return prior?.meta?.manuallyEdited === true
}

/**
 * 统计孤儿卡片：卡片存在但其源文件已不在索引文件列表中（源文件被删除
 * 或重命名后残留）。只统计不删除——删除是破坏性操作，由人工或后续专门
 * 的清理流程处理。
 * @param {Map<string, {meta:object, path:string}>} existing - 已有卡片映射。
 * @param {{path:string}[]} files - index.json 的文件条目。
 * @returns {number} 孤儿卡片数。
 */
export function countOrphaned(existing, files) {
  const paths = new Set(files.map(f => f.path))
  let orphaned = 0
  for (const sourcePath of existing.keys()) {
    if (!paths.has(sourcePath)) orphaned++
  }
  return orphaned
}
