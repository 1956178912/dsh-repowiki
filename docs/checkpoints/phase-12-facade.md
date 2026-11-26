# 检查点：门面与供应链守卫（v0.23.0–v0.25.0）

- 日期：2026-11-26
- 目标：清掉 GitHub 门面与打包供应链中最后几处“仅靠人工”的一致性风险。
- 状态：完成，已推送，CI 绿。

## 做了什么

1. **双语门面对齐（v0.23.0）**：新增 `CHANGELOG.zh-CN.md`（25 版中文摘要
   镜像，与英文版互链）；`README.zh-CN.md` 从 v0.20.0 同步至最新；
   `locale/{en,zh}.json` 的 meta 描述从 Phase 1 文案更新为全能力描述；
   新增 `test/locale.test.js` 门面守卫（123/123）。
2. **供应链守卫（v0.24.0）**：`test/pack.test.js` 跑 `npm pack --dry-run`
   断言产物含全部运行时文件、排除开发目录（files 字段漏加新模块此前 CI
   不可见）；`test/verify-host-tokens.test.js` 用合成 asar 夹具（真实
   header+offset 布局）驱动漂移自检脚本的 pass/缺失/无深色三路径
   （129/129）。
3. **插件详情页（v0.25.0）**：按官方 `plugin-details.md` 约定新增
   `docs/detail/`（DETAIL.md + 中文版，各恰一行引用 text-free 640×300
   特性图 `preview.svg`）；locale 声明 `meta.detail`，`files` 只装
   `docs/detail`（内部 ADR/检查点不进包）；meta.description 补触发位置、
   LLM 请求、数据位置与关闭影响。pack/locale 守卫同步收紧（130/130）。

## 验证

- `npm test` 130/130；`npm run verify:host` exit 0；
- CI：`ac30a1d`（v0.23）、`c9c6309`（v0.24）、`8cd5c2f`（v0.25）均 success；
- plugin_manager 确认 bundle `dsh-repowiki` v0.25.0 注册、installed、
  enabled；`include:repowiki` 重激活零警告。

## 决策与风险

- 详情页图片为手工绘制 SVG，已按官方约定做结构校验（无 text/字体/脚本/
  远程资源、640×300、≤5MiB），但**渲染效果未在浏览器中验证**（无浏览器
  控制，按 verification.md 要求如实披露）；
- meta.detail 用 `docs/detail/` 子目录而非模板默认 `docs/`，目的是让
  `files: ["docs/detail"]` 只装详情页文件，内部文档不进 tarball
  （"a subdirectory is a packaging convention, not a runtime path
  restriction"）。

## 下一步

- 等用户 GUI 验证：① 详情页渲染（新）；② 状态点紫/灰；③ 深色模式；
  ④ 卡片点击；⑤ 总览下钻。
