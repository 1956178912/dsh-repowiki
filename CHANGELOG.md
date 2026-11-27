# Changelog

English | [中文摘要](CHANGELOG.zh-CN.md)

All notable changes to this project are documented in this file. Versions
follow the phase plan in the README roadmap.

## [0.252.0] - 2026-11-28

### Added

- **Python package barrels**: named `from .core import parse` and star
  `from .core import *` imports in `pkg/__init__.py` now act as re-exports,
  so `from pkg import parse` resolves to `pkg/core.py` in references,
  lexical usages and symbol impact. Python module-level symbols are treated
  as importable despite the language's `exported: false` convention, and
  methods are excluded.
- **Python star imports preserved**: `from x import *` now records `*`
  instead of being dropped, powering both potential references and barrel
  resolution; `__all__` filtering is not guessed (lexical scans confirm
  actual uses). Parser v10 re-parses cached imports.

### Tests

- 789 cases pass (LANG=en); new coverage for Python star extraction,
  package-barrel references/usages and a real-index cards integration.

## [0.251.0] - 2026-11-28

### Added

- **Barrel-aware symbol impact**: `repowiki-impact` symbol scope now treats
  importers that reach the changed symbol through an `export * from` or
  same-name re-export barrel (and the intermediate re-exporting barrels) as
  direct impact instead of the next transitive hop. Symbol references and
  lexical usage evidence keep the barrel import line.
- Shared `reexportImportSites` in `src/reexports.js` now powers the usages,
  references and impact paths; `computeSymbolImpact` accepts the index file
  entries as an optional fifth argument.

### Tests

- 784 cases pass (LANG=en); unit coverage for multi-hop barrel impact plus a
  real-index `repowiki-impact` integration (direct counts, references,
  usages).

## [0.250.0] - 2026-11-28

### Added

- **Barrel re-export chains**: `repowiki-cards references` and `usages` now
  resolve named imports through `export * from` and same-name
  `export { x } from` barrels (up to 4 hops), attributing the final importer
  to the defining file. A barrel's own export shadows star re-exports,
  ambiguous star origins are skipped, and re-export edges are not reported
  as usage sites.
- **Edge kinds preserved**: the indexer now stores the reference form
  (`import`/`export-from`/`require`/`mod`) instead of collapsing everything
  to `import`, so barrels can be distinguished from namespace imports;
  existing consumers that only read endpoints/symbols are unaffected.

### Changed

- `usageImporters`, `collectSymbolUsages`, `repowiki-impact` usage evidence
  and the cards/context tools accept the index file entries to resolve
  barrels; shared logic lives in `src/reexports.js`.

### Tests

- 782 cases pass (LANG=en); new coverage for single/multi-hop barrels,
  named re-exports, local shadowing, ambiguous origins, wildcard importers,
  edge-kind preservation and a real-index cards integration.

## [0.249.0] - 2026-11-28

### Added

- **MATLAB indexing (43rd language)**: `.m` files classified as MATLAB by
  content now expose `function` declarations (multi-output `[a,b] = f`,
  single-output and no-output forms), nested/local functions (nested ones
  carry `parent` and are non-exported), `classdef` classes, `properties`
  block members as variables (private blocks non-exported) and `methods`
  block functions as methods whose `parent` is the class (private method
  blocks non-exported).
- **MATLAB masking and ranges**: `%` line comments, `%{…%}` block comments
  and single/double-quoted strings are masked, with transpose-aware single
  quotes (`x'` is not a string). Ranges balance `end` across
  `if`/`for`/`while`/`switch`/`try`/`spmd`/`arguments`, compact
  `if x, y; end` lines, and end-less function files stop before the next
  same-indent `function`.
- **Language-onboarding guard**: `matlab` joins `SYMBOL_LANGUAGES` so the
  prompt fence and panel label cannot silently drift; `.m` still classifies
  as Objective-C unless MATLAB markers are present.

### Tests

- 775 cases pass (LANG=en); new MATLAB extractor coverage (masking,
  transpose, nested functions, compact blocks, class properties/methods and
  private blocks) plus a real-index assertion.

## [0.248.0] - 2026-11-28

### Added

- **SwiftPM local packages**: `Package.swift` `.package(path: "../LocalCore")`
  entries now count toward `dependencyCounts.swiftpm` alongside remote `url:`
  packages, using the directory basename (lowercased, trailing slashes
  stripped). Local package names are never mapped to a guessed technology;
  the verified `SWIFT_TECH` map still applies to remote repositories only.

### Tests

- 773 cases pass (LANG=en and LANG=zh); new coverage for mixed remote/local
  Package.swift dependencies and the no-guessed-technology rule.

## [0.247.0] - 2026-11-28

### Added

- **JSON podspec metadata**: `*.podspec.json` files (CocoaPods JSON specs) are
  now collected and parsed alongside Ruby `*.podspec`: `name`/`version`,
  top-level `dependencies` and `subspecs[].dependencies` feed
  `dependencyCounts.cocoapods` and the verified iOS tech map. Malformed JSON
  contributes zero instead of throwing, and the shared 20-file nested cap
  applies to both formats.

### Tests

- 772 cases pass (LANG=en and LANG=zh); new coverage for JSON podspec
  name/version/dependencies/subspecs, malformed JSON and indexer aggregation
  next to Ruby podspecs.

## [0.246.0] - 2026-11-28

### Added

- **Conservative default-import resolution**: JS/TS default imports now record
  a temporary `default:Local` marker at extraction time. After the index has
  every file's symbols, the marker is replaced with a real symbol name only
  when the target file exports a symbol whose name equals the local binding;
  otherwise the marker is dropped and the file-level edge remains. Aliases,
  anonymous default exports and "single export" guesses are never treated as
  symbol evidence.

### Tests

- 771 cases pass (LANG=en and LANG=zh); new coverage for default-import
  markers (plain and mixed with named/namespace clauses), same-name resolution
  through the indexer and the alias case that must stay file-level.

## [0.245.0] - 2026-11-28

### Added

- **Usage evidence in context packs**: `repowiki-context usages=true` runs the
  same bounded usage collector as `repowiki-cards` for resolved symbol anchors
  (direct named/namespace importers plus the defining file, definition range
  excluded). Usage summaries, up to two example sites per symbol and
  unreadable-file warnings are appended to the pack's relations section, and
  structured `usages` entries with `usagesSkipped`/`usagesSkippedFiles`/
  `usagesTruncated` are returned.
- **Shared collector**: `collectSymbolUsages` and `MAX_USAGE_TARGETS` moved
  from the cards tool into `src/usages.js`, so both tools share one
  implementation and budget policy.

### Tests

- 770 cases pass (LANG=en and LANG=zh; the context symbol-anchor test now also
  covers `usages=true`, structured entries and rendered usage lines).

## [0.244.0] - 2026-11-28

### Added

- **Podspec metadata**: root and nested `*.podspec` files (bounded at 20) now
  contribute `s.name`/`s.version` project metadata, `dependencyCounts.cocoapods`
  and the verified iOS technology map. Dependencies declared with
  `s.dependency` and inside `subspec` blocks (`sp.dependency`) are both
  counted, optional version constraints are kept on the technology entry, and
  commented declarations are ignored.

### Tests

- 770 cases pass (LANG=en and LANG=zh); new coverage for podspec name/version/
  dependencies (including subspecs and commented lines) and root + nested
  podspec aggregation through the indexer.

## [0.243.0] - 2026-11-28

### Added

- **Wildcard reference evidence**: `import * as ns from './a'` and
  `export * from './a'` now record `*` in `edge.symbols` instead of being
  dropped as side-effect imports. `repowiki-cards references=true` merges `*`
  into every symbol of the target as a potential reference (sorted with named
  references), `repowiki-cards usages=true` scans namespace importers
  lexically (so `ns.parse()` is confirmed while an unused namespace import
  stays silent), and symbol-scoped `repowiki-impact` counts namespace
  importers as direct impact for the selected symbols. Default imports remain
  file-level only (no name guessing).

### Tests

- 768 cases pass (LANG=en and LANG=zh); new coverage for `export *` symbol
  extraction, wildcard reference merging, wildcard importer selection,
  namespace-import direct impact and the cards end-to-end chain.

## [0.242.0] - 2026-11-28

### Added

- **Local usage scans in `repowiki-cards`**: `usages=true` now also scans the
  symbol's defining file, so same-file calls are reported next to importer
  usages. The definition range is excluded with exact line ranges
  (`findSymbolUsages` gained `skipRanges`), so the definition text and
  recursive references are not counted as evidence. Defining files do not
  consume the 20-importer-file cap; they are read in addition (at most five).

### Tests

- 765 cases pass (LANG=en and LANG=zh); new coverage for `skipRanges`
  (definition body excluded, malformed ranges ignored), same-file usage in the
  cards tool and the adjusted file-cap accounting (20 importers + 1 defining
  file).

## [0.241.0] - 2026-11-28

### Added

- **Panel architecture-baseline row**: the single-workspace view now loads
  `.dsh-repowiki/arch-baseline.json` and shows new/resolved cycle groups
  (current strongly connected components compared with the baseline
  signatures), the baseline architecture score and the recorded
  duplicate/high-complexity/max-complexity ceilings. New-cycle examples appear
  in the tooltip. The row is hidden when the baseline is missing, and a
  corrupt or oversized baseline never blocks the panel.
- **Shared SCC cache**: cycle analysis is memoized per index object, so the
  `⟲` badge computation and the baseline comparison reuse one Tarjan pass.

### Tests

- 764 cases pass (LANG=en and LANG=zh); new DOM coverage for the baseline row
  (new cycle, score, ceilings) and for the no-baseline case where the row must
  stay hidden.

## [0.240.0] - 2026-11-28

### Added

- **CocoaPods/Carthage metadata**: root and nested `Podfile` (`pod 'Name',
  '~> 1.0'`, comments, local `:path` pods, sub-specs like `Firebase/Core`) and
  `Cartfile`/`Cartfile.private` (`github`/`git`/`binary` lines) now feed
  `dependencyCounts.cocoapods` and `dependencyCounts.carthage` plus a small
  verified technology map (AFNetworking, Alamofire, Firebase, SnapKit,
  ReactiveCocoa, Quick, …). Nested manifests are bounded (20 each) and read
  alongside the root ones.
- **XCTest-aware affected tests**: `*Tests.m`/`*Tests.mm`/`*Spec.m` are now
  recognized as test files, so `repowiki-impact` routes Objective-C test
  targets into `affectedTests` and the verification recommendations instead of
  listing them as ordinary source.

### Tests

- 763 cases pass (LANG=en and LANG=zh); new coverage for Podfile parsing
  (versions, sub-specs, local paths, comments), Cartfile parsing
  (github/git/binary), nested manifest aggregation and Objective-C test-path
  recognition.

## [0.239.0] - 2026-11-28

### Added

- **Objective-C indexing (42nd language)**: `.m`/`.mm` files are indexed.
  `@interface`/`@implementation` become classes (class extensions
  `@interface Foo ()` keep their members non-exported; categories collapse to
  the owning class), `@protocol` becomes an interface, `-`/`+` methods carry
  full selectors (`insert:at:`), prototypes end at `;` while implementations
  span their brace block, and `@property` declarations become variables
  (block properties `(^name)` included). C/C++ declarations in the same file
  are merged, so structs, typedefs and functions are not lost.
- **Content-based classification for shared extensions**: `.h` files with
  `@interface`/`@protocol`/`@property` are reclassified as Objective-C without
  dropping their C symbols; `.m` files written in MATLAB (`function`/
  `classdef` or a line-leading `%`) are classified as `matlab` and never
  mislabelled as Objective-C. `.mm` is Objective-C++ by extension.
- **Objective-C dependency edges**: `#import "…"`/`#include "…"` resolve from
  the importing file's directory through `include`/`src`/`inc` roots, while
  angle-bracket framework headers stay edge-free; `@import Module;` is a module
  import and creates no file edge.

### Tests

- 760 cases pass (LANG=en and LANG=zh); new coverage for protocol/class/
  extension ranges, selectors and method bodies, block properties, merged C
  declarations, `#import` extraction, `.h` content reclassification, MATLAB
  `.m` classification and Objective-C++ edges.

## [0.238.0] - 2026-11-28

### Added

- **Usage evidence in `repowiki-cards`**: `usages=true` answers "where is this
  symbol used" for matched symbols. It combines import-level evidence
  (`edge.symbols`) with identifier-boundary matches in importer sources,
  excluding import statements/blocks and whole-line comments, and returns
  `symbolUsages` entries with the defining file, importer import sites
  (`{path, line}`), usage sites (`{path, line, text}`), scanned-file count and
  unreadable importers. The scan is bounded to 5 symbols, 20 importer files
  and 100 sites (10 per symbol).
- **Honest incompleteness**: unreadable importers are listed as unknown (not
  unused), symbols and files beyond the caps are counted
  (`symbolUsagesSkipped`, `symbolUsagesSkippedFiles`), and per-symbol
  `truncated` marks evidence limited by a site/file cap. Languages whose
  import edges carry no named symbols yield no importer evidence instead of a
  false zero.

### Tests

- 756 cases pass (LANG=en and LANG=zh); new coverage for usage sites with
  comment/import exclusion, unreadable importers, the 5-symbol target cap,
  the per-symbol site cap, the 20-file cap and docs-target emptiness.

## [0.237.0] - 2026-11-28

### Added

- **Verilog and SystemVerilog indexing (40th/41st languages)**: `.v`/`.vh`
  and `.sv`/`.svh` files are now indexed. `module`, `interface`,
  `interface class`, `package`, `program` and `class` declarations become
  containers with `end*`-matched ranges (one-line blocks included);
  `function`/`task` declarations handle `automatic`/`static`/`virtual`/
  `local`/`protected` modifiers, out-of-class `C::f` definitions (method with
  `parent`) and `extern`/`pure virtual` prototypes that keep their
  declaration-header range. `typedef` (enum/struct/union bodies and simple
  aliases) becomes a type, and container-level `parameter`/`localparam`
  (`parameter type` → type) plus `` `define `` macros are indexed. Multi-line
  headers, `#(...)` parameter lists and brace-bearing typedefs produce correct
  ranges, while `//`/`/* */` comments, strings and `` `define `` continuations
  are masked so they cannot fabricate symbols.
- **Verilog dependency edges**: `` `include "..." `` resolves from the
  importing file's directory through `include`/`inc`/`src`/`rtl`/`hdl` roots
  and the project root (angle-bracket includes skip the file directory), and
  SystemVerilog `import pkg::*;` / `import pkg::sym;` resolve through a
  package/module/interface/class name map. External headers and packages stay
  edge-free.
