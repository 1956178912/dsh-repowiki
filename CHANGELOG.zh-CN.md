# 变更记录（中文摘要）

本文件是 [CHANGELOG.md](CHANGELOG.md) 的中文摘要镜像：英文版为权威记录，
此处每版给出 1–4 条要点。版本遵循 README 路线图的阶段划分。

## [0.36.0] - 2026-11-27

- **macOS 顶部窗口条留白**（v0.35 布局审计同批）：官方 AppFrame CSS
  注明入口页需以 `--dsh-frame-top-clearance`（darwin 48px）补顶部留白，
  否则首行内容被交通灯/侧栏开关压住；两个参照页（插件管理/任务管理）
  均如此。页面根现用 `padding-top: calc(24px + var(--dsh-frame-top-clearance,
  0px))`（无该变量的平台回退原 24px），底部留白加宽到 48px 对齐参照页。
- 漂移自检扩展到 `--dsh-*` 布局令牌（定义源加布局包 AppFrame CSS），
  现追踪 13 个令牌（9 alias + 4 尺寸）。

## [0.35.0] - 2026-11-27

- **修复面板页面无法滑动**（用户反馈"知识库页面无法滑动，导致信息无法
  看见"）：页面根原为普通带 padding 的 div，而宿主 mainPanel 是
  `overflow:hidden` 的 flex 列——页面须自管滚动（从官方 AppFrame CSS 与
  PluginManagerPage 参照页实证：两者用 `height:100%` + `overflow-y:auto`，
  "头部与内容共用一个滚动器"）。页面根现带 `height:100%; box-sizing:
  border-box; overflow-y:auto; overflow-x:hidden`，整个面板可滚动。
  回归断言锁住根元素的滚动声明。

## [0.34.1] - 2026-11-27

- 修复 react-parity 导入 verify 脚本的进程退出副作用：CI 无 asar 时
  exit 3 杀死测试文件；本地有 asar 时 exit 0 造成**假通过**（断言从未
  执行）。脚本现在仅作入口运行时执行 main()，import 无副作用。
  （v0.34.0 tag 落在红提交上，修正在此版。）

## [0.34.0] - 2026-11-27

- **React 版本一致性守卫**（`test/react-parity.test.js`）：`npm outdated`
  提示 react 18.3.1 → latest 19.3.1，不盲目升级——解析 app.asar 证实
  宿主前端 bundle 内嵌 **React 18.3.1**，与 devDependency 精确一致
  （测试侧即运行时同一 API 面，无需追 19）。宿主未来升级分叉时本地
  测试转红，CI 无 asar 时跳过（同令牌漂移自检策略）。
- 核验 `npm audit`：0 漏洞（v0.17.0 的供应链声明历次刷新后仍成立）。
- 141/141。

## [0.33.0] - 2026-11-27

- **O7 卡片 slug 碰撞不再静默覆盖**（v0.32 评审延后项）：cardSlug 把
  'src/a b.js' 与 'src/a-b.js' 都归一为 'src-a-b'，第二张卡曾直接覆盖
  第一张。writeCard 现在先读目标文件 frontmatter，若记录的源路径不同则
  改用源路径 8 位哈希后缀写盘（后缀稳定，重跑不漂移）。
- **O2 复制失败携带原因**（同延后项）：copyTree 返回有界 failed 列表
  （{path, reason}，前 20 条），export/import 工具经 schema 透传并在
  render 中列出——“50 skipped”不再需要猜是哪些、为什么。
- 两条新回归（碰撞双卡落盘/失败明细），140/140。

## [0.32.0] - 2026-11-27

Host 侧独立代码评审（子代理通读全部 22 个 src 模块；记录见
`docs/checkpoints/phase-16-code-review.md`）发现的应修项与观察项：

