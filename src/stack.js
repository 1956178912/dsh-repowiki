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

/** composer.json 的包名 → 技术展示名。 */
const COMPOSER_TECH = {
  'laravel/framework': 'Laravel',
  'symfony/framework-bundle': 'Symfony',
  'symfony/console': 'Symfony',
  'slim/slim': 'Slim',
  'cakephp/cakephp': 'CakePHP',
  'yiisoft/yii2': 'Yii 2',
  'phpunit/phpunit': 'PHPUnit',
  'guzzlehttp/guzzle': 'Guzzle',
  'monolog/monolog': 'Monolog',
  'doctrine/orm': 'Doctrine ORM',
  'doctrine/dbal': 'Doctrine DBAL',
  'predis/predis': 'Predis',
  'aws/aws-sdk-php': 'AWS SDK for PHP',
  'stripe/stripe-php': 'Stripe PHP',
  'phpmailer/phpmailer': 'PHPMailer',
  'twig/twig': 'Twig',
  'nesbot/carbon': 'Carbon',
  'vlucas/phpdotenv': 'phpdotenv',
  'firebase/php-jwt': 'Firebase JWT',
}

/** composer 包名前缀 → 技术展示名（包名未精确命中时兜底）。 */
const COMPOSER_PREFIX_TECH = [
  ['laravel/', 'Laravel'],
  ['symfony/', 'Symfony'],
  ['doctrine/', 'Doctrine'],
  ['phpunit/', 'PHPUnit'],
]

/** Gemfile 的 gem 名 → 技术展示名。 */
const BUNDLER_TECH = {
  rails: 'Ruby on Rails', railties: 'Ruby on Rails', activerecord: 'Active Record',
  sinatra: 'Sinatra', hanami: 'Hanami', grape: 'Grape', rack: 'Rack',
  puma: 'Puma', unicorn: 'Unicorn', sidekiq: 'Sidekiq', resque: 'Resque',
  'delayed_job': 'Delayed Job',
  rspec: 'RSpec', 'rspec-rails': 'RSpec', minitest: 'Minitest', capybara: 'Capybara',
  'factory_bot': 'Factory Bot', 'factory_bot_rails': 'Factory Bot', faker: 'Faker',
  devise: 'Devise', doorkeeper: 'Doorkeeper', cancancan: 'CanCanCan',
  jbuilder: 'Jbuilder', kaminari: 'Kaminari', 'will_paginate': 'WillPaginate',
  sequel: 'Sequel', pg: 'pg', mysql2: 'MySQL client', sqlite3: 'SQLite3',
  redis: 'redis-rb', httparty: 'HTTParty', faraday: 'Faraday', nokogiri: 'Nokogiri',
  graphql: 'GraphQL Ruby', rubocop: 'RuboCop', standard: 'StandardRB',
  brakeman: 'Brakeman', 'stimulus-rails': 'Stimulus', 'turbo-rails': 'Turbo',
  view_component: 'ViewComponent', 'dry-validation': 'Dry Validation',
  'sorbet-runtime': 'Sorbet', 'shopify_api': 'Shopify API',
}

/** Swift Package Manager 的仓库名（小写）→ 技术展示名。 */
const SWIFT_TECH = {
  vapor: 'Vapor', 'swift-nio': 'SwiftNIO', 'swift-argument-parser': 'ArgumentParser',
  'swift-log': 'swift-log', 'swift-collections': 'Swift Collections',
  'swift-syntax': 'SwiftSyntax', 'swift-algorithms': 'Swift Algorithms',
  alamofire: 'Alamofire', 'swift-composable-architecture': 'Composable Architecture',
  'swift-snapshot-testing': 'Snapshot Testing', 'realm-swift': 'Realm', realm: 'Realm',
  quick: 'Quick', nimble: 'Nimble', 'grpc-swift': 'gRPC Swift',
  'firebase-ios-sdk': 'Firebase', kingfisher: 'Kingfisher', 'lottie-ios': 'Lottie',
}

/**
 * CocoaPods pod 名 / Carthage 仓库名（小写）→ 技术展示名。
 * 子规格（`Firebase/Core`）按首段归一；未命中映射只计入依赖计数。
 */
const IOS_TECH = {
  afnetworking: 'AFNetworking', alamofire: 'Alamofire', sdwebimage: 'SDWebImage',
  firebase: 'Firebase', firebasecore: 'Firebase', firebaseauth: 'Firebase',
  reactivecocoa: 'ReactiveCocoa', reactiveswift: 'ReactiveSwift', rxswift: 'RxSwift',
  masonry: 'Masonry', snapkit: 'SnapKit', kingfisher: 'Kingfisher',
  mbprogresshud: 'MBProgressHUD', svprogresshud: 'SVProgressHUD',
  iqkeyboardmanager: 'IQKeyboardManager', swiftyjson: 'SwiftyJSON',
  objectmapper: 'ObjectMapper', realm: 'Realm', realmswift: 'Realm',
  fmdb: 'FMDB', iglistkit: 'IGListKit', lottie: 'Lottie', 'lottie-ios': 'Lottie',
  texture: 'Texture', moya: 'Moya', quick: 'Quick', nimble: 'Nimble',
  starscream: 'Starscream', svgkit: 'SVGKit', result: 'Result', promisekit: 'PromiseKit',
}

/** pubspec.yaml 的包名 → 技术展示名。 */
const PUB_TECH = {
  flutter: 'Flutter', flutter_test: 'Flutter Test', cupertino_icons: 'Cupertino Icons',
  provider: 'Provider', riverpod: 'Riverpod', flutter_riverpod: 'Riverpod', hooks_riverpod: 'Riverpod',
  bloc: 'Bloc', flutter_bloc: 'Bloc', get: 'GetX', get_it: 'GetIt',
  dio: 'Dio', http: 'http', retrofit: 'Retrofit', chopper: 'Chopper',
  go_router: 'go_router', auto_route: 'AutoRoute',
  sqflite: 'sqflite', drift: 'Drift', isar: 'Isar', hive: 'Hive', shared_preferences: 'SharedPreferences',
  firebase_core: 'Firebase', cloud_firestore: 'Firebase', firebase_auth: 'Firebase',
  google_fonts: 'Google Fonts', cached_network_image: 'Cached Network Image',
  freezed: 'Freezed', json_serializable: 'json_serializable', build_runner: 'build_runner',
  mockito: 'Mockito',
}

/** Hex 包名 → 技术展示名。 */
const MIX_TECH = {
  phoenix: 'Phoenix',
  phoenix_live_view: 'Phoenix LiveView',
  phoenix_html: 'Phoenix HTML',
  ecto: 'Ecto',
  ecto_sql: 'Ecto',
  plug: 'Plug',
  plug_cowboy: 'Plug',
  bandit: 'Bandit',
  absinthe: 'Absinthe',
  ash: 'Ash',
  oban: 'Oban',
  tesla: 'Tesla',
  req: 'Req',
  finch: 'Finch',
  mint: 'Mint',
  jason: 'Jason',
  poison: 'Poison',
  nimble_csv: 'NimbleCSV',
  postgrex: 'Postgrex',
  myxql: 'MyXQL',
  ecto_sqlite3: 'Ecto SQLite3',
  redix: 'Redix',
  ex_machina: 'ExMachina',
  credo: 'Credo',
  dialyxir: 'Dialyxir',
  ex_doc: 'ExDoc',
  guardian: 'Guardian',
  ueberauth: 'Ueberauth',
}

