import { afterEach, beforeEach, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { verifyReleaseSource } from "../scripts/verify-release-source.mjs";

let root;
const git = (...args) =>
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Release Test",
      "-c",
      "user.email=test@example.invalid",
      ...args,
    ],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
const readProject = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const commit = () => {
  git("add", "manifest.json", "README.md", ".gitattributes");
  git(
    "-c",
    "core.hooksPath=disabled-test-hooks",
    "commit",
    "--no-gpg-sign",
    "-m",
    "Synthetic release fixture",
  );
};
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "release source test "));
  git("init", "--initial-branch=main");
  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify({ version: "1.0.1", name: "Example Sync" }) + "\n",
  );
  writeFileSync(join(root, "README.md"), "# Example\n\nSynthetic fixture.\n");
  writeFileSync(join(root, ".gitattributes"), readProject(".gitattributes"));
  commit();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it.each([false, true])(
  "accepts an exact clean release commit (annotated=%s)",
  (annotated) => {
    git(
      ...(annotated
        ? ["tag", "-a", "1.0.1", "-m", "Synthetic release"]
        : ["tag", "1.0.1"]),
    );
    const expectedSha = git("rev-parse", "HEAD");
    expect(
      verifyReleaseSource({ root, version: "1.0.1", expectedSha }),
    ).toEqual({ version: "1.0.1", commit: expectedSha });
  },
);

it("rejects a stale tag even when the current manifest has the same version", () => {
  git("tag", "1.0.1");
  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify({ version: "1.0.1", name: "Renamed Sync" }) + "\n",
  );
  commit();
  expect(() => verifyReleaseSource({ root, version: "1.0.1" })).toThrow(
    "checked-out commit",
  );
});

it.each([false, true])(
  "rejects modified release inputs (staged=%s)",
  (staged) => {
    git("tag", "1.0.1");
    writeFileSync(join(root, "README.md"), "Changed after tagging.\n");
    if (staged) git("add", "README.md");
    expect(() => verifyReleaseSource({ root, version: "1.0.1" })).toThrow();
  },
);

it("rejects absent tags and unexpected workflow commits", () => {
  expect(() => verifyReleaseSource({ root, version: "1.0.1" })).toThrow();
  git("tag", "1.0.1");
  expect(() =>
    verifyReleaseSource({
      root,
      version: "1.0.1",
      expectedSha: "0".repeat(40),
    }),
  ).toThrow("workflow commit");
});

it("rejects workflow dispatch on a branch instead of the release tag", () => {
  git("tag", "1.0.1");
  expect(() =>
    verifyReleaseSource({
      root,
      version: "1.0.1",
      expectedRef: "refs/heads/main",
    }),
  ).toThrow("version tag");
  expect(() =>
    verifyReleaseSource({
      root,
      version: "1.0.1",
      expectedRef: "refs/tags/1.0.1",
    }),
  ).not.toThrow();
});

it.each(["v1.0.1", "1.0.0", "01.0.1", "1.0.1; echo unsafe", "../../main", ""])(
  "rejects invalid or mismatched release versions: %s",
  (version) => {
    expect(() => verifyReleaseSource({ root, version })).toThrow();
  },
);

it("keeps LF checkouts even when Git enables Windows-style auto CRLF", () => {
  git("-c", "core.autocrlf=true", "checkout-index", "--force", "--all");
  for (const name of ["manifest.json", "README.md", ".gitattributes"]) {
    expect(readFileSync(join(root, name), "utf8")).not.toContain("\r");
  }
});

it("prepares signed releases only on explicit dispatch after the CI matrix", () => {
  const ci = parse(readProject(".github/workflows/ci.yml"));
  const release = parse(readProject(".github/workflows/release.yml"));
  expect(ci.on).toHaveProperty("workflow_call");
  expect(ci.jobs.check.strategy.matrix.os).toEqual([
    "ubuntu-latest",
    "macos-latest",
    "windows-latest",
  ]);
  expect(Object.keys(release.on)).toEqual(["workflow_dispatch"]);
  expect(release.jobs.validate.uses).toBe("./.github/workflows/ci.yml");
  expect(release.jobs.package.needs).toBe("validate");
  expect(release.permissions).toEqual({ contents: "read" });
  expect(release.jobs.package.permissions.contents).toBe("read");
  const steps = release.jobs.package.steps;
  expect(
    steps.filter((s) => s.run?.includes("verify-release-source.mjs")),
  ).toHaveLength(2);
  expect(
    steps.find((s) => s.uses?.startsWith("actions/attest@")),
  ).toBeDefined();
  for (const step of steps.filter((s) => s.uses)) {
    expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
  }
});
