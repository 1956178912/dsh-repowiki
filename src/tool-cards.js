/**
 * repowiki-cards 工具：跨会话检索仓库的符号索引与知识卡片（只读）。
 *
 * 这是 Phase 1 的"价值兑现"工具：任意会话打开同目录即可查询符号/文件/
 * 依赖，无需重读源码。无索引时给出明确的降级提示（先调 repowiki-index），
 * 不静默返回空。
 */

import {
  resolveAssetRoot, readIndex, searchIndex,
} from './assets.js'
import { DEFAULT_RESULT_LIMIT } from './schema.js'

/** 工具描述。 */
const DESCRIPTION = [
  'Query the repository knowledge index built by repowiki-index: find symbols (functions, classes,',
  'methods, types) and the files that define them, plus project tech stack. Read-only. If no index',
  'exists yet, run repowiki-index first. Knowledge cards (extracted per-file summaries) appear in',
  'the results once generated.',
].join(' ')

/**
 * 构造 repowiki-cards 工具定义。
 * @param {object} ctx - 插件上下文。
 * @returns {object} ToolDefinition。
 */
export function repowikiCardsTool(ctx) {
  return {
    name: 'repowiki-cards',
    description: DESCRIPTION,
    parameters: {
      query: {
        type: 'string',
        description: 'Substring of a symbol name to find (case-insensitive), e.g. "parse" or "IndexService". Empty matches all symbols.',
      },
      kind: {
        type: 'string',
        enum: ['function', 'class', 'method', 'variable', 'interface', 'type'],
        description: 'Restrict matches to one symbol kind.',
      },
      path: {
        type: 'string',
        description: 'Substring of a file path to restrict the search scope, e.g. "src/" or "tools".',
      },
      limit: {
        type: 'integer',
        description: `Max number of matching files returned; extra matches are reported as truncated. Defaults to ${DEFAULT_RESULT_LIMIT}.`,
      },
    },
    output: {
      // JsonSchemaNode 子集：required 为顶层数组（见 ADR-0002 的运行时校验约束）。
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          indexed: { type: 'boolean' },
          root: { type: 'string' },
          indexPath: { type: 'string' },
          matches: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                lang: { type: 'string' },
                symbols: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string' },
                      kind: { type: 'string' },
                      line: { type: 'integer' },
                      endLine: { type: 'integer' },
                      exported: { type: 'boolean' },
                    },
                    required: ['name', 'kind', 'line', 'endLine', 'exported'],
                  },
                },
              },
              required: ['path', 'lang', 'symbols'],
            },
          },
          total: { type: 'integer' },
          truncated: { type: 'boolean' },
          technologies: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string' },
                ecosystem: { type: 'string' },
              },
              required: ['name', 'ecosystem'],
            },
          },
          hint: { type: 'string' },
        },
        required: ['indexed', 'matches', 'total', 'truncated'],
      },
      render: (_args, value) => {
        if (!value.indexed) {
          return [{ type: 'text', text: value.hint }]
        }
        const lines = value.matches.map(f =>
          `${f.path} — ${f.symbols.length} symbol(s): ${f.symbols.slice(0, 8).map(s => `${s.name} (${s.kind}:${s.line})`).join(', ')}${f.symbols.length > 8 ? ', …' : ''}`)
        const tail = value.truncated ? `\n… ${value.total} matching file(s) total, showing the first ${value.matches.length}` : ''
        return [{ type: 'text', text: lines.join('\n') + tail }]
      },
    },
    async execute(args, exec) {
      const fs = ctx.fs
      if (!fs) {
        throw new Error('repowiki-cards requires the ctx.fs capability to be available in this profile')
      }
      const startDir = cwdOf(ctx)
      const { root } = await resolveAssetRoot(fs, startDir)
      const index = await readIndex(fs, root)
      if (!index) {
        return {
          indexed: false,
          matches: [],
          total: 0,
          truncated: false,
          hint: 'No usable index found for this project. Run the repowiki-index tool first to build .dsh-repowiki/index.json.',
        }
      }
      const { matches, total, truncated } = searchIndex(index, {
        query: typeof args.query === 'string' ? args.query : undefined,
        kind: typeof args.kind === 'string' ? args.kind : undefined,
        pathPrefix: typeof args.path === 'string' ? args.path : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      })
      return {
        indexed: true,
        root,
        indexPath: `${root}/.dsh-repowiki/index.json`,
        matches,
        total,
        truncated,
        technologies: (index.stack?.technologies ?? []).map(t => ({ name: t.name, ecosystem: t.ecosystem })),
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Search repository knowledge',
      kind: 'search',
      rawInput: { query: args.query ?? '', kind: args.kind ?? '', path: args.path ?? '' },
    }),
    presentResult: (_args, result) => {
      // 官方渲染词汇：发现型搜索用 card:'search'，按文件分组显示匹配
      const value = result.value
      if (!value?.indexed) return undefined // 回退到 render 的 hint 文本
      return {
        card: 'search',
        shape: 'matches',
        title: value.total > 0 ? `${value.total} file(s) match` : 'No matches',
        total: value.total,
        truncated: value.truncated,
      }
    },
  }
}

/** 取当前工作目录（ctx.workingDirectory 为可选服务，缺失时退回 process.cwd）。 */
function cwdOf(ctx) {
  const wd = ctx.workingDirectory
  if (wd && typeof wd.get === 'function') {
    try { return wd.get() } catch { /* 降级到 process.cwd */ }
  }
  return process.cwd()
}