/** sbt 的 artifact 名 → 技术展示名。 */
const SBT_TECH = {
  'spark-core': 'Apache Spark', 'spark-sql': 'Apache Spark',
  'akka-actor': 'Akka', 'akka-stream': 'Akka Streams', 'akka-http': 'Akka HTTP',
  'pekko-actor': 'Apache Pekko', 'pekko-stream': 'Apache Pekko',
  'cats-core': 'Cats', 'cats-effect': 'Cats Effect', 'fs2-core': 'FS2',
  zio: 'ZIO', 'zio-http': 'ZIO HTTP',
  'http4s-core': 'http4s', 'http4s-blaze-server': 'http4s',
  play: 'Play Framework', 'play-ws': 'Play Framework',
  circe: 'Circe', 'circe-generic': 'Circe',
  doobie: 'Doobie', slick: 'Slick', quill: 'Quill',
  tapir: 'Tapir', sttp: 'sttp',
  scalatest: 'ScalaTest', scalacheck: 'ScalaCheck', munit: 'MUnit',
  'kafka-clients': 'Kafka client', 'kafka-streams-scala': 'Kafka Streams',
  shapeless: 'Shapeless', enumeratum: 'Enumeratum',
  'scala-collection-compat': 'Scala Collection Compat',
}

/** sbt groupId 前缀 → 技术展示名（artifact 未命中时的兜底）。 */
const SBT_GROUP_TECH = [
  ['org.apache.spark', 'Apache Spark'],
  ['com.typesafe.akka', 'Akka'],
  ['org.apache.pekko', 'Apache Pekko'],
  ['dev.zio', 'ZIO'],
  ['org.http4s', 'http4s'],
  ['org.scalatest', 'ScalaTest'],
  ['org.scalacheck', 'ScalaCheck'],
  ['io.circe', 'Circe'],
  ['org.tpolecat', 'Doobie'],
  ['com.softwaremill.sttp', 'sttp'],
  ['org.playframework', 'Play Framework'],
]

/**
 * CMake `find_package(<Name>)` 的包名 → 技术展示名。
 * 只收录名称稳定、拼写约定明确的主流包；未知包只计入依赖数。
 */
const CMAKE_TECH = {
  Qt6: 'Qt', Qt5: 'Qt', Boost: 'Boost', OpenCV: 'OpenCV', Eigen3: 'Eigen',
  fmt: 'fmt', spdlog: 'spdlog', protobuf: 'Protocol Buffers', gRPC: 'gRPC',
  Vulkan: 'Vulkan', SDL2: 'SDL', SFML: 'SFML', glfw3: 'GLFW',
  Catch2: 'Catch2', GTest: 'GoogleTest', GoogleTest: 'GoogleTest',
  nlohmann_json: 'nlohmann/json', OpenSSL: 'OpenSSL', ZLIB: 'zlib',
  SQLite3: 'SQLite', CURL: 'libcurl', LibXml2: 'libxml2', CUDA: 'CUDA',
}

/** Maven/Gradle 的 artifact 名 → 技术展示名（JVM 生态共用）。 */
const JVM_TECH = {
  'spring-boot-starter': 'Spring Boot',
  'spring-boot-starter-web': 'Spring Boot',
  'spring-boot-starter-webflux': 'Spring WebFlux',
  'spring-boot-starter-data-jpa': 'Spring Data JPA',
  'spring-boot-starter-security': 'Spring Security',
  'spring-boot-starter-test': 'Spring Boot Test',
  'spring-core': 'Spring Framework',
  'spring-context': 'Spring Framework',
  'spring-webmvc': 'Spring MVC',
  'spring-kafka': 'Spring Kafka',
  'junit': 'JUnit',
  'junit-jupiter': 'JUnit 5',
  'junit-jupiter-api': 'JUnit 5',
  'junit-jupiter-engine': 'JUnit 5',
  'mockito-core': 'Mockito',
  'mockito-junit-jupiter': 'Mockito',
  'assertj-core': 'AssertJ',
  'testcontainers': 'Testcontainers',
  'jackson-databind': 'Jackson',
  'gson': 'Gson',
  'lombok': 'Lombok',
  'hibernate-core': 'Hibernate',
  'mybatis': 'MyBatis',
  'mybatis-spring': 'MyBatis',
  'guava': 'Guava',
  'slf4j-api': 'SLF4J',
  'logback-classic': 'Logback',
  'log4j-core': 'Log4j',
  'kotlin-stdlib': 'Kotlin',
  'kotlinx-coroutines-core': 'Kotlin Coroutines',
  'ktor-server-core': 'Ktor',
  'quarkus-core': 'Quarkus',
  'micronaut-core': 'Micronaut',
  'netty-all': 'Netty',
  'okhttp': 'OkHttp',
  'retrofit': 'Retrofit',
}

