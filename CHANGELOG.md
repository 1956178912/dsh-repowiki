# Changelog

English | [中文摘要](CHANGELOG.zh-CN.md)

All notable changes to this project are documented in this file. Versions
follow the phase plan in the README roadmap.

## [0.124.0] - 2026-11-27

### Added

- **Conservative unused-export audit**: `repowiki-status` reports exported
  symbols that have no named-import evidence. A file is only assessed when it
  has at least one inbound edge and every inbound edge carries named symbols;
  files with no inbound edge (possible entry points) or any unnamed import
  (default, side-effect, C/Go-style) are counted as `skippedFiles` rather
  than guessed. `default` names are ignored, counting is exact even when the
  detail list is capped (10 files, 10 symbols each), and the text report adds
  an `Unused export candidates` line with the skipped count. Output describes
  this as import-evidence, never as dead code.

### Tests

- 462 cases pass (LANG=en and LANG=zh); coverage and benchmarks are recorded
  in `docs/coverage.md` and `docs/benchmarks.md`.

## [0.123.0] - 2026-11-27

### Added

- **Wiki citation integrity**: `repowiki-status` now verifies every manifest
  citation (page- and section-level `sources`) against the index and, for
  non-indexed citations such as README files, against the filesystem. It
  returns `brokenCitations` with the distinct missing paths, citation
  occurrences, up to 10 affected pages with up to 10 sources each, and a
  truncation flag; the text report adds a `Broken citations` line and a
  warning points at regeneration. Absolute paths and `..` segments are never
  probed and are reported as broken. When more than 200 filesystem probes
  would be needed, unverified citations are treated as known instead of
  being misreported, with an explicit warning. No manifest means no
  integrity claim.

### Tests

- 457 cases pass (LANG=en and LANG=zh); coverage and benchmarks are recorded
  in `docs/coverage.md` and `docs/benchmarks.md`.

## [0.122.0] - 2026-11-27

### Added

- **Affected tests in impact analysis**: `repowiki-impact` now classifies
  impacted files with path heuristics (`test`/`spec`/`__tests__` directories,
  `*.test.*`/`*.spec.*`, `test_*`/`*_test.*`/`*_spec.rb`, and
  `FooTest`/`FooTests`/`FooSpec`/`FooIT` JVM/C#/Swift names) and returns
  `affectedTests` (nearest hop first, up to 50, with `affectedTestsTruncated`)
  in both file and symbol scope. Tests are collected during the full graph
  traversal, so the list stays correct even when impacted details are
  truncated. The render shows an `Affected tests` line, and the first
  verification recommendation names the files to run. Heuristics can
  misclassify; the output describes them as path-based.

### Tests

- 454 cases pass (LANG=en and LANG=zh); coverage and benchmarks are recorded
  in `docs/coverage.md` and `docs/benchmarks.md`.

## [0.121.0] - 2026-11-27

### Added

- **Panel core-file ranking**: the single-workspace view now renders a
  `Core files` chip row computed with the same PageRank parameters as
  `src/graph-rank.js` (deduplicated edges, self-references ignored, dangling
  redistribution, damping 0.85, 50-iteration cap). Scores are shown to three
  decimals, chips are keyboard-clickable buttons that open the matching file
  detail, and the row is hidden when the index has no edges. It complements
  the existing fan-in row: PageRank weights indirect importance, so modules
  that are central through their dependents also surface.

### Tests

- 449 cases pass (LANG=en and LANG=zh); coverage and benchmarks are recorded
  in `docs/coverage.md` and `docs/benchmarks.md`.

## [0.120.0] - 2026-11-27

### Added

- **Symbol anchors for task context**: `repowiki-context` accepts `symbols`
  (bare names or `path#name`) in addition to paths and a natural-language
  query. Resolved definitions rank first, anchor names drive snippet
  selection, and a query is no longer mandatory when an anchor is supplied.
  Qualified paths reuse the impact tool's path matching (exact/suffix/unique
  basename); a bare name defined in multiple files is reported as ambiguous
  with candidates instead of guessed; unresolved anchors are reported and
  never broadened to file or lexical search. When explicit anchors fail, the
  PageRank repo-map fallback stays off so anchor mistakes are not masked.

### Tests

- 448 cases pass (LANG=en and LANG=zh); coverage and benchmarks are recorded
  in `docs/coverage.md` and `docs/benchmarks.md`.

## [0.119.0] - 2026-11-27

### Added

- **PageRank core-file ranking**: new pure `src/graph-rank.js` computes a
  deterministic PageRank over the static import graph (deduplicated edges,
  self-references ignored, dangling mass redistributed, fixed damping and
  convergence bounds, stable tie-breaking by path). `repowiki-status` now
  returns `coreFiles` (top 10, only when the index has edges) and renders a
  `Core files (PageRank)` line, exposing indirect importance that fan-in
  counts alone cannot see.
- **Repo-map fallback for task context**: when `repowiki-context` finds no
  file for a task and the import graph has edges, it lists the top five
  PageRank files as a repo map — every entry marked `(repo map)`,
  `fallback: 'repo-map'` in the structured output, and both the pack caveats
  and the hint state that these files are a starting point, not task
  relevance. Packs with any lexical or document match are unchanged.

### Tests

- 446 cases pass (LANG=en and LANG=zh); coverage and benchmarks are recorded
  in `docs/coverage.md` and `docs/benchmarks.md`.

## [0.118.0] - 2026-11-27

### Added

- **Lexical usage evidence in impact analysis**: `repowiki-impact` in symbol
  scope now scans the direct named importers for identifier-boundary
  occurrences of each selected symbol and returns `usages` with
  `path:line` and the trimmed source line. Usage lines that belong to
  import/export lists (including multiline JS/TS, Python `from … import (`,
  Go `import (`, Rust/PHP `use … {` and destructuring bindings) are excluded,
  as are whole-line comments. This is stronger evidence than the import line
  alone while staying honest: strings and trailing comments may match, so the
  output is labelled lexical, never a resolved call graph. Source reads are
  bounded to 20 importer files and 10 sites per symbol (100 total);
  unreadable importers are reported as `usagesUnreadable` (unknown, not
  absent) and file-cap skips as `usagesSkippedFiles`. `includeUsages=false`
  skips source reads entirely.

### Tests

- 438 cases pass (LANG=en and LANG=zh); coverage and benchmarks are recorded
  in `docs/coverage.md` and `docs/benchmarks.md`.

## [0.117.0] - 2026-11-27

### Added

- **Symbol-aware impact analysis**: `repowiki-impact` accepts `symbols` as bare
  names or `path#name`. Direct dependents must have named-import evidence for
  the selected definitions; side-effect-only imports and imports of unrelated
  symbols are excluded. Transitive dependents remain a conservative expansion
  over the reverse file graph, `conservativeImpactedTotal` retains the
  unfiltered file-level upper bound, and unresolved symbols are reported
  without silently widening the analysis to whole files.
- **Budgeted task context packs**: the new `repowiki-context` tool ranks source
  files from identifiers, paths, explicit anchors and card/wiki/accepted-memory
  BM25 hits, then returns relevant symbols, line-numbered source snippets,
  direct imports/dependents, related cycles and fan-in hubs in one Markdown
  evidence pack. The 2,000–40,000 character budget is a hard upper bound
  (default 12,000), source reads and main files are bounded, and omitted source,
  document and relation counts are explicit. No index, an empty query and no
  matching source all degrade with an actionable hint.

### Fixed

- **Multiline static imports**: JS/TS `import { ... } from ...` and
  `export { ... } from ...` statements spanning lines now retain their starting
  line and complete named-symbol evidence (including default-plus-named imports
  and full-line comments inside braces). This repairs both dependency edges and
  symbol-scoped impact analysis on conventionally formatted code.
- **Parser-aware incremental caching**: `index.json` now carries `parserVersion`.
  A parser-rule upgrade invalidates cached `symbols`/`imports` even when source
  digests are unchanged, while preserving correct added/changed/removed
  statistics; subsequent runs resume normal digest-based reuse.

### Changed

- Test suite at 425 cases, green under both `LANG=en` and `LANG=zh`; plugin and
  locale metadata now list all 11 tools. Coverage and benchmark notes are
  recorded in `docs/coverage.md` and `docs/benchmarks.md`.

## [0.115.0] - 2026-11-27

### Added

- **Change impact analysis**: `repowiki-impact` takes the files you plan to
  edit and returns, on the reverse import graph, direct and transitive
  dependents (1–3 hops with bounded detail and exact totals), import cycles
  touching the change (with a representative route), fan-in of the changed
  files, cards (stale flagged) and wiki pages/sections that cite them. Risk is
  an explicit four-factor score (direct dependents, transitive dependents,
  cycles, hub) mapped to low/moderate/high/critical, with prioritized
  verification steps. Path matching accepts absolute paths, suffixes and
  unique basenames; ambiguous inputs list candidates instead of guessing.

### Changed

- Test suite at 415 cases, green under both `LANG=en` and `LANG=zh`; coverage
  numbers recorded in `docs/coverage.md`.

## [0.114.0] - 2026-11-27

### Added

- **Documentation coverage and health**: `repowiki-status` now reports
  `coverage` over files that qualify for a card under the plan complexity
  threshold (not every file), with documented/fresh/stale counts and the
  modules with the largest gaps (up to five); and a `health` score built from
  four weighted components (documentation 40 / wiki 25 / architecture 20 /
  hygiene 15) with grades A–D, each component's score/weight/detail and the
  top four issues. The text report gains both summary lines.

### Changed

- Added pure health tests and status wiring coverage; coverage numbers in
  `docs/coverage.md`.

## [0.113.0] - 2026-11-27

### Added

- **Locale-aware asset fallback**: when no locale is requested,
  `repowiki-cards` (BM25 docs search, `includeMemory` and wiki citations) and
  `repowiki-status` choose the session language if it holds cards/wiki/memory,
  otherwise the other locale that does; an explicit locale stays strict. This
  fixes environment-dependent empty results and false "0 stale" wiki reports
  when assets were generated in `zh` while the host language is `en`. Outputs
  now expose `locale`/`localeRequested`/`localeSource` (plus
  `availableLocales` in status). The panel's card/wiki/memory loaders now
  also require Markdown inside a locale directory, so an empty `en/` no longer
shadows a populated `zh/`.

### Changed

- New `test/asset-locale.test.js`; the whole suite is green under both
  `LANG=en` and `LANG=zh` (three cases previously passed only in zh). Coverage
  numbers in `docs/coverage.md`.

## [0.112.0] - 2026-11-27

### Added

- **Clickable dependency entries**: file paths in the card-detail *Imports* and
  *Dependents* lists are now buttons that open that file's detail (same pane,
  depth reset, localized accessible name); line numbers stay attached to the
  path. Following a dependency chain in either direction no longer requires
  closing the pane. The open-file callback is shared with cycle-route links and
  renamed accordingly (`openFile`).

### Changed

- Test suite at 391 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.111.0] - 2026-11-27

### Added

- **Clickable cycle routes**: files in the card-detail cycle summary are now
  buttons (except the currently open file) that jump to that file's detail,
  with a localized accessible name. Following a two/three-file cycle no longer
  requires closing the pane and locating the other card; the depth selector and
  focus handling behave like any other card open.

### Changed

- Test suite at 390 cases (the hub-click case now follows the cycle link);
  coverage gate numbers recorded in `docs/coverage.md`.

## [0.110.0] - 2026-11-27

### Added

- **Cycle summary in card detail**: opening any indexed file that belongs to an
  import cycle now shows a `⟲` line with the group size and, for two/three-file
  cycles, the representative route (`a.js → c.js → a.js`). The detail pane no
  longer requires hovering the list badge to learn how to break the cycle; files
  without a card still get the line.

### Changed

- Test suite at 390 cases (the hub-click case now also asserts the cycle
  summary); coverage gate numbers recorded in `docs/coverage.md`.

## [0.109.0] - 2026-11-27

### Added

- **Cycle routes in panel badges**: the `⟲` title tooltip on cycle members now
  appends one representative shortest closed path for two- and three-file
  cycles (`a.js → c.js → a.js`), using the same semantics as the status tool.
  The client computes SCCs plus the shortest route locally (12-node cap), so
  the badge keeps its size hint and gains an actionable break point; longer
  cycles still show only the group size.

### Changed

- Test suite at 390 cases (the cycle-badge case now checks the route suffix);
  coverage gate numbers recorded in `docs/coverage.md`.

## [0.108.0] - 2026-11-27

### Added

