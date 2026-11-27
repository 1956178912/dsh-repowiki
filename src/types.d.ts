/**
 * 全局类型声明（checkJs 用）：DSH 能力 seam 的最小结构。
 * 这些类型只服务静态检查，运行时零产物。
 */

interface FsTarget {
  targetKey?: string
  displayPath?: string
}

interface FsService {
  resolve(path: string, opts?: { cwd?: string }): Promise<FsTarget>
  stat(target: FsTarget): Promise<{ type?: string, size?: number, version?: string } | undefined>
  readText(target: FsTarget): Promise<string>
  writeText(target: FsTarget, content: string): Promise<unknown>
  listDir(target: FsTarget): Promise<Array<{ name: string, type: string, target: FsTarget }>>
}

interface ToolDefinitionLike {
  name: string
  description: string
  parameters?: Record<string, unknown>
  output?: { schema?: unknown, render?: (...args: any[]) => unknown }
  execute?: (...args: any[]) => unknown
  [key: string]: any
}

interface PluginContext {
  fs?: FsService
  tools?: { register(definition: ToolDefinitionLike): () => void }
  subagents?: any
  workingDirectory?: { get(): string }
  locale?: any
  effect?: (fn: () => unknown) => unknown
  [key: string]: any
}

interface SubagentResultLike {
  structured?: any
  stopReason?: string
  diagnostic?: string
  output?: unknown[]
}