- **Coq disambiguation**: `.v` is shared with Coq, so files with Coq
  declarations and no HDL structural markers are classified as `coq` (indexed
  without symbols) instead of being misread as Verilog; the panel shows a
  readable `Coq`/`Verilog`/`SystemVerilog` label.

### Tests

- 753 cases pass (LANG=en and LANG=zh); new coverage for
  package/typedef/parameter/function/task ranges, class/interface prototypes,
  out-of-class definitions, comment/string/macro-continuation shielding,
  unclosed-block ranges, `include`/`import` extraction and resolution, and the
  `.v` Coq content check.

## [0.236.0] - 2026-11-28

### Added

- **Architecture context in `repowiki-impact`**: the blast-radius report now
  also answers "what does this change mean architecturally" using the same
  layer rules as `repowiki-status` and `verify:arch`: declared layers with
  indexed file counts, the layers of the changed files, impacted dependents
  grouped by layer, cross-layer import edges between changed and impacted
  files (exact counts per layer pair) and high-complexity functions inside
  the changed files (exact total plus a bounded list). Rendered as an
  `Architecture:` line, explained in hints and exposed as `architecture` in
  the JSON output.
- **Shared layer assignment**: `assignLayer` is now exported from
  `src/layers.js` (longest prefix wins), so status, the ratchet gate and
  impact cannot disagree about which layer a file belongs to.

### Tests

- 748 cases pass (LANG=en and LANG=zh); new coverage for layer assignment,
  cross-layer impact filtering (only changed↔impacted edges), hotspot
  totals and the impact tool wiring.

## [0.235.0] - 2026-11-28

### Added

- **Deterministic architecture Wiki page**: every `repowiki-generate` run
  now writes a fixed `architecture` page before the module/theme pages. It
  summarizes declared layers with exact cross-layer pairs and example
  edges, import cycle groups (with a representative route), fan-in and
  PageRank entry points, duplicate-code candidates, complexity hotspots,
  unresolved relative imports and the architecture baseline status
  (missing / unusable / clean / regressions). The page is built without a
  model from the same facts `repowiki-status` and `verify:arch` use, so its
  numbers cannot drift from those tools, and it is localized (zh/en).
- **Indexed-path citations with line ranges**: the architecture page cites
  files from the index (not only carded files) and uses symbol-derived
  `#Lx-Ly` ranges for hotspots and unresolved imports; every citation gets
  a content digest, so `verify:wiki --strict` covers the page like any
  other. The fixed slug is reserved: a theme page that also chooses
  `architecture` is renamed and reported in `renamed`.
- **Freshness requires the architecture page**: the incremental short
  circuit now checks that the manifest lists `architecture`, so upgrading
  an existing wiki backfills the page instead of skipping forever.

### Fixed

- **`verify:wiki` ignored dependency edges in the structure digest**:
  `loadIndex` returned only `files`, so `wikiGraphText` saw an empty edge
  list and every repository with import edges was reported as
  `wiki/stale-graph`. The loader now passes `edges` through; a regression
  test covers an index with edges that must verify as fresh.

### Tests

- 742 cases pass (LANG=en and LANG=zh); new coverage for the architecture
  page sections, determinism, localization, four baseline states, the
  reserved slug, and an end-to-end generate → `verify:wiki --strict` run.

## [0.234.0] - 2026-11-28

### Added

- **Ada indexing (39th language)**: `.ads`/`.adb` files are now indexed.
  Packages (`package`/`package body`, nested packages and dotted child
  units keep their owner as `parent`), `procedure`/`function`
  (declarations end at the header, bodies at `end [Name];`; expression
  functions `is (…)`, `is separate` and `renames` are not expanded),
  `type`/`subtype`/`task type`/`protected type` (records span
  `end record;`), and package-level object declarations. Declarations
  inside a `private` part are non-exported. `--` comments and
  double-quoted strings (`""` escapes) are masked; `end
  if/loop/case/record/select/block` never closes a unit, and anonymous
  `declare … begin … end;` blocks are tracked separately so their `end;`
  cannot close the enclosing subprogram.
- **Ada `with` edges**: `with`, `limited with` and `private with` unit
  names resolve case-insensitively through a unit map built from GNAT
  file names (dashed `Parent-Child.ads` and directory-form
  `src/parent/child.ads` both map to `Parent.Child`), preferring the spec
  over the body and falling back to a body-only unit; `use` clauses and
  generic formal subprograms (`with function …`) create no edges, and
  external standard-library crates stay edge-free.

### Tests

- 734 cases pass (LANG=en and LANG=zh); new coverage for packages,
  records, subprogram declarations vs bodies, private parts, declare
  blocks, generic formal parts, masking, unit-name resolution and
  dotted child-unit conventions.

## [0.233.0] - 2026-11-28

### Added

- **`repowiki-status` compares against the architecture baseline**: the tool
  now builds the same fact snapshot as `verify:arch`
  (`architectureFactsSnapshot`) from the cycles, layer pairs, unresolved
  imports, duplicates, complexity and fan-in it already computed, reads
  `.dsh-repowiki/arch-baseline.json`, and reports `archBaseline`
  (`exists`, `schemaVersion`, `ok`, `regressionTotal`, bounded
  `regressions` with stable kinds, `improvements`) plus a one-line
  `Arch baseline:` summary. New regressions add a warning; an invalid or
  unsupported baseline is reported as unusable instead of crashing; a
  missing baseline stays silent apart from the line. Baseline warnings are
  excluded from the hygiene component so a ratchet failure does not
  double-penalize the health score.
- **Exact high-complexity totals**: `computeComplexity` now returns
  `highTotal` (exact) alongside the bounded `high` list, and status uses it
  in the warning, the rendered line, the health input and the baseline
  ceiling, so a project with more than ten high-complexity functions no
  longer reports "10".
- **Exact per-layer-pair counts**: `evaluateLayers` returns `pairs`
  (`from → to` counts) that are never truncated, so status and the CI gate
  compare identical numbers even when the violation detail list is capped.

### Tests

- 728 cases pass (LANG=en and LANG=zh); new coverage for `highTotal`,
  truncation-proof layer pairs, facts-snapshot parity between status and
  the CLI, and status baseline states (missing, matching, regressed,
  invalid JSON, unsupported version).

## [0.232.0] - 2026-11-28

### Added

- **Architecture baseline ratchet (`verify:arch`)**: `scripts/verify-arch.mjs`
  snapshots the architecture facts that already drive `repowiki-status`
  (import cycle groups, per-pair cross-layer violations from plan layers,
  unresolved relative imports, duplicate-block count, high-complexity
  function count and max complexity, plus the health architecture
  component score) into `.dsh-repowiki/arch-baseline.json` and fails only
  on **new** regressions: unknown cycle groups, new or larger layer pairs,
  new unresolved imports, ceilings above the baseline and a lower
  architecture score. Fixed findings are reported as "tighten the
  baseline" hints and `--update` rewrites the file; `--require` fails when
  no baseline exists, `--json` emits stable problem codes (`index/*`,
  `plan/*`, `baseline/*`) plus structured `regressions`/`improvements`, and
  exit codes stay 0/1/2 like `verify:wiki`.
- **Deterministic baseline files**: every list is sorted and deduplicated
  and the baseline carries no timestamps, so re-running `--update` on
  unchanged sources produces a byte-identical file and Git diffs only show
  real changes. Snapshots record the analysis thresholds in effect, cap
  long lists (200 cycle groups, 200 unresolved imports, 100 layer pairs)
  and mark truncation so a capped baseline cannot silently hide new issues.

### Tests

- 720 cases pass (LANG=en and LANG=zh); new coverage for the snapshot,
  normalization (junk entries, unsupported versions, missing ceilings),
  every ratchet branch, plan-layer regressions, duplicate ceilings,
  untrusted index paths and the CLI/report contract.

## [0.231.0] - 2026-11-28

### Added

- **F# indexing (38th language)**: `namespace`/`module` declarations
  (nested modules keep their namespace as `parent`), `type` definitions
  mapped to class (explicit `class … end`, constructor form), interface
  (explicit `interface`) or type (records, unions, abbreviations),
  `member`/`abstract member`/`override` with `parent` ownership, and
  `let` bindings classified as function (with parameters) or variable.
  Ranges follow `end` or indentation, and `//`, nested `(* … *)`,
  quoted and triple-quoted strings are masked.
- **F# `open` edges**: `open Foo.Bar` and `open type Foo.Bar` resolve
  through a namespace/module map with exact then segment-prefix fallback;
  `Parent.Module` aliases are registered so `open Demo.Core.Math` finds
  `module Math` declared under `namespace Demo.Core`. External
  namespaces stay edge-free.

### Tests

- 688 cases pass (LANG=en and LANG=zh); new coverage for namespaces,
  modules, classes, records, unions, members, overrides, let bindings,
  indentation ranges, string masking and `open` resolution.

## [0.230.0] - 2026-11-28

### Added

- **Configurable analysis thresholds**: the plan now accepts
  `complexityThreshold` (1–100, default 15), `duplicateMinLines`
  (4–50, default 8) and `maxStatusSourceFiles` (20–500, default 150).
  Out-of-range integers clamp to the nearest bound, non-integers fall
  back to the defaults, and the values actually applied are reported by
  `status.complexity.threshold` and `status.duplicates.windowLines`.
- **Single source of defaults**: the default constants stay in
  `complexity.js`/`duplicates.js` and `config.js` imports them, so the
  plan defaults and the analyzers cannot drift apart.

### Tests

- 685 cases pass (LANG=en and LANG=zh); new coverage for custom values,
  clamping, invalid fallbacks and status integration showing the applied
  threshold/window.

## [0.229.0] - 2026-11-28

### Added

- **Broken relative imports**: `repowiki-status` compares every indexed
  import record with the resolved edge table and reports relative
  specifiers (starting with `.`) that produced no edge — usually a wrong
  path, an excluded target or an unsupported extension. Bare package
  imports are deliberately out of scope, so the report stays actionable.
- **Reporting**: `status.unresolved` carries the exact total, the number
  of relative imports considered and up to 50 `path`/`line`/`specifier`
  details; a positive total raises a warning and adds an
  `Unresolved imports:` line to the text report.

### Tests

- 683 cases pass (LANG=en and LANG=zh); new coverage for resolved versus
  missing edges, non-relative/bare specifiers, missing line numbers,
  bounded details with exact totals and status integration.

## [0.228.0] - 2026-11-28

### Changed

- **Health score signals**: the architecture component now also counts
  plan layer violations (5 points each, cap 30), cross-file duplicate
  blocks (3 each, cap 20) and high-complexity functions (2 each, cap 20),
  alongside cycles and the top fan-in hub. Each signal also appears as a
  ranked issue, and the component detail names the counts.
- **Backward-compatible inputs**: the three new inputs are optional; when
  absent the score is identical to previous releases, so callers that do
  not compute them (or older call sites) are unaffected.

### Tests

- 679 cases pass (LANG=en and LANG=zh); new coverage for the penalty
  arithmetic, caps (architecture floor 30 for the new signals), component
  detail strings and issue entries.

## [0.227.0] - 2026-11-28

### Added

- **Complexity estimates**: the bounded source read already used by
  duplicate detection also feeds a function-level cyclomatic estimate —
  every indexed `function`/`method` symbol range counts line-prefixed
  branch keywords (`if`/`for`/`while`/`case`/`catch`/`when`/`elif`/
  `elseif`/`except`/`match`) plus `&&`/`||`, with complexity = 1 +
  branches.
- **Reporting**: `status.complexity` returns the scored function count,
  average (2 decimals), max and up to 10 functions at or above 15
  (highest first, each with path/name/line/endLine). A non-empty high
  list raises a warning and the text report gains a `Complexity:` line.
  Comments and strings are not masked, so the value is a review
  heuristic rather than an exact McCabe number.

### Tests

- 678 cases pass (LANG=en and LANG=zh); new coverage for branch counting,
  non-function exclusion, missing sources, threshold ordering, end-line
  truncation and status integration.

## [0.226.0] - 2026-11-28

### Added

- **Duplicate-code detection**: `repowiki-status` reads up to 150 indexed
  files with 8-way bounded concurrency (files over 400 lines are skipped
  and counted), normalizes whitespace per line and fingerprints every
  8-line window; windows shared by at least two files are merged into
  blocks (adjacent windows extend the block) and reported as
  `duplicates` with exact totals, up to 20 groups and 5 locations each.
- **Signal discipline**: blank-only windows are ignored, repetition
  inside a single file never counts, and a duplicate block is described
  as a review lead rather than a semantic clone verdict; a positive total
  also raises a warning and adds a `Duplicates:` line to the text report.

### Tests

- 672 cases pass (LANG=en and LANG=zh); new coverage for whitespace
  normalization, cross-file merging, single-file/short-block exclusion,
  blank windows, group caps, line caps and status integration.

## [0.225.0] - 2026-11-28

### Added

- **Architecture layers**: `repowiki-plan.json` accepts
  `layers: [{ name, paths, mayDependOn }]`. Indexed files are assigned to
  the layer with the longest matching path prefix, same-layer edges are
  always allowed, and every cross-layer import not listed in the source
  layer's `mayDependOn` is a violation. Files outside every declared
  layer are ignored instead of guessed.
- **Layer reporting**: `repowiki-status` returns a `layers` block with
  exact violation totals, bounded detail (50 entries, each carrying
  `from`/`fromLayer`/`to`/`toLayer`/`line`), checked-edge counts,
  per-layer file counts and unknown `mayDependOn` references; violating
  totals and unknown references also raise warnings and the text report
  gains a `Layers:` line.
- **Plan validation**: layer entries without a name, with duplicate
  names or without any path are dropped, paths are normalized (leading
  `./`, trailing slashes, backslashes) and `mayDependOn` keeps only
  non-empty strings.

### Tests

