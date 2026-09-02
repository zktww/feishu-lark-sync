import assert from "node:assert/strict";

export function renderLicenseNotices(dependencies) {
  const unique = new Map();
  for (const { packageJson: pkg, licenseText } of dependencies) {
    const id = `${pkg.name}@${pkg.version}`;
    assert.ok(licenseText?.trim(), `Missing license text for ${id}`);
    assert.ok(
      typeof pkg.license === "string",
      `Missing SPDX license for ${id}`,
    );
    const section = `Package: ${id}\nLicense: ${pkg.license}\n\n${licenseText.trim()}`;
    assert.ok(
      !unique.has(id) || unique.get(id) === section,
      `Conflicting notices for ${id}`,
    );
    unique.set(id, section);
  }
  assert.ok(unique.size > 0, "No bundled dependency licenses found");
  return (
    "THIRD-PARTY NOTICES\nGenerated from bundled npm dependencies. Do not edit by hand.\n\n" +
    [...unique.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, text]) => text)
      .join("\n\n" + "=".repeat(72) + "\n\n") +
    "\n"
  );
}

export function licenseBanner(notices) {
  assert.ok(notices.startsWith("THIRD-PARTY NOTICES\n"), "Invalid notices");
  // Refuse unsafe comments instead of modifying legally significant text.
  assert.ok(!notices.includes("*/"), "License text cannot be embedded safely");
  return `/*!\n${notices}*/\n`;
}

export function verifyEmbeddedNotices(bundle, notices) {
  assert.ok(
    bundle.startsWith(licenseBanner(notices)),
    "main.js must embed complete third-party notices",
  );
  for (const name of ["mdast-util-from-markdown", "yaml"]) {
    assert.ok(
      notices.includes(`Package: ${name}@`),
      `Missing runtime dependency: ${name}`,
    );
  }
}
