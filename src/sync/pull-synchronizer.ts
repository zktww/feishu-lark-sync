import { posix } from "node:path";
import {
  normalizeFeishuMarkdown,
  sanitizePathSegment,
  sanitizeRelativePath,
} from "../transform/markdown";
import type {
  DocumentState,
  FeishuLarkSyncSettings,
  RemoteDocument,
  SyncRunSummary,
  SyncItemResult,
  SyncAction,
  SyncProgress,
} from "../types";
import {
  extractManagedBody,
  managedContentHash,
  noteBelongsToToken,
  writeManagedNote,
} from "../vault/managed-note";
import { type VaultStore } from "../vault/store";
import { checkAbort, isAbort, safeError, vaultPath } from "../safety";
import type { SyncEngine } from "./sync-engine";

interface DocumentReader {
  fetchDocumentMarkdown(
    token: string,
  ): Promise<{ token: string; revision?: string; markdown: string }>;
}
export interface PullSynchronizerOptions {
  engine: {
    scanSources(
      sources: FeishuLarkSyncSettings["sources"],
    ): ReturnType<SyncEngine["scanSources"]>;
  };
  client: DocumentReader;
  vault: VaultStore;
  getSettings: () => FeishuLarkSyncSettings;
  getStates: () => Record<string, DocumentState>;
  saveState: () => Promise<void>;
}
export interface RunOptions {
  signal?: AbortSignal;
  retry?: SyncItemResult[];
  restoreToken?: string;
  onProgress?: (progress: SyncProgress) => void;
  trigger?: SyncRunSummary["trigger"];
}
export interface ConflictPreview {
  token: string;
  local: string;
  remote: string;
  revision?: string;
  document: RemoteDocument;
}
class LocalConflict extends Error {}
export class PullSynchronizer {
  constructor(private readonly options: PullSynchronizerOptions) {}