- 664 cases pass (LANG=en and LANG=zh); new coverage for layer
  normalization, longest-prefix ownership, allowed/same-layer edges,
  violation totals with bounded detail, unknown references, malformed
  edges and status integration (report, warnings and text rendering).

## [0.224.0] - 2026-11-28

### Added

- **Tcl indexing (37th language)**: `proc name {args} {…}` definitions
  (namespace-qualified `::Foo::bar` names carry `Foo` as `parent`),
  `namespace eval Foo {…}` namespaces and TclOO `oo::class create Foo {…}`
  classes, plus `method`/`constructor`/`destructor` inside a class body
  (methods with `parent`). Block ranges follow whole-line brace balance,
  so a proc's argument list and body are both accounted for.
- **Tcl masking**: whole-line `#` comments, `; #` trailing comments and
  double-quoted strings (backslash escaping) are masked; quoted braces
  never truncate a proc or class range.
- **Tcl `source` edges**: `source ./x.tcl` and `source scripts/x.tcl`
  resolve from the project root with a script-directory fallback and
  `.tcl` completion; dynamic `[file join …]` forms stay edge-free.

### Tests

- 656 cases pass (LANG=en and LANG=zh); new coverage for namespaces,
  procs, TclOO classes, methods/constructors, brace-balanced ranges,
  string masking, `source` paths and comment filtering.

## [0.223.0] - 2026-11-28

### Added

- **VB.NET indexing (36th language)**: `Namespace`/`Class`/`Module`/
  `Structure`/`Interface`/`Enum` declarations (type ranges balanced by
  `End <type>`), `Sub`/`Function`/`Property`/`Event` members with
  modifier stacks (`Partial`, `Shared`, `Async`, …), constructors as
  `Sub New`, and `Property` blocks spanning their `Get`/`Set` bodies.
  Interface and `MustOverride` declarations end at their own line;
  `Private`/`Friend`/`Protected` mark non-exported symbols.
- **VB.NET masking**: `'` line comments, `REM` comment lines and
  double-quoted strings (doubled-quote escaping) are masked before range
  matching.
- **VB.NET dependency edges**: `Imports` (including `Alias = …` forms)
  and `Inherits`/`Implements` resolve through dotted paths with
  namespace-suffix matching, so a project root namespace that is absent
  from the directory layout still resolves; external assemblies stay
  edge-free.

### Tests

- 653 cases pass (LANG=en and LANG=zh); new coverage for namespaces,
  classes, interfaces, enums, constructors, properties, events,
  visibility, comment masking and `Imports`/`Inherits` resolution.

## [0.222.0] - 2026-11-28

### Added

- **Nix indexing (35th language)**: attribute bindings in attribute sets
  and `let` blocks become symbols — `name = value;` and dotted paths
  (`packages.default = …`) are variables, `{`/`rec {` values are classes
  with brace-balanced ranges, and `x:`/`{ … }:` lambdas are functions;
  bindings inside a named attribute set carry its name as `parent`.
- **Nix masking**: `#` line comments, `/* … */` blocks, double-quoted
  strings (backslash escaping) and `''…''` indented strings (with `'''`,
  `''${` and `''\` escapes) are masked, so braces inside strings never
  break attribute-set ranges.
- **Nix dependency edges**: `import ./x.nix`, `callPackage ./pkg.nix` and
  `builtins.readFile|readDir|path ./x` resolve relative to the importing
  file, trying the literal path, a `.nix` suffix and a directory's
  `default.nix`; `<nixpkgs>` lookups and absolute paths stay edge-free.

### Tests

- 650 cases pass (LANG=en and LANG=zh); new coverage for attribute
  bindings, nested sets, dotted keys, lambdas, indented-string masking,
  and `import`/`callPackage`/`readFile` resolution including directory
  `default.nix` fallback.

## [0.221.0] - 2026-11-28

### Added

- **Object Pascal indexing (34th language)**: `.pas`/`.pp`/`.dpr`/`.dpk`/
  `.lpr` files produce `unit`/`program`/`library` and
  `type X = class/interface/record/object` declarations (the latter mapped
  to class/interface/type), `procedure`/`function`/`constructor`/
  `destructor` definitions (interface declarations end at their own line;
  implementations pair `begin`/`case`/`try`/`asm` with `end`) and
  `property` members. Methods declared inside a class carry its name as
  `parent`, and `TFoo.Bar` implementations inherit `TFoo`.
- **Object Pascal masking**: `//` line comments, `{ … }` (including
  `{$…}` directives) and `(* … *)` block comments plus single-quoted
  strings (doubled-quote escaping) are masked before range matching.
- **Object Pascal `uses` edges**: multi-line `uses` lists resolve through
  a case-insensitive unit-name map built from file names (Delphi requires
  unit and file names to match), while `Unit in 'path.pas'` entries
  resolve from the project root with a script-directory fallback and
  `.pas`/`.pp`/`.lpr` completion. External units stay edge-free.

### Tests

- 647 cases pass (LANG=en and LANG=zh); new coverage for units, classes,
  records, interfaces, properties, declaration vs implementation ranges,
  comment masking, `uses` lists with `in` paths and Pascal test-path
  detection (`*Test.pas`/`*.Tests.pas`).

## [0.220.0] - 2026-11-28

### Added

- **Perl indexing (33rd language)**: `.pl`/`.pm`/`.t` files produce
  `package Foo::Bar;` classes (statement form, governing subsequent
  declarations until the next package) and `package Foo { … }` block
  classes (restoring the outer package afterwards); `sub name` becomes a
  function, or a method with `parent` when inside a package, with
  `_`-prefixed subs marked non-exported by convention.
- **Perl masking**: `#` line comments (except `$#array`), `=pod … =cut`
  blocks, `<<EOF`/`<<'EOF'`/`<<"EOF"`/`<<~EOF` heredoc bodies and
  single/double-quoted strings are masked before range matching, so POD,
  heredoc text and quoted braces never register symbols or break ranges.
- **Perl dependency edges**: `use Foo::Bar` and `require Foo::Bar`
  convert `::` to a path and resolve under every `lib/` root plus the
  project root; `use parent 'Foo'`/`use base qw(Foo)` record parent
  modules; `require './x.pl'` and `require 'Foo/Bar.pm'` resolve from the
  project root with a script-directory fallback. Pragmas (`strict`,
  `warnings`, …) and version declarations are skipped, and external CPAN
  modules stay edge-free.

### Tests

- 644 cases pass (LANG=en and LANG=zh); new coverage for package
  scoping, block packages, sub visibility, POD/heredoc masking, pragma
  filtering, parent/base imports, `lib/` resolution and Perl `t/`/`*.t`
  test-path detection.

## [0.219.0] - 2026-11-28

### Added

- **Fortran indexing (32nd language)**: `.f`/`.for`/`.f77`/`.f90`/`.f95`/
  `.f03`/`.f08` (plus upper-case preprocessed variants) produce `module`
  and `program` units, `subroutine`/`function` definitions (type prefixes
  and `pure`/`recursive`/`elemental`/`module` modifiers included), derived
  types (`type [::] name`, `type, extends(…) :: name`) and named
  `interface` blocks. `end`/`end <unit>` close ranges, procedures inside a
  module carry `parent`, and `end do`/`end if`/`end select`/`end where`
  never close a unit.
- **Fortran masking**: `!` line comments and single/double-quoted strings
  (doubled-quote escaping) are masked, so quoted text and comments cannot
  register fake units.
- **Fortran `use` edges**: `use name`, `use :: name`, `use name, only: …`
  and `use, non_intrinsic :: name` resolve through a case-insensitive
  module-name map, so module names need not match file names;
  `use, intrinsic :: …` (standard library) and external modules stay
  edge-free.

### Tests

- 641 cases pass (LANG=en and LANG=zh); new coverage for units, type
  prefixes, derived types, interfaces, `end do`/`end if` handling, comment
  masking, intrinsic filtering and case-insensitive module resolution.

## [0.218.0] - 2026-11-28

### Added

- **PowerShell indexing (31st language)**: `.ps1`/`.psm1` files produce
  `function`/`filter`/`workflow`/`configuration` definitions (hyphenated
  `Verb-Noun` names, `global:`/`script:`/`local:`/`private:` scope
  prefixes; `private:` is non-exported) and top-level `class`/`enum`
  containers. First-level class members become `method` symbols with
  `parent` ownership (constructors included), `hidden` members are
  non-exported, and property declarations stay unindexed.
- **PowerShell masking**: `#` line comments, `<# … #>` block comments,
  single-quoted (`''` escaping) and double-quoted (backtick escaping)
  strings, and `@'…'@`/`@"…"@` here-strings are masked before range
  matching, so braces and fake declarations inside them never register.
- **PowerShell dependency edges**: `using module ./X.psm1`,
  `Import-Module ./X` and dot-sourcing (`. ./X.ps1`) resolve relative to
  the importing script, trying the literal path plus `.ps1`/`.psm1`/
  `.psd1` suffixes and the `Foo/Foo.psm1` module-directory form; bare
  module names (`Pester`) and paths escaping the project stay edge-free.

### Tests

- 638 cases pass (LANG=en and LANG=zh); new coverage for functions,
  filters, classes, methods, constructors, scope visibility, `hidden`
  members, comment/here-string masking and all three reference forms.

## [0.217.0] - 2026-11-28

### Added

- **Groovy indexing (30th language)**: `.groovy` files produce top-level
  `class`/`interface`/`trait`/`enum` containers and first-level methods
  (annotations and `public`/`private`/`static`/`final`/`abstract`/
  `synchronized` modifiers tolerated), plus Gradle/Jenkinsfile-style
  top-level `def` methods. `private`/`protected` members are marked
  non-exported; control-flow calls are never mistaken for methods.
- **Groovy imports**: `import a.b.C` resolves through dotted module paths
  shared with Java sources, so a Groovy file can import a Java class (and
  vice versa). `import static a.b.C.member` drops its trailing member so
  the edge lands on the defining file. `//` and `/* … */` comments plus
  single/double/triple-quoted strings (including interpolation text) are
  masked before either extraction, so braces and calls inside them never
  break ranges or register symbols.

### Tests

- 635 cases pass (LANG=en and LANG=zh); new coverage for classes,
  traits, methods, script functions, visibility, masking and both import
  forms, including a Groovy→Java dotted resolution case.

## [0.216.0] - 2026-11-28

### Added

- **Index scale/performance guard**: every test run indexes a synthetic
  300-file TypeScript repository and asserts `stats.files`, a symbol-count
  floor and `stats.edges`, plus a generous 5s ceiling. An extractor
  regression that silently drops symbols, loses import edges or
  accidentally introduces a quadratic path now fails CI immediately
  instead of surfacing later.

### Tests

- 632 cases pass (LANG=en and LANG=zh); the guard adds ~35ms locally and
  keeps the threshold far above real runtime to avoid flaky machines.

## [0.215.0] - 2026-11-28

### Added

- **Terraform/HCL indexing (29th language)**: `.tf` files produce
  `resource`/`data` blocks (`type.name`), `module`/`provider`/`terraform`
  blocks and `variable`/`output`/`locals`. Block labels are read from
  string content while ranges use the masked view, so braces inside
  strings never break balancing; nested blocks (`lifecycle`, `dynamic`,
  `required_providers`) stay unindexed. `source = "./modules/x"` resolves
  to that directory's `main.tf` (or its lexicographically first `.tf`),
  while registry/git sources stay edge-free. `.terraform.lock.hcl`
  supplies provider names and Terraform technology mappings (AWS, Google
  Cloud, Azure, Kubernetes, Helm…). Prompt fences and the panel language
  filter know `hcl`.

### Tests

- 631 cases pass (LANG=en and LANG=zh); new coverage pins block kinds and
  ranges, nested-block exclusion, module-source extraction/resolution,
  external exclusion and lock-file provider metadata.

## [0.214.0] - 2026-11-28

### Added

- **Clojure indexing (28th language)**: `.clj`/`.cljs`/`.cljc` files
  produce `ns` (class), `defn`/`defn-`/`defmacro`/`defmulti`/`defmethod`
  (functions), `def`/`defonce` (variables) and `defrecord`/`deftype`/
  `defprotocol`/`definterface` (classes). `^:private` and `defn-` mark
  non-exported forms; `;` comments and strings are masked, `(comment …)`
  forms are skipped whole, and every form's range follows bracket
  matching. `(:require …)`/`(:use …)` namespaces resolve through every
  `src/`/`test/` root with same-flavour extension preference
  (`.clj`/`.cljc`/`.cljs`); external namespaces stay edge-free.
  `deps.edn` `:deps` and `project.clj` `:dependencies` supply coordinates
  (version maps excluded from parsing), project name/version and Clojure
  technology mappings. Prompt fences and the panel language filter know
  `clojure`.

### Tests

- 627 cases pass (LANG=en and LANG=zh); new coverage pins form kinds and
  bracket ranges, `defn-`/`^:private` visibility, `(comment …)` skipping,
  require extraction, same-flavour resolution, external exclusion and
  deps.edn/project.clj metadata.

## [0.213.0] - 2026-11-28

### Added

- **Solidity indexing (27th language)**: `.sol` files produce
  `contract`/`library`/`interface` containers (including
  `abstract contract`), member `function`/`constructor`/`receive`/
  `fallback`/`modifier`/`event`/`error`/`struct`/`enum`/user-defined value
  types with `parent` ownership, and file-level functions/types.
  `private`/`internal` members are non-exported; comments and strings are
  masked; container and member ranges follow brace matching (declarations
  ending in `;` stay single-line). `import "./X.sol"` — also
  `import {A} from` and `import * as X from` — resolves relative to the
  importing file with a `.sol` fallback, while external paths stay
  edge-free. `foundry.toml` marks the Foundry toolchain. Prompt fences and
  the panel language filter know `solidity`.

### Tests

- 623 cases pass (LANG=en and LANG=zh); new coverage pins container and
  member kinds/ownership/ranges, `internal` visibility, comment shielding,
  import variants, relative resolution, external exclusion and foundry
  detection.

## [0.212.0] - 2026-11-28

### Added

