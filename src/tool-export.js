/**
 * repowiki-export 工具：把当前项目的知识库资产导出为目录快照。
 *
 * 数据流：定位资产根 → 校验资产存在 → 把 .dsh-repowiki/** 原样复制
 * 到目标目录（仅 .md/.json 文本资产）。目标目录默认不得已存在且非空，
 * overwrite=true 才合并覆盖。纯文件操作：无 LLM、无模型调用。
 */

import * as path from 'node:path'
import { resolveAssetRoot } from './assets.js'
import { copyTree, dirHasContent } from './transfer.js'

/** 工具描述。 */
const DESCRIPTION = [
  'Export the .dsh-repowiki/ knowledge base (index, cards, wiki, plan) of the current',
  'project into a directory snapshot for backup or transfer. Text assets only (Markdown',
  'and JSON); pure file copy with no model calls. The target directory must not exist or',
  'must be empty unless overwrite=true. Relative targets resolve against the session',
  'directory; absolute targets may be refused by the filesystem backend.',
].join(' ')

/**
 * 构造 repowiki-export 工具定义。
 * @param {object} ctx - 插件上下文（提供 ctx.fs）。
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
          durationMs: { type: 'integer' },
        },
        required: ['root', 'assetDir', 'target', 'files', 'dirs', 'skipped', 'durationMs'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Exported ${value.files} file(s) (${value.dirs} directories, ${value.skipped} skipped) from ${value.assetDir} to ${value.target} in ${value.durationMs}ms.`,
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
          root, assetDir, target: '', files: 0, dirs: 0, skipped: 0, durationMs: 0,
          hint: 'target is required: the directory to export the snapshot into.',
        }
      }
      if (!(await dirHasContent(fs, assetDir))) {
        return {
          root, assetDir, target: args.target, files: 0, dirs: 0, skipped: 0, durationMs: 0,
          hint: 'No .dsh-repowiki assets found. Run repowiki-index (and repowiki-extract) first.',
        }
      }
      const targetAbs = resolveTarget(args.target, cwdOf(ctx))
      if (!args.overwrite && (await dirHasContent(fs, targetAbs))) {
        return {
          root, assetDir, target: targetAbs, files: 0, dirs: 0, skipped: 0, durationMs: 0,
          hint: `Target ${targetAbs} already exists and is not empty. Pass overwrite=true to merge into it.`,
        }
      }
      const counts = await copyTree(fs, assetDir, targetAbs)
      return {
        root,
        assetDir,
        target: targetAbs,
        files: counts.files,
        dirs: counts.dirs,
        skipped: counts.skipped,
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

/**
 * 把目标参数解析为绝对路径（相对路径相对会话 cwd）。
 * @param {string} target - 目标路径参数。
 * @param {string} cwd - 会话当前目录绝对路径。
 * @returns {string} 绝对路径（POSIX 分隔符）。
 */
function resolveTarget(target, cwd) {
  const trimmed = target.trim()
  const abs = path.isAbsolute(trimmed) ? trimmed : path.join(cwd, trimmed)
  return abs.split(path.sep).join('/')
}

/**
 * 取当前工作目录（ctx.workingDirectory 为可选服务，缺失时退回 process.cwd）。
 * @param {object} ctx - 插件上下文。
 * @returns {string} 当前目录绝对路径。
 */
function cwdOf(ctx) {
  const wd = ctx.workingDirectory
  if (wd && typeof wd.get === 'function') {
    try { return wd.get() } catch { /* 降级到 process.cwd */ }
  }
  return process.cwd()
}
