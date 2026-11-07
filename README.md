# DSH Plugins

English | [中文](<README.zh.md>)

Independent plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), maintained in one source repository. Each plugin keeps its own package identity, version, dependencies, tests and installation entry. This repository is **not** an all-in-one installable bundle.

## Plugins

| Plugin | Purpose | Compatibility |
| --- | --- | --- |
| [DuoLink](<dsh-gc-duolink/README.md>) | Bidirectional Session messaging, linking, wake grants and spawning utilities | See the plugin's SDK/peer requirements and release notes |
| [Conversation Export](<dsh-conversation-export/README.md>) | Export conversations to Markdown, HTML and PNG | DSH >= 0.2.1-rc.3 |
| [Copy Session ID](<dsh-client-ui-copy-session-id/README.md>) | Copy a Session ID from the sidebar menu | DSH >= 0.2.0-rc.1 |
| [zvec-grep](<dsh-zvec-grep/README.md>) | Local semantic search bridge and query guidance | DSH >= 0.2.1-rc.3; separately installed `zg` and local model/index configuration |

## Install an individual plugin

Read that plugin's instructions first. For a local directory installation, select the **plugin subdirectory**, not this repository root, in DSH's Plugins GUI. DuoLink must be built before a source-directory installation. The Desktop profile is application-managed; use its supported GUI and documented procedures rather than changing a running profile externally.

```text
/path/to/dsh-plugin/dsh-conversation-export
/path/to/dsh-plugin/dsh-client-ui-copy-session-id
/path/to/dsh-plugin/dsh-zvec-grep
/path/to/dsh-plugin/dsh-gc-duolink
```

Existing development installations can keep the same paths: consolidation does not add a `plugins/` directory or rename packages. Moving the checkout elsewhere is a separate operation requiring link updates.

DuoLink's historical downloads remain under [Releases](https://github.com/cskeleton/dsh-plugin/releases). The other three plugins currently have source-directory installation instructions, not newly published release archives.

## Development

There is no root package manager workspace. Install dependencies and run commands **inside each plugin**; existing per-plugin lockfiles remain authoritative. Use pnpm 10.33.2 where specified by the plugin.

```sh
# Run from the repository root.
(cd dsh-gc-duolink && pnpm install --frozen-lockfile)
(cd dsh-gc-duolink && env -u DSH_SOURCE_ROOT pnpm typecheck)
(cd dsh-gc-duolink && env -u DSH_SOURCE_ROOT pnpm build)
(cd dsh-gc-duolink && env -u DSH_SOURCE_ROOT pnpm test)

(cd dsh-conversation-export && pnpm install --frozen-lockfile && pnpm test)
(cd dsh-client-ui-copy-session-id && pnpm test)
(cd dsh-zvec-grep && pnpm install --frozen-lockfile --ignore-scripts && pnpm test)
```

DuoLink's full test command includes installed-host checks. See its README for runtime prerequisites and additional integration checks. The smaller plugins' unit/smoke checks are not authenticated GUI installation tests.

Only DuoLink's `lib/` is generated and ignored; the other plugins maintain implementation files in their `lib/` directories. Dependencies, semantic indexes and local benchmark workspaces are not source files.

## Releases and history

- Versions and install archives remain independent per plugin. Repository maintenance does not automatically bump versions or publish packages.
- New release tags use `<package-name>@<version>`.
- Existing `v0.5.0` and `v0.6.1-beta` tags/releases retain their original identities and historical single-plugin layouts.
- This repository continues the former `cskeleton/dsh-gc-duolink` repository. Conversation Export's two original commits are retained through a non-squashed subtree import.
- See [migration notes](<docs/repository-migration.md>) for provenance, verification and rollback boundaries.

## License

The plugin manifests declare MIT; DuoLink's existing [license text](<dsh-gc-duolink/LICENSE>) is retained. External software, models and benchmark projects are not included or relicensed by this repository.
