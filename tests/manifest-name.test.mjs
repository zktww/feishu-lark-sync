import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { validateManifestName } from "../scripts/manifest-name.mjs";

it.each([
  "Feishu Lark Sync",
  "Feishu-Lark Sync",
  "Feishu + Lark Sync",
  "Feishu Sync (Lark)",
])("accepts directory-compatible characters: %s", (name) => {
  expect(() => validateManifestName(name)).not.toThrow();
});

it.each([
  "Feishu & Lark",
  "Feishu / Lark",
  "Feishu_Sync",
  "Feishu.Sync",
  "Feishu’s Sync",
  "飞书同步",
  "Sync 🚀",
  "Feishu\nSync",
  "Feishu\tSync",
  " Feishu Sync ",
  "",
  "   ",
  null,
  123,
  "Obsidian Sync Tools",
  "Obsi-Sync",
  "Sync-sidian",
  "Feishu Plugin",
])("rejects invalid directory names: %s", (name) => {
  expect(() => validateManifestName(name)).toThrow();
});

it("keeps public metadata, documentation and authorization UI consistent", () => {
  const read = (path) =>
    readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const manifest = JSON.parse(read("manifest.json"));
  const pkg = JSON.parse(read("package.json"));
  expect(manifest.name).toBe("Feishu Lark Sync");
  expect(manifest.id).toBe("feishu-lark-sync");
  expect(pkg.name).toBe(manifest.id);
  expect(manifest.author).toBe(`${manifest.name} contributors`);
  expect(pkg.author).toBe(manifest.author);
  expect(read("LICENSE")).toContain(manifest.author);
  for (const path of ["README.md", "README.zh-CN.md"]) {
    expect(read(path).split("\n")[0]).toBe(`# ${manifest.name}`);
  }
  expect(read("src/i18n.ts")).toContain(`"Authorize ${manifest.name}"`);
  expect(read("src/i18n.ts")).toContain(`"授权 ${manifest.name}"`);
});
