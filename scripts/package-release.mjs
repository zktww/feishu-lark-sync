import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { zipSync, unzipSync } from "fflate";
import assert from "node:assert/strict";
import "./verify-release.mjs";
import { verifyEmbeddedNotices } from "./licenses.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  await readFile(join(root, "manifest.json"), "utf8"),
);
// Deliberately never traverse the project directory: it may be linked into a
// live vault and contain settings, note backups, and credential-bearing URLs.
const allowlist = [
  "main.js",
  "manifest.json",
  "styles.css",
  "README.md",
  "README.zh-CN.md",
  "LICENSE",
  "CHANGELOG.md",
  "PRIVACY.md",
  "THIRD_PARTY_NOTICES.txt",
];
const files = Object.fromEntries(
  await Promise.all(
    allowlist.map(async (name) => [
      name,
      new Uint8Array(await readFile(join(root, name))),
    ]),
  ),
);
assert.ok(files["main.js"].length > 1000, "Missing plugin build");
verifyEmbeddedNotices(
  new TextDecoder().decode(files["main.js"]),
  new TextDecoder().decode(files["THIRD_PARTY_NOTICES.txt"]),
);
assert.ok(
  new TextDecoder()
    .decode(files["main.js"])
    .includes(new TextDecoder().decode(files["LICENSE"]).trim()),
  "Standalone build must include the project's license",
);
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
assert.deepEqual(
  [...pkg.files].sort(),
  [...allowlist].sort(),
  "Package file lists must agree",
);
// Stable timestamps let repeated builds from the same inputs reproduce the ZIP.
const archive = zipSync(files, {
  level: 9,
  mtime: new Date(2000, 0, 1, 0, 0, 0),
});
assert.deepEqual(Object.keys(unzipSync(archive)).sort(), [...allowlist].sort());
const name = `${manifest.id}-${manifest.version}.zip`;
await mkdir(join(root, "dist"), { recursive: true });
const releaseDir = join(root, "dist", manifest.version);
await mkdir(releaseDir, { recursive: true });
const checksums = [];
for (const [filename, content] of Object.entries(files)) {
  await writeFile(join(releaseDir, filename), content);
  checksums.push(
    `${createHash("sha256").update(content).digest("hex")}  ${filename}`,
  );
}
await writeFile(
  join(releaseDir, "SHA256SUMS.txt"),
  checksums.join("\n") + "\n",
);
await writeFile(join(root, "dist", name), archive);
await writeFile(
  join(root, "dist", `${name}.sha256`),
  `${createHash("sha256").update(archive).digest("hex")}  ${name}\n`,
);
console.log(
  `Verified local package: dist/${name} (${allowlist.length} allowlisted files; no settings or backups)`,
);
console.log(
  `Standalone release assets and checksums: dist/${manifest.version}/`,
);
