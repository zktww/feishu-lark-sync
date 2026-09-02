import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { ObsidianVaultStore } from "../src/vault/obsidian-store";
import { TFile, TFolder, type Vault } from "obsidian";

const download = vi.hoisted(() => vi.fn());
vi.mock("../src/vault/media", () => ({ downloadMedia: download }));
vi.mock("obsidian", () => ({ TFile: class {}, TFolder: class {} }));

function fixture() {
  const entries = new Map<
    string,
    { object: TFile | TFolder; content?: string; bytes?: ArrayBuffer }
  >();
  let beforeProcess: (() => void) | undefined;
  const mock = {
    getAbstractFileByPath: (path: string) => entries.get(path)?.object ?? null,
    createFolder: vi.fn(async (path: string) => {
      entries.set(path, { object: new TFolder() });
    }),
    create: vi.fn(async (path: string, content: string) => {
      if (entries.has(path)) throw new Error("exists");
      entries.set(path, { object: new TFile(), content });
    }),
    read: vi.fn(
      async (file: TFile) =>
        [...entries.values()].find((e) => e.object === file)?.content,
    ),
    process: vi.fn(async (file: TFile, update: (content: string) => string) => {
      beforeProcess?.();
      const item = [...entries.values()].find((e) => e.object === file)!;
      item.content = update(item.content!);
    }),
    createBinary: vi.fn(async (path: string, bytes: ArrayBuffer) => {
      if (entries.has(path)) throw new Error("exists");
      entries.set(path, { object: new TFile(), bytes });
    }),
    readBinary: vi.fn(
      async (file: TFile) =>
        [...entries.values()].find((e) => e.object === file)?.bytes,
    ),
    modifyBinary: vi.fn(),
  };
  const backups = new Map<string, string>();
  const store = new ObsidianVaultStore(mock as unknown as Vault, {
    read: async (name) => backups.get(name),
    writeAtomic: async (name, text) => {
      backups.set(name, text);
    },
  });
  return {
    store,
    entries,
    mock,
    backups,
    beforeProcess: (fn: () => void) => {
      beforeProcess = fn;
    },
  };
}
beforeEach(() => download.mockReset());
describe("actual Obsidian Vault adapter", () => {
  it("uses Vault.process with latest content instead of a stale read / modify", async () => {
    const f = fixture();
    await f.store.write("Notes/a.md", "old");
    f.beforeProcess(() => {
      f.entries.get("Notes/a.md")!.content = "concurrent";
    });
    await f.store.process("Notes/a.md", (latest) => `${latest} + new`);
    expect(await f.store.read("Notes/a.md")).toBe("concurrent + new");
    expect(f.mock.process).toHaveBeenCalledTimes(1);
  });
  it("downloads immutable content-addressed media and never overwrites old media", async () => {
    const f = fixture();
    download
      .mockResolvedValueOnce({
        data: Buffer.from("old-image"),
        extension: ".png",
      })
      .mockResolvedValueOnce({
        data: Buffer.from("new-image"),
        extension: ".png",
      });
    const oldPath = await f.store.saveRemoteMedia(
      "url",
      "Notes/_attachments/media",
    );
    const newPath = await f.store.saveRemoteMedia(
      "url",
      "Notes/_attachments/media",
    );
    expect(oldPath).not.toBe(newPath);
    expect(f.mock.modifyBinary).not.toHaveBeenCalled();
    expect(Buffer.from(f.entries.get(oldPath)!.bytes!).toString()).toBe(
      "old-image",
    );
  });
  it("reuses intact downloads but refuses user-modified attachments", async () => {
    const f = fixture();
    const data = Buffer.from("image");
    download.mockResolvedValue({ data, extension: ".png" });
    const path = await f.store.saveRemoteMedia(
      "url",
      "Notes/_attachments/media",
    );
    expect(path).toContain(createHash("sha256").update(data).digest("hex"));
    await f.store.saveRemoteMedia("url", "Notes/_attachments/media");
    expect(f.mock.createBinary).toHaveBeenCalledTimes(1);
    f.entries.get(path)!.bytes = Uint8Array.from(Buffer.from("edited")).buffer;
    await expect(
      f.store.saveRemoteMedia("url", "Notes/_attachments/media"),
    ).rejects.toThrow("edited");
  });
  it("does not create binaries after cancellation and keeps backups separate from notes", async () => {
    const f = fixture();
    const controller = new AbortController();
    download.mockImplementation(async () => {
      controller.abort();
      return { data: Buffer.from("data"), extension: ".png" };
    });
    await expect(
      f.store.saveRemoteMedia("url", "Notes/_attachments/media", {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(f.mock.createBinary).not.toHaveBeenCalled();
    const name = await f.store.backup("Notes/a.md", "Private local note");
    expect(f.backups.get(name)).toContain("Private local note");
    expect(f.entries.size).toBe(0);
  });
});
