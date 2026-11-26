# Changelog

All notable changes to this project are documented in this file. Versions
follow the phase plan in the README roadmap.

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
