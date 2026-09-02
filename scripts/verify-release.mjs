import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const read = async (name) =>
  JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), "utf8"));
const [pkg, manifest, versions, lock] = await Promise.all(
  ["package.json", "manifest.json", "versions.json", "package-lock.json"].map(
    read,
  ),
);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(pkg.version, manifest.version);
assert.equal(lock.version, manifest.version);
assert.equal(lock.packages[""].version, manifest.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
assert.equal(manifest.id, "feishu-lark-sync");
assert.equal(manifest.isDesktopOnly, true);
assert.equal(pkg.private, true, "Prevent accidental npm publication");
console.log(`Release metadata verified: ${manifest.id} ${manifest.version}`);
