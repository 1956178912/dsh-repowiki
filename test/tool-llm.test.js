/**
 * repowiki-extract / repowiki-generate 的 execute 主路径测试。
 *
 * 此前套件只覆盖了这两个工具的导出判定函数与渲染层，execute（LLM 派发
 * 主路径）从未被覆盖：真实 spawn 子代理不可用于单测。这里对
 * ctx.subagents.startActivation 做契约级 stub——假子代理返回受约束的
 * 结构化卡片/页面 JSON，验证：
 * - 派发规格（provider/outputSchema/parent/exec.signal）与 spawn 契约一致；
 * - 首次抽取写卡片（frontmatter 含 sourceDigest）；
 * - 二次抽取跳过未变卡片（digest 增量）；
 * - 人工修订保护（manuallyEdited 不被自动刷新）；
 * - Wiki 生成消费卡片写 wiki 页面；无卡片时给出可读 hint。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as nodefs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { makeFakeFs } from './fake-fs.mjs'
import { repowikiIndexTool } from '../src/tool-index.js'
import { repowikiExtractTool } from '../src/tool-extract.js'
import { repowikiGenerateTool } from '../src/tool-generate.js'

/** 假子代理返回的可用卡片（满足 cardOutputSchema + isUsableCard）。 */
const fakeCard = () => ({
  title: '测试卡片',
  summary: '卡片概要文本',
  purpose: '卡片职责文本',
  keySymbols: [{ name: 'main', kind: 'function', note: '入口函数' }],
  pitfalls: [],
  relatedModules: [],
  tags: ['demo'],
  skip: false,
})

/**
 * 假 ctx：fs 介质为临时项目目录，subagents 为按 label 分派的契约级 stub
 * （extract 与 generate 需要不同的结构化输出，同一 ctx 须两者兼容）。
 * @param {string} rootDir - 介质根。
 * @param {Record<string, object>} byLabel - label → 子代理结果。
 */
function makeCtx(rootDir, byLabel) {
  const activationSpecs = []
  const ctx = {
    fs: makeFakeFs(rootDir),
    tools: { register: () => () => {} },
    workingDirectory: { get: () => rootDir },
    subagents: {
      async startActivation(spec) {
        activationSpecs.push(spec)
        return {
          result: Promise.resolve(byLabel[spec.label]
            ?? { structured: undefined, stopReason: 'unhandled-label' }),
          dispose: async () => {},
        }
      },
    },
  }
  return { ctx, activationSpecs }
}

/** 工具 execute 所需的 exec（带 owning agent，供 runSubagent 的 parent）。 */
const fakeExec = { signal: new AbortController().signal, agent: { id: 'owner-session' } }

/** 建一个含两个源文件的临时项目目录（符号数过复杂度阈值 3）。 */
function makeProjectDir() {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-llm-'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'),
    'export function parse() {}\nexport function format() {}\nexport class Parser {}\nexport class Lexer {}\n')
  nodefs.writeFileSync(path.join(dir, 'b.ts'),
    'export function render() {}\nexport function paint() {}\nexport class View {}\n')
  return dir
}

/** 建索引；返回 ctx 与派发规格记录。 */
async function makeIndexedCtx(byLabel) {
  const dir = makeProjectDir()
  const made = makeCtx(dir, byLabel)
  await repowikiIndexTool(made.ctx).execute({}, fakeExec)
  return { ...made, dir }
}

/** extract 路径的假子代理结果。 */
const extractResult = () => ({ structured: fakeCard(), stopReason: 'complete' })

/** generate 路径的假子代理结果。 */
const generateResult = (pages) => ({ structured: { pages }, stopReason: 'complete' })

test('repowiki-extract execute：假子代理派发并写卡片（含派发规格断言）', async () => {
  const { ctx, dir, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
  })
  const out = await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)

  assert.strictEqual(out.extracted, 2, '两张卡片应被抽取')
  assert.deepStrictEqual(out.failed, [])
  assert.ok(out.cardsDir.includes(`.dsh-repowiki/knowledge/zh`))

  // 派发规格与 spawn 契约一致（parent 是 exec.agent、outputSchema 透传）
  assert.strictEqual(activationSpecs.length, 2, '每个候选文件一次 activation')
  assert.strictEqual(activationSpecs[0].provider, 'spawn')
  assert.strictEqual(activationSpecs[0].parent, fakeExec.agent)
  assert.ok(Array.isArray(activationSpecs[0].outputSchema?.required), 'outputSchema 应带 required 契约')
  assert.ok(activationSpecs[0].prompt[0].text.includes('a.ts'), 'prompt 应含源文件路径')

  // 卡片落盘：frontmatter + 正文
  const cardPath = path.join(dir, '.dsh-repowiki/knowledge/zh/a.md')
  const md = nodefs.readFileSync(cardPath, 'utf8')
  assert.ok(md.includes('"title": "测试卡片"'), '卡片 frontmatter 含子代理标题')
  assert.ok(md.includes('"sourceDigest"'), '卡片记 sourceDigest（失效检测用）')
  assert.ok(md.includes('## 概要 / Summary'), '卡片按插件规范渲染正文')
})

