# Verification — 2026-10-25

## Environment

- Current Desktop: DSH 0.2.1-rc.3, packaged in application ASAR.
- Existing GUI: `http://127.0.0.1:52113` (authenticated owner window).
- Existing zvec-grep: 0.2.2; shared daemon PID 7332, `http://127.0.0.1:7999/mcp`, agent toolset.
- No model changes, model downloads or new project indexes were performed.

## Package checks

`node --test tests/bundle.test.mjs`: **4 passed, 0 failed**, exit 0.

Checks cover package entry/export, one native MCP insertion, isolation from unrelated configuration, exact stdio invocation, fail-on-startup-error, timeout and stable public tool name. No runtime dependency or browser build is required.

## Real Host bridge smoke

Executed [host smoke](<tests/host-smoke.cjs>) with `ELECTRON_RUN_AS_NODE=1`, using the **actual Desktop ASAR MCP client**, and the already-indexed sample workspace from the referenced Codex thread.

Result, exit 0:

```text
Registered: mcp__zvec_grep__zvec_grep_search
Search: relevant source returned
Disable: tool registry empty
Re-enable: identical tools restored
```

This uses real stdio transport and real zg search, with a minimal test registry/lifetime stub. It proves bridge schema, registration, query and cleanup/re-registration, **not browser click automation**. Optional resources and system-prompt services are absent in that stub.

After the lifecycle test, `zg server status --check-ready` still reported ready with **the same PID 7332**. Disposing DSH's bridge did not stop the shared daemon.

## Current GUI installation

The user completed installation and enabling in the existing authenticated Plugins page. A subsequent read confirmed:

- Desktop profile dependency: `dsh-zvec-grep` → `link:/Users/gc/Dev/MyProject/dsh-plugin/dsh-zvec-grep`.
- `dsh.profile.bundles` includes `dsh-zvec-grep`.
- Desktop `node_modules/dsh-zvec-grep` resolves to this independent directory.
- No direct modification of the managed Desktop profile was performed by this implementation.

A **real tool call from the current DSH session** subsequently searched the existing sample workspace for “MCP 的 stdio 桥接层在哪里把请求转发给本地服务？”. It returned `freshness: fresh`, including:

1. `src/mcp/stdio-bridge.ts:196–229`
2. `src/mcp/stdio-bridge.ts:28–170`
3. `docs/06-server.md:201–223`

That verification used `autoUpdate:false`; no index creation/rebuild was requested.

## Explicit boundaries

- The package manager's live `fiberPhase` / application response and GUI on/off clicks were not independently captured: the external HTTP client correctly received 401, and no authenticated browser automation tool was available. Authentication was not bypassed. Installation/enabling was human-confirmed and persistent profile state was independently checked.
- Actual bridge disable/re-enable behavior was independently tested as above; final user GUI state is enabled.
- Other workspaces still need user-authorized `zg index` before semantic search.