- **Representative cycle paths**: every file-level import cycle now carries a
  `sample` field — one shortest cycle starting and ending at the same file
  (lexicographically first member, deterministic tie-break), capped at 12 nodes
  (longer cycles return an empty sample instead of a huge path). `repowiki-status`
  renders short cycles as `e.g. a.ts → b.ts → a.ts`, and the wiki synthesis
  prompt lists the same route so architecture sections can point at a concrete
  edge to break.

### Changed

- Test suite at 390 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.107.0] - 2026-11-27

### Changed

- **Bounded warnings in the status report**: the text report now prints at
  most three warnings followed by `… +N more (see the structured warnings
  array)`, while the structured `warnings` array still carries every entry.
  Repositories with dozens of internal-visibility violations no longer bury
  the rest of the report.

### Changed

- Test suite at 389 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.106.0] - 2026-11-27

### Changed

- **Bounded internal-violation warnings**: indexing caps Go `internal`
  visibility warnings at 50 entries and folds the remainder into one summary
  line (`… N more … omitted (capped at 50)`), so a repository with hundreds of
  cross-boundary imports cannot bloat `index.json` or the status output.

### Changed

- Test suite at 388 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.105.0] - 2026-11-27

### Changed

- **Mermaid guidance aligned with the renderer**: the wiki synthesis prompt now
  asks for `flowchart TD`/`flowchart LR` diagrams, wraps nodes of the same
  module or layer in `subgraph` blocks, and keeps node labels short — matching
  the panel's zero-dependency renderer so generated diagrams render as grouped
  boxes instead of falling back to code blocks.

### Changed

- Test suite at 387 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.104.0] - 2026-11-27

### Added

- **Expandable index warnings**: the stat-row warning counter is now a button
  (`aria-expanded` / `aria-controls`) that toggles a full warning list beneath
  the stats, so entries beyond the tooltip's first three become readable in
  place. The tooltip keeps the three-entry preview plus the expand hint, and
  clean indexes still render nothing.

### Changed

- Test suite at 386 cases (the warning case now covers expand/collapse);
  coverage gate numbers recorded in `docs/coverage.md`.

## [0.103.0] - 2026-11-27

### Added

- **Mermaid subgraph groups**: `subgraph name` … `end` blocks inside
  `flowchart`/`graph` fences now render as dashed grouping boxes with the
  group label, drawn beneath edges and nodes. Members keep their existing
  node shapes and cross-group edges still connect; an empty or unusual
  subgraph header falls back to a plain group name. Everything else in the
  renderer is unchanged (unsupported diagram types still fall back to code
  blocks).

### Changed

- Benchmarks refreshed at v0.103.0: 1000 files ≈31 ms / 69 MiB, 5000 files
  ≈120 ms / 97 MiB (serial 32 / 124 ms) — no regression from v0.91.0.
- Test suite at 386 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.102.0] - 2026-11-27

### Added

- **High-fan-in sections on module pages**: deterministic module pages (no
  model calls) now append a *High-fan-in files* section listing up to three
  files in that module with the most distinct importers (duplicates counted
  once, self-imports ignored, ties by path). Cross-module importers are
  included, and the section is omitted when the module has no inbound edges,
  so the risk axis now exists in both theme and module pages.

### Changed

- Test suite at 385 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.101.0] - 2026-11-27

### Added

- **Fan-in hotspots in the synthesis prompt**: `repowiki-generate` now feeds
  the top five most-imported files (distinct importer count, same semantics as
  `repowiki-status`) into the theme prompt, together with an instruction to
  cite them by path when describing change-risk hotspots and never to invent
  such files when the list is empty. Architecture sections get a grounded
  risk axis instead of generic advice.

### Changed

- Test suite at 384 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.100.0] - 2026-11-27

### Added

- **Clickable fan-in hotspots**: each high-fan-in chip in the single-workspace
  view is now a button that opens that file's card detail (same pane as the
  card tiles, reusing the row index), so the risk hint doubles as navigation.
  Chips keep a localized accessible name (`path (N)`).

### Changed

- Test suite at 383 cases (client fixtures exclude the new chip shape from
  card-tile selectors); coverage gate numbers recorded in `docs/coverage.md`.

## [0.99.0] - 2026-11-27

### Added

- **Index warnings in the panel**: the single-workspace stat row shows
  `Index warnings N` whenever `index.json` carries warnings, with a tooltip
  listing the first three entries (plus a remainder count). Go `internal`
  visibility violations and skipped-file notes now surface while browsing,
  without running `repowiki-status`; the row stays hidden for clean indexes.

### Changed

- Test suite at 383 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.98.0] - 2026-11-27

### Added

- **Go `internal` visibility diagnostics**: indexing now checks Go import
  edges against the toolchain rule that packages under `a/b/internal/...` are
  only importable from within `a/b/` (root `internal/` stays open to the whole
  repository, and nested `internal` segments use the innermost boundary).
  Violations are still indexed as edges but reported once each in
  `index.json` `warnings` (and therefore in `repowiki-status`), so a build
  error becomes visible during indexing instead of at compile time.

### Changed

- Test suite at 382 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.97.0] - 2026-11-27

### Added

- **High-fan-in files in the panel**: the single-workspace view shows a
  *High-fan-in files* row with the top three most-imported files (distinct
  importer count, ties by path), using the same semantics as the status tool's
  `Fan-in hubs`. Duplicate imports from one file count once and self-imports
  are ignored, so the row points at the change-risk hotspots without opening a
  session; it stays hidden when the index has no edges.

### Changed

- Test suite at 381 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.96.0] - 2026-11-27

### Added

- **Mermaid diagrams in the panel**: ```` ```mermaid ```` fences inside wiki
  pages and card bodies now render as inline SVG instead of source text. A
  zero-dependency subset covers `flowchart`/`graph` with `TD`/`TB`/`LR`,
  node shapes `[label]`, `(label)`, `{label}`, `((label))`, `[[label]]`,
  `{{label}}`, `[(label)]`, edges `-->`, `---`, `==>`, `-.->` and `|label|`
  edge captions. Layout is deterministic layered (nearest-source order,
  cycles capped at 12 layers) and themed with `--dsw-alias-*` tokens.
  Unsupported diagram types and malformed sources fall back to the previous
  code block, so nothing is lost.

### Changed

- Test suite at 380 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.95.0] - 2026-11-27

### Added

- **Fan-in hubs in the status report**: `repowiki-status` now ranks the files
  with the most distinct importers (`topDependents`, capped at 10, ties by
  path) and renders a `Fan-in hubs:` line. Duplicate imports from the same file
  count once and self-imports are ignored, so the ranking answers "which files
  are riskiest to change" without call-graph guesswork.

### Changed

- Test suite at 379 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.94.0] - 2026-11-27

### Added

- **Reverse impact surface**: `repowiki-cards` accepts `dependents=true` and
  reports which files import each matched file (the reverse of `imports=true`).
  `depth=2..3` walks the reverse import graph breadth-first, so the answer also
  covers indirect dependents — the impact surface of changing a file. Results
  are bounded to 100 entries with an honest truncation flag, render with `←`
  (direct) / `⇠` (transitive) plus the same `N hops` suffix, and reuse the
  existing `depth` parameter.
- **Panel dependents section**: the card detail pane gained a file-level
  *Dependents* list next to *Imports*. One 1/2/3-hop control now drives both
  directions (nearest hop wins, the opened file never lists itself, cycles stay
  finite); `←` marks direct dependents, `↔` mutual imports and `⇠` indirect
  dependents.

### Changed

- Test suite at 377 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.93.0] - 2026-11-27

### Added

- **Panel import-depth switcher**: the card detail pane now offers a 1/2/3-hop
  control for the *Imports* section. The client-side `importsForPath` walked
  only direct edges before; it now runs the same breadth-first expansion as
  `src/references.js` (nearest hop wins, matched file never listed as its own
  dependency, cycles stay finite, bounded to 100 entries). Deeper hops render
  with `⇢` plus a `N hops` suffix, direct edges keep `→`, and mutual edges keep
  `↔`. Reopening a card resets the selector to one hop.

### Changed

- Test suite at 374 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.92.0] - 2026-11-27

### Added

- **Transitive import expansion**: `repowiki-cards` accepts `depth` (1–3,
  default 1) together with `imports=true`. Depth 2–3 walks the import graph
  breadth-first, records each reachable file once at its nearest hop, never
  lists a matched file as its own dependency, and keeps cycles finite.
  Entries gain a `depth` field; the text render marks deeper hops with `⇢`
  and `N hops` while direct dependencies keep `→`. Output stays bounded to
  100 entries with an honest truncation flag.

### Changed

- Test suite at 373 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.91.0] - 2026-11-27

### Added

- **Go multi-module repositories**: nested `go.mod` files (up to 20 per run)
  now contribute their own module prefixes, so imports inside a submodule
  resolve to that submodule's packages instead of being treated as external.
  Resolution tries deeper directories and longer module paths first, keeping
  the root-module behavior unchanged. Go `internal` visibility is still not
  enforced (documented limitation).

### Changed

- Refreshed `docs/benchmarks.md` on v0.91.0 (1000 files ≈ 31 ms, 5000 files
  ≈ 119 ms with the default 8-way read concurrency; serial control included).
- Test suite at 371 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.90.0] - 2026-11-27

### Added

- **Panel cycle badges**: card tiles and list rows now show a `⟲` badge when
  the file belongs to an import cycle (strongly connected component with two
  or more files), computed client-side from `index.edges` with the same
  iterative Tarjan logic as `src/cycles.js`. The badge carries a localized
  accessible name and tooltip (`Part of a N-file import cycle`), so cycles
  are visible while browsing, not only in the detail pane or status output.

### Changed

- Test suite at 370 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.89.0] - 2026-11-27

### Added

- **Panel shows skipped files**: the single-workspace stat row now appends
  `Skipped N` when `index.stats.skipped > 0`, with a localized tooltip
  explaining the cause (unreadable or above the per-file size limit). Zero
  skips keep the row unchanged.

### Changed

- Test suite at 369 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.88.0] - 2026-11-27

### Added

- **Svelte single-file components**: `.svelte` files are indexed with the
  same script-block extraction as Vue. Both `<script context="module">` and
  the instance `<script>` block are parsed with source-accurate line numbers;
  markup and styles produce nothing. `src/sfc.js` now exports the generic
  `scriptBlockText` name, the panel shows `Svelte`, and the card prompt fence
  uses `svelte`.

### Changed

- Test suite at 368 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.87.0] - 2026-11-27

### Added

- **Panel search covers card bodies**: the card list search now scores the
  full card Markdown (purpose, key symbols, pitfalls) in addition to title,
  symbols, tags, summary and path, so a phrase that only appears in a card
  body finds its file. Body and symbol text are lowercased once when rows are
  built (short fields too), keeping per-keystroke cost bounded.

### Changed

- Test suite at 365 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.86.0] - 2026-11-27

### Added

- **Skipped-file accounting**: indexing no longer drops unreadable or
  oversized source files silently. `index.json` gains `stats.skipped` and
  `stats.skippedTooLarge`, a warning names the count, `repowiki-index`
  returns both values and renders `(N skipped)`, and `repowiki-status`
  appends `N skipped` to the index line when non-zero. Cancelled positions
  are not counted, so the number reflects real skips only.

### Changed

- Test suite at 364 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.85.0] - 2026-11-27

### Added

- **Vue single-file components**: `.vue` files are now indexed. A new
  `src/sfc.js` keeps only `<script>` / `<script setup>` block content while
  replacing every other line with a blank, so symbol and import extraction
  reuse the JS/TS parsers with source-accurate line numbers (template and
  style never produce symbols or edges). Relative imports, tsconfig aliases
  and workspace package names resolve exactly as in `.ts`. Symbols follow
  the JS rules (functions/classes/methods and exported constants), and the
  panel shows the readable language name `Vue`.

### Changed

- Test suite at 362 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.84.0] - 2026-11-27

### Added

- **Hatch import roots**: `pyproject.toml` parsing now reads
  `packages = [...]` from `[tool.hatch.build]` and
  `[tool.hatch.build.targets.wheel|sdist]`, using each package directory's
  parent as a Python import root (`src/foo` → `src`). Multi-line arrays are
  supported, single-segment names (already the project root) and `..`/absolute
  values are ignored. This closes the last common build-backend gap next to
  setuptools, PDM and poetry.

### Changed

- Test suite at 359 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.83.0] - 2026-11-27

### Added

- **Module pages flag circular dependencies**: deterministic module pages now
  add a `Circular dependencies` section listing modules that import each
  other in both directions (`imports both ways`). The check runs on the full
  edge counts before the per-direction truncation, so a mutual pair is never
  hidden by the top-8 cap. Pages without mutual imports stay unchanged.

### Changed

- Test suite at 357 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.82.0] - 2026-11-27

### Added

- **Panel detail: outgoing imports**: card details now list the files a
  source imports (`Imports (import-level)`), mirroring the reverse-reference
  block. Entries carry the statement line and named symbols when the index
  has them; a file that also imports back is marked with `↔` instead of `→`,
  so two-file cycles are visible at a glance. Bounded to 8 rows with a
  `+N more` hint, matching the existing reference block.

### Changed

- Test suite at 356 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.81.0] - 2026-11-27

### Added

- **Import cycle detection**: `src/cycles.js` computes file-level circular
  dependencies from `index.edges` as strongly connected components
  (iterative Tarjan, so deep graphs cannot overflow the stack). Groups with
  two or more files are reported largest first, files inside a group are
  sorted, and output is bounded (10 groups, 30 files per group, both with
  honest truncation flags). Self-edges and malformed edges are ignored.
- **`repowiki-status` reports cycles**: the health report now returns
  `cycles` and renders `Import cycles: a.ts ↔ b.ts (+N)` (or `(none)`), so
  architectural cycles are visible without extra tooling.
- **Cycle context for wiki synthesis**: the theme prompt receives up to five
  cycle groups (six files each) plus an instruction to call out circular
  dependencies as an architectural risk and never to invent them.

### Changed

- Test suite at 355 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.80.0] - 2026-11-27

### Added

- **Outgoing import edges in `repowiki-cards`**: `imports=true` returns each
  matched file's outgoing dependency edges as
  `imports: [{path, line?, symbols}]` (plus `importsTruncated`, bounded to
  100 entries) — the complement of `references=true`. Side-effect imports are
  kept with an empty `symbols` list, self-edges are skipped, and results
  follow the match order then the edge order, so output is deterministic.
  The text render adds an `Imports:` block (`→ target:Lx (symbols)`).

### Changed

- Test suite at 346 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.79.0] - 2026-11-27

### Added

- **Module dependency hotspots in `repowiki-status`**: the health report now
  returns `moduleDependencies` (top 10 cross-module import edges, aggregated
  by `summarizeModuleRelations`) and renders them as
  `src → lib (3); …` (or `(none)`), so architecture hotspots are visible
  without running wiki generation.

### Changed

- Test suite at 341 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.78.0] - 2026-11-27

### Added

- **Module dependency context for wiki synthesis**: the theme prompt now
  carries a compact summary of cross-module import edges (module → module
  counts, top 15, computed by `summarizeModuleRelations`) and an instruction
  to use only those directions. This grounds architecture and data-flow
  sections in the indexed graph instead of letting the model invent
  relationships. Self-module edges are ignored and the list is sorted by
  count then path, so prompts stay deterministic.

### Changed

- Test suite at 340 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.77.0] - 2026-11-27

### Changed

- **Angle-bracket includes resolve through include roots**: `#include <core/api.hpp>`
  is now extracted (marked non-relative) and resolved against the
  `include`/`src`/`inc` roots and the project root, matching the common
  `-I include` layout. Quoted includes keep their file-directory-first
  behavior; system headers (`<vector>`, `<stdio.h>`) still produce no edge
  because no indexed file matches. Macro and commented lines stay ignored.
