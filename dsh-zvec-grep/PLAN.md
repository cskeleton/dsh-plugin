# zvec-grep GUI Plugin Execution Plan

## Goal

Ship an independent DSH plugin bundle that connects the existing local zvec-grep installation and can be enabled/disabled using the existing GUI. Load it into the running Desktop profile and verify search and lifecycle.

## Context

The referenced Codex thread ends with a validated stdio MCP configuration; it did not modify DSH. This machine has zvec-grep 0.2.2, an existing shared daemon and local Jina CPU embeddings. DSH Desktop 0.2.1-rc.3 ships `@deepseek-ai/dsh-mcp-client`, including tool discovery, schema-driven configuration, reconnect, instruction injection and disposal. Bundles contribute loader rows via `dsh.bundle.patch`.

## Constraints

- Do not modify DSH core, model defaults, Codex/Claude configuration or unrelated plugins.
- Do not start a replacement GUI or kill the shared zg daemon on disable.
- Do not auto-index projects or grant blanket tool permissions.
- Use absolute Homebrew executable paths for this machine; edit bundle config or profile overrides for other installations. Native GUI provides toggles, not an automatic parameter form.
- No redundant custom UI or MCP implementation; no runtime dependencies or build pipeline.

## Implementation

### Task 1: Independent bundle

**Objective:** A locally installable `dsh-zvec-grep` package.

**Relevant files:** `package.json`, `cordis.patch.yml`, `lib/index.js`, `README.md`.

**Implementation:** Insert one native MCP row `mcp-zvec-grep`, namespace `zvec_grep`, command `/opt/homebrew/bin/node`, args `--liftoff-only /opt/homebrew/bin/zg server --stdio`, 600000 ms tool timeout. Use fail-on-startup-error so failed connection is not reported as successful activation. Reuse native configuration and enable switch; no browser bundle. Package entry is empty, matching DSH configuration-only bundles.

**Depends on:** Existing zg installation and DSH MCP provider.

**Verification:** Manifest/patch contract checks, shipped DSH Config validation, real MCP discovery/search.

**Done when:** Loader sees the unique row without duplicate namespace or unrelated changes.

### Task 2: Install and verify GUI lifecycle

**Objective:** Current Desktop profile loads the bundle using its plugin manager.

**Implementation:** Use the current GUI authenticated plugin interface; do not hand-edit generated configuration or invoke a second host. Verify enable → tool available → disable → tool absent → enable → tool restored. Leave enabled. Confirm the shared daemon survives disabling.

**Depends on:** Task 1.

**Verification:** Existing URL `http://127.0.0.1:52113`, plugin inventory/entry status and real search; record unavailable browser verification explicitly.

**Done when:** Installation persists and final enabled status is verified, or a concrete user action is documented if authentication prevents installation.

## Integration / Final Verification

Run tests, validate the row with the shipped MCP schema, discover tools and search an already-indexed fixture. Verify persisted installation and toggles through the current GUI. Do not claim new projects are indexed.

## Acceptance Criteria

- Independent directory, no DSH source changes.
- Native GUI control with an identifiable zvec entry.
- `mcp__zvec_grep__zvec_grep_search` available when enabled.
- Disable disconnects this bridge only; shared model/index/daemon are preserved.
- README explains indexing, paths, timeout, permissions, toggles and uninstall.

## Handoff Notes

Desktop profile is app-managed. Use GUI installation, not `dsh plugin --profile desktop`. Authentication is required; never put credentials in scripts, logs or documents.
