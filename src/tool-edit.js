/**
 * repowiki-edit 工具：人工修订知识卡片（Phase 3 §repowiki-edit）。
 *
 * 形态为文件操作 + frontmatter 标记（方案原列 state.json 标记；实现上
 * 直接把 manuallyEdited=true 写进卡片 frontmatter，随 Git 共享且无需
 * 维护额外状态文件——见 docs/checkpoints/phase-3b.md）：
 * - create：新建人工卡片（path 可为索引外路径，即"孤儿人工卡"；导入
 *   导出按整目录拷贝，人工卡天然随资产保留，extract 不会覆盖）。
 * - update：改写现有卡片（title/tags 可覆盖，body 提供则替换），并把
 *   manuallyEdited 置 true——之后 repowiki-extract 不会自动刷新它，
 *   除非调用方显式 force=true。
 */

import { CARD_SCHEMA_VERSION, EXTENSION_LANGS } from './schema.js'
import {
  cardSlug, writeCard, parseCard, readExistingCards,
} from './knowledge.js'
import { withAssetRootLock } from './lock.js'
import { getLocale } from './spawn.js'
import { cwdOf, encodeFrontmatter } from './util.js'

/** 工具描述。 */
const DESCRIPTION = [
  'Hand-edit knowledge cards in .dsh-repowiki/knowledge/<locale>/. create: add a manual card',
  '(path may sit outside the index — an orphan manual card — with your own title, body and',
  'tags). update: rewrite an existing card (title and tags override when given; body replaces',
  'the old text when given, otherwise the text is kept). Both set manuallyEdited=true, so',
  'repowiki-extract never auto-refreshes the card afterwards unless force=true. Pure file',
  'operations with no model calls.',
].join(' ')

/**
 * 构造 repowiki-edit 工具定义。
 * @param {PluginContext} ctx - 插件上下文（提供 ctx.fs）。
 * @returns {object} ToolDefinition。
 */
export function repowikiEditTool(ctx) {
  return {
    name: 'repowiki-edit',
    description: DESCRIPTION,
    parameters: {
      action: {
        type: 'string',
        enum: ['create', 'update'],
        description: 'create: new manual card. update: rewrite an existing card.',
      },
      path: {
        type: 'string',
        description: 'Source-file path the card belongs to, relative to the project root. For update it locates the existing card; for create it may sit outside the index (orphan manual card).',
      },
      title: {
        type: 'string',
        description: 'Card title (required for create; optional override for update).',
      },
      body: {
        type: 'string',
        description: 'Card Markdown body, replacing the whole text (the sections structure of auto-generated cards is conventional: a # title heading, then ## sections). For update, omit to keep the existing text.',
      },
      tags: {
        type: 'array',
        description: 'Optional tag list (replaces the existing tags when given).',
        items: { type: 'string' },
      },
      locale: {
        type: 'string',
        enum: ['zh', 'en'],
        description: 'Card language. Defaults to the session environment language.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', enum: ['create', 'update'] },
          locale: { type: 'string' },
          path: { type: 'string' },
          slug: { type: 'string' },
          card: { type: 'string' },
          durationMs: { type: 'integer' },
          hint: { type: 'string', description: 'Present when the tool degrades instead of performing the action; explains the precondition or failure.' },
        },
        required: ['action', 'locale', 'path', 'slug', 'durationMs'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.action === 'create' ? 'Created' : 'Updated'} manual card ${value.slug}${value.card ? ` at ${value.card}` : ''} (${value.locale}) in ${value.durationMs}ms. It is marked manuallyEdited; repowiki-extract will not auto-refresh it without force.`,
      }],
    },
    timeoutMs: 30_000,
    async execute(args, _exec) {
      const fs = ctx.fs
      if (!fs) throw new Error('repowiki-edit requires the ctx.fs capability')
      const startedAt = Date.now()
      const action = args.action === 'update' ? 'update' : 'create'
      const locale = typeof args.locale === 'string' && ['zh', 'en'].includes(args.locale)
        ? args.locale
        : getLocale(ctx)
      const rel = typeof args.path === 'string' ? args.path.trim() : ''
      if (!rel) {
        return {
          action, locale, path: '', slug: '', durationMs: Date.now() - startedAt,
          hint: 'path is required: the source-file path the card belongs to.',
        }
      }
      const slug = cardSlug(rel)
      if (!slug) {
        return {
          action, locale, path: rel, slug: '', durationMs: Date.now() - startedAt,
          hint: 'path cannot be slugified to a stable card file name (pure non-ASCII path).',
        }
      }
      // 写操作串行化（O5，ADR-0005）：create 的 slug 判重与 update 的
      // 读-改-写整体进入临界区，避免与并发写交错
      return withAssetRootLock(fs, cwdOf(ctx), async ({ root }) => {
        if (action === 'create') {
          const title = typeof args.title === 'string' ? args.title.trim() : ''
          const body = typeof args.body === 'string' ? args.body : ''
          if (!title || !body) {
            return {
              action, locale, path: rel, slug, durationMs: Date.now() - startedAt,
              hint: 'title and body are required for create.',
            }
          }
          const ext = rel.slice(rel.lastIndexOf('.') + 1)
          const meta = {
            schemaVersion: CARD_SCHEMA_VERSION,
            path: rel,
            lang: EXTENSION_LANGS[ext] ?? '',
            locale,
            sourceDigest: '',
            title,
            tags: Array.isArray(args.tags) ? args.tags : [],
            manuallyEdited: true,
            generatedAt: new Date().toISOString(),
          }
          const markdown = `${encodeFrontmatter(meta)}\n${body}`
          const cardRel = await writeCard(fs, root, rel, locale, markdown)
          return {
            action, locale, path: rel, slug, card: cardRel,
            durationMs: Date.now() - startedAt,
          }
        }

        // update：必须命中现有卡片
        const existing = await readExistingCards(fs, root, locale)
        const prior = existing.get(rel)
        if (!prior) {
          return {
            action, locale, path: rel, slug, durationMs: Date.now() - startedAt,
            hint: `No existing card for ${rel} in this locale. Use action=create to add a manual card.`,
          }
        }
        let text
        try {
          const target = await fs.resolve(prior.path, { cwd: root })
          text = await fs.readText(target)
        } catch {
          return {
            action, locale, path: rel, slug, durationMs: Date.now() - startedAt,
            hint: `Existing card for ${rel} is unreadable.`,
          }
        }
        const parsed = parseCard(text)
        if (!parsed) {
          return {
            action, locale, path: rel, slug, durationMs: Date.now() - startedAt,
            hint: `Existing card for ${rel} has an unusable frontmatter.`,
          }
        }
        const oldMeta = parsed.meta
        const body = typeof args.body === 'string' && args.body.trim() ? args.body : parsed.body
        const meta = {
          ...oldMeta,
          title: typeof args.title === 'string' && args.title.trim() ? args.title.trim() : oldMeta.title,
          tags: Array.isArray(args.tags) ? args.tags : oldMeta.tags,
          manuallyEdited: true,
        }
        // encodeFrontmatter 已含尾换行；update 时 body 为完整正文（含标题行）
        const markdown = `${encodeFrontmatter(meta)}${body.startsWith('\n') ? body : `\n${body}`}`
        const cardRel = await writeCard(fs, root, rel, locale, markdown)
        return {
          action, locale, path: rel, slug, card: cardRel,
          durationMs: Date.now() - startedAt,
        }
      })
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Edit knowledge card',
      kind: 'execute',
      rawInput: { action: args.action ?? 'create', path: args.path ?? '(unset)' },
    }),
  }
}
