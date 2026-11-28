/**
 * repowiki-index 工具：重建当前仓库的符号级索引（确定性、零 LLM）。
 *
 * 工具形态严格按官方 ToolDefinition 手写（不依赖 @deepseek-ai/dsh-tools
 * 的 defineTool，见 ADR-0002）；参数与输出共用 ValueSchemaSpec DSL，
 * render 返回 ContentBlock 数组。
 */

import {
  MAX_FILES_DEFAULT,
} from './schema.js'
import {
  writeIndex, readIndex,
} from './assets.js'
import { buildIndex } from './indexer.js'
import { cwdOf } from './util.js'
import { withAssetRootLock } from './lock.js'

/**
 * 工具结果（与 output.schema 一一对应）。
 * @typedef {Object} IndexResult
 * @property {string} root - 索引的项目根绝对路径。
 * @property {string} indexPath - 写入的 index.json 路径。
 * @property {number} files - 索引的源码文件数。
 * @property {number} symbols - 提取的符号总数。
 * @property {number} edges - 依赖边总数。
 * @property {number} durationMs - 耗时（毫秒）。
 * @property {boolean} capped - 是否触及文件数上限。
 */

/** 工具描述（tool-design 规范：先讲目的与动作，约束放参数级）。 */
const DESCRIPTION = [
  'Rebuild the symbol-level index of the current repository into .dsh-repowiki/index.json,',
  'so later sessions (and repowiki-cards) can query symbols, files and dependencies without',
  're-reading source code. Deterministic: no model calls. Incremental by default: files whose',
  'content digest is unchanged reuse the previous index entry (set incremental=false for a',
  'full rebuild). Existing index.json is overwritten.',
].join(' ')

/**
 * 构造 repowiki-index 工具定义。
 * @param {object} ctx - 插件上下文（提供 ctx.fs 经 inject 注入）。
 * @returns {object} ToolDefinition，由 apply 注册到 ctx.tools。
 */
