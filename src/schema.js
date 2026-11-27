/**
 * 仓库符号级索引的常量与领域约定。
 *
 * 本模块是整个 bundle 的" schema 单一来源"：资产目录名、index.json 的
 * schemaVersion、默认排除规则、受支持语言映射都只在这里声明，其他模块
 * 一律引用而非重复定义（DRY）。
 */

/**
 * 项目内的资产目录名。资产索引、卡片、Wiki 全部落在此目录下，
 * 从而天然随 Git 共享（方案 §P4：资产本体写项目目录普通文件）。
 */
export const ASSET_DIR = '.dsh-repowiki'

/** 会话记忆条目目录名（Phase 4：模型显式沉淀的会话知识候选）。 */
export const MEMORY_DIR = 'memory'

/** 记忆条目 frontmatter 的数据版本。 */
export const MEMORY_SCHEMA_VERSION = 1

/** 记忆条目的状态流转：pending（待审）→ accepted（采信）/ rejected（否决）。 */
export const MEMORY_STATUS = ['pending', 'accepted', 'rejected']

/** 单次 Wiki 生成 prompt 中携带的已采信记忆条目上限（Phase 4 消费侧）。 */
export const MAX_MEMORIES_IN_PROMPT = 20

/** 索引文件相对资产目录的路径。 */
export const INDEX_REL_PATH = `${ASSET_DIR}/index.json`

/** index.json 的数据版本。任何字段或折叠语义变化必须 +1，
 *  读取侧据做兼容校验与降级（方案 §10.3-4：资产数据版本化）。
 *  v2：文件条目新增 digest（内容指纹），支撑增量重建与卡片失效检测。
 *  v3：正式纳入 files[].module 与 modules[]（模块树），读取侧兼容 v2。
 *  v4：新增 git 元数据与 stats.languages（语言分布），读取侧兼容 v2/v3。
 *  v5：依赖边新增 line（import/use/require 所在行），支撑行号级反向引用；
 *      读取侧兼容 v2–v4（旧边无 line，按文件级引用降级）。
 *  v6：文件条目新增 lines（源码行数），用于 Wiki 引用行号越界校验；
 *      读取侧兼容 v2–v5（旧条目无 lines，行号校验降级为未检查）。 */
export const INDEX_SCHEMA_VERSION = 6

/** 读取侧仍可兼容的旧索引版本（v2–v5 → 内存补齐派生字段，下次索引写 v6）。 */
export const INDEX_COMPATIBLE_VERSIONS = new Set([2, 3, 4, 5, 6])

/** 符号/依赖提取规则版本。解析器修复或语义变化时 +1；与 schemaVersion
 *  独立，用于在源码 digest 未变时也使旧的 files[].symbols/imports 缓存失效。
 *  v1：支持 JS/TS 多行 import/export-from，并记录具名导入证据。
 *  v2：v1 之后的解析规则演进批量失效（Elixir/Lua/Zig/Gleam 等新增语言的
 *      符号与依赖提取、Zig 公开再导出、Gleam 跨行未限定导入、Dart/PHP/
 *      Ruby/Swift/Scala 等既有规则的修复）。升级后首轮索引会重解析全部
 *      文件，统计表现为 changed=文件数、reused=0。
 *  v3：R6/S4 类内方法登记为 method + parent（R 符号提取规则变化）。 */
export const INDEX_PARSER_VERSION = 3

/** 产物支持的语言（卡片与 Wiki 的 locale 目录名）。 */
export const SUPPORTED_LOCALES = ['zh', 'en']

/**
 * 文件内容指纹的十六进制位数（sha256 前 12 位）。
 * 48-bit 指纹用于"文件是否变化"的判定，碰撞概率对增量用途可忽略；
 * 不取全长是为了缩小随 Git 共享的 index.json 体积。
 */
export const DIGEST_CHARS = 12

/**
 * 索引工具结果条目的默认上限。检索工具的输出必须是有界的
 * （tool-design.md：Prefer bounded outputs），超限截断并显式标记 truncated。
 */
export const DEFAULT_RESULT_LIMIT = 50

/** 单次索引扫描的文件数硬上限，防止巨型仓库耗尽工具超时预算。 */
export const MAX_FILES_DEFAULT = 5000

/** 单个源码文件读取的字符数上限（4 MiB 字符；按字符而非字节计数，CJK
 * 文件的实际字节数约为字符数 3 倍——比较发生在 readText 全量读取之后，
 * 故为读取预算而非内存峰值防线）。 */
export const MAX_FILE_BYTES = 4 * 1024 * 1024

/**
 * 无条件排除的目录名（跨语言约定：依赖目录、版本控制、构建产物、
 * 编辑器/运行时缓存、资产自身）。这些目录即使被遍历也只会产出噪声符号。
 */
export const EXCLUDE_DIRS = new Set([
  'node_modules',
  'vendor', // PHP Composer 依赖目录（Go 的 vendor 同样为第三方代码）
  '.dart_tool', // Dart/Flutter 生成的包配置与构建缓存
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.vite',
  '.turbo',
  'target',
  'bin',
  'obj',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.venv',
  'venv',
  'env',
  '.idea',
  '.vscode',
  '.dsh-repowiki', // 资产目录自身不索引，避免自引用
  '.dsh', // DSH profile 本地缓存
])

