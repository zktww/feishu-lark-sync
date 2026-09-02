import { TFile, TFolder, Vault } from "obsidian";
import { posix } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { checkAbort, vaultPath } from "../safety";
import { downloadMedia } from "./media";
import type { MediaOptions, VaultStore } from "./store";
import type { StateIO } from "../state";

export class ObsidianVaultStore implements VaultStore {
  constructor(
    private readonly vault: Vault,
    private readonly backupIO: StateIO,
  ) {}
  exists(path: string): boolean {
    return this.vault.getAbstractFileByPath(vaultPath(path)) !== null;
  }
  async read(path: string): Promise<string | undefined> {
    const file = this.vault.getAbstractFileByPath(vaultPath(path));
    if (file instanceof TFolder)
      throw new Error("A folder occupies the note path");
    return file instanceof TFile ? this.vault.read(file) : undefined;
  }
  async write(path: string, content: string): Promise<void> {
    await this.process(path, () => content);
  }
  async process(
    path: string,
    update: (latest: string | undefined) => string,
  ): Promise<void> {
    const normalized = vaultPath(path);
    await this.ensureParentFolder(normalized);
    const existing = this.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      await this.vault.process(existing, (latest) => update(latest));
      return;
    }
    if (existing) throw new Error("A folder occupies the note path");
    await this.vault.create(normalized, update(undefined));
  }
  async backup(path: string, content: string): Promise<string> {
    const name = `note-backup-${Date.now()}-${randomUUID()}.md`;
    await this.backupIO.writeAtomic(
      name,
      `<!-- Original path: ${vaultPath(path).replace(/-->/g, "")} -->\n${content}`,
    );
    return name;
  }
  async saveRemoteMedia(
    url: string,
    desiredPath: string,
    options: MediaOptions = {},
  ): Promise<string> {
    const { data, extension } = await downloadMedia(url, options);
    checkAbort(options.signal);
    const digest = createHash("sha256").update(data).digest("hex");
    // Immutable files cannot alter media referenced by an older note version.
    const target = vaultPath(
      posix.join(posix.dirname(desiredPath), `${digest}${extension}`),
    );
    await this.ensureParentFolder(target);
    checkAbort(options.signal);
    const existing = this.vault.getAbstractFileByPath(target);
    if (existing instanceof TFile) {
      const current = await this.vault.readBinary(existing);
      if (
        createHash("sha256").update(Buffer.from(current)).digest("hex") !==
        digest
      )
        throw new Error(
          "Existing attachment was edited; refusing to overwrite it",
        );
    } else if (existing)
      throw new Error("A folder occupies the attachment path");
    else await this.vault.createBinary(target, Uint8Array.from(data).buffer);
    return target;
  }
  private async ensureParentFolder(path: string): Promise<void> {
    const parent = posix.dirname(path);
    if (parent === ".") return;
    let current = "";
    for (const segment of parent.split("/")) {
      current = current ? `${current}/${segment}` : segment;
      const existing = this.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error("A file occupies the destination folder");
      try {
        await this.vault.createFolder(current);
      } catch (error) {
        if (!(this.vault.getAbstractFileByPath(current) instanceof TFolder))
          throw error;
      }
    }
  }
}
