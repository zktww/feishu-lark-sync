import { expect, it } from "vitest";
import {
  licenseBanner,
  renderLicenseNotices,
  verifyEmbeddedNotices,
} from "../scripts/licenses.mjs";

const dependency = (name, text = "Copyright Example\nPermission notice.") => ({
  packageJson: { name, version: "1.0.0", license: "MIT" },
  licenseText: text,
});
it("sorts notices, preserves full text and deduplicates watch rebuilds", () => {
  const a = dependency("yaml"),
    b = dependency("mdast-util-from-markdown");
  const notices = renderLicenseNotices([a, b, a]);
  expect(notices).toEqual(renderLicenseNotices([b, a]));
  expect(notices).toContain(a.licenseText);
  expect(notices.indexOf(b.packageJson.name)).toBeLessThan(
    notices.indexOf(a.packageJson.name),
  );
  expect(() =>
    verifyEmbeddedNotices(licenseBanner(notices) + "code", notices),
  ).not.toThrow();
});
it("fails closed on missing, conflicting or unsafe license text", () => {
  expect(() => renderLicenseNotices([])).toThrow();
  expect(() => renderLicenseNotices([dependency("a", "")])).toThrow();
  expect(() =>
    renderLicenseNotices([dependency("a"), dependency("a", "different")]),
  ).toThrow();
  expect(() => licenseBanner("THIRD-PARTY NOTICES\n*/alert(1)")).toThrow();
});
it("requires full notices in the standalone bundle and both runtime libraries", () => {
  const notices = renderLicenseNotices([dependency("yaml")]);
  expect(() => verifyEmbeddedNotices(licenseBanner(notices), notices)).toThrow(
    "mdast-util",
  );
  expect(() => verifyEmbeddedNotices("code without licenses", notices)).toThrow(
    "embed",
  );
});
