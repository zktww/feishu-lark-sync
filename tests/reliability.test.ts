import { describe, expect, it, vi } from "vitest";
import { PullSynchronizer } from "../src/sync/pull-synchronizer";
import {
  DEFAULT_SETTINGS,
  type DocumentState,
  type RemoteDocument,
} from "../src/types";
import {
  extractManagedBody,
  managedContentHash,
  writeManagedNote,
} from "../src/vault/managed-note";
import type { VaultStore } from "../src/vault/store";
import { normalizeFeishuMarkdown } from "../src/transform/markdown";
import { parse } from "yaml";

const remote: RemoteDocument = {
  token: "doc1",
  title: "One",
  sourceId: "source1",
  sourceName: "Source",
  objectType: "docx",
  targetFolder: "Feishu",
  relativePath: "One",
  modifiedAt: 2,
};
const path = "Feishu/One.md";
class MemoryVault implements VaultStore {
  files = new Map<string, string>();
  backupFiles: string[] = [];
  beforeCommit?: () => void;
  exists(p: string) {
    return this.files.has(p);
  }
  async read(p: string) {
    return this.files.get(p);
  }
  async write(p: string, content: string) {
    this.files.set(p, content);
  }
  async process(p: string, update: (latest: string | undefined) => string) {
    this.beforeCommit?.();
    await this.write(p, update(this.files.get(p)));
  }
  async backup(_p: string, content: string) {
    this.backupFiles.push(content);
    return "backup.md";
  }
  async saveRemoteMedia() {
    return "Feishu/_attachments/immutable.png";
  }
}
function setup(existing = true) {
  const vault = new MemoryVault();
  const states: Record<string, DocumentState> = {};
  if (existing) {
    vault.files.set(
      path,
      writeManagedNote(
        undefined,
        { token: remote.token, sourceId: remote.sourceId },
        "Old",
      ) + "\nPersonal notes\n",
    );
    states.doc1 = {
      token: "doc1",
      sourceId: "source1",
      localPath: path,
      status: "active",
      managedContentHash: managedContentHash("Old"),
      remoteRevision: "1",
      lastSeenScanId: "old",
      remote,
    };
  }
  const settings = {
    ...DEFAULT_SETTINGS,
    sources: [
      {
        id: "source1",
        name: "Source",
        type: "drive-folder" as const,
        enabled: true,
        remoteId: "folder1",
        rootNodeToken: "",
        targetFolder: "Feishu",
      },
    ],
  };
  let documents = [remote];
  const engine = {
    scanSources: vi.fn(async (sources: typeof settings.sources) => ({
      documents: sources.length ? documents : [],
      sources: sources.map((s) => ({
        sourceId: s.id,
        sourceName: s.name,
        documents,
        nodeCount: documents.length,
        documentCount: documents.length,
      })),
      nodeCount: documents.length,
      documentCount: documents.length,
    })),
  };
  const client = {
    fetchDocumentMarkdown: vi.fn(async () => ({
      token: "doc1",
      revision: "2",
      markdown: "New",
    })),
  };
  const saveState = vi.fn(async () => {});
  const sync = new PullSynchronizer({
    vault,
    engine,
    client,
    getSettings: () => settings,
    getStates: () => states,
    saveState,
  });
  return {
    vault,
    states,
    client,
    settings,
    engine,
    saveState,
    sync,
    setDocuments: (d: RemoteDocument[]) => {
      documents = d;
    },
  };
}
describe("transaction and recovery regressions", () => {
  it("reports partial media failure on the document and retries unchanged revisions", async () => {
    const f = setup(false);
    f.client.fetchDocumentMarkdown.mockResolvedValue({
      token: "doc1",
      revision: "2",
      markdown: "![x](https://cdn.feishu.cn/a)",
    });
    const media = vi
      .spyOn(f.vault, "saveRemoteMedia")
      .mockRejectedValueOnce(new Error("media too large"));
    const result = await f.sync.run();
    expect(result.created).toBe(1);
    expect(result.results?.[0].error).toContain("media too large");
    expect(f.states.doc1.mediaIncomplete).toBe(true);
    media.mockResolvedValue("Feishu/_attachments/immutable.png");
    await f.sync.run();
    expect(f.states.doc1.mediaIncomplete).toBe(false);
    expect(f.client.fetchDocumentMarkdown).toHaveBeenCalledTimes(2);
  });
  it("preserves outside edits made while remote content is fetched", async () => {
    const f = setup();
    f.client.fetchDocumentMarkdown.mockImplementation(async () => {
      f.vault.files.set(
        path,
        f.vault.files.get(path)! + "Added during download\n",
      );
      return { token: "doc1", revision: "2", markdown: "New" };
    });
    const result = await f.sync.run();
    expect(result.updated).toBe(1);
    expect(f.vault.files.get(path)).toContain("Added during download");
    expect(extractManagedBody(f.vault.files.get(path)!)).toBe("New");
  });
  it("refuses inside edits made immediately before atomic commit", async () => {
    const f = setup();
    f.vault.beforeCommit = () =>
      f.vault.files.set(
        path,
        f.vault.files.get(path)!.replace("Old", "Concurrent edit"),
      );
    expect((await f.sync.run()).conflicts).toBe(1);
    expect(f.vault.files.get(path)).toContain("Concurrent edit");
  });
  it("checkpoints each document and stops on a failed checkpoint", async () => {
    const f = setup(false);
    f.setDocuments([
      remote,
      { ...remote, token: "doc2", title: "Two", relativePath: "Two" },
    ]);
    f.saveState.mockRejectedValueOnce(new Error("disk full"));
    await expect(f.sync.run()).rejects.toThrow("disk full");
    expect(f.client.fetchDocumentMarkdown).toHaveBeenCalledTimes(1);
    expect(f.vault.files.has(path)).toBe(true);
  });
  it("does not adopt a same-token note when state was lost after a crash", async () => {
    const f = setup(false);
    f.vault.files.set(
      path,
      writeManagedNote(
        undefined,
        { token: "doc1", sourceId: "source1" },
        "Local after crash",
      ),
    );
    expect((await f.sync.run()).conflicts).toBe(1);
    expect((await f.sync.run()).conflicts).toBe(1);
    expect(f.client.fetchDocumentMarkdown).not.toHaveBeenCalled();
    expect(f.vault.files.get(path)).toContain("Local after crash");
  });
  it("reports a missing local note even when the remote revision is unchanged", async () => {
    const f = setup();
    f.vault.files.delete(path);
    f.states.doc1.remoteRevision = "2";
    const result = await f.sync.run();
    expect(result.results?.[0].action).toBe("missing-local");
    expect(result.unchanged).toBe(0);
    expect(f.client.fetchDocumentMarkdown).not.toHaveBeenCalled();
    expect((await f.sync.run({ restoreToken: "doc1" })).updated).toBe(1);
    expect(f.vault.files.has(path)).toBe(true);
  });
  it("cancels before any pending note write and does not report success", async () => {
    const f = setup(false);
    const controller = new AbortController();
    f.client.fetchDocumentMarkdown.mockImplementation(async () => {
      controller.abort();
      return { token: "doc1", revision: "2", markdown: "New" };
    });
    const result = await f.sync.run({ signal: controller.signal });
    expect(result.cancelled).toBe(true);
    expect(f.vault.files.size).toBe(0);
  });
  it("retries only failed documents, without scanning healthy sources", async () => {
    const f = setup(false);
    const result = await f.sync.run({
      retry: [{ ...remote, remote, action: "failed" }],
    });
    expect(f.engine.scanSources).toHaveBeenCalledWith([]);
    expect(result.created).toBe(1);
    expect(f.client.fetchDocumentMarkdown).toHaveBeenCalledTimes(1);
  });
  it("uses a settings snapshot when media mode changes mid-run", async () => {
    const f = setup(false);
    f.settings.mediaMode = "remote";
    const media = vi.spyOn(f.vault, "saveRemoteMedia");
    f.client.fetchDocumentMarkdown.mockImplementation(async () => {
      f.settings.mediaMode = "local";
      return {
        token: "doc1",
        revision: "2",
        markdown: "![x](https://cdn.feishu.cn/image)",
      };
    });
    await f.sync.run();
    expect(media).not.toHaveBeenCalled();
  });
  it("can preserve the conflict in the local section, with a full note backup", async () => {
    const f = setup();
    f.vault.files.set(
      path,
      f.vault.files.get(path)!.replace("Old", "Local edit"),
    );
    await f.sync.run();
    const preview = await f.sync.previewConflict("doc1");
    await f.sync.resolveConflict(preview, "preserve");
    expect(f.vault.backupFiles[0]).toBe(preview.local);
    expect(extractManagedBody(f.vault.files.get(path)!)).toBe("New");
    expect(f.vault.files.get(path)).toContain("Local edit");
    expect(f.states.doc1.status).toBe("active");
  });
  it("rejects stale conflict previews without modifying notes", async () => {
    const f = setup();
    const preview = await f.sync.previewConflict("doc1");
    f.vault.files.set(path, preview.local + "New personal notes");
    await expect(f.sync.resolveConflict(preview, "remote")).rejects.toThrow(
      "reopen preview",
    );
    expect(f.vault.backupFiles.length).toBe(0);
  });
  it("keep-local pauses a document, and relinking preserves the baseline", async () => {
    const f = setup();
    await f.sync.resolveConflict(await f.sync.previewConflict("doc1"), "pause");
    expect((await f.sync.run()).results?.[0].action).toBe("paused");
    const content = f.vault.files.get(path)!;
    f.vault.files.delete(path);
    f.vault.files.set("Moved/One.md", content.replace("Old", "Changed"));
    await f.sync.relink("doc1", "Moved/One.md");
    expect(f.states.doc1.localPath).toBe("Moved/One.md");
    expect(f.states.doc1.status).toBe("conflict");
  });
});

