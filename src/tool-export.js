/**
 * repowiki-export 工具：把当前项目的知识库资产导出为目录快照。
 *
 * 数据流：定位资产根 → 校验资产存在 → 把 .dsh-repowiki/** 原样复制
 * 到目标目录（仅 .md/.json 文本资产）。目标目录默认不得已存在且非空，
 * overwrite=true 才合并覆盖。纯文件操作：无 LLM、无模型调用。
 */

import { resolveAssetRoot } from './assets.js'
import {
  copyTree, dirHasContent, SNAPSHOT_MANIFEST, writeSnapshotManifest,
} from './transfer.js'
import { cwdOf, toAbsPath } from './util.js'

/** 工具描述。 */
const DESCRIPTION = [
  'Export the .dsh-repowiki/ knowledge base (index, cards, wiki, plan) of the current',
  'project into a directory snapshot for backup or transfer. Text assets only (Markdown',
  'and JSON); pure file copy with no model calls. A _snapshot.json manifest records each',
  'copied file and its content digest so repowiki-import can verify the snapshot before',
  'restoring it. The target directory must not exist or must be empty unless overwrite=true.',
  'Relative targets resolve against the session directory; absolute targets may be refused',
  'by the filesystem backend.',
].join(' ')

/**
 * 构造 repowiki-export 工具定义。
 * @param {PluginContext} ctx - 插件上下文（提供 ctx.fs）。
 * @returns {object} ToolDefinition。
 */
export function repowikiExportTool(ctx) {
  return {
    name: 'repowiki-export',
    description: DESCRIPTION,
    parameters: {
      root: {
        type: 'string',
        description: 'Optional project root to export from. Defaults to the current directory; the asset root is found by walking up for .dsh-repowiki.',
      },
      target: {
        type: 'string',
        description: 'Destination directory of the snapshot (required). Relative paths resolve against the session directory; it then holds index.json, knowledge/, wiki/ and the plan file.',
      },
      overwrite: {
        type: 'boolean',
        description: 'Allow exporting into an existing non-empty target directory (existing files are overwritten). Default false.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string' },
          assetDir: { type: 'string' },
          target: { type: 'string' },
          files: { type: 'integer' },
          dirs: { type: 'integer' },
          skipped: { type: 'integer' },
          failed: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { path: { type: 'string' }, reason: { type: 'string' } }, required: ['path', 'reason'] }, description: 'Bounded list (first 20) of items that could not be copied.' },
          aborted: { type: 'boolean', description: 'True when the caller cancelled; the snapshot may be partial.' },
          snapshot: { type: 'string', description: `Path of the written snapshot manifest (${SNAPSHOT_MANIFEST}); empty when it could not be written.` },
          snapshotFiles: { type: 'integer', description: 'Number of files recorded in the snapshot manifest.' },
          snapshotError: { type: 'string', description: 'Present when the snapshot manifest could not be written.' },
          durationMs: { type: 'integer' },
          hint: { type: 'string', description: 'Present when the tool degrades instead of performing the action; explains the precondition or failure.' },
        },
        required: ['root', 'assetDir', 'target', 'files', 'dirs', 'skipped', 'snapshot', 'snapshotFiles', 'durationMs'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `Exported ${value.files} file(s) (${value.dirs} directories, ${value.skipped} skipped) from ${value.assetDir} to ${value.target} in ${value.durationMs}ms.`,
          ...(value.snapshot ? [`Snapshot manifest: ${value.snapshot} (${value.snapshotFiles} file(s)).`] : []),
          ...(value.snapshotError ? [`Warning: snapshot manifest not written: ${value.snapshotError}`] : []),
          ...(value.aborted ? ['Cancelled: the snapshot may be partial.'] : []),
          ...(value.failed?.length ? [`Failed items (first ${value.failed.length}):`, ...value.failed.map(f => `- ${f.path}: ${f.reason}`)] : []),
        ].join('\n'),
      }],
    },
    timeoutMs: 120_000,
    async execute(args, exec) {
      const fs = ctx.fs
      if (!fs) throw new Error('repowiki-export requires the ctx.fs capability')
      const startedAt = Date.now()
      const startDir = typeof args.root === 'string' && args.root.trim() ? args.root : cwdOf(ctx)
      const { root, assetDir } = await resolveAssetRoot(fs, startDir)

      if (typeof args.target !== 'string' || !args.target.trim()) {
        return {
          root, assetDir, target: '', files: 0, dirs: 0, skipped: 0, snapshot: '', snapshotFiles: 0, durationMs: 0,
          hint: 'target is required: the directory to export the snapshot into.',
        }
      }
      if (!(await dirHasContent(fs, assetDir))) {
        return {
          root, assetDir, target: args.target, files: 0, dirs: 0, skipped: 0, snapshot: '', snapshotFiles: 0, durationMs: 0,
          hint: 'No .dsh-repowiki assets found. Run repowiki-index (and repowiki-extract) first.',
        }
      }
      const targetAbs = toAbsPath(args.target, cwdOf(ctx))
      if (!args.overwrite && (await dirHasContent(fs, targetAbs))) {
        return {
          root, assetDir, target: targetAbs, files: 0, dirs: 0, skipped: 0, snapshot: '', snapshotFiles: 0, durationMs: 0,
          hint: `Target ${targetAbs} already exists and is not empty. Pass overwrite=true to merge into it.`,
        }
      }
      const counts = await copyTree(fs, assetDir, targetAbs, { signal: exec.signal })
      // 快照清单：记录复制成功的每个文件与内容指纹，供导入前校验。
      // 取消或有复制失败时标记 partial，导入默认拒绝这种不完整快照。
      let snapshot = ''
      let snapshotError = ''
      try {
        await writeSnapshotManifest(fs, targetAbs, counts.entries, {
          partial: counts.aborted || counts.failed.length > 0,
        })
        snapshot = `${targetAbs}/${SNAPSHOT_MANIFEST}`
      } catch (err) {
        snapshotError = err?.message ?? 'manifest write failed'
      }
      const hints = []
      if (counts.aborted) hints.push('Cancelled: the snapshot may be partial. Re-run repowiki-export to complete it.')
      if (snapshotError) hints.push(`Snapshot manifest could not be written: ${snapshotError}`)
      return {
        root,
        assetDir,
        target: targetAbs,
        files: counts.files,
        dirs: counts.dirs,
        skipped: counts.skipped,
        failed: counts.failed,
        aborted: counts.aborted,
        snapshot,
        snapshotFiles: counts.entries.length,
        ...(snapshotError ? { snapshotError } : {}),
        ...(hints.length > 0 ? { hint: hints.join(' ') } : {}),
        durationMs: Date.now() - startedAt,
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Export knowledge base snapshot',
      kind: 'execute',
      rawInput: { target: args.target ?? '(unset)', overwrite: args.overwrite ?? false },
    }),
  }
}
