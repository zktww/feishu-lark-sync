# Release checklist / 发布检查清单

## Automated gates

- [ ] `npm ci --ignore-scripts` on Node.js 22.13+ using the checked-in lockfile.
- [ ] `npm run package`: metadata, formatting, official Obsidian ESLint (zero warnings), types, tests, build, full license notices and ZIP allowlist.
- [ ] Review `npm audit`; a clean result is not a full security audit.
- [ ] ZIP has exactly nine distribution files, no state, note backups, caches, secrets or source maps. Never ZIP the working plugin directory.
- [ ] Standalone `main.js` embeds complete dependency notices; install it together with matching `manifest.json` and `styles.css` from `dist/1.0.0/`.
- [ ] Verify `SHA256SUMS.txt` and the ZIP checksum; install in a disposable test vault.
- [ ] Remote CI matrix succeeds on Linux/macOS/Windows. CI retains allowlisted build artifacts but does not publish a release.

## Manual acceptance in an isolated vault

- [ ] English/Simplified Chinese: settings, preview, filters, progress, cancellation, recovery.
- [ ] Obsidian 1.11.4 legacy settings and 1.13+ searchable sections, including refresh after checking identity and adding/removing sources.
- [ ] Existing 0.2/0.3 state preserves sources/schedules; new installs are manual-only. Release 1.0.0 still uses integer state schema 1.
- [ ] Feishu **and** Lark: identity verification, expired/revoked session, permission denied, missing CLI and executable paths with spaces. Record the tested CLI version.
- [ ] Wiki, Drive folder, single doc/docx, pagination, empty folders and unsupported types.
- [ ] Edit outside the managed region during download (preserved), then inside (conflict).
- [ ] Cancel/disable during a run; completed writes keep checkpoints and pending work stops.
- [ ] All conflict choices, edits after preview, restore missing note, relink moved/edited note.
- [ ] Oversized/invalid media, extra CDN, redirects, remote-link mode, network loss and retry.
- [ ] Disk-full/corruption tests on disposable copies only; verify stop-on-error and explicit recovery.
- [ ] Quiet unchanged scheduled runs, backoff and manual re-enabling after recovery.

## GitHub source preparation (owner decisions)

- [ ] Choose the owner/repo, attribution and intended Git author email. Use the owner's real GitHub noreply address if desired; never invent it or change global identity.
- [ ] Review `git status --short`, staged filenames and content. No private state or personal paths. Ignore rules do not protect force-added files or earlier history.
- [ ] Add actual repository/homepage/issue links and optional CODEOWNERS once the repo is selected. No fake contacts or badges.
- [ ] Enable private vulnerability reporting, branch protection/required checks and dependency alerts. Configuration files alone do not activate these protections.
- [ ] Add synthetic-data screenshots/demo, without account, tenant, document or token information.

## Release and community submission (explicit authorization required)

1. Push reviewed source to a public GitHub repository with manifest, README and LICENSE at its default-branch root. Local scripts do not commit, tag or push.
2. After acceptance, use tag exactly **`1.0.0`**, without `v`, matching the manifest. Attach **`main.js`, `manifest.json`, `styles.css` individually**. A ZIP alone is insufficient. Optionally attach the ZIP, notices and checksums. Prefer a draft for inspection; publish only with approval.
3. Follow the [official submission guide](https://docs.obsidian.md/plugins/releasing/submit-plugin): sign in to the Obsidian community site, connect GitHub, choose **Plugins → New plugin**, and submit the repo for automated review. Resolve review findings and complete publication there. A GitHub upload does not mean market approval.
4. Follow [developer policies](https://docs.obsidian.md/community-directory/developer-policies): disclose account/network/outside-vault access, honor dependency licenses, no client telemetry or automatic dependency installation.
5. After approval, add the actual community installation link. Future tags/assets must also match their manifests.

Current status: local release preparation only. Real Feishu/Lark authorization, Obsidian UI acceptance, remote CI and community approval are not established by mocked tests. Leave these boxes unchecked until evidence exists. Git credentials, commit identity and publishing permission are separate decisions.
