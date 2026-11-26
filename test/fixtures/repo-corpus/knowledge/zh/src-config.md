---
{
  "schemaVersion": 1,
  "path": "src/config.js",
  "lang": "javascript",
  "locale": "zh",
  "title": "项目级配置读取与候选文件筛选（src/config.js）",
  "tags": [
    "配置",
    "repowiki",
    "候选筛选",
    "防御式校验",
    "知识卡片提取"
  ],
  "manuallyEdited": false,
  "generatedAt": "2026-11-26T07:03:22.637Z"
}
---
# 项目级配置读取与候选文件筛选（src/config.js）

> src/config.js

## 概要 / Summary

该模块从资产目录下的 repowiki-plan.json 读取项目级配置，文件缺失或损坏时分别回退默认值并以 source 字段区分来源，不阻断提取。它还根据路径前缀、复杂度阈值和卡片上限过滤候选文件清单。所有字段经 arrayOfStrings / nonNegativeInt 校验，非法值静默降级为默认或空。

## 职责 / Purpose

为 repowiki 提取流程提供随 Git 共享的项目级配置（排除、只覆盖前缀、卡片上限、复杂度阈值、语言、检索上限），并按配置与运行时参数过滤出待提取的候选文件。

## 关键符号 / Key symbols

- `DEFAULT_PLAN` (variable): 冻结的默认配置对象，数值字段来自 schema.js 的常量（maxCardsPerRun=40、cardComplexityThreshold=3、maxResultLimit=50），exclude/includeOnly/locales 默认为空数组。
- `readPlan` (function): 异步读取 .dsh-repowiki/repowiki-plan.json：不存在返回 source='default'；存在但非 JSON 对象（含数组、null、基本类型）或解析失败返回 source='broken' 并附带 error 信息，plan 均为默认值；解析成功返回 source='file'。
- `selectCandidates` (function): 遍历文件清单：先按 overrides.paths（非空时）和 plan.includeOnly（非空时）做前缀匹配过滤，再按符号数阈值分流到 candidates 或 skippedSimple，最后超过 maxCards 时截断并置 capped=true。
- `normalizePrefix` (function): 将路径前缀中的反斜杠转为正斜杠、去掉开头的 ./ 和结尾的斜杠。
- `arrayOfStrings` (function): 仅当值为全字符串数组时原样返回，否则返回空数组。
- `nonNegativeInt` (function): 仅接受非负整数（含 0），否则返回传入的 fallback。

## 陷阱 / Pitfalls

- 前缀匹配用 rel.startsWith(p) 按字符比较，不保证目录边界：前缀 'src/a' 会匹配到 'src/abc' 下的文件。
- plan.exclude 被 readPlan 解析进返回的 plan 对象，但 selectCandidates 从未使用它，排除能力实际未生效（需由其他模块消费）。
- maxCards 截断按 files 的遍历顺序进行，代码未排序，超限时被丢弃哪些文件取决于输入顺序。
- maxCardsPerRun 配置为 0 是合法值（nonNegativeInt 允许），会导致 candidates 被截断为空且 capped=true。
- readPlan 在存在性检查通过后会第二次调用 fs.resolve 解析同一路径；文件损坏时的错误信息（如 JSON.parse 失败）只放进返回值的 error 字段，需要调用方自行报告。
- 文件存在但 JSON 顶层为数组、null 或基本类型时被判定为 broken 而非 file，配置内容整体作废。

## 相关模块 / Related modules

- src/schema.js（提供 ASSET_DIR、PLAN_FILE、MAX_CARDS_PER_RUN_DEFAULT、CARD_COMPLEXITY_THRESHOLD、DEFAULT_RESULT_LIMIT 常量）
- 调用 readPlan 并负责报告 broken 错误解的提取/索引工具
- 提供 resolve/stat/readText 能力的 ctx.fs 文件服务
