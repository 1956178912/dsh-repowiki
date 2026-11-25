/**
 * 技术栈识别（纯函数）。
 *
 * 输入 indexer 已读取的清单文件内容（path → text），输出项目元数据与
 * 技术列表。识别表只收录主流且名称确定的框架/库（避免臆造映射）；
 * 未命中映射的依赖只计入计数，不产生错误结论。
 */

/**
 * 技术栈识别结果。
 * @typedef {Object} StackInfo
 * @property {string} [projectName] - 清单中的项目名（如 package.json 的 name）。
 * @property {string} [projectVersion] - 清单中的项目版本。
 * @property {{name:string, ecosystem:string, source:string, version?:string}[]} technologies - 命中映射的技术。
 * @property {Record<string, number>} dependencyCounts - 按生态的依赖总数（未命中映射也计入）。
 */

/** npm 依赖名 → 技术展示名的映射（主流框架/库/工具链）。 */
const NPM_TECH = {
  react: 'React', 'react-dom': 'React', vue: 'Vue', 'nuxt': 'Nuxt', next: 'Next.js',
  'next.js': 'Next.js', '@angular/core': 'Angular', svelte: 'Svelte', '@sveltejs/kit': 'SvelteKit',
  'solid-js': 'Solid', preact: 'Preact', '@vue/server-renderer': 'Vue',
  express: 'Express', fastify: 'Fastify', koa: 'Koa', '@nestjs/core': 'NestJS', 'hapi': 'hapi',
  '@hapi/hapi': 'hapi', polka: 'Polka',
  electron: 'Electron', '@tauri-apps/api': 'Tauri',
  typescript: 'TypeScript',
  tailwindcss: 'Tailwind CSS', 'sass': 'Sass', 'less': 'Less', 'styled-components': 'styled-components',
  emotion: 'Emotion',
  three: 'Three.js', d3: 'D3', 'chart.js': 'Chart.js', 'recharts': 'Recharts',
  lodash: 'Lodash', 'underscore': 'Underscore', ramda: 'Ramda', 'date-fns': 'date-fns',
  dayjs: 'Day.js', moment: 'Moment.js', axios: 'Axios', 'node-fetch': 'node-fetch',
  ws: 'ws', 'socket.io': 'Socket.IO', graphql: 'GraphQL', '@apollo/server': 'Apollo GraphQL',
  'apollo-server': 'Apollo GraphQL', 'urql': 'urql',
  zod: 'Zod', yup: 'Yup', joi: 'Joi', 'class-validator': 'class-validator',
  prisma: 'Prisma', '@prisma/client': 'Prisma', 'drizzle-orm': 'Drizzle ORM',
  typeorm: 'TypeORM', sequelize: 'Sequelize', mongoose: 'Mongoose', 'knex': 'Knex',
  pg: 'node-postgres', mysql2: 'MySQL client', redis: 'Redis client', ioredis: 'Redis client',
  jest: 'Jest', vitest: 'Vitest', mocha: 'Mocha', jasmine: 'Jasmine', ava: 'AVA',
  playwright: 'Playwright', puppeteer: 'Puppeteer', cypress: 'Cypress',
  eslint: 'ESLint', prettier: 'Prettier', stylelint: 'Stylelint',
  webpack: 'webpack', vite: 'Vite', rollup: 'Rollup', esbuild: 'esbuild', turbopack: 'Turbopack',
  '@storybook/react': 'Storybook', storybook: 'Storybook',
  'framer-motion': 'Framer Motion', 'zustand': 'Zustand', 'redux': 'Redux',
  '@reduxjs/toolkit': 'Redux Toolkit', 'mobx': 'MobX', jotai: 'Jotai', valtio: 'Valtio',
  nanostores: 'Nano Stores', pinia: 'Pinia', 'vuex': 'Vuex', 'react-query': 'TanStack Query',
  '@tanstack/react-query': 'TanStack Query', 'swr': 'SWR', 'react-router-dom': 'React Router',
  'react-router': 'React Router', '@reach/router': 'Reach Router', 'vue-router': 'Vue Router',
  '@trpc/server': 'tRPC', '@trpc/client': 'tRPC',
}

