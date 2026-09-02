# Release checklist / 发布检查清单

## Automated gates

- [ ] `npm ci --ignore-scripts` on Node.js 22.13+ using the checked-in lockfile.
- [ ] `npm run package`: metadata, formatting, official Obsidian ESLint (zero warnings), types, tests, build, full license notices and ZIP allowlist.
- [ ] Display name is `Feishu Lark Sync` in source and release manifests. The local character check follows the [manifest naming rules](https://docs.obsidian.md/Reference/Manifest#name); it does not guarantee directory uniqueness or approval.
- [ ] Review `npm audit`; a clean result is not a full security audit.
- [ ] ZIP has exactly nine distribution files, no state, note backups, caches, secrets or source maps. Never ZIP the working plugin directory.
- [ ] Standalone `main.js` embeds complete dependency notices; install it together with matching `manifest.json` and `styles.css` from `dist/1.0.1/`.
- [ ] Verify `SHA256SUMS.txt` and the ZIP checksum; install in a disposable test vault.
- [ ] Remote CI matrix succeeds on Linux/macOS/Windows. CI retains allowlisted build artifacts but does not publish a release. Git text checkouts must remain LF even when `core.autocrlf=true`.
- [ ] `npm run verify:release-source -- 1.0.1` passes on the clean tagged checkout before and after building. Tag, manifest version, workflow SHA and source inputs must agree.

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

1. Bump `package.json`, both root versions in `package-lock.json`, `manifest.json` and `versions.json` together. Submit the reviewed changes through a PR to protected `main`; wait for the full CI matrix before merging. Local scripts do not commit, tag or push.
2. After acceptance, create tag exactly **`1.0.1`**, without `v`, on the merged commit. Do not reuse or move `1.0.0`. Verify the remote tag resolves to the intended commit.
3. Run **Prepare release** on ref `1.0.1` with input `version=1.0.1` (for example `gh workflow run release.yml --ref 1.0.1 -f version=1.0.1`). It runs the CI matrix, checks source/tag consistency, builds and attests the assets. It cannot publish a release: its contents permission is read-only.
4. Download `release-assets-1.0.1` from that successful workflow run. Check `SHA256SUMS.txt`, the ZIP checksum and the version/name/author in the packaged manifest against the tagged source. Verify attestations with `gh attestation verify <asset-path> --repo zktww/feishu-lark-sync`; check that provenance refers to the intended workflow commit.
5. Create a **draft** release using the existing verified tag and attach **`main.js`, `manifest.json`, `styles.css` individually** from the downloaded artifact, not another local rebuild. A ZIP alone is insufficient. Also attach the ZIP and checksums. Verify the uploaded asset digests before explicitly publishing. Never overwrite an existing published release to retry this procedure.
6. Follow the [official submission guide](https://docs.obsidian.md/plugins/releasing/submit-plugin). First releases need the community submission; updates use new versioned releases, not duplicate plugin entries. Resolve review findings and confirm which version and commit the directory reviewed. A completed automated review is not a claim that every warning has been cleared.
7. Follow [developer policies](https://docs.obsidian.md/community-directory/developer-policies): disclose account/network/outside-vault access, honor dependency licenses, no client telemetry or automatic dependency installation.
8. After approval, add the actual community installation link. Future tags/assets must also match their manifests.

For a display-name correction, push the corrected manifest to the default branch and upload the newly built assets, not only a renamed release title. Replace stale attachments in an unpublished draft. If the version is already published, prepare a new patch release instead of silently replacing a published version. The plugin ID and user data directory do not change.

These boxes are a per-release checklist, not a claim of completed acceptance. Real Feishu/Lark authorization, Obsidian UI acceptance, remote CI and community approval are not established by mocked tests. Leave boxes unchecked until evidence exists. Git credentials, commit identity and publishing permission are separate decisions.
