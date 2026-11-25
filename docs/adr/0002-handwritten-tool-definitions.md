# ADR-0002: Hand-written ToolDefinition without importing @deepseek-ai/dsh-tools

- Date: 2026-11-25
- Status: Accepted (Phase 1)

## Context

Official tool plugins (e.g. dsh-tool-todo) build their tool definitions with
`import { defineTool } from '@deepseek-ai/dsh-tools'`. That package ships with
the dsh installation and resolves from the host; but for a local bundle with no
declared dependency, whether Node module resolution locates it after
`install_bundle` is an unverified boundary (review §10.3-1 notes that shipped
packages resolving from the dsh installation is the official decoupling design,
at the cost of a regression pass per upgrade).

## Options

- **A. Hand-written ToolDefinition objects** passed straight to
  `ctx.tools.register`: declare `parameters` and `output.schema` in the
  dsh-tools DSL (ValueSchemaSpec) and validate arguments ourselves.
- **B. Import defineTool**: consistent with official packages, but adds an
  implicit dependency on the resolution path.

## Decision

Option A.

## Rationale

1. The ToolDefinition field contract is fully public in
   `docs/subsystems/tools.zh.md`; hand-writing has no information gap, and the
   dsh-tool-todo source provided an exact form of reference.
2. The bundle has truly zero external imports (only node built-ins and
   intra-package relative imports): local-directory installation is maximally
   deterministic and immune to npm resolution changes.
3. defineTool's added value is parameter type inference and automatic
   validation; Phase 1 tools take few, simple arguments, so self-validation
   cost is acceptable.

## Consequences

- If dsh changes the ToolDefinition contract (adds a required field), the
  hand-written definitions fail at registration — covered by the upgrade
  regression discipline of "run a repowiki-index/repowiki-cards smoke after
  install" (see README upgrade operations).
- Argument validation logic lives inside the tools (two tools this phase,
  acceptable; revisit defineTool when the tool count grows).

## Runtime lesson (measured during install verification, 2026-11-25)

`ctx.tools.register` runs `assertSupportedJsonSchema` (the JsonSchemaNode
subset) directly on **hand-written** `output.schema`: `required` must be a
**top-level array** (`required: ['root', ...]`), not the per-property
`required: true` DSL used for `parameters`. When using `defineTool`, official
packages let it compile both forms; copying their source form verbatim
triggers `JsonSchemaError: ... required is not supported on type "string"` and
the whole plugin row fails to activate. Both tools in this bundle were fixed
to the JsonSchemaNode form.

## Rollback

Rewrite the object literals in each tool-*.js as `defineTool({...})` calls and
declare the peer dependency in package.json; the contracts stay unchanged.
