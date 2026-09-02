# Changelog

## 1.0.0

- First 1.0 release preparation; package, lockfile, manifest and compatibility registry versions agree. This does not imply a published GitHub/community release.
- Official Obsidian ESLint zero-warning gate, native settings headings and searchable sections on 1.13+, retaining the 1.11.4 legacy path.
- Complete dependency licenses generated automatically and embedded in standalone `main.js`; packaging refuses absent notices.
- Nine-file release allowlist, standalone assets and checksums, CI artifact retention, no automatic publishing.
- Explicit CLI storage/network disclosure, privacy/security/contribution documents, issue/PR templates and dependency update configuration.
- Settings compatibility and license-generation regression tests. Read-only scopes and state schema version 1 are unchanged.

### 升级说明

- 版本统一为 1.0.0；这是本地发布准备，不代表已经上架。
- 不增加权限、不重置用户授权、不改变同步源和状态格式。
- 安装前保留知识库备份；单独更新 `main.js`、`manifest.json`、`styles.css`，不要覆盖或清空 `data*.json`。

## 0.3.0

### Experience / 使用体验

- Sync Center: live progress, cancel, next scheduled run, last success, 10-run history, filters and per-document results.
- Retry failed documents or failed source scans only; incomplete media can be retried too.
- Text-only conflict comparison: pause and keep local, preserve local managed content in a separate local section, or back up and accept remote.
- Missing local notes require explicit restoration or relinking instead of silently recreating duplicates.
- Guided setup, verified user display, read-only source preview, disabled-by-default new sources, media policy and per-file limits.
- All new UI follows Obsidian's English / Simplified Chinese language setting.
- Cancellable CLI/download operations, per-run settings snapshots, single-flight tasks and failure backoff up to 6 hours.

### Reliability / 可靠性

- Atomically transform the latest note with `Vault.process`; preserve local edits made during downloads.
- Checkpoint after each document. Missing baselines become explicit conflicts, never automatic ownership adoption.
- Validate and version state; atomically replace files, keep previous-state and pre-migration backups, stop on damaged state.
- Content-addressed immutable media; HTTPS host allowlist, pinned public DNS, byte limits, timeouts, signature/type checks.
- Parse Markdown code regions before transforming Feishu tags; preserve YAML values with a YAML parser.
- Detect pagination cycles beyond a repeated adjacent page; cap scans.
- Redact credential fields and URLs from errors; bound CLI output.
- Regression, Vault-adapter and DOM UI tests; cross-platform CI and allowlist-only release packaging.

### Upgrade / 升级注意

- Existing sources and schedules are retained. New installations default to manual sync.
- Toggle the plugin off/on after installing. First load preserves legacy state as `data.pre-v1.json`.
- Conflicts remain pending until resolved in Sync Center. Do not delete notes to force a sync.
- Existing note paths remain stable. Changing destination/media settings affects future writes, not bulk migration.
- Backups contain private note contents. Keep the plugin folder and state backups private; only distribute the generated ZIP.
- Scope remains read-only doc/docx ingestion; sheets, Base, slides and generic MCP are not added in this release.
