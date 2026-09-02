# Feishu Lark Sync

[English](README.md) | [简体中文](README.zh-CN.md)

`Feishu Lark Sync` is a desktop-only Obsidian plugin for mirroring Feishu and Lark documents into a local vault.

## Current status

Version 1.0.1 includes a Sync Center, guided setup, conflict resolution, recovery and verified release packaging for the doc/docx pull workflow:

- Obsidian plugin scaffold and settings UI
- Dedicated `lark-cli` profile configuration
- App Secret passed to `lark-cli` through stdin and never persisted by the plugin
- Split-flow user authorization through a browser link
- Feishu/Lark user session health check
- Multiple synchronization source model
- URL-first source onboarding with automatic type and token resolution
- Recursive, read-only Wiki and Drive-folder source scans
- Manual Drive pagination with duplicate/cycle protection
- Docx/legacy Doc content converted to local Markdown
- Feishu images and document attachments localized into sibling `_attachments` folders
- Revision/modified-time incremental synchronization
- Managed-region writes that preserve local frontmatter and notes
- Conflict protection for locally edited managed content
- Synchronization on Obsidian startup and at 15/30/60-minute intervals
- Single-document URL sources

Sheet, Base, Slides and Mindnote are discovered but not yet converted. Ordinary Drive files are not imported. Whiteboards are represented by a placeholder. Remote disappearance never deletes a local note.

## Synchronization behavior

- Use the ribbon icon or **Open Sync Center** command to view progress, run manually, cancel, and retry failed items. Startup and scheduled sync are optional.
- Notes are created under each source's configured vault folder and keep the remote folder hierarchy.
- Remote content lives between `<!-- feishu-sync:start -->` and `<!-- feishu-sync:end -->`.
- Add personal notes outside that region. Non-`feishu_*` frontmatter is preserved.
- Editing the managed region marks the document as conflicted and stops remote overwrite.
- The first path assigned to a document remains stable, preserving local links if the remote title or location changes.

Resolve conflicts in **Sync Center → Compare / resolve**. Choose keep-local (pause), preserve the local managed content in a separate local section and apply remote, or back up and use remote. Applying remote always backs up the complete local note first. Edits after the preview abort the operation. Missing notes require explicit restoration or relinking; do not delete files to force a sync.

## Setup and daily use

1. Check `lark-cli`, bind your own app, authorize read-only user access, then verify identity.
2. Paste a source URL and review supported/unsupported document counts. Save it, choose a vault folder and enable it. New sources start disabled.
3. Choose local media downloads or remote links; the default per-file download limit is 20 MB (configurable up to 100 MB).
4. Run manually once, inspect Sync Center, then optionally enable a schedule. Obsidian must remain running.

Settings and UI follow Obsidian's English / Simplified Chinese language. Changes during a task take effect on the next run. Changing the target folder does not move existing notes; changing media policy does not rewrite already-synced documents. Scheduled runs with no changes stay quiet. Failures delay the next attempt with exponential backoff, capped at 6 hours.

Obsidian 1.13+ uses searchable settings sections; versions 1.11.4–1.12 use the compatible legacy settings page. Real-app and cross-platform acceptance is tracked separately from automated tests in the [release checklist](docs/release-checklist.md).

## Upgrade, backup and recovery

Existing source/schedule settings are retained. New installations use manual sync by default. Reload the plugin after updating. State is validated and migrated on first load, keeping `data.pre-v1.json`; subsequent writes atomically replace `data.json` and retain `data.backup.json`. Each completed document is checkpointed. A note found without its baseline is treated as a conflict, not automatically adopted.

Damaged or unknown-version state blocks synchronization. Use Sync Center's explicit recovery confirmation. The current file is retained as `data.recovered-*.json`; auto-sync is disabled after recovery. If no backup is available, keep the files and ask for recovery help—do not reset state to force adoption.

Conflict backups are private `note-backup-*.md` files in the plugin directory. State, history and backups contain document metadata or contents. They are ignored by Git and excluded from the release ZIP, but your vault backup/sync software may still copy them. No automatic backup or unused-media deletion is performed.

## Development

Requirements:

