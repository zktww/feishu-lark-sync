# Architecture

## Product boundary

Feishu & Lark Sync is an ingestion plugin. It converts Feishu/Lark content into local Markdown. Agent access remains a separate concern and can be provided by the filesystem or an existing Obsidian REST/MCP plugin.

```text
Feishu/Lark API
      |
 lark-cli provider
      |
 synchronization engine
      |
 document model -> Markdown renderer -> Vault writer
      |
 Obsidian Markdown -> REST/MCP -> local agents
```

## Modules (actual source layout)

- `src/main.ts`: lifecycle, task ownership, command wiring, settings snapshots, recovery and conflict actions.
- `src/lark-cli.ts`: transport, app binding, authorization, health checks and CLI cancellation. There is no separate `auth/` or `providers/` directory yet.
- `src/source-url.ts`: source-link validation and normalization.
- `src/sync/`: scans, incremental pulls, planning utilities and scheduling.
- `src/transform/markdown.ts`: Markdown normalization and media localization.
- `src/vault/`: storage interfaces, Obsidian adapter, note merging and media downloads.
- `src/state.ts`: mappings, migrations, validation and atomic checkpoints.
- `src/settings.ts`, `src/status-view.ts`, `src/i18n.ts`: onboarding, Sync Center, conflict UI and localization.
- `src/types.ts`, `src/safety.ts`: shared models and safety helpers.
- `tests/`: synthetic regression, mocked CLI, Vault adapter and DOM tests.
- `scripts/`, `esbuild.config.mjs`: release validation, license embedding and allowlist packaging.

The single-package layout is intentional. Add a provider interface only when a second transport is needed; a backend or monorepo is not required for an open-source plugin. A future extraction of task/conflict services from `main.ts` should preserve behavior tests and checkpoint invariants.

## Managed write model

Each synchronized note contains plugin-owned frontmatter plus a managed body region:

```markdown
---
feishu_id: doxcn...
feishu_revision: 42
feishu_managed: true
---

<!-- feishu-sync:start -->

Remote content
<!-- feishu-sync:end -->

## Local notes

User and agent-authored content is preserved here.
```

The writer updates only `feishu_*` properties and the managed region. It preserves every other property and local section.

## Safety invariants

1. No remote write API is called in the pull-only release.
2. No local file is removed after an incomplete remote scan.
3. Permission loss is not interpreted as remote deletion.
4. Local managed-region edits produce a conflict instead of silent overwrite.
5. Secrets and authorization links are redacted from logs.
6. Only one synchronization run may write to the vault at a time.

## Implemented 1.0 write protocol

1. Snapshot source/settings; discover only enabled sources (or retry failed items).
2. Check ownership, local existence and baseline. Missing state/edited content requires review.
3. Fetch and normalize remote Markdown, protecting Markdown code-node spans and YAML values.
4. Download bounded media to immutable content-addressed paths. No old attachment is modified.
5. Use `Vault.process` to recheck the latest baseline and merge with the latest local section.
6. Update token state and atomically persist a per-document checkpoint. Persistence failures stop the run.
7. Record a bounded run history. Arm a one-shot schedule after completion, applying failure backoff.

A crash between steps 5 and 6 leaves a newer note and an older/missing baseline. A subsequent run stops at a conflict rather than overwriting the note. Orphan media may remain; cleanup is intentionally manual. `planner.ts` is currently a pure planning utility tested separately; the pull synchronizer enforces the runtime write protocol.

`state.ts` validates schema version 1, preserves the pre-migration file, serializes atomic writes, and keeps a previous-state backup. Recovery is explicit and preserves damaged input. These backups live beside plugin state, outside note directories, and are excluded from release packages.

Conflict resolution displays text only. Keep-local pauses the document. Other choices back up the full local note and verify that the preview is still current before applying remote content; preserve-local also appends the old managed body outside the managed region. Relinking verifies the document ID and retains the original hash baseline.