- Test suite at 337 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.76.0] - 2026-11-27

### Changed

- **Directional module relations in module pages**: deterministic module
  wiki pages now separate `Depends on` (outbound import edges) from
  `Depended on by` (inbound edges) instead of merging both directions into a
  single "Related modules" count. Each list is sorted by edge count then path
  and capped at 8 entries, so architecture pages show which way a dependency
  flows.
- Test suite at 337 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.75.0] - 2026-11-27

### Added

- **Language distribution in the panel**: the single-workspace view shows a
  distribution row (`JavaScript 12 · C++ 3 · …`) using readable language
  names, sorted by file count, capped at 8 chips plus a `+N more` counter.
  Data comes from `index.stats.languages` with a fallback to file rows for
  older indexes; the row is hidden when the workspace has only one language.

### Changed

- Test suite at 337 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.74.0] - 2026-11-27

### Added

- **Python custom import roots from `pyproject.toml`**: the indexer now reads
  `[tool.setuptools] package-dir` (inline table), PDM's string form,
  `[tool.setuptools.packages.find] where = [...]`, and `[tool.poetry]`
  `packages = [{ include = …, from = … }]`, adding each directory to the
  Python import roots alongside the existing `src`/`lib` convention. Absolute
  paths and values containing `..` are ignored, so a bad config can never
  point resolution outside the repository.

### Changed

- Test suite at 337 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.73.0] - 2026-11-27

### Changed

- **Readable language labels in the panel**: the language filter and card
  detail now show display names (`JavaScript`, `C#`, `C++`, …) instead of raw
  index ids (`javascript`, `csharp`, `cpp`). Filter values stay the raw ids, so
  saved selections and reads are unaffected; unknown languages fall back to
  their id rather than disappearing.
- Test suite at 335 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.72.0] - 2026-11-27

### Fixed

- **Scala multi-line signatures**: declarations whose parameter list spans
  several lines (and whose body starts after `extends … {`, `=`, or a Scala 3
  `:`) now get correct `endLine` and `parent` ownership. The header scanner
  tracks bracket depth and strings, ignores `=` in default arguments and
  `:` in type annotations, and continues across `extends`/`with`/trailing
  `(`/`,` lines; indentation bodies are measured from the closing signature
  line instead of the `def` line.

### Changed

- Test suite at 335 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.71.0] - 2026-11-27

### Added

- **Nested CMake subprojects**: every `CMakeLists.txt` (not just the root,
  capped at 50 nested manifests) now feeds the stack summary. `find_package`
  occurrences accumulate into `dependencyCounts.cmake`, technologies keep a
  per-manifest `source`, duplicates are de-duplicated across manifests, and
  the project name is taken from the root manifest only so it does not depend
  on traversal order.

### Changed

- Test suite at 334 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.70.0] - 2026-11-27

### Added

- **CMake stack detection**: `CMakeLists.txt` is now a recognized manifest.
  `project()` supplies the project name and every `find_package(<Name>)`
  (case-insensitive, de-duplicated) counts toward `dependencyCounts.cmake`;
  known packages map to technologies (Qt, Boost, OpenCV, Eigen, fmt, spdlog,
  Protocol Buffers, gRPC, Vulkan, SDL, SFML, GLFW, Catch2, GoogleTest,
  nlohmann/json, OpenSSL, zlib, SQLite, libcurl, libxml2, CUDA). Unknown
  packages are counted but never guessed into a technology.

### Changed

- Test suite at 333 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.69.0] - 2026-11-27

### Added

- **C/C++ support (13 languages)**: `repowiki-index` now indexes `.c`, `.h`,
  `.cc`, `.cpp`, `.cxx`, `.hpp`, `.hh`, `.hxx` and `.ipp`. Symbols cover
  class/struct/union/enum/typedef (including anonymous typedefs), functions,
  class methods, constructors/destructors, out-of-class `Foo::bar` definitions
  and prototypes, with multi-line parameter lists, `static` visibility and
  `parent` ownership. Quoted `#include "..."` resolves relative to the file
  first, then through `include` / `src` / `inc` roots and the project root;
  angle-bracket system headers stay edge-free, as do unparsed macro-generated
  declarations (documented limitations).

### Changed

- Test suite at 332 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.68.0] - 2026-11-27

### Added

- **Bounded parallel indexing**: `buildIndex` now reads and parses source
  files with 8-way concurrency by default (`readConcurrency` option, capped at
  16). Results are written back to their traversal position, so the emitted
  index is byte-for-byte identical to a sequential run (stable ordering for
  Git diffs). Cancellation stops dispatching new files; in-flight reads finish
  and the partial result is still reported as `aborted`. Benchmarks: 5000
  files 126 ms → 120 ms on a local synchronous fs, while a remote `ctx.fs`
  (RTT-bound) is the actual beneficiary; a delayed-fs test asserts real
  concurrency stays within the bound and parallel output equals serial output.

### Changed

- Test suite at 329 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.67.0] - 2026-11-27

### Fixed

- **Ruby bare `require` resolution**: a bare `require 'billing/base'` used to
  be resolved relative to the requiring file's directory, which produced
  `lib/billing/billing/base.rb`. It now follows Ruby's `$LOAD_PATH` semantics:
  any `lib/` directory (ordered by depth, then lexicographically) is tried
  first, then the project root, with `.rb`, the literal path and `index.rb`.
  `require_relative` and `.`/`..`-prefixed requires keep resolving relative to
  the file. Aggregator files (`lib/billing.rb` requiring `billing/invoice`)
  now get edges, and external gems still produce none.

### Changed

- Test suite at 328 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.66.0] - 2026-11-27

### Added

- **SwiftPM custom `path:` targets**: `repowiki-index` now parses
  `Package.swift` target declarations (`.target`, `.executableTarget`,
  `.testTarget`, multi-line and string-aware, comments stripped) and maps
  `import Module` to the lexicographically first Swift file under the declared
  `path:`. An explicit declaration wins over the `Sources/<Target>/`
  convention, including when the declared directory has no Swift sources;
  targets relying on the convention keep working, and dependency-array
  `.target(name:)` references are not mistaken for declarations.

### Changed

- Test suite at 327 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.65.0] - 2026-11-27

### Added

- **Python absolute import edges**: `repowiki-index` now resolves
  `import a.b` and `from a.b import c` against the project root and any
  `src` / `lib` layout root (candidate roots are ordered by depth, then
  lexicographically, so edges are reproducible). `from package import name`
  prefers the submodule file (`package/name.py`, `package/name/__init__.py`)
  over the package entry, matching Python's import semantics; relative
  imports behave as before. Standard-library and third-party imports still
  produce no edge.

### Changed

- Test suite at 326 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.64.0] - 2026-11-27

### Added

- **JS/TS alias and workspace dependency edges**: `repowiki-index` now also
  reads `tsconfig.json` / `jsconfig.json` / `tsconfig.*.json` and nested
  `package.json` files (JSONC comments and trailing commas tolerated, capped at
  200 configs). Non-relative imports resolve through:
  - `compilerOptions.paths` (exact and `*` wildcard) and `baseUrl` absolute
    imports, using the nearest config above the importing file so monorepo
    packages do not leak aliases into each other;
  - workspace package names (`@acme/ui`, `@acme/ui/button`) via `exports`
    (string, conditional, array fallback and `./*` wildcards), then
    `main`/`module`/`types`, then `src/index` / `index`.
  External packages still produce no edge; a package whose entry points to an
  unindexed build output falls back to its source entry.
- Exported `stripJsonc` helper for comment/trailing-comma tolerant config
  parsing.

### Changed

- Test suite at 325 cases; coverage gate numbers recorded in
  `docs/coverage.md`.

## [0.63.0] - 2026-11-27

### Fixed

- **Large indexes in the panel**: asset JSON (index and manifests) is read
  with a 120-page budget (up to 600k lines) instead of the 12-page default, so
  indexes for large repositories no longer truncate into invalid JSON and
  surface as "read failed". If truncation still happens it is reported as
  `workspace-file/too-large` rather than a JSON parse error; Markdown pages
  keep the 12-page cap.

### Changed

- Test suite at 320 cases; coverage gate at lines 97.79%, branches 86.74%,
  functions 94.2%.

## [0.62.0] - 2026-11-27

### Added

- **Project context in card prompts**: `repowiki-extract` now passes the
  project name, detected tech stack (≤8) and module paths (≤20) into the card
  prompt, and asks the model to reuse those exact module paths in
  `relatedModules` instead of inventing names.
- **Scala 3 `extension` / `given`**: extension methods are attributed to the
  extended type (without duplicating a type symbol), and `given` instances are
  indexed as variables with body ranges; methods inside a `given` belong to it.

### Changed

- Test suite at 319 cases; coverage gate at lines 97.84%, branches 86.84%,
  functions 94.2%.

## [0.61.0] - 2026-11-27

### Added

- **Theme-synthesis retries**: `repowiki-generate` gains `attempts` (1–3,
  default 2). A thrown model error or an empty page list retries with
  abort-aware exponential backoff (200ms/400ms, capped at 1s); results report
  `attempts`/`retried`, and the rendered line notes retries.
- **Index change counters**: `repowiki-index` reports `added` / `changed` /
  `removed` next to `reused`, so incremental runs show what actually changed
  (`removed` stays 0 when the walk was capped or cancelled, where absence is
  not proof of deletion).

### Changed

- `delayWithSignal` moved to `src/util.js` and shared by extraction and
  generation retries.