export function repowikiIndexTool(ctx) {
  return {
    name: 'repowiki-index',
    description: DESCRIPTION,
    parameters: {
      root: {
        type: 'string',
        description: 'Optional project root to index. Defaults to the current directory; the asset root is found by walking up for .dsh-repowiki.',
      },
      exclude: {
        type: 'array',
        description: 'Extra directory names to exclude in addition to the built-in list (node_modules, .git, dist, build, target, venv, etc.).',
        items: { type: 'string' },
      },
      maxFiles: {
        type: 'integer',
        description: `Hard cap on walked files; exceeding it caps the index and reports capped=true. Defaults to ${MAX_FILES_DEFAULT}.`,
      },
      incremental: {
        type: 'boolean',
        description: 'Reuse the entry of files whose content digest is unchanged since the previous index (default true). Pass false to re-extract every file.',
      },
    },
    output: {
      // 手写定义的 output.schema 直接经注册表 assertSupportedJsonSchema 校验，
      // 必须符合 JsonSchemaNode 子集：required 为顶层数组（区别于 parameters 的 per-property DSL）。
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string' },
          indexPath: { type: 'string' },
          files: { type: 'integer' },
          symbols: { type: 'integer' },
          edges: { type: 'integer' },
          reused: { type: 'integer' },
          added: { type: 'integer', description: 'Files not present in the previous index.' },
          changed: { type: 'integer', description: 'Files whose content digest differs from the previous index.' },
          removed: { type: 'integer', description: 'Previous files missing from this run (0 when capped or cancelled).' },
          ignored: { type: 'integer', description: 'Entries skipped because of .gitignore/.repowikiignore rules.' },
          skipped: { type: 'integer', description: 'Source files skipped because they were unreadable or above the per-file size limit.' },
          skippedTooLarge: { type: 'integer', description: 'Subset of skipped: files above the per-file size limit.' },
          languages: { type: 'object', additionalProperties: true, description: 'Indexed file count per language; values are integers.' },
          git: {
            type: 'object',
            additionalProperties: false,
            description: 'Git provenance read from .git/HEAD (no git command is executed).',
            properties: {
              branch: { type: 'string', description: 'Branch name; empty for a detached HEAD.' },
              commit: { type: 'string' },
              shortCommit: { type: 'string' },
            },
            required: ['branch', 'commit', 'shortCommit'],
          },
          warnings: { type: 'array', items: { type: 'string' } },
          durationMs: { type: 'integer' },
          capped: { type: 'boolean' },
          aborted: { type: 'boolean', description: 'True when the caller cancelled the run; the previous index.json is left untouched.' },
          hint: { type: 'string', description: 'Present when the tool degrades instead of writing (e.g. cancelled).' },
        },
        required: ['root', 'indexPath', 'files', 'symbols', 'edges', 'reused', 'durationMs', 'capped'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.aborted
          ? `Cancelled after ${value.files} files; the existing index was left untouched.${value.hint ? ` ${value.hint}` : ''}`
          : `Indexed ${value.files} files (${value.reused} reused, ${value.added} added, ${value.changed} changed, ${value.removed} removed), ${value.symbols} symbols, ${value.edges} dependency edges in ${value.durationMs}ms → ${value.indexPath}${value.capped ? ' (capped: file limit reached)' : ''}${value.ignored ? ` (${value.ignored} ignored)` : ''}${value.skipped ? ` (${value.skipped} skipped)` : ''}${value.git ? ` on ${value.git.branch || '(detached)'}@${value.git.shortCommit}` : ''}`,
      }],
    },
    // 索引大仓库可能耗时，给一个宽松的协作式预算（工具须转发 exec.signal）
    timeoutMs: 180_000,
    async execute(args, exec) {
      const fs = ctx.fs
      if (!fs) {
        throw new Error('repowiki-index requires the ctx.fs capability to be available in this profile')
      }
      const startDir = typeof args.root === 'string' && args.root.trim()
        ? args.root
        : cwdOf(ctx)
      // 写操作串行化（O5，ADR-0005）：同资产根的并发调用按到达顺序排队
      return withAssetRootLock(fs, startDir, async ({ root }) => {
        // 旧版本索引（readIndex 已校验 schemaVersion）作为增量基准；
        // incremental=false 或旧索引不可读（含 schema 版本不匹配）则全量重建
        const previous = args.incremental === false
          ? null
          : await readIndex(fs, root)
        const doc = await buildIndex(fs, root, {
          extraExclude: Array.isArray(args.exclude) ? args.exclude : undefined,
          // 下界钳制：maxFiles=-1 会让 walk 立即停且 capped 误报为 false
          maxFiles: typeof args.maxFiles === 'number' ? Math.max(1, Math.floor(args.maxFiles)) : undefined,
          previous,
          signal: exec.signal,
        })
        // 取消：部分结果不得覆盖旧索引（旧资产仍可读）
        if (doc.stats.aborted) {
          return {
            root,
            indexPath: '',
            files: doc.stats.files,
            symbols: doc.stats.symbols,
            edges: doc.stats.edges,
            reused: doc.stats.reused,
            added: doc.stats.added,
            changed: doc.stats.changed,
            removed: doc.stats.removed,
            ignored: doc.stats.ignored,
            skipped: doc.stats.skipped,
            skippedTooLarge: doc.stats.skippedTooLarge,
            languages: doc.stats.languages,
            ...(doc.git ? { git: doc.git } : {}),
            ...(doc.warnings ? { warnings: doc.warnings } : {}),
            durationMs: doc.stats.durationMs,
            capped: doc.stats.capped,
            aborted: true,
            hint: 'Cancelled: the existing index was left untouched. Re-run repowiki-index when ready.',
          }
        }
        const indexPath = await writeIndex(fs, root, doc)
        return {
          root,
          indexPath,
          files: doc.stats.files,
          symbols: doc.stats.symbols,
          edges: doc.stats.edges,
          reused: doc.stats.reused,
          added: doc.stats.added,
          changed: doc.stats.changed,
          removed: doc.stats.removed,
          ignored: doc.stats.ignored,
          skipped: doc.stats.skipped,
          skippedTooLarge: doc.stats.skippedTooLarge,
          languages: doc.stats.languages,
          ...(doc.git ? { git: doc.git } : {}),
          ...(doc.warnings ? { warnings: doc.warnings } : {}),
          durationMs: doc.stats.durationMs,
          capped: doc.stats.capped,
        }
      })
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Index repository symbols',
      kind: 'search',
      rawInput: { root: args.root ?? '(current directory)', incremental: args.incremental ?? true },
    }),
  }
}