/** Maven groupId 前缀 → 技术展示名（artifact 未命中时的兜底）。 */
const JVM_GROUP_TECH = [
  ['org.springframework', 'Spring Framework'],
  ['org.junit', 'JUnit'],
  ['org.mockito', 'Mockito'],
  ['org.jetbrains.kotlin', 'Kotlin'],
  ['io.quarkus', 'Quarkus'],
  ['io.micronaut', 'Micronaut'],
  ['io.netty', 'Netty'],
]

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
    const name = raw.split(/[#;[]/)[0].trim().split(/[<>=!~[ ]/)[0].toLowerCase()
    if (!name) continue
    const display = PIP_TECH[name]
    if (display) {
      const version = /[<>=!~](.+)$/.exec(raw.split(/[#;[]/)[0])
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
 * 从 pom.xml 提取依赖（artifactId/groupId/version）。
 * @param {string} text - pom.xml 内容。
 * @returns {{artifact:string, group?:string, version?:string}[]} 依赖列表。
 */
function pomDependencies(text) {
  const deps = []
  for (const block of text.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const body = block[1]
    const artifact = /<artifactId>\s*([^<]+?)\s*<\/artifactId>/.exec(body)?.[1]
    if (!artifact) continue
    deps.push({
      artifact,
      group: /<groupId>\s*([^<]+?)\s*<\/groupId>/.exec(body)?.[1],
      version: /<version>\s*([^<]+?)\s*<\/version>/.exec(body)?.[1],
    })
  }
  return deps
}

/**
 * 从 pom.xml 提取项目名（排除依赖块后取首个 artifactId，退回 <name>）。
 * @param {string} text - pom.xml 内容。
 * @returns {string|undefined} 项目名。
 */
function pomProjectName(text) {
  const withoutDeps = text.replace(/<dependencies>[\s\S]*?<\/dependencies>/g, '')
  return /<artifactId>\s*([^<]+?)\s*<\/artifactId>/.exec(withoutDeps)?.[1]
    ?? /<name>\s*([^<]+?)\s*<\/name>/.exec(withoutDeps)?.[1]
}

/**
 * 从 build.gradle / build.gradle.kts 提取依赖坐标。
 * @param {string} text - Gradle 构建脚本内容。
 * @returns {{group:string, artifact:string, version?:string}[]} 依赖列表。
 */
function gradleDependencies(text) {
  const deps = []
  const re = /\b(?:implementation|api|compileOnly|compileOnlyApi|runtimeOnly|testImplementation|testRuntimeOnly|annotationProcessor|kapt)\s*[(\s]\s*['"]([^'"]+)['"]/g
  for (const m of text.matchAll(re)) {
    const parts = m[1].split(':')
    if (parts.length < 2) continue
    deps.push({ group: parts[0], artifact: parts[1], version: parts[2] })
  }
  return deps
}

/**
 * JVM 依赖 → 技术展示名（artifact 精确优先，groupId 前缀兜底）。
 * @param {{artifact:string, group?:string}} dep - 依赖坐标。
 * @returns {string|undefined} 技术展示名。
 */
function jvmTechName(dep) {
  if (JVM_TECH[dep.artifact]) return JVM_TECH[dep.artifact]
  if (!dep.group) return undefined
  return JVM_GROUP_TECH.find(([prefix]) => dep.group.startsWith(prefix))?.[1]
}

/**
 * 从 Gemfile 提取 gem 声明（名称 + 可选的版本约束）。
 * @param {string} text - Gemfile 内容。
 * @returns {{name:string, version?:string}[]} gem 列表。
 */
function bundlerDeps(text) {
  const deps = []
  for (const raw of text.split('\n')) {
    const m = /^gem\s+['"](?<name>[^'"]+)['"](?<rest>.*)$/.exec(raw.trim())
    if (!m) continue
    // gem 'rails', '~> 7.0'（后续字符串里第一个像版本约束的即版本）
    const versions = [...m.groups.rest.matchAll(/['"]([^'"]+)['"]/g)].map(v => v[1])
    const version = versions.find(v => /^[~<>=!^]*\s*\d/.test(v))
    deps.push({ name: m.groups.name, ...(version ? { version } : {}) })
  }
  return deps
}

/**
 * 从 Package.swift 提取包依赖：远端 `url:` 取仓库名，本地 `path:` 取目录名
 * （小写归一）；同一条 `.package(...)` 只取一种来源。
 * @param {string} text - Package.swift 内容。
 * @returns {{name:string}[]} 仓库/目录名列表。
 */
function swiftPackageDeps(text) {
  const deps = []
  for (const m of text.matchAll(/\.package\s*\([^)]*?(?:url:\s*"([^"]+)"|path:\s*"([^"]+)")/g)) {
    const remote = typeof m[1] === 'string' ? m[1] : ''
    const local = typeof m[2] === 'string' ? m[2] : ''
    const name = remote
      ? /([^/]+?)(?:\.git)?\/?$/.exec(remote)?.[1]
      : local.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).pop()
    if (name) deps.push({ name: name.toLowerCase() })
  }
  return deps
}

/**
 * 从 Podfile 提取 `pod 'Name', '~> 1.0'` 声明。
 *
 * 只识别语句级 `pod` 行（含缩进的 target 块内声明）；注释行跳过，本地
 * `:path`/`:git` 依赖同样计入总数但不带版本。子规格保留原名（由技术
 * 映射按首段归一）。
 * @param {string} text - Podfile 内容。
 * @returns {{name:string, version?:string}[]} pod 列表。
 */
function podfileDeps(text) {
  const deps = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim()
    const m = /^pod\s+['"](?<name>[^'"]+)['"](?<rest>.*)$/.exec(line)
    if (!m) continue
    const versions = [...m.groups.rest.matchAll(/['"]([^'"]+)['"]/g)].map(v => v[1])
    const version = versions.find(v => /^[~<>=!^]*\s*\d/.test(v))
    deps.push({ name: m.groups.name, ...(version ? { version } : {}) })
  }
  return deps
}

/**
 * 从 Cartfile/Cartfile.private 提取 `github "owner/repo" ~> 1.0`、
 * `git "url"` 与 `binary "url"` 依赖；仓库名取 URL 末段（去 `.git`）。
 * @param {string} text - Cartfile 内容。
 * @returns {{name:string, version?:string}[]} 仓库名与可选版本。
 */
function cartfileDeps(text) {
  const deps = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim()
    const m = /^(?:github|git|binary)\s+"(?<url>[^"]+)"(?<rest>.*)$/.exec(line)
    if (!m) continue
    const repo = m.groups.url.replace(/\.git$/, '').split('/').filter(Boolean).pop()
    if (!repo) continue
    const version = /(?:~>|==|>=)\s*([\d.]+)/.exec(m.groups.rest)?.[1]
    deps.push({ name: repo, ...(version ? { version } : {}) })
  }
  return deps
}

/**
 * 把 iOS 依赖名归一为技术展示名（小写、子规格取首段）。
 * @param {string} name - pod/仓库名。
 * @returns {string|undefined} 技术展示名。
 */
function iosTechName(name) {
  return IOS_TECH[String(name).toLowerCase().split('/')[0]]
}

/**
 * 从 `*.podspec`（Ruby DSL）提取名称、版本与依赖。
 * 依赖覆盖 `s.dependency` 与 subspec 的 `sp.dependency`；注释行跳过，
 * 可选版本约束取声明后的第一个字符串。
 * @param {string} text - podspec 内容。
 * @returns {{name?:string, version?:string, dependencies:Array<{name:string, version?:string}>}}
 *   元数据与依赖。
 */
/**
 * 从 `*.podspec.json`（CocoaPods JSON 规格）提取名称、版本与依赖。
 * 依赖覆盖顶层 `dependencies` 与 `subspecs[].dependencies`；坏 JSON 返回空。
 * @param {string} text - podspec JSON 内容。
 * @returns {{name?:string, version?:string, dependencies:Array<{name:string, version?:string}>}}
 *   元数据与依赖。
 */
function podspecJsonInfo(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { dependencies: [] }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { dependencies: [] }
  const name = typeof parsed.name === 'string' ? parsed.name : undefined
  const version = typeof parsed.version === 'string' ? parsed.version : undefined
  /** @type {Array<{name:string, version?:string}>} */
  const dependencies = []
  const collect = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    for (const [dep, constraint] of Object.entries(value)) {
      if (typeof dep !== 'string' || dep === '') continue
      if (dependencies.some(item => item.name === dep)) continue
      dependencies.push({ name: dep, ...(typeof constraint === 'string' ? { version: constraint } : {}) })
    }
  }
  collect(parsed.dependencies)
  for (const sub of Array.isArray(parsed.subspecs) ? parsed.subspecs : []) {
    if (sub && typeof sub === 'object') collect(sub.dependencies)
  }
  return {
    ...(name ? { name } : {}),
    ...(version ? { version } : {}),
    dependencies,
  }
}

function podspecInfo(text) {
  const cleaned = text.split('\n').map(line => line.replace(/#.*$/, '')).join('\n')
  const name = /^\s*\w+\.name\s*=\s*['"]([^'"]+)['"]/m.exec(cleaned)?.[1]
  const version = /^\s*\w+\.version\s*=\s*['"]([^'"]+)['"]/m.exec(cleaned)?.[1]
  /** @type {Array<{name:string, version?:string}>} */
  const dependencies = []
  for (const m of cleaned.matchAll(/\.dependency\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/g)) {
    const dep = { name: m[1], ...(m[2] ? { version: m[2] } : {}) }
    if (!dependencies.some(item => item.name === dep.name)) dependencies.push(dep)
  }
  return {
    ...(name ? { name } : {}),
    ...(version ? { version } : {}),
    dependencies,
  }
}

/**
 * 从 pubspec.yaml 提取依赖名（dependencies + dev_dependencies 的顶层键）。
 * @param {string} text - pubspec.yaml 内容。
 * @returns {string[]} 依赖名（去重、保持出现顺序）。
 */
function pubspecDependencies(text) {
  const deps = []
  let inDeps = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '')
    if (!line.trim() || line.trim().startsWith('#')) continue
    // 顶层键（无缩进）切换依赖段；其它段（environment/assets/...）关闭
    if (/^[A-Za-z_][\w-]*\s*:/.test(line)) {
      inDeps = /^(?:dev_)?dependencies\s*:/.test(line)
      continue
    }
    if (!inDeps) continue
    const m = /^\s{2}([A-Za-z_][\w-]*)\s*:/.exec(line)
    if (m && !deps.includes(m[1])) deps.push(m[1])
  }
  return deps
}

/**
 * 从 pubspec.yaml 读取项目名。
 * @param {string} text - pubspec.yaml 内容。
 * @returns {string|undefined} 项目名。
 */
function pubspecName(text) {
  return /^name:\s*([^\s#]+)/m.exec(text)?.[1]
}

/**
 * 从 mix.exs 提取依赖名（`{:dep, "~> x"}` 元组，按出现顺序去重）。
 * 只识别字符串版本形式；`:path`/`:git` 等选项不影响依赖名提取。
 * @param {string} text - mix.exs 内容。
 * @returns {string[]} 依赖名。
 */
function mixDependencies(text) {
  const deps = []
  for (const m of text.matchAll(/\{\s*:([a-z_][\w]*)\s*,\s*"/g)) {
    if (!deps.includes(m[1])) deps.push(m[1])
  }
  return deps
}

/**
 * 从 mix.exs 读取 `app: :name` 项目名。
 * @param {string} text - mix.exs 内容。
 * @returns {string|undefined} 项目名。
 */
function mixAppName(text) {
  return /\bapp:\s*:([a-z_][\w]*)/.exec(text)?.[1]
}

/**
 * 扫描 ZON（Zig Object Notation）某个 `.{...}` 段的直接子键（depth 1）。
 * 跳过字符串与 `//` 行注释，嵌套对象里的 `.url`/`.hash` 不会被误收集。
 * @param {string} text - ZON 内容。
 * @param {string} section - 段名（如 dependencies）。
 * @returns {string[]} 直接子键名（按出现顺序）。
 */
function zonSectionKeys(text, section) {
  const marker = new RegExp(`\\.${section}\\s*=\\s*\\.\\{`).exec(text)
  if (!marker) return []
  const keys = []
  let depth = 1
  let i = marker.index + marker[0].length
  while (i < text.length && depth > 0) {
    const ch = text[i]
    if (ch === '"') {
      i++
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') i++
        i++
      }
      i++
      continue
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (ch === '\\' && text[i + 1] === '\\') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (ch === '{') { depth++; i++; continue }
    if (ch === '}') { depth--; i++; continue }
    if (depth === 1 && ch === '.') {
      const key = /^\.([A-Za-z_]\w*)\s*=/.exec(text.slice(i, i + 128))
      if (key) {
        keys.push(key[1])
        i += key[0].length
        continue
      }
    }
    i++
  }
  return keys
}

/**
 * 从 build.zig.zon 读取项目名、版本与依赖名。
 * `name` 兼容 Zig 0.14+ 的枚举字面量（`.foo`）与旧版字符串（`"foo"`）。
 * @param {string} text - build.zig.zon 内容。
 * @returns {{name:string|undefined, version:string|undefined, dependencies:string[]}} 元数据。
 */
function zigZonInfo(text) {
  const name = /\.name\s*=\s*(?:\.([A-Za-z_]\w*)|"([^"]+)")/.exec(text)
  const version = /\.version\s*=\s*"([^"]+)"/.exec(text)
  return {
    name: name ? (name[1] ?? name[2]) : undefined,
    version: version ? version[1] : undefined,
    dependencies: zonSectionKeys(text, 'dependencies'),
  }
}

/** Gleam 包名 → 技术展示名（只收录框架/运行时，stdlib 只计数）。 */
const GLEAM_TECH = {
  gleam_http: 'gleam_http',
  gleam_json: 'gleam_json',
  gleam_erlang: 'gleam_erlang',
  gleam_otp: 'gleam_otp',
  wisp: 'Wisp',
  lustre: 'Lustre',
  mist: 'Mist',
  gleeunit: 'gleeunit',
}

/**
 * 从 gleam.toml 读取项目名、版本与依赖名。
 * 只读取根级 `name`/`version` 与 `[dependencies]`/`[dev-dependencies]`
 * 段的键（版本约束不解析），依赖按出现顺序去重。
 * @param {string} text - gleam.toml 内容。
 * @returns {{name:string|undefined, version:string|undefined, dependencies:string[]}} 元数据。
 */
function gleamTomlInfo(text) {
  const name = /^\s*name\s*=\s*"([^"]+)"/m.exec(text)?.[1]
  const version = /^\s*version\s*=\s*"([^"]+)"/m.exec(text)?.[1]
  const dependencies = []
  let section = ''
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim()
    if (line === '') continue
    const header = /^\[([^\]]+)\]$/.exec(line)
    if (header) { section = header[1].trim(); continue }
    if (section !== 'dependencies' && section !== 'dev-dependencies') continue
    const key = /^([A-Za-z0-9_-]+)\s*=/.exec(line)
    if (key && !dependencies.includes(key[1])) dependencies.push(key[1])
  }
  return { name, version, dependencies }
}