- **F1 Wiki slug 净化**：LLM 输出的 page.slug 曾直接 posix.join，`../../../../tmp/evil` 可写出资产目录；新增 `wikiSlug()` 白名单净化（在 `wikiPath` 内强制，所有调用方自动安全）+ schema pattern 双重防线。回归：穿越尝试落盘仍在 wiki/<locale>/ 内。
- **F2 `hint` 字段入 schema**：六个工具的降级分支返回 hint 但 schema 声明 `additionalProperties:false`——宿主一旦校验 execute 结果则降级全塌。零行为变更。
- **F3 取消语义**：extract 每次派发子代理前检查 `exec.signal.aborted`（此前超时后继续派发并把剩余候选逐个记 failed，白烧 LLM 成本）；generate 写盘前同检；均返回 `Cancelled: …` 提示。
- **F4 capped 不再撒谎**：文件预算对全部路过文件计数（非仅源码），非源码文件耗尽预算时旧实现 `capped:false` 谎报完整；现以显式 stopped 标志求真。
- **F5 import 描述修正**：overwrite 一直是“合并不删除”，描述却写成 replace；改为如实描述（无行为变更）。
- **F6 memory accept/reject slug 白名单**：write 路径本有 slugifyMemory 净化，accept/reject 没有；不符合白名单的 slug 返回 invalid + hint。
- **O1 copyTree 深度上限 24**、**O6 maxFiles/limit 下界钳制**、**O8 提取 prompt 改四反引号围栏**（源码含 ``` 可逃逸三反引号注入指令）。
- 死代码清理（listKnowledgeFiles 无生产调用方、writeIndex 未用变量）；index.json 的 sizeBytes 注释更正为字符数（字段名保留兼容）。
- 共 4 条新回归（穿越/取消/预算诚实/白名单拒绝），138/138。

## [0.31.0] - 2026-11-26

- **记忆与 Wiki 详情的焦点对齐**（v0.30.0 卡片详情焦点管理的推广）：
  打开记忆条目或 Wiki 页面时聚焦返回按钮，关闭（按钮或 Escape）归还
  焦点。发现并处理了一个结构性差异：这两类详情是整面板切换，触发的列表
  条目会被卸载——直接归还焦点是对已分离节点的空操作（第一版测试恰好
  抓到）。归还前现在检查 `isConnected`，失联回退到对应页签按钮。
- 焦点助手（openWithFocus/closeWithFocus）被三类详情流复用。
- 真实语料 fixture 补记忆条目（memory/zh/ui-panel-state-machine.md），
  使记忆详情的 DOM 焦点回归可测（136/136）。

## [0.30.0] - 2026-11-26

- **详情焦点管理**（v0.27.0 评审留下的无障碍观察项）：打开卡片详情时焦点
  移到详情的关闭按钮（键盘用户可直接操作）；经按钮或 Escape 关闭后焦点
  归还触发的瓦片。焦点捕获用鸭子类型而非全局 `HTMLElement`（DOM 测试
  harness 只注入了 document，`instanceof` 会抛错并被 guard 吞掉——发布前
  测试失败先抓到了这一点）。
- 新增焦点回归测试（真实 click→聚焦关闭按钮→Escape→焦点归还瓦片），
  135/135。

## [0.29.0] - 2026-11-26

- 新增**版本一致性守卫**（`test/pack.test.js`）：package.json 版本必须与
  两份 CHANGELOG 的最新版本条目一致——只 bump 版本不写 changelog 从此是
  测试失败而非静默漂移。（它第一次运行就抓到了自己：我先 bump 了版本、
  还没写条目，套件直接红。）
- README（双语）测试计数 122 → 133（v0.23 以来已过期）。

## [0.28.0] - 2026-11-26

- **圆角改用宿主令牌**（practices.md 要求“复制同类宿主页面的间距/字号/
  行模式”）：审计官方 Plugin Manager 页 CSS，其控件与卡片用
  `--dsw-radius-sm/md`（8/12px，定义于主题包 base.css）。面板硬编码圆角
  现已令牌化：按钮/输入框/代码块 → radius-sm（原 8）、卡片/详情/页容器 →
  radius-md（原 10，与官方卡片圆角一致）、小徽章 → radius-xs（原 4）；
  状态点 50% 与标签 999 保持全圆。令牌缺失时回退原值。
- **漂移自检覆盖全部 `--dsw-*` 令牌**（不再只查 alias：现有 9 alias +
  3 radius = 12 个）。规则分两类：alias 颜色/语义令牌须有深色重定义，
  尺寸令牌存在即可；收集正则不再把文档注释里的 `var(--dsw-alias-*)`
  通配写法误当令牌。

## [0.27.0] - 2026-11-26

- **修复空结果文案 bug**（UI/UX 评审发现）：筛选或搜索为 0 行时面板固定
  渲染“该文件尚未生成知识卡片”，在“已生成/待更新”筛选或搜索无匹配时
  误导用户。现按上下文区分文案（emptySearch 带查询插值、按筛选的
  emptyCards/emptyGenerated/emptyDone/emptyStale），并加回归测试。
- 总览模式在页面重新可见时也刷新统计（此前只刷单库视图，生成完回来
  看到旧数字）；单库未选工作区补引导文案。
- 主按钮文字换官方 `--dsw-alias-label-on-color` 令牌（深色按钮底变浅时
  对比度有对应重定义），漂移自检随之覆盖 9 个令牌。
- test/icon.test.js 增加全出血 tile 断言（补评审指出的测试盲区；居中
  22x22 卡片与官方 forge-bundle 样本一致，保留）。
- 新增 `docs/checkpoints/phase-14-ux-review.md` 评审记录与保留观察项。

## [0.26.0] - 2026-11-26

- **图标对齐官方处理**（按 dsh-doc artwork.md 与两个官方一级样本）：
  - `icon.svg`：原为 96×96 全出血蓝色圆角 tile（官方明令 Plugin Manager
    自绘外框，插件不要画背景）；重绘为 36×36 画布 + 22×22 渐变卡片
    （#69B9FF→#324DE2，与官方 forge-bundle 图标同款）+ 白色书本字形。
  - 侧栏图标 `RepoWikiIcon`：由 96×96 固定配色改为 24×24 currentColor
    描边字形（fill=none），随侧栏文字色适配明暗主题。
- 语料 fixture 中图标描述同步；新增 `test/icon.test.js` 结构守卫
  （132/132）。图标渲染效果仍需用户在浏览器确认。

## [0.25.0] - 2026-11-26

- 新增**插件管理页详情页**（按官方 plugin-details 约定）：`docs/detail/DETAIL.md`
  （+中文版）恰为一行图片引用，配一张 text-free 640×300 特性图（源文件→符号
  索引→知识卡片与 Wiki 页面；无文字/字体/脚本/远程资源，自含浅色背景在深色
  主题也可读）。`locale/{en,zh}.json` 声明 `meta.detail`；`files` 只装
  `docs/detail`（内部 ADR/检查点文档不进包）。
- **元描述补全**：两语 `meta.description` 现含触发位置（侧栏“Repo wiki”入口）、
  新增的 LLM 请求（extract/generate 继承会话模型的子代理）、数据位置与关闭
  插件的影响。
- 测试更新：pack 守卫要求详情页三文件入包且内部文档仍排除；locale 守卫
  覆盖详情文档单行图片形式与 SVG 约定（130/130）。

## [0.24.0] - 2026-11-26

- 新增**打包完整性守卫**（`test/pack.test.js`）：跑 `npm pack --dry-run`
  断言产物含全部运行时文件（入口、客户端、loader patch、图标、双 locale、
  全部 `src/*.js`）并排除开发目录；`files` 字段手工维护，新增模块忘加时
  CI 此前无法发现。
- **漂移自检脚本自身被测试**（`test/verify-host-tokens.test.js`）：在临时
  目录构造合成 asar（真实 header + offset 布局），用 `DSH_APP_ASAR` 指向
  夹具，驱动 pass / 缺失 / 无深色三条路径——该脚本此前只在有真 asar 的
  机器上运行（CI 永远跳过），解析逻辑零回归保护。

## [0.23.0] - 2026-11-26

- **门面双语补齐**：新增 `CHANGELOG.zh-CN.md`（本文件，摘要式镜像并与英文版
  互链）；`README.zh-CN.md` 从 v0.20.0 同步到最新（令牌实证、漂移自检、npm
  scripts、目录结构、用例数）。
- **插件元数据更正**：`locale/{en,zh}.json` 的 meta 描述停留在 Phase 1
  （"提供 repowiki-index 与 repowiki-cards"），现改为完整能力描述并列出全部
  八个工具名。
- 新增 `test/locale.test.js` 门面一致性守卫（123/123）。

## [0.22.0] - 2026-11-26

- 新增**宿主主题令牌漂移自检**：`scripts/verify-host-tokens.mjs`
  （`npm run verify:host`）解析本机 app.asar，核对 client.js 引用的每个
  `--dsw-alias-*` 令牌在 dsh 自带 CSS 中仍有定义且有深色变体
  （`body[data-ds-dark-theme]`）。令牌清单从 client.js 自动收集，不过期；
  CI 无 app.asar 时 exit=3 跳过而非失败。同步落地为
  `test/host-tokens.test.js`（本机断言、CI 跳过）。
- 补 npm scripts（`test` / `test:coverage` / `verify:host`）；README 补
  升级回归流程说明。

## [0.21.0] - 2026-11-26

- **主题令牌从二手推断升级为一级实证**：直接解析 app.asar 提取官方
  CSS——`dsh-client-ui-theme/src/styles/design-platform.css` 定义全部 264
  个 `--dsw-alias-*` 令牌（每个含深色重定义），主前端壳消费 348 处，
  本插件 7+1 个令牌全部命中；方法与证据见 ADR-0004 §5。
- 修复用户反馈的"灰蓝状态点难区分"：已生成点改用语义令牌
  `state-done-primary`（紫 rgb(124,58,237)），smoke 测试加回归断言。

## [0.20.0] - 2026-11-26

- 新增**故障注入 DOM 测试套件**（8 例）：ErrorBoundary 在真实 React 下
  正向验证（渲染期抛错显示内联错误而非白屏）；加载失败→错误码插值+重试；
  单库无会话/无资产分支；总览逐工作区失败行；损坏远端结果不殃及整页；
  谎报 eof 的分页仍然正确。
- DOM 测试机械抽取为 `test/lib/dom-harness.mjs`。

## [0.19.0] - 2026-11-26

- 修复 `repowiki-extract` 结果缺 `skippedManual`/`orphaned` 字段
  （output schema 声明为必填，渲染层会打印 "undefined"）。
- 新增 LLM 执行路径的**契约级子代理桩**测试（`test/tool-llm.test.js`）：
  activation 契约、首轮写卡带 `sourceDigest`、digest 命中跳过、人工编辑
  保护、失败上报、Wiki 消费卡片；覆盖率 89.9% → 94.7%。

## [0.18.0] - 2026-11-26

- **多工作区总览**（ui-plan 切片 2）：面板默认总览模式，每行一个工作区
  （标题/路径/状态点/统计/最近索引时间），点击下钻单库视图。技术顾虑
  消解：每条目自带 `sessionIds`，复用既有按会话 scope 的读取通道。
- 修复主按钮 style 警告（shorthand/longhand 混用）。

## [0.17.0] - 2026-11-26

- 新增**真实 React 18 + jsdom 的 DOM 集成测试**：对真实 DOM 派发真实
  change/click/keydown 事件（React 合成事件根委托），闭合"点击无反应"
  的复现盲区——事件级接线验证健康。
- 新增 devOnly 测试依赖（react/react-dom/jsdom，均 MIT），不改变零运行
  时依赖形态；CI 安装 dev 依赖后跑套件。

## [0.16.0] - 2026-11-26

- 新增**真实语料客户端回归测试**：把本仓库自产的 `.dsh-repowiki/` 卡片
  灌入面板渲染路径（LLM 生成内容与手写 fixture 形态不同）。
- 新增**事件处理器兜底**：React 错误边界不捕获事件处理器抛错（表现为
  "点击无反应"），所有交互处理器包 guard，抛错/拒绝转为可读状态行。
- 新增 **CI 门禁**（`.github/workflows/tests.yml`，Node 22/24）：补齐方案
  §10.3-8 最后一条硬条款。

## [0.15.0] - 2026-11-26

- DRY 重构：`cwdOf`（8 处重复）、`resolveTarget`（2 处）、frontmatter
  编解码（3 处）收敛进 `src/util.js`，行为字节一致，净 −139 行。

## [0.14.0] - 2026-11-26

- 面板级 **ErrorBoundary**：渲染期抛错显示内联错误行而非白屏整个 main
  slot；`componentDidCatch` 以 `repowiki:` 前缀写 console。

## [0.13.1] - 2026-11-26

- 修复深色模式：此前使用的 `--dsw-alias-color-*` 令牌名在本机构型不存在，
  所有 `var()` 回退浅色字面量（用户看到的 wiki `a.js` 白底白字）。换成
  官方页面验证过的令牌名（label/bg-layer/border/state-*）。

## [0.13.0] - 2026-11-26

- Wiki 与记忆详情改为**排版文字渲染**（零依赖 Markdown 渲染器）而非源码；
- 卡片详情展示完整正文（摘要之外的用途/关键符号/陷阱/关联模块）。

## [0.12.0] - 2026-11-26

- 面板新增 **Memory 页签**：列出记忆条目（状态徽章着色）并查看原文；
- 会话记忆三出口齐备（生成汇总 v0.10.0 / 检索 v0.11.0 / 面板本版）。

## [0.11.0] - 2026-11-26

- `repowiki-cards` 新增 `includeMemory`：把已 accept 的记忆条目按同一查询
  附到检索结果。

## [0.10.0] - 2026-11-26

- `repowiki-generate` 读取已 accept 的记忆作为项目约定/决策注入综合
  prompt，输出 `memoriesRead` 报告用量。

## [0.9.0] - 2026-11-26

- 新增 `repowiki-edit`：手工卡片 `create`（路径可不在索引内）与 `update`，
  均置 `manuallyEdited` 停止自动刷新；纯文件操作无模型调用。

## [0.8.1] - 2026-11-26

- 修复面板读取：`remote.workspaceFiles` 返回 RemoteResult
  （`{ok,value}`/`{ok:false,error}` 且永不 reject），此前直取 payload 导致
  全部加载失败（伪 `workspace-file/bad-read`）。

## [0.8.0] - 2026-11-26

- 新增 `repowiki-memory` 工具：会话知识写入 `.dsh-repowiki/memory/<locale>/`
  + `list`/`accept`/`reject` 审核闭环；偏离方案（投影候选→模型显式写入）
  记录于 `docs/checkpoints/phase-4a.md`。

## [0.7.0] - 2026-11-26

- 面板切片 3：**待更新检测**（digest 不一致的卡片计入提示并加 Stale 筛选）
  与 **Wiki 页签**。

## [0.6.0] - 2026-11-26

- 新增 `repowiki-export`/`-import`：整树快照备份/还原，overwrite 保护、
  index 兼容校验；Phase 3 完成。

## [0.5.1] - 2026-11-26

- 人工编辑保护（`manuallyEdited` 卡片不被自动刷新）与孤儿卡计数上报。

## [0.5.0] - 2026-11-26

- **内容 digest 增量重建索引**（sha256 前 12 位；未变化文件复用旧条目）；
- 卡片 frontmatter 记 `sourceDigest`，源文件变化才刷新。

## [0.4.0] - 2026-11-26

- Repo Wiki 面板切片 1：统计、全部/已生成/未生成筛选、搜索、网格/列表、
  卡片详情（Escape 关闭）。

## [0.3.0] - 2026-11-26

- Web 客户端模块：侧栏入口 + 独立页面 + 四个生成动作（经
  `ctx.uiWorkspace.startSession`，ADR-0004）。

## [0.2.0] - 2026-11-26

- 新增 `repowiki-extract`（每文件一个 spawn 子代理生成知识卡片）与
  `repowiki-generate`（消费卡片综合 Wiki）+ 项目级 plan 配置。

## [0.1.0] - 2026-11-25

- `repowiki-index`（零 LLM 确定性符号索引）+ `repowiki-cards`（跨会话检索）；
- 零 npm 运行时依赖、零构建工具。
