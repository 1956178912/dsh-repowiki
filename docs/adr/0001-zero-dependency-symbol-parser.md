# ADR-0001: Zero-dependency lightweight parser for symbol extraction (no 外部解析框架)

- Date: 2026-11-25
- Status: Accepted (Phase 1)

## Context

The review revision (§6.3) designed the index service to run 外部解析框架 WASM in
the host process for AST parsing. But §8.3 lists "外部解析框架 WASM loading and
footprint in the Electron host" as unverified; vendoring per-language grammars
also introduces network downloads and per-item license review. The user approved
the "zero-dependency parser" route (confirmed during Phase 1 planning).

## Options

- **A. Zero-dependency hand-written parser**: line-level keyword matching plus
  brace/indent block matching, covering the mainstream definition forms of
  JS/TS/Python.
- **B. 外部解析框架 WASM (vendored)**: precise parsing, but requires prototyping
  Electron host loading and managing grammar binaries plus their licenses.

## Decision

Option A.

## Rationale

1. Removes the largest technical risk explicitly flagged by the plan
   (WASM in the Electron host was unverified).
2. The bundle stays zero-npm-runtime-dependency and zero-vendored-binary:
   install from a local directory and run.
3. For the stated goals (symbol table + cross references) the lightweight
   parser is accurate enough on mainstream languages; 32 unit tests cover the
   core forms of functions/classes/methods/interfaces/types/imports.
4. Extraction lives in standalone modules (src/symbols.js, src/deps.js); if
   外部解析框架 proves viable later, the parsing layer can be replaced without
   touching the tool or asset contracts.

## Consequences and limitations (disclosed honestly)

- Coverage of edge syntax (decorators, JSX blocks, TypeScript parameter
  properties) is limited; unparseable forms are skipped silently, never
  producing wrong symbols (index usability outranks coverage).
- `endLine` is a conservative estimate (brace balancing / indentation), not an
  exact AST boundary; Phase 3 change propagation is designed as
  "file-level primary, symbol-level reference table auxiliary" and does not
  depend on exact `endLine`.

## Rollback

Delete src/symbols.js and src/deps.js and reimplement the same exports
(extractSymbols/extractImports signatures unchanged) with 外部解析框架; update
the tests accordingly.