  async run(options: RunOptions = {}): Promise<SyncRunSummary> {
    const settings = structuredClone(this.options.getSettings());
    const states = this.options.getStates();
    const summary: SyncRunSummary = {
      sources: 0,
      discovered: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      conflicts: 0,
      inaccessible: 0,
      skippedUnsupported: 0,
      failedSources: 0,
      errors: [],
      results: [],
      startedAt: new Date().toISOString(),
      trigger: options.trigger ?? "manual",
    };
    const scanId = summary.startedAt!;
    try {
      checkAbort(options.signal);
      options.onProgress?.({ phase: "scanning", completed: 0, total: 0 });
      const enabled = settings.sources.filter((s) => s.enabled);
      const retry = options.retry?.filter(
        (r) =>
          r.action === "failed" && enabled.some((s) => s.id === r.sourceId),
      );
      const retrySourceIds = new Set(
        retry?.filter((r) => !r.remote).map((r) => r.sourceId),
      );
      const scan = await this.options.engine.scanSources(
        options.restoreToken
          ? []
          : retry
            ? enabled.filter((s) => retrySourceIds.has(s.id))
            : enabled,
      );
      checkAbort(options.signal);
      const restore = options.restoreToken
        ? states[options.restoreToken]?.remote
        : undefined;
      if (options.restoreToken && !restore)
        throw new Error("Scan this source before restoring the missing note");
      const documents = restore
        ? [restore]
        : [
            ...scan.documents,
            ...(retry?.flatMap((r) => (r.remote ? [r.remote] : [])) ?? []),
          ];
      summary.sources = retry
        ? new Set(retry.map((r) => r.sourceId)).size
        : scan.sources.length;
      for (const result of scan.sources.filter((s) => s.error)) {
        summary.failedSources++;
        summary.errors.push(safeError(`${result.sourceName}: ${result.error}`));
        summary.results!.push({
          sourceId: result.sourceId,
          title: result.sourceName,
          action: "failed",
          error: safeError(result.error),
        });
      }
      const unique = [...new Map(documents.map((d) => [d.token, d])).values()];
      summary.discovered = unique.length;
      for (const [index, remote] of unique.entries()) {
        checkAbort(options.signal);
        options.onProgress?.({
          phase: "syncing",
          completed: index,
          total: unique.length,
          title: remote.title,
        });
        let action: SyncAction;
        let error: string | undefined;
        const errorsBefore = summary.errors.length;
        try {
          action = await this.synchronizeDocument(
            remote,
            settings,
            options,
            scanId,
            summary,
          );
          if (summary.errors.length > errorsBefore)
            error = safeError(summary.errors.slice(errorsBefore).join("; "));
        } catch (failure) {
          if (isAbort(failure)) throw failure;
          action = failure instanceof LocalConflict ? "conflict" : "failed";
          error = safeError(failure);
          if (states[remote.token])
            states[remote.token].status =
              action === "conflict" ? "conflict" : "inaccessible";
          summary.errors.push(safeError(`${remote.title}: ${error}`));
        }
        if (action === "created") summary.created++;
        else if (action === "updated") summary.updated++;
        else if (action === "unchanged") summary.unchanged++;
        else if (action === "conflict") summary.conflicts++;
        else if (action === "unsupported") summary.skippedUnsupported++;
        else if (action === "failed") summary.inaccessible++;
        summary.results!.push({
          sourceId: remote.sourceId,
          title: remote.title,
          token: remote.token,
          remote,
          action,
          error,
          localPath: states[remote.token]?.localPath,
        });
        // A failed checkpoint stops the run. Never continue writing more notes
        // against state that was not durably recorded.
        await this.options.saveState();
        options.onProgress?.({
          phase: "syncing",
          completed: index + 1,
          total: unique.length,
          title: remote.title,
        });
      }
      if (!options.retry && !options.restoreToken) {
        for (const source of scan.sources.filter((s) => !s.error)) {
          const visible = new Set(source.documents.map((d) => d.token));
          for (const state of Object.values(states)) {
            if (
              state.sourceId === source.sourceId &&
              !visible.has(state.token) &&
              !["conflict", "paused", "missing-local"].includes(state.status)
            )
              state.status = "missing";
          }
        }
      }
      await this.options.saveState();
    } catch (error) {
      if (!isAbort(error)) throw error;
      summary.cancelled = true;
    }
    summary.finishedAt = new Date().toISOString();
    return summary;
  }

