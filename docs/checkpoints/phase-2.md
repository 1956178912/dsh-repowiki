# Phase 2 checkpoint

- Date: 2026-11-26
- Status: feature layer complete (tools registered and activated); in-session smoke pending a new session

## Goal

Review §6.4 Phase 2: `repowiki-extract` (subagent + outputSchema card
extraction) + `repowiki-generate` (Wiki synthesis) + project-level plan file
+ the first model-routing layer.

## Done

- `repowiki-extract`: reads index -> deterministic filtering (symbol-count
  threshold, path prefixes, plan file) -> one spawn subagent per file
  (`outputSchema` card contract) -> plugin renders uniform Markdown ->
  writes `knowledge/{locale}/{slug}.md`. Existing cards are skipped unless
  `force`; `maxCards` caps the run; empty-slug paths are rejected rather than
  overwriting each other.
- `repowiki-generate`: reads only cards + tech stack -> one spawn subagent
  (page-group contract) -> plugin renders Markdown with optional mermaid ->
  writes `wiki/{locale}/{slug}.md`.
- Project-level config `.dsh-repowiki/repowiki-plan.json`: exclude /
  includeOnly / maxCardsPerRun / cardComplexityThreshold / locales /
  maxResultLimit; missing file = defaults, corrupt file = broken + defaults
  (never throws).
- Model routing: inheriting the session default only (ADR-0003); no plugin
  Config schema yet (zero-import principle).
- `inject` extended to `['fs', 'tools', 'subagents']`; `apply` now registers
  four tools.
- Tests: 52/52 green (node:test) — 10 new Phase 2 cases cover rendering,
  prompts, knowledge read/write round-trips, and the plan/candidates layer.
- Install verification: remove + install of v0.2.0 returned
  `application: "applied"` with zero warnings.

## Not verified (honest disclosure)

- ~~In-session smoke~~ → **completed by the user in a new session around
  2026-11-26 15:00**: ran index → extract (paths=["src/"]) → generate on
  this repository itself.
  - Index: 29 files / 93 symbols / 41 edges, projectName=dsh-repowiki ✓
  - Cards: 10 files under `knowledge/zh/` (all src modules); frontmatter
    structured, tags and Chinese summaries accurate ("zero-LLM /
    deterministic / pure functions / ctx.fs injection" traits were all
    correctly inferred from the code) ✓
  - Wiki: 4 pages under `wiki/zh/` (project-overview / indexing-and-parsing
    / prompts-and-rendering / assets-and-config), all with mermaid ✓
- Model-override layer is intentionally absent (ADR-0003).

## Decisions

- ADR-0003: spawn subagent channel, single-layer model routing, plugin-owned
  Markdown rendering, JSON plan file.

## Next steps

1. New-session smoke: run `repowiki-extract` on this repository itself, then
   `repowiki-generate`, and inspect the generated cards/Wiki.
2. Phase B (UI): sidebar entry + independent page (project picker, generate
   buttons), per the UI route confirmed with the user (sidebar.panellist +
   main keyed view, since ui-schedule's TaskManagerPage exposes no
   third-party slot).