- **OCaml nearest-module resolution**: `buildOcamlModules` now keeps every
  candidate per module name (`.ml` before `.mli`, then lexicographic), and
  `resolveOcamlSpecifier` picks the candidate sharing the deepest directory
  prefix with the importing file. Multi-library repos with same-named
  modules now resolve `open`/`include`/`module M = Foo` to the same
  library instead of a global lexicographic pick; external modules still
  return null.

### Tests

- 620 cases pass (LANG=en and LANG=zh); a fixture with `lib/a/foo.ml` and
  `lib/b/foo.ml` proves each importer links to its nearest module.

## [0.211.0] - 2026-11-28

### Added

- **Cross-language test paths**: the affected-test routing heuristic now
  recognises Erlang `*_SUITE.erl` (common_test) and `*_tests.erl` (eunit),
  R testthat `test-*.R` (both cases) and Julia `runtests.jl`, alongside the
  existing test directories, `*.test.*`/`*.spec.*`, `test_*`/`*_test.*`,
  `*_spec.rb` and JVM/C#/Swift naming. False positives (`suite.erl`,
  `api.R`, `core.jl`) stay non-test.

### Tests

- 619 cases pass (LANG=en and LANG=zh); the heuristic fixtures now cover
  the three new conventions and their near-miss negatives.

## [0.210.0] - 2026-11-28

### Added

- **Language-onboarding guard**: `test/docs-consistency.test.js` now walks
  every language in `SYMBOL_LANGUAGES` and fails when the prompt fence
  (`fenceLang`) or the panel `LANGUAGE_LABELS` entry is missing. Adding an
  extension to `src/schema.js` can no longer half-land silently. `fenceLang`
  is exported for the guard without changing prompt output.

### Tests

- 619 cases pass (LANG=en and LANG=zh); the new case covers all 28 symbol
  languages (26 languages plus Vue/Svelte SFC) against prompt fences and
  panel labels.

## [0.209.0] - 2026-11-28

### Added

- **Erlang indexing (26th language)**: `.erl`/`.hrl` files produce
  `-module`, `-record`, `-type`/`-opaque`, `-define` macros and top-level
  functions, including multi-clause bodies, `when` guards and multi-line
  signatures. `-export([f/1, …])` drives visibility (private by default;
  same-name arities merge into one symbol), while `%` comments, strings,
  quoted atoms and `$x` character literals are masked first.
  `-include("…")` resolves through the importing file's directory plus
  every `src/`/`include/` root, and `-include_lib("app/…")` also tries the
  path without its application prefix; external headers stay edge-free.
  `rebar.config` `{deps, …}` supplies dependency counts and rebar
  technology mappings. Prompt fences and the panel language filter know
  `erlang`.

### Tests

- 618 cases pass (LANG=en and LANG=zh); new coverage pins symbol kinds,
  multi-clause ranges, export visibility, comment/string shielding,
  include/include_lib extraction, rebar dependencies and an indexer
  fixture proving root resolution and app-prefix stripping.

## [0.208.0] - 2026-11-28

### Added

- **Haskell export-list visibility**: `module M (a, B(..), (<+>)) where`
  export lists now drive the `exported` flag. Top-level symbols missing
  from the list are non-exported (retrieval ranks exported symbols first
  and the unused-export audit skips them), `module X` re-exports are
  ignored, operator exports and multi-line lists are supported, and class
  methods inherit their class's visibility. Modules without an export list
  keep everything public. `INDEX_PARSER_VERSION` moves to 9 so existing
  indexes re-parse Haskell files.

### Tests

- 614 cases pass (LANG=en and LANG=zh); fixtures pin listed/unlisted
  top-level symbols, multi-line lists with operator and module re-exports,
  and the no-list public default.

## [0.207.0] - 2026-11-28

### Added

- **Bounded nested manifests**: nested `pubspec.yaml` reads are capped at
  30 (Dart/Flutter monorepos) and nested `dune-project` reads at 20
  (OCaml monorepos), matching the existing caps for mix/gleam/zig/
  composer/opam/cabal/cargo manifests. Selections stay deterministic
  (traversal order) and root manifests are never affected, so abnormal
  directory trees cannot force unbounded manifest reads.

### Tests

- 612 cases pass (LANG=en and LANG=zh); a fixture builds 35 Dart packages
  and 25 OCaml projects, counting manifest reads through an instrumented
  fs to prove both caps hold.

## [0.206.0] - 2026-11-28

### Added

- **Haskell `hs-source-dirs`**: cabal `hs-source-dirs:` declarations
  (comma lists plus indented continuation lines, per library/executable
  stanza) are parsed into the Haskell module search roots, joined with the
  conventional `src`/`app`/`lib`/`test` directories and the project root.
  Projects using custom layouts such as `source/` or `library/` now resolve
  `import` edges. Paths stay deterministic (depth, then lexicographic) and
  manifest-relative.

### Tests

- 611 cases pass (LANG=en and LANG=zh); a fixture pins a `source/` library
  directory and a multi-line `app` source directory declared in the cabal
  manifest, proving the cross-directory import edge.

## [0.205.0] - 2026-11-28

### Added

- **Rust workspace crate resolution**: nested `Cargo.toml` manifests (capped
  at 20) now map `[package] name` to crate roots, normalizing Cargo's `-`
  to Rust's `_`; `path` dependencies fill in members that do not declare a
  name. `use other_crate::module` resolves into that crate's `src/`
  submodule and falls back to its `lib.rs`/`main.rs` entry (or the crate
  root for root-level `lib.rs`), so cross-crate workspace imports form real
  dependency edges. External crates remain edge-free and the root
  `Cargo.toml` keeps driving cargo stack detection.

### Tests

- 610 cases pass (LANG=en and LANG=zh); a fixture pins `core-lib` →
  `core_lib` normalization, path-dependency registration, cross-crate
  submodule resolution and the entry-file fallback.

## [0.204.0] - 2026-11-28

### Added

- **Haskell class methods and multi-line signatures**: `class … where`
  bodies now register method signatures at the first member indentation
  with `parent` ownership (default method bodies and nested `where`
  bindings stay unindexed), and both top-level and class-level signatures
  may split the name and `::` across lines (`foo` on one line, `::` on the
  next). Method keys are scoped by class, so a class method and a
  top-level function with the same name no longer collapse into one
  symbol. `INDEX_PARSER_VERSION` moves to 8 so existing indexes re-parse
  Haskell files.

### Tests

- 609 cases pass (LANG=en and LANG=zh); a fixture pins class-method
  ownership, multi-line class and top-level signatures, and definition
  ranges.

## [0.203.0] - 2026-11-28

### Added

- **Haskell indexing (25th language)**: `.hs`/`.lhs` files produce
  `module` declarations (ranging to the file end), `data`/`newtype`
  (including `data family`), `type`/`type family`, `class`, `pattern`
  synonyms, top-level value signatures (`name ::`) and definitions —
  including infix operator definitions, which register the operator rather
  than the leading operand. Signatures and their bodies merge into one
  symbol spanning both. `--` comments, nested `{- … -}` blocks (pragmas
  included), strings and character literals are masked; indented
  `where`/`let` bodies stay unindexed. `import [qualified] [safe]
  ["pkg"] Module` resolves through GHC module paths under every
  `src/`/`app/`/`lib/`/`test/` root (`.hs` then `.lhs`); external packages
  stay edge-free. `*.cabal` manifests supply the package name, version and
  multi-line `build-depends` with Haskell technology mappings (nested
  manifests capped at 20). Prompt fences and the panel language filter
  know `haskell`.

### Tests

- 608 cases pass (LANG=en and LANG=zh); new coverage pins symbol kinds and
  ranges (module/file-end, data/newtype/type/class, signature+definition
  merge, infix operators, comment/string shielding), import variants
  (qualified, package, hiding), cabal metadata with multi-line
  `build-depends`, and an indexer fixture proving `src`/`app` root
  resolution and external-package exclusion.

## [0.202.0] - 2026-11-28

### Added

- **OCaml `and` continuations and raw strings**: `let rec f … and g …`
  now registers every mutually recursive function, and
  `type a = … and b = …` registers every continued type, reusing the
  primary definition's line numbers and ranges. `{|…|}` and `{id|…|id}`
  raw strings are masked across lines (open/close delimiters kept for
  range measurement), so embedded `(* … *)` or `let` text can no longer
  hide later declarations. Indentation is now judged by leading
  whitespace only, fixing top-level lines whose masked body ends in
  spaces. `INDEX_PARSER_VERSION` moves to 7 so existing indexes re-parse
  OCaml files.

### Tests

- 604 cases pass (LANG=en and LANG=zh); a fixture pins mutually recursive
  functions, continued types, single-line and multi-line raw strings,
  embedded comment markers and the following declaration's line number.

## [0.201.0] - 2026-11-28

### Added

- **OCaml indexing (24th language)**: `.ml`/`.mli` files produce top-level
  `let`/`let rec` (including `let%ppx`, attributes and operators excluded)
  functions, `type` containers and aliases (parameterised names resolve to
  the trailing identifier), `module`/`module type`, `class`/`class type`,
  `exception`, and `val`/`external` signatures. Nested `(* … *)` comments
  and strings are masked first; indented bodies stay unindexed, and
  `struct`/`sig`/`object` ranges end at their matching `end`. `open`,
  `include`, `open!` and `module M = Foo` resolve through a file-name
  module map (`.ml` wins over `.mli`, `Foo.Bar` maps to `foo.ml`); external
  libraries stay edge-free. `dune-project` supplies the project name and
  version, while `*.opam` supplies the version and `depends` entries with
  OCaml technology mappings (capped at 20 nested manifests). Prompt fences
  and the panel language filter know `ocaml`.

### Tests

- 603 cases pass (LANG=en and LANG=zh); new coverage pins symbol kinds and
  ranges (incl. `end`-balanced modules/classes and `_` privacy), comment/
  string shielding, `open`/`include`/alias extraction, dune/opam metadata,
  and an indexer fixture proving module-map resolution and `.ml` preference.

## [0.200.0] - 2026-11-28

### Added

- **Nim `type` block members**: a standalone `type` section — the dominant
  multi-definition style in Nim modules — now registers every indented
  `Name* = object`/`enum`/`ref object`/`tuple`/alias definition as its own
  class symbol. Each member gets an independent indentation range (fields
  and the next member bound it), the `*` suffix drives the export flag, and
  field lines (`name*: string`) plus enum-value lines (`red, green`) never
  leak as symbols. Previously the whole section was skipped after the
  `type` keyword, so common Nim domain types were invisible to symbol
  search. `INDEX_PARSER_VERSION` moves to 6 so existing indexes re-parse
  Nim files.

### Tests

- 598 cases pass (LANG=en and LANG=zh); a fixture pins exported and private
  `type`-block members, per-member ranges, field/enum-value exclusion and
  the following routine's line number.

## [0.199.0] - 2026-11-28

### Added

- **Nim indexing (23rd language)**: `.nim`/`.nims` files produce
  `proc`/`func`/`method`/`iterator`/`template`/`macro`/`converter`
  symbols, `type Name = …` containers, and top-level `const`/`let`/`var`.
  The `*` suffix marks module exports; indentation bodies are skipped so
  nested routines never surface, and multi-line signatures are resolved
  before the body range is measured. `#` comments, nested `#[ … ]#` block
  comments and strings (including triple-quoted) are masked first.
  `import`/`from … import`/`include`/`export` resolve through the importing
  file's directory, every `src/` root and the project root to
  `<module>.nim`/`.nims`; `std/` and external packages stay edge-free.
  `*.nimble` manifests supply the project name (file stem), version and
  deduplicated `requires` dependencies with Nim technology mappings. Prompt
  fences and the panel language filter know `nim`.

### Tests

- 597 cases pass (LANG=en and LANG=zh); new coverage pins every routine
  form, indentation ranges, multi-line signatures, `*` export, comment/
  block-comment/string shielding, nested-routine exclusion, import/from/
  include variants with relative paths, `.nimble` dependency filtering and
  an indexer fixture proving `src/`-root and `../` resolution.

## [0.198.0] - 2026-11-28

### Added

- **Julia macro-decorated declarations**: `@kwdef struct` /
  `Base.@kwdef mutable struct` are recognised as class symbols with correct
  block ranges (the macro prefix no longer hides the struct or breaks brace
  balancing), and `@enum Color red green` registers the enum type plus its
  values as non-exported variables. `INDEX_PARSER_VERSION` moves to 5 so
  existing indexes re-parse Julia files.

### Tests

- 593 cases pass (LANG=en and LANG=zh); a fixture pins macro-prefixed
  structs (including a module-qualified macro), enum type/values, export
  filtering and block ranges.

## [0.197.0] - 2026-11-28

### Added

- **R S4 declarations**: `setGeneric("name", …)` now registers a function
  symbol (exported through `NAMESPACE`), `setMethod("name", "Class", …)` /
  `setMethod("name", signature("Class"), …)` register methods with the
  signature class as `parent`, and `setRefClass("Name", …)` joins
  `setClass`/`R6Class` as a class symbol. Methods stay `exported: false`
  even when the generic is exported, matching R's export granularity.
  `INDEX_PARSER_VERSION` moves to 4 so existing indexes re-parse R files.

### Tests

- 592 cases pass (LANG=en and LANG=zh); new coverage pins generic/method
  kinds and parents (string and `signature()` signatures), `setRefClass`
  classes, NAMESPACE-driven export and method non-export.

## [0.196.0] - 2026-11-28

### Added

- **Julia indexing (22nd language)**: `.jl` files produce `module`/
  `baremodule`, `struct`/`mutable struct`, `abstract type`/`primitive
  type`, `function name(...)` (including `Type.method` as a method with
  `parent`), short-form `name(args) = expr`, `macro` and top-level `const`
  symbols. Function/struct/macro bodies are skipped so nested definitions
  never surface; `#` comments, nested `#= … =#` block comments, multi-line
  strings and triple-quoted strings are masked before block matching, and
  `a[end]`/`x.end` never close a block. Files containing a `module` use
  `export` (comma-separated, continuation lines) as the export evidence;
  module-less scripts keep every symbol visible. `include("path")` resolves
  relative to the importing file (`.jl` appended when omitted); dynamic
  arguments stay edge-free. `Project.toml` supplies package name, version
  and deduplicated `[deps]`/`[extras]` dependencies with Julia technology
  mappings. Prompt fences and the panel language filter know `julia`.

### Tests

