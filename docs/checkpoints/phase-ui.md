# Phase B checkpoint (UI trigger)

- Date: 2026-11-26
- Status: client plugin written; installation activation pending, page rendering pending a GUI refresh

## Goal

Add a UI entry beside the "自动化任务" (scheduled tasks) area: click to pick a
project directory and run index / extract / generate.

## Done

- Client module `client.js` registers two seats (ADR-0004):
  - `sidebar.panellist` — a Repo wiki icon entry at `order: 20` (same level as
    the task-manager icon);
  - `main` keyed `repowiki` — a standalone page with a workspace dropdown
    (subscribed to `ctx.workspaces`) and four actions (build index / extract
    cards / generate wiki / generate everything).
- The selection unit is the **workspace** (WorkspaceView: workspaceId/path/
  title), not a bare directory: users organize projects as workspaces, and the
  dropdown reuses that.
- Generation actions open a new session via
  `ctx.uiWorkspace.startSession(workspaceId, { prompt, whenDraftExists:
  'append' })`; the new session's cwd is the workspace directory, and the
  tools anchor to it by default (artifacts land in that workspace's
  `.dsh-repowiki/`).
- Icon is a hand-drawn SVG (practices rule: never require
  `dsh-client-ui-primitives`); styling uses `var(--dsw-alias-*, <literal>)`
  fallback chains because no Theme inspection is available this session.
- `package.json` gained the `dsh.client` section (platform `web`,
  `immediately: true`) and the `./client` export; English/Chinese UI copy via
  a client locale namespace (`repowiki.ui`).

## Not verified yet (honest disclosure)

- **Activation**: the bundle needs remove+install for the client module to be
  picked up; page rendering needs a GUI refresh. Neither has been observed
  through the connected page (this session has no browser control).
- `--dsw-alias-*` token names are unverified (no cordis_inspect Theme query);
  fallback literals cover the failure mode.
- The sidebar icon → main page navigation association assumes the framework's
  documented `key`-based linking (shipped plugins pair `sidebar.panellist`
  with `main` the same way); page-level navigation has not been observed.

## Next steps

1. remove + install v0.3.0, refresh the GUI, and confirm: the Repo wiki icon
   appears in the sidebar, the page renders, the picker opens, and a generate
   action starts a session that runs the tools against the picked project.
2. Fix observed visual/behavioral defects in the same plugin.
