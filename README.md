# dsh-repowiki

**Symbol-level repository knowledge index + cross-session query** — a local plugin bundle for DeepSeek Harness (DSH).

Indexes the current repository into a symbol-level knowledge base at `.dsh-repowiki/` (Git-shareable). Any session opened on the same directory can query symbols, files, and dependencies without re-reading source code.

English | [中文](README.zh-CN.md)

> Design basis: an internal review of the repository-wiki / knowledge-cards feature porting plan (the review document itself is not part of this repository). Hard constraint: zero third-party dsh plugins; every capability comes from official dsh mechanisms.

## Current stage: Phases 1–4 complete — 11 tools over a zero-dependency symbol index, 16-language indexing with SFC/workspace/build-file resolution, panel card/Wiki/memory views with deep links, core-file ranking and citation-issue badges, locale-aware asset fallback, documentation health with wiki citation integrity, line-range validation and content-drift digests, drift-aware incremental synthesis, citation-aware health scoring, citation digest coverage with reasons and panel tooltips, bounded concurrent digest verification, page-level coverage details, a CI wiki freshness gate with card/memory stale detection, page integrity checks, persisted generation-failure reporting, structured problem codes and `--require`, panel generation-failure/missing-page/invalid-path/duplicate-page/stale-card/memory notices, index-version/range-unverified strictness, relative-link/page-path/duplicate-page integrity (wiki pages and project files), status missing-page/invalid-path/duplicate-page counts, missing/failed-page and invalid-path health scoring, bounded-concurrency gate reads and a self-testing CI fixture job, an untracked-citation filter, a conservative unused-export audit, module coupling/instability metrics, symbol-aware change impact with lexical usage evidence and affected-test routing, PageRank core-file ranking, and budgeted task context packs with symbol anchors, paginated retrieval and nested/character-class ignore rules, digest-verified snapshots with write-back checks and bounded large-snapshot verification, Dart support and workspace `package:` resolution, and manifest-scoped snapshot imports that reject unlisted files, PHP PSR-4 autoload resolution, default dependency-directory exclusions, untrusted-index path hardening, reproducible index output and stricter snapshot-manifest validation and bounded directory-listing prefetch and GFM table/nested-list rendering precise CJK query tokens and graph-aware wiki freshness, and Elixir module/alias indexing with root and umbrella `mix.exs` stacks (v0.178.0)

