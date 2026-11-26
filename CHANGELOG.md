# Changelog

All notable changes to this project are documented in this file. Versions
follow the phase plan in the README roadmap.

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