- Node.js 22.13 or later (development and CI)
- npm
- Obsidian 1.11.4 or later
- `lark-cli`

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run check
```

Build a verified, local-only release archive:

```bash
npm ci --ignore-scripts
npm run package
```

`dist/feishu-lark-sync-1.0.1.zip` contains nine allowlisted files: `main.js`, `manifest.json`, `styles.css`, the two READMEs, `LICENSE`, `CHANGELOG.md`, `PRIVACY.md` and `THIRD_PARTY_NOTICES.txt`. Standalone files and `SHA256SUMS.txt` are also generated under `dist/1.0.1/`. Complete bundled-dependency notices are embedded in `main.js`, including community installs. The ZIP has its own checksum. Packaging never traverses the working directory or includes state/note backups. It does not publish anything. CI is configured for Linux, macOS and Windows. See the [release checklist](docs/release-checklist.md) before public release.

Maintainers prepare public releases using the manually dispatched **Prepare release** workflow on an existing version tag. It requires the three-platform CI matrix, verifies that the tag, manifest and workflow commit agree, and generates GitHub build-provenance attestations for the standalone assets and ZIP. Publishing is a separate, explicit step using those exact artifacts. Never replace assets or move tags on an already published version; release a new patch version instead.

Copy these files to an Obsidian vault plugin directory for local testing:

- `manifest.json`
- `main.js`
- `styles.css`

Example target:

```text
<vault>/.obsidian/plugins/feishu-lark-sync/
```

When `lark-cli` is installed through NVM, enter the absolute path returned by `command -v lark-cli` in plugin settings. The plugin adds that executable directory to the child-process PATH so Obsidian launched from Finder can resolve the matching Node.js runtime.

## Security model

- Each user supplies their own Feishu/Lark application.
- Authorization requests only `wiki:wiki:readonly`, `docx:document:readonly`, and `drive:drive:readonly`.
- The plugin does not request member management, create, update, move, or delete permissions.
- The App Secret is accepted only in a password field and piped to `lark-cli config init --app-secret-stdin`.
- The plugin never stores the App Secret or access tokens in the vault.
- Commands use `child_process.spawn` with `shell: false`.
- Document operations are read-only and explicitly use user identity; app binding and login change authorization state only when requested by the user.
- Media downloads require HTTPS, trusted Feishu/Lark CDN domains or explicit user-added domains, pinned public IPv4 addresses, timeouts and byte limits. Redirects are revalidated. Private addresses, HTML/JSON/SVG/XML responses, unsupported image signatures and unsupported attachment formats are rejected; the original link is retained and reported for retry.
- Localized media use immutable SHA-256 filenames. Existing media is never overwritten. SVG, unsupported CDN domains, IPv6-only hosts and unusual attachment formats may need to remain remote links.
- CLI and downloads are cancellable; unload aborts pending work. A write already committed is checkpointed rather than rolled back.

## Synchronization semantics

- Feishu/Lark is the source of truth for the managed document region.
- Local notes outside the managed region are preserved.
- Remote changes are detected with revision or modification metadata.
- A locally edited managed region is never silently overwritten.
- Remote disappearance does not automatically delete a local file.

See [docs/architecture.md](docs/architecture.md) for the component design.

## Privacy and external dependencies

Use requires a Feishu/Lark account, your own application and a separately installed official `lark-cli`. The plugin does not automatically install/update the CLI. **The CLI manages configuration, profiles and credentials outside the vault** using its own platform-dependent storage (the official CLI describes OS-native credential storage). Not persisting credentials in plugin settings does not mean the CLI stores nothing.

The CLI contacts Feishu/Lark API/auth services. Media downloads contact trusted CDN hosts or explicitly allowed extra domains; rendering remote images can also make network requests. There is no plugin telemetry or maintainer-operated relay. The configured executable runs with your user privileges. State, conflict backups, resource URLs and notes may be private, including signed media links. Disabling/uninstalling does not delete notes or revoke external CLI authorization. See [PRIVACY.md](PRIVACY.md).

## Contributing and support

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [open-source readiness](docs/open-source-readiness.md). Use synthetic or redacted examples in public issues; never attach the working plugin directory.

## License

MIT for this project. Bundled dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt), generated during build and embedded in `main.js`.
