# 检查点：面板核心文件（phase-97）

- 日期：2026-11-27
- 合入版本：v0.121.0
- 目标：把 v0.119.0 的服务端 PageRank 能力补到用户可见面——单库视图在
  fan-in 高风险入口之外，直接展示"结构上最核心"的文件，并支持点击进入
  详情。
- 状态：代码、桩客户端测试、全量门禁完成；已提交并推送。

## 交付

- `client.js`：
  - 新增 `coreFilesFor(index, limit)`：与 `src/graph-rank.js` 同参数
    （边去重、忽略自引用、dangling 权重均分、阻尼 0.85、收敛 1e-6、
    迭代上限 50、同分按路径升序），仅统计出现在依赖边中的文件；分数保留
    6 位小数后按 3 位展示。
  - 单库视图在 fan-in 行之后新增"核心文件"chip 行：`path (0.xxx)`，
    `aria-label` 与可见文本一致，`title` 附 PageRank 说明；点击经行索引
    打开对应文件详情；索引无依赖边时整行隐藏。
  - 双语词典新增 `coreLabel` / `coreHint`（中文"核心文件"、英文
    "Core files"），与其他统计行共用主题令牌与字号。
- 测试：`test/client-smoke.test.js` 新增用例，断言标签、前三名与分数、
  chip 点击打开 C 卡片详情、无边索引隐藏；`test/client-faults.test.js`
  的卡片行筛选排除核心文件 chip（其 aria-label 为 `path (0.xxx)`）。

## 设计取舍

- 客户端重复实现 PageRank 而非共享模块：面板是零构建、由宿主编译加载的
  独立文件，不能 import Node 侧 `src/`；算法参数与排序规则保持与
  `src/graph-rank.js` 一致，并用夹具断言固定前三名与分数，降低漂移风险。
- 与 fan-in 并列而非替换：fan-in 是"直接依赖方多"，PageRank 是"通过下游
  变重要"；两行标签与 tooltip 分别说明，避免混为一个指标。
- 分数展示三位小数：判断相对高低足够，同时避免长浮点噪声；完整精度保留
  在结构化计算里，渲染层只做展示。
- 无边隐藏：没有结构信号时列文件没有意义，与 status 的 `(none)` 同口径。

## 验证

- `npm test`：449/449（LANG=en、LANG=zh_CN.UTF-8）。
- `npm run coverage:check`：行 98.07%、分支 86.35%、函数 95.09%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`、`git diff --check`：通过。
- 面板桩回归覆盖文本、可访问名与点击跳转；真实 GUI 仍靠安装后人工冒烟。

## 遗留 / 下一步

- 真实宿主 GUI 冒烟（本环境无浏览器控制），确认 chip 行在窄屏下的换行与
  深色模式对比度。
- 可考虑把 core files 写入模块页/prompt（当前 status 与面板已覆盖，
  避免重复信息）。
