# Phase 1 checkpoint

- Date: 2026-11-25
- Status: code, tests, install activation complete; in-session tool calls pending verification in a new session

## Goal

Review §6.4 Phase 1: bundle skeleton + index service + read-only query tool,
proving the loop "host indexing → write cwd assets → tool reads them in a new
session".

## Done

- Phase 0 probes (the only prerequisite gate): V1 ctx.fs, V2 spawn, V3 inject
  keys all passed; plugin_manager available.
- Single bundle `dsh-repowiki`: package.json / cordis.patch.yml /
  locale (en,zh) / icon.svg / index.js (apply + inject:['fs','tools']).
- Index pipeline: src/{schema,symbols,deps,stack,assets,indexer}.js —
  zero dependencies, zero LLM, fs injected as pure functions.
- Two model tools: repowiki-index (rebuild), repowiki-cards (query, with a
  no-index fallback prompt and a presentResult search card).
- Unit + integration tests: 32/32 green (node:test, zero dependencies).
- Docs: README (en/zh), LICENSE, .gitignore, ADR-0001/0002 (en/zh), this
  checkpoint.

## Install verification record (runtime facts)

1. First `install_bundle` **failed**: `JsonSchemaError ... required is not
   supported on type "string"` — the hand-written ToolDefinition's
   output.schema mistakenly used the per-property `required: true` DSL from
   parameters; the correct form is the JsonSchemaNode top-level
   `required: string[]`. Both tools' output.schema were fixed and the lesson
   recorded in ADR-0002.
2. After the fix, reinstall returned **`application: "applied"`** with zero
   warnings; a subagent confirmed the plugin fiber state is `active` and the
   profile node_modules contains repowiki.
3. **In-session tool calls not yet verified**: the tool list is snapshotted at
   session start, and the plugin activated mid-session for both this session
   and the verification subsession. A **new session** (page refresh or a new
   conversation) is needed to call repowiki-index / repowiki-cards and finish
   the last step.

## Root cause analysis (added 2026-11-25: why subagents cannot substitute for a new session)

Two spawn-subagent verification runs both reported the tools as invisible.
Findings:

- `dsh-tools`' `register()` under a fiber ctx (scope=undefined) writes to the
  **global layer**, and `view(scope)` is inherited by every agent — the
  registration path is sound.
- `dsh-agent-loop` does call `tools.resolve()` dynamically at every model step.
- But per subagent.zh.md, a spawn subagent **joins the parent's active
  composition** (omitting `agentPreset` inherits the parent's assembly). A
  subagent therefore inherits the **parent session's (this session's)
  startup-snapshotted tool table** rather than reassembling from the global
  registry — the plugin was not yet installed when this session started, so
  subagents necessarily cannot see repowiki-*.
- This session itself is equally bound by the startup snapshot (the plugin was
  installed and activated mid-session).
- Neither the `subagent` nor the `workflow` tool exposes an `agentPreset`
  parameter, so no "independent-preset" subagent can be constructed from this
  session as a workaround.

**Session-level verification therefore requires a genuinely new session**
(refresh the page or start a new conversation). This is not a plugin defect:
`fiberPhase: active` + `application: applied` + 32 tests (including the
apply→register→execute full chain) constitute the registration and execution
evidence chain.

## Decisions

- ADR-0001: zero-dependency symbol parser (user-approved, replacing
  外部解析框架).
- ADR-0002: hand-written ToolDefinition (zero external imports).
- Phase 1 declares no plugin Config and no config file: every behavior is a
  default or a tool parameter; the wiki-plan.yaml config system lands in
  Phase 2.
- Phase 1 inserts a single plugin row (repowiki); the four plugin entries in
  review §6.1 arrive with Phase 2 (then reassess cross-plugin ctx services vs
  intra-package ES imports).

## Next steps

1. In a new session, call repowiki-index (index this repository itself) and
   repowiki-cards (query='extract') to complete session-level verification.
2. Initialize git and make the first commit (done: `ffc49fe`).
3. Open Phase 2: repowiki-extract (spawn subagent + outputSchema card
   extraction), repowiki-generate (Wiki synthesis), Config/wiki-plan.yaml
   config system.
