# Changelog

English | [中文摘要](CHANGELOG.zh-CN.md)

All notable changes to this project are documented in this file. Versions
follow the phase plan in the README roadmap.

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
