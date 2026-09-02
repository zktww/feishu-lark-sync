import { describe, expect, it } from "vitest";
import {
  extractManagedBody,
  managedContentHash,
  noteBelongsToToken,
  writeManagedNote,
} from "../src/vault/managed-note";

describe("managed note", () => {
  it("updates only plugin frontmatter and the managed region", () => {
    const existing = `---
tags: [personal]
feishu_revision: "1"
---

<!-- feishu-sync:start -->
Old remote body
<!-- feishu-sync:end -->

## My notes

Keep this.
`;
    const updated = writeManagedNote(
      existing,
      {
        token: "doc-1",
        sourceId: "source-1",
        revision: "2",
      },
      "New remote body\n",
    );

    expect(updated).toContain("tags: [personal]");
    expect(updated).toContain('feishu_revision: "2"');
    expect(updated).toContain("New remote body");
    expect(updated).toContain("## My notes\n\nKeep this.");
    expect(updated).not.toContain("Old remote body");
    expect(noteBelongsToToken(updated, "doc-1")).toBe(true);
    expect(managedContentHash(extractManagedBody(updated) ?? "")).toBe(
      managedContentHash("New remote body"),
    );
  });
});