test('repowiki-extract execute：未变卡片二次抽取被跳过（digest 增量）', async () => {
  const { ctx, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const dispatched = activationSpecs.length

  const out = await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.strictEqual(out.extracted, 0, '未变文件不应重抽')
  assert.strictEqual(out.skippedExisting, 2, '两张卡片记为跳过')
  assert.strictEqual(activationSpecs.length, dispatched, '跳过不应派发子代理')
})

test('repowiki-extract execute：manuallyEdited 卡片源文件变化也不被覆盖', async () => {
  const { ctx, dir } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)

  // 把 a.ts 的卡片标记为人工修订，再改源文件（保持符号数、digest 变化）并重建索引
  const cardPath = path.join(dir, '.dsh-repowiki/knowledge/zh/a.md')
  const md = nodefs.readFileSync(cardPath, 'utf8')
  nodefs.writeFileSync(cardPath, md.replace('"manuallyEdited": false', '"manuallyEdited": true'))
  nodefs.writeFileSync(path.join(dir, 'a.ts'),
    'export function parse() { return 1 }\nexport function format() {}\nexport class Parser {}\nexport class Lexer {}\n')
  await repowikiIndexTool(ctx).execute({}, fakeExec)

  const out = await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.strictEqual(out.extracted, 0)
  assert.strictEqual(out.skippedManual, 1, '人工卡不被自动刷新')
  assert.strictEqual(out.skippedExisting, 1, 'b.ts 未变化仍记跳过')
  // 人工卡内容保留（标题未被覆盖）
  assert.ok(nodefs.readFileSync(cardPath, 'utf8').includes('"manuallyEdited": true'))
})

test('repowiki-generate execute：消费卡片写 Wiki 页面', async () => {
  const { ctx, dir, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult([{
      title: '项目概览', slug: 'overview',
      overview: '这是概览正文。',
      sections: [{ heading: '核心模块', body: '核心模块正文。' }],
      mermaid: '',
    }]),
  })
  // 先生成卡片，generate 只读卡片不重读源码
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const gen = repowikiGenerateTool(ctx)
  const out = await gen.execute({ locale: 'zh' }, fakeExec)

  assert.deepStrictEqual(out.pages, ['overview'], '应写 overview 页')
  assert.strictEqual(out.cardsRead, 2, '应汇总两张卡片')
  assert.strictEqual(out.memoriesRead, 0)
  const wikiPath = path.join(dir, '.dsh-repowiki/wiki/zh/overview.md')
  const md = nodefs.readFileSync(wikiPath, 'utf8')
  assert.ok(md.includes('"title": "项目概览"'), 'Wiki frontmatter 含标题')
  assert.ok(md.includes('# 项目概览'), 'Wiki 正文含一级标题')
  assert.ok(md.includes('核心模块正文'), 'Wiki 正文含 section 文本')

  // 派发规格：prompt 应含卡片标题与技术栈、parent 为 exec.agent
  const genSpec = activationSpecs[activationSpecs.length - 1]
  assert.strictEqual(genSpec.provider, 'spawn')
  assert.strictEqual(genSpec.parent, fakeExec.agent)
  assert.ok(genSpec.prompt[0].text.includes('测试卡片'), '生成 prompt 应含卡片标题')
})

test('repowiki-extract execute：子代理返回不可用卡片时记 failed（诊断可读）', async () => {
  const { ctx } = await makeIndexedCtx({
    'repowiki-extract': { structured: { title: '半成品' }, stopReason: 'complete' },
  })
  const out = await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.strictEqual(out.extracted, 0)
  assert.strictEqual(out.failed.length, 2, '每个候选文件一次失败记录')
  assert.ok(out.failed[0].reason.includes('complete'), '失败原因应含 stopReason 便于诊断')
})

test('repowiki-extract execute：源文件索引后被删除记 unreadable（不阻断其他文件）', async () => {
  const { ctx, dir } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
  })
  // 索引存在但源文件已删（删除/重命名场景的读失败分支）
  nodefs.unlinkSync(path.join(dir, 'a.ts'))
  const out = await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.strictEqual(out.extracted, 1, 'b.ts 应正常抽取')
  assert.deepStrictEqual(out.failed.map(f => f.path), ['a.ts'], '缺失源文件记 failed')
  assert.strictEqual(out.failed[0].reason, 'source unreadable')
})

test('repowiki-generate execute：无卡片时给出可读提示（hint 分支）', async () => {
  const { ctx } = await makeIndexedCtx({ 'repowiki-generate': generateResult([]) })
  const out = await repowikiGenerateTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.deepStrictEqual(out.pages, [])
  assert.ok(out.hint, '无卡片应返回提示')
  assert.ok(out.hint.includes('repowiki-extract'), '提示应引导先抽取')
})

test('repowiki-generate execute：子代理无页面输出时记 hint 而非空成功', async () => {
  const { ctx } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult([]),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const out = await repowikiGenerateTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.deepStrictEqual(out.pages, [])
  assert.ok(out.hint, '空页面输出应给出诊断提示')
  assert.strictEqual(out.cardsRead, 2, '仍应报告读取的卡片数')
})
