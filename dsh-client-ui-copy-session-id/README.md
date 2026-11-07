# dsh-client-ui-copy-session-id

English | [中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI
plugin that adds a **Copy Session ID** row to every Session's right-click /
"..." menu in the left sidebar.

The row registers into the `sidebar.workspaces.session.menu.item` list slot at
`order: 500` — directly after the shipped Pin (100), Rename (200), Fork (300),
and Archive (400) rows, opening a new group with a separator. Activating it
writes the row's full Session id to the clipboard and dismisses the menu.

## Install

From the **Plugins** page in the DSH desktop or web GUI, choose **Add plugin**
and enter this directory's absolute path (the profile installs it as a
`link:` dependency), or from a checkout:

```sh
dsh plugin --profile <name> add link:/path/to/dsh-client-ui-copy-session-id
```

The `desktop` profile is managed exclusively by the Electron application —
use the GUI for that one. Refresh the page (or restart the desktop app) after
installing so the browser half loads.

## Layout

- `package.json` — `dsh.bundle.patch` roster declaration plus the `dsh.client`
  browser-half declaration (`platform: 'web'`).
- `cordis.patch.yml` — inserts the `ui-copy-session-id` plugin row.
- `lib/index.js` — empty host half; keeps the plugin on the host roster.
- `lib/client.js` — hand-written lazy-CJS browser bundle
  (`window.__ModuleLoader__.load({ id, factory })`); no build step.
- `tests/smoke.mjs` — runs the bundle through a stubbed Module Loader, Cordis
  client context, and clipboard; asserts the row copies the id and closes the
  menu. Run with `npm test`.

## Notes

- Externals (`react`, `@deepseek-ai/dsh-client-ui-primitives`) resolve against
  the shell's frozen platform module table; they must not be bundled or listed
  as runtime dependencies.
- The Clipboard API is used when available, with a hidden-textarea fallback.
