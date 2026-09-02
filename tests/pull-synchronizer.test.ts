import { describe, expect, it } from "vitest";
import { PullSynchronizer } from "../src/sync/pull-synchronizer";
import type {
  DocumentState,
  FeishuLarkSyncSettings,
  RemoteDocument,
} from "../src/types";
import type { VaultStore } from "../src/vault/store";
import {
  extractManagedBody,
  managedContentHash,
  writeManagedNote,
} from "../src/vault/managed-note";

class MemoryVault implements VaultStore {
  readonly files = new Map<string, string | ArrayBuffer>();

  exists(path: string): boolean {
    return this.files.has(path);
  }

  async read(path: string): Promise<string | undefined> {
    const value = this.files.get(path);
    return typeof value === "string" ? value : undefined;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
  async process(
    path: string,
    update: (latest: string | undefined) => string,
  ): Promise<void> {
    await this.write(path, update(await this.read(path)));
  }
  async backup(path: string, content: string): Promise<string> {
    const target = `backup/${path}`;
    await this.write(target, content);
    return target;
  }

  async saveRemoteMedia(_url: string, desiredPath: string): Promise<string> {
    const path = `${desiredPath}.png`;
    this.files.set(path, new ArrayBuffer(1));
    return path;
  }
}

const settings: FeishuLarkSyncSettings = {
  cliPath: "lark-cli",
  profileName: "test",
  brand: "feishu",
  appId: "",
  syncOnStartup: false,
  scheduleMinutes: 0,
  sources: [
    {
      id: "source-1",
      name: "Drive",
      type: "drive-folder",
      remoteId: "folder",
      rootNodeToken: "",
      targetFolder: "05-Feishu",
      enabled: true,
    },
  ],
};

const remote: RemoteDocument = {
  token: "doc-token-1",
  title: "Example",
  objectType: "docx",
  sourceId: "source-1",
  sourceName: "Drive",
  targetFolder: "05-Feishu",
  relativePath: "Folder/Example",
  modifiedAt: 2,
};

function scan(documents: RemoteDocument[] = [remote]) {
  return {
    sources: [
      {
        sourceId: "source-1",
        sourceName: "Drive",
        nodeCount: documents.length,
        documentCount: documents.length,
        documents,
      },
    ],
    nodeCount: documents.length,
    documentCount: documents.length,
    documents,
  };
}

describe("PullSynchronizer", () => {
  it("creates a managed Markdown note and localizes media", async () => {
    const vault = new MemoryVault();
    const states: Record<string, DocumentState> = {};
    const synchronizer = new PullSynchronizer({
      engine: { scanSources: async () => scan() },
      client: {
        fetchDocumentMarkdown: async () => ({
          token: remote.token,
          revision: "3",
          markdown: "# Body\n\n![image](https://example.feishu.cn/image)",
        }),
      },
      vault,
      getSettings: () => settings,
      getStates: () => states,
      saveState: async () => undefined,
    });

    const summary = await synchronizer.run();
    const note = await vault.read("05-Feishu/Folder/Example.md");

    expect(summary.created).toBe(1);
    expect(note).toContain("feishu_id: doc-token-1");
    expect(note).toContain("![[05-Feishu/Folder/_attachments/");
    expect(states[remote.token]?.remoteRevision).toBe("3");
  });

  it("does not overwrite a locally edited managed region", async () => {
    const vault = new MemoryVault();
    const path = "05-Feishu/Example.md";
    const original = writeManagedNote(
      undefined,
      {
        token: remote.token,
        sourceId: remote.sourceId,
        revision: "1",
      },
      "Original",
    );
    vault.files.set(path, original.replace("Original", "Locally edited"));
    const states: Record<string, DocumentState> = {
      [remote.token]: {
        token: remote.token,
        sourceId: remote.sourceId,
        localPath: path,
        remoteRevision: "1",
        remoteModifiedAt: 1,
        managedContentHash: managedContentHash("Original"),
        lastSeenScanId: "old",
        status: "active",
      },
    };
    let fetched = false;
    const synchronizer = new PullSynchronizer({
      engine: { scanSources: async () => scan() },
      client: {
        fetchDocumentMarkdown: async () => {
          fetched = true;
          return {
            token: remote.token,
            revision: "2",
            markdown: "Remote update",
          };
        },
      },
      vault,
      getSettings: () => settings,
      getStates: () => states,
      saveState: async () => undefined,
    });

    const summary = await synchronizer.run();

    expect(summary.conflicts).toBe(1);
    expect(fetched).toBe(false);
    expect(extractManagedBody((await vault.read(path)) ?? "")).toBe(
      "Locally edited",
    );
    expect(states[remote.token]?.status).toBe("conflict");
  });

  it("skips fetching when remote metadata and managed content are unchanged", async () => {
    const vault = new MemoryVault();
    const path = "05-Feishu/Example.md";
    const body = "Unchanged body";
    vault.files.set(
      path,
      writeManagedNote(
        undefined,
        {
          token: remote.token,
          sourceId: remote.sourceId,
          revision: "3",
          modifiedAt: remote.modifiedAt,
        },
        body,
      ),
    );
    const states: Record<string, DocumentState> = {
      [remote.token]: {
        token: remote.token,
        sourceId: remote.sourceId,
        localPath: path,
        remoteRevision: "3",
        remoteModifiedAt: remote.modifiedAt,
        managedContentHash: managedContentHash(body),
        lastSeenScanId: "old",
        status: "active",
      },
    };
    const synchronizer = new PullSynchronizer({
      engine: { scanSources: async () => scan() },
      client: {
        fetchDocumentMarkdown: async () => {
          throw new Error("fetch should not run");
        },
      },
      vault,
      getSettings: () => settings,
      getStates: () => states,
      saveState: async () => undefined,
    });

    const summary = await synchronizer.run();

    expect(summary.unchanged).toBe(1);
    expect(summary.inaccessible).toBe(0);
  });

  it("marks remote disappearance without deleting the local note", async () => {
    const vault = new MemoryVault();
    const path = "05-Feishu/Example.md";
    vault.files.set(path, "Local content");
    const states: Record<string, DocumentState> = {
      [remote.token]: {
        token: remote.token,
        sourceId: remote.sourceId,
        localPath: path,
        managedContentHash: managedContentHash("Body"),
        lastSeenScanId: "old",
        status: "active",
      },
    };
    const synchronizer = new PullSynchronizer({
      engine: { scanSources: async () => scan([]) },
      client: {
        fetchDocumentMarkdown: async () => {
          throw new Error("fetch should not run");
        },
      },
      vault,
      getSettings: () => settings,
      getStates: () => states,
      saveState: async () => undefined,
    });

    await synchronizer.run();

    expect(states[remote.token]?.status).toBe("missing");
    expect(await vault.read(path)).toBe("Local content");
  });
});
