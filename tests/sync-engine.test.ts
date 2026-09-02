import { describe, expect, it } from "vitest";
import { SyncEngine, type SourceReader } from "../src/sync/sync-engine";
import type { RemoteDrivePage, RemoteNode, SyncSource } from "../src/types";

const root: RemoteNode = {
  token: "root",
  objectToken: "root-doc",
  objectType: "docx",
  title: "Root",
  hasChildren: true,
};

const child: RemoteNode = {
  token: "child",
  objectToken: "child-doc",
  objectType: "docx",
  title: "Child",
  hasChildren: false,
};

const source: SyncSource = {
  id: "source-1",
  name: "Product Wiki",
  type: "wiki",
  remoteId: "space-1",
  rootNodeToken: "root",
  targetFolder: "Feishu",
  enabled: true,
};

describe("SyncEngine", () => {
  it("stops A-B-A pagination cycles before requesting the repeated page", async () => {
    let calls = 0;
    const reader: SourceReader = {
      getWikiNode: async () => root,
      listWikiNodes: async () => [],
      listDriveFolderPage: async (_folder, page) => {
        if (++calls > 6) throw new Error("test guard");
        return {
          items: [],
          hasMore: true,
          nextPageToken: page === "A" ? "B" : "A",
        };
      },
    };
    const result = await new SyncEngine(reader).scanSources([
      { ...source, type: "drive-folder" },
    ]);
    expect(calls).toBe(3);
    expect(result.sources[0].error).toContain("repeated page token");
  });
  it("propagates cancellation instead of treating it as a failed source", async () => {
    const controller = new AbortController();
    const reader: SourceReader = {
      getWikiNode: async () => root,
      listWikiNodes: async () => [],
      listDriveFolderPage: async () => {
        controller.abort();
        return { items: [], hasMore: false };
      },
    };
    await expect(
      new SyncEngine(reader, controller.signal).scanSources([
        { ...source, type: "drive-folder" },
      ]),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("includes a configured root document and recursively scans its children", async () => {
    const reader: SourceReader = {
      getWikiNode: async () => root,
      listWikiNodes: async (_spaceId, parentNodeToken) =>
        parentNodeToken === "root" ? [child] : [],
      listDriveFolderPage: async () => ({ items: [], hasMore: false }),
    };
    const engine = new SyncEngine(reader);

    const summary = await engine.scanSources([source]);

    expect(summary.nodeCount).toBe(2);
    expect(summary.documentCount).toBe(2);
    expect(summary.sources[0]?.error).toBeUndefined();
  });

  it("recursively scans Drive folders, paginates, and deduplicates resources", async () => {
    const driveSource: SyncSource = {
      ...source,
      id: "drive-1",
      name: "My Drive folder",
      type: "drive-folder",
      remoteId: "folder-root",
      rootNodeToken: "",
    };
    const pages = new Map<string, RemoteDrivePage>([
      [
        "folder-root:first",
        {
          items: [
            { token: "folder-a", name: "A", type: "folder" },
            { token: "doc-1", name: "One", type: "docx" },
          ],
          hasMore: true,
          nextPageToken: "page-2",
        },
      ],
      [
        "folder-root:page-2",
        {
          items: [
            { token: "doc-1", name: "One duplicate", type: "docx" },
            { token: "sheet-1", name: "Sheet", type: "sheet" },
          ],
          hasMore: false,
        },
      ],
      [
        "folder-a:first",
        {
          items: [
            { token: "doc-2", name: "Two", type: "docx" },
            { token: "shortcut-1", name: "Shortcut", type: "shortcut" },
          ],
          hasMore: false,
        },
      ],
    ]);
    const reader: SourceReader = {
      getWikiNode: async () => root,
      listWikiNodes: async () => [],
      listDriveFolderPage: async (folderToken, pageToken) => {
        const page = pages.get(`${folderToken}:${pageToken ?? "first"}`);
        if (!page) {
          throw new Error("Unexpected page request");
        }
        return page;
      },
    };

    const summary = await new SyncEngine(reader).scanSources([driveSource]);

    expect(summary.nodeCount).toBe(5);
    expect(summary.documentCount).toBe(3);
    expect(summary.sources[0]?.error).toBeUndefined();
  });

  it("stops safely when Drive pagination never returns a continuation token", async () => {
    let calls = 0;
    const reader: SourceReader = {
      getWikiNode: async () => root,
      listWikiNodes: async () => [],
      listDriveFolderPage: async () => {
        calls += 1;
        return { items: [], hasMore: true };
      },
    };
    const driveSource: SyncSource = {
      ...source,
      type: "drive-folder",
      remoteId: "folder-root",
    };

    const summary = await new SyncEngine(reader).scanSources([driveSource]);

    expect(calls).toBe(3);
    expect(summary.sources[0]?.error).toContain("did not return a page token");
  });
});
