# Changelog

All notable changes to this project are documented in this file. Versions
follow the phase plan in the README roadmap.

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