/** R 包名 → 技术展示名（只收录常用框架/工具，其余只计数）。 */
const R_TECH = {
  ggplot2: 'ggplot2',
  dplyr: 'dplyr',
  tidyr: 'tidyr',
  'data.table': 'data.table',
  shiny: 'Shiny',
  rmarkdown: 'R Markdown',
  knitr: 'knitr',
  testthat: 'testthat',
  roxygen2: 'roxygen2',
  devtools: 'devtools',
  Rcpp: 'Rcpp',
  sf: 'sf',
  lme4: 'lme4',
  caret: 'caret',
  tidymodels: 'tidymodels',
  targets: 'targets',
}

/**
 * 解析 R DESCRIPTION（DCF 格式）：`Field: value`，续行以空白开头并与
 * 上一字段以空格拼接；只有顶格行开启新字段。
 * @param {string} text - DESCRIPTION 内容。
 * @returns {Map<string,string>} 字段名 → 值。
 */
function dcfFields(text) {
  const fields = new Map()
  let current = null
  for (const raw of text.split('\n')) {
    if (current && /^\s/.test(raw)) {
      fields.set(current, `${fields.get(current)} ${raw.trim()}`.trim())
      continue
    }
    const m = /^([A-Za-z][\w.-]*):\s*(.*)$/.exec(raw)
    if (!m) continue
    current = m[1]
    fields.set(current, m[2].trim())
  }
  return fields
}

/**
 * 从 DESCRIPTION 读取包名、版本与依赖名（Depends/Imports/Suggests/
 * LinkingTo；剔除 `R` 本身与版本约束，按出现顺序去重）。
 * @param {string} text - DESCRIPTION 内容。
 * @returns {{name:string|undefined, version:string|undefined, dependencies:string[]}} 元数据。
 */