/** pip 依赖名 → 技术展示名（取 requirements.txt / pyproject 里的常见分发名）。 */
const PIP_TECH = {
  django: 'Django', flask: 'Flask', fastapi: 'FastAPI', 'starlette': 'Starlette',
  tornado: 'Tornado', bottle: 'Bottle', 'aiohttp': 'AIOHTTP', 'sanic': 'Sanic',
  pytest: 'pytest', 'tox': 'tox',
  requests: 'Requests', httpx: 'HTTPX',
  numpy: 'NumPy', scipy: 'SciPy', pandas: 'pandas', 'matplotlib': 'Matplotlib',
  'plotly': 'Plotly', 'seaborn': 'Seaborn', 'bokeh': 'Bokeh',
  torch: 'PyTorch', torchvision: 'PyTorch', tensorflow: 'TensorFlow',
  'keras': 'Keras', 'scikit-learn': 'scikit-learn', 'sklearn': 'scikit-learn',
  'transformers': 'Transformers', 'langchain': 'LangChain', llama_index: 'LlamaIndex',
  celery: 'Celery', redis: 'redis-py', 'rq': 'RQ', 'sqlalchemy': 'SQLAlchemy',
  'psycopg2-binary': 'psycopg2', 'psycopg2': 'psycopg2', 'asyncpg': 'asyncpg',
  'pymysql': 'PyMySQL', 'beautifulsoup4': 'Beautiful Soup', 'bs4': 'Beautiful Soup',
  lxml: 'lxml', 'pydantic': 'Pydantic', 'click': 'click', 'typer': 'Typer',
  'uvicorn': 'Uvicorn', 'gunicorn': 'Gunicorn', 'pyyaml': 'PyYAML', 'jinja2': 'Jinja2',
  'attrs': 'Attrs', 'pillow': 'Pillow', 'opencv-python': 'OpenCV', 'cv2': 'OpenCV',
  'pyarrow': 'Arrow', 'duckdb': 'DuckDB', 'polars': 'Polars', 'spacy': 'spaCy',
  'nltk': 'NLTK', 'gensim': 'Gensim', 'xgboost': 'XGBoost', 'lightgbm': 'LightGBM',
}

/** go.mod require 的模块路径前缀 → 技术展示名。 */
const GO_TECH = {
  'github.com/gin-gonic/gin': 'Gin', 'github.com/labstack/echo': 'Echo',
  'github.com/gofiber/fiber': 'Fiber', 'github.com/go-chi/chi': 'chi',
  'github.com/gorilla/mux': 'Gorilla Mux', 'github.com/jinzhu/gorm': 'GORM',
  'gorm.io/gorm': 'GORM', 'github.com/spf13/cobra': 'Cobra',
  'github.com/spf13/viper': 'Viper', 'github.com/stretchr/testify': 'testify',
  'github.com/redis/go-redis': 'go-redis', 'github.com/go-redis/redis': 'go-redis',
  'github.com/jackc/pgx': 'pgx', 'github.com/lib/pq': 'lib/pq',
  'github.com/golang/migrate': 'golang-migrate', 'go.etcd.io/bbolt': 'bbolt',
  'github.com/urfave/cli': 'urfave/cli', 'google.golang.org/grpc': 'gRPC-Go',
  'go.uber.org/zap': 'zap', 'github.com/sirupsen/logrus': 'logrus',
}

/** Cargo.toml 的 crate 名 → 技术展示名。 */
const CARGO_TECH = {
  tokio: 'Tokio', asyncstd: 'async-std', serde: 'Serde', 'serde_json': 'Serde',
  actix: 'Actix', actix_web: 'Actix Web', axum: 'Axum', warp: 'Warp',
  rocket: 'Rocket', clap: 'Clap', structopt: 'StructOpt', reqwest: 'Reqwest',
  hyper: 'Hyper', tower: 'Tower', diesel: 'Diesel', sqlx: 'sqlx',
  seaorm: 'SeaORM', redis: 'redis-rs', rusqlite: 'rusqlite',uuid: 'uuid',
  chrono: 'Chrono', anyhow: 'Anyhow', thiserror: 'ThisError',
  tracing: 'Tracing', log: 'log', env_logger: 'env_logger',
}

/**
 * 从 npm 依赖映射中识别技术。
 * @param {Record<string,string>} deps - 依赖名 → 版本。
 * @param {string} source - 来源文件相对路径。
 * @returns {{name:string, ecosystem:string, source:string, version?:string}[]} 命中的技术。
 */
function npmTechnologies(deps, source) {
  const techs = []
  for (const [dep, version] of Object.entries(deps)) {
    // 先精确匹配依赖名；scoped 包再用 org 前缀试一次（如 @nestjs/core → @nestjs）
    const display = NPM_TECH[dep]
      ?? (dep.startsWith('@') ? NPM_TECH[dep.split('/')[0]] : undefined)
    if (display) techs.push({ name: display, ecosystem: 'npm', source, version })
  }
  return techs
}

