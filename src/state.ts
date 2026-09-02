import { promises as fs } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS, type PluginData } from "./types";
import { safeError, vaultPath } from "./safety";

function object(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function requireValue(ok: unknown): asserts ok {
  if (!ok)
    throw new Error(
      "Invalid sync state; synchronization is paused. / 同步状态损坏，已暂停写入。",
    );
}
export function migrateData(raw: unknown): PluginData {
  if (raw == null)
    return {
      schemaVersion: 1,
      settings: { ...DEFAULT_SETTINGS, sources: [] },
      documents: {},
      history: [],
    };
  requireValue(object(raw));
  requireValue(raw.schemaVersion === undefined || raw.schemaVersion === 1);
  requireValue(object(raw.settings) && object(raw.documents));
  const s = {
    ...DEFAULT_SETTINGS,
    ...Object.fromEntries(
      Object.keys(DEFAULT_SETTINGS)
        .filter((key) => Object.hasOwn(raw.settings as object, key))
        .map((key) => [key, (raw.settings as Record<string, unknown>)[key]]),
    ),
  };
  requireValue(typeof s.cliPath === "string" && !!s.cliPath.trim());
  requireValue(typeof s.profileName === "string" && !!s.profileName.trim());
  requireValue(s.brand === "feishu" || s.brand === "lark");
  requireValue(
    typeof s.appId === "string" && typeof s.syncOnStartup === "boolean",
  );
  requireValue(
    typeof s.scheduleMinutes === "number" &&
      [0, 15, 30, 60].includes(s.scheduleMinutes),
  );
  requireValue(s.mediaMode === "local" || s.mediaMode === "remote");
  requireValue(
    Number.isInteger(s.maxMediaMB) &&
      Number(s.maxMediaMB) >= 1 &&
      Number(s.maxMediaMB) <= 100,
  );
  requireValue(
    Array.isArray(s.extraMediaHosts) &&
      s.extraMediaHosts.every(
        (h) =>
          typeof h === "string" &&
          /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(h),
      ),
  );
  requireValue(Array.isArray(s.sources));
  const ids = new Set<string>();
  for (const source of s.sources) {
    requireValue(object(source));
    for (const key of [
      "id",
      "name",
      "remoteId",
      "rootNodeToken",
      "targetFolder",
    ])
      requireValue(typeof source[key] === "string");
    requireValue(
      !ids.has(source.id) && !!source.id && typeof source.enabled === "boolean",
    );
    requireValue(["wiki", "drive-folder", "document"].includes(source.type));
    vaultPath(source.targetFolder || "Feishu");
    ids.add(source.id);
  }
  for (const [key, value] of Object.entries(raw.documents)) {
    requireValue(
      object(value) &&
        key === value.token &&
        !["__proto__", "constructor", "prototype"].includes(key),
    );
    requireValue(
      typeof value.sourceId === "string" && typeof value.localPath === "string",
    );
    vaultPath(value.localPath);
    requireValue(
      typeof value.managedContentHash === "string" &&
        /^[a-f0-9]{64}$/.test(value.managedContentHash),
    );
    requireValue(
      [
        "active",
        "conflict",
        "missing",
        "inaccessible",
        "missing-local",
        "paused",
      ].includes(String(value.status)),
    );
    requireValue(
      value.remoteRevision === undefined ||
        typeof value.remoteRevision === "string",
    );
    requireValue(
      value.remoteModifiedAt === undefined ||
        Number.isFinite(value.remoteModifiedAt),
    );
    requireValue(typeof value.lastSeenScanId === "string");
    requireValue(
      value.mediaIncomplete === undefined ||
        typeof value.mediaIncomplete === "boolean",
    );
    requireValue(
      value.remote === undefined ||
        (object(value.remote) &&
          value.remote.token === key &&
          typeof value.remote.sourceId === "string" &&
          typeof value.remote.title === "string"),
    );
    if (value.remote !== undefined) validateRemote(value.remote);
  }
  requireValue(raw.history === undefined || Array.isArray(raw.history));
  const history: unknown[] = (raw.history ?? []).slice(-10);
  for (const report of history) {
    requireValue(
      object(report) &&
        Array.isArray(report.errors) &&
        (report.results === undefined || Array.isArray(report.results)),
    );
    for (const key of [
      "sources",
      "discovered",
      "created",
      "updated",
      "unchanged",
      "conflicts",
      "inaccessible",
      "skippedUnsupported",
      "failedSources",
    ])
      requireValue(
        typeof report[key] === "number" && Number.isFinite(report[key]),
      );
    report.errors = report.errors.map(safeError);
    for (const item of report.results ?? []) {
      requireValue(
        object(item) &&
          typeof item.sourceId === "string" &&
          typeof item.title === "string" &&
          typeof item.action === "string",
      );
      requireValue(
        [
          "created",
          "updated",
          "unchanged",
          "conflict",
          "failed",
          "unsupported",
          "missing-local",
          "paused",
        ].includes(item.action),
      );
      if (item.localPath !== undefined) {
        requireValue(typeof item.localPath === "string");
        vaultPath(item.localPath);
      }
      if (item.remote !== undefined) validateRemote(item.remote);
      if (item.error) item.error = safeError(item.error);
    }
  }
  return {
    schemaVersion: 1,
    settings: s,
    documents: raw.documents,
    history,
    lastSuccessAt:
      typeof raw.lastSuccessAt === "string" ? raw.lastSuccessAt : undefined,
  } as PluginData;
}

function validateRemote(value: unknown): void {
  requireValue(object(value));
  for (const key of [
    "token",
    "sourceId",
    "title",
    "sourceName",
    "objectType",
    "targetFolder",
    "relativePath",
  ])
    requireValue(typeof value[key] === "string");
  requireValue(
    !["__proto__", "prototype", "constructor"].includes(String(value.token)),
  );
  vaultPath(String(value.targetFolder) || "Feishu");
}

function parseState(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "Invalid state JSON; restore a backup / 状态 JSON 损坏，请恢复备份",
    );
  }
}

