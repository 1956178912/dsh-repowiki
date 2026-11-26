/**
 * 卡片与 Wiki 页面的输出契约（outputSchema）。
 *
 * 这些 schema 传给 spawn 子代理的 `startActivation({outputSchema})`，子代理
 * 必须返回受约束 JSON（SubagentResult.structured 经 provider 校验）。
 * schema 形态必须符合 JsonSchemaNode 子集（与手写 ToolDefinition 的
 * output.schema 同一规则：顶层 required 数组；见 ADR-0002 运行时教训）。
 */

import { CARD_SCHEMA_VERSION } from './schema.js'

/**
 * 单张知识卡片的结构化输出。
 * @typedef {Object} CardData
 * @property {string} title - 卡片标题（模块一句话命名）。
 * @property {string} summary - 概要：这张卡片讲什么（2-3 句）。
 * @property {string} purpose - 模块职责。
 * @property {{name:string, kind:string, note:string}[]} keySymbols - 关键符号及一句作用。
 * @property {string[]} pitfalls - 陷阱/注意事项（可为空数组）。
 * @property {string[]} relatedModules - 相关模块（文件名或模块名，可为空）。
 * @property {string[]} tags - 主题标签（如 'indexing'、'ast'）。
 * @property {boolean} skip - true 表示该文件过简不值得生成卡片。
 * @property {string} skipReason - skip 为 true 时的理由。
 */

/**
 * 提取子代理的 outputSchema（卡片结构）。
 * @returns {object} ObjectJsonSchema。
 */
export function cardOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', description: 'One-sentence name of this module, e.g. "Index orchestrator".' },
      summary: { type: 'string', description: 'What this card explains in 2-3 sentences.' },
      purpose: { type: 'string', description: 'The module responsibility in 1-2 sentences.' },
      keySymbols: {
        type: 'array',
        description: 'Key symbols with a one-sentence note each.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            kind: { type: 'string', enum: ['function', 'class', 'method', 'variable', 'interface', 'type'] },
            note: { type: 'string' },
          },
          required: ['name', 'kind', 'note'],
        },
      },
      pitfalls: {
        type: 'array',
        description: 'Traps and caveats proven by the code; empty when none apply.',
        items: { type: 'string' },
      },
      relatedModules: {
        type: 'array',
        description: 'Related file or module names, empty when none apply.',
        items: { type: 'string' },
      },
      tags: {
        type: 'array',
        description: 'Topic tags, e.g. ["indexing", "ast"].',
        items: { type: 'string' },
      },
      skip: { type: 'boolean', description: 'Set true when the file is too simple or generated to deserve a card.' },
      skipReason: { type: 'string', description: 'Why the file was skipped (empty when not skipped).' },
    },
    required: ['title', 'summary', 'purpose', 'keySymbols', 'pitfalls', 'relatedModules', 'tags', 'skip'],
  }
}

/**
 * Wiki 页的结构化输出。
 * @typedef {Object} WikiPageData
 * @property {string} title - 页面标题。
 * @property {string} slug - ASCII kebab 文件名（不含扩展名）。
 * @property {string} overview - 页面概述。
 * @property {{heading:string, body:string}[]} sections - 章节（body 为 Markdown）。
 * @property {string} mermaid - 可选 mermaid 图代码（无则空字符串）。
 */

/**
 * 生成子代理的 outputSchema（页面集合）。
 * @returns {object} ObjectJsonSchema。
 */
export function wikiOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      pages: {
        type: 'array',
        description: 'Wiki pages synthesized from the cards.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            slug: { type: 'string', description: 'ASCII kebab-case file name without extension, e.g. "core-modules".', pattern: '^[a-z0-9-]+$' },
            overview: { type: 'string' },
            sections: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  heading: { type: 'string' },
                  body: { type: 'string', description: 'Markdown body of the section.' },
                },
                required: ['heading', 'body'],
              },
            },
            mermaid: { type: 'string', description: 'Optional mermaid diagram source; empty when none.' },
          },
          required: ['title', 'slug', 'overview', 'sections'],
        },
      },
    },
    required: ['pages'],
  }
}
