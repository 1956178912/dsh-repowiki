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
import { readPlan, selectCandidates } from './config.js'
import { cardOutputSchema } from './card-schema.js'
import { extractPrompt } from './prompts.js'
import { renderCardMarkdown, isUsableCard } from './render.js'
import { readExistingCards, writeCard, cardSlug } from './knowledge.js'
import { runSubagent, getLocale } from './spawn.js'
import { cwdOf } from './util.js'

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
  'files; extraction itself is model work.',
].join(' ')

/**
 * 构造 repowiki-extract 工具定义。
 * @param {object} ctx - 插件上下文。
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
      force: {
        type: 'boolean',
        description: 'Re-extract files that already have cards (by default they are skipped).',
      },
      maxCards: {
        type: 'integer',
        description: `Max cards to extract in this run; the rest are left for later runs. Defaults to the plan file or ${MAX_CARDS_PER_RUN_DEFAULT}.`,
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
          extracted: { type: 'integer' },
          skippedExisting: { type: 'integer' },
          skippedManual: { type: 'integer' },
          skippedSimple: { type: 'integer' },
          orphaned: { type: 'integer' },
          failed: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { path: { type: 'string' }, reason: { type: 'string' } }, required: ['path', 'reason'] } },
          capped: { type: 'boolean' },
          planSource: { type: 'string' },
          durationMs: { type: 'integer' },
        },
        required: ['root', 'cardsDir', 'locale', 'extracted', 'skippedExisting', 'skippedManual', 'skippedSimple', 'orphaned', 'failed', 'capped', 'durationMs'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `Extracted ${value.extracted} card(s) to ${value.cardsDir} (${value.locale}) in ${value.durationMs}ms.`,
          `Skipped: ${value.skippedExisting} unchanged, ${value.skippedManual} manually edited, ${value.skippedSimple} trivial.`,
          value.orphaned > 0 ? `Orphaned cards (source file gone): ${value.orphaned}.` : '',
          value.failed.length > 0 ? `Failed: ${value.failed.map(f => `${f.path} (${f.reason})`).join('; ')}` : 'No failures.',
          value.capped ? 'Capped: more files remain for later runs.' : '',
        ].filter(Boolean).join('\n'),
      }],
    },
    // 每张卡都是一次 LLM 调用；给足协作式预算
    timeoutMs: 600_000,
    async execute(args, exec) {
      const fs = ctx.fs
      if (!fs) throw new Error('repowiki-extract requires the ctx.fs capability')
      const startedAt = Date.now()
      const locale = typeof args.locale === 'string' ? args.locale : getLocale(ctx)

      const startDir = typeof args.root === 'string' && args.root.trim() ? args.root : cwdOf(ctx)
      const { root } = await resolveAssetRoot(fs, startDir)
      const index = await readIndex(fs, root)
      if (!index) {
        return {
          root, cardsDir: '', locale, extracted: 0, skippedExisting: 0, skippedManual: 0, skippedSimple: 0,
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

      const existing = args.force ? new Map() : await readExistingCards(fs, root, locale)
      const failed = []
      let extracted = 0
      let skippedExisting = 0
      let skippedManual = 0
      let i = 0
      for (const rel of candidates) {
        const file = index.files.find(f => f.path === rel)
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
        i++
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
          const prompt = extractPrompt({ path: rel, lang: file.lang, symbols: file.symbols, source, truncated }, locale)
          const result = await runSubagent(ctx, {
            prompt,
            outputSchema: cardOutputSchema(),
            agent: exec.agent,
            signal: exec.signal,
            label: 'repowiki-extract',
            name: `rw-extract-${i}`,
          })
          const card = result?.structured
          if (!isUsableCard(card)) {
            failed.push({ path: rel, reason: result?.diagnostic || `subagent ended (${result?.stopReason ?? 'unknown'}) without a usable card` })
            continue
          }
          const md = renderCardMarkdown(card, {
            path: rel, lang: file.lang, locale, generatedAt: new Date().toISOString(),
            sourceDigest: file.digest,
          })
          await writeCard(fs, root, rel, locale, md)
          extracted++
        } catch (err) {
          failed.push({ path: rel, reason: err?.message ?? 'unknown error' })
        }
      }

      // 孤儿卡片：源文件已不在索引中（删除/重命名后残留），只报告不删除
      const orphaned = countOrphaned(existing, index.files)
      return {
        root,
        cardsDir: `${root}/.dsh-repowiki/knowledge/${locale}`,
        locale,
        extracted,
        skippedExisting,
        skippedManual,
        skippedSimple: skippedSimple.length,
        orphaned,
        failed,
        capped,
        planSource: planError ? 'broken' : planSource,
        durationMs: Date.now() - startedAt,
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Extract knowledge cards',
      kind: 'execute',
      rawInput: { root: args.root ?? '(current)', locale: args.locale ?? 'auto', paths: args.paths ?? [] },
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