/**
 * 从 pip 依赖列表中识别技术。
 * @param {string[]} lines - 依赖行（形如 `django==4.2` 或 `django`）。
 * @param {string} source - 来源文件相对路径。
 * @returns {{name:string, ecosystem:string, source:string, version?:string}[]} 命中的技术。
 */
function pipTechnologies(lines, source) {
  const techs = []
  for (const raw of lines) {
    // 去掉注释、环境标记与版本约束，只留分发名（小写归一）
    const name = raw.split(/[#;\[]/)[0].trim().split(/[<>=!~\[ ]/)[0].toLowerCase()
    if (!name) continue
    const display = PIP_TECH[name]
    if (display) {
      const version = /[<>=!~](.+)$/.exec(raw.split(/[#;\[]/)[0])
      techs.push({ name: display, ecosystem: 'pip', source, version: version ? version[1] : undefined })
    }
  }
  return techs
}

/**
 * 从 go.mod 文本提取 require 的模块列表。
 * @param {string} text - go.mod 内容。
 * @returns {string[]} 模块路径列表。
 */
function goRequires(text) {
  const modules = []
  let inBlock = false
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('require (')) { inBlock = true; continue }
    if (line === ')' && inBlock) { inBlock = false; continue }
    if (inBlock || line.startsWith('require ')) {
      const mod = line.replace(/^require\s*/, '').split(/\s+/)[0]
      if (mod && mod !== ')' && !mod.startsWith('//')) modules.push(mod)
    }
  }
  return modules
}

/**
 * 从 Cargo.toml 文本提取 [dependencies] 段的 crate 列表。
 * @param {string} text - Cargo.toml 内容。
 * @returns {{name:string, version?:string}[]} crate 列表。
 */
function cargoDeps(text) {
  const deps = []
  let section = ''
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (/^\[[\w "-]*\]$/.test(line)) {
      section = line
      continue
    }
    if (section === '[dependencies]' && /^[\w-]+\s*=/.test(line)) {
      const [name, rest] = line.split('=').map(s => s.trim())
      const quoted = /^"([^"]+)"/.exec(rest)
      const table = /^\{[^}]*version\s*=\s*"([^"]+)"/.exec(rest)
      deps.push({ name, version: quoted ? quoted[1] : table ? table[1] : undefined })
    }
  }
  return deps
}

/**
 * 识别技术栈（纯函数入口）。
 * @param {Record<string, string>} manifests - 相对路径 → 清单文件文本。
 * @returns {StackInfo} 识别结果。
 */
export function detectStack(manifests) {
  /** @type {StackInfo} */
  const info = { technologies: [], dependencyCounts: {} }
  for (const [path, text] of Object.entries(manifests)) {
    if (path === 'package.json') {
      let pkg
      try { pkg = JSON.parse(text) } catch { continue }
      if (typeof pkg !== 'object' || pkg === null) continue
      if (typeof pkg.name === 'string') info.projectName = pkg.name
      if (typeof pkg.version === 'string') info.projectVersion = pkg.version
      const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
      info.dependencyCounts.npm = Object.keys(deps).length
      info.technologies.push(...npmTechnologies(deps, path))
    } else if (path === 'requirements.txt') {
      const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
      info.dependencyCounts.pip = lines.length
      info.technologies.push(...pipTechnologies(lines, path))
    } else if (path === 'go.mod') {
      const modules = goRequires(text)
      info.dependencyCounts.go = modules.length
      for (const mod of modules) {
        const name = GO_TECH[mod]
        if (name) info.technologies.push({ name, ecosystem: 'go', source: path })
      }
    } else if (path === 'Cargo.toml') {
      const deps = cargoDeps(text)
      info.dependencyCounts.cargo = deps.length
      for (const dep of deps) {
        const name = CARGO_TECH[dep.name]
        if (name) info.technologies.push({ name, ecosystem: 'cargo', source: path, version: dep.version })
      }
    }
    // pyproject.toml / composer.json：Phase 1 只计入元数据，不做技术映射
    //（pyproject 的依赖段形态多样，识别放后续迭代，避免错误结论）
  }
  // 去重（同一技术可能来自 dependencies + devDependencies）
  const seen = new Set()
  info.technologies = info.technologies.filter(t => {
    const key = `${t.ecosystem}:${t.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return info
}
