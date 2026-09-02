import assert from "node:assert/strict";

/**
 * Structural subset of https://docs.obsidian.md/Reference/Manifest#name.
 * The directory still checks uniqueness, reserved feature names and conduct.
 */
export function validateManifestName(name) {
  assert.ok(
    typeof name === "string" && name.trim().length > 0,
    "Manifest name must be a non-empty string",
  );
  assert.equal(
    name,
    name.trim(),
    "Manifest name must not have surrounding whitespace",
  );
  assert.match(
    name,
    /^[A-Za-z0-9 ()+-]+$/,
    "Manifest name may use Basic Latin letters/digits, spaces, hyphens, plus signs and parentheses only",
  );
  assert.doesNotMatch(
    name,
    /obsidian|obsi-|-sidian|\bplugin\b/i,
    "Manifest name must not include Obsidian variants or the word Plugin",
  );
}
