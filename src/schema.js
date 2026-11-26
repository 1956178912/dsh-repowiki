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
 *  v2：文件条目新增 digest（内容指纹），支撑增量重建与卡片失效检测。 */
export const INDEX_SCHEMA_VERSION = 2

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

/** 单个源码文件读取的字节上限（4 MiB，与 readText 的合理预算对齐）。 */
export const MAX_FILE_BYTES = 4 * 1024 * 1024

/**
 * 无条件排除的目录名（跨语言约定：依赖目录、版本控制、构建产物、
 * 编辑器/运行时缓存、资产自身）。这些目录即使被遍历也只会产出噪声符号。
 */
export const EXCLUDE_DIRS = new Set([
  'node_modules',
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
  py: 'python',
  pyi: 'python',
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

/** 嵌入提取 prompt 的源码截断上限（字符）。超限截断并在 prompt 中告知。 */
export const MAX_SOURCE_CHARS = 20_000

/** generate 一次喂入 prompt 的卡片摘要上限（防止 prompt 爆炸）。 */
export const MAX_CARDS_IN_PROMPT = 200

/**
 * 依赖边种类。Phase 1 只有模块 import 一种；Phase 3 增量更新会
 * 复用该字段表达更强的传导语义。
 */
export const EDGE_KIND_IMPORT = 'import'
