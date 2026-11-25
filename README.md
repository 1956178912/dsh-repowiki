# dsh-repowiki

**Symbol-level repository knowledge index + cross-session query** — a local plugin bundle for DeepSeek Harness (DSH).

Indexes the current repository into a symbol-level knowledge base at `.dsh-repowiki/` (Git-shareable). Any session opened on the same directory can query symbols, files, and dependencies without re-reading source code.

English | [中文](README.zh-CN.md)

> Design basis: an internal review of the repository-wiki / knowledge-cards feature porting plan (the review document itself is not part of this repository). Hard constraint: zero third-party dsh plugins; every capability comes from official dsh mechanisms.

## Current stage: Phase 1

| Capability | Description |
|---|---|
| `repowiki-index` tool | Deterministically (zero LLM) rebuilds the index: symbol tables, import dependency edges, tech-stack detection; writes `.dsh-repowiki/index.json` |
| `repowiki-cards` tool | Cross-session read-only query: filter by symbol name / kind / path; returns files + symbols and the project tech stack |

Roadmap (see the review document):
- Phase 2: `repowiki-extract` (spawn subagent extracts cards) + `repowiki-generate` (Wiki synthesis)
- Phase 3: commit/diff incremental updates, import/export, manual edits
- Phase 4: session memory distillation, optional semantic index, optional UI triggers

## Architecture highlights

- **Single bundle, single plugin row, zero npm runtime dependencies, zero build tooling**: plain ES Modules with hand-written `ToolDefinition` (no `@deepseek-ai/dsh-tools` import); installs and runs from a local directory.
- **Assets are plain files**: the index lands in `<project root>/.dsh-repowiki/index.json` and travels with Git. Location strategy: walk up from the current directory, fall back to the current directory.
- **All file IO goes through `ctx.fs`** (review §9.1) rather than bare node fs, keeping policy and observation consistent.
- **`inject: ['fs', 'tools']`**: `ctx.fs` is an optional capability seam; if absent in a profile the plugin stays inactive instead of throwing.
- **Symbol extraction is a zero-dependency lightweight parser** (ADR-0001), with no external parsing framework: functions/classes/methods/interfaces/types/imports for JS/TS/Python.

## Install

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
index.js               Plugin entry (apply + inject)
cordis.patch.yml       Loader patch (inserts the plugin row)
src/schema.js          Constants and domain conventions (single source)
src/symbols.js         Zero-dependency symbol extraction (JS/TS/Python)
src/deps.js            import/require dependency edge extraction
src/stack.js           Tech-stack detection (npm/pip/go/cargo)
src/assets.js          Asset location and IO (ctx.fs injected)
src/indexer.js         Index orchestration (walk + extract + edges + assemble)
src/tool-index.js      repowiki-index tool
src/tool-cards.js      repowiki-cards tool
test/                  Unit and integration tests (32 cases)
docs/adr/              Architecture decision records (English default + .zh)
docs/checkpoints/      Phase checkpoints (English default + .zh)
```

## License

MIT (see [LICENSE](LICENSE)).