- Test suite at 318 cases; coverage gate at lines 97.83%, branches 86.92%,
  functions 94.15%.

## [0.60.0] - 2026-11-27

### Added

- **Swift local target edges**: `import Core` now resolves to the
  representative file of `Sources/Core/` (or legacy `Source/Core/`), so SwiftPM
  multi-target repositories get file-level dependency edges, reverse
  references and panel reference lines. Submodule imports
  (`import Core.Models`) resolve by their first path segment; external modules
  (Foundation, XCTest, ...) are ignored.

### Fixed

- Self-resolving imports no longer create an edge from a file to itself (for
  example a target's representative file importing its own module).

### Changed

- Test suite at 317 cases; coverage gate at lines 97.8%, branches 86.7%,
  functions 94.14%.

## [0.59.0] - 2026-11-27

### Added

- **Incremental wiki synthesis**: `repowiki-generate` now compares the wiki
  manifest's card digest and a new accepted-memory digest. When both match and
  every manifest page still exists, theme synthesis is skipped with no model
  call (`skippedFresh: true`); `force=true` re-synthesizes anyway. Any card,
  memory or missing-page change falls through to a normal run, and skipped
  runs still report orphaned pages.
- **Memory-freshness warning**: `repowiki-status` compares the manifest memory
  digest with accepted entries and warns when the wiki predates memory changes
  (so `stale=0` no longer hides an upcoming regeneration).

### Changed

- Wiki manifest v2 gains an optional `memoryDigest`; manifests without it
  regenerate once. Module and `all` granularity stay deterministic and are not
  short-circuited.
- Test suite at 316 cases; coverage gate at lines 97.81%, branches 86.84%,
  functions 93.95%.

## [0.58.0] - 2026-11-27

### Added

- **Panel symbol search**: card-list search now also matches indexed symbol
  names (weighted below titles), so files can be found by a function or class
  name even before a card exists; the placeholder reads
  "title / path / tags / symbols".
- **Method ownership in `repowiki-cards`**: matched method symbols expose their
  owning type (`parent`, e.g. `run (method:2, in Service)`), both in the output
  schema and the rendered text.

### Fixed

- **Scala 3 indentation syntax**: type bodies and `def` bodies without braces
  (`object App:` / `def run(): Unit =`) now derive their range from
  indentation, so members get the correct `parent` and `endLine` instead of
  being treated as top-level functions.

### Changed

- Test suite at 314 cases; coverage gate at lines 97.8%, branches 86.76%,
  functions 94.05%.

## [0.57.0] - 2026-11-27

### Added

- **Ranked symbol search**: `repowiki-cards` ranks matches by name quality
  (exact > prefix > substring; exported symbols first within a tier), orders
  symbols by rank then line, and orders files by their best match instead of
  raw index order. Queries without a term keep the previous stable index order.
- **Language-scoped retrieval**: `repowiki-cards` gains `lang` and
  `exportedOnly` filters; the Repo Wiki panel adds a language dropdown (shown
  only when the index contains more than one language) that filters the card
  list, with a stale selection cleared when switching workspaces.

### Changed

- Test suite at 311 cases; coverage gate at lines 97.8%, branches 86.83%,
  functions 94.02%.

## [0.56.0] - 2026-11-27

### Added

- **Per-section wiki citation chips**: the card detail "Cited by wiki" panel now
  renders one chip per cited section (up to four, with a `+N` overflow note).
  Clicking a chip opens the page at that exact section, while the page title
  still jumps to the first cited section; each chip carries a
  `page · section` accessible label.

### Fixed

- **Ruby block ranges ignore heredoc bodies and `=begin`/`=end` comments**:
  keywords such as `end` inside heredoc content no longer truncate class or
  method ranges, and commented-out definitions are no longer indexed.
  `list << ITEM` appends are not mistaken for heredoc openers.

### Changed

- Test suite at 307 cases; coverage gate at lines 97.77%, branches 86.63%,
  functions 93.91%.

## [0.55.0] - 2026-11-27

### Added

- **Ruby support**: class/module/def symbols (singleton `self.`, `?!=` suffixes,
  expression-body defs), `attr_reader`/`attr_writer`/`attr_accessor` properties,
  constants, and `require`/`require_relative`/`load` imports with local
  `.rb`/`index.rb` edges; Gemfile stack detection (Rails, Sinatra, RSpec, Puma,
  Sidekiq, ...).
- **Swift support**: class/struct/actor/enum/protocol/extension with
  func/init/typealias symbols; extension methods are attributed to the extended
  type; module-level `import` (including `@testable` and submodule imports) is
  recorded without inventing file edges; Package.swift dependency detection.
- **Scala support**: class/case class/trait/object/enum and def symbols;
  grouped, renamed (`=>`), `as` and `._`/`.*` imports resolved through dotted
  path suffixes; build.sbt dependency detection (Spark, Akka, Cats, ZIO,
  http4s, ScalaTest, ...).

### Changed

- Indexed languages grow from 8 to 11; manifest detection adds `Gemfile`,
  `Package.swift` and `build.sbt`, and `.rb`/`.rake`/`.swift`/`.scala` are
  indexed as source. Swift's module-level imports deliberately produce no
  file-level edges (no guessing).
- Test suite at 305 cases; coverage gate at lines 97.77%, branches 86.53%,
  functions 93.88%.

## [0.54.1] - 2026-11-27

### Added

- **Panel run snapshot**: the single-workspace stats row now renders the last
  extract from `knowledge/<locale>/_index.json` (`lastExtract`), including
  failure and retry counts; a run with failures switches to the error colour
  and `role="status"`, and the line carries the run timestamp as a tooltip.
  Switching to a workspace without a session/assets resets the snapshot so a
  stale run is never shown.

### Changed

- Client tests cover the snapshot line (success, failure styling, and the
  manifest-missing case). A missing `knowledge/` directory (index only) now
  renders an empty card set instead of a read failure. Test suite at 294
  cases; coverage gate at lines 97.65%, branches 86.03%, functions 93.66%.

## [0.54.0] - 2026-11-27

### Added

- **Persisted extract run snapshot**: `knowledge/<locale>/_index.json` bumps
  to schema v2 and records `lastRun` (generatedAt, extracted/skipped counters,
  orphaned, failed, retried, capped, concurrency, attempts, durationMs).
- **Status diagnostics**: `repowiki-status` reads the snapshot and reports
  `lastExtract`, including a readable "Last extract" line; missing manifests
  render "none" instead of failing.

### Changed

- Test suite at 292 cases; coverage gate at lines 97.62%, branches 85.7%,
  functions 93.65%. `docs/compatibility.md` records the knowledge-manifest v2
  contract (v1 still readable).

## [0.53.2] - 2026-11-27

### Added

- **Section-level wiki deep links**: clicking a wiki citation now opens the
  page and scrolls to its first cited section. The client reuses the shared
  heading anchor function, so Markdown headings and the scroll target agree;
  manual page selection/back clears the target.

### Changed

- Test suite at 290 cases; coverage gate at lines 97.62%, branches 85.9%,
  functions 93.6%.

## [0.53.1] - 2026-11-27

### Added

- **Clickable wiki citations**: page titles in the card detail "Cited by wiki"
  section are buttons that switch to the Wiki tab and open that page, with an
  `aria-label` for keyboard/screen-reader users. Stub-React regression covers
  the full jump.

### Changed

- Test suite at 290 cases; coverage gate at lines 97.6%, branches 85.9%,
  functions 93.6%.

## [0.53.0] - 2026-11-27

### Added

- **Extraction retry with exponential backoff**: each file gets `attempts`
  (1–3, default 2) model calls. Thrown errors and unusable structured output
  retry after 200ms/400ms (capped at 1s); explicit model `skip` results are
  terminal and never retried. Backoff is abort-aware, and cancellation is not
  recorded as a file failure.
- **Plan field**: `repowiki-plan.json` gains `attempts`, normalized and
  clamped; the tool parameter overrides it. Results report effective
  `attempts` and the number of `retried` calls.

### Changed

- Test suite at 289 cases; coverage gate at lines 97.6%, branches 86.0%,
  functions 93.6%.

## [0.52.0] - 2026-11-27

### Added

- **Bounded extraction concurrency**: `repowiki-extract` accepts
  `concurrency` (1–4, default from `repowiki-plan.json` or 1) and dispatches
  that many file extractions in parallel. Model calls stay outside the asset
  lock; card writes still enter the per-root critical section one at a time,
  and cancellation stops new dispatches. Failure lists are sorted by path so
  concurrent runs remain reproducible.
- **Plan field**: `repowiki-plan.json` gains `concurrency`, normalized and
  clamped to 1–4; the tool parameter overrides it.

### Changed

- Test suite at 286 cases; coverage gate at lines 97.6%, branches 86.0%,
  functions 93.53%.

## [0.51.0] - 2026-11-27

### Added

- **C# / Kotlin / PHP indexing**: symbol extraction for C#
  (class/interface/struct/record/enum, first-level methods/constructors),
  Kotlin (class/data class/enum class/object/interface, `fun`, constructors,
  nested-type ownership) and PHP (class/interface/trait/enum, methods,
  top-level functions) with visibility flags. `EXTENSION_LANGS` now covers
  eight languages.
- **Local dependency edges**: C# `using` (global/static/alias) resolves through
  a dotted-path index; Kotlin `import` (including `.*` and `as`) uses the same
  index; PHP `use` (group/function/const/alias) resolves case-insensitively
  and literal `require`/`include` paths (including `__DIR__ . '/x.php'`)
  resolve relative to the file.
- **Composer stack detection**: `composer.json` dependencies map to Laravel,
  Symfony, PHPUnit, Doctrine, Guzzle, etc., with package-prefix fallback and
  `dependencyCounts.composer`.
- **Prompt fences**: extract prompts now fence Go/Rust/Java/C#/Kotlin/PHP
  sources with their language identifiers for better highlighting.

### Changed

- Test suite at 283 cases; coverage gate at lines 97.59%, branches 86.0%,
  functions 93.48%.

## [0.50.0] - 2026-11-27

### Added

- **Wiki citation reverse lookup**: `repowiki-cards wikiReferences=true` returns
  the wiki pages and section headings that cite each matched source file
  (`wikiReferences: [{path, slug, title, sections}]`, bounded to 100 entries).
  The panel detail pane shows "Cited by wiki" with page titles and sections;
  both read only `wiki/<locale>/_index.json` (no page re-reads).
- **Wiki manifest v2**: each page now records `sections: [{heading, sources}]`
  alongside the page-level `sources` union, enabling section-level citation
  reverse lookup. v1 manifests remain readable and degrade to page-level.
- **`src/wiki-references.js`**: pure builder/normalizer with `#Lx-Ly` stripping,
  deduplication and bounded lookup; covered by `test/wiki-references.test.js`.

### Changed

- Test suite at 275 cases; coverage gate at lines 97.68%, branches 85.8%,
  functions 93.28%.

## [0.49.0] - 2026-11-27

### Added

- **Line-level reverse references**: index edges now carry `line` (the
  import/use/require statement), and `repowiki-cards references=true` returns
  `referencedBy: [{path, line}]` sorted by path then line. The panel shows
  `path:Lx` sites in the detail pane. Indexes before schema v5 degrade to
  path-only references instead of failing.

### Changed

- **Index schema v5**: `edges[].line` is part of the contract; `readIndex`
  accepts v2–v4 and upgrades derived fields in memory; the next
  `repowiki-index` writes v5.
- Test suite stays at 268 cases; coverage gate at lines 97.61%, branches
  85.8%, functions 93.06%.

## [0.48.0] - 2026-11-27

### Added

- **Symbol-level reverse references**: `repowiki-cards` accepts
  `references=true` and returns, for every matched symbol, the indexed files
  that import it (`references: [{path, symbol, referencedBy}]`, bounded to 100
  entries with `referencesTruncated`). Semantics are import/use/require level
  (not a call graph): side-effect imports and self references are skipped.
- **Panel reverse references**: the card detail pane shows "Referenced by
  (import-level)" with each symbol and its importing files, computed from
  `index.edges` with no extra remote reads.
- **`src/references.js`**: pure, zero-dependency reverse-index builder and
  bounded query helper; covered by `test/references.test.js`.

### Changed

- Test suite at 268 cases; coverage gate at lines 97.60%, branches 85.93%,
  functions 93.01%.

## [0.47.0] - 2026-11-27

### Added

- **Multi-language indexing**: Go (functions, receiver methods, structs,
  interfaces, aliases, exported const/var), Rust (fn, impl/trait methods,
  struct/enum/trait/type, const/static, `mod`, nested `use` groups) and Java
  (class/interface/enum/record, constructors, first-level methods) with
  visibility flags. Extension map, manifest table and symbol dispatch live in
  `src/schema.js` / `src/symbols.js`.
- **Local dependency edges for the new languages**: Go imports resolve through
  the `go.mod` module prefix to the package's representative file; Rust
  `mod`/`crate::`/`self::`/`super::` resolve through crate roots and module
  conventions; Java imports (including wildcard and static-member forms) match
  package suffixes through a class-name index. Unresolved/external imports
  never create edges.
- **JVM stack detection**: `pom.xml`, `build.gradle` and `build.gradle.kts` are
  recognised; Maven/Gradle coordinates map to a shared JVM technology table
  (Spring Boot, JUnit 5, Kotlin, ...) with a groupId-prefix fallback.
- **Git provenance**: `index.json` gains `git: {branch, commit, shortCommit}`
  read from `.git/HEAD` (loose refs, packed-refs, worktrees, detached HEAD) with
  no subprocess. `repowiki-index` and `repowiki-status` report it; the panel
  shows a branch badge. Index schema bumped to v4 (v2/v3 remain readable and
  gain derived fields in memory).
- **Language distribution**: `stats.languages` in the index, exposed by
  `repowiki-index`/`repowiki-status` and summarised in the panel.
- **Multi-locale runs**: `repowiki-extract` and `repowiki-generate` accept
  `locales: ['zh','en']`; work runs sequentially per locale, `byLocale`
  reports counters/pages, and the top-level fields mirror the first locale.

### Fixed

- Accepting or rejecting a memory entry no longer duplicates its heading: the
  body rewrite strips the leading heading after the frontmatter newline.

### Changed

- Test suite at 262 cases; coverage gate still enforced (lines 97.56%, branches
  85.64%, functions 92.89%). `docs/compatibility.md` records the v4 contract.

## [0.46.0] - 2026-11-27

### Added

- **Engineering gates**: TypeScript `checkJs` (progressive: new modules carry
  `// @ts-check`, shared `src/types.d.ts` declares `FsService` / `PluginContext` /
  `ToolDefinitionLike`), ESLint flat config, `npm run typecheck` / `npm run lint`.
- **CI matrix**: Linux and macOS blocking plus Windows canary, Node 22/24;
  coverage gate (lines ≥95, branches ≥85, functions ≥85), secret scan, CodeQL,
  Dependabot, `npm audit`, CycloneDX SBOM artifact.
- **Release automation**: `scripts/release.mjs` (clean tree, CHANGELOG check,
  tests, local commit/tag, never pushes) and a tag-triggered GitHub Release
  workflow; `CONTRIBUTING.md`, `SECURITY.md`, `docs/runbook.md`,
  `docs/compatibility.md`, `docs/benchmarks.md`.
- **Benchmark harness**: `scripts/bench.mjs` (synthetic repo, Node fs adapter);
  measured 1,000 files in 32 ms / 66 MiB and 5,000 files in 123 ms / 86 MiB.
- **ADR-0007**: data versioning and write verification (schema v3, read-back
  checks, explicit non-goal of atomic rename via `ctx.fs`).

### Changed

- Test suite grew to 235 cases; coverage is reported per file in `docs/coverage.md`.

## [0.45.0] - 2026-11-27

### Added

- **`.gitignore` subset** (`src/ignore.js`): root `.gitignore` / `.repowikiignore`
  with comments, `!` negation, anchoring, directory suffixes, `*` / `?` / `**`
  (last match wins); ignored entries are counted (`ignored`) and never consume
  the file budget.
- **Zero-dependency BM25 search** (`src/search.js`): Latin words plus CJK
  unigrams/bigrams, weighted fields (title 3, summary/tags 2, body 1);
  `repowiki-cards` gains `target=symbols|docs|all` and `includeMemory`, returning
  ranked cards, wiki pages and accepted memories with bounded snippets.
- **Module-level wiki**: `repowiki-generate` accepts `granularity=theme|module|all`;
  module pages are deterministic (no model calls), live under
  `wiki/<locale>/modules/`, and every run writes `wiki/<locale>/_index.json`
  (ordering, grouping, `inputDigest`).
- **Stale / orphan detection**: wiki pages carry `inputDigest`; the panel groups
  pages by manifest and flags orphans; `repowiki-status` reports index/cards/wiki/
  memory health, plan source and in-process lock queue (read-only, no LLM).
- **Panel UX**: deferred card search, incremental rendering (120 + load more),
  sort by path/title/updated, tag chips, wiki search, copy-path button,
  tab semantics (`role=tablist/tab`), `aria-live` status, `/` search shortcut.

### Fixed

- Wiki page writes are isolated per page (`failed` list), duplicate slugs are
  renamed (`-2`, `-3`) instead of silently overwriting, and LLM-provided sources
  pass through `sanitizeSources` (index/card whitelist, strict `#Lx-Ly` form).

## [0.44.0] - 2026-11-27

### Added

- **Link allowlist in the panel**: `safeHref` permits only `#anchor`, `http(s)`
  and `mailto`; `javascript:`, `data:`, `vbscript:`, `file:` and protocol-relative
  URLs render as plain text; in-page anchors no longer open a new tab.
- **End-to-end cancellation**: `buildIndex` and `copyTree` accept an `AbortSignal`;
  index/export/import report `aborted` with a hint, and a cancelled index run
  never overwrites the previous `index.json`.
- **Verified writes**: `writeTextVerified` reads back every asset write
  (index, knowledge manifest, cards, wiki pages, memory) and throws on mismatch.
- **Index schema v3**: `files[].module`, `modules[]` and `stats.modules` become
  part of the contract; v2 indexes are upgraded in memory and rewritten as v3 on
  the next `repowiki-index`.
- **Memory integrity**: same slug with a different title gets a hash suffix
  instead of overwriting; same title updates in place; accept/reject records
  `reviewedAt`.

### Changed

- **Lock scope narrowed** (ADR-0005 revised): extract/generate perform model
  calls outside the lock and re-check freshness / manual-edit protection inside
  the write critical section; index/import/edit/memory keep whole-operation locks.

## [0.43.0] - 2026-11-27

### Added

- **Module hierarchy** (aligned with Qoder Repo Wiki, ADR-0006): index entries
  now carry `module` (directory grouping, depth ≤2), and the index carries
  `modules[]` (path / parent / direct files / direct symbols). `repowiki-cards`
  accepts a `module` filter (submodules included) and returns the module tree;
  `repowiki-extract` writes `knowledge/<locale>/_index.json` — a derived JSON
  manifest mapping modules to card slugs.
- **Source grounding**: cards cite the source file and annotate key symbols
  with line numbers taken from the index; wiki pages now render a page-level
  referenced-files block, an auto table of contents (≥2 sections) and
  per-section sources as relative paths with optional `#Lx-Ly` ranges.
  LLM-provided sources pass through `sanitizeSources` (card/index whitelist +
  strict range form) before rendering.
- **Panel module grouping**: the cards tab has a "Group by module" toggle that
  works with both grid and list views; older indexes derive the module from
  the file path on the fly.

### Fixed

- **Concurrent writes** (phase-16 review O5, ADR-0005): all six mutating tools
  (index / extract / generate / import / edit / memory write+accept+reject)
  now serialize per asset root through an in-process FIFO lock, so concurrent
  tool calls or sessions sharing one directory can no longer interleave
  read-modify-write. Read paths (cards / export / memory list) stay lock-free.
  Known limits (in-process only, long lock during LLM dispatch) are documented.

## [0.42.0] - 2026-11-27

### Optimized

- **Empty state styling** (user feedback on "无法滑动"): improved the empty state messages with better padding and presentation. The "loading" and "empty" messages now have consistent visual treatment with the rest of the UI.

## [0.41.0] - 2026-11-27

### Optimized

- **Card row list style** (user feedback: "列表视图下宽度太长了"): converted the card row from bordered cards with `border-radius: 12px` and `marginBottom` to a compact list with a thin `0.5px` bottom border and minimal padding. The new style eliminates visual bulk and aligns with more traditional list views.

## [0.40.0] - 2026-11-27

### Changed

- **Knowledge cards auto-scroll to detail** (user request): when clicking a card, the detail pane now smoothly scrolls into view (centered) so the full content is visible. Guarded for safety in test environments.

## [0.39.0] - 2026-11-27

### Changed

- **Empty states use the host's empty pattern** (practices.md: "Copy spacing,
  font sizes and colors from the host pages"): aligned to
  `dsh-client-ui-schedule/src/client/TaskManagerPage.module.css` — empty
  containers now have `padding: 48px 20px`, centered text, and the host's
  tertiary color at 14px/1.6 line height. This replaces the former minimal
  `p` with muted color. (`--dsw-alias-label-tertiary` already from the
  palette.)

### Changed

- **Card-row & overview stats adopt host's label-tertiary** (practices.md):
  stats now use 11.5px font, 16px line height, color
  `--dsw-alias-label-tertiary` instead of 12px/secondary. Also updated the
  card-row primary text weight from 600 to 500 and its gap from 10 to 16 to
  match the host's row pattern.

## [0.38.0] - 2026-11-27

### Changed

- **Overview rows adopt the official management-list pattern**
  (practices.md: "The Plugin Manager page is the reference for management
  lists"): verified against the shipped `PluginManagerPage.module.css` —
  rows are borderless with `0.5px` hairline separators (`border-l2`, none
  on the last row), `padding: 12px 2px`, gap 16, row titles 13.5px /
  weight 500, secondary lines in the monospace stack at 11.5px / 16 line
  height with `label-tertiary`. Our rows were card chips (bordered,
  radius, 8px margins). The workspace rows now read exactly like the
  sibling host pages' lists. (`--dsw-font-mono` has no CSS definition in
  the shipped styles — the official pages' own mono stack is their
  fallback chain, which we use verbatim; `label-tertiary` joined the
  15 tracked tokens.)

## [0.37.0] - 2026-11-27

### Changed

- **Page structure aligned with the reference pages** (continuing the
  layout audit opened by the scroll bug): the closest sibling page
  (TaskManager, which sits beside our entry in the same automation area)
  uses a two-layer structure — a full-width scroller with the centered
  960px content column inside, so "the 960px column reaches the
  scrollbar". Our single-layer 960px scroller placed the scrollbar inset
  from the viewport edge on wide screens. Restructured to the official
  shape: the outer layer owns scrolling (`height:100%; overflow-y:auto;
  overflow-x:hidden; scrollbar-gutter: stable`), paints the page's base
  background (`--dsw-alias-bg-base`) and sets the sibling pages' base
  typography (14px / 1.6); the inner column carries the 960px width,
  responsive `clamp(24px, 4vw, 48px)` inline insets, 48px bottom inset,
  and the top clearance. DOM regression asserts both layers.

## [0.36.0] - 2026-11-27

### Fixed

- **macOS top-strip clearance** (same layout-audit pass as v0.35.0): the
  shipped AppFrame CSS documents that entry pages in the main panel pad
  their top by `--dsh-frame-top-clearance` (48px on darwin) so leading
  content clears the window's top strip (traffic lights, sidebar toggle);
  the two reference pages (PluginManager, TaskManager) both apply it.
  Our page used a flat `24px` top padding. The root now uses
  `padding-top: calc(24px + var(--dsh-frame-top-clearance, 0px))` —
  platforms without the variable fall back to the previous 24px, and the
  bottom padding widens to 48px to match the reference pages.

### Changed

- The drift checker now also tracks `--dsh-*` layout tokens (definition
  source extended with the layout package's `AppFrame.module.css`);
  13 tokens tracked (9 alias + 4 size).

## [0.35.0] - 2026-11-27

### Fixed

- **The panel page could not scroll** (user report: "知识库页面无法滑动，
  导致信息无法看见"): the page root was a plain padded `div` while the
  host's `mainPanel` is a flex column with `overflow: hidden` — pages are
  expected to manage their own scrolling (verified from the shipped
  `dsh-client-ui-layout` AppFrame CSS, and from the reference
  `PluginManagerPage.module.css`, which uses `height: 100%` +
  `overflow-y: auto` with "the main header and content share one scroller").
  The page root now carries `height: 100%; box-sizing: border-box;
  overflow-y: auto; overflow-x: hidden`, so the whole panel scrolls.
  Regression asserts the scroll declarations on the rendered root.

## [0.34.1] - 2026-11-27

### Fixed

- `npm test` in CI caught a real testing bug: importing
  `scripts/verify-host-tokens.mjs` from `test/react-parity.test.js`
  executed the script's top-level `main()` — with no app.asar on the CI
  runner it exited 3 and killed the test file, and on a machine with an
  asar present it exited 0 and made the test **falsely pass** (no
  assertion ever ran). The script now runs `main()` only as a direct
  entry (`import.meta.url === argv[1]`), so imports stay side-effect
  free. (v0.34.0's tag sits on the red commit; the fix is here.)

## [0.34.0] - 2026-11-27

### Added

- **React parity guard** (`test/react-parity.test.js`): `npm outdated`
  flagged react/react-dom 18.3.1 vs latest 19.3.1 — verified against the
  shipped app instead of guessing: the host's own web-frontend bundle
  embeds **React 18.3.1**, exactly our devDependency pin, so the test
  suite runs against the same API the panel uses at runtime (no reason to
  chase React 19). The new test extracts the host's embedded version from
  app.asar and fails locally when a future host upgrade diverges; skips
  where no app.asar exists (CI), like the token drift check. The asar
  helpers of `scripts/verify-host-tokens.mjs` are now exported for reuse.

### Verified

- `npm audit`: 0 vulnerabilities (the v0.17.0 supply-chain claim still
  holds across all dependency refreshes since).

## [0.33.0] - 2026-11-27

### Fixed

- **O7 — card slug collisions no longer silently overwrite** (deferred from
  the v0.32.0 code review): `cardSlug` normalizes both `src/a b.js` and
  `src/a-b.js` to `src-a-b`, so the second card overwrote the first
  without any report. `writeCard` now reads the target file's frontmatter
  when it exists; if its recorded source path differs, the card is written
  with a stable 8-character hash suffix derived from the source path
  (deterministic across reruns — a refresh of the same file lands on the
  same path). Regression: two colliding paths produce two distinct files
  and the suffixed card keys on its own path.
- **O2 — copy failures carry reasons, not just a count** (also deferred):
  `copyTree` returns a bounded `failed` list ({path, reason}, first 20)
  for unreadable files/directories and depth-capped subtrees; the export
  and import tools pass it through their output schemas and render the
  items, so "50 skipped" no longer means "guess which and why".

## [0.32.0] - 2026-11-27

### Fixed

Findings from an independent code review of the Host side (a subagent read
all 22 `src/` modules; transcript in `docs/checkpoints/phase-16-code-review.md`).

- **F1 — Wiki page slugs are now sanitized** (`src/knowledge.js`): LLM
  output reached `path.posix.join` unsanitized, so a `slug` like
  `../../../../tmp/evil` would write outside the asset directory. Added
  `wikiSlug()` (lowercase + `[a-z0-9-]` whitelist + length cap + empty
  fallback) enforced inside `wikiPath()` so every caller is safe, and a
  `pattern: '^[a-z0-9-]+$'` constraint on the wiki output schema as a
  second line of defense. Cards were already safe via `cardSlug`; the
  Wiki side had no equivalent. Regression: traversal attempts stay inside
  `wiki/<locale>/` on disk.
- **F2 — `hint` is now declared in the six tools' output schemas**: the
  degrade paths returned `hint` while the schemas declared
  `additionalProperties: false` — if the host ever validates execute
  results, every degradation would have failed. Zero behavior change.
- **F3 — cancellation reaches the LLM loops**: `repowiki-extract` now
  checks `exec.signal.aborted` before each subagent dispatch (previously a
  timeout/cancel would keep dispatching activations and record every
  remaining candidate as `failed`, spending LLM budget on a dead run);
  `repowiki-generate` checks before each page write. Both report a
  `Cancelled: …` hint. Regression with a pre-aborted signal.
- **F4 — `capped` no longer lies**: the file budget counts every walked
  file (not just sources), so 5000 non-source files could exhaust it
  while `capped: false` claimed the index was complete. The walk now
  tracks an explicit `stopped` flag and `capped` reports the truth.
  Regression: 150 Markdown files + 10 sources at `maxFiles: 100` yields
  `capped: true`.
- **F6 — memory accept/reject slugs validated**: the `slug` argument
  reached `path.posix.join` without a whitelist (write was safe via
  `slugifyMemory`, accept/reject was not). Non-conforming slugs now get an
  explicit `invalid` status with a hint. Regression: traversal slug
  refused.
- **O1 — `copyTree` depth cap** (24, matching the indexer): an unbounded
  recursive walk over a user-supplied snapshot could stack-overflow on a
  pathological tree.
- **O6 — numeric clamps**: `maxFiles: -1` stopped the walk immediately
  with a misleading `capped: false`; `limit: 0` produced
  `truncated: true` with an empty result. Both clamp to `>= 1`.
- **O8 — extraction prompts use four-backtick fences**: source code
  containing ``` could escape a three-backtick fence and inject
  instructions into the extraction prompt; output stays schema-bound but
  the fence is no longer trivially escapable.

### Changed

- **F5 — the import tool description now tells the truth**: `overwrite`
  merges the snapshot into existing assets and never deletes anything
  (the implementation was always a merge; the description claimed a
  replace). No behavior change.
- `sizeBytes` in index.json is documented as the character count it
  actually is (name kept for compatibility with existing corpora).
- Dead code removed: `listKnowledgeFiles` (no production caller) and an
  unused `outcome` variable in `writeIndex`.

## [0.31.0] - 2026-11-26

### Changed

- **Focus parity for the memory and wiki detail views** (extending
  v0.30.0's card-detail focus management): opening a memory entry or a
  wiki page now focuses its back button; closing (back button or Escape)
  returns focus. One structural difference found and handled: those
  detail views swap the whole panel, so the triggering list item is
  unmounted — returning focus to it would have been a silent no-op on a
  detached node (the first test version caught exactly this). The
  restore now checks `isConnected` and falls back to the corresponding
  tab button, so keyboard users always land somewhere sensible.
- A focus-consistency helper (`openWithFocus` / `closeWithFocus`) is now
  shared by all three detail flows (cards inline, memory/wiki panel
  swaps).

### Added

- Real-corpus fixture gained a memory entry
  (`test/fixtures/repo-corpus/memory/zh/ui-panel-state-machine.md`),
  enabling the DOM focus regression for the memory detail (136/136).

## [0.30.0] - 2026-11-26

### Changed

- **Detail-pane focus management** (the accessibility observation from the
  v0.27.0 review): opening a card's detail now moves focus to the detail's
  close button so keyboard users can act immediately; closing the detail
  (button or Escape) returns focus to the tile that opened it. The focus
  capture duck-types a focusable element instead of relying on a global
  `HTMLElement` (the DOM test harness only sets `document`, where
  `instanceof HTMLElement` throws and the guard would have swallowed the
  failure — the failing tests caught this before release).

### Added

- `test/client-dom.test.js`: focus regression — real click after focusing
  a tile, assert `document.activeElement` is the detail's close button;
  after Escape, assert it is back on the tile (135/135).

## [0.29.0] - 2026-11-26

### Added

- **Release-consistency guard** (`test/pack.test.js`): asserts
  `package.json`'s version equals the newest version heading in both
  CHANGELOG.md and CHANGELOG.zh-CN.md — a version bump without the
  matching changelog entry is now a test failure instead of a silent
  drift. (It caught its own first use: I bumped the version before
  writing this entry and the suite went red until the entry existed.)

### Changed

- README (both languages): test count refreshed to 133 (was stale at
  122 from v0.23.0).

## [0.28.0] - 2026-11-26

### Changed

- **Border radii now use the host's tokens** (practices.md: "Copy spacing,
  type sizes, and row patterns from an existing host page of the same
  kind"). Audited the official Plugin Manager page CSS: it uses
  `--dsw-radius-sm/md` (8/12px, defined in `dsh-client-ui-theme/src/styles/
  base.css`) for its controls and cards. The panel's hardcoded radii are
  now tokenized: buttons/inputs/code blocks → `--dsw-radius-sm` (was 8),
  card tiles/detail panes/page containers → `--dsw-radius-md` (was 10,
  matching the host page's card radius), small pills → `--dsw-radius-xs`
  (was 4); status dots (50%) and tag pills (999) keep their fully-rounded
  form. Literal fallbacks preserve the old values if a token is missing.
- **The drift checker now covers every `--dsw-*` token**, not just
  `--dsw-alias-*` (9 alias + 3 radius = 12 tokens currently). Two rule
  classes: alias (color/semantic) tokens must have a dark-mode override;
  size tokens (radius etc.) need only exist. The collection regex also
  stops mistreating documentation wildcards (`var(--dsw-alias-*)` in
  comments) as tokens.

## [0.27.0] - 2026-11-26

### Fixed

- **Empty-state copy bug** (found by the UI/UX review): when a filter or
  search produced zero rows, the panel rendered the pending-file hint
  ("no knowledge card generated for this file yet") unconditionally —
  actively misleading under the generated/stale filters or a failed search.
  The empty branch now chooses copy by context: `emptySearch` (with the
  query interpolated) when a query is active, otherwise per filter
  (`emptyCards` / `emptyGenerated` / `emptyDone` / `emptyStale`).
  Regression test in `test/client-smoke.test.js`.

### Changed

- **Overview mode now refreshes when the page becomes visible** (the
  visibilitychange handler previously only reloaded the single-workspace
  view, so returning from a generation session showed stale overview
  stats); driven by a new `overviewTick` state in the overview load
  effect.
- Single-workspace mode with no workspace selected now shows a guidance
  line (`pickHint`) instead of an empty body.
- Primary button text uses the official `--dsw-alias-label-on-color`
  token instead of a hardcoded `#ffffff` (the button background lightens
  in dark mode via `state-business-primary`; the on-color token has the
  matching dark override). The drift checker now tracks 9 tokens.

### Added

- `test/icon.test.js`: full-bleed tile guard — the icon must not carry a
  near-origin rect ≥34×34 (artwork.md: Plugin Manager draws the
  surrounding tile; the centered 22×22 card matches the official
  forge-bundle sample). Fills the blind spot the review flagged.
- `docs/checkpoints/phase-14-ux-review.md`: the review transcript,
  applied fixes, and retained observation items.

## [0.26.0] - 2026-11-26

### Changed

- **Icons aligned with the official product treatment** (audited against
  `references/artwork.md` and two first-party samples extracted from
  app.asar):
  - `icon.svg`: was a 96×96 full-bleed blue rounded tile — artwork.md
    says Plugin Manager draws the surrounding tile itself. Redrawn at the
    official 36×36 canvas with a 22×22 gradient card (`#69B9FF`→`#324DE2`,
    the same treatment as the shipped forge-bundle icon) carrying a white
    open-book glyph with light-blue symbol rows.
  - Client sidebar icon (`RepoWikiIcon`): was 96×96 with fixed blue/white
    fills; redrawn as a 24×24 `currentColor` stroked glyph (open book +
    symbol rows, `fill="none"`), matching the product icon set convention
    where color rides currentColor and adapts to both themes.
- Corpus fixture card describing the icon updated (it feeds the client
  render regression).

### Added

- `test/icon.test.js`: guards both icons structurally — 36×36/24×24
  canvases, no `<text>`/`<font>`/`<script>`/`<style>`/`<image>`/
  foreignObject/animation/remote refs, unique local ids, currentColor on
  the sidebar glyph, no residual fixed colors, ≤256 KiB (132/132).

## [0.25.0] - 2026-11-26

### Added

- **Plugin-manager detail page** per `references/plugin-details.md`:
  `docs/detail/DETAIL.md` (+ `DETAIL.zh.md`) is exactly one image line
  referencing a text-free 640×300 feature illustration (`preview.svg`,
  shared across locales — source files → symbol index → knowledge cards and
  wiki pages; no text/fonts/scripts/remote resources, self-contained light
  background so it stays readable in dark themes). Both `locale/{en,zh}.json`
  now declare `meta.detail`; `files` ships exactly `docs/detail` (the
  internal ADR/checkpoint docs stay out of the tarball).
- **Richer plugin metadata**: `meta.description` in both locales now states
  the trigger location ("Repo wiki sidebar entry beside the scheduled-tasks
  icon"), the added LLM requests (extract/generate spawn subagents
  inheriting the session model), the data location, and what turning the
  plugin off does — the fields the detail page is expected to carry.

### Changed

- `test/pack.test.js`: detail-page files are now required in the tarball;
  internal `docs/` trees (adr/checkpoints/coverage) stay excluded.
- `test/locale.test.js`: now also guards the detail document (exactly one
  image line with alt text, image exists) and the SVG conventions
  (640×300, no text/font/script/style/foreignObject/remote refs, ≤5 MiB).

## [0.24.0] - 2026-11-26

### Added

- **Pack completeness guard** (`test/pack.test.js`): runs `npm pack
  --dry-run` and asserts the tarball contains every runtime file (entry
  points, client, loader patch, icon, both locales, every `src/*.js`) and
  excludes dev-only paths (`test/`, `scripts/`, `docs/`, `.github/`,
  CHANGELOGs). The `files` field is hand-maintained — a new `src` module or
  locale silently missing from the shipped bundle was previously
  undetectable by CI. Also asserts `exports` targets are packed and
  runtime dependencies stay empty.
- **The drift checker is now tested itself** (`test/verify-host-tokens.test.js`):
  builds synthetic asar archives (header + byte-offset file layout, the real
  format) in a temp dir and drives `scripts/verify-host-tokens.mjs` through
  its pass / missing-token / no-dark-variant paths with `DSH_APP_ASAR`
  pointed at the fixture. Until now the script only ever ran on machines
  with a real app.asar (CI always skips) — its header parsing and offset
  arithmetic had zero regression protection.

## [0.23.0] - 2026-11-26

### Changed

- **Bilingual facade completeness**: `CHANGELOG.zh-CN.md` added as a
  Chinese summary mirror of this file (cross-linked from both headers);
  `README.zh-CN.md` was stale at v0.20.0 and is now at parity
  (token-evidence and host-drift-check sections, npm scripts, directory
  layout, 122→123 test counts).
- **Plugin metadata updated**: `locale/{en,zh}.json` meta descriptions
  still described the Phase 1 state ("provides repowiki-index and
  repowiki-cards") — now describe the full bundle (deterministic index,
  LLM cards and wiki, cross-session query, import/export, memory review,
  GUI panel) and list all eight tools by name.

### Added

- `test/locale.test.js`: facade-consistency guard — both locale files must
  be valid JSON with meta title/description, and every tool name must
  appear in both descriptions (123/123).

## [0.22.0] - 2026-11-26

### Added

- **Host theme-token drift check** (`scripts/verify-host-tokens.mjs`,
  `npm run verify:host`): parses the local `app.asar`, extracts dsh's own
  bundled CSS, and verifies every `--dsw-alias-*` token referenced by
  `client.js` is still defined by the theme package and has a dark-mode
  (`body[data-ds-dark-theme]`) override. The token list is collected from
  `client.js` itself, so it never goes stale. Exits 3 (skip, not fail) where
  no `app.asar` exists — e.g. CI runners. Also wired as
  `test/host-tokens.test.js`, which skips gracefully in CI and asserts
  locally (122/122 locally, skips on GitHub Actions).
- `npm scripts` (`test`, `test:coverage`, `verify:host`) — previously tests
  were invoked with raw `node --test`.

### Changed

- README: development/testing and upgrade-operations sections now document
  the drift check as part of the per-dsh-upgrade regression pass.

## [0.21.0] - 2026-11-26

### Changed

- **Theme tokens are now statically verified against the app's own CSS**
  (the "official token" claim from v0.13.1 was second-hand — the token
  names were lifted from another official page's stylesheet). By parsing
  `app.asar` (8-byte size header + headerSize + per-file offsets) and
  extracting the bundled stylesheets, the evidence is now primary:
  - `dsh-client-ui-theme/src/styles/design-platform.css` defines **all
    264 `--dsw-alias-*` tokens**, each with a light definition and a
    `body[data-ds-dark-theme]` dark override — dark-mode redefinition is
    real, not assumed.
  - The main web shell CSS consumes `var(--dsw-alias-*)` **348 times**;
    200 of the 233 bundled CSS files reference the alias system.
  - All 7 tokens this panel uses (label-primary/secondary, bg-layer-1/2,
    border-l2, state-business-primary, state-error-primary) are among the
    264. Method and citations recorded in ADR-0004 §5; literal-color
    fallbacks kept as a second safety net.
- **Status dot recolored for distinguishability** (user feedback: the
  generated/pending gray-vs-blue dots were hard to tell apart). The
  "generated" dot now uses `--dsw-alias-state-done-primary`
  (violet `rgb(124,58,237)`, light and dark variants) instead of the
  blue `state-business-primary` — hue distance from the gray pending dot
  is much larger at the 8px render size. Regression assertions added to
  `test/client-smoke.test.js`.

## [0.20.0] - 2026-11-26

### Added

- **Fault-injection DOM suite** (`test/client-faults.test.js`, 8 tests) —
  the degradation chain was previously only proven on the happy path:
  - **The ErrorBoundary is now positively verified under real React**:
    injecting a render-time-throwing element (via the page's `notice` slot)
    yields the inline "Repo wiki panel error: …" message instead of a
    blanked slot, and `componentDidCatch` logs with the `repowiki:` console
    prefix. Before this, the v0.14.0 boundary had never actually fired —
    a wrong class signature would have made it silently useless exactly in
    the failure mode it was built for (the user's "click does nothing").
  - Load failure → error state with the error code interpolated into the
    message + a working retry button.
  - Single-view no-session / no-asset branches; per-workspace failure rows
    in the overview.
  - A corrupt remote result (structural anomaly) skips one card without
    failing the whole enumeration; multi-page reads with a lying `eof`
    still paginate correctly.
  - List view (CardRow render path) now covered.
- DOM test machinery extracted to `test/lib/dom-harness.mjs` (shared by
  the normal-path and fault suites; supports `notice`, `t`, `wrapRead`
  injection points).

### Changed

- Coverage again: overall 94.7% → **96.1%** lines, `client.js`
  91.1% → 95.4% (85.8% functions). Remaining uncovered client lines are
  the sidebar icon (rendered only in the sidebar slot) and defensive
  abort branches.

## [0.19.0] - 2026-11-26

### Fixed

- `repowiki-extract` execute result was missing `skippedManual` and
  `orphaned`, both declared **required** by the tool's output schema —
  the render layer would have printed "undefined manually edited" and the
  result would not have satisfied the declared contract. Both fields are
  now returned (found by the new execute-path coverage, not by a user
  report).

### Added

- **LLM execution paths are now covered by tests with a contract-level
  subagent stub** (`test/tool-llm.test.js`) — previously `runSubagent`
  and the `repowiki-extract` / `repowiki-generate` execute paths (the
  plan's core LLM seam) had zero coverage while the rest of the suite sat
  at 90%+. The fake `ctx.subagents.startActivation` returns
  schema-constrained structured card/page JSON and records every dispatch
  spec; tests assert the activation contract (provider `spawn`,
  `delivery: 'caller'`, `parent` = `exec.agent`, `outputSchema` passed
  through, prompt carries the source path), first-run card writing with
  `sourceDigest`, digest-based skip on re-run, manual-edit protection,
  unreadable-source and unusable-card failure reporting, and Wiki
  generation consuming cards.
- `test/spawn.test.js`: `runSubagent` contract (activation spec shape,
  dispose semantics on success/failure, readable errors for missing
  capabilities) and `getLocale` env mapping.
- Coverage measurement is now part of the quality loop
  (`node --test --experimental-test-coverage`): overall line coverage
  89.9% → 94.7%, `spawn.js` and `card-schema.js` at 100%.

## [0.18.0] - 2026-11-26

### Added

- **Multi-workspace overview (ui-plan slice 2)**: the Repo Wiki panel now
  defaults to an overview mode listing every workspace as a row — title,
  path, a generated/not-generated status dot, per-workspace stats (files /
  symbols / cards / docs / last index time), and the same status vocabulary
  as the single view ("not generated yet", "no session"). Clicking a row
  drills into the existing single-workspace panel; the header has
  Overview/Workspace mode toggles and the workspace picker still works.
  The plan's technical concern ("cross-workspace aggregation may need a
  new host data plane") resolved itself: each workspace entry already
  carries `sessionIds`, so `loadWorkspaceStats` reuses the same per-session
  scope channel as the single view (3 concurrent workspaces, ~3 remote
  calls each).

### Fixed

- Style warning on primary buttons (mixing shorthand `border` with
  longhand `borderColor` during rerender) — primaryStyle now overrides
  with the same shorthand form.

### Changed

- Test suite 97 → 99: stub test for the overview (three workspaces:
  generated / empty / no-session, drill-in via picker) and a DOM test
  driving the overview drill-in with a real click on two workspaces.

## [0.17.0] - 2026-11-26

### Added

- **DOM integration test with real React + jsdom** (`test/client-dom.test.js`):
  the stub tests call `props.onClick()` directly, bypassing the browser event
  chain — so the user's reported "clicking a card does nothing" could never be
  reproduced. The new suite renders `RepoWikiPage` with real React 18 into a
  jsdom DOM and dispatches **real** events: a `change` on the workspace select
  to load the real-corpus fixture, `click` on every generated card tile (React
  synthetic-event root delegation, real target hit-testing), and a `keydown`
  Escape to close the detail pane. Result: every generated card opens a detail
  region, no `actionFailed` message surfaces, Escape closes the detail. The
  event-level wiring is verified healthy — the historical click symptom is not
  reproducible at this layer.
- `test/lib/corpus-fixture.mjs`: shared corpus loader + fake remote
  (RemoteResult contract, pagination semantics) extracted from the real-corpus
  test for reuse by the DOM suite.

### Changed

- Dev-only test dependencies added (`react`, `react-dom` 18.3.1, `jsdom`,
  all MIT, 0 vulnerabilities). The shipped plugin keeps **zero npm runtime
  dependencies** — `client.js` uses the host's React at runtime; the tests
  only need the same API surface. CI now installs dev dependencies before
  running the suite; the local link-based bundle install still passes the
  supply-chain policy (`link:` protocol does not pull dev dependencies).

## [0.16.0] - 2026-11-26

### Added

- **Real-corpus client regression test** (`test/client-real-corpus.test.js`):
  the smoke-test fixtures are hand-written tidy Markdown, but cards in the
  wild are LLM-generated (mixed heading levels, inline markup, fenced code).
  The new test feeds this repository's own `.dsh-repowiki/` corpus through
  the exact panel render path and asserts every generated card opens a rich
  detail view (renderMarkdown), pending rows fall back cleanly, and the Wiki
  tab browses page by page without throwing. This produced the decisive
  evidence that the renderer is healthy on real content.
- **Event-handler guard** in the web client: React error boundaries do not
  catch errors thrown in event handlers (onClick/onChange), so a handler
  throw showed up as "click does nothing". All interactive handlers
  (reload, generation actions, tabs, filters, view toggle, card open/close,
  wiki/memory open/close) are now wrapped in a guard that turns synchronous
  throws and async rejections into a readable status line
  ("Action failed (open-card): …"). Combined with the v0.14.0 render-time
  ErrorBoundary, both failure modes are now user-visible instead of silent.
- **CI gate** (`.github/workflows/tests.yml`): `node --test test/*.test.js`
  on Node 22 and 24 for every push/PR — closes the last undone hard clause
  of the plan's upgrade-resilience checklist (§10.3-8).

### Changed

- Test infrastructure deduplicated: the minimal React stub (hooks,
  createElement with error-boundary simulation, tree walkers) moved to
  `test/lib/stub-react.mjs` and is shared by the smoke test and the
  real-corpus test (~160 duplicated lines removed).

## [0.15.0] - 2026-11-26

### Changed

- DRY refactor: the `cwdOf` helper (session cwd with `workingDirectory`
  fallback) duplicated across 8 tool files, the `resolveTarget` helper
  duplicated in repowiki-export/-import, and the JSON frontmatter
  serialize/parse logic triplicated in `render.js` / `knowledge.js` /
  `memory.js` (parse also duplicated with a different schema constant) are
  now consolidated in `src/util.js` (`cwdOf`, `toAbsPath`,
  `encodeFrontmatter`, `parseFrontmatter`). Behavior is byte-identical
  (same regex, same JSON formatting, same POSIX separator normalization);
  net −139 lines of duplicated source.
- `knowledge.cardFrontmatter` is removed (it was a thin wrapper over the
  now-shared `encodeFrontmatter`); `tool-edit` calls `encodeFrontmatter`
  directly. `parseCard` and `parseMemoryText` delegate to the shared
  `parseFrontmatter` with their own schema constant.

### Added

- `test/util.test.js`: 9 tests pinning the extracted helpers (cwd fallback
  paths, relative/absolute resolution, frontmatter round-trip, schema
  mismatch and malformed-input nulls). Suite now 90/90.

## [0.14.0] - 2026-11-26

### Added

- A page-level `ErrorBoundary` now wraps the Repo Wiki panel: a render-time
  throw renders a readable inline error line ("Repo wiki panel error: …")
  instead of blanking the whole `main` slot (per dsh-doc ui-plugin.md: "a
  throwing component blanks your slot entry"). `componentDidCatch` logs to
  the console with the `repowiki:` prefix for on-site diagnosis.

### Tooling

- The client smoke-test React stub now supports class components
  (`isReactComponent` marker, `getDerivedStateFromError` error-boundary
  simulation) so ErrorBoundary-shipping code paths are exercised (81/81).

## [0.13.1] - 2026-11-26

### Fixed

- Dark-mode adaptation of the web client: the CSS custom-property names used
  before (`--dsw-alias-color-text/-muted/-border/-surface/-primary/-subtle`,
  54 usages) do not exist in this DSH build, so every `var()` fell back to a
  light literal and dark mode rendered as white-on-white (the wiki `a.js`
  inline-code case the user saw). Replaced with the names verified from the
  shipped official pages (`dsh-client-ui-schedule`, `ui-sidebar-documentpreview`):
  `--dsw-alias-label-primary/secondary` (text), `--dsw-alias-bg-layer-1/2`
  (surfaces incl. code blocks), `--dsw-alias-border-l2`,
  `--dsw-alias-state-business-primary` (primary), `--dsw-alias-state-error-primary`
  (danger). The mapping is recorded in the client.js header comment.
- ADR-0004's unverified token note is now resolved with the verified list.

## [0.13.0] - 2026-11-26

### Changed

- Wiki and memory detail views now render the page as **formatted text
  instead of raw Markdown source**. The web client ships a zero-dependency
  Markdown renderer (`renderMarkdown` + `inlineText`) that parses headings,
  code fences, unordered/ordered lists, blockquotes, rules, bold, inline
  code, and links into host React elements; frontmatter blocks are skipped
  (no third-party client packages, per the plugin stability rules).
- Card details show the **full card body** (all sections: summary, purpose,
  key symbols, pitfalls, related modules), rendered with the same renderer,
  instead of only the summary line — the details no longer feel clipped.
- `loadCards` keeps the full body alongside the summary.

### Tests

- A rendering test asserts formatted output: card details contain the
  key-symbols section text, no `##` source markers, no frontmatter JSON;
  wiki details show the body without frontmatter (81/81 green).

## [0.12.0] - 2026-11-26

### Added

- Panel memory view (web client): a "Memory" tab beside Cards / Wiki lists
  `.dsh-repowiki/memory/<locale>/` entries with a status pill
  (accepted / pending / rejected colored) and opens one entry's raw text
  with a back control. Escape closes the details of both cards and memory.
- The panel reload now also harvests memory entries through the same
  `ctx.remote.workspaceFiles` channel (`loadMemoryEntries`, tolerant of a
  missing memory directory).
- Session memory is now visible in three places: wiki synthesis (v0.10.0),
  search (`includeMemory`, v0.11.0), and the panel (this release).
- Tests: memory tab list + detail with state pills (80/80 green).

## [0.11.0] - 2026-11-26

### Added

- `repowiki-cards` now consumes accepted session memory: a new
  `includeMemory` flag (default false) attaches accepted `repowiki-memory`
  entries to the search result, filtered by the same query substring against
  title, tags, and body. The render output lists matched memory titles.
- This closes the memory visibility loop alongside v0.10.0: accepted entries
  are reachable both from wiki synthesis and from cross-session search.
- Tests: includeMemory paths (default off, empty query, query filter, pending
  excluded) with LANG isolation (79/79 green).

## [0.10.0] - 2026-11-26

### Added

- Memory consumption side: `repowiki-generate` now reads accepted session
  memory entries (`listMemory(status: 'accepted', withBody: true)`) and folds
  them into the synthesis prompt as authoritative project conventions and
  decisions (title + first body line, capped at `MAX_MEMORIES_IN_PROMPT`).
  The output adds `memoriesRead` so runs report how much memory was used.
- `listMemory` gained an optional `withBody` flag returning the entry body
  (frontmatter and heading stripped).
- `generatePrompt` accepts an optional `memories` argument; the empty case
  renders `(none)` so prompts stay stable.
- Tests: prompt injection and withBody branches (78/78 green).

## [0.9.0] - 2026-11-26

### Added

- `repowiki-edit` tool (completes the plan's Phase 3 list): hand-edit
  knowledge cards. `create` adds a manual card whose `path` may sit outside
  the index (an orphan manual card — it survives export/import because the
  whole asset tree is copied, and `repowiki-extract` never refreshes it since
  it is marked `manuallyEdited` and, when outside the index, not even a
  candidate). `update` rewrites an existing card (title/tags override when
  given; body replaces the text when given, otherwise the text is kept) and
  sets `manuallyEdited: true` so auto-refresh stops touching it. Pure file
  operations over `ctx.fs`, no model calls.
- `knowledge.js` exports `cardFrontmatter` so manual edits reuse the exact
  frontmatter shape of generated cards.
- The plan's `state.json` marker for manual edits is folded into the card
  frontmatter itself (recorded in `docs/checkpoints/phase-3b.md`).
- Tests: create/update end-to-end round trip with the failure hints
  (76/76 green).

## [0.8.1] - 2026-11-26

### Fixed

- Panel data reads (web client): `remote.workspaceFiles.read` / `list` return
  a `RemoteResult` — `{ok: true, value}` on success and `{ok: false, error}` on
  failure, and the call **never rejects** (dsh-api-remotes' RemoteResult
  contract, confirmed in the dsh-api-workspace-files README and
  RemoteResult type). The client previously consumed the payload directly, so
  every load failed with a spurious `workspace-file/bad-read`. The client now
  unwraps `.value` and carries `error.code` into the panel's failure branch
  (so "not yet generated" still degrades to its own hint). Smoke-test fakes
  now use the same RemoteResult shape.

## [0.8.0] - 2026-11-26

### Added

- `repowiki-memory` tool (Phase 4, first step): persist knowledge learned in a
  session into `.dsh-repowiki/memory/<locale>/` and review it. `write` saves an
  entry (title, body, optional tags and related file path; status defaults to
  `pending`, `accepted` trusts it immediately), `list` shows entries by status
  (default pending), and `accept` / `reject` close the review loop. Entries are
  plain Markdown with a JSON frontmatter, travel with Git, and are readable by
  later sessions.
- `src/memory.js`: `slugifyMemory` (pure-ASCII titles fall back to a timestamp
  slug), `writeMemory` / `listMemory` / `setMemoryStatus` over `ctx.fs`.
- Deviation from the plan recorded in `docs/checkpoints/phase-4a.md`: the
  plan proposed auto-harvesting candidates by projecting the session log;
  the implementation has the model write candidates explicitly (lower noise,
  consistent with the tools-are-model-invoked architecture). The review loop
  is unchanged.
- Tests: storage unit tests and an end-to-end write → list → accept → reject
  tool round trip (75/75 green).

## [0.7.0] - 2026-11-26

### Added

- Panel slice 3 essentials in the web client:
  - **Update detection**: cards whose frontmatter `sourceDigest` differs from
    the index `digest` are counted as stale; the stats row shows an
    "N cards need an update" hint and a **Stale** filter lists exactly those
    cards.
  - **Wiki tab**: a Cards / Wiki tab pair; the wiki tab lists
    `wiki/<locale>/` pages (title from frontmatter) and shows a page's raw
    Markdown text with a back control.
- `loadCards` now harvests `sourceDigest`; `countWikiDocs` was replaced by
  `loadWikiEntries` which returns titles, generation times, and full text.
- Smoke tests extended with stale-detection and wiki-browsing scenarios
  (70/70 green).

## [0.6.0] - 2026-11-26

### Added

- `repowiki-export` tool: copies the whole `.dsh-repowiki/` knowledge base
  into a directory snapshot (Markdown and JSON assets only, no archive
  format, no model calls). Relative targets resolve against the session
  directory; a non-empty target is refused unless `overwrite=true`.
- `repowiki-import` tool: restores `.dsh-repowiki/` from a snapshot
  directory (symmetric with export). Existing assets are protected unless
  `overwrite=true`; the imported `index.json` is verified for schema
  compatibility and a mismatch is reported as a rebuild hint.
- `src/transfer.js`: `copyTree` / `dirHasContent` — pure `ctx.fs` copying
  with per-file fault tolerance (unreadable files are counted as skipped,
  never abort the transfer).
- Tests: transfer unit tests plus an end-to-end export → wipe → import
  round trip through the real tools (68/68 green).
- Phase 3 is now complete: incremental reindexing, card refresh,
  manual-edit protection, orphan reporting, import/export.

## [0.5.1] - 2026-11-26

### Added

- Manual-edit protection: a knowledge card whose frontmatter carries
  `manuallyEdited: true` is never auto-refreshed by `repowiki-extract` when
  its source file changes (`force: true` still overrides); the run reports
  the protected count as `skippedManual`.
- Orphaned card reporting: `repowiki-extract` counts cards whose source file
  is no longer in the index (deleted or renamed sources) and reports them
  as `orphaned` — reported only, never deleted (a destructive cleanup
  remains a deliberate, later step).
- Unit tests for `cardIsProtected` and `countOrphaned` (63/63 green).

## [0.5.0] - 2026-11-26

### Added

- Content-digest incremental reindexing (Phase 3, first step): every indexed
  file entry now carries a `digest` (first 12 hex chars of sha256, computed
  with the built-in `node:crypto`); `repowiki-index` reuses the previous
  index entry for files whose digest is unchanged and reports the count in
  its output (`reused`). `incremental: false` forces a full rebuild; an
  index written by an older version is rebuilt from scratch (index
  `schemaVersion` bumped to 2, the read side keeps its rebuild-prompt
  degradation).
- Knowledge cards now record `sourceDigest` in their frontmatter;
  `repowiki-extract` skips a card only while its recorded digest still
  matches the file, and refreshes it when the source changed (old cards
  without a digest are re-extracted once, `cardIsFresh` is exported and
  unit-tested).
- Tests for the incremental paths: indexer reuse/change/delete
  (`test/indexer.test.js`), tool-level `reused` and `incremental: false`
  behavior and digest freshness (`test/tools.test.js`), and frontmatter
  `sourceDigest` rendering (`test/render.test.js`).

## [0.4.0] - 2026-11-26

### Added

- Slice 1 of the Repo Wiki panel (web client): after picking a workspace the
  page reads `.dsh-repowiki/` through `ctx.remote.workspaceFiles` (authorized
  by any member session of that workspace, per `WorkspaceView.sessionIds`)
  and renders: file/symbol/card/doc counts and latest update, an
  all/generated/pending filter (pending = listed in `index.json` without a
  card), a search box, grid and list views, and an inline details pane for a
  card (summary, tags, generation time; Escape closes).
- Generation buttons keep the validated
  `ctx.uiWorkspace.startSession(workspaceId, ...)` flow (ADR-0004); the panel
  reloads when the page becomes visible again.
- Client smoke tests (`test/client-smoke.test.js`): a minimal React/hook
  stub mounts the page against a fake `remote.workspaceFiles` and covers the
  load → filter → render chain and the "not yet generated" branch.

## [0.3.0] - 2026-11-26

### Added

- Web client module (`client.js`, registered via `dsh.client.platform: web`):
  a "Repo wiki" sidebar entry beside the scheduled-tasks icon and a keyed
  standalone page. The page lists workspaces (subscribed to
  `ctx.workspaces`) and offers four generation actions (index / cards /
  wiki / all); generation runs in a session of the chosen workspace via
  `ctx.uiWorkspace.startSession` (ADR-0004). Hand-drawn SVG icon, zero
  client npm dependencies.

### Fixed

- Generation page selects a workspace instead of a directory picker.

## [0.2.0] - 2026-11-26

### Added

- `repowiki-extract` tool: one spawn subagent per file (inheriting the
  session model) generates a knowledge card (purpose, key symbols,
  pitfalls, related modules) into `.dsh-repowiki/knowledge/<locale>/`.
- `repowiki-generate` tool: reads only the cards + tech stack and
  synthesizes theme-grouped Wiki pages (Markdown + optional mermaid
  diagrams) into `.dsh-repowiki/wiki/<locale>/`.
- Project plan file `.dsh-repowiki/repowiki-plan.json` (Git-shared):
  `exclude` / `includeOnly` / `maxCardsPerRun` / `cardComplexityThreshold`.

## [0.1.0] - 2026-11-25

### Added

- `repowiki-index` tool: deterministic (zero-LLM) symbol-level index —
  symbol tables, import dependency edges, tech-stack detection — written
  to `.dsh-repowiki/index.json` (Git-shareable).
- `repowiki-cards` tool: cross-session read-only query filtered by symbol
  name / kind / path.
- Zero npm runtime dependencies, zero build tooling: plain ES Modules
  with hand-written `ToolDefinition`; installs and runs from a local
  directory.
