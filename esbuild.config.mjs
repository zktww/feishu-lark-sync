import esbuild from "esbuild";
import { builtinModules } from "node:module";
import process from "node:process";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import licenseModule from "esbuild-plugin-license";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { licenseBanner, renderLicenseNotices } from "./scripts/licenses.mjs";

const license =
  typeof licenseModule === "function" ? licenseModule : licenseModule.default;

const production = process.argv[2] === "production";
let collectedDependencies = [];

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
  ],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  minify: production,
  metafile: true,
  write: false,
  outfile: "main.js",
  plugins: [
    license({
      thirdParty: {
        output: {
          file: "THIRD_PARTY_NOTICES.txt",
          template: (dependencies) => {
            collectedDependencies = dependencies;
            return renderLicenseNotices(dependencies);
          },
        },
      },
    }),
    {
      name: "embed-third-party-notices",
      setup(build) {
        build.onEnd(async (result) => {
          if (result.errors.length) return;
          const projectLicense = await readFile("LICENSE", "utf8");
          assert.ok(
            !projectLicense.includes("*/"),
            "Unsafe project license comment",
          );
          // Cross-check the actual bundle, including nested npm versions, not
          // only the collector's package-name map. A missing version fails closed.
          const packagePaths = new Set();
          for (const input of Object.keys(result.metafile.inputs)) {
            const parts = input.replaceAll("\\", "/").split("/");
            const index = parts.lastIndexOf("node_modules");
            if (index < 0) continue;
            const count = parts[index + 1].startsWith("@") ? 3 : 2;
            packagePaths.add(
              parts.slice(0, index + count).join("/") + "/package.json",
            );
          }
          const bundledDependencies = [];
          for (const path of packagePaths) {
            const pkg = JSON.parse(await readFile(path, "utf8"));
            const collected = collectedDependencies.find(
              (d) =>
                d.packageJson.name === pkg.name &&
                d.packageJson.version === pkg.version,
            );
            if (collected?.licenseText?.trim()) {
              bundledDependencies.push(collected);
              continue;
            }
            // Packages such as yaml contain an unnamed nested package.json.
            // The upstream nearest-package collector misses their root license;
            // recover it from the real bundle input's npm package boundary.
            const directory = dirname(path);
            const names = (await readdir(directory))
              .filter((name) =>
                /^(?:licen[cs]e|copying)(?:$|[._-])/i.test(name),
              )
              .sort();
            const texts = await Promise.all(
              names.map((name) => readFile(join(directory, name), "utf8")),
            );
            bundledDependencies.push({
              packageJson: pkg,
              licenseText: texts.join("\n\n"),
            });
          }
          const notices = renderLicenseNotices(bundledDependencies);
          await writeFile("THIRD_PARTY_NOTICES.txt", notices);
          // Community installs download main.js alone, not the entire ZIP.
          for (const output of result.outputFiles ?? []) {
            await writeFile(
              output.path,
              licenseBanner(notices) +
                `/*! PROJECT LICENSE\n${projectLicense}\n*/\n` +
                output.text,
            );
          }
        });
      },
    },
  ],
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
