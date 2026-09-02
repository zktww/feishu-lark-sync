# Contributing / 参与贡献

中文或英文的 Issue、文档改进和 PR 都欢迎。提交前请先搜索已有问题；较大功能先讨论产品边界，避免重复工作。Contributor communication should be respectful and constructive.

## Local development

Use Node.js 22.13+ (the maintained 22.x line used in CI) and npm:

```bash
npm ci --ignore-scripts
npm run dev
```

Use a **disposable test vault with synthetic documents**, not your everyday vault. A symlinked plugin directory receives every new `main.js` build; do not reload it casually with schedules enabled. Automated tests mock the CLI and Vault and do not require accounts or network access.

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run package
```

`npm run package` validates metadata, formatting, the official Obsidian lint rules, types, tests, production build and distribution allowlist. It generates local artifacts only. It never commits, tags or publishes. The build regenerates `THIRD_PARTY_NOTICES.txt` and embeds the complete notices into `main.js`.

Text files use LF on all platforms via `.gitattributes`; do not disable formatting checks to accommodate CRLF checkouts. Changes to protected `main` go through a pull request. For a public release, bump all version metadata together, merge the PR, and create a new matching tag on that merged commit. `npm run verify:release-source -- 1.0.1` is read-only and requires that exact tag and a clean checkout. Follow the release checklist and use the artifacts from **Prepare release**, not a local build from a different commit.

## Design and tests

See [architecture](docs/architecture.md). Keep transport in `lark-cli.ts`, synchronization in `src/sync/`, note and media storage in `src/vault/`, UI in `settings.ts` / `status-view.ts`. Avoid introducing a second transport or state schema without a migration plan.

- Preserve read-only remote access, explicit user authorization and cancellation.
- Preserve local edits, per-document checkpoints, corruption recovery and no automatic deletion.
- Add regression tests for bug fixes. Use synthetic URLs, IDs, names and text only.
- UI must support English and Simplified Chinese. Retain the legacy settings path for Obsidian 1.11.4; use setting definitions for section search on 1.13+.
- Do not add blanket lint suppressions. Keep exceptions narrow and explained.
- Do not auto-install runtime dependencies, introduce telemetry or expand scopes silently.

## Pull request checklist

Explain the problem, solution and test evidence. Note user-visible changes in `CHANGELOG.md`; update both READMEs and privacy documentation when behavior changes. PRs should be focused; avoid unrelated reformatting or dependency churn. Work is contributed under this project's MIT license.

Check `git status --short`, staged filenames and staged content before committing. **Never use a blanket force-add of ignored files.** Do not include `data*.json`, note backups, `.env`, real authorization URLs or private screenshots. The ZIP allowlist protects release assets, not a careless Git commit. Select your intended Git author email (GitHub noreply if preferred) before the first commit.

## Reporting

Use issue templates for reproducible bugs and feature requests. Provide plugin/Obsidian/CLI versions, OS, resource type and sanitized error text, not credentials or a full vault export. Report vulnerabilities privately via [SECURITY.md](SECURITY.md).