/**
 * 清单文件（生态识别数据源）的相对路径集合。
 * key 是相对于项目根的路径，value 是生态名。
 */
export const MANIFEST_FILES = {
  'package.json': 'npm',
  'requirements.txt': 'pip',
  'pyproject.toml': 'pip',
  'go.mod': 'go',
  'Cargo.toml': 'cargo',
  'composer.json': 'composer',
  'pom.xml': 'maven',
  'build.gradle': 'gradle',
  'build.gradle.kts': 'gradle',
  'Gemfile': 'bundler',
  'Package.swift': 'swiftpm',
  'build.sbt': 'sbt',
  'pubspec.yaml': 'pub',
  'mix.exs': 'mix',
  'build.zig.zon': 'zig',
  'gleam.toml': 'gleam',
  'DESCRIPTION': 'r',
  'NAMESPACE': 'r',
  'CMakeLists.txt': 'cmake',
}

/**
 * 扩展名 → 语言标识的映射。未列出的扩展名不被索引（Phase 1 只覆盖
 * 符号提取有实现的语言；新增语言只需扩展本表与 symbols.js）。
 */
export const EXTENSION_LANGS = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  vue: 'vue',
  svelte: 'svelte',
  py: 'python',
  pyi: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  cs: 'csharp',
  kt: 'kotlin',
  php: 'php',
  rb: 'ruby',
  rake: 'ruby',
  swift: 'swift',
  scala: 'scala',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  lua: 'lua',
  zig: 'zig',
  gleam: 'gleam',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  bats: 'shell',
  R: 'r',
  r: 'r',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  ipp: 'cpp',
}

/** 支持符号提取的语言集合（由 EXTENSION_LANGS 的值推导，避免重复维护）。 */
export const SYMBOL_LANGUAGES = new Set(Object.values(EXTENSION_LANGS))

/**
 * JS/TS 相对 import specifier 解析为文件路径时尝试的后缀与入口
 * （Node 的 ESM/CJS 解析约定的子集，够用于建立文件级依赖边）。
 */
export const JS_PATH_CANDIDATES = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '']

/** Python 相对 import 解析时尝试的后缀。 */
export const PY_PATH_CANDIDATES = ['.py', '']

/**
 * 知识卡片文件的 schemaVersion（卡片 frontmatter 内）。
 * 卡片结构变化必须 +1，读取侧校验后降级。
 */
export const CARD_SCHEMA_VERSION = 1

/**
 * 知识清单（knowledge/<locale>/_index.json）的 schemaVersion。
 * v2 增加 lastRun 最近运行快照；v1 仍可读。
 */
export const KNOWLEDGE_INDEX_SCHEMA_VERSION = 2

/**
 * Wiki 清单（wiki/<locale>/_index.json）的 schemaVersion。
 * v2 增加章节级 sections，v3 增加输入/记忆指纹、引用指纹与失败页；
 * 读取侧按可得字段降级。
 */
export const WIKI_MANIFEST_SCHEMA_VERSION = 3

/** 知识卡片目录名（相对资产目录）：knowledge/{locale}/。 */
export const KNOWLEDGE_DIR = 'knowledge'

/** Wiki 页面目录名（相对资产目录）：wiki/{locale}/。 */
export const WIKI_DIR = 'wiki'

/**
 * 项目级配置文件名（相对资产目录）。JSON 格式、随 Git 共享。
 * 承载项目级偏好（方案 §5.5：项目级配置随仓库走，不受 profile 影响）。
 */
export const PLAN_FILE = 'repowiki-plan.json'

/**
 * 卡片提取的默认阈值与上限（方案 §11.4 成本模型）：
 * 符号数低于 threshold 的文件只产签名信息、不值得子代理提取；
 * maxCards 限制单次提取的卡片数，超限分批。
 */
export const CARD_COMPLEXITY_THRESHOLD = 3
export const MAX_CARDS_PER_RUN_DEFAULT = 40

/**
 * 单次提取的并发子代理数上限与默认值。
 * 并发只影响模型派发；写卡片仍逐张经资产根锁串行化。默认 1 保持旧行为，
 * 由 plan/工具参数显式提高（过高会放大限流与成本风险）。
 */
export const MAX_EXTRACT_CONCURRENCY = 4
export const EXTRACT_CONCURRENCY_DEFAULT = 1

/**
 * 单文件提取的最大尝试次数（含首次）与默认值。
 * 失败（抛错或模型返回不可用结构）时按指数退避重试；明确 skip 不重试。
 * 默认 2 次可在网络抖动/偶发坏输出下补救一次，同时限制成本放大。
 */
export const MAX_EXTRACT_ATTEMPTS = 3
export const EXTRACT_ATTEMPTS_DEFAULT = 2

/** 嵌入提取 prompt 的源码截断上限（字符）。超限截断并在 prompt 中告知。 */
export const MAX_SOURCE_CHARS = 20_000

/** generate 一次喂入 prompt 的卡片摘要上限（防止 prompt 爆炸）。 */
export const MAX_CARDS_IN_PROMPT = 200

/**
 * 依赖边种类。Phase 1 只有模块 import 一种；Phase 3 增量更新会
 * 复用该字段表达更强的传导语义。
 */
export const EDGE_KIND_IMPORT = 'import'
