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
import { repowikiGenerateTool, sanitizeSources } from '../src/tool-generate.js'
import { repowikiMemoryTool } from '../src/tool-memory.js'
import { withLock } from '../src/lock.js'
import { writeCard, writeWikiPage } from '../src/knowledge.js'
import { encodeFrontmatter } from '../src/util.js'

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
 * @param {Record<string, object|Function>} byLabel - label → 子代理结果
 *   （函数形式可按调用次数返回不同结果，用于重试测试）。
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
        const entry = byLabel[spec.label]
        const value = typeof entry === 'function' ? entry(spec) : entry
        return {
          result: Promise.resolve(value
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
  // 项目清单：让抽取 prompt 带上项目名与技术栈上下文
  nodefs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo', dependencies: { react: '^18' } }))
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
  assert.match(activationSpecs[0].prompt[0].text, /Project: demo \(React\)/, 'prompt 应含项目与技术栈上下文')

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

  assert.deepStrictEqual(out.pages, ['architecture', 'overview'], '应写架构页与 overview 页')
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

test('repowiki-generate execute：输入未变时跳过合成，force 强制重跑', async () => {
  const { ctx, dir, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult([{
      title: '项目概览', slug: 'overview',
      overview: '这是概览正文。',
      sections: [{ heading: '核心模块', body: '核心模块正文。' }],
      mermaid: '',
    }]),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const generate = repowikiGenerateTool(ctx)
  const first = await generate.execute({ locale: 'zh' }, fakeExec)
  assert.deepEqual(first.pages, ['architecture', 'overview'])
  const dispatched = activationSpecs.length

  // 卡片与记忆都没变：清单指纹一致 → 不派发模型
  const second = await generate.execute({ locale: 'zh' }, fakeExec)
  assert.equal(second.skippedFresh, true, '输入未变应短路')
  assert.deepEqual(second.pages, ['architecture', 'overview'])
  assert.strictEqual(activationSpecs.length, dispatched, '跳过时不派发模型')
  assert.match(generate.output.render({}, second)[0].text, /up to date/)

  // 已采信记忆变化属于输入变化 → 重新合成
  const memDir = path.join(dir, '.dsh-repowiki/memory/zh')
  nodefs.mkdirSync(memDir, { recursive: true })
  nodefs.writeFileSync(path.join(memDir, 'convention.md'), [
    '---',
    JSON.stringify({
      schemaVersion: 1, kind: 'memory', title: '约定', tags: [],
      status: 'accepted', createdAt: '2026-11-27T00:00:00.000Z',
    }),
    '---',
    '# 约定',
    '',
    '统一使用中文注释。',
    '',
  ].join('\n'))
  const afterMemory = await generate.execute({ locale: 'zh' }, fakeExec)
  assert.equal(afterMemory.skippedFresh, undefined, '记忆变化不应跳过')
  assert.strictEqual(activationSpecs.length, dispatched + 1)
  assert.equal(afterMemory.memoriesRead, 1)

  // force 忽略指纹，强制重新合成
  const forced = await generate.execute({ locale: 'zh', force: true }, fakeExec)
  assert.equal(forced.skippedFresh, undefined)
  assert.strictEqual(activationSpecs.length, dispatched + 2)
})

test('repowiki-generate execute：索引边变化（卡片不变）不再短路', async () => {
  const { ctx, dir, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult([{
      title: '项目概览', slug: 'overview',
      overview: '这是概览正文。',
      sections: [{ heading: '核心模块', body: '核心模块正文。', sources: ['a.ts#L1-L1'] }],
      mermaid: '',
    }]),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const generate = repowikiGenerateTool(ctx)
  await generate.execute({ locale: 'zh' }, fakeExec)
  const dispatched = activationSpecs.length

  // 只改索引边（模拟配置清单解析变化），卡片与引用源码都未变
  const indexPath = path.join(dir, '.dsh-repowiki/index.json')
  const index = JSON.parse(nodefs.readFileSync(indexPath, 'utf8'))
  index.edges = [{ from: 'a.ts', to: 'b.ts', kind: 'import', line: 1, symbols: [] }]
  nodefs.writeFileSync(indexPath, JSON.stringify(index, null, 2))

  const again = await generate.execute({ locale: 'zh' }, fakeExec)
  assert.equal(again.skippedFresh, undefined, '结构指纹变化不得短路')
  // 引用漂移只在 fresh 短路路径核对；此处结构已变，直接重新合成
  assert.equal(again.citationDrift, undefined)
  assert.strictEqual(activationSpecs.length, dispatched + 1, '结构变化应重新派发模型')
})

test('repowiki-generate execute：被引用源码变化会打破 fresh 跳过', async () => {
  const { ctx, dir, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult([{
      title: '项目概览', slug: 'overview',
      overview: '这是概览正文。',
      sections: [{ heading: '核心模块', body: '核心模块正文。', sources: ['a.ts#L1-L1'] }],
      mermaid: '',
    }]),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const generate = repowikiGenerateTool(ctx)
  const first = await generate.execute({ locale: 'zh' }, fakeExec)
  assert.deepEqual(first.pages, ['architecture', 'overview'])
  // 架构页会额外引用 fan-in/核心文件，精确条数不再是 1；断言口径不变
  assert.equal(first.citationCoverage.untracked, 0)
  assert.equal(first.citationCoverage.hasDigests, true)
  assert.ok(first.citationCoverage.total >= 1)
  assert.deepEqual(first.citationCoverage.reasons, { unreadable: 0, range: 0, cap: 0, unknown: 0 })
  const dispatched = activationSpecs.length

  // 卡片、记忆与引用源码均未变：短路且指纹可验证
  const second = await generate.execute({ locale: 'zh' }, fakeExec)
  assert.equal(second.skippedFresh, true)
  assert.equal(second.citationDrift, 0)
  assert.equal(second.citationCoverage.untracked, 0)
  assert.equal(second.citationCoverage.hasDigests, true)
  assert.ok(second.citationCoverage.total >= 1)
  assert.strictEqual(activationSpecs.length, dispatched, '跳过时不派发模型')

  // 只改被引用源码，不动卡片：内容指纹变化 → 不再短路
  nodefs.writeFileSync(path.join(dir, 'a.ts'), 'export function parse() { return 1 }\n')
  const third = await generate.execute({ locale: 'zh' }, fakeExec)
  assert.equal(third.skippedFresh, undefined)
  assert.ok(third.citationDrift >= 1, '被改文件在主题页与架构页各有一条引用')
  assert.strictEqual(activationSpecs.length, dispatched + 1, '引用漂移时重新派发模型')
  assert.match(third.hint ?? '', /cited source\(s\) changed/)
  assert.match(generate.output.render({}, third)[0].text, /cited source\(s\) changed/)
})

test('repowiki-generate execute：越界引用未覆盖原因为 range', async () => {
  const { ctx, dir } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult([{
      title: '项目概览', slug: 'overview',
      overview: '这是概览正文。',
      sections: [{
        heading: '核心模块', body: '核心模块正文。',
        sources: ['a.ts#L1-L1', 'b.ts#L99-L100'],
      }],
      mermaid: '',
    }]),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const generate = repowikiGenerateTool(ctx)
  const out = await generate.execute({ locale: 'zh' }, fakeExec)

  assert.equal(out.citationCoverage.untracked, 1, '越界引用不计入指纹覆盖')
  assert.equal(out.citationCoverage.hasDigests, true)
  assert.equal(out.citationCoverage.reasons.range, 1)
  assert.ok(out.citationCoverage.tracked >= 1, '架构页引用也应有指纹')
  const manifest = JSON.parse(
    nodefs.readFileSync(path.join(dir, '.dsh-repowiki/wiki/zh/_index.json'), 'utf8'),
  )
  const themeEntry = manifest.pages.find(page => page.slug === 'overview')
  assert.equal(themeEntry.citationMisses['b.ts#L99-L100'], 'range')
  assert.match(generate.output.render({}, out)[0].text, /1 invalid range/)
})

test('repowiki-generate execute：引用无法验证时保守重合成', async () => {
  const { ctx, dir, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult([{
      title: '项目概览', slug: 'overview',
      overview: '这是概览正文。',
      sections: [{ heading: '核心模块', body: '核心模块正文。', sources: ['a.ts#L1-L1'] }],
      mermaid: '',
    }]),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const generate = repowikiGenerateTool(ctx)
  await generate.execute({ locale: 'zh' }, fakeExec)
  const dispatched = activationSpecs.length

  // 删除被引用源码：指纹无法重算 → 不把清单冒充为最新
  nodefs.unlinkSync(path.join(dir, 'a.ts'))
  const second = await generate.execute({ locale: 'zh' }, fakeExec)
  assert.equal(second.skippedFresh, undefined)
  assert.strictEqual(activationSpecs.length, dispatched + 1, '未验证引用不得短路')
  assert.match(second.hint ?? '', /could not be verified/)
  assert.deepEqual(second.citationCoverage, {
    total: 1, tracked: 0, untracked: 1, hasDigests: false,
    reasons: { unreadable: 1, range: 0, cap: 0, unknown: 0 },
  })
  assert.match(generate.output.render({}, second)[0].text, /1 untracked \(1 unreadable\)/)
})

test('repowiki-generate execute：旧清单无指纹时保持原短路行为', async () => {
  const { ctx, dir, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult([{
      title: '项目概览', slug: 'overview',
      overview: '这是概览正文。',
      sections: [{ heading: '核心模块', body: '核心模块正文。', sources: ['a.ts#L1-L1'] }],
      mermaid: '',
    }]),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const generate = repowikiGenerateTool(ctx)
  await generate.execute({ locale: 'zh' }, fakeExec)
  const dispatched = activationSpecs.length

  // 模拟 v2 清单：移除引用指纹，短路口径回到"只验证卡片/记忆"
  const manifestPath = path.join(dir, '.dsh-repowiki/wiki/zh/_index.json')
  const manifest = JSON.parse(nodefs.readFileSync(manifestPath, 'utf8'))
  manifest.schemaVersion = 2
  for (const page of manifest.pages) delete page.citationDigests
  nodefs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

  const second = await generate.execute({ locale: 'zh' }, fakeExec)
  assert.equal(second.skippedFresh, true)
  assert.equal(second.citationDrift, undefined, '无指纹不得声称已验证')
  assert.deepEqual(second.citationCoverage, {
    total: 1, tracked: 0, untracked: 1, hasDigests: false,
    reasons: { unreadable: 0, range: 0, cap: 0, unknown: 1 },
  })
  assert.match(second.hint ?? '', /0\/1 cited source\(s\) verified; 1 have no content digest/)
  assert.match(generate.output.render({}, second)[0].text, /0\/1 cited source\(s\) verified/)
  assert.strictEqual(activationSpecs.length, dispatched, '旧清单仍可短路')
})

test('repowiki-extract execute：子代理返回不可用卡片时记 failed（诊断可读）', async () => {
  const { ctx } = await makeIndexedCtx({
    'repowiki-extract': { structured: { title: '半成品' }, stopReason: 'complete' },
  })
  const out = await repowikiExtractTool(ctx).execute({ locale: 'zh', attempts: 1 }, fakeExec)
  assert.strictEqual(out.extracted, 0)
  assert.strictEqual(out.failed.length, 2, '每个候选文件一次失败记录')
  assert.ok(out.failed[0].reason.includes('complete'), '失败原因应含 stopReason 便于诊断')
})

test('repowiki-extract execute：exec.signal 已 abort 时停止派发（取消语义）', async () => {
  // F3 回归：超时/取消后不应继续对剩余候选逐个派发子代理（烧 LLM 成本
  // 并产出误导性 failed 清单）
  const { ctx } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
  })
  const ac = new AbortController()
  ac.abort()
  const abortedExec = { signal: ac.signal, agent: fakeExec.agent }
  const out = await repowikiExtractTool(ctx).execute({ locale: 'zh' }, abortedExec)
  assert.strictEqual(out.extracted, 0, '取消后不应写卡')
  assert.deepStrictEqual(out.failed, [], '取消不应把候选记为 failed')
  assert.match(out.hint, /Cancelled/, '应返回取消提示')
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
  const out = await repowikiGenerateTool(ctx).execute({ locale: 'zh', attempts: 1 }, fakeExec)
  assert.deepStrictEqual(out.pages, ['architecture'], '主题页为空时仍写出确定性架构页')
  assert.ok(out.hint, '空页面输出应给出诊断提示')
  assert.strictEqual(out.cardsRead, 2, '仍应报告读取的卡片数')
  assert.equal(out.attempts, 1)
  assert.equal(out.retried, 0, 'attempts=1 不重试')
})

test('repowiki-generate execute：主题合成空输出按退避重试后成功', async () => {
  let calls = 0
  const { ctx, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': () => {
      calls++
      return calls === 1
        ? { structured: { pages: [] }, stopReason: 'incomplete' }
        : generateResult([{
          title: '项目概览', slug: 'overview',
          overview: '这是概览正文。',
          sections: [{ heading: '核心模块', body: '核心模块正文。' }],
          mermaid: '',
        }])
    },
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const out = await repowikiGenerateTool(ctx).execute({ locale: 'zh' }, fakeExec)

  assert.deepEqual(out.pages, ['architecture', 'overview'], '第二次尝试写入页面')
  assert.equal(out.attempts, 2)
  assert.equal(out.retried, 1)
  assert.equal(out.hint, undefined, '重试成功后不保留失败 hint')
  assert.equal(activationSpecs.filter(spec => spec.label === 'repowiki-generate').length, 2)
})

test('repowiki-extract/generate：LLM 在锁外派发，写盘等待锁（O5 修订）', async () => {
  const { ctx, dir, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult([{
      title: '项目概览', slug: 'overview',
      overview: '这是概览正文。',
      sections: [{ heading: '核心模块', body: '核心模块正文。' }],
      mermaid: '',
    }]),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const dispatched = activationSpecs.length
  assert.strictEqual(dispatched, 2, '前置抽取应派发两次')

  let openGate
  const gate = new Promise((resolve) => { openGate = resolve })
  const holder = withLock(dir, () => gate)
  const extracting = repowikiExtractTool(ctx).execute({ locale: 'zh', force: true }, fakeExec)
  const generating = repowikiGenerateTool(ctx).execute({ locale: 'zh' }, fakeExec)
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.strictEqual(activationSpecs.length, dispatched + 2,
    'extract 首个候选 + generate 各派发一次；后续候选被写锁挡住前不派发')
  const wikiPath = path.join(dir, '.dsh-repowiki/wiki/zh/overview.md')
  assert.equal(nodefs.existsSync(wikiPath), false, '锁释放前不得写 Wiki')

  openGate()
  await holder
  const [extractOut, generateOut] = await Promise.all([extracting, generating])
  assert.strictEqual(extractOut.extracted, 2, 'force 重新抽取并等待锁后写卡')
  assert.deepStrictEqual(generateOut.pages, ['architecture', 'overview'])
  assert.ok(nodefs.existsSync(wikiPath), '锁释放后应写 Wiki')
})

test('repowiki-extract execute：LLM 期间出现新鲜卡片时跳过写入（二次判定）', async () => {
  const dir = makeProjectDir()
  const made = makeCtx(dir, {})
  await repowikiIndexTool(made.ctx).execute({}, fakeExec)
  const index = JSON.parse(nodefs.readFileSync(path.join(dir, '.dsh-repowiki/index.json'), 'utf8'))
  const file = index.files.find(f => f.path === 'a.ts')
  assert.ok(file, '索引应含 a.ts')

  let injected = false
  made.ctx.subagents.startActivation = async () => {
    if (!injected) {
      injected = true
      // 模拟并发写者：LLM 调用期间写入一张与索引 digest 一致的新鲜卡片
      const md = `${encodeFrontmatter({
        schemaVersion: 1,
        path: 'a.ts',
        lang: 'typescript',
        locale: 'zh',
        sourceDigest: file.digest,
        title: '并发卡',
        tags: [],
        manuallyEdited: false,
        generatedAt: 'now',
      })}\n# 并发卡\n`
      await writeCard(made.ctx.fs, dir, 'a.ts', 'zh', md)
    }
    return {
      result: Promise.resolve({ structured: fakeCard(), stopReason: 'complete' }),
      dispose: async () => {},
    }
  }

  const out = await repowikiExtractTool(made.ctx).execute({ locale: 'zh' }, fakeExec)
  assert.strictEqual(out.extracted, 1, 'b.ts 正常写卡')
  assert.strictEqual(out.skippedExisting, 1, 'a.ts 被并发写入的新鲜卡片拦截')
  const cardText = nodefs.readFileSync(path.join(dir, '.dsh-repowiki/knowledge/zh/a.md'), 'utf8')
  assert.match(cardText, /并发卡/, '不得覆盖并发写入的卡片')
})

test('sanitizeSources：仅保留白名单相对路径与合法行号范围', () => {
  const known = new Set(['src/a.ts', 'src/b.js'])
  assert.deepStrictEqual(sanitizeSources([
    'src/a.ts', '`src/a.ts#L12-L40`', 'src/b.js#L3', 'src/missing.ts',
    '../etc/passwd', 'src/a.ts#Lx', 'src/a.ts\n- evil', 42,
  ], known), ['src/a.ts', 'src/a.ts#L12-L40', 'src/b.js#L3'])
})

test('repowiki-generate execute：章节引用按白名单净化后渲染', async () => {
  const { ctx, dir } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult([{
      title: '架构', slug: 'architecture',
      overview: '项目架构。',
      sections: [
        { heading: '核心模块', body: '核心模块正文。', sources: ['a.ts', 'a.ts#L1-L4', 'missing.ts', '../evil.ts'] },
        { heading: '数据流', body: '数据流正文。', sources: ['b.ts'] },
      ],
      mermaid: '',
    }]),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const out = await repowikiGenerateTool(ctx).execute({ locale: 'zh' }, fakeExec)
  // 确定性架构页占据固定 slug，主题页同名被去重改名
  assert.deepStrictEqual(out.pages, ['architecture', 'architecture-2'])
  assert.deepStrictEqual(out.renamed, [{ from: 'architecture', to: 'architecture-2' }])

  const md = nodefs.readFileSync(path.join(dir, '.dsh-repowiki/wiki/zh/architecture-2.md'), 'utf8')
  assert.ok(md.includes('本文引用的文件'), '应渲染页级引用块')
  assert.ok(md.includes('- `a.ts`'), '白名单路径保留')
  assert.ok(md.includes('`a.ts#L1-L4`'), '合法行号范围保留')
  assert.ok(!md.includes('missing.ts'), '未知路径被丢弃')
  assert.ok(!md.includes('../evil.ts'), '穿越路径被丢弃')
  assert.ok(md.includes('## 目录'), '多节页面应生成目录')
  assert.ok(md.includes('章节来源'), '每节应渲染章节来源')

  // 固定 slug 的架构页仍由确定性生成逻辑产出
  const deterministic = nodefs.readFileSync(path.join(dir, '.dsh-repowiki/wiki/zh/architecture.md'), 'utf8')
  assert.match(deterministic, /确定性生成/)
  assert.match(deterministic, /## 总览/)
})

test('repowiki-extract execute：写 knowledge/<locale>/_index.json 模块→卡片清单', async () => {
  const { ctx, dir } = await makeIndexedCtx({ 'repowiki-extract': extractResult() })
  const out = await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.strictEqual(out.knowledgeIndex, '.dsh-repowiki/knowledge/zh/_index.json')

  const manifest = JSON.parse(nodefs.readFileSync(path.join(dir, out.knowledgeIndex), 'utf8'))
  assert.strictEqual(manifest.schemaVersion, 2, '清单 v2 带最近运行快照')
  assert.strictEqual(manifest.locale, 'zh')
  const root = manifest.modules.find(m => m.path === '.')
  assert.ok(root, '应含根模块')
  assert.deepStrictEqual(root.cards, ['a', 'b'], '根目录卡片按 slug 排序')
  assert.equal(manifest.lastRun.extracted, 2)
  assert.equal(manifest.lastRun.failed, 0)
  assert.equal(manifest.lastRun.retried, 0)
  assert.equal(manifest.lastRun.concurrency, 1)
  assert.equal(manifest.lastRun.attempts, 2)
  assert.ok(manifest.lastRun.durationMs >= 0)
})

test('repowiki-generate execute：重复 slug 自动去重并报告 renamed', async () => {
  const { ctx, dir } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult([
      { title: 'A', slug: 'overview', overview: 'a', sections: [{ heading: 'h', body: 'a' }], mermaid: '' },
      { title: 'B', slug: 'overview', overview: 'b', sections: [{ heading: 'h', body: 'b' }], mermaid: '' },
    ]),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const out = await repowikiGenerateTool(ctx).execute({ locale: 'zh' }, fakeExec)

  assert.deepStrictEqual(out.pages, ['architecture', 'overview', 'overview-2'])
  assert.deepStrictEqual(out.renamed, [{ from: 'overview', to: 'overview-2' }])
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki/wiki/zh/overview.md')))
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki/wiki/zh/overview-2.md')))
})

test('repowiki-generate execute：单页写失败不阻断其它页（failed 上报）', async () => {
  const { ctx, dir } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult([
      { title: 'Good', slug: 'good', overview: 'ok', sections: [{ heading: 'h', body: 'b' }], mermaid: '' },
      { title: 'Bad', slug: 'bad', overview: 'bad', sections: [{ heading: 'h', body: 'b' }], mermaid: '' },
    ]),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const fs = ctx.fs
  const write = fs.writeText.bind(fs)
  fs.writeText = async (target, content) => {
    if (String(target.displayPath).includes('bad.md')) throw new Error('disk full')
    return write(target, content)
  }

  const out = await repowikiGenerateTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.deepStrictEqual(out.pages, ['architecture', 'good'])
  assert.strictEqual(out.failed.length, 1)
  assert.strictEqual(out.failed[0].slug, 'bad')
  assert.match(out.failed[0].reason, /disk full/)
  assert.equal(nodefs.existsSync(path.join(dir, '.dsh-repowiki/wiki/zh/good.md')), true)
  assert.equal(nodefs.existsSync(path.join(dir, '.dsh-repowiki/wiki/zh/bad.md')), false)
})

test('repowiki-generate execute：孤儿页只报告不删除', async () => {
  const { ctx, dir } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult([
      { title: 'Overview', slug: 'overview', overview: 'o', sections: [{ heading: 'h', body: 'b' }], mermaid: '' },
    ]),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  await writeWikiPage(ctx.fs, dir, 'legacy', 'zh', '# Legacy\n\nold page\n')
  const out = await repowikiGenerateTool(ctx).execute({ locale: 'zh' }, fakeExec)

  assert.deepStrictEqual(out.pages, ['architecture', 'overview'])
  assert.deepStrictEqual(out.orphaned, ['legacy'])
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki/wiki/zh/legacy.md')), '孤儿页保留')
})

test('repowiki-generate execute：卡片/记忆超限时诚实上报 truncated', async () => {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-llm-'))
  const made = makeCtx(dir, {
    'repowiki-generate': generateResult([
      { title: 'Overview', slug: 'overview', overview: 'o', sections: [{ heading: 'h', body: 'b' }], mermaid: '' },
    ]),
  })
  const cardDir = path.join(dir, '.dsh-repowiki', 'knowledge', 'zh')
  nodefs.mkdirSync(cardDir, { recursive: true })
  for (let i = 0; i < 201; i++) {
    const meta = {
      schemaVersion: 1, path: `f${i}.ts`, lang: 'typescript', locale: 'zh',
      sourceDigest: '', title: `File ${i}`, tags: [], manuallyEdited: false, generatedAt: 'now',
    }
    nodefs.writeFileSync(path.join(cardDir, `f${i}.md`), `${encodeFrontmatter(meta)}\n# File ${i}\n`)
  }

  const out = await repowikiGenerateTool(made.ctx).execute({ locale: 'zh' }, fakeExec)
  assert.strictEqual(out.cardsRead, 200)
  assert.strictEqual(out.cardsTruncated, 1)
  assert.strictEqual(out.memoriesTruncated, 0)
})

test('repowiki-generate execute：granularity=module 确定性生成模块页与清单（无 LLM）', async () => {
  const { ctx, dir, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const dispatched = activationSpecs.length

  const out = await repowikiGenerateTool(ctx).execute({ locale: 'zh', granularity: 'module' }, fakeExec)
  assert.strictEqual(activationSpecs.length, dispatched, 'module 模式不得派发子代理')
  assert.deepStrictEqual(out.pages, ['architecture', 'modules/root'])
  assert.strictEqual(out.cardsRead, 2)
  assert.strictEqual(out.memoriesRead, 0)

  const pagePath = path.join(dir, '.dsh-repowiki/wiki/zh/modules/root.md')
  const pageText = nodefs.readFileSync(pagePath, 'utf8')
  assert.match(pageText, /"inputDigest": "[0-9a-f]{16}"/)
  assert.match(pageText, /模块组成/)
  assert.match(pageText, /关键符号/)

  const manifestPath = path.join(dir, '.dsh-repowiki/wiki/zh/_index.json')
  const manifest = JSON.parse(nodefs.readFileSync(manifestPath, 'utf8'))
  assert.strictEqual(manifest.schemaVersion, 3, '清单 v3 记录章节级引用与内容指纹')
  assert.match(manifest.inputDigest, /^[0-9a-f]{16}$/)
  assert.strictEqual(manifest.pages.length, 2, '架构页 + 模块页')
  const moduleEntry = manifest.pages.find(page => page.slug === 'modules/root')
  assert.ok(moduleEntry, '清单应登记模块页')
  assert.strictEqual(moduleEntry.path, 'wiki/zh/modules/root.md')
  assert.ok(Array.isArray(moduleEntry.sections), '清单应含 sections 数组')
  assert.ok(moduleEntry.sections.every(s => typeof s.heading === 'string' && Array.isArray(s.sources)))
  const architectureEntry = manifest.pages.find(page => page.slug === 'architecture')
  assert.ok(architectureEntry, '清单应登记确定性架构页')
  assert.strictEqual(architectureEntry.path, 'wiki/zh/architecture.md')
  assert.ok(architectureEntry.sections.some(section => section.heading === '总览'), '架构页含总览节')
  const citationDigests = moduleEntry.citationDigests
  assert.ok(citationDigests && typeof citationDigests === 'object', '清单记录引用内容指纹')
  assert.ok('a.ts' in citationDigests && 'b.ts' in citationDigests, '模块页源文件均有指纹')
  for (const value of Object.values(citationDigests)) assert.match(value, /^[0-9a-f]{12}$/)
  assert.deepEqual(manifest.failed, [], '无失败页时清单记录空数组')
  assert.strictEqual(manifest.failedTotal, 0)
  assert.strictEqual(out.manifest, '.dsh-repowiki/wiki/zh/_index.json')
})

test('repowiki-extract execute：concurrency 有界并发且默认串行', async () => {
  const dir = makeProjectDir()
  const made = makeCtx(dir, {})
  let active = 0
  let maxActive = 0
  made.ctx.subagents.startActivation = async () => {
    active++
    maxActive = Math.max(maxActive, active)
    await new Promise(resolve => setTimeout(resolve, 20))
    active--
    return { result: Promise.resolve(extractResult()), dispose: async () => {} }
  }
  await repowikiIndexTool(made.ctx).execute({}, fakeExec)

  const parallel = await repowikiExtractTool(made.ctx).execute({ locale: 'zh', concurrency: 2 }, fakeExec)
  assert.equal(parallel.concurrency, 2)
  assert.equal(parallel.extracted, 2)
  assert.equal(maxActive, 2, '两个候选应同时在飞')

  active = 0
  maxActive = 0
  const serial = await repowikiExtractTool(made.ctx).execute({ locale: 'zh', force: true }, fakeExec)
  assert.equal(serial.concurrency, 1)
  assert.equal(serial.extracted, 2)
  assert.equal(maxActive, 1, '默认并发为 1')
})

test('repowiki-extract execute：失败按退避重试并在下次成功', async () => {
  const dir = makeProjectDir()
  const made = makeCtx(dir, {})
  const attemptsByPath = new Map()
  made.ctx.subagents.startActivation = async (spec) => {
    const fileLine = /^File: (.+)$/m.exec(spec.prompt[0].text)
    const key = fileLine?.[1] ?? 'unknown'
    const attempt = (attemptsByPath.get(key) ?? 0) + 1
    attemptsByPath.set(key, attempt)
    if (attempt === 1) throw new Error('transient upstream error')
    return { result: Promise.resolve(extractResult()), dispose: async () => {} }
  }
  await repowikiIndexTool(made.ctx).execute({}, fakeExec)

  const out = await repowikiExtractTool(made.ctx).execute(
    { locale: 'zh', attempts: 2, concurrency: 2 },
    fakeExec,
  )
  assert.equal(out.extracted, 2, '两个文件都应在重试后成功')
  assert.deepEqual(out.failed, [])
  assert.equal(out.retried, 2, '每个文件各重试一次')
  assert.equal(out.attempts, 2)
})

test('repowiki-extract execute：模型明确 skip 不重试', async () => {
  const { ctx, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': {
      structured: { ...fakeCard(), skip: true, skipReason: 'generated file' },
      stopReason: 'complete',
    },
  })
  const out = await repowikiExtractTool(ctx).execute({ locale: 'zh', attempts: 3 }, fakeExec)
  assert.equal(activationSpecs.length, 2, '每个文件只调用一次，skip 不重试')
  assert.equal(out.retried, 0)
  assert.equal(out.failed.length, 2)
})

test('repowiki-extract execute：locales 逐语言抽取并分语言汇报', async () => {
  const { ctx, dir, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
  })
  const out = await repowikiExtractTool(ctx).execute({ locales: ['zh', 'en', 'fr', 'zh'] }, fakeExec)

  assert.deepStrictEqual(out.locales, ['zh', 'en'], '非法值与重复值被过滤')
  assert.strictEqual(out.byLocale.length, 2)
  assert.strictEqual(out.extracted, 2, '顶层计数镜像首个 locale')
  assert.strictEqual(out.byLocale[0].extracted, 2)
  assert.strictEqual(out.byLocale[1].extracted, 2)
  assert.strictEqual(activationSpecs.length, 4, '两个文件 × 两个 locale')
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki/knowledge/zh/a.md')))
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki/knowledge/en/a.md')))
  assert.strictEqual(out.byLocale[0].knowledgeIndex, '.dsh-repowiki/knowledge/zh/_index.json')
  assert.strictEqual(out.byLocale[1].knowledgeIndex, '.dsh-repowiki/knowledge/en/_index.json')

  // 二次运行：两个 locale 都应跳过未变卡片
  const again = await repowikiExtractTool(ctx).execute({ locales: ['zh', 'en'] }, fakeExec)
  assert.strictEqual(again.byLocale[0].skippedExisting, 2)
  assert.strictEqual(again.byLocale[1].skippedExisting, 2)
  assert.strictEqual(activationSpecs.length, 4, '跳过不派发新子代理')
})

test('repowiki-generate execute：locales 每语言一次主题页合成并写各自目录', async () => {
  const pages = [{
    title: '概览',
    slug: 'overview',
    overview: '项目概览',
    sections: [{ heading: '组成', body: '正文', sources: ['a.ts'] }],
    mermaid: '',
  }]
  const { ctx, dir, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult(pages),
  })
  await repowikiExtractTool(ctx).execute({ locales: ['zh', 'en'] }, fakeExec)
  const before = activationSpecs.length

  const out = await repowikiGenerateTool(ctx).execute({ locales: ['zh', 'en'] }, fakeExec)
  assert.deepStrictEqual(out.locales, ['zh', 'en'])
  assert.strictEqual(out.byLocale.length, 2)
  assert.deepStrictEqual(out.pages, ['architecture', 'overview'], '顶层页面镜像首个 locale')
  assert.deepStrictEqual(out.byLocale[1].pages, ['architecture', 'overview'])
  assert.strictEqual(activationSpecs.length - before, 2, '每个 locale 一次主题页合成')
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki/wiki/zh/overview.md')))
  assert.ok(nodefs.existsSync(path.join(dir, '.dsh-repowiki/wiki/en/overview.md')))
  assert.strictEqual(out.byLocale[0].manifest, '.dsh-repowiki/wiki/zh/_index.json')
  assert.strictEqual(out.byLocale[1].manifest, '.dsh-repowiki/wiki/en/_index.json')
})

test('repowiki-generate execute：已采信记忆进入生成 prompt', async () => {
  const pages = [{ title: '概览', slug: 'overview', overview: 'x', sections: [], mermaid: '' }]
  const { ctx, activationSpecs } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult(pages),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const memory = repowikiMemoryTool(ctx)
  const written = await memory.execute({ action: 'write', title: 'Convention A', body: 'Use tabs.', locale: 'zh' }, fakeExec)
  await memory.execute({ action: 'accept', slug: written.slug, locale: 'zh' }, fakeExec)

  const out = await repowikiGenerateTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.strictEqual(out.memoriesRead, 1)
  const prompt = activationSpecs[activationSpecs.length - 1].prompt[0].text
  assert.match(prompt, /Convention A/, '已采信记忆标题进入 prompt')
  assert.match(prompt, /Use tabs\./, '记忆正文首行进入 prompt')
})

test('repowiki-generate execute：预取消时不写任何 locale 并给出可读 hint', async () => {
  const { ctx } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult([]),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  const ac = new AbortController()
  ac.abort()

  const out = await repowikiGenerateTool(ctx).execute(
    { locales: ['zh', 'en'] },
    { signal: ac.signal, agent: fakeExec.agent },
  )
  assert.strictEqual(out.byLocale.length, 0)
  assert.deepStrictEqual(out.pages, [])
  assert.match(out.hint, /Cancelled/)
})

test('repowiki-extract execute：子代理抛错逐文件记 failed 不中断整轮', async () => {
  const { ctx } = await makeIndexedCtx({ 'repowiki-extract': extractResult() })
  ctx.subagents.startActivation = async () => { throw new Error('boom') }

  const out = await repowikiExtractTool(ctx).execute({ locale: 'zh', attempts: 1 }, fakeExec)
  assert.strictEqual(out.extracted, 0)
  assert.strictEqual(out.failed.length, 2, '两个候选都记失败')
  assert.ok(out.failed.every(f => f.reason === 'boom'))
})

test('repowiki-extract execute：索引外路径卡片为模块清单补占位模块', async () => {
  const { ctx, dir } = await makeIndexedCtx({ 'repowiki-extract': extractResult() })
  await writeCard(ctx.fs, dir, 'other/thing.ts', 'zh', `${encodeFrontmatter({
    schemaVersion: 1, path: 'other/thing.ts', lang: 'typescript', locale: 'zh',
    sourceDigest: 'x', title: '孤儿模块', tags: [], manuallyEdited: false, generatedAt: 'now',
  })}\n# 孤儿模块\n`)

  const out = await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)
  assert.strictEqual(out.orphaned, 1)
  const manifest = JSON.parse(nodefs.readFileSync(path.join(dir, '.dsh-repowiki/knowledge/zh/_index.json'), 'utf8'))
  const placeholder = manifest.modules.find(m => m.path === 'other')
  assert.ok(placeholder, '索引外模块补占位条目')
  assert.deepStrictEqual(placeholder.cards, ['other-thing'])
})

test('repowiki-extract execute：派发中途取消停止后续候选并汇报剩余数', async () => {
  const { ctx } = await makeIndexedCtx({ 'repowiki-extract': extractResult() })
  const ac = new AbortController()
  const original = ctx.subagents
  let calls = 0
  ctx.subagents = {
    async startActivation(spec) {
      const activation = await original.startActivation(spec)
      calls++
      if (calls === 1) ac.abort()
      return activation
    },
  }

  const out = await repowikiExtractTool(ctx).execute(
    { locale: 'zh' },
    { signal: ac.signal, agent: fakeExec.agent },
  )
  assert.strictEqual(out.extracted, 1, '第一个候选完成，后续候选不再派发')
  assert.match(out.hint, /Cancelled during zh/)
})

test('repowiki-generate execute：某 locale 无卡片时其它 locale 仍生成', async () => {
  const pages = [{ title: '概览', slug: 'overview', overview: 'x', sections: [], mermaid: '' }]
  const { ctx } = await makeIndexedCtx({
    'repowiki-extract': extractResult(),
    'repowiki-generate': generateResult(pages),
  })
  await repowikiExtractTool(ctx).execute({ locale: 'zh' }, fakeExec)

  const out = await repowikiGenerateTool(ctx).execute({ locales: ['en', 'zh'] }, fakeExec)
  assert.strictEqual(out.byLocale[0].locale, 'en')
  assert.deepStrictEqual(out.byLocale[0].pages, [])
  assert.match(out.byLocale[0].hint, /No knowledge cards/)
  assert.strictEqual(out.byLocale[1].locale, 'zh')
  assert.deepStrictEqual(out.byLocale[1].pages, ['architecture', 'overview'])
})

test('repowiki-generate prompt：注入跨模块依赖摘要与循环依赖组（来自索引边）', async () => {
  const dir = makeProjectDir()
  const made = makeCtx(dir, { 'repowiki-generate': generateResult([]) })
  await repowikiIndexTool(made.ctx).execute({}, fakeExec)
  const indexPath = path.join(dir, '.dsh-repowiki/index.json')
  const index = JSON.parse(nodefs.readFileSync(indexPath, 'utf8'))
  // 把 b.ts 归入 lib 模块，并补一对双向 import 边（构成循环）
  const b = index.files.find(f => f.path === 'b.ts')
  b.path = 'lib/b.ts'
  b.module = 'lib'
  index.edges = [
    { from: 'a.ts', to: 'lib/b.ts', kind: 'import', line: 1, symbols: [] },
    { from: 'lib/b.ts', to: 'a.ts', kind: 'import', line: 1, symbols: [] },
  ]
  nodefs.writeFileSync(indexPath, JSON.stringify(index))
  // 两张卡片（根模块 + lib 模块）
  for (const [rel, title] of [['a.ts', '入口'], ['lib/b.ts', '工具']]) {
    const md = `${encodeFrontmatter({
      schemaVersion: 1,
      path: rel,
      lang: 'typescript',
      locale: 'zh',
      sourceDigest: 'dig',
      title,
      tags: [],
      manuallyEdited: false,
      generatedAt: 'now',
    })}\n# ${title}\n`
    await writeCard(made.ctx.fs, dir, rel, 'zh', md)
  }
  await repowikiGenerateTool(made.ctx).execute({ locale: 'zh' }, fakeExec)
  const spec = made.activationSpecs.find(s => s.label === 'repowiki-generate')
  assert.match(spec.prompt[0].text, /Module dependencies computed from the index \(2\):/)
  assert.match(spec.prompt[0].text, /- \. → lib \(1 edge\(s\)\)/, '根模块到 lib 的依赖进入 prompt')
  assert.match(spec.prompt[0].text, /Import cycles detected in the index \(1\):/)
  assert.match(spec.prompt[0].text, /- a\.ts ↔ lib\/b\.ts/, '循环组进入 prompt')
  assert.match(spec.prompt[0].text, /- a\.ts ↔ lib\/b\.ts — cycle: a\.ts → lib\/b\.ts → a\.ts/,
    '代表性环路径进入 prompt')
  assert.match(spec.prompt[0].text, /High-fan-in files computed from the index \(2\):/)
  assert.match(spec.prompt[0].text, /- a\.ts \(1 importer\(s\)\)/, 'fan-in hub 进入 prompt')
})
