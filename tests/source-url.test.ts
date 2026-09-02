import { describe, expect, it } from "vitest";
import { parseSourceUrl } from "../src/source-url";

describe("parseSourceUrl", () => {
  it("recognizes Wiki links", () => {
    expect(
      parseSourceUrl(
        "https://example.feishu.cn/wiki/wikcnExample?from=copylink",
      ),
    ).toMatchObject({
      kind: "wiki",
      token: "wikcnExample",
      objectType: "wiki",
    });
  });

  it("recognizes Drive folder links", () => {
    expect(
      parseSourceUrl("https://example.larksuite.com/drive/folder/fldcnExample"),
    ).toMatchObject({
      kind: "drive-folder",
      token: "fldcnExample",
      objectType: "folder",
    });
  });

  it("recognizes document links", () => {
    expect(
      parseSourceUrl("https://example.feishu.cn/docx/doxcnExample"),
    ).toMatchObject({
      kind: "document",
      token: "doxcnExample",
      objectType: "docx",
    });
  });

  it("unwraps Feishu app links", () => {
    const nested = encodeURIComponent(
      "https://example.feishu.cn/wiki/wikcnNested",
    );
    expect(
      parseSourceUrl(
        `https://applink.feishu.cn/client/docs/open?url=${nested}`,
      ),
    ).toMatchObject({
      kind: "wiki",
      token: "wikcnNested",
    });
  });

  it("rejects unsupported URLs", () => {
    expect(() =>
      parseSourceUrl("https://example.com/not-a-document"),
    ).toThrow();
  });
});