- 590 cases pass (LANG=en and LANG=zh); new coverage pins every declaration
  form, block ranges, `Type.method` ownership, export filtering, comment/
  block-comment/triple-string shielding, nested-definition exclusion,
  `include` variants with dynamic arguments skipped, `Project.toml`
  dependency deduplication and an indexer fixture proving file-relative and
  `../` resolution.

## [0.195.0] - 2026-11-28

### Added

- **R6/S4 method symbols**: methods declared inside `R6Class(...)` /
  `setClass(...)` calls (`initialize = function(...)`, single-line
  expression bodies included) are now indexed as `method` symbols with the
  owning class as `parent` instead of being skipped. Method bodies stay out
  of the top-level scan, so local assignments are never misread as
  functions, and methods carry `exported: false` because they are reached
  through the class. Symbol search can finally find R6 methods by name.
  `INDEX_PARSER_VERSION` moves to 3 so existing indexes re-parse R files
  instead of reusing caches without method symbols.

### Tests

- 586 cases pass (LANG=en and LANG=zh); the R symbol fixture now pins
  method ownership, single-line method ranges, `exported: false` and the
  extended class range after adding a second method.

## [0.194.0] - 2026-11-28

### Added

- **R `NAMESPACE` exports**: the root manifest is now parsed so R package
  symbols carry manifest-backed `exported` flags instead of the `.`-prefix
  convention alone. `export(...)`, `exportClasses(...)`,
  `exportMethods(...)` and `S3method(generic, class[, method])` (exporting
  `generic.class`) are applied across every R file after manifest loading;
  `exportPattern(...)` cannot be expanded statically, so it falls back to
  the convention instead of marking every symbol unexported.

### Tests

- 586 cases pass (LANG=en and LANG=zh); the R indexer fixture now proves
  exported/unexported functions, `.`-private names, S3 methods, R6 classes
  and cross-file propagation, plus an `exportPattern` fallback fixture.

## [0.193.0] - 2026-11-28

### Added

- **Parser version visibility in status**: `repowiki-status` returns
  `index.parserVersion`, prints it in the `Index:` line and warns when the
  cached index was produced by a different extractor version. Users see
  that the next rebuild will re-parse every file (and why new language
  support may not be visible yet) before running it, instead of inferring
  it from a changed file count.

### Tests

- 585 cases pass (LANG=en and LANG=zh); a fixture with `parserVersion: 1`
  pins the structured field, the warning and the rendered `parser v1` text.

## [0.192.0] - 2026-11-28

### Added

- **R indexing (21st language)**: `.R`/`.r` files produce function symbols
  from `name <- function(...)` / `name = function(...)` (including `<<-`),
  with multi-line signatures, a `{` on the following line and single-line
  expression bodies, plus `setClass("Name", …)` / `R6Class("Name", …)`
  class symbols. Class-call interiors are skipped so R6 methods are not
  misread as top-level functions, nested functions stay out of the symbol
  table, `.`-prefixed names follow the R private convention, and comments
  and string contents are masked before matching. `source("path")` /
  `sys.source("path")` resolve relative to the file then the project root,
  trying `.R`/`.r`; dynamic arguments stay edge-free. `DESCRIPTION` (DCF)
  supplies package name, version and deduplicated dependencies from
  `Depends`/`Imports`/`Suggests`/`LinkingTo`, with `R` itself and version
  constraints stripped. `.bats` files join Shell indexing (Bats tests).
  Prompt fences and the panel language filter know `r`.

### Tests

- 584 cases pass (LANG=en and LANG=zh); new coverage pins function forms
  and ranges, single-line bodies, split `{`, private `.` names, R6 method
  exclusion, comment/string shielding, `source` variants with dynamic
  arguments skipped, DCF continuation lines and dependency deduplication,
  and an indexer fixture proving project-root/`../` resolution plus
  `DESCRIPTION` metadata.

## [0.191.0] - 2026-11-28

### Added

- **Shell indexing (20th language)**: `.sh`/`.bash`/`.zsh` files produce
  function symbols in all three declaration forms (`function foo`,
  `function foo()`, `foo() {`), including a `{` on the following line, and
  explicit public variables (`export`/`readonly`/`declare`/`typeset` with
  assignment). Plain assignments and `local` stay out so script temporaries
  do not flood the symbol table. `#` comments, quoted strings (multi-line
  included) and heredoc bodies are masked before brace matching; `${…}`
  parameter expansions are skipped so a single expansion cannot close a
  function block early. `source path` / `. path` resolve relative to the
  script directory first, then the project root, trying the literal path
  plus `.sh`/`.bash`; dynamic arguments (variables, command substitution,
  globs) stay edge-free. Prompt fences and the panel language filter know
  `shell`.

### Tests

- 580 cases pass (LANG=en and LANG=zh); new coverage pins the three
  function forms, split `{`, single-line bodies, explicit-variable
  filtering, comment/heredoc shielding, `source`/dot imports with dynamic
  arguments skipped, and an indexer fixture proving script-relative,
  project-root and `../` resolution.

## [0.190.0] - 2026-11-28

### Fixed

- **Stale parse caches across upgrades**: `INDEX_PARSER_VERSION` had stayed
  at 1 since v0.117, while the extractors gained 15+ languages and several
  parsing fixes (Zig public re-exports, Gleam multi-line imports, earlier
  Dart/PHP/Ruby/Swift/Scala corrections). An index built by an older
  version would reuse unchanged files' stale `symbols`/`imports` until
  their content changed, hiding new language support from existing
  projects. The version is now 2, so the first reindex after upgrade
  re-parses every file (`changed` = file count, `reused` = 0) and then
  resumes incremental reuse as usual.

### Tests

- 577 cases pass (LANG=en and LANG=zh); the incremental-cache fixture now
  uses an explicit previous `parserVersion`
  (`INDEX_PARSER_VERSION - 1`) instead of deleting the field, matching a
  real upgrade and pinning the re-parse-then-reuse behavior.

## [0.189.0] - 2026-11-28

### Added

- **Zig public re-exports**: `pub const x = @import("x.zig")` now registers
  `x` as an exported variable symbol, so module facades that forward
  submodules are discoverable by symbol search and symbol-level impact
  analysis. Private aliases (`const std = @import("std")`,
  `const Self = @This()`, `@cImport`) stay out of the symbol table as
  before, keeping per-file import noise at zero.

### Tests

- 577 cases pass (LANG=en and LANG=zh); the Zig symbol fixture now pins the
  re-export symbol (kind, export flag, line) alongside the private-alias
  exclusions.

## [0.188.0] - 2026-11-28

### Added

- **Zig monorepos**: nested `apps/*/build.zig.zon` manifests (capped at 20,
  root excluded) now contribute their direct `dependencies` keys to
  `dependencyCounts.zig`, while the root manifest remains the only source
  of project name and version. Dependency keys stay count-only — a zon key
  is a user-chosen alias, so no technology names are inferred from it.
  Nested manifests are selected in traversal order under the existing
  bounded read pipeline, keeping output deterministic.

### Tests

- 577 cases pass (LANG=en and LANG=zh); new coverage pins dependency
  accumulation across a nested `apps/tool/build.zig.zon`, root-only project
  metadata and the deliberate absence of technology mappings.

## [0.187.0] - 2026-11-28

### Added

- **Gleam monorepos and multi-line imports**: nested `apps/*/gleam.toml`
  manifests (capped at 20, root excluded) now merge their dependency
  counts and technologies into the stack while the root manifest stays the
  only source of project name/version. Multi-line unqualified imports
  (`import my_app/{\n  type User,\n  User as U,\n}`) are joined up to the
  closing brace (50-line cap) before parsing, so `imported` symbols are
  complete and symbol-level impact evidence no longer depends on
  formatting.

### Tests

- 576 cases pass (LANG=en and LANG=zh); new coverage pins the multi-line
  import join and a nested `apps/web/gleam.toml` fixture proving dependency
  accumulation, root-only project metadata and source-traceable subpackage
  technologies.

## [0.186.0] - 2026-11-28

### Changed

- **Structured wiki staleness reasons in status**: `repowiki-status` now
  returns `wiki.staleReasons` with the same values and order as
  `verify:wiki` (`cards`, `graph`, `memory`) and prints them in the `Wiki:`
  line. A page-level stale count of zero no longer hides graph- or
  memory-driven staleness, so JSON/CI consumers can route the right refresh
  instead of parsing warning prose; the warnings themselves are unchanged.

### Tests

- 574 cases pass (LANG=en and LANG=zh); the graph and accepted-memory
  status fixtures now pin the reason arrays and the rendered annotations.

## [0.185.0] - 2026-11-28

### Added

- **Gleam indexing (19th language)**: `.gleam` files produce `type` /
  `opaque type` / `external type` containers, `type Name = …` aliases
  (kind `type`), `fn` / `external fn` definitions with multi-line signatures
  and single-line bodies, and top-level `const` values; `pub` decides
  export. Comments (`//`, `////`) and string contents (including multi-line
  strings) are masked before brace matching, so braces inside text never
  shift ranges, and `let`/anonymous functions inside bodies stay out of the
  symbol table. `import package/module` (with `as` aliases and
  `.{type Foo, Foo as F}` unqualified imports) resolves through every
  `src/` or `test/` source root and the project root to `<module>.gleam`;
  external packages such as `gleam/io` stay edge-free. `gleam.toml`
  supplies the project name, version and distinct dependency names from
  `[dependencies]` / `[dev-dependencies]`, with framework technologies
  (Wisp, Lustre, Mist, gleam_http, …) keeping their manifest source. Prompt
  fences and the panel language filter know `gleam`.

### Tests

- 574 cases pass (LANG=en and LANG=zh); new coverage pins container and
  alias ranges, opaque/external forms, `external fn` as a single-line
  symbol, multi-line signatures, string/comment shielding, `let`
  exclusion, import aliases with deduplicated unqualified names,
  `gleam.toml` section scoping and an indexer fixture proving `src/`,
  `test/` and project-root resolution with `gleam/io` staying edge-free.

## [0.184.0] - 2026-11-28

### Changed

- **Structured untrusted-index counts in status**: `repowiki-status` now
  returns `index.untrusted` (`files`, `edges`) whenever a tampered index was
  sanitized, and prints the dropped counts inline in the `Index:` line. The
  existing warning stays, so text-only consumers lose nothing; JSON/CI
  consumers no longer have to parse warning prose to detect sanitized
  assets. `index.json` paths themselves are still never echoed.

### Tests

- 570 cases pass (LANG=en and LANG=zh); the untrusted-path status fixture
  now pins both the structured counts and the rendered line.

## [0.183.0] - 2026-11-28

### Added

- **Zig indexing (18th language)**: `.zig` files produce container types
  (`const Foo = struct/enum/union/opaque`, including `pub`, `extern`,
  `packed` and `union(enum)` forms), top-level `fn` / `extern fn` / `export
  fn` prototypes and bodies, named `test "…"` blocks, and top-level
  constants and variables. Container members carry their owning type as
  `parent` and are only read at the container's own nesting level, so
  function-local constants never become symbols. `@import` / `@cImport` /
  `@This` bindings are module aliases, not business symbols, and are
  skipped; `//`, `///`, `//!` comments and `\\` multiline-string lines are
  masked before block matching. `@import("x.zig")` resolves against the
  importing file's directory (normalized and clamped to the project root);
  package imports (`std`, `builtin`, `root`, build-injected module names)
  stay edge-free. `build.zig.zon` contributes the project name, version and
  direct `dependencies` keys (enum-literal and quoted names). Prompt fences
  and the panel language filter know `zig`.

### Tests

- 570 cases pass (LANG=en and LANG=zh); new coverage pins container/member
  ownership, single-line block ranges, `extern fn` prototypes, comment and
  multiline-string shielding, `@import` extraction with in-string decoys,
  `build.zig.zon` dependency counting and an indexer fixture proving
  same-directory, nested and `../`-relative resolution with `std`/`builtin`
  staying edge-free.

## [0.182.0] - 2026-11-28

### Added

- **Lua indexing (17th language)**: `.lua` files produce module-table
  variables (`local M = {}`), `function name` / `local function name`,
  `M.foo` / `M:foo` methods (normalized to a `foo` method with parent `M`) and
  `M.foo = function` assignments, with `function/if/for/while/do/repeat …
  end/until` block ranges that ignore `--` line comments, `--[[ ]]` block
  comments and `[[ ]]` long strings. `require("my.mod")` / `require 'mod'`
  resolve through every `lua/` directory (Neovim plugin layout) and the
  project root to `<mod>.lua` or `<mod>/init.lua`; external modules stay
  edge-free. Prompt fences and the panel language filter know `lua`.

### Tests

- 565 cases pass (LANG=en and LANG=zh); new coverage pins block ranges with
  nested `if`/`for` and long-string shielding, `M:method` normalization,
  commented-out requires, and an indexer fixture proving `lua/`-root,
  dotted-name and `init.lua` resolution with external `require("socket")`
  staying edge-free. The "unsupported language" fixtures moved to Fortran.

## [0.181.0] - 2026-11-28

### Performance

- **Bounded concurrent manifest reads**: configuration manifests
  (`package.json`, `tsconfig*`, `go.mod`, `CMakeLists.txt`, `composer.json`,
  `mix.exs`, …) are selected in traversal order with the existing per-kind
  caps, then read with up to 8 concurrent requests and assembled back in
  selection order. Remote `ctx.fs` backends stop paying one round trip per
  manifest, while the cap decisions, `manifestTexts` key order and every
  derived result stay identical to the serial version.

### Docs

- Corrected the compatibility notes (Hatch `packages` roots were reported as
  unsupported after v0.84.0) and documented Elixir's lightweight-parser
  boundaries (`do`/`end` ranges, dynamic module names, `defimpl`/
  `defprotocol` structure symbols).

### Tests

- 562 cases pass (LANG=en and LANG=zh); a delayed-read fixture with 12 nested
  `tsconfig.json` files proves manifest reads overlap (peak > 1, peak <= 8)
  and that files, edges and the stack object match a serial build.

## [0.180.0] - 2026-11-28

### Fixed

