# 检查点：Python 绝对导入依赖边 v0.65.0（phase-40）

- 日期：2026-11-27
- 目标：Python 项目普遍使用绝对导入（`import app.core` /
  `from app.services import user`），此前只有相对 from-import 建边，
  导致反向引用与影响面在绝大多数 Python 仓库上缺失。
- 状态：代码、测试、文档完成；本地全量验证通过；未提交/推送。

## 交付

- `src/indexer.js`：
  - `buildPythonRoots`：候选导入根 = 项目根 + 任意层级的 `src` / `lib`
    目录（src-layout / lib-layout），按深度、字典序排序保证可复现；
  - `resolvePyBase`：`<base>.py` / `<base>/__init__.py`；
  - `resolvePyImportNames`：`from 包 import 名` 优先同名子模块
    （`包/名.py` 或 `包/名/__init__.py`），符合 Python 的 from-import
    语义；相对导入（`.mod` / `..pkg`）也享受该优先级；
  - `resolvePySpecifier`：相对导入按引用方目录回退层级；绝对导入按
    `^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$` 校验后逐根尝试；
  - `resolveCtx.pythonRoots` 接线；`resolveImportEdge` 传入
    `imp.imported` 供子模块优先判定。
- 测试 `test/indexer.test.js`：
  - 既有 flat 布局用例改为断言绝对 `from pkg.mod import hello` 建边；
  - 新增 src/lib 布局用例：`import app.core`、`from app.services.user
    import get_user`、`from app.services import user`（子模块优先）、
    `from app import core`、测试目录同样使用 `src` 根、`lib` 根、
    标准库/第三方不建边。
- 文档：两份 CHANGELOG、README 双语（stage/路线图/架构要点）、
  `docs/compatibility.md`（Python 行与已知限制）、`docs/coverage.md`。

## 验证（本地全量）

- `npm test`：326/326 通过。
- `npm run coverage:check`：行 97.86%、分支 87.04%、函数 94.39%（门禁通过）。
- `npm run typecheck` / `npm run lint`：通过。
- `npm run scan:secrets`、`npm run verify:host`：通过。
- `git diff --check`：无空白错误。

## 关键决策与取舍

- 只把项目根与 `src`/`lib` 当导入根，而非"任意目录后缀匹配"：后缀匹配
  会把同名测试包/示例包错误连边；显式布局根更接近真实 `sys.path`，
  且候选集合小、可解释。
- 不读 `site-packages`、不解析 `pyproject.toml` 的 `package-dir`：宿主
  仓库内没有这些目录，读取只会增加成本；自定义布局作为已知限制记录。
- `from 包 import 名` 优先子模块：Python 导入机制在子模块存在时导入
  子模块而非包属性；这样边落在更具体的文件上，反向引用更有用。
- 候选根排序固定（深度 → 字典序）：同名模块存在于多个根时结果稳定，
  不随文件系统遍历顺序漂移。

## 遗留 / 下一步

- 目录级并行索引（大仓库吞吐）。
- Swift 自定义 `path:` 目标；多行 Scala 参数子句。
- 提交/推送与版本 tag 由用户确认后执行。
