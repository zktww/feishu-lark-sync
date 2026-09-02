import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Read-only: never creates/moves a tag, changes Git settings or publishes files.
export function verifyReleaseSource({
  root,
  version,
  expectedSha,
  expectedRef,
}) {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (expectedRef) {
    assert.equal(
      expectedRef,
      `refs/tags/${version}`,
      "Run release preparation on the version tag",
    );
  }
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const source = readFileSync(join(root, "manifest.json"), "utf8");
  const manifest = JSON.parse(source);
  assert.equal(manifest.version, version, "Tag must match manifest version");
  const head = git("rev-parse", "HEAD");
  const tag = git("rev-parse", `refs/tags/${version}^{commit}`);
  assert.equal(tag, head, "Release tag must point to the checked-out commit");
  if (expectedSha) {
    assert.equal(head, expectedSha, "Checkout must match the workflow commit");
  }
  // A build may regenerate tracked notices, but must not change their contents.
  git("diff", "--exit-code", "HEAD", "--");
  assert.equal(
    source.trim(),
    git("show", `refs/tags/${version}:manifest.json`),
    "Release source manifest must match the tag exactly",
  );
  return { version, commit: head };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = verifyReleaseSource({
    root: fileURLToPath(new URL("../", import.meta.url)),
    version: process.argv[2] ?? process.env.RELEASE_VERSION ?? "",
    expectedSha: process.env.GITHUB_SHA,
    expectedRef: process.env.GITHUB_REF,
  });
  console.log(`Release source verified: ${result.version} at ${result.commit}`);
}