- **Deep Markdown headings render**: the panel renderer now understands
  `####` through `######` (previously only `#`–`###`), keeping the page-level
  h1 offset and clamping to `h6`, so model-written subsections no longer
  appear as literal `####` paragraphs; deep headings still get anchor ids
  and paragraph interruption rules follow the wider heading range.

### Accessibility

- Table header cells carry `scope="col"`, letting screen readers associate
  each data cell with its column.

### Tests

- 561 cases pass (LANG=en and LANG=zh); the client fixture card now contains a
  `####` subsection and the DOM test asserts the `h5` node, its anchor id and
  the table header `scope` attribute.

## [0.179.0] - 2026-11-28

### Added

- **Elixir `.exs` files are indexed**: test files (`test/**/*_test.exs`),
  scripts and `config/*.exs` now enter the symbol index, so `alias`/`use`
  references inside test files produce edges and `repowiki-impact` can route
  affected Elixir tests (`test/` paths and `*_test.exs` are already test
  heuristics). The root `mix.exs` stays a manifest rather than a source
  file, so no double counting.

### Tests

- 561 cases pass (LANG=en and LANG=zh); the Elixir fixture now includes
  `test/my_app/accounts_test.exs` (asserting its alias edge to the source
  module, the elixir file count of 8 and external `ExUnit.Case` staying
  edge-free), and the test-path heuristics pin Elixir test paths.

## [0.178.0] - 2026-11-28

### Added

- **Elixir umbrella dependency aggregation**: nested `apps/*/mix.exs`
  manifests (up to 20 per index) now contribute their Hex dependencies to
  `dependencyCounts.mix` and to technology detection, with each technology
  carrying the manifest it came from. The project name still comes from the
  root `mix.exs`, so an umbrella whose apps hold all the dependencies no
  longer reports `mix: 0` with no Phoenix/Ecto/Plug entries.

### Tests

- 561 cases pass (LANG=en and LANG=zh); the Elixir indexer fixture now
  includes two nested app manifests and asserts the merged mix count (5),
  Plug sourced from `apps/web/mix.exs`, Oban from `apps/api/mix.exs`, and
  the root-only project name.

## [0.177.0] - 2026-11-28

### Added

- **Elixir indexing (16th language)**: `.ex` files produce `defmodule`
  symbols (nested `defmodule Inner` records its full `Outer.Inner` name),
  `def`/`defp`, `defmacro(p)`, `defguard(p)` and `defdelegate` with
  do/end-aware ranges, `do:` one-liners, multi-line signatures and
  private visibility. `alias` / `import` / `require` / `use` resolve to the
  file that declares the module (grouped `alias MyApp.{A, B}` and `as:`
  aliases included), so Phoenix umbrella apps, nested modules and
  multi-module files get real dependency edges; external modules
  (`Logger`, `Ecto`, …) stay edge-free. `mix.exs` contributes the app name,
  the dependency count and Hex technology names (Phoenix, Ecto, Plug, Oban,
  …). Prompt fences and the panel language filter know `elixir`.

### Tests

- 561 cases pass (LANG=en and LANG=zh); new symbol coverage pins module /
  function / macro / guard / delegate extraction, nested full names,
  multi-line heads and `do:` one-liners; a dependency fixture covers grouped
  and renamed aliases; the indexer end-to-end fixture asserts alias/import
  edges with line numbers, umbrella layout, nested-module resolution,
  external-package exclusion and the `mix` stack counts.

## [0.176.0] - 2026-11-28

### Added

- **Graph-aware wiki freshness**: the wiki manifest now records a
  `graphDigest` over the indexed file set and dependency edges. Generation's
  incremental skip requires it to match, so a change that only affects
  resolution — a new `tsconfig` alias, composer PSR-4 mapping, `go.mod`
  module path, pubspec package, or a file added/removed without a card —
  re-synthesizes instead of leaving architecture pages silently stale.
  `verify:wiki` reports `wiki/stale-graph` with `staleReasons: ['graph']`,
  `repowiki-status` warns, and the panel folds graph mismatch into its
  existing "wiki is behind" notice (computed from the loaded `index.json`).
  Manifests without `graphDigest` keep the previous card/memory checks; the
  next generation writes the new field.

### Tests

- 558 cases pass (LANG=en and LANG=zh); new coverage pins the signature
  (order-independent, invalid entries ignored), proves a generate re-run is
  forced by an index-edge change with unchanged cards, the gate's graph stale
  reason/issue, the status warning, and the panel notice when only the graph
  digest differs.

## [0.175.0] - 2026-11-28

### Fixed

- **Chinese queries no longer match single characters**: both the BM25
  search (`tokenizeQuery`) and the panel search now keep only two-character
  bigrams for CJK runs of length two or more, while documents still index
  unigrams so one-character queries keep working. Previously a query like
  "无匹配" matched every card containing "无", burying the real result;
  single-character queries ("图") behave as before. Latin tokens are
  unchanged.

### Tests

- 552 cases pass (LANG=en and LANG=zh); new unit coverage pins the query
  tokenizer (bigrams only for multi-character runs, unigrams preserved for
  single-character runs, Latin untouched) and a BM25 fixture proves a
  document containing only "无" is no longer returned for "无匹配".

## [0.174.0] - 2026-11-28

### Added

- **GFM tables and nested lists in the panel renderer**: generated cards and
  wiki pages often contain Markdown tables or indented sub-lists, which the
  zero-dependency renderer previously flattened into paragraphs. Tables now
  render as `<table>` with header/body cells, column alignment from the
  delimiter row (`:--`, `:--:`, `--:`), inline formatting inside cells and
  `\|` escaping; lists build an indentation tree and render nested `ul`/`ol`
  inside their parent `<li>`, preserving ordered/unordered mixes at each
  level. No new dependency; links inside cells still go through the existing
  protocol allowlist.

### Tests

- 550 cases pass (LANG=en and LANG=zh); the client fixture card now carries a
  two-column table and a three-level list, and a new DOM test asserts the
  table node, centered header alignment, `li > ul` nesting and the
  ordered/unordered mix.

## [0.173.0] - 2026-11-28

### Performance

- **Bounded directory-listing prefetch**: while the depth-first walk is
  inside one directory, the indexer now starts `listDir` for the next siblings
  in traversal order (up to 8 in flight). Entries are still consumed in the
  same sorted DFS order and the budget is still charged in that order, so the
  result is identical to the serial walk — remote `ctx.fs` backends just stop
  paying one round trip per directory back to back. Prefetched promises carry
  a no-op catch so budget truncation or cancellation cannot surface as an
  unhandled rejection.

### Tests

- 549 cases pass (LANG=en and LANG=zh); a delayed `listDir` fixture proves
  sibling listings overlap (peak > 1, peak <= 8) while files and edges stay
  identical to a serial build.

## [0.172.0] - 2026-11-28

### Security

- **Snapshot manifests are validated as data, not trusted structure**:
  `repowiki-import` now refuses a manifest whose `schemaVersion` is not the
  current one (fields may have changed meaning), treats an explicit `count`
  that disagrees with `files.length` as corruption, and rejects manifests
  larger than 8 MiB before reading them into memory. Non-object JSON
  (arrays/scalars) is reported as corrupt instead of being silently treated as
  an empty manifest. Legacy manifests without `count` still verify normally,
  and `allowCorrupt` remains the explicit escape hatch.

### Tests

- 548 cases pass (LANG=en and LANG=zh); new coverage asserts unsupported
  schema versions, count mismatches (files are still checked for detail), the
  size limit, non-object manifests, and the export→tamper-schema→import
  end-to-end refusal that writes nothing.

## [0.171.0] - 2026-11-28

### Fixed

- **Reproducible index output**: `readIndex`-style consumers receive the same
  JSON regardless of the backend's directory listing order. `walk` now sorts
  every directory's entries by name (code-unit order, no ICU dependence), so
  the 5,000-file budget truncates at the same files on every machine, and the
  finished index sorts `files` by path and `edges` by source/line/target.
  Previously a backend that returned entries in a different order produced a
  different `index.json` (churn for a Git-shared asset) and could index a
  different subset of an over-budget repository.

### Tests

- 545 cases pass (LANG=en and LANG=zh); a new fixture builds the same project
  through a reversed `listDir` wrapper and asserts identical `files`, `edges`
  and `modules`, plus the path/line ordering itself.

## [0.170.0] - 2026-11-28

### Security

- **Index paths are treated as untrusted input**: `.dsh-repowiki/index.json`
  travels with Git, so a crafted commit could previously make
  `repowiki-context`, `repowiki-extract` or `repowiki-impact` read files
  outside the project (for example `../` or absolute paths) and feed them to
  the model. `readIndex` now normalizes every `files[].path`, drops entries
  that are absolute, empty or escape the project root, and drops edges that
  point at dropped files. Dropped counts and the first five offending paths
  are exposed as `untrusted`, which `repowiki-status` reports as a warning.
  Legitimate indexes are unaffected (no extra field), and `projectRelativePath`
  is shared with snapshot import so both entry points follow one rule.

### Tests

- 544 cases pass (LANG=en and LANG=zh); new coverage asserts the path helper
  (traversal, absolute, Windows drive, whitespace, non-strings), index
  sanitization (kept/normalized files, dangling-edge removal, `untrusted`
  counts and paths) and the status warning rendered in text.

## [0.169.0] - 2026-11-28

### Added

