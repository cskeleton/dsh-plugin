# DSH plugin collection

## Repository boundaries

- This is one Git repository with independent plugins in the top-level `dsh-*` directories.
- Run package commands from the relevant plugin directory. Keep per-plugin lockfiles and build conventions; there is no root pnpm workspace.
- Preserve plugin names, configuration/storage/protocol namespaces, exports and independent versions.
- Read and follow each plugin's local instructions. In particular, DuoLink's `lib/` is generated, while the other plugins' `lib/` directories contain maintained implementation files.

## Changes and verification

- Keep repository maintenance separate from functional plugin changes.
- Do not change versions, create release archives, publish releases or modify real DSH profiles unless requested.
- Never overwrite different release bytes under an existing version. Historical release tags and assets are immutable.
- Use the plugin's existing tests, typecheck and build commands. Host/browser integration checks require their documented prerequisites and disposable profiles; do not claim unit checks prove GUI installation.
- Future release tags use `<package-name>@<version>`; historical `v0.5.0` and `v0.6.1-beta` remain unchanged.

## Local data

- Do not commit dependencies, local semantic indexes, profile/session data, credentials, generated artifacts or third-party benchmark workspaces.
- Do not add a global `lib/` ignore rule. Retain plugin-specific build ignores.
- See `docs/repository-migration.md` for history provenance and the migration's local backup convention.
- Do not create or switch branches/worktrees unless explicitly requested.

## License

Plugin manifests currently declare MIT. DuoLink carries its existing license text. Do not silently relicense imported third-party code or benchmark data.