  private async synchronizeDocument(
    remote: RemoteDocument,
    settings: FeishuLarkSyncSettings,
    run: RunOptions,
    scanId: string,
    summary: SyncRunSummary,
  ): Promise<SyncAction> {
    checkAbort(run.signal);
    if (!["doc", "docx"].includes(remote.objectType)) return "unsupported";
    if (["__proto__", "constructor", "prototype"].includes(remote.token))
      throw new Error("Invalid document identifier");
    const states = this.options.getStates();
    let state = states[remote.token];
    const localPath = vaultPath(
      state?.localPath ?? (await this.resolveNewNotePath(remote)),
    );
    const existing = await this.options.vault.read(localPath);
    if (state) {
      state.remote = remote;
      state.sourceId = remote.sourceId;
      state.lastSeenScanId = scanId;
    }
    if (state?.status === "paused") return "paused";
    if (state && existing === undefined && run.restoreToken !== remote.token) {
      state.status = "missing-local";
      return "missing-local";
    }
    if (existing !== undefined) {
      if (!state) {
        // Note exists but baseline is lost (e.g. crash after write). Adoption is
        // explicit, never infer ownership from feishu_id alone.
        state = states[remote.token] = {
          token: remote.token,
          sourceId: remote.sourceId,
          localPath,
          remote,
          managedContentHash: managedContentHash(
            extractManagedBody(existing) ?? "",
          ),
          lastSeenScanId: scanId,
          status: "conflict",
        };
      }
      if (
        state.status === "conflict" ||
        !this.matchesBaseline(existing, state)
      ) {
        state.status = "conflict";
        return "conflict";
      }
    }
    if (
      state &&
      existing !== undefined &&
      this.remoteMetadataIsUnchanged(remote, state)
    ) {
      state.status = "active";
      return "unchanged";
    }
    const fetched = await this.options.client.fetchDocumentMarkdown(
      remote.token,
    );
    checkAbort(run.signal);
    if (
      state &&
      existing !== undefined &&
      !state.mediaIncomplete &&
      fetched.revision &&
      fetched.revision === state.remoteRevision
    ) {
      const latest = await this.options.vault.read(localPath);
      if (!this.matchesBaseline(latest, state))
        throw new LocalConflict(
          "Note changed during fetch / 读取期间本地正文有改动",
        );
      state.status = "active";
      state.remoteModifiedAt = remote.modifiedAt;
      return "unchanged";
    }
    const converted = await this.convert(
      fetched.markdown,
      localPath,
      settings,
      run.signal,
    );
    summary.errors.push(
      ...converted.errors.map((e) => safeError(`${remote.title}: ${e}`)),
    );
    checkAbort(run.signal);
    await this.options.vault.process(localPath, (latest) => {
      checkAbort(run.signal);
      if (
        existing === undefined
          ? latest !== undefined
          : !state || !this.matchesBaseline(latest, state)
      )
        throw new LocalConflict(
          "Note changed during download; update stopped / 下载期间笔记有改动，已停止覆盖",
        );
      return writeManagedNote(
        latest,
        {
          token: remote.token,
          sourceId: remote.sourceId,
          sourceUrl: remote.url,
          revision: fetched.revision ?? remote.revision,
          modifiedAt: remote.modifiedAt,
        },
        converted.markdown,
      );
    });
    states[remote.token] = {
      token: remote.token,
      sourceId: remote.sourceId,
      localPath,
      remote,
      remoteRevision: fetched.revision ?? remote.revision,
      remoteModifiedAt: remote.modifiedAt,
      managedContentHash: managedContentHash(converted.markdown),
      mediaIncomplete: converted.errors.length > 0,
      lastSeenScanId: scanId,
      status: "active",
    };
    return state ? "updated" : "created";
  }

