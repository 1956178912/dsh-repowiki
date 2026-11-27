/**
 * repowiki-import 工具：从目录快照恢复知识库资产。
 *
 * 数据流：定位资产根 → 校验源目录非空 → 默认在目标资产已存在时拒绝
 * （overwrite=true 才覆盖）→ 把源目录内容原样复制回 .dsh-repowiki/。
 * 与 repowiki-export 对称：导出产生的目录快照可直接作为导入源。
 * 纯文件操作：无 LLM、无模型调用。
 */

import { resolveAssetRoot, readIndex } from './assets.js'
import { copyTree, dirHasContent } from './transfer.js'
import { cwdOf, toAbsPath } from './util.js'
import { withLock } from './lock.js'

/** 工具描述。 */
const DESCRIPTION = [
  'Import the .dsh-repowiki/ knowledge base of the current project from a directory',
  'snapshot (the output of repowiki-export: index.json, knowledge/, wiki/, plan file).',
  'Restores into .dsh-repowiki/ of the current project. The import is refused while',
  'existing assets are present unless overwrite=true, in which case the snapshot is',
  'merged in: files present in the snapshot overwrite their counterparts, and files',
  'that exist only in your assets are kept (import never deletes anything). Pure',
  'file copy with no model calls. After import, index.json compatibility is',
  'verified and reported.',
].join(' ')

/**
 * 构造 repowiki-import 工具定义。
 * @param {PluginContext} ctx - 插件上下文（提供 ctx.fs）。
 * @returns {object} ToolDefinition。
 */
export function repowikiImportTool(ctx) {
  return {
    name: 'repowiki-import',
    description: DESCRIPTION,
    parameters: {
      root: {
        type: 'string',
        description: 'Optional project root to import into. Defaults to the current directory; the asset root is found by walking up for .dsh-repowiki.',
      },
      source: {
        type: 'string',
        description: 'Source directory of the snapshot (required). Relative paths resolve against the session directory.',
      },
      overwrite: {
        type: 'boolean',
        description: 'Overwrite an existing .dsh-repowiki/ in the project. Default false (the import is refused while existing assets are present).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string' },
          source: { type: 'string' },
          files: { type: 'integer' },
          dirs: { type: 'integer' },
          skipped: { type: 'integer' },
          failed: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { path: { type: 'string' }, reason: { type: 'string' } }, required: ['path', 'reason'] }, description: 'Bounded list (first 20) of items that could not be copied.' },
          aborted: { type: 'boolean', description: 'True when the caller cancelled; the import may be partial.' },
          indexOk: { type: 'boolean' },
          durationMs: { type: 'integer' },
          hint: { type: 'string', description: 'Present when the tool degrades instead of performing the action; explains the precondition or failure.' },
        },
        required: ['root', 'source', 'files', 'dirs', 'skipped', 'indexOk', 'durationMs'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `Imported ${value.files} file(s) (${value.dirs} directories, ${value.skipped} skipped) from ${value.source} in ${value.durationMs}ms.`,
          ...(value.aborted ? ['Cancelled: the import may be partial.'] : []),
          ...(value.failed?.length ? [`Failed items (first ${value.failed.length}):`, ...value.failed.map(f => `- ${f.path}: ${f.reason}`)] : []),
          value.indexOk ? 'index.json is present and compatible.' : 'Warning: index.json is missing or its schema version is incompatible — run repowiki-index.',
        ].join('\n'),
      }],
    },
    timeoutMs: 120_000,
    async execute(args, exec) {
      const fs = ctx.fs
      if (!fs) throw new Error('repowiki-import requires the ctx.fs capability')
      const startedAt = Date.now()
      const startDir = typeof args.root === 'string' && args.root.trim() ? args.root : cwdOf(ctx)
      const { root, assetDir } = await resolveAssetRoot(fs, startDir)

      if (typeof args.source !== 'string' || !args.source.trim()) {
        return {
          root, source: '', files: 0, dirs: 0, skipped: 0, indexOk: false, durationMs: 0,
          hint: 'source is required: the snapshot directory to import from.',
        }
      }
      const sourceAbs = toAbsPath(args.source, cwdOf(ctx))
      if (!(await dirHasContent(fs, sourceAbs))) {
        return {
          root, source: sourceAbs, files: 0, dirs: 0, skipped: 0, indexOk: false, durationMs: 0,
          hint: `Source ${sourceAbs} does not exist or is empty. Nothing to import.`,
        }
      }
      // 写操作串行化（O5，ADR-0005）：覆盖判定与复制整体进入临界区，
      // 避免“检查通过→另一路并发改动→复制”的 TOCTOU 交错
      return withLock(root, async () => {
        if (!args.overwrite && (await dirHasContent(fs, assetDir))) {
          return {
            root, source: sourceAbs, files: 0, dirs: 0, skipped: 0, indexOk: false, durationMs: 0,
            hint: `${assetDir} already holds assets. Pass overwrite=true to replace them.`,
          }
        }
        const counts = await copyTree(fs, sourceAbs, assetDir, { signal: exec.signal })
        // 导入后校验索引可读性（版本不兼容时提示重建而非失败）
        const indexOk = (await readIndex(fs, root)) !== null
        return {
          root,
          source: sourceAbs,
          files: counts.files,
          dirs: counts.dirs,
          skipped: counts.skipped,
          failed: counts.failed,
          aborted: counts.aborted,
          indexOk,
          ...(counts.aborted ? { hint: 'Cancelled: the import may be partial. Re-run repowiki-import to complete it.' } : {}),
          durationMs: Date.now() - startedAt,
        }
      })
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Import knowledge base snapshot',
      kind: 'execute',
      rawInput: { source: args.source ?? '(unset)', overwrite: args.overwrite ?? false },
    }),
  }
}
