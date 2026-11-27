/**
 * ESLint 扁平配置（dev-only）：Node 侧与浏览器侧分别声明全局。
 * 只启用低争议规则，避免风格噪声掩盖真实问题。
 */

import js from '@eslint/js'

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  queueMicrotask: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  fetch: 'readonly',
}

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  AbortController: 'readonly',
  queueMicrotask: 'readonly',
}

export default [
  {
    ignores: [
      'node_modules/**',
      '.dsh-repowiki/**',
      '.trae/**',
      'test/fixtures/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['index.js', 'src/**/*.js', 'scripts/**/*.mjs', 'test/**/*.js', 'test/**/*.mjs'],
    languageOptions: { globals: nodeGlobals },
  },
  {
    files: ['client.js'],
    languageOptions: { globals: browserGlobals },
  },
  {
    // DOM 集成测试直接使用 document/KeyboardEvent 等浏览器全局
    files: ['test/client-*.test.js'],
    languageOptions: { globals: browserGlobals },
  },
  {
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['warn', 'smart'],
    },
  },
]