export interface StateIO {
  read(name: string): Promise<string | undefined>;
  writeAtomic(name: string, content: string): Promise<void>;
}
export function fileStateIO(directory: string): StateIO {
  return {
    async read(name) {
      try {
        return await fs.readFile(join(directory, name), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          return undefined;
        throw error;
      }
    },
    async writeAtomic(name, text) {
      const target = join(directory, name);
      const temp = `${target}.${randomUUID()}.tmp`;
      const file = await fs.open(temp, "wx", 0o600);
      try {
        try {
          await file.writeFile(text, "utf8");
          await file.sync();
        } finally {
          await file.close();
        }
        await fs.rename(temp, target);
      } catch (error) {
        await fs.unlink(temp).catch(() => {});
        throw error;
      }
    },
  };
}

export class StateRepository {
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly io: StateIO) {}
  async load(): Promise<PluginData> {
    const text = await this.io.read("data.json");
    if (
      text === undefined &&
      (await this.io.read("data.backup.json")) !== undefined
    )
      throw new Error(
        "State missing; restore backup first. / 状态缺失，请先恢复备份。",
      );
    const raw = text === undefined ? null : parseState(text);
    const data = migrateData(raw);
    if (
      object(raw) &&
      raw.schemaVersion === undefined &&
      (await this.io.read("data.pre-v1.json")) === undefined
    )
      await this.io.writeAtomic("data.pre-v1.json", text!);
    return data;
  }
  save(data: PluginData): Promise<void> {
    const snapshot = JSON.stringify(
      migrateData(JSON.parse(JSON.stringify(data))),
      null,
      2,
    );
    const run = this.queue.then(async () => {
      const old = await this.io.read("data.json");
      if (old !== undefined) {
        migrateData(parseState(old)); // Never overwrite corrupt or future-version state.
        await this.io.writeAtomic("data.backup.json", old);
      }
      await this.io.writeAtomic("data.json", snapshot);
    });
    this.queue = run.catch(() => {});
    return run;
  }
  async restoreBackup(): Promise<PluginData> {
    await this.queue;
    const text =
      (await this.io.read("data.backup.json")) ??
      (await this.io.read("data.pre-v1.json"));
    if (!text) throw new Error("No backup available / 没有可恢复的备份");
    const data = migrateData(parseState(text));
    const current = await this.io.read("data.json");
    if (current)
      await this.io.writeAtomic(`data.recovered-${Date.now()}.json`, current);
    await this.io.writeAtomic("data.json", JSON.stringify(data, null, 2));
    return data;
  }
}