| Capability | Description |
|---|---|
| `repowiki-index` tool | Deterministically (zero LLM) rebuilds the index: symbol tables for JS/TS, Vue and Svelte SFC, Python, Go, Rust, Java, C#, Kotlin, PHP, Ruby, Swift, Scala, Dart, Elixir, C and C++ (including Scala 3 indentation syntax, `extension` and `given`; Dart classes/mixins/extensions/typedefs with workspace `package:` resolution), local import dependency edges (including multi-module Go via nested `go.mod`), tech-stack detection (npm/pip/go/cargo/maven/gradle/composer/bundler/swiftpm/sbt/pub/mix with umbrella apps/cmake), language distribution and Git provenance (`branch`/`commit` read from `.git/HEAD`), module tree (directory grouping, depth ≤2), writes `.dsh-repowiki/index.json`; incremental — files whose content digest is unchanged reuse the previous entry, with added/changed/removed counters; honors a documented `.gitignore`/`.repowikiignore` subset including character classes and nested files scoped to their own directory, and reports `ignored` entries; unreadable or oversized source files are counted as `skipped` (with a warning) instead of disappearing; Go `internal` visibility violations are reported as warnings while the edges stay indexed (capped at 50 with a folded summary); cancellation leaves the previous index untouched |
| `repowiki-cards` tool | Cross-session read-only query: filter by symbol name / kind / path / module / language, or public-only (`exportedOnly`); matches are ranked exact > prefix > substring (exported first within a tier) and files by best match, and method results carry their owning type; returns files + symbols, the project tech stack and the module tree; `target=docs/all` runs zero-dependency BM25 over cards, wiki pages and accepted memory; `includeMemory` attaches accepted session memory entries matched by the same query; `references=true` adds import-level reverse references with statement lines (`referencedBy: [{path, line}]`, bounded to 100 entries); `wikiReferences=true` adds wiki citations (`wikiReferences: [{path, slug, title, sections}]`) from the manifest; `imports=true` lists each matched file's outgoing edges (`imports: [{path, line, symbols, depth}]`, side-effect imports kept, self-edges skipped, bounded to 100 entries); `depth` 2–3 expands those edges transitively (nearest hop wins, cycles stay finite); `offset` pages through file and docs results while `total` stays exact; docs/memory/wiki reads fall back to the locale that actually holds assets unless `locale` is passed explicitly |
| `repowiki-extract` tool | One spawn subagent per file (inherits the session model) generates a knowledge card (purpose, key symbols, pitfalls, related modules) into `.dsh-repowiki/knowledge/<locale>/`; the prompt carries the project name, tech stack and module paths so `relatedModules` reuses real names; key symbols carry index line numbers; a `_index.json` module→card manifest lands beside the cards; a card is refreshed when its recorded source digest no longer matches the file, unless it is marked `manuallyEdited`; cards whose source file disappeared are reported as orphaned; `locales: ['zh','en']` processes several locales sequentially with per-locale counters; `concurrency` (1–4, default from the plan) dispatches several file extractions in parallel while card writes stay serialized; `attempts` (1–3, default 2) retries thrown errors and unusable output with abort-aware exponential backoff (model `skip` is terminal) |
| `repowiki-generate` tool | Only the cards + tech stack (+ accepted session memory as conventions/decisions) are read, together with a top-15 cross-module dependency summary, up to five file-level import-cycle groups and up to five high-fan-in files used to ground architecture sections; `granularity=theme/module/all` (module pages are deterministic, no model calls, separate outbound/inbound module dependencies, flag modules that import each other in both directions and append a high-fan-in section); `locales: ['zh','en']` runs theme synthesis once per locale; auto contents, page/section citations as relative paths with optional `#Lx-Ly`, whitelisted against the index; every run writes `wiki/<locale>/_index.json` with an `inputDigest` (cards) and a `graphDigest` (indexed files + dependency edges) for stale detection plus failed page writes (`failed` up to 10 entries, `failedTotal`); duplicate slugs are renamed and per-page failures are reported, never silently dropped; when the manifest card and accepted-memory digests still match and every recorded citation digest still verifies (changed or unverifiable citations disable the skip, report `citationDrift` and re-synthesize with a reason), theme synthesis is skipped without a model call unless `force=true`; thrown errors and empty page lists retry with abort-aware backoff (`attempts` 1–3). Every run reports `citationCoverage` with reasons (unreadable, invalid range, read cap) so citations without content digests are never presented as verified. |
| `repowiki-status` tool | Read-only health report (no LLM): index presence/schema compatibility, file/symbol/module counts (plus skipped files), language distribution, Git branch/commit, last extract snapshot (`lastExtract`: counters, failed/retried, concurrency, attempts, duration), card stale/orphan counts, wiki manifest/stale/failed/missing/invalid/duplicate/orphan (failed page writes, pages without a file, invalid page paths and duplicate page slugs or manifest entries, with bounded slug lists), memory review counts, plan source, in-process lock queue, top cross-module import edges, file-level import-cycle groups (each with a representative shortest cycle path), fan-in hubs (most imported files), PageRank core files (top 10, weighing indirect importance, only when the index has edges) and warnings (text report capped at three entries with a folded count); documentation coverage over plan-eligible files (with the largest module gaps), wiki citation integrity (missing cited paths verified against the index and filesystem, with bounded page details, `#Lx-Ly` bounds when line counts are known and content-drift digests from manifest v3, plus tracked/untracked digest coverage and reasons, bounded per-page coverage details and bounded concurrent reads), a conservative unused-export audit (files with any unnamed inbound import are skipped), module Ca/Ce coupling and instability, and a weighted health score (docs 40 / wiki 25 / architecture 20 / hygiene 15, grades A–D plus the top four issues; missing citation paths, out-of-range lines, content drift, missing/failed wiki pages and invalid page paths lower the wiki component, while unchecked citations are not penalized); the inspected locale falls back to one that holds assets and is reported explicitly |
| `repowiki-impact` tool | Pre-edit blast-radius analysis (read-only, deterministic, no LLM): matches changed paths to indexed files (absolute paths, suffixes, unique basenames; ambiguous inputs list candidates instead of guessing); expands direct and transitive dependents on the reverse import graph (depth 1–3, bounded detail with exact totals); reports import cycles touching the change (with a representative route), fan-in of the changed files, cards (including stale ones) and wiki pages/sections that cite them, an explainable risk level (direct/transitive/cycle/hub factors, low–critical) and prioritized verification steps. Optional `symbols` accepts bare names or `path#name`: direct impact requires named-import evidence, transitive impact stays a conservative file-graph expansion, unresolved symbols never silently widen scope, and `conservativeImpactedTotal` preserves the file-level upper bound. Symbol scope also scans direct named importers for lexical usage sites by default (`usages`: `path:line` plus the trimmed source line; import/export lists, destructuring bindings and whole-line comments are excluded; at most 20 files, 10 sites per symbol and 100 total); unreadable importers are reported as unknown rather than absent, and `includeUsages=false` skips source reads. Impacted files that look like tests are returned as `affectedTests` (path heuristics, nearest hop first, up to 50) and named first in the verification recommendations |
| `repowiki-context` tool | One-call task evidence pack (read-only, deterministic, no LLM): ranks files by identifiers, path matches, explicit anchors and card/wiki/memory BM25 routing; returns relevant symbol definitions, line-numbered source snippets, direct imports/dependents, related cycles and fan-in hubs in a single Markdown pack. `budget` is a hard 2,000–40,000 character limit (default 12,000), with explicit omitted counts for snippets/documents/relations instead of silently pretending truncated evidence is complete; source reads and the main file list are bounded. When a task matches no indexed file and the import graph has edges, the pack falls back to the top five PageRank files as a repo map, marks each entry `(repo map)`, sets `fallback: 'repo-map'` and states that they are a starting point, not task relevance. Optional `symbols` (bare names or `path#name`) anchor the pack to definitions without requiring a query; bare names defined in multiple files are reported as ambiguous instead of guessed, and failed anchors are never broadened or masked by the repo-map fallback |
| Project plan | `.dsh-repowiki/repowiki-plan.json` (Git-shared): exclude / includeOnly / maxCardsPerRun / cardComplexityThreshold / concurrency / attempts |
| `repowiki-export` tool | Copies the `.dsh-repowiki/` assets into a directory snapshot (backup or transfer; Markdown/JSON only, no model calls); verifies every write by reading it back, then writes `_snapshot.json` with each copied file and its digest; a non-empty target is refused unless `overwrite`; reports `aborted` on cancellation |
| `repowiki-import` tool | Restores `.dsh-repowiki/` from a snapshot directory; when `_snapshot.json` exists, every listed file is digest-verified with 8-way bounded concurrency (up to 20,000 files) and a partial/corrupt snapshot is refused unless `allowCorrupt` (legacy snapshots import with a notice; unknown manifest schema versions, count/length mismatches, non-object manifests and manifests over 8 MiB are corruption); only files listed by the manifest are copied, so extra text files found in the snapshot are skipped and reported (`snapshotUnlisted`); existing assets are protected unless `overwrite`; verifies `index.json` compatibility afterwards |
| `repowiki-edit` tool | Hand-edit knowledge cards: `create` adds a manual card (path may sit outside the index), `update` rewrites an existing card; both set `manuallyEdited` so `repowiki-extract` stops auto-refreshing the card |
| `repowiki-memory` tool | Persists knowledge learned in a session into `.dsh-repowiki/memory/<locale>/` (default `pending`), then `list` / `accept` / `reject` closes the review loop; entries are Markdown with a JSON frontmatter and travel with Git; same slug with a different title is hash-suffixed instead of overwritten, and review timestamps are recorded |
| Repo Wiki panel (web) | A "Repo wiki" sidebar entry (beside the scheduled-tasks icon) opens a workspace page. **Overview mode (default)** lists every workspace with its status dot and stats; clicking a row drills into the single-workspace view: file/symbol/card/doc counts and latest update, an all/generated/pending/stale filter (pending = listed in `index.json` without a card; stale = card digest no longer matches the file), deferred search by title/path/tags/symbols/card body, pagination (120 + load more), sort by path/title/updated, a language filter with readable language names and a per-language file distribution (when the index has several languages), a skipped-file count when the index reports skips, an index-warnings count (expandable list plus a three-entry tooltip), a high-fan-in files row (most-imported files, each chip opens the file detail), tag chips, grid and list views, cycle badges (`⟲`) on files that belong to an import cycle (tooltip appends a representative route for two/three-file cycles), group-by-module, card details with copy-path and a cycle summary (group size plus a representative route; other files are clickable), line-level import references and imports (both lists are clickable to open that file's detail; outgoing edges marked `↔` when mutual, with a 1/2/3-hop depth selector driving both imports and a file-level dependents list) and clickable wiki citations with per-section chips (jump to any cited section), a last-extract snapshot line (failures highlighted), and a Wiki tab (search, manifest grouping, orphan marking, citation-issue badges, reason-aware digest-coverage badges, an "only untracked" filter, generation-failure/missing-page/invalid-path notices and stale-card/memory notices) — wiki/card Markdown renders with a zero-dependency renderer (headings, fences, GFM tables with alignment, nested lists, quotes, inline formatting/links) that also turns ```` ```mermaid ```` flowchart fences (including `subgraph` groups) into inline themed SVG — data read from `.dsh-repowiki/` via `ctx.remote.workspaceFiles` (asset JSON is paged up to 600k lines so large-repo indexes load intact) — plus the generation actions (ADR-0004) |

Roadmap:
- Phase 3 (done in v0.6.0): content-digest incremental reindexing, card refresh, manual-edit protection, orphan reporting, directory import/export
- Phase 4 (done in v0.12.0): the session-memory tool with a full review loop, its three consumption outlets (generation summary, search visibility, panel tab), and the Repo Wiki panel
- Consolidation (v0.15.0): duplicated path helpers and frontmatter serialize/parse logic consolidated into `src/util.js` (net −139 lines); plan coverage audited in `docs/coverage.md`
- Stability hardening (v0.16.0): real-corpus client regression test (this repo's own generated cards driven through the panel), event-handler guard so handler throws surface as a readable status line instead of a silent no-op, CI gate on Node 22/24
- DOM integration (v0.17.0): real React 18 + jsdom suite driving the panel with real click/change/keydown events against the real corpus — closes the reproduction gap for the reported "card click does nothing" (the event-level wiring is verified healthy); dev-only test dependencies (react, react-dom, jsdom) do not change the zero-runtime-dependency posture
- React parity (v0.34.0): the dev pin (18.3.1) is verified to match the version embedded in the host's own web-frontend bundle, so tests exercise the same API the panel runs on; `test/react-parity.test.js` guards the drift and `npm audit` stays at 0 vulnerabilities
- Multi-workspace overview (v0.18.0, ui-plan slice 2): every workspace as a row with status and stats, click to drill in; reuses each workspace's own session scope — no new host data plane needed
- Qoder Repo Wiki alignment (v0.43.0): module tree (`modules[]` + `files[].module`), relative-path/line-number citations in cards and wiki, auto contents and per-section sources, a panel group-by-module view, and whitelisted citations (ADR-0006)
- Concurrent-write serialization (v0.43.0): the six mutating tools queue per asset root in-process (review item O5, ADR-0005)
- Security and correctness baseline (v0.44.0): panel link allowlist, end-to-end `AbortSignal` cancellation, verified writes (write-then-read-back), index schema v3 with v2 compatibility, memory hash-suffix collisions; lock scope narrowed so model calls no longer hold the write lock (ADR-0005 revised)
- Product and experience (v0.45.0): `.gitignore` subset, zero-dependency BM25 doc search, module-level wiki + manifest, stale/orphan detection, `repowiki-status`, panel pagination/sort/tags/wiki search/accessibility
- Engineering and release (v0.46.0): TypeScript `checkJs` (progressive), ESLint, 3-OS CI matrix with a Windows canary, coverage gate, secret scan, CodeQL, Dependabot, SBOM, release script and runbook/benchmark docs (ADR-0007)
- Language and ecosystem expansion (v0.47.0): Go/Rust/Java symbols and local dependency edges, Maven/Gradle stack detection, Git provenance (`branch`/`commit` from `.git/HEAD`), language distribution, multi-locale extract/generate, index schema v4 with v2/v3 compatibility
- Reverse references (v0.48.0): `repowiki-cards references=true` and the panel detail pane answer "which files import this symbol" from `index.edges`, with bounded output and honest import-level semantics
- Line-level references (v0.49.0): index schema v5 records the import/use/require line on every edge, so reverse references and the panel point at `path:Lx`; older indexes degrade to path-only
- Wiki citation reverse lookup (v0.50.0): wiki manifest v2 records per-section sources; `repowiki-cards wikiReferences=true` and the panel answer "which wiki pages/sections cite this file", closing the code ↔ docs loop
- Eight-language coverage (v0.51.0): C#/Kotlin/PHP symbols and local dependency edges, Composer stack detection, prompt fences for all supported languages
- Bounded extraction concurrency (v0.52.0): `concurrency` 1–4 in the plan/tool parallelizes model calls while writes remain serialized; cancellation stops new dispatches and failure lists stay sorted
- Extraction retries (v0.53.0): `attempts` 1–3 retries thrown errors and unusable model output with abort-aware exponential backoff; explicit skips are terminal, and results report `attempts`/`retried`
- Clickable wiki citations (v0.53.1): detail citations jump to the matching Wiki tab/page with accessible labels
- Section-level deep links (v0.53.2): the jump scrolls to the first cited section using the same heading-anchor function as Markdown rendering
- Extract run diagnostics (v0.54.0): knowledge manifest v2 persists the last run (counters, failures, retries, concurrency, attempts, duration) and `repowiki-status` surfaces it
- Panel run snapshot (v0.54.1): the single-workspace stats row shows the last extract from the knowledge manifest, with failure counts in the error colour; state resets cleanly when the workspace has no session/assets
- Eleven-language coverage (v0.55.0): Ruby (class/module/def/attr/constants, `require_relative` edges), Swift (class/struct/enum/protocol/extension/func/init, module-level imports), Scala (class/case class/trait/object/enum/def, grouped/renamed imports); Gemfile, Package.swift and build.sbt stack detection
- Per-section wiki citation chips (v0.56.0): every cited section is a chip that opens the page at that section (bounded, with overflow note); Ruby block ranges now ignore heredoc bodies and `=begin/=end` comments
- Ranked and language-scoped retrieval (v0.57.0): symbol matches rank exact > prefix > substring (exported first), files by best match; `lang`/`exportedOnly` filters in `repowiki-cards` and a panel language dropdown
- Symbol-aware panel search and Scala 3 (v0.58.0): the panel finds files by indexed symbol names; tool results show method ownership; Scala 3 indentation bodies get correct member ranges
- Incremental wiki synthesis (v0.59.0): `repowiki-generate` skips the model when card and accepted-memory digests are unchanged (`force` overrides); status warns when memory changes postdate the wiki
- SwiftPM target edges (v0.60.0): `import Core` resolves to `Sources/Core/`'s representative file, giving Swift multi-target repos dependency and reverse-reference data; self-resolving imports are dropped
- Generation retries and index change counters (v0.61.0): theme synthesis retries thrown/empty output (`attempts` 1–3); `repowiki-index` reports added/changed/removed
- Context-aware cards and Scala 3 (v0.62.0): card prompts include project name/stack/modules to ground `relatedModules`; Scala `extension` methods and `given` instances get correct ownership and ranges
- Large-index panel loading (v0.63.0): asset JSON uses a 120-page budget and reports `too-large` instead of a parse error when still truncated
- JS/TS aliases and workspace edges (v0.64.0): non-relative imports resolve through `tsconfig`/`jsconfig` `paths` + `baseUrl` (nearest config wins) and monorepo package names via `exports`/`main` → source entry; external packages stay edge-free
- Python absolute imports (v0.65.0): `import a.b` / `from a.b import c` resolve against the project root and any `src`/`lib` layout roots, preferring a submodule for `from package import name`; standard-library and third-party imports stay edge-free
- SwiftPM custom paths (v0.66.0): `Package.swift` target declarations are parsed (comments stripped, multi-line aware), so `import Module` resolves to the declared `path:` directory; explicit declarations win over the `Sources/<Target>/` convention
- Ruby load paths (v0.67.0): bare `require 'pkg/file'` resolves against every `lib/` directory (depth-ordered) then the project root, while `require_relative` stays file-relative; aggregator entry files and nested gems now get edges, external gems stay edge-free
- Bounded parallel indexing (v0.68.0): source files are read/parsed with 8-way concurrency (`readConcurrency`, cap 16) and assembled in traversal order, so the index stays deterministic; local fs gains a little, remote RTT-bound `ctx.fs` gains the most
- C/C++ support (v0.69.0): class/struct/union/enum/typedef, functions, methods, constructors/destructors and prototypes (multi-line signatures, `static` visibility, anonymous typedefs); quoted `#include` resolves relative to the file plus `include`/`src`/`inc` roots, system headers stay edge-free
- CMake stacks (v0.70.0): `CMakeLists.txt` `project()` and `find_package()` feed the project name, `dependencyCounts.cmake` and the technology list (Qt, Boost, OpenCV, Eigen, fmt, spdlog, protobuf, gRPC, Catch2, GoogleTest, …); unknown packages are counted, never guessed
- Nested CMake subprojects (v0.71.0): every `CMakeLists.txt` contributes `find_package` counts and technologies with per-manifest sources (capped at 50 nested); the project name still comes from the root manifest
- Scala multi-line signatures (v0.72.0): declarations spanning several lines before `{`, `=`, or a Scala 3 `:` get correct ranges and `parent` ownership, including indentation bodies measured from the closing signature line
- Readable language labels (v0.73.0): the panel language filter and card details show `JavaScript`, `C#`, `C++`, … while filter values keep the raw index ids
- pyproject import roots (v0.74.0): setuptools `package-dir`, PDM's string form, `packages.find where`, and poetry `from` directories join the Python import roots; absolute or `..` values are ignored
- Language distribution (v0.75.0): the single-workspace view shows readable per-language file counts (top 8 + overflow), falling back to file rows for older indexes
- Directional module pages (v0.76.0): deterministic module wiki pages split `Depends on` (outbound) from `Depended on by` (inbound), each sorted and capped at 8
- Angle-bracket includes (v0.77.0): `#include <core/api.hpp>` resolves through `include`/`src`/`inc` roots (quoted includes still try the file directory first); system headers remain edge-free
- Module dependency prompts (v0.78.0): theme synthesis receives a top-15 cross-module edge summary and is told to use only those directions, grounding architecture pages in the index
- Status hotspots (v0.79.0): `repowiki-status` returns and renders the top-10 cross-module import edges, so architecture hotspots show up without generating a wiki
- Outgoing import edges (v0.80.0): `repowiki-cards imports=true` answers "what does this file depend on" with target paths, statement lines and named symbols — the complement of reverse references
- Import cycle detection (v0.81.0): `repowiki-status` reports file-level cycles as strongly connected components, and theme synthesis is told to call them out as architectural risks
- Panel import listing (v0.82.0): card details show outgoing import edges alongside reverse references, with `↔` marking mutual imports (two-file cycles)
- Module-page cycle sections (v0.83.0): deterministic module pages list modules that import each other both ways, computed before the per-direction cap
- Hatch import roots (v0.84.0): `[tool.hatch.build]` / target `packages` become Python import roots, completing the setuptools / PDM / poetry / Hatch coverage
- Vue SFC indexing (v0.85.0): `<script>` / `<script setup>` content is parsed with JS/TS rules and source-accurate line numbers; template/style produce nothing
- Skipped-file accounting (v0.86.0): unreadable or oversized source files are reported as `skipped` in the index stats, tool output, status line and a warning
- Card-body search (v0.87.0): the panel search also scores full card bodies (purpose, key symbols, pitfalls), with lowercased copies precomputed per row
- Svelte SFC indexing (v0.88.0): module and instance script blocks parse with JS/TS rules and source-accurate line numbers; markup/styles produce nothing
- Panel skip stats (v0.89.0): the workspace stat row appends `Skipped N` (with a localized tooltip) when the index reports skipped files
- Panel cycle badges (v0.90.0): files in an import cycle show `⟲` in both grid and list views, with a localized accessible name and tooltip
- Go multi-module resolution (v0.91.0): nested `go.mod` prefixes resolve submodule imports locally; deeper/longer modules win, root behavior unchanged
- Transitive imports (v0.92.0): `repowiki-cards imports=true depth=2..3` expands the import graph breadth-first (nearest hop wins, bounded, cycles finite)
- Panel import depth (v0.93.0): the card detail pane has a 1/2/3-hop selector for its imports section, using the same breadth-first semantics client-side (`⇢` + `N hops` marks deeper edges, reopening a card resets to one hop)
- Reverse impact surface (v0.94.0): `repowiki-cards dependents=true` answers "who imports this file", and `depth=2..3` adds indirect dependents (`←` / `⇠`); the panel shows a Dependents list driven by the same depth control
- Fan-in hubs (v0.95.0): `repowiki-status` ranks the most imported files (distinct importers, ties by path) as change-risk hotspots
- Inline mermaid diagrams (v0.96.0): ```` ```mermaid ```` fences in wiki pages and card bodies render as themed SVG flowcharts (deterministic layered layout; unsupported types fall back to code blocks)
- Panel fan-in hotspots (v0.97.0): the single-workspace view lists the top three most-imported files, matching the status tool's ranking
- Go `internal` checks (v0.98.0): indexing reports imports that cross an `internal` boundary as warnings (edges stay indexed; root `internal/` stays open)
- Panel index warnings (v0.99.0): the stat row shows the warning count with the first entries in its tooltip
- Clickable hotspots (v0.100.0): high-fan-in chips open the file's card detail
- Fan-in-grounded synthesis (v0.101.0): the generate prompt carries the top five high-fan-in files with an anti-fabrication instruction
- Module-page fan-in (v0.102.0): deterministic module pages append the top three most-imported files of that module (cross-module importers included)
- Mermaid subgraph groups (v0.103.0): `subgraph` blocks render as dashed grouping boxes with labels
- Expandable index warnings (v0.104.0): the stat-row counter toggles a full warning list (tooltip keeps a three-entry preview)
- Renderer-aligned mermaid guidance (v0.105.0): the synthesis prompt asks for `flowchart` + `subgraph` and short labels
- Bounded internal warnings (v0.106.0): Go `internal` violations cap at 50 entries with a folded summary
- Bounded status warnings (v0.107.0): the status text report prints three warnings plus a folded count; the structured array keeps everything
- Representative cycle paths (v0.108.0): each cycle carries one shortest closed path (`a → b → a`), rendered in the status line and the synthesis prompt
- Panel cycle routes (v0.109.0): the `⟲` tooltip appends that route for two/three-file cycles
- Card-detail cycle summary (v0.110.0): the detail pane shows the group size and short route without hovering
- Clickable cycle routes (v0.111.0): files in that route open their own detail
- Clickable dependency entries (v0.112.0): imports and dependents lists open the target file's detail
- Locale-aware asset fallback (v0.113.0): cards docs/memory/wiki citations and status automatically use the locale that actually holds assets when none is requested (explicit locales stay strict); fixes the environment-dependent silent-empty reads when assets are zh and the host is en, and the suite is green under both `LANG=en` and `LANG=zh`
- Documentation coverage and health (v0.114.0): status reports card coverage over plan-eligible files with the largest module gaps, plus a four-component weighted health score (A–D) and the top four issues
- Change impact analysis (v0.115.0): `repowiki-impact` returns dependents, cycles, fan-in, affected cards/wiki, an explained risk level and a verification order before editing
- Symbol-aware impact (v0.116.0): `repowiki-impact symbols=[...]` filters direct dependents by named-import evidence while preserving transitive and file-level upper bounds; unresolved names never widen scope
- Budgeted task context (v0.117.0): `repowiki-context` combines ranked files, line-numbered source, knowledge documents and static relations in one character-bounded pack with explicit omission counts
- Parser-correct incremental indexing (v0.117.0): multiline JS/TS import/export-from statements retain start lines and named symbols; `parserVersion` invalidates stale per-file parse caches without misreporting existing files as additions
- Lexical usage evidence (v0.118.0): symbol-scoped `repowiki-impact` scans direct named importers for identifier-boundary occurrences, excluding import/export lists, destructuring and whole-line comments; bounded to 20 files / 10 sites per symbol / 100 total, with unreadable importers reported as unknown rather than absent
- PageRank core files and repo-map fallback (v0.119.0): `repowiki-status` ranks files by static import-graph PageRank, capturing indirect importance that fan-in misses; `repowiki-context` uses the same ranking as an explicitly labelled fallback when a task matches no indexed file
- Symbol anchors for task context (v0.120.0): `repowiki-context symbols=[...]` anchors the pack to definitions (bare names or `path#name`), works without a query, reports bare-name ambiguity with candidates, and never masks failed anchors with the repo-map fallback
- Panel core files (v0.121.0): the single-workspace view renders a PageRank chip row next to fan-in hubs, with clickable files that open their detail; hidden when the index has no edges
- Affected-test routing (v0.122.0): `repowiki-impact` classifies impacted files as tests by path heuristics, lists them nearest-hop first (up to 50) and puts them first in the verification recommendations
- Wiki citation integrity (v0.123.0): `repowiki-status` verifies manifest citations against the index and filesystem, reports missing paths with bounded page details, and never misreports unverified citations as broken
- Conservative unused-export audit (v0.124.0): `repowiki-status` lists exports without named-import evidence, assesses only files whose inbound edges all carry named symbols, and reports every skipped file instead of guessing
- Module coupling metrics (v0.125.0): `repowiki-status` reports Ca/Ce and instability `Ce/(Ca+Ce)` for cross-module imports, ordered by instability
- Citation line-range validation (v0.126.0): index schema v6 records source line counts; `repowiki-status` flags zero/reversed/out-of-EOF `#Lx-Ly` citations and counts unverifiable ranges as unchecked instead of guessing
- Panel citation issues (v0.127.0): the Wiki tab shows an aggregate out-of-range/unchecked summary and per-page `⚠ N` badges derived from the manifest and index line counts
- Citation content drift (v0.128.0): wiki manifest v3 records a content digest per citation; `repowiki-status` recomputes them and reports changed citations, counting unreadable or unverifiable ones as unchecked
- Drift-aware incremental generation (v0.129.0): `repowiki-generate` re-verifies manifest citation digests before the fresh skip; changed or unverifiable citations re-synthesize with a stated reason, a clean check reports `citationDrift: 0`, and status/generate share one bounded checker
- Citation-aware health scoring (v0.130.0): missing citation paths, out-of-range lines and content drift lower the wiki component of the weighted health score (capped at 40/20/20), with unchecked citations reported but not penalized
- Citation digest coverage (v0.131.0): generate/status report `citationCoverage`; citations without a digest are labelled untracked rather than counting as verified, and legacy manifests are distinguished explicitly
- Panel citation coverage (v0.132.0): the Wiki tab shows a muted `◌ N` badge and a `tracked/total` summary when digest coverage is incomplete, labels legacy manifests once, and deduplicates page/section citation counts
- Untracked citation reasons (v0.133.0): generation records why a citation has no digest (`unreadable`, invalid `range`, read `cap`), status and hints surface the breakdown, and legacy manifests report `unknown` instead of guessing
- Panel reason tooltips (v0.134.0): the Wiki tab reads `citationMisses` and puts the localized reason breakdown into each `◌ N` tooltip and the coverage summary, still without reading source files
- Concurrent drift reads (v0.135.0): drift verification prefetches unique cited files with bounded concurrency (default 8, cap 16) while preserving caps, ordering and `unchecked` totals
- Page-level coverage details (v0.136.0): `repowiki-status` lists up to ten pages with untracked citations (most affected first, with reasons) and names an example in the text report; health lists the count without changing the score
- CI wiki freshness gate (v0.137.0): `verify:wiki` fails on missing citations, out-of-range lines or drift, warns on untracked/unverifiable citations unless `--strict`, supports `--root`/`--locale`/`--json`, and deduplicates overlapping page/section range counts
- Panel untracked filter (v0.138.0): the Wiki tab can show only pages with untracked citations (count in the toggle, `aria-pressed`, composes with search) and uses a dedicated no-match message
- Stale-wiki gate (v0.139.0): `verify:wiki` recomputes the card `inputDigest` and fails when cards changed after generation, even if every citation path still exists
- Memory stale gate and `--require` (v0.140.0): the gate also recomputes the accepted-memory `memoryDigest` (matching generate's incremental short-circuit), reports `staleReasons`, fails under `--strict` when manifests lack staleness digests, and refuses to pass silently with no assets in CI
- Page integrity gate (v0.141.0): manifest pages without a file on disk fail; orphan page files only warn, and both lists are exposed as `missingPages`/`orphanedPages` in JSON
- Structured problems and empty-manifest strictness (v0.142.0): `--json` emits stable `problems[].code` values for CI aggregation; an empty manifest warns by default and fails under `--strict`/`--require`, and `--strict` also fails when citation probing hits the 200-path cap
- Persisted generation failures (v0.143.0): `repowiki-generate` records failed page writes in the manifest; `verify:wiki` reports `wiki/generation-failed` (warning by default, failure under `--strict`) and status shows `wiki.failed`/`wiki.failedPages`
- Panel wiki diagnostics (v0.144.0): the Wiki tab warns about failed pages from the last generation and manifest pages missing from disk, including when the page list is empty
- Index-version and CI fixture gate (v0.145.0): a pre-v6 index or an unverifiable `#Lx-Ly` range warns by default and fails under `--strict`; the workflow now proves the strict gate both passes on a fresh fixture and fails after a card change
- Link and path integrity (v0.146.0): manifest page paths must stay under `wiki/<locale>/` and match their files; relative `.md` links in page bodies fail when they escape the project root or point to missing files, with a 200-probe cap that fails under `--strict`
- Status missing pages (v0.147.0): `repowiki-status` reports `wiki.missing`/`wiki.missingPages` and prints the count, matching the gate and the panel
- Missing-page health penalty (v0.150.0): missing pages count in the wiki denominator and lower the wiki component by up to 40 points, with the issue surfaced ahead of stale pages
- Bounded gate reads (v0.151.0): cards, accepted memory and wiki pages are read through 8-way bounded concurrency while preserving order and duplicate-slug semantics
- Status invalid paths (v0.152.0): `repowiki-status` reports manifest pages whose path is invalid or does not match the file, mirroring the gate without reading page bodies
- Panel invalid-path notice (v0.153.0): the Wiki tab reports invalid manifest paths and excludes them from the missing-page count
- Panel stale-cards notice (v0.148.0): the Wiki tab recomputes the card `inputDigest` with Web Crypto and warns when the wiki fell behind; unavailable crypto degrades to silence
- Panel stale-memory notice (v0.149.0): the same check now covers the accepted-memory `memoryDigest`, matching the gate's staleness view
- Elixir umbrella stacks (v0.178.0): every `apps/*/mix.exs` contributes Hex dependencies and technologies (capped at 20 nested manifests, each technology keeps its source); the project name stays root-only
- Elixir indexing (v0.177.0): `defmodule`-based module map (nested full names), `def`/`defp`/`defmacro`/`defguard`/`defdelegate` with do/end ranges, `alias`/`import`/`require`/`use` edges (grouped and renamed aliases), and `mix.exs` app name / dependency count / Hex technology detection
- Graph-aware wiki freshness (v0.176.0): the manifest records a `graphDigest` over the indexed file set and dependency edges; incremental generation requires it to match, `verify:wiki` reports `wiki/stale-graph`, status warns and the panel folds graph mismatch into its stale notice, so config-driven edge changes no longer leave architecture pages silently outdated
- Precise CJK query tokens (v0.175.0): multi-character Chinese queries tokenize to bigrams only (documents still hold unigrams), so "无匹配" no longer matches every document containing "无", while one-character queries keep working
- GFM tables and nested lists (v0.174.0): the panel renderer handles column tables (alignment from the delimiter row, inline formatting and `\|` escaping) and indentation-nested `ul`/`ol` inside their parent items, so generated cards and wiki pages render as written
- Bounded directory-listing prefetch (v0.173.0): siblings are listed up to 8 at a time ahead of the depth-first walk, so remote `ctx.fs` sticks no longer wait one round trip per directory; consumption order, budget accounting and output are unchanged
- Stricter snapshot manifests (v0.172.0): import refuses unknown `schemaVersion`, count/length mismatches, non-object JSON and manifests over 8 MiB before parsing, while legacy manifests without `count` still verify and `allowCorrupt` remains the explicit override
- Reproducible index output (v0.171.0): directory entries are sorted before traversal (code-unit order), and the finished index sorts files by path and edges by source/line/target, so a backend with a different `listDir` order produces the same `index.json` and an over-budget repo truncates at the same files
- Untrusted index paths (v0.170.0): `readIndex` normalizes every file path, drops absolute/escaping entries and the edges that point at them, exposes bounded `untrusted` counts and makes `repowiki-status` warn — assets that travel with Git can no longer make context/extract/impact read files outside the project
- PHP PSR-4 autoload resolution (v0.169.0): root and nested `composer.json` `autoload` / `autoload-dev` `psr-4` prefixes map `use` statements to arbitrary directories (longest prefix wins, array directories and the empty-prefix fallback supported, case-insensitive class lookup), while absolute or escaping directories and external packages stay edge-free
- Dependency-directory exclusions (v0.169.0): `vendor/` and `.dart_tool/` join the unconditional exclude list, so installed Composer/pub packages and generated Dart caches cannot crowd out project files
- Optional semantic index stays deferred (YAGNI per the plan)

## Architecture highlights

- **Single bundle, single plugin row, zero npm runtime dependencies, zero build tooling**: plain ES Modules with hand-written `ToolDefinition` (no `@deepseek-ai/dsh-tools` import); installs and runs from a local directory.
- **Assets are plain files**: the index, cards and Wiki land in `<project root>/.dsh-repowiki/` and travel with Git. Location strategy: walk up from the current directory, fall back to the current directory.
- **All file IO goes through `ctx.fs`** (review §9.1) rather than bare node fs, keeping policy and observation consistent; asset writes read back their content and fail loudly on mismatch.
- **LLM work goes through spawn subagents** (ADR-0003): `ctx.subagents.startActivation({provider:'spawn'})` inherits the session model; structured outputs are constrained by `outputSchema`; cancellation flows through `exec.signal`; Markdown formats are rendered by the plugin, never dictated by the model.
- **`inject: ['fs', 'tools', 'subagents']`**: optional capability seams; if absent in a profile the plugin stays inactive instead of throwing.
- **Symbol extraction is a zero-dependency lightweight parser** (ADR-0001), with no external parsing framework: functions/classes/methods/interfaces/types/imports for JS/TS, Python, Go, Rust, Java, C#, Kotlin, PHP, Ruby, Swift, Scala, Elixir, C and C++; local edges resolve through Python absolute/relative imports (project root, pyproject custom roots, `src`/`lib` layout roots), C/C++ `#include` (quoted includes try the file directory first; both forms use `include`/`src`/`inc` roots), `go.mod`, Rust crate/module conventions, Java package suffixes, C#/Kotlin/Scala dotted paths, case-insensitive PHP `use` resolution (composer `psr-4` mappings from root and nested manifests, then namespace suffixes), Ruby `require_relative` and `lib/` load-path `require`, Elixir `defmodule` module maps for `alias`/`import`/`use`, SwiftPM `Package.swift` target paths (with `Sources/<Target>/` fallback), and for JS/TS the `tsconfig`/`jsconfig` `paths` + `baseUrl` aliases plus workspace package `exports` (external modules are ignored). Directory entries are sorted by name (code-unit order), sibling listings are prefetched up to 8 at a time, and file reads/parsing use bounded concurrency (8-way default) with results assembled by path — the index stays byte-for-byte reproducible while remote backends overlap directory round trips.
- **Git provenance without a subprocess**: `index.json` carries `git.branch` / `git.commit` parsed from `.git/HEAD`, loose refs, `packed-refs` and worktree `commondir` files; non-repositories simply omit the field.
- **Concurrent-write safety** (ADR-0005): the six mutating tools queue per resolved asset root through an in-process promise-chain lock; extract/generate perform model calls outside the lock and re-check freshness inside the write critical section; extraction can dispatch up to 4 model calls in parallel (`concurrency`) with bounded retries (`attempts`) while writes remain serialized; different repositories never block each other, and read-only queries stay lock-free.
- **Zero-dependency ranking**: BM25 over cards/wiki/accepted memory with Latin words plus CJK unigrams/bigrams; no embeddings, no vector store.
- **Reverse references on demand**: `src/references.js` inverts `index.edges` (`target file → symbol → importing sites`) at query time; schema v6 edges carry the import line, so results are `path:Lx` precise, bounded and explicitly import-level.
- **Wiki citations on demand**: `src/wiki-references.js` inverts the wiki manifest (`source file → pages/sections`); manifest v2 stores per-section sources, so "which docs cite this file" is answered without re-reading wiki pages.

## Client UI (web)

`client.js` is the browser half of the bundle (registered via
`dsh.client.platform: web`): a sidebar entry at `sidebar.panellist` and a
keyed page at `main` (`key: 'repowiki'`). After a workspace is picked, the
page reads `.dsh-repowiki/` through `ctx.remote.workspaceFiles` (authorized
by any member session of that workspace, per `WorkspaceView.sessionIds`) and
renders the panel: counts, all/generated/pending filter, search, grid and
list views, group-by-module, and card details. Generation starts with
`ctx.uiWorkspace.startSession(workspaceId, ...)`; the icon is hand-drawn SVG
(no `dsh-client-ui-primitives` import, per its stability rules). After installing
or upgrading, refresh the GUI once for the client module to load.

```
DSH Plugins > Add plugin > select this directory
```

Or use `plugin_manager` with `install_bundle` and this directory's absolute path as the target. Installation affects every session in the profile.

## Development and testing

```sh
# Unit + integration tests (node's built-in test runner, zero dependencies)
npm test

# With coverage
npm run test:coverage

# Coverage gate: lines ≥95, branches ≥85, functions ≥85
npm run coverage:check

# Static checks (dev-only tooling; runtime stays dependency-free)
npm run typecheck
npm run lint

# Secret scan over git-tracked files
npm run scan:secrets

# Local index benchmark (synthetic repo)
npm run bench -- 2000

# Host drift check: parse the local app.asar and verify every
# --dsw-alias-* token used by client.js is still defined by dsh's own CSS
# (with a dark-mode override). Skips with exit code 3 when app.asar is not
# present (CI). v0.22.0.
npm run verify:host

# Wiki freshness gate: fail on missing citations, out-of-range lines,
# content drift, stale cards/accepted memory, manifest pages missing from
# disk, invalid/mismatched/duplicate page definitions, broken or escaping
# relative links (wiki pages and project files), failed page writes from the
# last generation or empty manifests under --strict/--require;
# untracked/unverifiable citations, pre-v6 indexes and unverifiable ranges
# warn unless --strict. --require fails when no manifest exists. --root /
# --locale / --json supported. v0.156.0.
npm run verify:wiki -- --root . --strict --require
```

### CI usage

`npm run verify:wiki -- --json` prints a machine-readable report and exits
non-zero when a wiki is broken or stale (including manifest pages missing from
disk, invalid page paths and broken internal links), so the gate can run after
`repowiki-generate` in any pipeline. Exit
codes: `0` pass, `1` verification failed, `2` usage or read error. `--strict`
also fails on untracked citations, unverifiable digests or ranges, capped
citation probes, pre-v6 indexes, manifests without staleness digests and
recorded generation failures; without it they are warnings. Add `--require` so
a missing or empty wiki fails instead of passing with a warning. The JSON
report also carries stable `problems[].code` values (e.g. `citation/missing`,
`wiki/stale-cards`) for CI aggregation. The repository workflow runs this
exact recipe against a generated fixture and asserts both the passing and the
stale-failure exit code.

### Problem codes

`--json` reports every finding in `problems[]` with a stable `code` and a
`severity` (`error` or `warning`). CI can aggregate or suppress by code:

| Code | Default | Meaning |
|---|---|---|
| `index/read-error` | error | `index.json` cannot be read |
| `index/outdated` | warning (`--strict`: error) | index predates schema v6 (no line counts) |
| `assets/missing` | warning (`--require`: error) | no wiki manifest exists |
| `manifest/missing`, `manifest/invalid` | error | requested manifest is absent or invalid |
| `manifest/empty` | warning (`--strict`/`--require`: error) | manifest lists no pages |
| `manifest/duplicate-pages` | error | manifest repeats a page slug or path |
| `manifest/missing-digests` | warning (`--strict`: error) | no card/memory staleness digests |
| `citation/missing` | error | a cited path does not exist |
| `citation/range` | error | a cited line range is out of bounds |
| `citation/range-unchecked` | warning (`--strict`: error) | line count unknown, range unverifiable |
| `citation/drift` | error | cited content changed since generation |
| `citation/untracked` | warning (`--strict`: error) | a citation has no content digest |
| `citation/unchecked` | warning (`--strict`: error) | a digest could not be verified |
| `citation/probe-capped` | warning (`--strict`: error) | existence probing hit the 200-path cap |
| `wiki/stale-cards`, `wiki/stale-memory` | error | cards/accepted memory changed after generation |
| `wiki/missing-pages` | error | a manifest page file is missing |
| `wiki/orphaned-pages` | warning | a page file is not listed in the manifest |
| `wiki/duplicate-page-slug` | error | two page files declare the same slug |
| `wiki/generation-failed` | warning (`--strict`: error) | the last generation recorded failed page writes |
| `wiki/invalid-page-path`, `wiki/page-path-mismatch` | error | bad manifest path or path does not match the file |
| `wiki/unsafe-link`, `wiki/broken-link` | error | a relative link escapes the project root or points to a missing file (wiki pages and project files) |
| `wiki/link-probe-capped` | warning (`--strict`: error) | link probing hit the 200-link cap |

## Upgrade operations (dsh is in rc; public seams change often)

- This bundle declares **no** `@deepseek-ai/dsh-*` dependencies (shipped packages resolve from the dsh installation) — the cost is that **every dsh upgrade requires a regression pass**: run `npm test`, then `npm run verify:host` (catches theme-token renaming/removal against the upgraded app's own bundled CSS), plus a minimal in-session smoke of `repowiki-index` and `repowiki-cards`.
- `engines.dsh` is only a lower bound, not a compatibility proof.
- `index.json` carries `schemaVersion`; on version mismatch the read side degrades to a "rebuild" prompt instead of crashing.

## Directory layout

```
index.js               Plugin entry (apply + inject: fs/tools/subagents)
scripts/verify-host-tokens.mjs  Local host drift check (token liveness, v0.22.0)
scripts/verify-wiki.mjs         Wiki freshness gate (links/ranges/drift/stale/pages/paths/coverage, v0.151.0)
scripts/check-coverage.mjs      Coverage gate (lines/branches/functions)
scripts/scan-secrets.mjs        Git-tracked secret scan
scripts/bench.mjs               Synthetic-repo index benchmark
scripts/release.mjs             Local release (tests + version + commit/tag)
docs/detail/           Plugin-manager detail page (one image + docs, v0.25.0)
docs/adr/              Architecture decision records (Chinese)
docs/checkpoints/      Phase checkpoints (Chinese)
docs/runbook.md        Diagnosis and recovery runbook
docs/compatibility.md  DSH / Node / OS compatibility matrix
docs/benchmarks.md     Benchmark method and latest numbers
cordis.patch.yml       Loader patch (inserts the plugin row)
src/schema.js          Constants and domain conventions (single source)
src/symbols.js         Zero-dependency symbol extraction (15 languages + Vue/Svelte SFC)
src/deps.js            import/require dependency edge extraction
src/stack.js           Tech-stack detection (npm/pip/go/cargo/maven/gradle/composer/bundler/swiftpm/sbt/pub/cmake)
src/assets.js          Asset location and IO (ctx.fs injected)
src/indexer.js         Index orchestration (walk + extract + edges + assemble)
src/ignore.js          Documented .gitignore subset parser/matcher
src/modules.js         Module tree (directory grouping, parents, direct counts)
src/lock.js            Per-asset-root write lock (in-process FIFO, O5)
src/search.js          Zero-dependency BM25 ranking (cards/wiki/memory)
src/locale.js          Locale probing and content-first fallback for assets
src/health.js          Documentation coverage and weighted health score (pure)
src/impact.js          File- and symbol-scoped impact (path/symbol resolution, reverse BFS, cycles, risk; pure)
src/graph-rank.js      File-level PageRank over static import edges (pure)
src/usages.js          Lexical symbol usage sites (identifier boundaries, import-block exclusion, bounded; pure)
src/citation-digest.js Citation line slicing and content digests (pure)
src/citation-drift.js  Manifest citation digests vs current source, coverage and per-page details (async, bounded concurrency; shared by status/generate)
src/test-files.js      Test-file heuristics and affected-test collection (pure)
src/unused-exports.js  Conservative export audit without named-import evidence (pure)
src/coupling.js        Module Ca/Ce coupling and instability (pure)
src/context.js         Task terms, file ranking, source snippets and character-budget packing (pure)
src/module-doc.js      Deterministic module wiki pages (no model calls)
src/card-schema.js     Card / Wiki outputSchema for subagents
src/prompts.js         Subagent prompt construction
src/render.js          Card / Wiki Markdown rendering
src/knowledge.js       knowledge + wiki directory read/write, frontmatter
src/config.js          repowiki-plan.json reading and candidate filtering
src/spawn.js           spawn subagent invocation wrapper
src/transfer.js        Snapshot copy for export/import (ctx.fs injected)
src/util.js            Shared path/digest/frontmatter/verified-write helpers
src/tool-index.js      repowiki-index tool
src/tool-cards.js      repowiki-cards tool
src/tool-extract.js    repowiki-extract tool
src/tool-generate.js   repowiki-generate tool
src/tool-status.js     repowiki-status tool
src/tool-impact.js     repowiki-impact tool
src/tool-context.js    repowiki-context tool
src/tool-export.js     repowiki-export tool
src/tool-import.js     repowiki-import tool
src/memory.js          Session memory entries (write/list/status)
src/tool-memory.js     repowiki-memory tool
src/tool-edit.js       repowiki-edit tool
src/types.d.ts         Shared TypeScript declarations for ctx.fs / tools
test/                  Unit and integration tests (535 cases)
```

## License

MIT (see [LICENSE](LICENSE)).