- **PHP PSR-4 autoload resolution**: root and nested `composer.json` files now
  feed `autoload` / `autoload-dev` `psr-4` mappings (string or array
  directories, empty-prefix fallback) into PHP `use` resolution. Namespace
  prefixes map to arbitrary directories instead of relying on path suffixes,
  so Symfony/Laravel-style layouts (`App\` → `src/`) get real dependency
  edges; the longest prefix wins and class-name matching stays
  case-insensitive. Absolute or escaping directories are ignored, and
  external packages still produce no edges. The Composer stack count keeps
  using only the root manifest.

### Changed

- **Dependency directories excluded by default**: `vendor/` (Composer, and
  Go's vendored third-party code) and `.dart_tool/` (Dart/Flutter generated
  package config and build cache) no longer enter the index, so installed
  dependencies cannot crowd out project files against the 5,000-file budget.

### Tests

- 540 cases pass (LANG=en and LANG=zh); the new PHP fixture asserts longest
  prefix, array directories, `autoload-dev`, empty-prefix fallback, nested
  package bases and the untouched Composer dependency count, while a second
  fixture proves `vendor/` and `.dart_tool/` are skipped.

## [0.168.0] - 2026-11-28

### Fixed

- **Import no longer copies unlisted files**: when the snapshot contains
  `_snapshot.json`, `repowiki-import` now copies only the relative paths the
  manifest lists. Text files added to the snapshot directory by hand — or
  injected by a third party after export — are skipped, counted in
  `snapshotUnlisted` and reported in `snapshotUnlistedPaths` (first 5, bounded),
  so a verified snapshot cannot smuggle extra Markdown/JSON into the asset
  directory. Snapshots without a manifest keep the legacy full-copy behaviour;
  manifest paths are normalized (backslashes, `./`) and absolute or escaping
  entries are discarded before the copy filter is built.

### Tests

- 538 cases pass (LANG=en and LANG=zh); new coverage asserts `copyTree`'s
  `only` filter (including an empty listing copying nothing), and the
  export→inject→import end-to-end path proving the unlisted file is neither
  copied nor silently dropped (count, path list and render line verified).

## [0.167.0] - 2026-11-27

### Added

- **Dart workspace `package:` imports**: pubspec names found anywhere in the
  repository now map `package:<name>/path.dart` to that package's
  `lib/path.dart` (root package or nested `packages/*`), so Flutter monorepos
  get dependency edges between local packages instead of treating every
  `package:` import as external. Same-name pubspecs prefer the shallowest
  directory, matching the JavaScript workspace rule. External packages and
  `dart:` imports still produce no edges.

### Tests

- 535 cases pass (LANG=en and LANG=zh); the Dart indexer fixture now imports
  its own package and a nested workspace package, asserting both edges, exact
  part/import line numbers and the combined pub dependency count.

## [0.166.0] - 2026-11-27

### Added

- **Dart indexing (15th language)**: `.dart` files now produce symbols for
  classes, mixins, enums, extensions (including extension types), typedefs,
  constructors (named constructors as `Type.name`), methods, getters/setters,
  top-level functions and variables. `_`-prefixed names are recorded as
  private. Relative `import`/`export`/`part` directives create local
  dependency edges (including bare same-directory `.dart` URIs and `show`
  symbols); `dart:`/`package:` remain external. `pubspec.yaml` contributes
  `projectName` and `pub` dependency counts, with Flutter/Provider/Riverpod/
  Bloc/Dio and other common packages mapped to display names. The panel's
  language filter shows `Dart`.

### Tests

- 535 cases pass (LANG=en and LANG=zh); new symbol, dependency and indexer
  cases cover constructors/getters/private members, relative `part`/`import`
  edges, external package exclusion and the pub tech stack.

## [0.165.0] - 2026-11-27

### Fixed

- **Large snapshots can be verified**: the snapshot verifier used to stop at
  500 files and mark the result unverified, so importing a snapshot from a
  repository with more than 500 cards/pages was refused by default. The cap
  is now 20,000 files, and verification reads with 8-way bounded concurrency
  instead of one file at a time, keeping remote-workspace imports practical.
  Results are still aggregated in manifest order for reproducible output.

### Tests

- 532 cases pass (LANG=en and LANG=zh); a delayed-filesystem wrapper asserts
  real concurrency with a peak of at most 8, and an explicit low limit
  asserts `capped`/`verified=false` semantics.

## [0.164.0] - 2026-11-27

### Fixed

- **Snapshot writes are verified**: `copyTree` now reads every copied file
  back and compares it to the source before counting it as exported. A
  backend that truncates or corrupts a write is recorded in `failed` and
  excluded from the snapshot manifest instead of producing a snapshot that
  only fails later during import.

### Tests

- 531 cases pass (LANG=en and LANG=zh); a truncating filesystem wrapper
  asserts one failed entry, one successful file and a manifest with only the
  successful file.

## [0.163.0] - 2026-11-27

### Added

- **Digest-verified snapshots**: `repowiki-export` now writes
  `_snapshot.json` at the snapshot root with every copied file and a
  sha256-16 content digest (plus a `partial` flag when the export was
  cancelled or had copy failures). `repowiki-import` verifies the manifest
  before copying: mismatched, missing, unreadable or unsafe paths and partial
  exports refuse the import by default, with `allowCorrupt=true` as an
  explicit override. Legacy snapshots without a manifest still import with a
  notice that integrity was not verified, and the manifest file itself is
  never copied into `.dsh-repowiki/`.

### Tests

- 530 cases pass (LANG=en and LANG=zh); transfer cases cover digest entries,
  manifest round-trips and tamper/missing detection, and the export/import
  tool case asserts a verified import, a refused tampered import and the
  `allowCorrupt` override.

## [0.162.0] - 2026-11-27

### Added

- **Character classes in ignore rules**: `.gitignore`/`.repowikiignore`
  patterns now support `[abc]`, `[a-z]` and `[!a-z]`/`[^a-z]`, so common
  rules such as `*.py[cod]` and `file[0-9].txt` work. Invalid ranges and
  unclosed classes fall back to literal matching instead of throwing, and a
  class containing `/` is treated literally so it cannot cross path segments.

### Tests

- 527 cases pass (LANG=en and LANG=zh); a new case covers positive/negative
  classes, directory rules and malformed-range fallbacks.

## [0.161.0] - 2026-11-27

### Added

- **Nested `.gitignore` / `.repowikiignore`**: the indexer now reads ignore
  files in subdirectories as it walks. Each file's patterns are scoped to its
  own directory (anchored patterns and `generated/` style rules stay inside
  that subtree), and deeper files take precedence, so `!keep.skip.ts` in a
  package can re-include a file ignored by the repository root. Root-only
  rule behavior is unchanged; unreadable nested rule files surface as index
  warnings.

### Tests

- 526 cases pass (LANG=en and LANG=zh); new cases cover directory-scoped
  matching, negation precedence and a real nested `buildIndex` fixture.

## [0.160.0] - 2026-11-27

### Added

- **`repowiki-cards offset` pagination**: symbol-file and docs/BM25 results
  now accept `offset` alongside `limit`, with `total` always reporting the
  full match count and `truncated` meaning "more results remain after this
  page". Text output shows the exact `start–end` range instead of always
  claiming "the first N". Large repositories can now page through results
  instead of only truncating at the limit.

### Tests

- 524 cases pass (LANG=en and LANG=zh); primitive tests cover middle/last
  pages for both symbol search and BM25, and the cards tool case asserts the
  returned `offset`, page boundaries and rendered range.

## [0.159.0] - 2026-11-27

### Fixed

- **Compatibility matrix drift**: `docs/compatibility.md` still declared index
  schema v5 and wiki manifest v2 long after the code moved to v6/v3. The table
  now documents the current formats: line counts, edge lines, skipped-file
  stats, manifest `inputDigest`/`memoryDigest`, `citationDigests`,
  `citationMisses`, `failed`/`failedTotal`, plan fields and legacy-read
  behavior. The runbook no longer claims old indexes upgrade to v3.
- Current descriptions in both READMEs now refer to schema v6 edges instead of
  v5 (historical roadmap entries still say v5, which is when lines were added).

### Added

- `KNOWLEDGE_INDEX_SCHEMA_VERSION` and `WIKI_MANIFEST_SCHEMA_VERSION` constants
  in `src/schema.js`; extraction and generation write them instead of inline
  literals.
- A docs-consistency test binds every asset version in the compatibility
  matrix to those constants, so a future bump cannot leave the matrix stale.

### Tests

- 523 cases pass (LANG=en and LANG=zh); the new guard fails if the matrix and
  code constants diverge.

## [0.158.0] - 2026-11-27

### Fixed

- **False invalid-path counts in `repowiki-status`**: `listWikiPages` returns
  paths relative to the project root (`.dsh-repowiki/wiki/...`) while manifest
  paths are relative to the asset root (`wiki/...`). The comparison treated
  every normal page as a path mismatch, so healthy wikis reported
  `wiki.invalid = N`. The asset prefix is now stripped before comparing.

### Added

- **Health score counts failed pages and invalid paths**: the wiki component
  now includes pages that failed to write during the last generation in its
  denominator (40-point damage weight, same as missing pages, with a 60-point
  floor) and deducts 5 points per invalid page path (capped at 20). Invalid
  pages already counted as missing are excluded by the caller to avoid
  double-penalizing. Issues name both classes explicitly.

### Tests

- 522 cases pass (LANG=en and LANG=zh); health cases cover failed and invalid
  penalties, and the complete status fixture now asserts `wiki.invalid = 0`
  for a normal generated wiki.

## [0.157.0] - 2026-11-27

### Added

- **Status duplicate counts**: `repowiki-status` now reports
  `wiki.duplicate`, `wiki.duplicateSlugs` and `wiki.duplicatePaths` for page
  files sharing a slug and for manifests that repeat a slug or path. The text
  report adds `duplicate N` to the `Wiki:` line, matching the gate.
- **Panel duplicate notice**: the Wiki tab derives the same duplicate counts
  from the loaded page list and manifest (no extra reads) and shows a
  `role=status` notice with the offending slugs/paths.

### Tests

- 521 cases pass (LANG=en and LANG=zh); status and panel cases cover a
  duplicated manifest page and a second file claiming an existing slug.

## [0.156.0] - 2026-11-27

### Added

- **Duplicate page detection in `verify:wiki`**: a locale now fails with
  `wiki/duplicate-page-slug` when two page files declare the same slug.
  Without this check the slug map silently shadowed one page, so the hidden
  file was neither shown nor reported as orphaned.
- **Duplicate manifest entries**: a manifest that repeats a page slug or path
  fails with `manifest/duplicate-pages`, catching merge/copy corruption
  before it produces ambiguous page resolution.

### Tests

- 519 cases pass (LANG=en and LANG=zh); a new gate case covers both a second
  file claiming an existing slug and a manifest with two identical pages.

## [0.155.0] - 2026-11-27

### Fixed

- **Relative link resolution in `verify:wiki`**: links are now resolved from
  the page's real location under `.dsh-repowiki/wiki/<locale>/` against the
  project root. A wiki page linking to `../../../src/indexer.js` (a normal
  project file) is valid; only targets that escape the project root are
  reported as `wiki/unsafe-link`. Previously every `..` escape of the asset
  directory was rejected, so legitimate project links produced false errors.

### Added

- `verify:wiki` now checks **all** relative Markdown links, not just `.md`
  links: source files, docs and directories must exist, and line fragments
  such as `src/a.ts#L1-L2` are stripped before probing. Broken targets report
  `wiki/broken-link` with a project-root-relative path.

### Tests

- 518 cases pass (LANG=en and LANG=zh); a new gate case links to
  `src/a.ts`, `docs/guide.md` and the root `README.md` and asserts a pass,
  then removes the source target and asserts the broken-link failure.

## [0.154.0] - 2026-11-27

### Docs

- README (English and Chinese) now includes a problem-code reference table for
  `verify:wiki --json`: code, default severity, `--strict`/`--require`
  escalation, and meaning. This makes CI aggregation/suppression practical
  without reading the script source. Also removed a duplicated gate command
  line in the English quick-start block.

## [0.153.0] - 2026-11-27

### Added

- **Panel invalid-path notice**: the Wiki tab now flags manifest pages whose
  path escapes `wiki/<locale>/`, contains `..`/is absolute, is not `.md`, or
  does not match the loaded file. Invalid paths are excluded from the panel's
  missing-page count, so a bad path is reported once rather than twice.

### Tests

- 517 cases pass (LANG=en and LANG=zh); a panel case mounts a manifest path
  of `../secret.md` and asserts the invalid notice while the missing notice
  stays hidden.

## [0.152.0] - 2026-11-27

### Added

- **Status invalid-path count**: `repowiki-status` now reports
  `wiki.invalid`/`wiki.invalidPages` for manifest pages whose path escapes
  `wiki/<locale>/`, contains `..`/is absolute, is not `.md`, or does not
  match the file on disk. This mirrors the gate's path checks without reading
  page bodies, so the diagnostic stays cheap.

### Tests

- 516 cases pass (LANG=en and LANG=zh); a status case rewrites a manifest
  path to `../secret.md` and asserts the count, slug list and text.

## [0.151.0] - 2026-11-27

### Changed

- **Bounded reads in the gate**: `verify:wiki` now reads cards, accepted
  memory and wiki page files through an 8-way bounded concurrency helper
  (`mapLimit`), keeping result order and duplicate-slug semantics. Large
  repositories no longer pay serial file reads on every CI run; the
  link/existence probes remain capped and sequential.

### Tests

- 515 cases pass (LANG=en and LANG=zh); a new case reads two valid cards plus
  one malformed card concurrently and asserts the digest still matches.

## [0.150.0] - 2026-11-27

### Added

- **Missing-page health penalty**: `assessHealth` now accepts
  `wiki.missing`, counts missing pages in the wiki denominator and deducts
  up to 40 points from the wiki component (`40 * missing / total`). Status
  passes its `wiki.missing` through, the component detail includes
  `N missing`, and the top issues prefer the missing-page message over the
  stale-page one. A full loss of pages scores 60 instead of collapsing to 0,
  keeping the component interpretable.

### Tests

- 514 cases pass (LANG=en and LANG=zh); a health case covers one/five and
  zero/five missing pages, and the status missing-page case now asserts the
  wiki component score and issue text.

## [0.149.0] - 2026-11-27

### Added

- **Panel stale-memory notice**: the Wiki tab now also recomputes the accepted
  memory `memoryDigest` (same `slug:body` ordering as generate, body stripped
  of its heading) and warns when it differs from the manifest. Together with
  the card digest this makes the panel's staleness view match `verify:wiki`.
  Missing Web Crypto still degrades to silence.

### Tests

- 513 cases pass (LANG=en and LANG=zh); a panel case mounts a manifest with a
  wrong `memoryDigest` and asserts the memory-stale notice.

## [0.148.0] - 2026-11-27

### Added

- **Panel stale-cards notice**: the Wiki tab now recomputes the card
  `inputDigest` in the browser (Web Crypto SHA-256, same `path:sourceDigest`
  ordering as generate) and warns when it differs from the manifest, i.e. the
  wiki fell behind after cards changed. If Web Crypto is unavailable the check
  degrades to silence instead of showing a false warning.

### Tests

- 512 cases pass (LANG=en and LANG=zh); a panel case mounts a manifest with a
  deliberately wrong digest and asserts the stale notice.

## [0.147.0] - 2026-11-27

### Added

- **Status missing-page count**: `repowiki-status` now reports `wiki.missing`
  and `wiki.missingPages` (up to 10 slugs) for manifest pages whose file is
  gone, using the same slug comparison as `verify:wiki`, and prints
  `missing N` in its `Wiki:` line. This closes the last gap between the gate,
  the panel and the diagnostic tool.

### Tests

- 511 cases pass (LANG=en and LANG=zh); a new status case deletes a generated
  module page and asserts the missing count, slug list and text.

## [0.146.0] - 2026-11-27

### Added

- **Wiki structure and link integrity**: `verify:wiki` now validates manifest
  page paths (must stay under `wiki/<locale>/`, no `..`/absolute paths, must
  be `.md`) and that a page's recorded path matches its actual file. It also
  extracts relative `.md` links from page bodies (ignoring code fences, inline
  code, images, external URLs and pure anchors), fails on links that escape
  the project root (`wiki/unsafe-link`) or point to missing files
  (`wiki/broken-link`), and caps existence probes at 200 (strict mode fails
  when the cap is hit). New problem codes: `wiki/invalid-page-path`,
  `wiki/page-path-mismatch`, `wiki/unsafe-link`, `wiki/broken-link`,
  `wiki/link-probe-capped`.

### Tests

- 510 cases pass (LANG=en and LANG=zh); new cases cover a dead internal link,
  an escaping link, and invalid/mismatched manifest page paths.

## [0.145.0] - 2026-11-27

### Added

- **Index-version gate**: `verify:wiki` warns when `index.json` predates
  schema v6 (no line counts) and fails under `--strict`, because range checks
  would otherwise be silently partial. Unverifiable `#Lx-Ly` ranges
  (`ranges.unchecked`) now also warn by default and fail under `--strict`
  (`citation/range-unchecked`).
- **CI fixture job**: `.github/workflows/tests.yml` gains a `verify-wiki` job
  that builds a fresh fixture, asserts the strict gate passes, then changes a
  card digest and asserts the gate exits 1. This exercises the documented
  `--strict --require` recipe on every push.

### Tests

- 508 cases pass (LANG=en and LANG=zh); a new case covers the v5 index warning
  plus the strict failures for the outdated index and unverified ranges.

## [0.144.0] - 2026-11-27

### Added

- **Panel wiki diagnostics**: the Wiki tab now surfaces manifest-level
  problems without leaving the GUI: pages recorded as failed by the last
  generation (`failedTotal`, with up to five slugs in the tooltip) and
  manifest pages missing from disk. Both notices use `role=status`, appear
  above the citation summaries, and are also shown when the page list is
  empty (the state where they matter most). Data comes only from the manifest
  and the already-loaded directory listing — no source reads.

### Tests

- 507 cases pass (LANG=en and LANG=zh); a new panel case mounts a manifest
  with a failed page and a missing page and asserts both notices and their
  accessible titles.

## [0.143.0] - 2026-11-27

### Added

- **Persisted generation failures**: `repowiki-generate` now records failed
  page writes in the manifest (`failed` up to 10 entries, `failedTotal` for
  the full count). Previously a partially failed run still advanced the input
  digests, so the next gate could treat an incomplete wiki as fresh.
- `verify:wiki` reports these as `wiki/generation-failed` (warning by default,
  failure under `--strict`) and exposes `failedPages` per locale.
- `repowiki-status` adds `wiki.failed`/`wiki.failedPages` and prints the count
  in its `Wiki:` line.

### Tests

- 506 cases pass (LANG=en and LANG=zh); new cases cover a manifest with failed
  pages through the gate (lenient/strict) and through status text/structure,
  plus the empty `failed`/`failedTotal` fields on a clean generation.

## [0.142.0] - 2026-11-27

### Added

- **Structured problems**: `verify:wiki --json` now emits
  `problems[{code, severity, message, locale?}]` alongside the human-readable
  issues/warnings. Codes are stable (`citation/missing`, `citation/range`,
  `citation/drift`, `wiki/stale-cards`, `wiki/stale-memory`,
  `wiki/missing-pages`, `manifest/empty`, `assets/missing`, …) so CI can
  aggregate or suppress without parsing English text.
- **Empty-manifest semantics**: a manifest that lists no pages warns by
  default, fails under `--strict`, and fails under `--require` (generate never
  short-circuits an empty manifest, so passing it hides a failed generation).
- `--strict` now also fails when citation existence probing hit the 200-path
  cap (`citation/probe-capped`), matching its unverifiable-input semantics.

### Tests

- 504 cases pass (LANG=en and LANG=zh); new coverage for the empty-manifest
  matrix and problem codes across broken/stale/page-integrity cases.

## [0.141.0] - 2026-11-27

### Added

- **Page integrity gate**: `verify:wiki` now enumerates wiki page files
  (frontmatter slug, three-level nesting like `listWikiPages`). A manifest
  slug without a file fails with
  `N page(s) in the manifest have no file on disk`, while page files not in
  the manifest only warn. `missingPages`/`orphanedPages` are included in the
  JSON report, closing another generate/verify gap.

### Tests

- 503 cases pass (LANG=en and LANG=zh); a new case deletes a manifest page,
  adds an orphan page, and asserts the failure, the warning, and both lists.

## [0.140.0] - 2026-11-27

### Added

- **Memory-aware stale gate**: `verify:wiki` now also recomputes the accepted
  memory `memoryDigest` (same `slug:body` ordering as `repowiki-generate`) and
  fails when accepted memory changed after generation. `staleReasons` reports
  `cards`/`memory`, and the text report prints `(stale: cards, memory)`.
- **`--require`**: fails when no wiki manifest exists, so a CI gate cannot pass
  silently against a wrong root or a skipped generation step.

### Changed

- `--strict` now also fails on manifests without `inputDigest`/`memoryDigest`
  (unverifiable staleness), matching its "unverifiable digests fail" semantics.

### Tests

- 502 cases pass (LANG=en and LANG=zh); new cases cover accepted-memory drift,
  pending/rejected memory being ignored, and `--require` failing an empty root
  through both the API and the CLI exit code.

## [0.139.0] - 2026-11-27

### Added

- **Stale-wiki gate**: `verify:wiki` now recomputes the card `inputDigest`
  (same `path:sourceDigest` ordering as `repowiki-generate`) and compares it
  with the manifest. A mismatch fails by default with
  `wiki is stale: cards changed since generation (run repowiki-generate)`,
  even when every citation path is still valid. Legacy manifests without
  `inputDigest` warn and skip the check instead of failing.

### Tests

- 500 cases pass (LANG=en and LANG=zh); a new case writes a card, verifies a
  matching manifest, changes the card digest and asserts the stale failure
  plus the `(stale)` report marker.

## [0.138.0] - 2026-11-27

### Added

- **"Only untracked" wiki filter**: when any page has citations without a
  content digest, the Wiki tab shows a toggle with the affected page count.
  It composes with search, marks itself with `aria-pressed`, and hides pages
  whose citations are fully tracked.

### Fixed

- **Search/filter empty state**: when entries exist but the current query or
  filter matches none, the Wiki tab now says "no matching pages" instead of
  the "no wiki pages generated yet" message.

### Tests

- 499 cases pass (LANG=en and LANG=zh); the panel suite drives the toggle,
  asserts filtered/unfiltered titles and `aria-pressed`, and keeps the legacy
  no-digest case green.

## [0.137.0] - 2026-11-27

### Added

- **`verify:wiki` CI gate**: `npm run verify:wiki` (or
  `node scripts/verify-wiki.mjs`) validates every wiki manifest: missing
  citation paths (index plus bounded filesystem probes), out-of-range line
  ranges (index v6), content drift (manifest v3) and digest coverage.
  `--root`, repeatable `--locale`, `--json` and `--strict` are supported;
  broken paths, out-of-range ranges and drift fail by default, while
  untracked/unverifiable citations warn unless `--strict`. No wiki assets
  exits 0; an explicitly requested missing locale fails. Exit codes: 0 pass,
  1 verification failed, 2 usage/read error.

### Fixed

- **Duplicate range counts**: page-level `sources` are the union of section
  sources; the server-side `findCitationRangeIssues` counted both, doubling
  `total` / `unchecked` and the health penalty. It now deduplicates per page,
  matching the panel and coverage accounting.

### Tests

- 498 cases pass (LANG=en and LANG=zh); the new suite covers clean/strict
  manifests, broken/range/drift failures, untracked citations, missing
  locales, argument parsing, `main` output and CLI exit codes, plus a
  regression for overlapping page/section range counts.

## [0.136.0] - 2026-11-27

### Added

- **Page-level coverage details**: `repowiki-status` now reports
  `citationCoveragePages` — up to ten pages with untracked citations, most
  affected first, each with `total` / `tracked` / `untracked` and the reason
  breakdown. The `Citation digests` line appends an example page, so callers
  know which page to regenerate. `citationCoveragePages` is a shared pure
  helper built on the same per-page counting as the aggregate.
- **Coverage issue without penalty**: health issues now list
  `N citation(s) have no content digest`; the score is unchanged because an
  untracked citation is unknown, not proven bad.

### Tests

- 490 cases pass (LANG=en and LANG=zh); new coverage for page ordering,
  bounding and truncation, the status detail/render path, and the
  no-penalty health issue.

## [0.135.0] - 2026-11-27

### Changed

- **Bounded concurrent drift reads**: `checkCitationDrift` now prefetches
  unique cited files with bounded concurrency (default 8, hard cap 16,
  override via `concurrency`) instead of reading them one by one, then
  compares in manifest order. Results, caps and `unchecked` accounting stay
  identical; large wikis see lower status latency without changing output.

### Tests

- 489 cases pass (LANG=en and LANG=zh); new tests assert the concurrency cap
  (3 active reads, 1 with `concurrency: 1`) while all digests still verify.

## [0.134.0] - 2026-11-27

### Added

- **Panel untracked reasons**: the Wiki tab now reads `citationMisses` from the
  manifest and includes a localized reason breakdown (`unreadable`, invalid
  `range`, read `cap`, `unknown`) in the per-page `◌ N` badge tooltip and the
  aggregate coverage summary, without reading source files. Legacy manifests
  keep the single no-digest line.

### Tests

- 487 cases pass (LANG=en and LANG=zh); the panel fixture now carries
  `citationMisses` for the out-of-range citation and asserts the badge title
  and reason-aware accessible label.

## [0.133.0] - 2026-11-27

### Added

- **Untracked citation reasons**: generation now records `citationMisses`
  (source → reason) in each manifest page for citations without a digest, and
  `citationCoverage.reasons` reports `unreadable`, `range` (invalid, reversed
  or out-of-bounds line range), `cap` (generation read cap) and `unknown`
  (legacy manifests without reason data). Reasons appear in generation
  hints/renders and the status `Citation digests` line. Counting is per page,
  consistent with coverage; legacy manifests fall back to `unknown` instead of
  guessing.

### Tests

- 487 cases pass (LANG=en and LANG=zh); new coverage for reason buckets, an
  out-of-range citation classified as `range`, an unreadable source as
  `unreadable`, and legacy manifests as `unknown`.

## [0.132.0] - 2026-11-27

### Added

- **Panel citation digest coverage**: the Wiki tab now derives per-page and
  aggregate digest coverage from the manifest without reading source files.
  Pages with citations but no digest show a muted `◌ N` badge (with an
  accessible title), the list header shows `tracked/total` when coverage is
  incomplete, and legacy manifests without any digests show one
  `manifest has no digests` line instead of a badge on every page.

### Fixed

- **Double-counted panel citation issues**: page-level `sources` are the union
  of section sources, so counting both doubled the out-of-range and unchecked
  totals. Issue counts are now deduplicated per page, matching status/generate.

### Tests

- 486 cases pass (LANG=en and LANG=zh); the panel fixture manifest is now v3
  with 4/5 digests, asserting both the `◌ 1` badge and the coverage summary,
  plus a legacy v2 case that shows the no-digest line without per-page badges.

## [0.131.0] - 2026-11-27

### Added

- **Citation digest coverage**: `repowiki-generate` and `repowiki-status` now
  report `citationCoverage` (`total` / `tracked` / `untracked` /
  `hasDigests`) derived from the manifest, so citations whose source could
  not be read at generation time (or were beyond the read cap) stay visible
  instead of being silently treated as verified. Generation renders an
  untracked-citation note and its fresh-skip hint distinguishes tracked
  verification from untracked citations and legacy manifests without
  digests. `summarizeCitationCoverage` is a shared pure helper; status
  renders a `Citation digests` line only when coverage is incomplete or the
  manifest predates v3.

### Tests

- 485 cases pass (LANG=en and LANG=zh); new coverage for the helper
  (per-page dedupe, empty pages, empty digest values, legacy manifests),
  generation (full coverage on a fresh skip, untracked after a deleted
  source, legacy wording) and status (incomplete coverage line).

## [0.130.0] - 2026-11-27

### Added

- **Citation-aware health score**: `repowiki-status` now feeds citation
  integrity into the weighted health score. Missing citation paths cost 10
  points each (capped at 40); out-of-range citation lines and content drift
  cost 5 each (capped at 20 each) against the wiki component, and the cap
  keeps that component at 20 or above. Citation defects appear in the top
  issues, and the wiki component detail names the issue count. `unchecked`
  citations are reported but not penalized, because they are unverified
  rather than known-bad.

### Tests

- 483 cases pass (LANG=en and LANG=zh); new tests cover penalty arithmetic,
  the component cap and a status integration with both a missing citation
  path and a drifted digest.

## [0.129.0] - 2026-11-27

### Added

- **Drift-aware incremental generation**: `repowiki-generate` now re-checks
  the citation digests recorded in the wiki manifest before honouring the
  fresh skip. Cards and accepted memory can stay unchanged while cited code
  moves; any changed citation (`citationDrift > 0`) or any citation that
  cannot be verified (unreadable file, invalid range, over the 500-entry
  comparison cap or the 200-file read cap) disables the skip and triggers
  re-synthesis with a hint stating why. A clean check returns
  `citationDrift: 0` next to `skippedFresh`; legacy manifests without digests
  keep the previous behaviour.
- **Shared drift checker**: status and generate now share
  `src/citation-drift.js` (same caps, path rejection and per-file read
  cache). Entries beyond the comparison cap are counted as `unchecked`
  instead of being ignored, so a truncated check can never pass as fresh.

### Tests

- 481 cases pass (LANG=en and LANG=zh); new coverage for the shared checker
  (match, mismatch, unreadable file, unsafe paths, read cap, entry cap) and
  for generate (unchanged citations keep the skip, changed citations
  re-synthesize, unverifiable citations re-synthesize conservatively).

## [0.128.0] - 2026-11-27

### Added

- **Citation content drift**: the wiki manifest is now schema v3 and records
  a sha256-12 content digest per citation (`citationDigests`), computed at
  generation time from the cited line range (whole file when no range is
  given). Cited paths are sanitized with the same whitelist used for page
  sources and read outside the write lock, capped at 200 files per run.
  `repowiki-status` recomputes the digests (100-file read cap), reports
  changed citations in `citationDrift` with bounded page details and a
  warning, and states `(none; N verified)` when everything matches. Manifests
  without digests (v1/v2) produce no drift claim; unreadable files, invalid
  ranges and over-cap entries are counted as `unchecked`, never as changed.
- **Shared digest helper**: `src/citation-digest.js` defines line slicing
  aligned with `countSourceLines` (empty file = 0 lines, trailing newline
  does not add a line).

### Tests

- 474 cases pass (LANG=en and LANG=zh); the module-page generation test now
  asserts manifest v3 digests for both source files, and status drift covers
  matching, mismatching, unreadable and legacy-v2 manifests.

## [0.127.0] - 2026-11-27

### Added

- **Panel citation issues**: the Wiki tab now derives citation problems
  client-side from the manifest and the index. When the index records line
  counts (v6), `#Lx-Ly` citations past EOF are counted per page and shown as
  an `⚠ N` badge with an accessible title; the list header shows an aggregate
  `out-of-range / unchecked` summary. Ranged citations whose file has no line
  count (non-indexed file or an older index) are counted as unchecked, never
  as broken; filesystem existence checks stay in `repowiki-status`.

### Tests

- 471 cases pass (LANG=en and LANG=zh); the client fixture now carries
  `lines` and asserts the summary plus the `⚠ 1` badge for an `#L11`
  citation on a 10-line file.

## [0.126.0] - 2026-11-27

### Added

- **Citation line-range validation**: index schema v6 records `files[].lines`
  (source line count, computed from the text already read during indexing)
  and the reader stays compatible with v2–v5. `repowiki-status` now parses
  `#Lx-Ly` / `#Lx` / `#Lx-y` citations and checks them against the indexed
  line count: zero/negative starts, reversed ranges and ranges past EOF are
  reported in `citationRangeIssues` with bounded page details, while ranged
  citations to existing files without a known line count (non-indexed files
  or an older index) are counted as `unchecked` instead of guessed. The text
  report adds a `Citation ranges` line and a warning; no manifest means no
  range claim.
- **Shared line counter**: `countSourceLines` in `src/util.js` defines the
  line semantics used by the index (empty file = 0, trailing newline does not
  add a line).

### Tests

- 471 cases pass (LANG=en and LANG=zh); coverage and benchmarks are recorded
  in `docs/coverage.md` and `docs/benchmarks.md`.

## [0.125.0] - 2026-11-27

### Added

- **Module coupling and instability**: new pure `src/coupling.js` computes
  Martin metrics from cross-module static imports — afferent coupling (Ca,
  distinct modules importing a module), efferent coupling (Ce, distinct
  modules it imports) and instability `Ce/(Ca+Ce)`. Same-module edges,
  self-references and files without a module id are ignored; duplicate module
  pairs count once. `repowiki-status` returns `moduleCoupling` (top 10 by
  instability, then total coupling, then name) and renders a
  `Module instability` line next to module dependency hotspots.

### Tests

- 466 cases pass (LANG=en and LANG=zh); coverage and benchmarks are recorded
  in `docs/coverage.md` and `docs/benchmarks.md`.

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