function rDescriptionInfo(text) {
  const fields = dcfFields(text)
  const dependencies = []
  for (const key of ['Depends', 'Imports', 'Suggests', 'LinkingTo']) {
    const value = fields.get(key)
    if (!value) continue
    for (const part of value.split(',')) {
      const name = part.trim().replace(/\s*\(.*$/, '').trim()
      if (name && name !== 'R' && !dependencies.includes(name)) dependencies.push(name)
    }
  }
  return {
    name: fields.get('Package'),
    version: fields.get('Version'),
    dependencies,
  }
}

/** Julia 包名 → 技术展示名（只收录常用框架/库，其余只计数）。 */
const JULIA_TECH = {
  DataFrames: 'DataFrames',
  Plots: 'Plots',
  Makie: 'Makie',
  Flux: 'Flux',
  'DifferentialEquations': 'DifferentialEquations',
  JuMP: 'JuMP',
  Distributions: 'Distributions',
  StatsBase: 'StatsBase',
  MLJ: 'MLJ',
  CUDA: 'CUDA',
  HTTP: 'HTTP',
  SQLite: 'SQLite',
  CSV: 'CSV',
  JSON3: 'JSON3',
  Pluto: 'Pluto',
}

/**
 * 从 Julia `Project.toml` 读取包名、版本与依赖名
 * （`[deps]`/`[extras]` 段的键；UUID 等根级字段不计）。
 * @param {string} text - Project.toml 内容。
 * @returns {{name:string|undefined, version:string|undefined, dependencies:string[]}} 元数据。
 */
function juliaProjectInfo(text) {
  const name = /^\s*name\s*=\s*"([^"]+)"/m.exec(text)?.[1]
  const version = /^\s*version\s*=\s*"([^"]+)"/m.exec(text)?.[1]
  const dependencies = []
  let section = ''
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim()
    if (line === '') continue
    const header = /^\[([^\]]+)\]$/.exec(line)
    if (header) { section = header[1].trim(); continue }
    if (section !== 'deps' && section !== 'extras') continue
    const key = /^([A-Za-z0-9_]+)\s*=/.exec(line)
    if (key && !dependencies.includes(key[1])) dependencies.push(key[1])
  }
  return { name, version, dependencies }
}

/** Nim 包名 → 技术展示名（只收录常用框架/库，其余只计数）。 */
const NIM_TECH = {
  jester: 'Jester',
  karax: 'Karax',
  chronicles: 'Chronicles',
  chronos: 'Chronos',
  asynctools: 'AsyncTools',
  cligen: 'cligen',
  norm: 'Norm',
  nimble: 'Nimble',
}

/** OCaml / opam 依赖名 → 技术展示名的映射（主流框架、库与工具链）。 */
const OCAML_TECH = {
  dune: 'Dune',
  lwt: 'Lwt',
  'lwt_ppx': 'Lwt',
  async: 'Async',
  'core': 'Core',
  'base': 'Base',
  yojson: 'Yojson',
  cohttp: 'Cohttp',
  'cohttp-lwt-unix': 'Cohttp',
  dream: 'Dream',
  cmdliner: 'Cmdliner',
  'ppx_deriving': 'ppx_deriving',
  alcotest: 'Alcotest',
  ounit2: 'OUnit2',
  utop: 'utop',
  angstrom: 'Angstrom',
  faraday: 'Faraday',
  mirage: 'MirageOS',
  irmin: 'Irmin',
  ocamlformat: 'ocamlformat',
  'sexplib': 'Sexplib',
  'ppx_sexp_conv': 'Sexplib',
}

/**
 * 从 `dune-project` 读取项目名与版本：`(name foo)` / `(version 1.2.3)`。
 * @param {string} text - dune-project 内容。
 * @returns {{name?:string, version?:string}} 元数据。
 */
function duneProjectInfo(text) {
  const name = /\(name\s+([A-Za-z0-9_.-]+)\)/.exec(text)?.[1]
  const version = /\(version\s+([A-Za-z0-9_.+-]+)\)/.exec(text)?.[1]
  return { ...(name ? { name } : {}), ...(version ? { version } : {}) }
}

/**
 * 从 `*.opam` 提取包名（文件名）、`version:` 与 `depends:` 依赖列表。
 * 依赖段直到 `]` 为止，`{ … }` 版本约束先剔除再取引号字符串。
 * @param {string} path - 清单相对路径。
 * @param {string} text - 清单内容。
 * @returns {{name:string, version?:string, dependencies:string[]}} 元数据。
 */
function opamInfo(path, text) {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const name = base.replace(/\.opam$/, '')
  const version = /^\s*version\s*:\s*"([^"]+)"/m.exec(text)?.[1]
  const dependencies = []
  const start = text.search(/^\s*depends\s*:\s*\[/m)
  if (start >= 0) {
    const body = text.slice(start)
    const close = body.indexOf(']')
    const segment = (close >= 0 ? body.slice(0, close) : body).replace(/\{[^}]*\}/g, ' ')
    for (const m of segment.matchAll(/"([^"]+)"/g)) {
      const dep = m[1].trim()
      if (dep && !dependencies.includes(dep)) dependencies.push(dep)
    }
  }
  return { name, version, dependencies }
}

/** Haskell / cabal 包名 → 技术展示名的映射（主流框架、库与工具链）。 */
const HASKELL_TECH = {
  base: 'base',
  text: 'text',
  bytestring: 'bytestring',
  containers: 'containers',
  'unordered-containers': 'unordered-containers',
  vector: 'vector',
  aeson: 'Aeson',
  'http-client': 'http-client',
  'http-conduit': 'http-conduit',
  wai: 'WAI',
  warp: 'Warp',
  yesod: 'Yesod',
  servant: 'Servant',
  'servant-server': 'Servant',
  persistent: 'Persistent',
  'sqlite-simple': 'sqlite-simple',
  'postgresql-simple': 'postgresql-simple',
  hspec: 'Hspec',
  tasty: 'Tasty',
  QuickCheck: 'QuickCheck',
  criterion: 'Criterion',
  'optparse-applicative': 'optparse-applicative',
  lens: 'Lens',
  mtl: 'mtl',
  transformers: 'transformers',
  conduit: 'Conduit',
  pipes: 'Pipes',
  streaming: 'streaming',
  async: 'async',
  stm: 'stm',
  network: 'network',
  websockets: 'WebSockets',
  megaparsec: 'Megaparsec',
  attoparsec: 'attoparsec',
  polysemy: 'Polysemy',
  effectful: 'effectful',
}

/** Erlang / rebar3 依赖名 → 技术展示名的映射（主流框架与库）。 */
const ERLANG_TECH = {
  cowboy: 'Cowboy',
  ranch: 'Ranch',
  gun: 'Gun',
  jsx: 'jsx',
  jiffy: 'Jiffy',
  lager: 'Lager',
  hackney: 'hackney',
  poolboy: 'poolboy',
  uuid: 'uuid',
  recon: 'Recon',
  prometheus: 'Prometheus',
  grpcbox: 'grpcbox',
  'cowboy_swagger': 'Cowboy Swagger',
  gproc: 'gproc',
  'parse_trans': 'parse_trans',
  'proper': 'PropEr',
  'meck': 'meck',
  'eunit': 'EUnit',
  'common_test': 'Common Test',
}

