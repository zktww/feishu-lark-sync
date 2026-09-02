import { describe, expect, it } from "vitest";
import { migrateData, StateRepository, type StateIO } from "../src/state";

class MemoryIO implements StateIO {
  files = new Map<string, string>();
  fail?: string;
  async read(name: string) {
    return this.files.get(name);
  }
  async writeAtomic(name: string, text: string) {
    if (this.fail === name) throw new Error("disk full");
    this.files.set(name, text);
  }
}
describe("state storage", () => {
  it("migrates legacy settings without changing the user's schedule or sources", async () => {
    const io = new MemoryIO();
    const legacy = {
      settings: {
        ...migrateData(null).settings,
        scheduleMinutes: 30,
        syncOnStartup: true,
      },
      documents: {},
    };
    const original = JSON.stringify(legacy);
    io.files.set("data.json", original);
    const data = await new StateRepository(io).load();
    expect(data.schemaVersion).toBe(1);
    expect(data.settings.scheduleMinutes).toBe(30);
    expect(data.settings.syncOnStartup).toBe(true);
    expect(io.files.get("data.pre-v1.json")).toBe(original);
    expect(io.files.get("data.json")).toBe(original);
  });
  it.each([
    "bad JSON secret example",
    JSON.stringify({ schemaVersion: 999, settings: {}, documents: {} }),
    JSON.stringify({ settings: {}, documents: { bad: {} } }),
  ])("fails closed for invalid state", async (text) => {
    const io = new MemoryIO();
    io.files.set("data.json", text);
    await expect(new StateRepository(io).load()).rejects.toThrow();
    expect(io.files.size).toBe(1);
    expect(io.files.get("data.json")).toBe(text);
  });
  it("backs up the previous state and preserves corrupt state on explicit recovery", async () => {
    const io = new MemoryIO();
    const repository = new StateRepository(io);
    const data = migrateData(null);
    await repository.save(data);
    const original = io.files.get("data.json");
    data.settings.scheduleMinutes = 15;
    await repository.save(data);
    expect(io.files.get("data.backup.json")).toBe(original);
    io.files.set("data.json", "damaged");
    const recovered = await repository.restoreBackup();
    expect(recovered.settings.scheduleMinutes).toBe(0);
    expect(
      [...io.files].some(
        ([name, text]) =>
          name.startsWith("data.recovered-") && text === "damaged",
      ),
    ).toBe(true);
  });
  it("refuses to overwrite corrupt state and keeps the last good file on write failure", async () => {
    const io = new MemoryIO();
    const repo = new StateRepository(io);
    await repo.save(migrateData(null));
    const original = io.files.get("data.json");
    io.fail = "data.json";
    await expect(repo.save(migrateData(null))).rejects.toThrow("disk full");
    expect(io.files.get("data.json")).toBe(original);
    io.fail = undefined;
    io.files.set("data.json", "corrupt");
    await expect(repo.save(migrateData(null))).rejects.toThrow("JSON");
    expect(io.files.get("data.json")).toBe("corrupt");
  });
  it("serializes writes using snapshots, without retaining mutable references", async () => {
    const io = new MemoryIO();
    const repo = new StateRepository(io);
    const data = migrateData(null);
    const first = repo.save(data);
    data.settings.scheduleMinutes = 30;
    const second = repo.save(data);
    data.settings.scheduleMinutes = 60;
    await Promise.all([first, second]);
    expect(
      JSON.parse(io.files.get("data.json")!).settings.scheduleMinutes,
    ).toBe(30);
    expect(
      JSON.parse(io.files.get("data.backup.json")!).settings.scheduleMinutes,
    ).toBe(0);
  });
  it("rejects unsafe paths and keeps only 10 redacted history entries", () => {
    const data = migrateData(null);
    data.settings.sources.push({
      id: "s",
      name: "S",
      type: "document",
      enabled: true,
      remoteId: "r",
      rootNodeToken: "",
      targetFolder: "../escape",
    });
    expect(() => migrateData(data)).toThrow("path");
    data.settings.sources = [];
    data.history = Array.from({ length: 20 }, () => ({
      sources: 0,
      discovered: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      conflicts: 0,
      inaccessible: 0,
      skippedUnsupported: 0,
      failedSources: 0,
      errors: ["access_token=secret-value https://foo.test/private?key=secret"],
    }));
    const restored = migrateData(data);
    expect(restored.history).toHaveLength(10);
    expect(restored.history[0].errors[0]).not.toContain("secret");
  });
});
