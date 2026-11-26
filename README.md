# dsh-repowiki

**Symbol-level repository knowledge index + cross-session query** — a local plugin bundle for DeepSeek Harness (DSH).

Indexes the current repository into a symbol-level knowledge base at `.dsh-repowiki/` (Git-shareable). Any session opened on the same directory can query symbols, files, and dependencies without re-reading source code.

English | [中文](README.zh-CN.md)

> Design basis: an internal review of the repository-wiki / knowledge-cards feature porting plan (the review document itself is not part of this repository). Hard constraint: zero third-party dsh plugins; every capability comes from official dsh mechanisms.

## Current stage: Phase 2 + panel slice 1 (v0.4.0)

| Capability | Description |
|---|---|
| `repowiki-index` tool | Deterministically (zero LLM) rebuilds the index: symbol tables, import dependency edges, tech-stack detection; writes `.dsh-repowiki/index.json` |
| `repowiki-cards` tool | Cross-session read-only query: filter by symbol name / kind / path; returns files + symbols and the project tech stack |
| `repowiki-extract` tool | One spawn subagent per file (inherits the session model) generates a knowledge card (purpose, key symbols, pitfalls, related modules) into `.dsh-repowiki/knowledge/<locale>/` |
| `repowiki-generate` tool | Reads only the cards + tech stack, synthesizes theme-grouped Wiki pages (Markdown + optional mermaid) into `.dsh-repowiki/wiki/<locale>/` |
| Project plan | `.dsh-repowiki/repowiki-plan.json` (Git-shared): exclude / includeOnly / maxCardsPerRun / cardComplexityThreshold |
| Repo Wiki panel (web) | A "Repo wiki" sidebar entry (beside the scheduled-tasks icon) opens a workspace page: file/symbol/card/doc counts and latest update, an all/generated/pending filter (pending = listed in `index.json` without a card), search, grid and list views, and a card details pane — data read from `.dsh-repowiki/` via `ctx.remote.workspaceFiles` — plus the generation actions (ADR-0004) |

Roadmap (see the review document):
- Phase 3: commit/diff incremental updates, import/export, manual edits
- Phase 4: session memory distillation, optional semantic index

## Architecture highlights

- **Single bundle, single plugin row, zero npm runtime dependencies, zero build tooling**: plain ES Modules with hand-written `ToolDefinition` (no `@deepseek-ai/dsh-tools` import); installs and runs from a local directory.
- **Assets are plain files**: the index, cards and Wiki land in `<project root>/.dsh-repowiki/` and travel with Git. Location strategy: walk up from the current directory, fall back to the current directory.
- **All file IO goes through `ctx.fs`** (review §9.1) rather than bare node fs, keeping policy and observation consistent.
- **LLM work goes through spawn subagents** (ADR-0003): `ctx.subagents.startActivation({provider:'spawn'})` inherits the session model; structured outputs are constrained by `outputSchema`; cancellation flows through `exec.signal`; Markdown formats are rendered by the plugin, never dictated by the model.
- **`inject: ['fs', 'tools', 'subagents']`**: optional capability seams; if absent in a profile the plugin stays inactive instead of throwing.
- **Symbol extraction is a zero-dependency lightweight parser** (ADR-0001), with no external parsing framework: functions/classes/methods/interfaces/types/imports for JS/TS/Python.

## Client UI (web)

`client.js` is the browser half of the bundle (registered via
`dsh.client.platform: web`): a sidebar entry at `sidebar.panellist` and a
keyed page at `main` (`key: 'repowiki'`). After a workspace is picked, the
page reads `.dsh-repowiki/` through `ctx.remote.workspaceFiles` (authorized
by any member session of that workspace, per `WorkspaceView.sessionIds`) and
renders the panel: counts, all/generated/pending filter, search, grid and
list views, and card details. Generation starts with
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
node --test test/*.test.js
```

## Upgrade operations (dsh is in rc; public seams change often)

- This bundle declares **no** `@deepseek-ai/dsh-*` dependencies (shipped packages resolve from the dsh installation) — the cost is that **every dsh upgrade requires a regression pass**: run `node --test test/*.test.js`, plus a minimal in-session smoke of `repowiki-index` and `repowiki-cards`.
- `engines.dsh` is only a lower bound, not a compatibility proof.
- `index.json` carries `schemaVersion`; on version mismatch the read side degrades to a "rebuild" prompt instead of crashing.

## Directory layout

```
index.js               Plugin entry (apply + inject: fs/tools/subagents)
cordis.patch.yml       Loader patch (inserts the plugin row)
src/schema.js          Constants and domain conventions (single source)
src/symbols.js         Zero-dependency symbol extraction (JS/TS/Python)
src/deps.js            import/require dependency edge extraction
src/stack.js           Tech-stack detection (npm/pip/go/cargo)
src/assets.js          Asset location and IO (ctx.fs injected)
src/indexer.js         Index orchestration (walk + extract + edges + assemble)
src/card-schema.js     Card / Wiki outputSchema for subagents
src/prompts.js         Subagent prompt construction
src/render.js          Card / Wiki Markdown rendering
src/knowledge.js       knowledge + wiki directory read/write, frontmatter
src/config.js          repowiki-plan.json reading and candidate filtering
src/spawn.js           spawn subagent invocation wrapper
src/tool-index.js      repowiki-index tool
src/tool-cards.js      repowiki-cards tool
src/tool-extract.js    repowiki-extract tool
src/tool-generate.js   repowiki-generate tool
test/                  Unit and integration tests (52 cases)
docs/adr/              Architecture decision records (Chinese)
docs/checkpoints/      Phase checkpoints (Chinese)
```

## License

MIT (see [LICENSE](LICENSE)).
