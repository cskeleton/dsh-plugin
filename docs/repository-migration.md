# Plugin collection repository migration

Date: 2026-11-07 (Asia/Shanghai)

## Scope and invariants

Consolidate four DSH plugins into one Git repository while keeping their existing top-level directories, package identities, versions, installation paths and release boundaries. Do not add a `plugins/` layer, package-manager workspace, combined lockfile, common runtime framework or new release archives. Do not edit real DSH profiles.

## History provenance

| Source | Original HEAD | Import policy |
| --- | --- | --- |
| `cskeleton/dsh-gc-duolink`, `master` | `27496e01c14586441cd0c4edfee9acdf61c4f6ec` | Continue existing history; move tracked files under `dsh-gc-duolink/` in a new commit |
| Local Conversation Export, `master` | `1c81ecbb1f21abace0efb36ae8656f61b4db636a` | Non-squashed subtree import under `dsh-conversation-export/`; retain both original commits, including `70158d6` |
| Copy Session ID | No original Git repository | Import maintained files under `dsh-client-ui-copy-session-id/` |
| zvec-grep | No original Git repository | Import maintained files under `dsh-zvec-grep/`, excluding local benchmark data and dependencies |

Existing DuoLink history contains 26 commits. No existing commits are rewritten. Historical tags keep their original objects and single-plugin source layouts:

- `v0.5.0` resolves to commit `dd67a2c86023ff5a3c202b1bb2c7a2369051f41a`.
- `v0.6.1-beta` is annotated; its original tag object is `365a62077c5f4002202184f6b98a1e519e56c256`, resolving to commit `1e496c8f55b91ee2efd99b9c824ba52c1dc919eb`.

Future tags use `<package-name>@<version>`. Repository maintenance alone must not bump plugin versions or regenerate releases.

## Local state preservation

A complete copy of the original directory tree, Git bundles, a binary diff of DuoLink's seven modified tracked files, a file/hash/symlink manifest and GitHub metadata were stored outside this repository before cutover. The sibling backup directory is named `dsh-plugin-migration-backup-20261107`; its local `README.md` records exact recovery locations.

The seven DuoLink business changes are intentionally **not** part of migration commits or the push. They remain uncommitted locally after cutover. Local dependencies, build output and release archives remain at their existing paths. Nested `.git` directories are retained in external backup storage, not deleted.

Local zvec benchmark data is moved to external backup storage without publishing third-party checkouts, caches or generated samples. The root ignore rules also exclude `dsh-zvec-grep/benchmarks/` if restored later. Semantic indexes remain local and ignored.

## Git and package boundaries

- The parent directory owns `.git`; all four plugin directories resolve to this same repository root.
- Root ignore rules cover dependencies, pnpm stores, semantic indexes, credentials, logs and local benchmark data.
- Do **not** ignore `lib/` globally. DuoLink builds its `lib/`; the other plugins maintain their implementations there.
- Per-plugin lockfiles and commands remain independent. Run commands with a plugin working directory.
- No root installable bundle, no gitlinks/submodules and no force push.

## Verification procedure

Before cutover/push:

1. Verify both Git bundles and compare complete backup hashes and symlink targets without traversing dependency symlinks.
2. Verify both original HEADs are ancestors of the collection HEAD; compare original plugin trees to imported trees and allow only documented README updates.
3. Run Conversation Export tests, Copy Session ID smoke and zvec bundle tests.
4. Run DuoLink typecheck, build, all Vitest unit specs and built contracts. Runtime-dependent installed-host checks are separate and require their documented prerequisites.
5. Inspect tracked paths for generated/private data, candidate secrets, broken local Markdown links and submodule modes.
6. Compare plugin manifests/lockfiles and real profile installation links with the baseline.

After cutover/push:

1. Verify all plugin directories resolve to the parent Git root and original nested Git metadata exists in backup storage.
2. Compare DuoLink's uncommitted binary diff to the original patch, accounting only for the new path prefix.
3. Confirm normal push ancestry and equality of local/remote `master`.
4. Compare GitHub repository identity, release IDs, tag objects, asset IDs/sizes/digests and downloaded release bytes before/after rename. Verify old release download URLs redirect and return the same content.
5. Record actual results and explicit runtime-verification limits below. Unit/contract tests must not be described as authenticated GUI installation proof.

## GitHub transition

Rename the existing `cskeleton/dsh-gc-duolink` repository to `cskeleton/dsh-plugin`, preserving repository identity, `master`, visibility, releases and assets. Update current README links and local `origin`; historical validation documents remain historical. Do not recreate a repository under the old name while redirects are needed.

## Rollback boundaries

Before push, restore the externally backed-up nested Git metadata and original working files if needed. The unchanged plugin paths keep development installation links stable. Keep the parent Git metadata in external storage during rollback rather than deleting it.

After push, prefer additive repair/revert commits; do not force-rewrite published history. Treat a GitHub rename reversal as an independent action and verify download redirects again. Backups are local recovery material, not part of the public repository, and should not be removed automatically.

## Execution results

Observed in the isolated assembly on 2026-11-07, with Node 26.12.1, pnpm 10.33.2 and the existing per-plugin dependency trees copied without changing lockfiles:

- Complete backup comparison: PASS, 17,251 regular files/symlinks, without following cyclic pnpm symlinks. Both Git bundles verified complete.
- Conversation Export: PASS, 16 tests including image rendering.
- Copy Session ID: PASS, menu/clipboard smoke.
- zvec-grep: PASS, 7 bundle/guidance/settings tests.
- DuoLink: typecheck and build PASS; 12 npm-SDK-compatible Vitest files / 165 tests PASS; 3 built contracts PASS.
- Full `vitest run`: 6 additional host-internal test files cannot load missing `dsh-agent-loop`, `dsh-agent-loop-testkit` or `dsh-storage` packages. Reproduced the missing dependency in the original pre-migration snapshot. This migration does not add those dependencies or change test semantics.
- Declared DuoLink `pnpm test`: client/scope and initial-model unit checks pass, then the installed-host proof fails in phase `seed` with `cannot append outside a SessionStore`. The identical failure was reproduced using byte-identical proof/fixture files from the original snapshot against installed CLI 0.2.2-rc.1. The later installed-plugin phase is not reached. This is an existing fixture/current-host incompatibility, not evidence of a passing installed-host test.
- No real-profile installation changes, authenticated GUI interaction, new release archives or plugin version changes are included. Existing development paths and profile symlinks are checked during cutover; this must not be described as a full GUI runtime verification.

Cutover and remote identity/release verification are recorded in the local migration backup. These checks do not waive the two pre-existing test-environment limitations above.
