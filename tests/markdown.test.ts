import { describe, expect, it } from "vitest";
import {
  normalizeFeishuMarkdown,
  sanitizeRelativePath,
} from "../src/transform/markdown";

describe("Feishu Markdown normalization", () => {
  it("localizes images and converts Feishu-only tags", async () => {
    const result = await normalizeFeishuMarkdown(
      '![diagram](https://example.feishu.cn/media/code)\n<cite type="mention" user-name="Alice"/>\n<whiteboard token="wb1"/>',
      async (media) => `Feishu/_attachments/image-${media.index}.png`,
    );

    expect(result).toContain("![[Feishu/_attachments/image-0.png]]");
    expect(result).toContain("@Alice");
    expect(result).toContain("飞书画板");
  });

  it("sanitizes every remote path segment", () => {
    expect(sanitizeRelativePath("Folder/A:B?.md")).toBe("Folder/A-B-.md");
  });
});