  private matchesBaseline(
    content: string | undefined,
    state: DocumentState,
  ): boolean {
    if (content === undefined || !noteBelongsToToken(content, state.token))
      return false;
    const body = extractManagedBody(content);
    return (
      body !== undefined &&
      managedContentHash(body) === state.managedContentHash
    );
  }
  private async convert(
    input: string,
    path: string,
    settings: FeishuLarkSyncSettings,
    signal?: AbortSignal,
  ) {
    const errors: string[] = [];
    const markdown = await normalizeFeishuMarkdown(input, async (media) => {
      checkAbort(signal);
      if (settings.mediaMode === "remote") return undefined;
      try {
        return await this.options.vault.saveRemoteMedia(
          media.url,
          posix.join(posix.dirname(path), "_attachments", "media"),
          {
            signal,
            maxBytes: (settings.maxMediaMB ?? 20) * 1024 * 1024,
            extraHosts: settings.extraMediaHosts,
            kind: media.kind,
          },
        );
      } catch (error) {
        if (isAbort(error)) throw error;
        errors.push(`Media ${media.index + 1}: ${safeError(error)}`);
        return undefined;
      }
    });
    return { markdown, errors };
  }
  async previewConflict(
    token: string,
    signal?: AbortSignal,
  ): Promise<ConflictPreview> {
    const state = this.options.getStates()[token];
    if (!state?.remote) throw new Error("Run a scan first / 请先同步扫描");
    const local = await this.options.vault.read(state.localPath);
    if (local === undefined)
      throw new Error("Local note missing / 本地笔记不存在");
    const fetched = await this.options.client.fetchDocumentMarkdown(token);
    checkAbort(signal);
    return {
      token,
      local,
      remote: fetched.markdown,
      revision: fetched.revision,
      document: state.remote,
    };
  }
  async resolveConflict(
    preview: ConflictPreview,
    choice: "pause" | "preserve" | "remote",
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const states = this.options.getStates();
    const state = states[preview.token];
    if (!state || state.remote?.token !== preview.document.token)
      throw new Error("State changed; reopen conflict preview");
    checkAbort(signal);
    if ((await this.options.vault.read(state.localPath)) !== preview.local)
      throw new LocalConflict(
        "Local note changed; reopen preview / 笔记已变化，请重新预览",
      );
    if (choice === "pause") {
      state.status = "paused";
      await this.options.saveState();
      return;
    }
    if (
      !noteBelongsToToken(preview.local, state.token) ||
      extractManagedBody(preview.local) === undefined
    )
      throw new Error(
        "Ownership/markers invalid; repair the note first / 笔记标识或管理区损坏，请先手动修复",
      );
    const backup = await this.options.vault.backup(
      state.localPath,
      preview.local,
    );
    const converted = await this.convert(
      preview.remote,
      state.localPath,
      structuredClone(this.options.getSettings()),
      signal,
    );
    checkAbort(signal);
    await this.options.vault.process(state.localPath, (latest) => {
      checkAbort(signal);
      if (latest !== preview.local)
        throw new LocalConflict(
          "Local note changed; reopen preview / 笔记已变化，请重新预览",
        );
      const preserved =
        choice === "preserve"
          ? `\n\n## 本地保留 / Preserved local — ${new Date().toISOString()}\n\n${extractManagedBody(latest)}\n`
          : "";
      return (
        writeManagedNote(
          latest,
          {
            token: state.token,
            sourceId: state.sourceId,
            sourceUrl: preview.document.url,
            revision: preview.revision,
            modifiedAt: preview.document.modifiedAt,
          },
          converted.markdown,
        ) + preserved
      );
    });
    Object.assign(state, {
      status: "active",
      managedContentHash: managedContentHash(converted.markdown),
      remoteRevision: preview.revision,
      remoteModifiedAt: preview.document.modifiedAt,
      mediaIncomplete: converted.errors.length > 0,
    });
    await this.options.saveState();
    return backup;
  }
  async relink(token: string, path: string): Promise<void> {
    const state = this.options.getStates()[token];
    if (!state) throw new Error("Unknown note");
    if ((await this.options.vault.read(state.localPath)) !== undefined)
      throw new Error("Original note still exists");
    const content = await this.options.vault.read(vaultPath(path));
    if (content === undefined || !noteBelongsToToken(content, token))
      throw new Error("Selected note does not match this document");
    state.status = this.matchesBaseline(content, state) ? "active" : "conflict";
    state.localPath = path;
    await this.options.saveState();
  }
  private remoteMetadataIsUnchanged(
    remote: RemoteDocument,
    state: DocumentState,
  ): boolean {
    if (
      state.mediaIncomplete ||
      (remote.revision === undefined && remote.modifiedAt === undefined)
    )
      return false;
    return (
      (remote.revision === undefined ||
        remote.revision === state.remoteRevision) &&
      (remote.modifiedAt === undefined ||
        remote.modifiedAt === state.remoteModifiedAt)
    );
  }
  private async resolveNewNotePath(remote: RemoteDocument): Promise<string> {
    const root = vaultPath(
      sanitizeRelativePath(remote.targetFolder) || "Feishu",
    );
    const relative = sanitizeRelativePath(
      remote.relativePath || remote.title,
    ).replace(/\.md$/i, "");
    const suffix = sanitizePathSegment(remote.token.slice(-8));
    for (let attempt = 0; attempt <= 100; attempt++) {
      const path = posix.join(
        root,
        `${relative}${attempt ? `--${suffix}${attempt > 1 ? `-${attempt}` : ""}` : ""}.md`,
      );
      if (!this.options.vault.exists(path)) return path;
      const existing = await this.options.vault.read(path);
      if (existing !== undefined && noteBelongsToToken(existing, remote.token))
        return path;
    }
    throw new Error("Unable to allocate a unique note path");
  }
}
