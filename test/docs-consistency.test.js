/**
 * 文档一致性守卫：兼容矩阵声明的资产 schema 版本必须与代码常量一致。
 *
 * 背景：`docs/compatibility.md` 是用户核对“能否读取旧资产”的权威表，
 * 但版本号长期手工维护，曾在索引升到 v6、Wiki 清单升到 v3 后仍停留在
 * v5/v2。这里把文档中的版本数字与 `src/schema.js` 的常量绑定，升级
 * 常量却忘改文档时 CI 直接失败。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CARD_SCHEMA_VERSION, INDEX_SCHEMA_VERSION, KNOWLEDGE_INDEX_SCHEMA_VERSION,
  MEMORY_SCHEMA_VERSION, WIKI_MANIFEST_SCHEMA_VERSION,
} from '../src/schema.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('docs/compatibility.md 的资产版本与代码常量一致', () => {
  const doc = readFileSync(path.join(ROOT, 'docs/compatibility.md'), 'utf8')
  assert.match(doc, new RegExp(`\\| \`index\\.json\` \\| schemaVersion ${INDEX_SCHEMA_VERSION} \\|`),
    `兼容矩阵应声明索引 schemaVersion ${INDEX_SCHEMA_VERSION}`)
  assert.match(doc, new RegExp(`\\| \`knowledge/<locale>/_index\\.json\` \\| ${KNOWLEDGE_INDEX_SCHEMA_VERSION}`),
    `兼容矩阵应声明知识清单版本 ${KNOWLEDGE_INDEX_SCHEMA_VERSION}`)
  assert.match(doc, new RegExp(`\\| \`wiki/<locale>/_index\\.json\` \\| ${WIKI_MANIFEST_SCHEMA_VERSION}`),
    `兼容矩阵应声明 Wiki 清单版本 ${WIKI_MANIFEST_SCHEMA_VERSION}`)
  assert.match(doc, new RegExp(`\\| 卡片 frontmatter \\| ${CARD_SCHEMA_VERSION} \\|`),
    `兼容矩阵应声明卡片版本 ${CARD_SCHEMA_VERSION}`)
  assert.match(doc, new RegExp(`\\| 记忆 frontmatter \\| ${MEMORY_SCHEMA_VERSION} \\|`),
    `兼容矩阵应声明记忆版本 ${MEMORY_SCHEMA_VERSION}`)
})