/**
 * 从 `rebar.config` 提取 `{deps, [ … ]}` 依赖名。
 * 允许单行与跨行元组；同名去重。
 * @param {string} text - rebar.config 内容。
 * @returns {string[]} 依赖名列表。
 */
function rebarDependencies(text) {
  const start = text.search(/\{deps\s*,\s*\[/)
  if (start < 0) return []
  const body = text.slice(start)
  const open = body.indexOf('[')
  const close = body.indexOf(']')
  const segment = body.slice(open + 1, close > open ? close : body.length)
  const deps = []
  for (const m of segment.matchAll(/\{\s*([a-z][\w@]*)\s*,/g)) {
    if (!deps.includes(m[1])) deps.push(m[1])
  }
  return deps
}

/** Terraform provider 短名 → 技术展示名的映射。 */
const TERRAFORM_TECH = {
  aws: 'AWS',
  google: 'Google Cloud',
  azurerm: 'Azure',
  kubernetes: 'Kubernetes',
  helm: 'Helm',
  cloudflare: 'Cloudflare',
  docker: 'Docker',
  github: 'GitHub',
  vault: 'Vault',
  datadog: 'Datadog',
  mongodbatlas: 'MongoDB Atlas',
  tls: 'TLS',
  random: 'random',
  null: 'null',
}

/**
 * 从 `.terraform.lock.hcl` 提取 provider 短名（取地址末段）。
 * @param {string} text - lock 文件内容。
 * @returns {string[]} provider 短名（去重）。
 */
function terraformLockProviders(text) {
  const providers = []
  for (const m of text.matchAll(/provider\s+"([^"]+)"/g)) {
    const parts = m[1].split('/')
    const name = parts[parts.length - 1]
    if (name && !providers.includes(name)) providers.push(name)
  }
  return providers
}

/** Clojure / ClojureScript 依赖坐标 → 技术展示名的映射。 */
const CLOJURE_TECH = {
  'org.clojure/clojure': 'Clojure',
  'org.clojure/clojurescript': 'ClojureScript',
  'org.clojure/core.async': 'core.async',
  'org.clojure/core.match': 'core.match',
  'org.clojure/core.logic': 'core.logic',
  'ring/ring-core': 'Ring',
  'compojure/compojure': 'Compojure',
  'reitit/reitit': 'reitit',
  'pedestal/pedestal': 'Pedestal',
  'reagent/reagent': 'Reagent',
  're-frame/re-frame': 're-frame',
  'datomic/datomic': 'Datomic',
  'cheshire/cheshire': 'Cheshire',
  'clj-http/clj-http': 'clj-http',
  'next.jdbc/next.jdbc': 'next.jdbc',
  'honeysql/honeysql': 'HoneySQL',
  'metosin/malli': 'Malli',
  'clj-kondo/clj-kondo': 'clj-kondo',
  'nrepl/nrepl': 'nREPL',
}

/**
 * 从 `deps.edn` 的 `:deps { … }` 提取依赖坐标；值映射（`{:mvn/version …}`）
 * 先剔除，避免把 `mvn/version` 误作依赖。
 * @param {string} text - deps.edn 内容。
 * @returns {string[]} 依赖坐标（去重）。
 */
function depsEdnDependencies(text) {
  const start = text.search(/:deps\s*\{/)
  if (start < 0) return []
  const open = text.indexOf('{', start)
  let depth = 0
  let end = text.length
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  const segment = text.slice(open + 1, end).replace(/\{[^{}]*\}/g, ' ')
  const deps = []
  for (const m of segment.matchAll(/([A-Za-z][\w.-]*\/[\w.-]+)/g)) {
    if (!deps.includes(m[1])) deps.push(m[1])
  }
  return deps
}

/**
 * 从 `project.clj` 读取 `(defproject name "version"` 与
 * `:dependencies [ … ]` 依赖坐标。
 * @param {string} text - project.clj 内容。
 * @returns {{name?:string, version?:string, dependencies:string[]}} 元数据。
 */
function projectCljInfo(text) {
  const head = /\(defproject\s+([A-Za-z][\w.-]*)\s+"([^"]+)"/.exec(text)
  const dependencies = []
  const start = text.search(/:dependencies\s*\[/)
  if (start >= 0) {
    const open = text.indexOf('[', start)
    let depth = 0
    let end = text.length
    for (let i = open; i < text.length; i++) {
      const ch = text[i]
      if (ch === '[') depth++
      else if (ch === ']') {
        depth--
        if (depth === 0) { end = i; break }
      }
    }
    const segment = text.slice(open + 1, end)
    for (const m of segment.matchAll(/\[([A-Za-z][\w.-]*\/[\w.-]+)/g)) {
      if (!dependencies.includes(m[1])) dependencies.push(m[1])
    }
  }
  return {
    ...(head ? { name: head[1], version: head[2] } : {}),
    dependencies,
  }
}

/**
 * 从 `*.cabal` 提取包名/版本与所有 `build-depends` 依赖。
 * 依赖段可跨行（缩进续行），按逗号切分后取首个 token（剔除版本约束）；
 * 顶层 `name:`/`version:` 字段优先。
 * @param {string} text - cabal 文件内容。
 * @returns {{name?:string, version?:string, dependencies:string[]}} 元数据。
 */
function cabalInfo(text) {
  const name = /^name\s*:\s*([A-Za-z0-9_.-]+)/m.exec(text)?.[1]
  const version = /^version\s*:\s*([A-Za-z0-9_.+-]+)/m.exec(text)?.[1]
  const dependencies = []
  let buffer = null
  /**
   * 结算当前 build-depends 片段。
   * @returns {void}
   */
  const flush = () => {
    if (buffer === null) return
    for (const part of buffer.split(',')) {
      const dep = part.trim().split(/\s+/)[0]
      if (dep && /^[A-Za-z0-9-]+$/.test(dep) && !dependencies.includes(dep)) {
        dependencies.push(dep)
      }
    }
    buffer = null
  }
  for (const line of text.split(/\r?\n/)) {
    const start = /^\s*build-depends\s*:\s*(.*)$/.exec(line)
    if (start) {
      flush()
      buffer = start[1]
      continue
    }
    if (buffer === null) continue
    if (/^\s+\S/.test(line) && !/^\s*[a-z][\w-]*\s*:/.test(line)) {
      buffer += ` ${line.trim()}`
    } else {
      flush()
    }
  }
  flush()
  return { ...(name ? { name } : {}), ...(version ? { version } : {}), dependencies }
}

/**
 * 从 `.nimble` 清单读取项目名（文件名）、版本与 `requires` 依赖。
 * `requires` 行的引号字符串取首个 token 作为包名，剔除 `nim` 自身；
 * 版本约束（`>= 1.6.0`）不保留。
 * @param {string} path - 清单相对路径。
 * @param {string} text - 清单内容。
 * @returns {{name:string, version:string|undefined, dependencies:string[]}} 元数据。
 */
function nimbleInfo(path, text) {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const name = base.replace(/\.nimble$/, '')
  const version = /^\s*version\s*=\s*"([^"]+)"/m.exec(text)?.[1]
  const dependencies = []
  for (const m of text.matchAll(/^\s*requires\s+(.+)$/gm)) {
    for (const quoted of m[1].matchAll(/"([^"]+)"/g)) {
      const dep = quoted[1].trim().split(/\s+/)[0]
      if (dep && dep !== 'nim' && !dependencies.includes(dep)) dependencies.push(dep)
    }
  }
  return { name, version, dependencies }
}

/**
 * 从 build.sbt 提取 libraryDependencies 坐标。
 * @param {string} text - build.sbt 内容。
 * @returns {{group:string, artifact:string, version?:string}[]} 依赖列表。
 */
function sbtDependencies(text) {
  const deps = []
  for (const m of text.matchAll(/"([\w.-]+)"\s*%%?\s*"([\w.-]+)"(?:\s*%\s*"([^"]+)")?/g)) {
    deps.push({ group: m[1], artifact: m[2], version: m[3] })
  }
  return deps
}

/**
 * sbt 依赖 → 技术展示名（artifact 精确优先，groupId 前缀兜底）。
 * @param {{artifact:string, group:string}} dep - 依赖坐标。
 * @returns {string|undefined} 技术展示名。
 */
function sbtTechName(dep) {
  if (SBT_TECH[dep.artifact]) return SBT_TECH[dep.artifact]
  return SBT_GROUP_TECH.find(([prefix]) => dep.group.startsWith(prefix))?.[1]
}

/**
 * 从 CMakeLists.txt 提取 `find_package` 的包名（大小写不敏感、去重、
 * 保持出现顺序）。
 * @param {string} text - CMakeLists.txt 内容。
 * @returns {string[]} 包名列表。
 */
function cmakePackages(text) {
  const names = []
  const seen = new Set()
  for (const m of text.matchAll(/find_package\s*\(\s*([A-Za-z0-9_.+-]+)/gi)) {
    const name = m[1]
    if (seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

/**
 * 从 CMakeLists.txt 提取 project() 名称。
 * @param {string} text - CMakeLists.txt 内容。
 * @returns {string|undefined} 项目名。
 */
function cmakeProjectName(text) {
  return /project\s*\(\s*([A-Za-z0-9_.+-]+)/i.exec(text)?.[1]
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
    } else if (path === 'composer.json') {
      let pkg
      try { pkg = JSON.parse(text) } catch { continue }
      if (typeof pkg !== 'object' || pkg === null) continue
      if (typeof pkg.name === 'string') info.projectName = info.projectName ?? pkg.name
      const deps = { ...pkg.require, ...pkg['require-dev'] }
      info.dependencyCounts.composer = Object.keys(deps).length
      for (const [dep, version] of Object.entries(deps)) {
        if (dep === 'php') continue
        const display = COMPOSER_TECH[dep]
          ?? COMPOSER_PREFIX_TECH.find(([prefix]) => dep.startsWith(prefix))?.[1]
        if (display) {
          info.technologies.push({
            name: display,
            ecosystem: 'composer',
            source: path,
            ...(typeof version === 'string' ? { version } : {}),
          })
        }
      }
    } else if (path === 'pom.xml') {
      const deps = pomDependencies(text)
      info.dependencyCounts.maven = deps.length
      if (!info.projectName) info.projectName = pomProjectName(text)
      for (const dep of deps) {
        const name = jvmTechName(dep)
        if (name) info.technologies.push({ name, ecosystem: 'jvm', source: path, version: dep.version })
      }
    } else if (path === 'build.gradle' || path === 'build.gradle.kts') {
      const deps = gradleDependencies(text)
      info.dependencyCounts.gradle = deps.length
      if (!info.projectName) {
        info.projectName = /rootProject\.name\s*=\s*['"]([^'"]+)['"]/.exec(text)?.[1]
      }
      for (const dep of deps) {
        const name = jvmTechName(dep)
        if (name) info.technologies.push({ name, ecosystem: 'jvm', source: path, version: dep.version })
      }
    } else if (path === 'Gemfile') {
      const deps = bundlerDeps(text)
      info.dependencyCounts.bundler = deps.length
      for (const dep of deps) {
        const name = BUNDLER_TECH[dep.name]
        if (name) info.technologies.push({ name, ecosystem: 'bundler', source: path, version: dep.version })
      }
    } else if (path === 'Package.swift') {
      const deps = swiftPackageDeps(text)
      info.dependencyCounts.swiftpm = deps.length
      if (!info.projectName) info.projectName = /name:\s*"([^"]+)"/.exec(text)?.[1]
      for (const dep of deps) {
        const name = SWIFT_TECH[dep.name]
        if (name) info.technologies.push({ name, ecosystem: 'swiftpm', source: path })
      }
    } else if (path.endsWith('.podspec') || path.endsWith('.podspec.json')) {
      const pod = path.endsWith('.podspec.json') ? podspecJsonInfo(text) : podspecInfo(text)
      info.dependencyCounts.cocoapods = (info.dependencyCounts.cocoapods ?? 0) + pod.dependencies.length
      if (!info.projectName && pod.name) info.projectName = pod.name
      if (!info.projectVersion && pod.version) info.projectVersion = pod.version
      for (const dep of pod.dependencies) {
        const name = iosTechName(dep.name)
        if (name) {
          info.technologies.push({
            name,
            ecosystem: 'cocoapods',
            source: path,
            ...(dep.version ? { version: dep.version } : {}),
          })
        }
      }
    } else if (path === 'Podfile' || path.endsWith('/Podfile')) {
      const deps = podfileDeps(text)
      info.dependencyCounts.cocoapods = (info.dependencyCounts.cocoapods ?? 0) + deps.length
      for (const dep of deps) {
        const name = iosTechName(dep.name)
        if (name) {
          info.technologies.push({
            name,
            ecosystem: 'cocoapods',
            source: path,
            ...(dep.version ? { version: dep.version } : {}),
          })
        }
      }
    } else if (path === 'Cartfile' || path === 'Cartfile.private'
      || path.endsWith('/Cartfile') || path.endsWith('/Cartfile.private')) {
      const deps = cartfileDeps(text)
      info.dependencyCounts.carthage = (info.dependencyCounts.carthage ?? 0) + deps.length
      for (const dep of deps) {
        const name = iosTechName(dep.name)
        if (name) {
          info.technologies.push({
            name,
            ecosystem: 'carthage',
            source: path,
            ...(dep.version ? { version: dep.version } : {}),
          })
        }
      }
    } else if (path === 'build.sbt') {
      const deps = sbtDependencies(text)
      info.dependencyCounts.sbt = deps.length
      if (!info.projectName) info.projectName = /name\s*:=\s*"([^"]+)"/.exec(text)?.[1]
      for (const dep of deps) {
        const name = sbtTechName(dep)
        if (name) info.technologies.push({ name, ecosystem: 'sbt', source: path, version: dep.version })
      }
    } else if (path === 'pubspec.yaml' || path.endsWith('/pubspec.yaml')) {
      const deps = pubspecDependencies(text)
      info.dependencyCounts.pub = (info.dependencyCounts.pub ?? 0) + deps.length
      if (path === 'pubspec.yaml' && !info.projectName) info.projectName = pubspecName(text)
      for (const dep of deps) {
        const name = PUB_TECH[dep]
        if (name) info.technologies.push({ name, ecosystem: 'pub', source: path })
      }
    } else if (path === 'mix.exs' || path.endsWith('/mix.exs')) {
      const deps = mixDependencies(text)
      // umbrella：根清单通常只管 app，依赖分布在各 app 的 mix.exs
      info.dependencyCounts.mix = (info.dependencyCounts.mix ?? 0) + deps.length
      if (path === 'mix.exs' && !info.projectName) info.projectName = mixAppName(text)
      for (const dep of deps) {
        const name = MIX_TECH[dep]
        if (name) info.technologies.push({ name, ecosystem: 'mix', source: path })
      }
    } else if (path === 'build.zig.zon' || path.endsWith('/build.zig.zon')) {
      const zon = zigZonInfo(text)
      // monorepo：根清单管项目元数据，子包清单只在依赖计数上累加；
      // zon 的依赖键是用户自定义别名，不做技术名映射以避免误判
      info.dependencyCounts.zig = (info.dependencyCounts.zig ?? 0) + zon.dependencies.length
      if (path === 'build.zig.zon' && !info.projectName && zon.name) info.projectName = zon.name
      if (path === 'build.zig.zon' && !info.projectVersion && zon.version) info.projectVersion = zon.version
    } else if (path === 'gleam.toml' || path.endsWith('/gleam.toml')) {
      const gleam = gleamTomlInfo(text)
      // monorepo：根清单管项目元数据，子包清单合并依赖计数/技术栈
      info.dependencyCounts.gleam = (info.dependencyCounts.gleam ?? 0) + gleam.dependencies.length
      if (path === 'gleam.toml' && !info.projectName && gleam.name) info.projectName = gleam.name
      if (path === 'gleam.toml' && !info.projectVersion && gleam.version) info.projectVersion = gleam.version
      for (const dep of gleam.dependencies) {
        const name = GLEAM_TECH[dep]
        if (name) info.technologies.push({ name, ecosystem: 'gleam', source: path })
      }
    } else if (path === 'DESCRIPTION') {
      const r = rDescriptionInfo(text)
      info.dependencyCounts.r = r.dependencies.length
      if (!info.projectName && r.name) info.projectName = r.name
      if (!info.projectVersion && r.version) info.projectVersion = r.version
      for (const dep of r.dependencies) {
        const name = R_TECH[dep]
        if (name) info.technologies.push({ name, ecosystem: 'r', source: path })
      }
    } else if (path === 'Project.toml') {
      const julia = juliaProjectInfo(text)
      info.dependencyCounts.julia = julia.dependencies.length
      if (!info.projectName && julia.name) info.projectName = julia.name
      if (!info.projectVersion && julia.version) info.projectVersion = julia.version
      for (const dep of julia.dependencies) {
        const name = JULIA_TECH[dep]
        if (name) info.technologies.push({ name, ecosystem: 'julia', source: path })
      }
    } else if (path.endsWith('.nimble')) {
      const nimble = nimbleInfo(path, text)
      info.dependencyCounts.nim = (info.dependencyCounts.nim ?? 0) + nimble.dependencies.length
      if (!info.projectName && nimble.name) info.projectName = nimble.name
      if (!info.projectVersion && nimble.version) info.projectVersion = nimble.version
      for (const dep of nimble.dependencies) {
        const name = NIM_TECH[dep]
        if (name) info.technologies.push({ name, ecosystem: 'nim', source: path })
      }
    } else if (path === 'dune-project') {
      const dune = duneProjectInfo(text)
      if (!info.projectName && dune.name) info.projectName = dune.name
      if (!info.projectVersion && dune.version) info.projectVersion = dune.version
    } else if (path.endsWith('.opam')) {
      const opam = opamInfo(path, text)
      info.dependencyCounts.ocaml = (info.dependencyCounts.ocaml ?? 0) + opam.dependencies.length
      if (!info.projectName && opam.name) info.projectName = opam.name
      if (!info.projectVersion && opam.version) info.projectVersion = opam.version
      for (const dep of opam.dependencies) {
        const name = OCAML_TECH[dep]
        if (name) info.technologies.push({ name, ecosystem: 'opam', source: path })
      }
    } else if (path.endsWith('.cabal')) {
      const cabal = cabalInfo(text)
      // monorepo：根清单（顶层 *.cabal）管元数据，子包清单只累加依赖/技术
      info.dependencyCounts.haskell = (info.dependencyCounts.haskell ?? 0) + cabal.dependencies.length
      if (!path.includes('/')) {
        if (!info.projectName && cabal.name) info.projectName = cabal.name
        if (!info.projectVersion && cabal.version) info.projectVersion = cabal.version
      }
      for (const dep of cabal.dependencies) {
        const name = HASKELL_TECH[dep]
        if (name) info.technologies.push({ name, ecosystem: 'cabal', source: path })
      }
    } else if (path === 'rebar.config' || path.endsWith('/rebar.config')) {
      const deps = rebarDependencies(text)
      info.dependencyCounts.erlang = (info.dependencyCounts.erlang ?? 0) + deps.length
      for (const dep of deps) {
        const name = ERLANG_TECH[dep]
        if (name) info.technologies.push({ name, ecosystem: 'rebar', source: path })
      }
    } else if (path === 'foundry.toml') {
      // Foundry 清单只表明工具链（依赖在 lib/ 子模块，不在清单内）
      info.technologies.push({ name: 'Foundry', ecosystem: 'foundry', source: path })
    } else if (path === 'deps.edn') {
      const deps = depsEdnDependencies(text)
      info.dependencyCounts.clojure = (info.dependencyCounts.clojure ?? 0) + deps.length
      for (const dep of deps) {
        const name = CLOJURE_TECH[dep]
        if (name) info.technologies.push({ name, ecosystem: 'clojure', source: path })
      }
    } else if (path === '.terraform.lock.hcl') {
      const providers = terraformLockProviders(text)
      info.dependencyCounts.terraform = providers.length
      for (const provider of providers) {
        const name = TERRAFORM_TECH[provider]
        if (name) info.technologies.push({ name, ecosystem: 'terraform', source: path })
      }
    } else if (path === 'project.clj') {
      const proj = projectCljInfo(text)
      info.dependencyCounts.clojure = (info.dependencyCounts.clojure ?? 0) + proj.dependencies.length
      if (!info.projectName && proj.name) info.projectName = proj.name
      if (!info.projectVersion && proj.version) info.projectVersion = proj.version
      for (const dep of proj.dependencies) {
        const name = CLOJURE_TECH[dep]
        if (name) info.technologies.push({ name, ecosystem: 'clojure', source: path })
      }
    } else if (path === 'CMakeLists.txt' || path.endsWith('/CMakeLists.txt')) {
      const packages = cmakePackages(text)
      // 根清单 + 嵌套子项目清单：依赖按出现次数累加，技术名在末尾统一去重
      info.dependencyCounts.cmake = (info.dependencyCounts.cmake ?? 0) + packages.length
      if (path === 'CMakeLists.txt' && !info.projectName) info.projectName = cmakeProjectName(text)
      for (const pkg of packages) {
        const name = CMAKE_TECH[pkg]
        if (name) info.technologies.push({ name, ecosystem: 'cmake', source: path })
      }
    }
    // pyproject.toml：依赖段形态多样，当前只计入元数据，不做技术映射
    //（识别放后续迭代，避免错误结论）
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
