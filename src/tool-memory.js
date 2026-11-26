/**
 * repowiki-memory 工具：会话知识的沉淀与审核（Phase 4）。
 *
 * 形态为"模型显式写候选 + 审核闭环"：
 * - write：把本会话学到的、值得跨会话保留的知识写成记忆条目（默认
 *   status=pending 待审，可显式 status=accepted 直接采信），落入
 *   .dsh-repowiki/memory/<locale>/，随 Git 共享；
 * - list：按状态列出条目（默认 pending）；
 * - accept / reject：审核条目状态。
 *
 * 与方案"投影读日志自动产生候选"的差异见 docs/checkpoints/phase-4a.md：
 * 显式写入避免文本判定的噪声，质量由调用方（模型）保证。
 */

import { MEMORY_STATUS } from './schema.js'
import { resolveAssetRoot } from './assets.js'
import {
  slugifyMemory, writeMemory, listMemory, setMemoryStatus,
} from './memory.js'
import { getLocale } from './spawn.js'
import { cwdOf } from './util.js'

/** 工具描述。 */
const DESCRIPTION = [
  'Persist knowledge learned in this session into .dsh-repowiki/memory/<locale>/ and',
  'review it. write: save an entry (title, body, optional tags and related file path;',
  'status defaults to pending, pass accepted to trust it immediately). list: entries by',
  'status (default pending). accept/reject: move an entry to its terminal state. Entries',
  'are plain Markdown with a JSON frontmatter and travel with Git; they are visible to',
  'later sessions and to the Repo Wiki panel.',
].join(' ')

/**
 * 构造 repowiki-memory 工具定义。
 * @param {object} ctx - 插件上下文（提供 ctx.fs）。
 * @returns {object} ToolDefinition。
 */
export function repowikiMemoryTool(ctx) {
  return {
    name: 'repowiki-memory',
    description: DESCRIPTION,
    parameters: {
      action: {
        type: 'string',
        enum: ['write', 'list', 'accept', 'reject'],
        description: 'What to do. write/list/accept/reject. Defaults to list.',
      },
      title: {
        type: 'string',
        description: 'Entry title (write only, required for write).',
      },
      body: {
        type: 'string',
        description: 'Entry body — the knowledge worth keeping across sessions (write only, required).',
      },
      tags: {
        type: 'array',
        description: 'Optional labels for the entry (write only).',
        items: { type: 'string' },
      },
      path: {
        type: 'string',
        description: 'Optional related source file path (write only, relative to the project root).',
      },
      status: {
        type: 'string',
        enum: ['pending', 'accepted'],
        description: 'Entry status on write (write only). Default pending; accepted trusts it immediately.',
      },
      slug: {
        type: 'string',
        description: 'Entry file slug (accept/reject only, required). Obtain it from list.',
      },
      locale: {
        type: 'string',
        enum: ['zh', 'en'],
        description: 'Entry language. Defaults to the session environment language.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', enum: ['write', 'list', 'accept', 'reject'] },
          locale: { type: 'string' },
          slug: { type: 'string' },
          status: { type: 'string' },
          path: { type: 'string' },
          entries: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                slug: { type: 'string' },
                title: { type: 'string' },
                status: { type: 'string', enum: MEMORY_STATUS },
                tags: { type: 'array', items: { type: 'string' } },
                createdAt: { type: 'string' },
                path: { type: 'string' },
              },
              required: ['slug', 'title', 'status', 'tags', 'createdAt'],
            },
          },
          total: { type: 'integer' },
          durationMs: { type: 'integer' },
        },
        required: ['action', 'durationMs'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          value.action === 'write'
            ? `Memory written: ${value.slug} (${value.status})${value.path ? ` at ${value.path}` : ''}.`
            : null,
          value.action === 'list'
            ? [`Memory entries (${value.status || 'all'}): ${value.total}`,
              ...value.entries.map((e) => `- ${e.slug} [${e.status}] ${e.title}${e.path ? ` (${e.path})` : ''}`),
            ].join('\n')
            : null,
          (value.action === 'accept' || value.action === 'reject')
            ? `Memory ${value.slug} → ${value.status}${value.path ? ` (${value.path})` : ''}.`
            : null,
          value.hint,
        ].filter(Boolean).join('\n'),
      }],
    },
    timeoutMs: 30_000,
    async execute(args, _exec) {
      const fs = ctx.fs
      if (!fs) throw new Error('repowiki-memory requires the ctx.fs capability')
      const startedAt = Date.now()
      const action = typeof args.action === 'string' ? args.action : 'list'
      const locale = typeof args.locale === 'string' && ['zh', 'en'].includes(args.locale)
        ? args.locale
        : getLocale(ctx)
      const { root } = await resolveAssetRoot(fs, cwdOf(ctx))

      if (action === 'write') {
        const title = typeof args.title === 'string' ? args.title.trim() : ''
        const body = typeof args.body === 'string' ? args.body.trim() : ''
        if (!title || !body) {
          return {
            action, locale, slug: '', total: 0, status: 'invalid', durationMs: Date.now() - startedAt,
            hint: 'title and body are required for write.',
          }
        }
        // 纯非 ASCII 标题归一为空时用时间戳兜底，保证文件名稳定
        const slug = slugifyMemory(title) || `memory-${Date.now()}`
        const status = args.status === 'accepted' ? 'accepted' : 'pending'
        const rel = await writeMemory(fs, root, {
          slug, locale, title, body,
          tags: Array.isArray(args.tags) ? args.tags : undefined,
          path: typeof args.path === 'string' ? args.path : undefined,
          status,
        })
        return {
          action, locale, slug, status, total: 0, path: rel,
          durationMs: Date.now() - startedAt,
        }
      }

      if (action === 'list') {
        const status = MEMORY_STATUS.includes(args.status) ? args.status : 'pending'
        const entries = await listMemory(fs, root, locale, status)
        return {
          action, locale, entries, total: entries.length,
          status: status || 'all',
          slug: '',
          durationMs: Date.now() - startedAt,
        }
      }

      // accept / reject
      const slug = typeof args.slug === 'string' ? args.slug.trim() : ''
      if (!slug) {
        return {
          action, locale, slug: '', total: 0, status: 'invalid',
          durationMs: Date.now() - startedAt,
          hint: 'slug is required for accept/reject. Use list to obtain it.',
        }
      }
      const status = action === 'accept' ? 'accepted' : 'rejected'
      const rel = await setMemoryStatus(fs, root, locale, slug, status)
      if (!rel) {
        return {
          action, locale, slug, total: 0, status,
          durationMs: Date.now() - startedAt,
          hint: `Entry ${slug} not found (or its frontmatter is unreadable).`,
        }
      }
      return {
        action, locale, slug, status, path: rel, total: 0,
        durationMs: Date.now() - startedAt,
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Session memory',
      kind: 'execute',
      rawInput: { action: args.action ?? 'list', slug: args.slug ?? '', status: args.status ?? 'pending' },
    }),
  }
}