describe("Markdown and metadata safety", () => {
  it("leaves fenced, indented and inline code byte-for-byte intact", async () => {
    const input =
      '```html\n<p>example</p>\n<img url="https://cdn.feishu.cn/private"/>\n\n\n```\n\n`<cite name="Alice"/>`\n\n    <p>indented</p>\n\n<p>real text</p>';
    const localize = vi.fn(async () => "bad.png");
    const result = await normalizeFeishuMarkdown(input, localize);
    expect(localize).not.toHaveBeenCalled();
    expect(result).toContain(input.slice(0, input.indexOf("\n\n<p>real")));
    expect(result).toContain("\n\nreal text\n");
  });
  it("preserves multiline YAML values, nested metadata and comments", () => {
    const initial = writeManagedNote(
      undefined,
      { token: "doc1", sourceId: "s" },
      "Old",
    );
    const note = initial.replace(
      "---\n",
      "---\n# Keep this comment\ndescription: |\n  First\n\n  Second\ncustom:\n  tags: [one, two]\n",
    );
    const result = writeManagedNote(
      note,
      { token: "doc1", sourceId: "s", revision: "2" },
      "New",
    );
    const yaml = parse(result.split("---")[1]);
    expect(yaml.description).toBe("First\n\nSecond\n");
    expect(yaml.custom.tags).toEqual(["one", "two"]);
    expect(result).toContain("# Keep this comment");
  });
  it("rejects ambiguous marker pairs and invalid YAML", () => {
    expect(
      extractManagedBody(
        "<!-- feishu-sync:start -->x<!-- feishu-sync:start -->y<!-- feishu-sync:end -->",
      ),
    ).toBeUndefined();
    expect(() =>
      writeManagedNote(
        "---\na: [\n---\nBody",
        { token: "x", sourceId: "s" },
        "New",
      ),
    ).toThrow("YAML");
  });
});
